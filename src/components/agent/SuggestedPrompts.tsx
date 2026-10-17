import { InfoIcon } from '../icons'

/**
 * Starter prompts. Each one maps to a tool the backend actually registers
 * (list_my_machines, get_latest_telemetry, get_recent_events,
 * explain_fault_code, get_audit_log) and the fault code shown ("ERROR") is a
 * real entry of the backend FaultCodeTable. They are suggestions, not
 * promises that data exists for every machine.
 */
export const SUGGESTED_PROMPTS: string[] = [
  'Show my machines.',
  'What is the latest telemetry for my machine?',
  'Show recent machine events.',
  'Explain fault code ERROR.',
  'Show recent audit activity for my machine.',
]

export function SuggestedPrompts({
  onPick,
  disabled = false,
}: {
  onPick: (prompt: string) => void
  disabled?: boolean
}) {
  return (
    <div className="agent-suggest">
      <p className="agent-suggest-title" id="agent-suggest-title">
        Try one of these
      </p>
      <ul className="agent-suggest-list" aria-labelledby="agent-suggest-title">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <li key={prompt}>
            <button type="button" className="agent-chip" onClick={() => onPick(prompt)} disabled={disabled}>
              {prompt}
            </button>
          </li>
        ))}
      </ul>
      <p className="agent-suggest-note">
        <InfoIcon size={14} aria-hidden="true" />
        Read-only: your assistant can look things up, but it can never start, stop or change your machine.
      </p>
    </div>
  )
}
