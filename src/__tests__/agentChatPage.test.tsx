import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AgentChatPage } from '../pages/AgentChatPage'
import { ToastProvider } from '../contexts/ToastContext'
import { resetMessageIdSequence } from '../lib/agentChat'
import { getBaseUrl, getToken, setToken } from '../api/client'

/* The page only needs the machine context for its data-source strip: it is
   mocked so these tests exercise the chat itself (no dashboard polling). */
const machineState = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}))
vi.mock('../contexts/MachineContext', () => ({ useMachine: () => machineState.current }))

const NOW = Date.parse('2026-10-17T12:00:00Z')

function useMachineFixture(options: { recordedAt?: string | null; temperature?: number | null; identifier?: string } = {}) {
  const { recordedAt = new Date(NOW - 5_000).toISOString(), temperature = 212.4, identifier = 'AWL-001' } = options
  machineState.current = {
    view: {
      machine: { id: 'machine-1', identifier, name: 'Line 1', status: 'idle' },
      telemetry: recordedAt === null ? null : { recordedAt, temperature },
    },
    machines: [{ id: 'machine-1', identifier }],
  }
}

type Reply = { status?: number; body?: unknown; headers?: Record<string, string>; reject?: Error; pending?: boolean }

function reply({ status = 200, body, headers = {}, reject, pending = false }: Reply) {
  if (pending) return new Promise<Response>(() => {})
  if (reject) return Promise.reject(reject)
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response)
}

function chatSuccess(content = 'Your extruder is at 212.4 °C, reported 5 s ago.', toolCalls: unknown[] = []) {
  return {
    status: 200,
    body: {
      success: true,
      data: {
        conversationId: 'conv-1',
        message: {
          id: 'assistant-1',
          role: 'assistant',
          content,
          toolCalls,
          createdAt: '2026-10-17T12:00:00+00:00',
        },
      },
      meta: { usage: { input: 512, output: 96 } },
    },
  }
}

function apiError(code: string, message: string, status: number, headers: Record<string, string> = {}) {
  return { status, headers, body: { success: false, error: { code, message } } }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  machineState.current = {}
  useMachineFixture()
  resetMessageIdSequence()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  setToken('test-token')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  setToken(null)
})

function renderPage() {
  return render(
    <ToastProvider>
      <AgentChatPage />
    </ToastProvider>,
  )
}

function composer(): HTMLTextAreaElement {
  return screen.getByLabelText(/ask the assistant/i) as HTMLTextAreaElement
}

function typeAndSend(text: string) {
  fireEvent.change(composer(), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: /send message/i }))
}

function sentBodies(): Record<string, unknown>[] {
  return fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)))
}

describe('assistant page — initial state', () => {
  it('explains the assistant, offers tool-backed prompts and labels the input', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: /ask about your machine/i })).not.toBeNull()
    expect(screen.getByText(/read-only assistant for your own 3awedlou machines/i)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Show my machines.' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'What is the latest telemetry for my machine?' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Explain fault code ERROR.' })).not.toBeNull()
    expect(screen.getByText(/it can never start, stop or change your machine/i)).not.toBeNull()
    expect(composer()).not.toBeNull()
    expect(screen.getByRole('button', { name: /send message/i })).toHaveProperty('disabled', true)
  })

  it('shows the machine data source with its reported sample age', () => {
    // Pin the clock to NOW: the fixture's "5 s ago" sample is only fresh
    // relative to NOW, not the real wall clock.
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    renderPage()

    const strip = screen.getByText('AWL-001').closest('.agent-datastrip') as HTMLElement
    expect(strip.textContent).toContain('212.4 °C')
    expect(strip.textContent).toContain('(fresh)')
    expect(strip.textContent).toContain('The assistant reads these backend records')
  })

  it('never invents a reading: an unreported channel keeps the backend wording', () => {
    useMachineFixture({ temperature: null })
    renderPage()

    const strip = screen.getByText('AWL-001').closest('.agent-datastrip') as HTMLElement
    expect(strip.textContent).toContain('Not reported')
    expect(strip.textContent).not.toContain('0.0 °C')
  })

  it('says so when the machine never reported', () => {
    useMachineFixture({ recordedAt: null })
    renderPage()

    const strip = screen.getByText('AWL-001').closest('.agent-datastrip') as HTMLElement
    expect(strip.textContent).toContain('never reported')
  })
})

