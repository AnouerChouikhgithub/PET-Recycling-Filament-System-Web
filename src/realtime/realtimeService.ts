/**
 * 3awedlou realtime service (web).
 *
 * The realtime transport (WebSocket/SSE) is not deployed yet. Rather than
 * pretending polling is realtime, this service exposes the SAME interface the
 * future transport will use — connect(), disconnect(), subscribeToMachine(),
 * onTelemetry(), onMachineStatus(), onMachineEvent() — with two behaviors:
 *
 *   - VITE_REALTIME_URL set → connects to it (wired when the backend realtime
 *     hub ships; the interface below is the stable contract).
 *   - VITE_REALTIME_URL empty → honest refresh polling of the dashboard
 *     endpoint, surfaced to the UI as `transport: 'polling'`.
 *
 * Dashboards subscribe once; switching the transport later requires no page
 * rewrites. `onMachineStatus` and `onMachineEvent` fire only on push
 * transports — polling delivers everything through `onTelemetry` snapshots.
 */
import { machinesApi } from '../api/machines'
import type { MachineDashboardView, MachineTelemetry } from '../types/api'

export type RealtimeTransport = 'websocket' | 'polling'

export interface RealtimeHandlers {
  onTelemetry?: (telemetry: MachineTelemetry | null, dashboard: MachineDashboardView) => void
  onMachineStatus?: (dashboard: MachineDashboardView) => void
  onMachineEvent?: (event: { type: string; payload: Record<string, unknown>; occurredAt: string }) => void
}

const REFRESH_MS = 10_000

class RealtimeService {
  private handlers: RealtimeHandlers = {}
  private machineId: string | null = null
  private timer: number | null = null
  private running = false
  private inFlight = false
  private transport: RealtimeTransport =
    import.meta.env.VITE_REALTIME_URL ? 'websocket' : 'polling'

  get mode(): RealtimeTransport {
    return this.transport
  }

  get isRunning(): boolean {
    return this.running
  }

  /** No-op until the WebSocket hub exists — kept for interface stability. */
  connect(_url?: string): void {}

  disconnect(): void {
    this.stopPolling()
    this.running = false
  }

  /** Start observing one machine (the dashboard's machine). */
  subscribeToMachine(machineId: string): void {
    if (this.machineId === machineId && this.running) return
    this.stopPolling()
    this.machineId = machineId
    this.running = true
    if (this.transport === 'polling') this.startPolling()
  }

  unsubscribe(): void {
    this.stopPolling()
    this.machineId = null
    this.running = false
  }

  onTelemetry(cb: NonNullable<RealtimeHandlers['onTelemetry']>): () => void {
    this.handlers.onTelemetry = cb
    return () => {
      if (this.handlers.onTelemetry === cb) delete this.handlers.onTelemetry
    }
  }

  onMachineStatus(cb: NonNullable<RealtimeHandlers['onMachineStatus']>): () => void {
    this.handlers.onMachineStatus = cb
    return () => {
      if (this.handlers.onMachineStatus === cb) delete this.handlers.onMachineStatus
    }
  }

  onMachineEvent(cb: NonNullable<RealtimeHandlers['onMachineEvent']>): () => void {
    this.handlers.onMachineEvent = cb
    return () => {
      if (this.handlers.onMachineEvent === cb) delete this.handlers.onMachineEvent
    }
  }

  /** One immediate refresh — used after user actions (start/stop session…). */
  refreshNow(): void {
    if (this.running) void this.poll()
  }

  private startPolling(): void {
    void this.poll()
    this.timer = window.setInterval(() => void this.poll(), REFRESH_MS)
  }

  private stopPolling(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
  }

  private async poll(): Promise<void> {
    if (!this.machineId || this.inFlight) return
    this.inFlight = true
    try {
      const dashboard = await machinesApi.dashboard(this.machineId)
      this.handlers.onTelemetry?.(dashboard.telemetry, dashboard)
      this.handlers.onMachineStatus?.(dashboard)
    } catch {
      // Network/500 hiccups are surfaced by the owning screen's own error
      // state; the polling loop keeps trying silently.
    } finally {
      this.inFlight = false
    }
  }
}

export const realtimeService = new RealtimeService()
