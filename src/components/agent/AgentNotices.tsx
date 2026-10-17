import { AlertOctagonIcon, InfoIcon, WifiIcon, WarningIcon } from '../icons'
import { timeAgo } from '../../lib/format'
import {
  describeTelemetryFreshness,
  formatChannelValue,
  formatAgeSeconds,
  freshnessLabelText,
  type FreshnessLabel,
} from '../../lib/telemetryFreshness'
import type { AgentNotice } from '../../lib/useAgentChat'

const DANGER_KINDS = new Set(['auth', 'provider', 'network', 'unknown'])

/**
 * Failure notice for the last turn. Always states what did NOT happen (no
 * answer was produced) and only offers Retry when the failure is transient.
 * Internal detail never appears here: the messages are the fixed strings
 * mapped in api/agent.ts.
 */
export function AgentNoticeBanner({
  notice,
  rateLimitRemainingSeconds,
  retrying,
  onRetry,
  onDismiss,
}: {
  notice: AgentNotice
  rateLimitRemainingSeconds: number | null
  retrying: boolean
  onRetry: () => void
  onDismiss: () => void
}) {
  const danger = DANGER_KINDS.has(notice.kind)
  const alert = notice.kind === 'rate_limited' ? null : 'alert'
  const title =
    notice.kind === 'rate_limited'
      ? 'Slow down a moment'
      : notice.kind === 'daily_cap'
        ? 'AI usage limit reached'
        : notice.kind === 'conversation_missing'
          ? 'Conversation no longer exists'
          : notice.kind === 'disabled'
            ? 'Assistant unavailable'
            : notice.kind === 'validation'
              ? 'Check your message'
              : 'No answer produced'

  return (
    <div className={`agent-notice ${danger ? 'agent-notice--danger' : 'agent-notice--warning'}`} role={alert ?? 'status'}>
      <span className="agent-notice-icon" aria-hidden="true">
        {danger ? <AlertOctagonIcon size={16} /> : <WarningIcon size={16} />}
      </span>
      <div className="agent-notice-body">
        <div className="agent-notice-title">{title}</div>
        <p className="agent-notice-text">
          {notice.message}
          {notice.kind === 'rate_limited' && rateLimitRemainingSeconds !== null && (
            <> Retry in {rateLimitRemainingSeconds}s.</>
          )}
          {notice.kind === 'conversation_missing' && <> The next message will start a new conversation.</>}
        </p>
      </div>
      <div className="agent-notice-actions">
        {notice.retryable && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} disabled={retrying}>
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  )
}

/**
 * Machine data the assistant can read, taken from the SAME backend records
 * the dashboard shows (no extra polling, no fabricated values). Unreported
 * channels keep the backend's own "Not reported" wording.
 */
export function MachineDataStrip({
  identifier,
  recordedAt,
  temperature,
}: {
  identifier: string | null
  recordedAt: string | null
  temperature: number | null
}) {
  const { ageSeconds, label } = describeTelemetryFreshness(recordedAt)

  return (
    <div className="agent-datastrip">
      <span className="agent-datastrip-source">
        <WifiIcon size={14} aria-hidden="true" />
        <strong>{identifier ?? 'No machine linked'}</strong>
      </span>
      <span className="agent-datastrip-item">
        Last sample{' '}
        {ageSeconds === null ? (
          <em>never reported</em>
        ) : (
          <>
            {timeAgo(recordedAt as string)} <span className="agent-datastrip-age">({freshnessLabelText(label)})</span>
          </>
        )}
      </span>
      <span className="agent-datastrip-item">
        Extruder <strong>{formatChannelValue(temperature, '°C', 1)}</strong>
      </span>
      <span className="agent-datastrip-note">
        <InfoIcon size={13} aria-hidden="true" /> The assistant reads these backend records only when a question needs
        them — it never guesses a value.
      </span>
    </div>
  )
}

/**
 * Stale-data warning, driven ONLY by the machine's reported sample age
 * (backend thresholds: stale after 120 s, very stale after 600 s). It is not
 * attached to an individual answer: an answer may be based on data that
 * changed since, and the assistant's own snapshot age is not exposed by the
 * API (documented gap).
 */
export function StaleDataNotice({ label, ageSeconds }: { label: FreshnessLabel; ageSeconds: number | null }) {
  if (label !== 'stale' && label !== 'very_stale') return null

  return (
    <div className={`agent-stale ${label === 'very_stale' ? 'agent-stale--very' : ''}`} role="status">
      <WarningIcon size={16} aria-hidden="true" />
      <span>
        <strong>Telemetry for this machine is {freshnessLabelText(label)}</strong> — the newest reported sample is{' '}
        {formatAgeSeconds(ageSeconds)} old.
        {label === 'very_stale' ? ' Treat machine state as unknown, not as “off”.' : ' Values may not reflect the current state.'}
      </span>
    </div>
  )
}

/** 404 AGENT_DISABLED: the whole assistant surface is switched off. */
export function AgentUnavailableState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="state-block" role="status">
      <AlertOctagonIcon size={34} />
      <div className="state-title">Assistant not available</div>
      <div className="state-desc">
        The AI assistant is switched off on this 3awedlou server. Your machines, dashboards and controls keep working
        exactly as before.
      </div>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} style={{ marginTop: 6 }}>
          Check again
        </button>
      )}
    </div>
  )
}
