/**
 * UI-only types + re-exports of the API contract.
 *
 * All domain shapes (Machine, MachineTelemetry, sessions, production,
 * recycling, alerts, auth) live in `src/types/api.ts` — the single copy of
 * the backend contract. Import them from here or from types/api directly.
 */
export type {
  ApiEnvelope,
  ApiErrorBody,
  MachineStatus,
  SessionStatus,
  FilamentQuality,
  MachineCommandType,
  AlertSeverity,
  MachineAlert,
  User,
  AuthPayload,
  Machine,
  MachineTelemetry,
  MachineSession,
  FilamentProduction,
  RecyclingRecord,
  RecyclingTotals,
  MachineStatusView,
  MachineDashboardView,
  MachineCommandResult,
} from '../types/api'

/** Theme preference. UI-only — nothing comparable in the backend. */
export type Theme = 'light' | 'dark'
