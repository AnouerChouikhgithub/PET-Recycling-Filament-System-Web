import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_MESSAGE_MAX_CHARS,
  agentApi,
  isAgentDisabled,
  parseRetryAfter,
  parseToolCalls,
  parseUsage,
  toAgentError,
} from '../api/agent'
import { AgentRequestError } from '../api/agent'
import { ApiError, getBaseUrl, getToken, setToken, setUnauthorizedHandler } from '../api/client'

/** Minimal Response stand-in: only what api/client.ts actually reads. */
function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response
}

/** The backend envelope builders (App\Api\ApiResponse). */
const success = (data: unknown, meta: Record<string, unknown> = {}) => ({
  success: true,
  data,
  ...(Object.keys(meta).length > 0 ? { meta } : {}),
})
const failure = (code: string, message: string, details?: Record<string, string[]>) => ({
  success: false,
  error: { code, message, ...(details ? { details } : {}) },
})

const chatPayload = {
  conversationId: '01a146d8-977e-75d4-9d0d-1dca66a29096',
  message: {
    id: '01a146d8-97d6-7000-8000-000000000000',
    role: 'assistant',
    content: 'Your heater reached the target 12 s ago.',
    toolCalls: [{ name: 'get_latest_telemetry', summary: 'get_latest_telemetry: 12 row(s)' }],
    createdAt: '2026-10-16T22:41:00+00:00',
  },
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  setToken('test-token')
})

afterEach(() => {
  vi.unstubAllGlobals()
  setToken(null)
  setUnauthorizedHandler(null)
})

function urlOfCall(index = 0): string {
  return String(fetchMock.mock.calls[index]?.[0])
}
function initOfCall(index = 0): RequestInit {
  return (fetchMock.mock.calls[index]?.[1] ?? {}) as RequestInit
}
function headersOfCall(index = 0): Record<string, string> {
  return (initOfCall(index).headers ?? {}) as Record<string, string>
}

describe('agentApi.chat — request contract', () => {
  it('POSTs the documented body to /agent/chat with the JWT and JSON content type', async () => {
    fetchMock.mockResolvedValue(response(success(chatPayload, { usage: { input: 512, output: 96 } })))

    await agentApi.chat('what is the latest telemetry?', null)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urlOfCall()).toBe(`${getBaseUrl()}/agent/chat`)
    expect(initOfCall().method).toBe('POST')
    expect(headersOfCall().Authorization).toBe('Bearer test-token')
    expect(headersOfCall()['Content-Type']).toBe('application/json')
    expect(headersOfCall().Accept).toBe('application/json')
    // A first turn carries NO conversationId (the backend creates one).
    expect(JSON.parse(String(initOfCall().body))).toEqual({ message: 'what is the latest telemetry?' })
  })

  it('continues a conversation by sending the id returned earlier', async () => {
    fetchMock.mockResolvedValue(response(success(chatPayload)))

    await agentApi.chat('and the fan?', '01a146d8-977e-75d4-9d0d-1dca66a29096')

    expect(JSON.parse(String(initOfCall().body))).toEqual({
      conversationId: '01a146d8-977e-75d4-9d0d-1dca66a29096',
      message: 'and the fan?',
    })
  })

  it('never puts the token or the message in the URL', async () => {
    fetchMock.mockResolvedValue(response(success(chatPayload)))

    await agentApi.chat('secret-ish question', null)

    const url = urlOfCall()
    expect(url).not.toContain('?')
    expect(url).not.toContain('test-token')
    expect(url).not.toContain('secret-ish')
  })

  it('parses a successful response: content, tool calls and meta usage', async () => {
    fetchMock.mockResolvedValue(response(success(chatPayload, { usage: { input: 512, output: 96 } })))

    const result = await agentApi.chat('hi', null)

    expect(result.conversationId).toBe(chatPayload.conversationId)
    expect(result.message.content).toBe('Your heater reached the target 12 s ago.')
    expect(result.message.toolCalls).toEqual([
      { name: 'get_latest_telemetry', summary: 'get_latest_telemetry: 12 row(s)' },
    ])
    expect(result.usage).toEqual({ input: 512, output: 96 })
  })

  it('exposes the message limit the backend enforces (AGENT_MSG_MAX_CHARS default)', () => {
    expect(AGENT_MESSAGE_MAX_CHARS).toBe(4000)
  })
})

