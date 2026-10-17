import { useCallback, useEffect, useRef, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { SparklesIcon, TrashIcon } from '../components/icons'
import { MessageBubble } from '../components/agent/MessageBubble'
import { Composer } from '../components/agent/Composer'
import { SuggestedPrompts } from '../components/agent/SuggestedPrompts'
import {
  AgentNoticeBanner,
  AgentUnavailableState,
  MachineDataStrip,
  StaleDataNotice,
} from '../components/agent/AgentNotices'
import { useAgentChat } from '../lib/useAgentChat'
import { useMachine } from '../contexts/MachineContext'
import { useToast } from '../contexts/ToastContext'
import { AGENT_MESSAGE_MAX_CHARS } from '../api/agent'
import { validateMessage } from '../lib/agentChat'
import { describeTelemetryFreshness } from '../lib/telemetryFreshness'

/**
 * The assistant inside the authenticated shell.
 *
 * Integration point: route "agent" (src/lib/router.ts) reached from the
 * sidebar. It reuses the app shell, the API client, the machine context (for
 * the data-source strip only) and the toast/modal components. No second
 * polling loop starts here: the chat is request/response, while the
 * dashboards keep their existing 10 s refresh.
 */
export function AgentChatPage() {
  const chat = useAgentChat()
  const { view, machines } = useMachine()
  const toast = useToast()

  const [draft, setDraft] = useState('')
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const logRef = useRef<HTMLDivElement>(null)
  const composerEl = useRef<HTMLTextAreaElement | null>(null)
  const deleteAllTriggerRef = useRef<HTMLButtonElement>(null)
  const confirmDeleteAllRef = useRef<HTMLButtonElement>(null)
  const atBottomRef = useRef(true)
  const modalWasOpen = useRef(false)

  const draftError = draft.trim().length > 0 ? validateMessage(draft) : null

  /* Auto-scroll only when the reader is already at the bottom (never yanks
     someone away from older messages). */
  useEffect(() => {
    if (!atBottomRef.current) return
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.messages.length, chat.sending, chat.notice])

  /* Confirm dialog focus: in on open, back to the trigger only on close. */
  useEffect(() => {
    if (confirmDeleteAll) {
      modalWasOpen.current = true
      confirmDeleteAllRef.current?.focus()
      return
    }
    if (modalWasOpen.current) {
      modalWasOpen.current = false
      deleteAllTriggerRef.current?.focus()
    }
  }, [confirmDeleteAll])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      // Only clear the draft when the message is actually being sent —
      // a rejected (too long / empty) draft stays for editing.
      if (!validateMessage(trimmed) && !chat.sending && !chat.rateLimited) setDraft('')
      atBottomRef.current = true
      await chat.send(trimmed)
    },
    [chat],
  )

  const handleRetry = useCallback(async () => {
    atBottomRef.current = true
    await chat.retry()
  }, [chat])

  const handleDeleteConversation = useCallback(async () => {
    const ok = await chat.deleteConversation()
    if (ok) toast.push('success', 'Conversation deleted', 'The stored conversation was removed from your history.')
  }, [chat, toast])

  const handleDeleteAll = useCallback(async () => {
    setDeleting(true)
    const ok = await chat.deleteAllConversations()
    setDeleting(false)
    setConfirmDeleteAll(false)
    if (ok) toast.push('success', 'Conversations deleted', 'Every stored assistant conversation was removed.')
  }, [chat, toast])

  const telemetry = view?.telemetry ?? null
  const freshness = describeTelemetryFreshness(telemetry?.recordedAt ?? null)
  const machineLabel = view?.machine.identifier ?? machines[0]?.identifier ?? null
  const hasTranscript = chat.messages.length > 0 || chat.conversationId !== null

  return (
    <>
      <PageHeader
        eyebrow="3awedlou assistant"
        title="Ask about your machine."
        subtitle="A read-only assistant for your own 3awedlou machines: it reads your stored telemetry, events, fault codes and command history, then answers in plain language."
        actions={
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" onClick={chat.startNewConversation} disabled={chat.sending || !hasTranscript}>
              New conversation
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void handleDeleteConversation()} disabled={chat.sending || !hasTranscript}>
              <TrashIcon size={14} /> Delete conversation
            </Button>
          </div>
        }
      />

      {chat.disabled ? (
        <AgentUnavailableState />
      ) : (
        <div className="agent-layout">
          <Card className="agent-card">
            <div className="card-header card-header-offset">
              <div className="row" style={{ gap: 12 }}>
                <span className="agent-avatar" aria-hidden="true">
                  <SparklesIcon size={18} />
                </span>
                <div>
                  <div className="card-title">3awedlou assistant</div>
                  <div className="card-subtitle">Read-only · answers quote the data your machine actually reported</div>
                </div>
              </div>
              <button
                type="button"
                ref={deleteAllTriggerRef}
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmDeleteAll(true)}
                disabled={chat.sending}
              >
                <TrashIcon size={14} /> Delete all history
              </button>
            </div>

            <MachineDataStrip
              identifier={machineLabel}
              recordedAt={telemetry?.recordedAt ?? null}
              temperature={telemetry?.temperature ?? null}
            />

            <StaleDataNotice label={freshness.label} ageSeconds={freshness.ageSeconds} />

            <div
              className="agent-log"
              ref={logRef}
              role="log"
              aria-live="polite"
              aria-relevant="additions text"
              aria-label="Assistant conversation"
              tabIndex={0}
              onScroll={() => {
                const el = logRef.current
                if (!el) return
                atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
              }}
            >
              {chat.messages.length === 0 && !chat.sending ? (
                <div className="agent-intro">
                  <span className="agent-intro-icon" aria-hidden="true">
                    <SparklesIcon size={22} />
                  </span>
                  <h2 className="agent-intro-title">What can I look up for you?</h2>
                  <p className="agent-intro-text">
                    Ask about your machines and I will read the records the backend already stores for you: the latest
                    telemetry with its age, recent events, fault-code meanings and the command audit log. I never change
                    machine settings, and I say “Not reported” instead of guessing a value.
                  </p>
                </div>
              ) : (
                chat.messages.map((message) => <MessageBubble key={message.id} message={message} />)
              )}

              {chat.sending && (
                <div className="agent-typing" role="status">
                  <span className="agent-typing-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  Checking your machine data…
                </div>
              )}
            </div>

            {chat.messages.length === 0 && (
              <SuggestedPrompts
                onPick={(prompt) => {
                  composerEl.current?.focus()
                  void send(prompt)
                }}
                disabled={chat.sending || chat.rateLimited}
              />
            )}

            {/* Client-side validation is reported inline by the composer; the
                banner is reserved for transport/backend failures. */}
            {chat.notice && !(chat.notice.kind === 'validation' && draftError !== null) && (
              <AgentNoticeBanner
                notice={chat.notice}
                rateLimitRemainingSeconds={chat.rateLimitRemainingSeconds}
                retrying={chat.sending}
                onRetry={() => void handleRetry()}
                onDismiss={chat.dismissNotice}
              />
            )}

            <Composer
              value={draft}
              onChange={setDraft}
              onSend={() => void send(draft)}
              sending={chat.sending}
              disabled={chat.rateLimited}
              validationError={draftError}
              maxChars={AGENT_MESSAGE_MAX_CHARS}
              textareaRef={(element) => {
                composerEl.current = element
              }}
            />
          </Card>

          <aside className="agent-side">
            <Card>
              <div className="card-header card-header-offset">
                <div className="card-title">How this assistant works</div>
              </div>
              <div className="card-body stack" style={{ gap: 12 }}>
                <p className="agent-side-text">
                  Every answer is produced from a fixed set of <strong>read-only lookups</strong> on data that is already
                  stored for you. There is no tool that can send a command, change a temperature or turn anything on.
                </p>
                <p className="agent-side-text">
                  Answers can be <strong>out of date</strong>: telemetry is only as fresh as your machine’s newest report
                  ({freshness.ageSeconds === null ? 'no sample reported yet' : `currently ${freshness.label.replace('_', ' ')}`}
                  ).
                </p>
                <p className="agent-side-text">
                  Messages are private and stored against your account. Deleting a conversation removes it from your
                  history, and the assistant never shows another account’s machines.
                </p>
                <p className="agent-side-text">
                  Machine controls live on the <strong>Machine</strong> page and stay under the backend’s safety guard —
                  the assistant cannot reach them.
                </p>
              </div>
            </Card>
          </aside>
        </div>
      )}

      <Modal
        open={confirmDeleteAll}
        onClose={() => setConfirmDeleteAll(false)}
        title="Delete all assistant conversations?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteAll(false)}>
              Cancel
            </Button>
            <button
              type="button"
              ref={confirmDeleteAllRef}
              className="btn btn-danger btn-sm"
              onClick={() => void handleDeleteAll()}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete all'}
            </button>
          </>
        }
      >
        <p className="agent-side-text">
          This removes every stored assistant conversation for your account, including the current one. It cannot be
          undone. Your machine data, sessions and dashboards are not affected.
        </p>
      </Modal>
    </>
  )
}
