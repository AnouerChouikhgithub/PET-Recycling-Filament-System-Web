/**
 * Machine data context — backed by the Symfony API.
 *
 * Replaces the old client-side "digital twin" simulation. Data flow:
 *
 *   AuthProvider resolves → MachineProvider picks the first machine
 *   → GET /api/machines/{id}/dashboard (initial load)
 *   → realtimeService subscription (polling today, WebSocket later)
 *   → machine state updates pushed to all pages through useMachine()
 *
 * Session actions post commands to the backend guard (start/pause/resume/stop)
 * — the same interface pages already used, so screens keep their structure.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { machinesApi, sendMachineCommand } from '../api/machines'
import { realtimeService } from '../realtime/realtimeService'
import { useAuth } from './AuthContext'
import type {
  Machine,
  MachineAlert,
  MachineCommandType,
  MachineDashboardView,
  MachineTelemetry,
} from '../types/api'

/**
 * UI view model kept compatible with the existing pages (sensors/subsystems
 * cards). Derived from the API dashboard payload — never fabricated.
 */
export interface MachineView {
  machine: Machine
  telemetry: MachineTelemetry | null
  /** oldest → newest recent samples */
  recentTelemetry: MachineTelemetry[]
  activeSession: MachineDashboardView['activeSession']
  recyclingTotals: MachineDashboardView['recyclingTotals']
  sensors: SensorReading[]
  subsystems: Subsystem[]
}

export interface SensorReading {
  id: 'temp' | 'motor' | 'fan' | 'feed'
  label: string
  unit: string
  value: number
  target: number
  status: 'nominal' | 'warning' | 'error'
  history: number[]
  min: number
  max: number
  decimals?: number
}

export interface Subsystem {
  key: 'heater' | 'motor' | 'cooling' | 'spooler'
  label: string
  detail: string
  state: 'on' | 'off' | 'fault'
}

interface MachineCtx {
  machines: Machine[]
  selectedId: string | null
  view: MachineView | null
  loading: boolean
  error: string | null
  /** 'polling' until the realtime transport is deployed */
  realtimeMode: 'websocket' | 'polling'
  refresh: () => void
  selectMachine: (id: string) => void
  /** Sends a guarded command; throws ApiError on rejection. */
  sendCommand: (command: MachineCommandType, value?: number) => Promise<void>
  hasMachines: boolean
  /** Alerts DERIVED from real machine state (never fabricated). */
  alerts: MachineAlert[]
  unreadAlerts: number
  markAlertRead: (id: string) => void
  markAllAlertsRead: () => void
}

const Ctx = createContext<MachineCtx | null>(null)

const TEMP_TARGET_FALLBACK = 195

const last =
  <T,>(arr: T[]): T | undefined =>
    arr.length > 0 ? arr[arr.length - 1] : undefined

const deviation = (value: number, ref: number) =>
  Math.abs(value - ref) / Math.max(1, Math.abs(ref))

/** Build the sensor cards from real telemetry + real history (or zeros). */
function buildSensors(view: MachineDashboardView, maxTempC: number): SensorReading[] {
  const t = view.telemetry

  const historyOf = (pick: (s: MachineTelemetry) => number | null): number[] =>
    view.recentTelemetry.map(pick).filter((v): v is number => v !== null).slice(-24)

  const target = t?.targetTemperature ?? TEMP_TARGET_FALLBACK
  const tempValue = t?.temperature ?? 0
  const tempStatus: SensorReading['status'] =
    t?.temperature == null
      ? 'nominal'
      : deviation(t.temperature, target) > 0.18
        ? 'error'
        : deviation(t.temperature, target) > 0.09
          ? 'warning'
          : 'nominal'

  return [
    {
      id: 'temp',
      label: 'Extruder Temp',
      unit: '°C',
      value: tempValue,
      target,
      status: tempStatus,
      history: historyOf((s) => s.temperature),
      min: 0,
      max: maxTempC,
    },
    {
      id: 'motor',
      label: 'Motor Speed',
      unit: 'RPM',
      value: t?.motorSpeed ?? 0,
      target: t?.motorSpeed ?? 0,
      status: 'nominal',
      history: historyOf((s) => s.motorSpeed),
      min: 0,
      max: 100,
    },
    {
      id: 'fan',
      label: 'Cooling Fan',
      unit: '%',
      value: t?.fanState ? 100 : 0,
      target: t?.fanState ? 100 : 0,
      status: 'nominal',
      history: historyOf((s) => (s.fanState ? 100 : 0)),
      min: 0,
      max: 100,
    },
    {
      id: 'feed',
      label: 'Feed Rate',
      unit: 'mm/s',
      value: t?.filamentSpeed ?? 0,
      target: t?.filamentSpeed ?? 0,
      status: 'nominal',
      history: historyOf((s) => s.filamentSpeed),
      min: 0,
      max: 6,
      decimals: 1,
    },
  ]
}

