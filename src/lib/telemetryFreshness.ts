/**
 * Telemetry freshness + channel formatting (web).
 *
 * Thresholds and the literal "Not reported" string mirror the backend
 * contract exactly (App\Service\Agent\Tools\GetLatestTelemetryTool):
 *   - unreported channels are the literal string "Not reported" — never 0/false;
 *   - age > 120 s  -> stale;
 *   - age > 600 s  -> very stale (telemetry considered missing).
 *
 * The chat UI shows the machine's reported sample age from the SAME backend
 * record the assistant reads; it never invents values and never performs its
 * own polling.
 */

/** Literal string the backend uses for a channel with no hardware source. */
export const NOT_REPORTED = 'Not reported'

export const TELEMETRY_STALE_AFTER_SECONDS = 120
export const TELEMETRY_VERY_STALE_AFTER_SECONDS = 600

export type FreshnessLabel = 'fresh' | 'stale' | 'very_stale' | 'unknown'

export interface TelemetryFreshness {
  /** Whole seconds since the sample was recorded; null when not known. */
  ageSeconds: number | null
  label: FreshnessLabel
}

/**
 * Staleness of ONE reported sample, using the backend's own boundaries
 * (`> 120` stale, `> 600` very stale). A missing/invalid timestamp is
 * 'unknown' — never assumed fresh.
 */
export function describeTelemetryFreshness(
  recordedAt: string | null | undefined,
  now: number = Date.now(),
): TelemetryFreshness {
  if (typeof recordedAt !== 'string' || recordedAt === '') return { ageSeconds: null, label: 'unknown' }

  const recorded = new Date(recordedAt).getTime()
  if (!Number.isFinite(recorded)) return { ageSeconds: null, label: 'unknown' }

  const ageSeconds = Math.max(0, Math.floor((now - recorded) / 1000))
  const label: FreshnessLabel =
    ageSeconds > TELEMETRY_VERY_STALE_AFTER_SECONDS
      ? 'very_stale'
      : ageSeconds > TELEMETRY_STALE_AFTER_SECONDS
        ? 'stale'
        : 'fresh'

  return { ageSeconds, label }
}

/** Short badge text for a freshness label. */
export function freshnessLabelText(label: FreshnessLabel): string {
  switch (label) {
    case 'fresh':
      return 'fresh'
    case 'stale':
      return 'stale'
    case 'very_stale':
      return 'very stale'
    default:
      return 'age unknown'
  }
}

/**
 * One telemetry channel for display. Null/undefined/NaN is ALWAYS the
 * documented "Not reported" — a missing reading is never rendered as 0.
 */
export function formatChannelValue(value: number | null | undefined, unit = '', digits = 1): string {
  if (value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
    return NOT_REPORTED
  }
  return `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`
}

/** Short age text: "42s", "3m", "2h". */
export function formatAgeSeconds(ageSeconds: number | null): string {
  if (ageSeconds === null) return 'unknown'
  if (ageSeconds < 60) return `${ageSeconds}s`
  const minutes = Math.floor(ageSeconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
