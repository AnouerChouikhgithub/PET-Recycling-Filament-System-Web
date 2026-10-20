/**
 * Chat state machine for the AI assistant (non-streaming contract).
 *
 * Rules taken from the verified backend behaviour:
 *  - the ONLY payload is the new message (+ conversationId when continuing),
 *    so the transcript here is display state and can never be re-sent;
 *  - one in-flight turn at a time: a second submit while pending is dropped
 *    (POSTs are never auto-retried — a blind retry would append the question
 *    to the server-side conversation twice and bill the user again);
 *  - a failed turn keeps the user's message on screen and shows a notice: it
 *    is never presented as a completed assistant answer;
 *  - Retry is an explicit user action and re-runs the SAME message against
 *    the conversation id used by that attempt.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { agentApi, isRetryableKind, type AgentErrorKind } from '../api/agent'
import { nextMessageId, validateMessage, type ChatMessage } from './agentChat'

export interface AgentNotice {
  kind: AgentErrorKind
  message: string
  /** An explicit user retry may succeed (transient provider/network). */
  retryable: boolean
}

interface LastAttempt {
  text: string
  conversationId: string | null
}

export interface AgentChat {
  messages: ChatMessage[]
  conversationId: string | null
  sending: boolean
  notice: AgentNotice | null
  /** 404 AGENT_DISABLED — the whole assistant surface is switched off. */
  disabled: boolean
  /** Seconds left before the per-user rate limit window reopens (null = none). */
  rateLimitRemainingSeconds: number | null
  /** True while a rate limit is active (composer disabled). */
  rateLimited: boolean
  canRetry: boolean
  send: (text: string) => Promise<boolean>
  retry: () => Promise<boolean>
  startNewConversation: () => void
  deleteConversation: () => Promise<boolean>
  deleteAllConversations: () => Promise<boolean>
  dismissNotice: () => void
}