describe('assistant page — sending a turn', () => {
  it('POSTs the documented payload, locks the composer and renders the answer', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(
        chatSuccess('Your extruder is at 212.4 °C, reported 5 s ago.', [
          { name: 'get_latest_telemetry', summary: 'get_latest_telemetry: 12 row(s)' },
        ]),
      ),
    )
    renderPage()

    typeAndSend('What is the latest telemetry for my machine?')

    expect(await screen.findByText('Your extruder is at 212.4 °C, reported 5 s ago.')).not.toBeNull()
    expect(sentBodies()).toEqual([{ message: 'What is the latest telemetry for my machine?' }])
    expect(screen.getByText('Read the latest telemetry')).not.toBeNull()
    expect(screen.getByText('get_latest_telemetry: 12 row(s)')).not.toBeNull()
    // Transcript shows the question once and the answer once.
    expect(screen.getAllByText('What is the latest telemetry for my machine?')).toHaveLength(1)
    expect(composer().value).toBe('')
  })

  it('continues the same conversation with the id the backend returned', async () => {
    fetchMock.mockResolvedValueOnce(reply(chatSuccess('First answer.'))).mockResolvedValueOnce(reply(chatSuccess('Second answer.')))
    renderPage()

    typeAndSend('first question')
    expect(await screen.findByText('First answer.')).not.toBeNull()
    typeAndSend('second question')
    expect(await screen.findByText('Second answer.')).not.toBeNull()

    expect(sentBodies()).toEqual([
      { message: 'first question' },
      { conversationId: 'conv-1', message: 'second question' },
    ])
  })

  it('drops a second submit while a turn is pending (no duplicate POST)', async () => {
    fetchMock.mockReturnValueOnce(reply({ pending: true }))
    renderPage()

    typeAndSend('question')
    fireEvent.change(composer(), { target: { value: 'another question' } })
    const send = screen.getByRole('button', { name: /send message/i })
    fireEvent.click(send)

    await waitFor(() => expect(send.getAttribute('aria-busy')).toBe('true'))
    expect(send).toHaveProperty('disabled', true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sentBodies()).toEqual([{ message: 'question' }])
    // The pending turn is announced to assistive tech.
    expect(screen.getByText(/checking your machine data/i)).not.toBeNull()
  })

  it('sends with Enter and keeps Shift+Enter as a newline', async () => {
    fetchMock.mockResolvedValue(reply(chatSuccess('Answered.')))
    renderPage()

    fireEvent.change(composer(), { target: { value: 'first line' } })
    fireEvent.keyDown(composer(), { key: 'Enter', shiftKey: true })
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.keyDown(composer(), { key: 'Enter' })
    expect(await screen.findByText('Answered.')).not.toBeNull()
    expect(sentBodies()).toEqual([{ message: 'first line' }])
  })

  it('sends a suggested prompt from the chip', async () => {
    fetchMock.mockResolvedValue(reply(chatSuccess('You own one machine.')))
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Show my machines.' }))

    expect(await screen.findByText('You own one machine.')).not.toBeNull()
    expect(sentBodies()).toEqual([{ message: 'Show my machines.' }])
    expect(document.activeElement).toBe(composer())
  })
})

