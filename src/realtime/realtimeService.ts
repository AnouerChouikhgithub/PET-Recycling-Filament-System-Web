/**
 * 3awedlou realtime service (web).
 *
 * The realtime transport (WebSocket/SSE) is not deployed yet. Rather than
 * pretending polling is realtime, this service exposes the SAME interface the
 * future transport will use — connect(), disconnect(), subscribeToMachine(),
 * onTelemetry(), onMachineStatus(), onMachineEvent() — with two behaviors:
 *
 *   - Polling of the dashboard endpoint, surfaced to the UI as
 *     `transport: 'polling'`.
 *   - A configured VITE_REALTIME_URL is retained as a future socket target,
 *     but it never selects a socket until one is actually connected. Until
 *     the backend hub ships, every deployment keeps polling.
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

export class RealtimeService {
  private handlers: RealtimeHandlers = {}
  private machineId: string | null = null
  private timer: number | null = null
  private running = false
  private inFlight = false
  private visibilityWatched = false
  private transport: RealtimeTransport = 'polling'

  constructor(
    /** Kept for the future socket transport; it must not disable polling. */
    private readonly configuredUrl: string | null = import.meta.env.VITE_REALTIME_URL || null,
  ) {}

  get mode(): RealtimeTransport {
    return this.transport
  }

  get hasConfiguredSocketUrl(): boolean {
    return this.configuredUrl !== null
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
    this.startPolling()
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
    if (this.running && !document.hidden) void this.poll()
  }

  /**
   * A hidden tab must not keep polling (wasted requests, and the numbers the
   * user comes back to are stale). Pause on hide, refresh IMMEDIATELY on show -
   * the dashboard never shows numbers older than the moment it became visible
   * (BUGS-TO-FIX F12). Bound once: this service is an app-lifetime singleton.
   */
  private watchVisibility(): void {
    if (this.visibilityWatched) return
    this.visibilityWatched = true
    document.addEventListener('visibilitychange', () => {
      if (!this.running) return
      if (document.hidden) this.stopPolling()
      else this.startPolling()
    })
  }

  private startPolling(): void {
    this.watchVisibility()
    this.stopPolling()
    if (document.hidden) return // the visibilitychange handler resumes us
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
