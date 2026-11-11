/**
 * AI assistant endpoints (web).
 *
 * Verified against the committed Symfony controller + the backend README (API contract)
 * (AgentController, session 2 backend):
 *
 *   POST   /api/agent/chat               { conversationId?, message } -> 200
 *   DELETE /api/agent/conversations/{id} -> 200 { deleted, conversationId }
 *   DELETE /api/agent/conversations      -> 200 { deleted, count }
 *
 * There is NO conversation-list/history endpoint: the server loads the last
 * AGENT_CONTEXT_MESSAGES messages itself, so the client sends ONLY the new
 * message (and must never re-send the transcript). The transcript below is
 * display state, not request payload.
 *
 * Wire-level notes taken from the backend code, not from the design doc:
 *  - when AGENT_ENABLED=false the controller throws NotFoundHttpException
 *    ('AGENT_DISABLED'), which ApiExceptionSubscriber renders with the
 *    GENERIC code `NOT_FOUND` and the message `AGENT_DISABLED` (errorCodeFor()
 *    maps 404 -> NOT_FOUND). The disabled state is therefore detected by
 *    status 404 + message, never by `error.code` alone.
 *  - a failed turn keeps its reservation reconciled server-side; nothing is
 *    auto-retried here (see useAgentChat) because a blind POST retry would
 *    append the question to the server-side conversation twice.
 */
import { ApiError, requestRaw } from './client'
import type {
  AgentChatResponse,
  AgentConversationDeleted,
  AgentConversationsDeleted,
  AgentToolCall,
  AgentUsage,
} from '../types/api'

/** Options the backend validation uses (AGENT_MSG_MAX_CHARS default). */
export const AGENT_MESSAGE_MAX_CHARS = 4000

/** Stable failure classes the UI switches on. */
export type AgentErrorKind =
  | 'auth'
  | 'disabled'
  | 'rate_limited'
  | 'daily_cap'
  | 'provider'
  | 'network'
  | 'validation'
  | 'conversation_missing'
  | 'malformed'
  | 'unknown'
  | 'aborted'

/** The failure kinds an explicit user retry may fix (transient, not our bug). */
const RETRYABLE_KINDS: ReadonlySet<AgentErrorKind> = new Set<AgentErrorKind>(['provider', 'network', 'unknown'])

/**
 * The SINGLE definition of "may the user retry this?". The UI must call this
 * (or read AgentRequestError.retryable, which delegates here) instead of
 * keeping its own list — two lists drift the moment one is edited
 * (BUGS-TO-FIX F10).
 */
export function isRetryableKind(kind: AgentErrorKind): boolean {
  return RETRYABLE_KINDS.has(kind)
}

/** Every failure the chat can surface, already mapped to a safe message. */
export class AgentRequestError extends Error {
  constructor(
    public readonly kind: AgentErrorKind,
    message: string,
    /** Seconds from the Retry-After header, when the backend sent one. */
    public readonly retryAfterSeconds: number | null = null,
    public readonly status = 0,
  ) {
    super(message)
    this.name = 'AgentRequestError'
  }

  /** Transient failures may be retried by an explicit user action. */
  get retryable(): boolean {
    return isRetryableKind(this.kind)
  }
}

/**
 * Maps a transport/API failure to a safe, user-facing error. Message content
 * never contains provider bodies, SQL, or credentials — only the fixed
 * strings below plus the backend's own envelope message where it is the
 * contract (AGENT_DISABLED).
 */
export function toAgentError(error: unknown): AgentRequestError {
  if (error instanceof AgentRequestError) return error

  if (error instanceof Error && error.name === 'AbortError') {
    return new AgentRequestError('aborted', 'Request cancelled.')
  }

  if (error instanceof ApiError) {
    // Retry-After is a delta-seconds header on the 429 paths.
    const retryAfterSeconds = parseRetryAfter(error.headers?.get('Retry-After'))
    switch (error.code) {
      case 'UNAUTHORIZED':
        return new AgentRequestError('auth', 'Your session has expired. Please sign in again.', null, error.status)
      case 'AGENT_RATE_LIMITED':
        return new AgentRequestError('rate_limited', 'Too many messages. Please wait a moment.', retryAfterSeconds, error.status)
      case 'AGENT_DAILY_TOKEN_CAP':
        return new AgentRequestError('daily_cap', 'Daily AI usage limit reached. It resets at 00:00 UTC.', retryAfterSeconds, error.status)
      case 'AGENT_LLM_UNAVAILABLE':
        return new AgentRequestError('provider', 'The assistant could not generate a response. Please try again.', retryAfterSeconds, error.status)
      case 'VALIDATION_FAILED':
        return new AgentRequestError('validation', error.message || 'That message cannot be sent.', null, error.status)
      case 'AGENT_NOT_FOUND':
        return new AgentRequestError('conversation_missing', 'This conversation no longer exists.', null, error.status)
      case 'NETWORK_ERROR':
        return new AgentRequestError('network', 'Cannot reach the 3awedlou server. Check your connection.', null, 0)
      case 'BAD_RESPONSE':
        return new AgentRequestError('malformed', 'The assistant sent an unexpected response.', null, error.status)
      default:
        break
    }

    // Only the backend's explicit AGENT_DISABLED response means that the
    // whole surface is off; an unrelated 404 must not hide a routing bug.
    if (error.status === 404 && error.message.includes('AGENT_DISABLED')) {
      return new AgentRequestError('disabled', 'The assistant is not available right now.', null, 404)
    }
    if (error.status === 401) {
      return new AgentRequestError('auth', 'Your session has expired. Please sign in again.', null, 401)
    }

    return new AgentRequestError('unknown', 'Something went wrong. Please try again.', null, error.status)
  }

  return new AgentRequestError('unknown', 'Something went wrong. Please try again.')
}