describe('agentApi.chat — malformed response normalization', () => {
  it('rejects a payload without assistant content instead of rendering an empty answer', async () => {
    fetchMock.mockResolvedValue(response(success({ conversationId: 'c1', message: { id: 'm1', role: 'assistant' } })))

    const error = await agentApi.chat('hi', null).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(AgentRequestError)
    expect((error as AgentRequestError).kind).toBe('malformed')
  })

  it('rejects a payload without a conversation id', async () => {
    fetchMock.mockResolvedValue(response(success({ message: { content: 'hello' } })))

    const error = await agentApi.chat('hi', null).catch((e: unknown) => e)

    expect((error as AgentRequestError).kind).toBe('malformed')
  })

  it('normalizes untrusted toolCalls and usage', () => {
    expect(parseToolCalls('not-an-array')).toEqual([])
    expect(parseToolCalls([{ name: 'x' }, 'nope', { summary: 'y' }, { name: 'ok', summary: 's' }])).toEqual([
      { name: 'ok', summary: 's' },
    ])
    expect(parseToolCalls(Array.from({ length: 50 }, (_, i) => ({ name: `t${i}`, summary: 's' })))).toHaveLength(20)
    expect(parseUsage({})).toBeNull()
    expect(parseUsage({ usage: { input: '512', output: 'nope' } })).toBeNull()
    expect(parseUsage({ usage: { input: 10.7, output: -4 } })).toEqual({ input: 10, output: 0 })
  })

  it('maps a non-JSON body to a malformed transport error', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => {
        throw new Error('not json')
      },
    } as unknown as Response)

    const error = await agentApi.chat('hi', null).catch((e: unknown) => e)

    expect((error as AgentRequestError).kind).toBe('malformed')
  })
})

describe('agentApi.chat — error mapping (verified backend codes)', () => {
  it('maps 401 to an expired-session error and clears the stored token', async () => {
    fetchMock.mockResolvedValue(response(failure('UNAUTHORIZED', 'Authentication required.'), 401))

    const error = (await agentApi.chat('hi', null).catch((e: unknown) => e)) as AgentRequestError

    expect(error.kind).toBe('auth')
    expect(getToken()).toBeNull()
  })

  it('maps the disabled surface: 404 rendered with the generic NOT_FOUND code', async () => {
    // AgentController throws NotFoundHttpException('AGENT_DISABLED') and
    // ApiExceptionSubscriber renders 404 with code NOT_FOUND + message.
    fetchMock.mockResolvedValue(response(failure('NOT_FOUND', 'AGENT_DISABLED'), 404))

    const error = (await agentApi.chat('hi', null).catch((e: unknown) => e)) as AgentRequestError

    expect(error.kind).toBe('disabled')
    expect(isAgentDisabled(error)).toBe(true)
  })

  it('does not map unrelated 404s to the disabled surface', async () => {
    fetchMock.mockResolvedValue(response(failure('NOT_FOUND', 'Resource not found.'), 404))

    const error = (await agentApi.chat('hi', null).catch((e: unknown) => e)) as AgentRequestError

    expect(error.kind).toBe('unknown')
    expect(isAgentDisabled(error)).toBe(false)
  })

  it('maps 404 + AGENT_NOT_FOUND to a missing conversation (not to a disabled surface)', async () => {
    fetchMock.mockResolvedValue(response(failure('AGENT_NOT_FOUND', 'Conversation not found.'), 404))

    const error = (await agentApi.chat('hi', 'gone').catch((e: unknown) => e)) as AgentRequestError

    expect(error.kind).toBe('conversation_missing')
    expect(isAgentDisabled(error)).toBe(false)
  })

  it('maps 422 validation to a validation error', async () => {
    fetchMock.mockResolvedValue(
      response(failure('VALIDATION_FAILED', 'The message must be between 1 and 4000 characters.', { message: ['Length'] }), 422),
    )

    const error = (await agentApi.chat('', null).catch((e: unknown) => e)) as AgentRequestError

    expect(error.kind).toBe('validation')
  })

  it('maps 429 AGENT_RATE_LIMITED and reads Retry-After', async () => {
    fetchMock.mockResolvedValue(
      response(failure('AGENT_RATE_LIMITED', 'Too many agent messages. Try again later.'), 429, { 'Retry-After': '42' }),
    )

    const error = (await agentApi.chat('hi', null).catch((e: unknown) => e)) as AgentRequestError

    expect(error.kind).toBe('rate_limited')
    expect(error.retryAfterSeconds).toBe(42)
  })

  it('maps 429 AGENT_DAILY_TOKEN_CAP to the daily cap state', async () => {
    fetchMock.mockResolvedValue(
      response(failure('AGENT_DAILY_TOKEN_CAP', 'Daily AI usage limit reached. Resets at 00:00 UTC.'), 429, {
        'Retry-After': '60',
      }),
    )

    const error = (await agentApi.chat('hi', null).catch((e: unknown) => e)) as AgentRequestError

    expect(error.kind).toBe('daily_cap')
  })

  it('maps 503 AGENT_LLM_UNAVAILABLE to a retryable provider failure', async () => {
    fetchMock.mockResolvedValue(
      response(failure('AGENT_LLM_UNAVAILABLE', 'The assistant service is temporarily unavailable.'), 503, {
        'Retry-After': '5',
      }),
    )

    const error = (await agentApi.chat('hi', null).catch((e: unknown) => e)) as AgentRequestError

    expect(error.kind).toBe('provider')
    expect(error.retryable).toBe(true)
  })

  it('does not auto-retry a failed POST (one request per send)', async () => {
    fetchMock.mockResolvedValue(response(failure('AGENT_LLM_UNAVAILABLE', 'unavailable'), 503))

    await agentApi.chat('hi', null).catch(() => undefined)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps a transport rejection to a network error without leaking internals', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch http://internal-host/?key=sk-ant-should-not-leak'))

    const error = (await agentApi.chat('hi', null).catch((e: unknown) => e)) as AgentRequestError

    expect(error.kind).toBe('network')
    expect(error.status).toBe(0)
    expect(error.message).not.toContain('sk-ant')
    expect(error.message).not.toContain('internal-host')
  })

  it('keeps an abort distinguishable from a failure', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    fetchMock.mockRejectedValue(abort)

    const error = (await agentApi.chat('hi', null).catch((e: unknown) => e)) as AgentRequestError

    expect(error.kind).toBe('aborted')
    expect(error.retryable).toBe(false)
  })

  it('never surfaces a raw server 500 body (debug INTERNAL_ERROR) to the user', async () => {
    fetchMock.mockResolvedValue(
      response(failure('INTERNAL_ERROR', '[dev] SQLSTATE[42P01]: relation "agent_conversation" does not exist'), 500),
    )

    const error = (await agentApi.chat('hi', null).catch((e: unknown) => e)) as AgentRequestError

    expect(error.kind).toBe('unknown')
    expect(error.message).toBe('Something went wrong. Please try again.')
    expect(error.message).not.toContain('SQLSTATE')
  })

  it('maps unknown statuses without echoing the payload', () => {
    const error = toAgentError(new ApiError('TEAPOT_ISH', 'raw provider body: {"error":{"type":"x"}}', 418))
    expect(error.message).toBe('Something went wrong. Please try again.')
  })

  it('parses Retry-After only as delta-seconds', () => {
    expect(parseRetryAfter('42')).toBe(42)
    expect(parseRetryAfter('0')).toBe(0)
    expect(parseRetryAfter('1.5')).toBe(2)
    expect(parseRetryAfter('abc')).toBeNull()
    expect(parseRetryAfter('-5')).toBeNull()
    expect(parseRetryAfter(null)).toBeNull()
  })
})

