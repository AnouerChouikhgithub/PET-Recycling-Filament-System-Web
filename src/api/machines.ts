/** Machine, telemetry, production and recycling endpoints. */
import { api } from './client'
import type {
  FilamentProduction,
  Machine,
  MachineCommandResult,
  MachineCommandType,
  MachineDashboardView,
  MachineStatusView,
  MachineSession,
  MachineTelemetry,
  RecyclingRecord,
  RecyclingTotals,
} from '../types/api'

export const machinesApi = {
  list(): Promise<Machine[]> {
    return api.get<Machine[]>('/machines')
  },

  detail(id: string): Promise<Machine & { telemetry: MachineTelemetry | null; activeSessionId: string | null }> {
    return api.get(`/machines/${id}`)
  },

  status(id: string): Promise<MachineStatusView> {
    return api.get(`/machines/${id}/status`)
  },

  /** One round trip powering the dashboard (machine + telemetry + session + totals). */
  dashboard(id: string): Promise<MachineDashboardView> {
    return api.get(`/machines/${id}/dashboard`)
  },

  telemetryHistory(id: string, params?: { limit?: number; offset?: number; since?: string }): Promise<MachineTelemetry[]> {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    if (params?.since) qs.set('since', params.since)
    const suffix = qs.toString() ? `?${qs}` : ''
    return api.get(`/machines/${id}/telemetry${suffix}`)
  },

  sessions(id: string, params?: { limit?: number; offset?: number; status?: string }): Promise<MachineSession[]> {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    if (params?.status) qs.set('status', params.status)
    const suffix = qs.toString() ? `?${qs}` : ''
    return api.get(`/machines/${id}/sessions${suffix}`)
  },

  production(id: string, params?: { limit?: number; offset?: number }): Promise<FilamentProduction[]> {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    const suffix = qs.toString() ? `?${qs}` : ''
    return api.get(`/machines/${id}/production${suffix}`)
  },

  recycling(
    id: string,
    params?: { limit?: number; offset?: number },
  ): Promise<{ records: RecyclingRecord[]; totals: RecyclingTotals }> {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))
    const suffix = qs.toString() ? `?${qs}` : ''
    return api.get(`/machines/${id}/recycling${suffix}`)
  },
}

/** Fire a guarded remote command (backend validates state + safe ranges). */
export function sendMachineCommand(
  machineId: string,
  command: MachineCommandType,
  value?: number,
  params?: Record<string, unknown>,
): Promise<MachineCommandResult> {
  const body: Record<string, unknown> = { command }
  if (value !== undefined) body.value = value
  if (params !== undefined) body.params = params
  return api.post(`/machines/${machineId}/commands`, body)
}