/** True only for the disabled surface (404 + AGENT_DISABLED message/code). */
export function isAgentDisabled(error: unknown): boolean {
  return error instanceof AgentRequestError && error.kind === 'disabled'
}

/** Parses Retry-After (delta-seconds only; dates are ignored). */
export function parseRetryAfter(raw: string | null | undefined): number | null {
  if (!raw) return null
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

/**
 * Normalizes one tool call. Untrusted: only string name/summary survive, the
 * list is capped, and an unknown name is kept verbatim (it is a constant,
 * never a payload) — never executed, never turned into UI markup.
 */
export function parseToolCalls(value: unknown): AgentToolCall[] {
  if (!Array.isArray(value)) return []
  const calls: AgentToolCall[] = []
  for (const entry of value.slice(0, 20)) {
    const record = asRecord(entry)
    if (!record) continue
    const name = typeof record.name === 'string' ? record.name : null
    const summary = typeof record.summary === 'string' ? record.summary : null
    if (name === null || summary === null) continue
    calls.push({ name, summary })
  }
  return calls
}

/** `meta.usage` (wire keys input/output) — null when absent or unusable. */
export function parseUsage(meta: Record<string, unknown>): AgentUsage | null {
  const usage = asRecord(meta.usage)
  if (!usage) return null
  const input = Number(usage.input)
  const output = Number(usage.output)
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null
  return { input: Math.max(0, Math.trunc(input)), output: Math.max(0, Math.trunc(output)) }
}

/**
 * Validates the untrusted 200 payload. A missing conversation id or message
 * body is a malformed response (never silently rendered as an empty answer).
 */
export function parseChatResponse(data: unknown, meta: Record<string, unknown>): AgentChatResponse {
  const payload = asRecord(data)
  const conversationId = payload?.conversationId
  const message = asRecord(payload?.message)
  const content = message?.content

  if (typeof conversationId !== 'string' || conversationId === '' || typeof content !== 'string') {
    throw new AgentRequestError('malformed', 'The assistant sent an unexpected response.', null, 200)
  }

  return {
    conversationId,
    message: {
      id: typeof message?.id === 'string' ? message.id : '',
      role: 'assistant',
      content,
      toolCalls: parseToolCalls(message?.toolCalls),
      createdAt: typeof message?.createdAt === 'string' ? message.createdAt : '',
    },
    usage: parseUsage(meta),
  }
}

export const agentApi = {
  /**
   * One turn. `conversationId` is omitted for a new conversation (the backend
   * creates one and returns its id). No retry, no streaming: the contract is
   * a single non-streaming JSON round trip.
   */
  async chat(message: string, conversationId: string | null = null, signal?: AbortSignal): Promise<AgentChatResponse> {
    const body: Record<string, unknown> = { message }
    if (conversationId) body.conversationId = conversationId

    try {
      const result = await requestRaw<unknown>('/agent/chat', { method: 'POST', body, signal })
      return parseChatResponse(result.data, result.meta)
    } catch (error) {
      if (error instanceof AgentRequestError) throw error
      throw toAgentError(error)
    }
  },

  async deleteConversation(id: string, signal?: AbortSignal): Promise<AgentConversationDeleted> {
    try {
      return await requestRaw<AgentConversationDeleted>(`/agent/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        signal,
      }).then((result) => result.data)
    } catch (error) {
      throw toAgentError(error)
    }
  },

  async deleteAllConversations(signal?: AbortSignal): Promise<AgentConversationsDeleted> {
    try {
      return await requestRaw<AgentConversationsDeleted>('/agent/conversations', { method: 'DELETE', signal }).then(
        (result) => result.data,
      )
    } catch (error) {
      throw toAgentError(error)
    }
  },
}
