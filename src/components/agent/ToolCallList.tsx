import { CheckIcon, ClockIcon, WarningIcon } from '../icons'
import { describeToolCall } from '../../lib/agentChat'
import type { AgentToolCall } from '../../types/api'

/**
 * Tool calls the assistant made for one answer. The backend only ever sends
 * `{ name, summary }` (no payloads), and both fields are untrusted data:
 * they are rendered as escaped text inside a labelled list.
 */
export function ToolCallList({ calls }: { calls: AgentToolCall[] }) {
  if (calls.length === 0) return null

  return (
    <ul className="agent-tools" aria-label="Machine data the assistant read">
      {calls.map((call, index) => {
        const { label, detail, failed } = describeToolCall(call)
        return (
          <li key={`${call.name}-${index}`} className={`agent-tool ${failed ? 'agent-tool--failed' : ''}`}>
            <span className="agent-tool-icon" aria-hidden="true">
              {failed ? <WarningIcon size={13} /> : <CheckIcon size={13} />}
            </span>
            <span className="agent-tool-label">{label}</span>
            <span className="agent-tool-detail" title={detail}>
              <ClockIcon size={12} aria-hidden="true" />
              {detail}
            </span>
            {failed && <span className="sr-only">Some machine data could not be read for this answer.</span>}
          </li>
        )
      })}
    </ul>
  )
}