describe('assistant page — failure handling', () => {
  it('keeps the question, says no answer was produced and offers an explicit retry', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(apiError('AGENT_LLM_UNAVAILABLE', 'The assistant service is temporarily unavailable.', 503, { 'Retry-After': '5' })),
    )
    renderPage()

    typeAndSend('what is the temperature?')

    const notice = await screen.findByRole('alert')
    expect(notice.textContent).toContain('No answer produced')
    expect(notice.textContent).toContain('could not generate a response')
    expect(screen.getByText('what is the temperature?')).not.toBeNull()
    expect(screen.queryByText(/212.4 °C, reported/)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockResolvedValueOnce(reply(chatSuccess('It is 212.4 °C.', [])))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('It is 212.4 °C.')).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Retry re-runs the same turn: the question is never duplicated.
    expect(screen.getAllByText('what is the temperature?')).toHaveLength(1)
    expect(sentBodies()).toEqual([{ message: 'what is the temperature?' }, { message: 'what is the temperature?' }])
  })

  it('retries a continuation against the same conversation id', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(chatSuccess('First answer.')))
      .mockResolvedValueOnce(reply(apiError('AGENT_LLM_UNAVAILABLE', 'unavailable', 503)))
      .mockResolvedValueOnce(reply(chatSuccess('Second answer.')))
    renderPage()

    typeAndSend('question one')
    expect(await screen.findByText('First answer.')).not.toBeNull()
    typeAndSend('question two')
    expect(await screen.findByRole('alert')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Second answer.')).not.toBeNull()

    expect(sentBodies()[2]).toEqual({ conversationId: 'conv-1', message: 'question two' })
  })

  it('shows a rate-limit countdown and disables the composer until it expires', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(apiError('AGENT_RATE_LIMITED', 'Too many agent messages. Try again later.', 429, { 'Retry-After': '30' })),
    )
    renderPage()

    typeAndSend('one more')

    const notice = await screen.findByText(/slow down a moment/i)
    expect(notice).not.toBeNull()
    expect(screen.getByText(/retry in \d+s/i)).not.toBeNull()
    await waitFor(() => expect(composer().disabled).toBe(true))
  })

  it('explains the daily cap', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(apiError('AGENT_DAILY_TOKEN_CAP', 'Daily AI usage limit reached. Resets at 00:00 UTC.', 429, { 'Retry-After': '60' })),
    )
    renderPage()

    typeAndSend('hello')

    const notice = (await screen.findByText('AI usage limit reached')).closest('.agent-notice')
    expect(notice?.textContent).toContain('Daily AI usage limit reached. It resets at 00:00 UTC.')
  })

  it('shows the unavailable state when the assistant is switched off (404)', async () => {
    fetchMock.mockResolvedValueOnce(reply(apiError('NOT_FOUND', 'AGENT_DISABLED', 404)))
    renderPage()

    typeAndSend('hello')

    expect(await screen.findByText(/assistant not available/i)).not.toBeNull()
    expect(screen.getByText(/switched off on this 3awedlou server/i)).not.toBeNull()
    // The chat surface is replaced, not left in a half-working state.
    expect(screen.queryByLabelText(/ask the assistant/i)).toBeNull()
  })

  it('handles an expired session without exposing content', async () => {
    fetchMock.mockResolvedValueOnce(reply(apiError('UNAUTHORIZED', 'Authentication required.', 401)))
    renderPage()

    typeAndSend('hello')

    expect(await screen.findByText(/session has expired/i)).not.toBeNull()
    expect(getToken()).toBeNull()
  })

  it('offers a retry on a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    renderPage()

    typeAndSend('hello')

    expect(await screen.findByText(/cannot reach the 3awedlou server/i)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Retry' })).not.toBeNull()
  })

  it('starts a new conversation when the backend says the old one is gone', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(chatSuccess('First answer.')))
      .mockResolvedValueOnce(reply(apiError('AGENT_NOT_FOUND', 'Conversation not found.', 404)))
      .mockResolvedValueOnce(reply(chatSuccess('Fresh answer.')))
    renderPage()

    typeAndSend('question one')
    expect(await screen.findByText('First answer.')).not.toBeNull()
    typeAndSend('question two')
    const notice = (await screen.findByText('Conversation no longer exists')).closest('.agent-notice')
    expect(notice?.textContent).toContain('next message will start a new conversation')

    fireEvent.change(composer(), { target: { value: 'question three' } })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))
    expect(await screen.findByText('Fresh answer.')).not.toBeNull()

    // The dead conversation is dropped: the next turn creates a new one.
    expect(sentBodies()[2]).toEqual({ message: 'question three' })
  })
})

describe('assistant page — client-side validation', () => {
  it('rejects an oversized draft without calling the API and keeps it for editing', async () => {
    renderPage()

    const long = 'a'.repeat(4001)
    fireEvent.change(composer(), { target: { value: long } })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    expect(await screen.findByText(/up to 4,000 characters/i)).not.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(composer().value).toBe(long)
    expect(screen.getByText('4,001/4,000')).not.toBeNull()
  })

  it('keeps a whitespace-only draft out of the transcript', async () => {
    renderPage()

    fireEvent.change(composer(), { target: { value: '   ' } })
    const send = screen.getByRole('button', { name: /send message/i })
    expect(send).toHaveProperty('disabled', true)
    fireEvent.click(send)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText(/what can I look up for you/i)).not.toBeNull()
  })
})