export function useAgentChat(): AgentChat {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<AgentNotice | null>(null)
  const [disabled, setDisabled] = useState(false)
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const inFlight = useRef<AbortController | null>(null)
  const lastAttempt = useRef<LastAttempt | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // Unmount hygiene: stop the HTTP request. The backend may still finish
      // the turn server-side (accounting was reserved up front) — the answer
      // is simply not shown, because the transcript is page state.
      inFlight.current?.abort()
    }
  }, [])

  /* Countdown ticker while a rate limit is active. */
  useEffect(() => {
    if (rateLimitedUntil === null) return
    const tick = () => {
      const time = Date.now()
      setNow(time)
      if (time >= rateLimitedUntil) setRateLimitedUntil(null)
    }
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [rateLimitedUntil])

  const rateLimitRemainingSeconds = useMemo(() => {
    if (rateLimitedUntil === null) return null
    return Math.max(0, Math.ceil((rateLimitedUntil - now) / 1000))
  }, [rateLimitedUntil, now])

  /**
   * Runs one turn. `appendUserMessage` is false for a retry so the transcript
   * never shows the same question twice for one logical turn.
   */
  const runTurn = useCallback(
    async (text: string, conversationIdForTurn: string | null, appendUserMessage: boolean): Promise<boolean> => {
      if (inFlight.current) return false

      if (appendUserMessage) {
        setMessages((current) => [
          ...current,
          { id: nextMessageId('user'), role: 'user', content: text, toolCalls: [], createdAt: new Date().toISOString() },
        ])
      }

      setNotice(null)
      setSending(true)
      lastAttempt.current = { text, conversationId: conversationIdForTurn }

      const controller = new AbortController()
      inFlight.current = controller

      try {
        const response = await agentApi.chat(text, conversationIdForTurn, controller.signal)
        if (!mounted.current) return false

        setConversationId(response.conversationId)
        setMessages((current) => [
          ...current,
          {
            // Transcript rows are keyed LOCALLY: the server id is metadata,
            // and a repeating/empty id must never collide in React's key
            // space (two turns of one conversation are distinct rows).
            id: nextMessageId('assistant'),
            role: 'assistant',
            content: response.message.content,
            toolCalls: response.message.toolCalls,
            createdAt: response.message.createdAt,
          },
        ])
        lastAttempt.current = null
        return true
      } catch (error) {
        if (!mounted.current) return false
        const agentError = error as { kind?: AgentErrorKind; message?: string; retryAfterSeconds?: number | null }
        const kind = agentError.kind ?? 'unknown'

        if (kind === 'aborted') return false

        if (kind === 'rate_limited') {
          const seconds = agentError.retryAfterSeconds ?? 60
          setRateLimitedUntil(Date.now() + seconds * 1000)
          setNow(Date.now())
        }

        if (kind === 'disabled') setDisabled(true)

        // A conversation that no longer exists (soft-deleted/foreign) can only
        // be replaced by a NEW conversation on the next attempt.
        if (kind === 'conversation_missing') setConversationId(null)

        setNotice({
          kind,
          message: agentError.message ?? 'Something went wrong. Please try again.',
          // Single source of truth lives next to the error mapping (F10).
          retryable: isRetryableKind(kind),
        })
        return false
      } finally {
        if (inFlight.current === controller) inFlight.current = null
        if (mounted.current) setSending(false)
      }
    },
    [],
  )

  const send = useCallback(
    async (rawText: string): Promise<boolean> => {
      const text = rawText.trim()
      const validationError = validateMessage(text)
      if (validationError) {
        setNotice({ kind: 'validation', message: validationError, retryable: false })
        return false
      }
      if (rateLimitedUntil !== null && Date.now() < rateLimitedUntil) {
        setNotice({ kind: 'rate_limited', message: 'Too many messages. Please wait a moment.', retryable: false })
        return false
      }
      if (inFlight.current) return false

      return runTurn(text, conversationId, true)
    },
    [conversationId, rateLimitedUntil, runTurn],
  )

  const retry = useCallback(async (): Promise<boolean> => {
    const attempt = lastAttempt.current
    if (!attempt || inFlight.current) return false
    return runTurn(attempt.text, attempt.conversationId, false)
  }, [runTurn])

  const startNewConversation = useCallback(() => {
    // Local only: the id is dropped so the next message creates a fresh
    // server-side conversation. Existing ones are removed explicitly
    // (deleteConversation / deleteAllConversations) — there is no list API.
    setMessages([])
    setConversationId(null)
    setNotice(null)
    lastAttempt.current = null
  }, [])

  const deleteConversation = useCallback(async (): Promise<boolean> => {
    const id = conversationId
    if (id === null) {
      startNewConversation()
      return true
    }
    try {
      await agentApi.deleteConversation(id)
      if (mounted.current) startNewConversation()
      return true
    } catch (error) {
      if (!mounted.current) return false
      const agentError = error as { kind?: AgentErrorKind; message?: string }
      setNotice({
        kind: agentError.kind ?? 'unknown',
        message: agentError.message ?? 'The conversation could not be deleted.',
        retryable: false,
      })
      return false
    }
  }, [conversationId, startNewConversation])

  const deleteAllConversations = useCallback(async (): Promise<boolean> => {
    try {
      await agentApi.deleteAllConversations()
      if (mounted.current) startNewConversation()
      return true
    } catch (error) {
      if (!mounted.current) return false
      const agentError = error as { kind?: AgentErrorKind; message?: string }
      setNotice({
        kind: agentError.kind ?? 'unknown',
        message: agentError.message ?? 'The conversations could not be deleted.',
        retryable: false,
      })
      return false
    }
  }, [startNewConversation])

  const dismissNotice = useCallback(() => setNotice(null), [])

  return {
    messages,
    conversationId,
    sending,
    notice,
    disabled,
    rateLimitRemainingSeconds,
    rateLimited: rateLimitRemainingSeconds !== null,
    // Derived from STATE only: reading lastAttempt.current during render is not
    // reactive (it is correct today only because setNotice re-renders at the
    // same time). notice.retryable is the same fact, and retry() already
    // refuses when there is no attempt to replay (BUGS-TO-FIX F11).
    canRetry: notice !== null && notice.retryable,
    send,
    retry,
    startNewConversation,
    deleteConversation,
    deleteAllConversations,
    dismissNotice,
  }
}
