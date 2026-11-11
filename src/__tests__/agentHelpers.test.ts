import { describe, expect, it } from 'vitest'
import { TOOL_LABELS, describeToolCall, nextMessageId, validateMessage } from '../lib/agentChat'
import {
  NOT_REPORTED,
  describeTelemetryFreshness,
  formatAgeSeconds,
  formatChannelValue,
  freshnessLabelText,
} from '../lib/telemetryFreshness'

const NOW = Date.parse('2026-10-17T12:00:00Z')
const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString()

describe('message validation (mirrors the backend 1..4000 limit)', () => {
  it('rejects empty and whitespace-only drafts', () => {
    expect(validateMessage('')).not.toBeNull()
    expect(validateMessage('   ')).not.toBeNull()
    expect(validateMessage('\n\t ')).not.toBeNull()
  })

  it('accepts 1..4000 characters and rejects 4001', () => {
    expect(validateMessage('a')).toBeNull()
    expect(validateMessage('a'.repeat(4000))).toBeNull()
    expect(validateMessage('a'.repeat(4001))).toContain('4,000')
  })

  it('measures the trimmed length (the backend trims before counting)', () => {
    expect(validateMessage(`   ${'a'.repeat(4000)}   `)).toBeNull()
  })
})

describe('tool call presentation', () => {
  it('covers exactly the five read-only tools the backend registers', () => {
    expect(Object.keys(TOOL_LABELS).sort()).toEqual(
      ['explain_fault_code', 'get_audit_log', 'get_latest_telemetry', 'get_recent_events', 'list_my_machines'].sort(),
    )
  })

  it('labels known tools and keeps unknown ones verbatim (never executed)', () => {
    expect(describeToolCall({ name: 'get_latest_telemetry', summary: 'get_latest_telemetry: 12 row(s)' }).label).toBe(
      'Read the latest telemetry',
    )
    const unknown = describeToolCall({ name: 'set_target_temperature', summary: 'set_target_temperature: UNKNOWN_TOOL' })
    expect(unknown.label).toBe('set_target_temperature')
    expect(unknown.detail).toBe('set_target_temperature: UNKNOWN_TOOL')
  })

  it('flags a failed data read instead of a row count', () => {
    expect(describeToolCall({ name: 'get_latest_telemetry', summary: 'get_latest_telemetry: 12 row(s)' }).failed).toBe(false)
    expect(describeToolCall({ name: 'list_my_machines', summary: 'list_my_machines: ok' }).failed).toBe(false)
    expect(describeToolCall({ name: 'list_my_machines', summary: 'list_my_machines: 0 row(s)' }).failed).toBe(false)
    expect(describeToolCall({ name: 'get_latest_telemetry', summary: 'get_latest_telemetry: MACHINE_NOT_FOUND' }).failed).toBe(true)
    expect(describeToolCall({ name: 'get_latest_telemetry', summary: 'get_latest_telemetry: VALIDATION_FAILED' }).failed).toBe(true)
  })

  it('never exposes a payload as a detail string', () => {
    // The backend only sends name + summary; anything else would be data.
    const call = { name: 'get_audit_log', summary: 'get_audit_log: 3 row(s)' }
    expect(describeToolCall(call).detail).toBe('get_audit_log: 3 row(s)')
  })
})

describe('telemetry freshness (backend thresholds: 120 s / 600 s)', () => {
  it('treats a missing or unparsable timestamp as unknown, never fresh', () => {
    expect(describeTelemetryFreshness(null, NOW)).toEqual({ ageSeconds: null, label: 'unknown' })
    expect(describeTelemetryFreshness(undefined, NOW).label).toBe('unknown')
    expect(describeTelemetryFreshness('', NOW).label).toBe('unknown')
    expect(describeTelemetryFreshness('not-a-date', NOW).label).toBe('unknown')
  })

  it('labels samples at the exact boundaries the backend uses', () => {
    expect(describeTelemetryFreshness(at(0), NOW)).toEqual({ ageSeconds: 0, label: 'fresh' })
    expect(describeTelemetryFreshness(at(119), NOW).label).toBe('fresh')
    expect(describeTelemetryFreshness(at(120), NOW).label).toBe('fresh') // > 120 is stale
    expect(describeTelemetryFreshness(at(121), NOW).label).toBe('stale')
    expect(describeTelemetryFreshness(at(600), NOW).label).toBe('stale') // > 600 is very stale
    expect(describeTelemetryFreshness(at(601), NOW).label).toBe('very_stale')
    expect(describeTelemetryFreshness(at(900), NOW)).toEqual({ ageSeconds: 900, label: 'very_stale' })
  })

  it('never reports a negative age for a clock-skewed future timestamp', () => {
    const future = new Date(NOW + 60_000).toISOString()
    expect(describeTelemetryFreshness(future, NOW)).toEqual({ ageSeconds: 0, label: 'fresh' })
  })

  it('has stable human labels', () => {
    expect(freshnessLabelText('fresh')).toBe('fresh')
    expect(freshnessLabelText('stale')).toBe('stale')
    expect(freshnessLabelText('very_stale')).toBe('very stale')
    expect(freshnessLabelText('unknown')).toBe('age unknown')
  })
})

describe('telemetry channel formatting ("Not reported" contract)', () => {
  it('renders an unreported channel with the backend wording, never 0', () => {
    expect(formatChannelValue(null)).toBe(NOT_REPORTED)
    expect(formatChannelValue(undefined)).toBe(NOT_REPORTED)
    expect(formatChannelValue(Number.NaN)).toBe(NOT_REPORTED)
    expect(formatChannelValue(null, '°C')).toBe(NOT_REPORTED)
  })

  it('renders a real reading, including a genuine zero', () => {
    expect(formatChannelValue(212.4, '°C')).toBe('212.4 °C')
    expect(formatChannelValue(0, '°C')).toBe('0.0 °C')
    expect(formatChannelValue(0, '°C')).not.toBe(NOT_REPORTED)
  })

  it('formats ages compactly', () => {
    expect(formatAgeSeconds(null)).toBe('unknown')
    expect(formatAgeSeconds(42)).toBe('42s')
    expect(formatAgeSeconds(180)).toBe('3m')
    expect(formatAgeSeconds(7200)).toBe('2h')
    expect(formatAgeSeconds(172800)).toBe('2d')
  })
})

describe('transcript ids', () => {
  it('are unique per message', () => {
    const ids = new Set([nextMessageId('user'), nextMessageId('assistant'), nextMessageId('user')])
    expect(ids.size).toBe(3)
  })
})