describe('assistant page — untrusted content', () => {
  it('renders model output as text, never as markup', async () => {
    const payload = '<img src=x onerror="window.__pwned=1"> and <script>window.__pwned=2</script>'
    fetchMock.mockResolvedValueOnce(reply(chatSuccess(payload)))
    renderPage()

    typeAndSend('hello')

    const bubble = await screen.findByText(payload)
    expect(bubble).not.toBeNull()
    expect(document.querySelector('.agent-log img')).toBeNull()
    expect(document.querySelector('.agent-log script')).toBeNull()
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('preserves the backend "Not reported" wording verbatim in an answer', async () => {
    fetchMock.mockResolvedValueOnce(reply(chatSuccess('Fan speed: Not reported. Energy: Not reported.')))
    renderPage()

    typeAndSend('fan?')

    expect(await screen.findByText(/Fan speed: Not reported\. Energy: Not reported\./)).not.toBeNull()
  })

  it('renders a user message containing markup as text too', async () => {
    fetchMock.mockResolvedValueOnce(reply(chatSuccess('ok')))
    renderPage()

    typeAndSend('<b>bold?</b>')

    expect(await screen.findByText('<b>bold?</b>')).not.toBeNull()
    expect(document.querySelector('.agent-log b')).toBeNull()
  })

  it('never sends a machine command for any chat interaction', async () => {
    fetchMock.mockResolvedValue(reply(chatSuccess('ok')))
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Show my machines.' }))
    await screen.findByText('ok')
    typeAndSend('stop the machine now')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain('/commands')
    }
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST')
  })
})

describe('assistant page — telemetry truthfulness', () => {
  it('warns when the newest sample is stale and louder when it is very stale', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    useMachineFixture({ recordedAt: new Date(NOW - 601_000).toISOString() })
    renderPage()

    const warning = screen.getByText(/telemetry for this machine is very stale/i)
    expect(warning).not.toBeNull()
    expect(screen.getByText(/treat machine state as unknown/i)).not.toBeNull()
  })

  it('labels a 3-minute-old sample as stale, not as current', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    useMachineFixture({ recordedAt: new Date(NOW - 180_000).toISOString() })
    renderPage()

    expect(screen.getByText(/telemetry for this machine is stale/i)).not.toBeNull()
    expect(screen.getByText(/values may not reflect the current state/i)).not.toBeNull()
  })

  it('shows no stale warning for a fresh sample', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    renderPage()

    expect(screen.queryByText(/telemetry for this machine is/i)).toBeNull()
  })
})

describe('assistant page — conversation lifecycle', () => {
  it('deletes the server-side conversation and clears the transcript', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(chatSuccess('First answer.')))
      .mockResolvedValueOnce(reply({ status: 200, body: { success: true, data: { deleted: true, conversationId: 'conv-1' } } }))
    renderPage()

    typeAndSend('question one')
    expect(await screen.findByText('First answer.')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /delete conversation/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(String(fetchMock.mock.calls[1][0])).toContain('/agent/conversations/conv-1')
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('DELETE')
    await waitFor(() => expect(screen.queryByText('First answer.')).toBeNull())
    expect(screen.getByText(/what can I look up for you/i)).not.toBeNull()
  })

  it('deletes all conversations after an explicit confirmation', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(chatSuccess('First answer.')))
      .mockResolvedValueOnce(reply({ status: 200, body: { success: true, data: { deleted: true, count: 2 } } }))
    renderPage()

    typeAndSend('question one')
    expect(await screen.findByText('First answer.')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /delete all history/i }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/cannot be undone/i)).not.toBeNull()
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: /delete all/i }))

    fireEvent.click(within(dialog).getByRole('button', { name: /delete all/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(String(fetchMock.mock.calls[1][0])).toBe(`${getBaseUrl()}/agent/conversations`)
    await waitFor(() => expect(screen.queryByText('First answer.')).toBeNull())
  })

  it('starts a new conversation locally without deleting anything server-side', async () => {
    fetchMock.mockResolvedValue(reply(chatSuccess('First answer.')))
    renderPage()

    typeAndSend('question one')
    expect(await screen.findByText('First answer.')).not.toBeNull()
    fetchMock.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }))

    expect(screen.queryByText('First answer.')).toBeNull()
    expect(screen.getByText(/what can I look up for you/i)).not.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('assistant page — accessibility', () => {
  it('exposes the transcript as a polite log and failures as alerts', async () => {
    fetchMock.mockResolvedValueOnce(reply(chatSuccess('Answer text.')))
    renderPage()

    const log = screen.getByRole('log', { name: /assistant conversation/i })
    expect(log.getAttribute('aria-live')).toBe('polite')

    typeAndSend('hello')
    await screen.findByText('Answer text.')
    const article = screen.getByRole('article', { name: /assistant answer/i })
    expect(article.textContent).toContain('Answer text.')
  })

  it('marks the composer invalid when the draft is rejected', async () => {
    renderPage()

    fireEvent.change(composer(), { target: { value: 'a'.repeat(4001) } })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    await screen.findByText(/up to 4,000 characters/i)
    expect(composer().getAttribute('aria-invalid')).toBe('true')
    expect(composer().getAttribute('aria-describedby')).toBe('agent-input-hint')
  })
})