/** Derive subsystem tiles from the latest real telemetry (no fabrication). */
function buildSubsystems(view: MachineDashboardView): Subsystem[] {
  const t = view.telemetry
  const offline = view.status === 'offline'
  const running = !offline && view.activeSession != null
  return [
    {
      key: 'heater',
      label: 'Heater',
      detail: t?.targetTemperature != null ? `Target ${Math.round(t.targetTemperature)}°C` : 'Standby',
      state: !offline && (t?.heaterState ?? false) ? 'on' : 'off',
    },
    {
      key: 'motor',
      label: 'Extruder Motor',
      detail: t?.motorSpeed != null ? `${Math.round(t.motorSpeed)} RPM` : 'Standby',
      state: !offline && (t?.motorState ?? false) ? 'on' : 'off',
    },
    {
      key: 'cooling',
      label: 'Cooling',
      detail: t?.fanState != null ? `Fan ${t.fanState ? 'on' : 'off'}` : 'Standby',
      state: !offline && (t?.fanState ?? false) ? 'on' : 'off',
    },
    {
      key: 'spooler',
      label: 'Spooler',
      detail: running ? 'Session in progress' : 'Idle',
      state: running ? 'on' : 'off',
    },
  ]
}

export function MachineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  const [machines, setMachines] = useState<Machine[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<MachineDashboardView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const selectedRef = useRef<string | null>(null)
  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  /* -------- initial load: machine list + first dashboard -------- */
  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const list = await machinesApi.list()
      setMachines(list)
      if (list.length === 0) {
        setSelectedId(null)
        setDashboard(null)
        return
      }
      const id = selectedRef.current ?? (list.find((m) => m.status !== 'offline') ?? list[0]).id
      setSelectedId(id)
      const data = await machinesApi.dashboard(id)
      setDashboard(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  /** Re-fetch the selected machine's dashboard (used by realtime + actions). */
  const refreshDashboard = useCallback((id: string): void => {
    machinesApi
      .dashboard(id)
      .then(setDashboard)
      .catch(() => {})
  }, [])

  useEffect(() => {
    void load()
    // Reload when the signed-in user changes; load() is stable.
  }, [user?.id, load])

  /* -------- realtime subscription (polling transport today) -------- */
  useEffect(() => {
    if (!selectedId) return
    const offTelemetry = realtimeService.onTelemetry((_telemetry, dash) => {
      setDashboard(dash)
    })
    realtimeService.subscribeToMachine(selectedId)
    return () => {
      offTelemetry()
      realtimeService.unsubscribe()
    }
  }, [selectedId])

  const refresh = useCallback(() => {
    const id = selectedRef.current
    if (id) refreshDashboard(id)
  }, [refreshDashboard])

  const selectMachine = useCallback(
    (id: string) => {
      setSelectedId(id)
      refreshDashboard(id)
    },
    [refreshDashboard],
  )

  const sendCommand = useCallback(
    async (command: MachineCommandType, value?: number): Promise<void> => {
      const id = selectedRef.current
      if (!id) return
      await sendMachineCommand(id, command, value)
      refreshDashboard(id)
    },
    [refreshDashboard],
  )

  const view: MachineView | null = useMemo(() => {
    if (!dashboard) return null
    return {
      machine: dashboard,
      telemetry: dashboard.telemetry,
      recentTelemetry: dashboard.recentTelemetry,
      activeSession: dashboard.activeSession,
      recyclingTotals: dashboard.recyclingTotals,
      sensors: buildSensors(dashboard, 260),
      subsystems: buildSubsystems(dashboard),
    }
  }, [dashboard])

  /* -------- alerts derived from REAL machine state (never fabricated) -------- */
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('3awedlou.alerts.read') ?? '[]') as string[]
    } catch {
      return []
    }
  })

  const [historyAlerts, setHistoryAlerts] = useState<MachineAlert[]>([])
  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    machinesApi
      .sessions(selectedId, { limit: 20 })
      .then((sessions) => {
        if (cancelled) return
        const failed = sessions
          .filter((s) => s.status === 'failed')
          .slice(0, 3)
          .map((s): MachineAlert => ({
            id: `session-failed-${s.id}`,
            severity: 'error',
            title: 'Session failed',
            message: s.notes ?? `A session started ${new Date(s.startedAt).toLocaleString()} ended unexpectedly.`,
            date: s.endedAt ?? s.startedAt,
            read: false,
          }))
        const completed = sessions.find((s) => "status" in s && s.status === 'completed')
        const completedAlert: MachineAlert | null = completed
          ? {
              id: `session-completed-${completed.id}`,
              severity: 'success',
              title: 'Last session completed',
              message:
                completed.materialOutput != null
                  ? `Filament output recorded: ${Math.round(completed.materialOutput)} g.`
                  : 'The run finished and was archived.',
              date: completed.endedAt ?? completed.startedAt,
              read: false,
            }
          : null
        setHistoryAlerts([...failed, ...(completedAlert ? [completedAlert] : [])])
      })
      .catch(() => {
        /* alerts are non-critical; failures stay silent */
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, dashboard])

  const alerts = useMemo<MachineAlert[]>(() => {
    const derived: MachineAlert[] = []
    if (dashboard?.status === 'offline') {
      derived.push({
        id: 'machine-offline',
        severity: 'error',
        title: 'Machine offline',
        message: 'The machine has not reported recently. Check its Wi-Fi connection.',
        date: new Date().toISOString(),
        read: false,
      })
    }
    if (dashboard?.activeSession?.status === 'in_progress') {
        derived.push({
          id: 'session-running',
          severity: 'info',
          title: 'Session in progress',
          message: 'The machine is recycling PET into filament right now.',
          date: dashboard.activeSession.startedAt,
          read: false,
        })
    }
    return [...historyAlerts, ...derived].sort((a, b) => b.date.localeCompare(a.date))
  }, [dashboard, historyAlerts])

  const persistReadIds = (ids: string[]): void => {
    try {
      localStorage.setItem('3awedlou.alerts.read', JSON.stringify(ids))
    } catch {
      /* ignore */
    }
  }

  const markAlertRead = useCallback((id: string) => {
    setReadIds((ids) => {
      if (ids.includes(id)) return ids
      const next = [...ids, id]
      persistReadIds(next)
      return next
    })
  }, [])

  const markAllAlertsRead = useCallback(() => {
    setReadIds((ids) => {
      const next = Array.from(new Set([...ids, ...alerts.map((a) => a.id)]))
      persistReadIds(next)
      return next
    })
  }, [alerts])

  const alertsView = useMemo(
    () => alerts.map((a) => ({ ...a, read: readIds.includes(a.id) })),
    [alerts, readIds],
  )

  const value = useMemo(
    () => ({
      machines,
      selectedId,
      view,
      loading,
      error,
      realtimeMode: realtimeService.mode,
      refresh,
      selectMachine,
      sendCommand,
      hasMachines: machines.length > 0,
      alerts: alertsView,
      unreadAlerts: alertsView.filter((a) => !a.read).length,
      markAlertRead,
      markAllAlertsRead,
    }),
    [
      machines,
      selectedId,
      view,
      loading,
      error,
      refresh,
      selectMachine,
      sendCommand,
      alertsView,
      markAlertRead,
      markAllAlertsRead,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useMachine(): MachineCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useMachine must be used within MachineProvider')
  return ctx
}

/** Latest telemetry sample of the view, if any. */
export function useLatestTelemetry(): MachineTelemetry | null {
  return useMachine().view?.telemetry ?? null
}

// keep `last` referenced for upcoming session-progress helpers
void last
