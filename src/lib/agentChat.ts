/**
 * Chat-specific pure helpers: message validation, tool-call presentation and
 * transcript ids. No I/O here so every rule below is unit-testable.
 */
import type { AgentToolCall } from '../types/api'
import { AGENT_MESSAGE_MAX_CHARS } from '../api/agent'

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  /** Untrusted text. Rendered as TEXT only — never as HTML/Markdown. */
  content: string
  toolCalls: AgentToolCall[]
  createdAt: string
}

/** Human labels for the five read-only tools the backend exposes. */
export const TOOL_LABELS: Record<string, string> = {
  list_my_machines: 'Checked your machines',
  get_latest_telemetry: 'Read the latest telemetry',
  get_recent_events: 'Read recent machine events',
  explain_fault_code: 'Looked up the fault code',
  get_audit_log: 'Read the machine activity log',
}

export interface ToolCallPresentation {
  /** Known tool -> friendly label; unknown tool -> the raw name (a constant). */
  label: string
  /** Backend-provided summary verbatim (e.g. "get_latest_telemetry: 12 row(s)"). */
  detail: string
  /** True when the summary reports a failure code instead of a row count. */
  failed: boolean
}

/**
 * Presentation for one tool call. The backend summary format is
 * `"<tool>: <n> row(s)"`, `"<tool>: ok"` or `"<tool>: <CODE>"`, so anything
 * that is not a row count/ok is surfaced as a failed data read.
 */
export function describeToolCall(call: AgentToolCall): ToolCallPresentation {
  const detail = call.summary
  const separator = detail.lastIndexOf(': ')
  const outcome = separator >= 0 ? detail.slice(separator + 2).trim() : ''
  const ok = outcome === 'ok' || /^\d+\s+row\(s\)$/.test(outcome)

  return {
    label: TOOL_LABELS[call.name] ?? call.name,
    detail,
    failed: !ok,
  }
}

/** Client-side validation mirroring the backend limits (1..4000 chars). */
export function validateMessage(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed.length === 0) return 'Type a question first.'
  if (trimmed.length > AGENT_MESSAGE_MAX_CHARS) {
    return `Messages can be up to ${AGENT_MESSAGE_MAX_CHARS.toLocaleString('en-US')} characters.`
  }
  return null
}

let sequence = 0

/** Local transcript id. Not a server id — the backend assigns its own. */
export function nextMessageId(prefix: ChatRole): string {
  sequence += 1
  return `${prefix}-${sequence}`
}

/** Test seam so ids are deterministic per test. */
export function resetMessageIdSequence(): void {
  sequence = 0
}
