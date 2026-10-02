/**
 * 3awedlou API CONTRACT (web copy)
 * --------------------------------
 * These types mirror the Symfony backend responses EXACTLY (see
 * backend/docs/api-contract.md). The mobile app holds an equivalent copy —
 * the two must never drift: same field names, same status enums, same
 * envelope. When the backend contract changes, update both.
 */

/** Every API response is wrapped in this envelope. */
export interface ApiEnvelope<T> {
  success: boolean
  data: T
  meta?: Record<string, unknown>
}

export interface ApiErrorBody {
  code: string
  message: string
  details?: Record<string, string[]>
}

/**
 * Machine lifecycle. `offline` is DERIVED by the backend from `lastSeenAt`
 * (a machine whose last report is older than MACHINE_OFFLINE_AFTER_MINUTES);
 * devices never report it themselves.
 */
export type MachineStatus = 'idle' | 'heating' | 'extruding' | 'paused' | 'error' | 'offline'

export type SessionStatus = 'in_progress' | 'paused' | 'completed' | 'failed'

export type FilamentQuality = 'excellent' | 'good' | 'fair' | 'poor'

/** Commands accepted by POST /api/machines/{id}/commands (safe, guarded). */
export type MachineCommandType =
  | 'start'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'setTargetTemperature'
  | 'setMotorSpeed'
  | 'setFan'

export interface User {
  id: string
  email: string
  name: string
  roles: string[]
  createdAt: string
}

export interface AuthPayload {
  token: string
  tokenType: 'Bearer'
  user: User
}

export interface Machine {
  id: string
  name: string
  identifier: string
  /** Effective status (offline derived from lastSeenAt). */
  status: MachineStatus
  /** Raw status the device last reported. */
  reportedStatus: MachineStatus
  lastSeenAt: string | null
  secondsSinceLastSeen: number | null
  createdAt: string
  updatedAt: string
  owner: string | null
}

export interface MachineTelemetry {
  id: string
  machineId: string
  temperature: number | null
  targetTemperature: number | null
  heaterState: boolean | null
  motorState: boolean | null
  motorSpeed: number | null
  fanState: boolean | null
  filamentSpeed: number | null
  filamentDiameter: number | null
  energyConsumption: number | null
  /** Free-form future sensor channels (JSONB). */
  extra: Record<string, unknown> | null
  recordedAt: string
}

export interface MachineSession {
  id: string
  machineId: string
  operator: string | null
  startedAt: string
  endedAt: string | null
  status: SessionStatus
  materialInput: number | null
  materialOutput: number | null
  durationMinutes: number | null
  notes: string | null
}

export interface FilamentProduction {
  id: string
  sessionId: string
  batchCode: string
  diameterTarget: number
  diameterActual: number | null
  diameterSamples: number[] | null
  weightGrams: number
  lengthMeters: number | null
  durationMinutes: number | null
  material: string
  color: string
  colorHex: string
  quality: FilamentQuality
  notes: string | null
  producedAt: string
}

export interface RecyclingRecord {
  id: string
  sessionId: string
  machineId: string
  inputMaterial: string | null
  inputMassGrams: number | null
  outputMaterial: string | null
  outputMassGrams: number | null
  durationMinutes: number | null
  avgTemperature: number | null
  notes: string | null
  recycledAt: string
}

export interface RecyclingTotals {
  records: number
  inputGrams: number | null
  outputGrams: number | null
}

export interface MachineStatusView {
  machineId: string
  identifier: string
  name: string
  status: MachineStatus
  reportedStatus: MachineStatus
  lastSeenAt: string | null
  secondsSinceLastSeen: number | null
}

export type AlertSeverity = 'info' | 'warning' | 'error' | 'success'

/** Client-side alerts — DERIVED from real machine state, never fabricated. */
export interface MachineAlert {
  id: string
  severity: AlertSeverity
  title: string
  message: string
  date: string
  read: boolean
}

/** GET /api/machines/{id}/dashboard — one round trip for the dashboards. */
export interface MachineDashboardView extends Machine {
  telemetry: MachineTelemetry | null
  activeSessionId: string | null
  activeSession: MachineSession | null
  /** oldest → newest (chart order) */
  recentTelemetry: MachineTelemetry[]
  recyclingTotals: RecyclingTotals
}

/** POST /api/machines/{id}/commands — 202 response. */
export interface MachineCommandResult {
  machineId: string
  identifier: string
  command: MachineCommandType
  value: number | null
  topic: string
  accepted: boolean
  sentAt: string
}