describe('agentApi — conversation lifecycle', () => {
  it('deletes one conversation with DELETE /agent/conversations/{id}', async () => {
    fetchMock.mockResolvedValue(
      response(success({ deleted: true, conversationId: '01a146d8-977e-75d4-9d0d-1dca66a29096' })),
    )

    const result = await agentApi.deleteConversation('01a146d8-977e-75d4-9d0d-1dca66a29096')

    expect(result.deleted).toBe(true)
    expect(initOfCall().method).toBe('DELETE')
    expect(urlOfCall()).toBe(`${getBaseUrl()}/agent/conversations/01a146d8-977e-75d4-9d0d-1dca66a29096`)
    expect(initOfCall().body).toBeUndefined()
  })

  it('URL-encodes the conversation id', async () => {
    fetchMock.mockResolvedValue(response(success({ deleted: true, conversationId: 'x/y' })))

    await agentApi.deleteConversation('x/y')

    expect(urlOfCall()).toBe(`${getBaseUrl()}/agent/conversations/x%2Fy`)
  })

  it('deletes all conversations with DELETE /agent/conversations', async () => {
    fetchMock.mockResolvedValue(response(success({ deleted: true, count: 3 })))

    const result = await agentApi.deleteAllConversations()

    expect(result.count).toBe(3)
    expect(initOfCall().method).toBe('DELETE')
    expect(urlOfCall()).toBe(`${getBaseUrl()}/agent/conversations`)
  })

  it('surfaces an ownership 404 as a missing conversation on delete', async () => {
    fetchMock.mockResolvedValue(response(failure('AGENT_NOT_FOUND', 'Conversation not found.'), 404))

    const error = (await agentApi.deleteConversation('foreign-id').catch((e: unknown) => e)) as AgentRequestError

    expect(error.kind).toBe('conversation_missing')
  })
})
