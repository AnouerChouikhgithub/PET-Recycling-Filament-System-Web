import { BottleIcon, ChevronRightIcon, LeafIcon, PlayIcon, SpoolIcon, WrenchIcon, WifiIcon, InfoIcon } from '../components/icons'
import { Card, CardHeader } from '../components/ui/Card'
import { Gauge } from '../components/charts/Gauge'
import { LineChart } from '../components/charts/LineChart'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ErrorState, LoadingState } from '../components/ui/states'
import { PageHeader, ConnPill } from '../components/layout/PageHeader'
import { useMachine } from '../contexts/MachineContext'
import { timeAgo, formatDuration } from '../lib/format'
import { navigateTo } from '../lib/router'

const ACTIVITY_ICON = {
  error: WrenchIcon,
  warning: WrenchIcon,
  info: WifiIcon,
  success: PlayIcon,
}

export function DashboardPage() {
  const { view, loading, error, alerts, refresh, realtimeMode } = useMachine()

  if (loading && !view) {
    return (
      <>
        <PageHeader eyebrow="Your recycling machine" title="Good to see you." subtitle="Loading your 3awedlou…" />
        <LoadingState />
      </>
    )
  }
  if (error && !view) return <ErrorState message={error} onRetry={refresh} />
  if (!view) {
    return (
      <>
        <PageHeader eyebrow="Your recycling machine" title="No machine linked yet." subtitle="Your account has no machine assigned. Ask an operator to register your 3awedlou unit." />
        <ErrorState message="No machine is associated with this account." />
      </>
    )
  }

  const { machine, telemetry, sensors, activeSession } = view
  const [temp, motor, fan] = sensors

  const statusTone =
    machine.status === 'extruding' || machine.status === 'heating'
      ? 'success'
      : machine.status === 'paused'
        ? 'warning'
        : machine.status === 'error' || machine.status === 'offline'
          ? 'danger'
          : 'neutral'
  const statusLabel =
    machine.status === 'extruding'
      ? 'Extruding'
      : machine.status === 'heating'
        ? 'Heating'
        : machine.status === 'paused'
          ? 'Paused'
          : machine.status === 'error'
            ? 'Error'
            : machine.status === 'offline'
              ? 'Offline'
              : 'Idle'

  const connected = machine.status !== 'offline'

  // Session progress: elapsed time against the loaded PET input (the backend
  // reports materialOutput only after the run ends — no fabricated progress).
  const elapsedMin = activeSession
    ? Math.max(0, (Date.now() - new Date(activeSession.startedAt).getTime()) / 60000)
    : 0

  // PET recycled from real recycling records.
  const petKg = (view.recyclingTotals.inputGrams ?? 0) / 1000
  const filamentKg = (view.recyclingTotals.outputGrams ?? 0) / 1000

  // Temperature trend from REAL telemetry (oldest → newest).
  const tempPoints = view.recentTelemetry
    .map((s) => s.temperature)
    .filter((v): v is number => v !== null)
  const tempSeries = tempPoints.slice(-24).map((v, i) => ({
    x: `${i}`,
    y: Number(v.toFixed(1)),
  }))

  const impactCards = [
    { icon: <BottleIcon size={20} />, value: `${petKg.toFixed(1)} kg`, label: 'PET recycled', to: 'impact' as const },
    { icon: <SpoolIcon size={20} />, value: `${filamentKg.toFixed(1)} kg`, label: 'filament produced', to: 'filament' as const },
    { icon: <LeafIcon size={20} />, value: `≈ ${Math.max(0, Math.round(petKg * 25))}`, label: 'bottles equivalent', to: 'impact' as const },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Your recycling machine"
        title={machine.status === 'idle' || machine.status === 'offline' ? 'Machine is on standby.' : 'Good to see you.'}
        subtitle={
          machine.status === 'offline'
            ? `Last seen ${machine.lastSeenAt ? timeAgo(machine.lastSeenAt) : 'never'}.`
            : 'Your 3awedlou is connected and reporting.'
        }
        actions={<ConnPill connected={connected} machineName={machine.identifier} transport={realtimeMode} />}
      />

      <div className="stack">
        {/* Gauges row */}
        <div className="grid grid-3">
          <Card>
            <CardHeader icon={<GaugeDot label="°C" />} title="Extruder Temperature" />
            <div className="card-body" style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
              <Gauge value={temp.value} max={temp.max} display={telemetry?.temperature != null ? String(Math.round(temp.value)) : '—'} sublabel={`/ ${Math.round(temp.target)}°C`} />
              <div className="gauge-side">
                <div className="gauge-side-item">
                  <span className="muted" style={{ fontSize: 12.5 }}>Target</span>
                  <strong>{telemetry?.targetTemperature != null ? `${Math.round(temp.target)}°C` : '—'}</strong>
                </div>
                <div className="gauge-side-item">
                  <span className="muted" style={{ fontSize: 12.5 }}>Status</span>
                  <StatusBadge tone={machine.status === 'heating' ? 'warning' : connected ? 'success' : 'danger'} pulse={connected}>
                    {machine.status === 'heating' ? 'Heating' : machine.status === 'offline' ? 'Offline' : connected ? 'Stable' : '—'}
                  </StatusBadge>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader icon={<GaugeDot label="RPM" />} title="Motor Speed" />
            <div className="card-body" style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
              <Gauge value={motor.value} max={motor.max} display={telemetry?.motorSpeed != null ? String(Math.round(motor.value)) : '—'} sublabel="RPM" />
              <div className="gauge-side">
                <div className="gauge-side-item">
                  <span className="muted" style={{ fontSize: 12.5 }}>Motor</span>
                  <strong>{telemetry?.motorState == null ? '—' : telemetry.motorState ? 'On' : 'Off'}</strong>
                </div>
                <div className="gauge-side-item">
                  <span className="muted" style={{ fontSize: 12.5 }}>Status</span>
                  <StatusBadge tone={connected ? 'success' : 'danger'} pulse={connected}>
                    {statusLabel}
                  </StatusBadge>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader icon={<GaugeDot label="%" />} title="Cooling Fan" />
            <div className="card-body" style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
              <Gauge value={fan.value} max={fan.max} display={telemetry?.fanState == null ? '—' : `${Math.round(fan.value)}%`} sublabel="of max" />
              <div className="gauge-side">
                <div className="gauge-side-item">
                  <span className="muted" style={{ fontSize: 12.5 }}>Fan</span>
                  <strong>{telemetry?.fanState == null ? '—' : telemetry.fanState ? 'On' : 'Off'}</strong>
                </div>
                <div className="gauge-side-item">
                  <span className="muted" style={{ fontSize: 12.5 }}>Filament</span>
                  <strong>{telemetry?.filamentDiameter != null ? `${telemetry.filamentDiameter.toFixed(2)} mm` : '—'}</strong>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Live session card */}
        <Card>
          <div className="card-header card-header-offset">
            <div className="row" style={{ gap: 12 }}>
              <div className="session-play">
                <PlayIcon size={17} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {activeSession ? 'Session running' : 'No active session'}
                  <StatusBadge tone={statusTone} pulse={connected && machine.status !== 'idle'}>
                    {statusLabel}
                  </StatusBadge>
                </div>
                <div className="card-subtitle">
                  {activeSession
                    ? `Started ${timeAgo(activeSession.startedAt)} · running for ${formatDuration(elapsedMin)}`
                    : 'Start a session from the Machine page'}
                </div>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="muted" style={{ fontSize: 13 }}>
                {activeSession?.materialInput != null ? `${Math.round(activeSession.materialInput)} g PET loaded` : '—'}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => navigateTo('machine')}>
                Machine <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>
          <div className="card-body">
            <div className="row" style={{ gap: 8 }}>
              <InfoIcon size={16} style={{ color: 'var(--brand)' }} />
              <span style={{ fontSize: 13.5, color: 'var(--text-2)' }}>
                {activeSession
                  ? 'Output totals are recorded by the machine when the session completes.'
                  : connected
                    ? 'Load PET and start a session to begin recycling.'
                    : 'The machine is offline — session control is disabled until it reports again.'}
              </span>
            </div>
          </div>
        </Card>

        {/* Today stats */}
        <div className="grid grid-3">
          {impactCards.map((c) => (
            <button
              key={c.label}
              className="card stat-card"
              onClick={() => navigateTo(c.to)}
            >
              <span className="stat-card-icon">{c.icon}</span>
              <span className="stat-card-text">
                <span className="stat-value">{c.value}</span>
                <span className="stat-label">{c.label}</span>
              </span>
              <ChevronRightIcon size={18} className="stat-card-chevron" />
            </button>
          ))}
        </div>

        {/* Activity + chart */}
        <div className="grid grid-2-1">
          <Card>
            <CardHeader
              icon={<ActivityDot />}
              title="Recent Activity"
              actions={
                <button className="btn btn-ghost btn-sm" onClick={() => navigateTo('history')}>
                  View all <ChevronRightIcon size={14} />
                </button>
              }
            />
            <div className="card-body card-body-flush" style={{ paddingTop: 4 }}>
              {alerts.length === 0 ? (
                <div className="muted" style={{ padding: '18px 20px', fontSize: 13.5 }}>
                  Nothing to report — the machine is behaving normally.
                </div>
              ) : (
                alerts.slice(0, 5).map((ev) => {
                  const Icon = ACTIVITY_ICON[ev.severity]
                  return (
                    <div key={ev.id} className="activity-row">
                      <span className="timeline-icon success">
                        <Icon size={15} />
                      </span>
                      <div className="timeline-content">
                        <div>
                          <div className="timeline-title">{ev.title}</div>
                          <div className="timeline-meta">{ev.message}</div>
                        </div>
                        <span className="timeline-time">{timeAgo(ev.date)}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={<GaugeDot label="°C" />}
              title="Extruder temperature trend"
              subtitle={tempSeries.length > 0 ? `Last ${tempSeries.length} reported samples` : 'Awaiting telemetry'}
            />
            <div className="card-body" style={{ paddingTop: 8 }}>
              {tempSeries.length > 1 ? (
                <LineChart
                  data={tempSeries}
                  height={210}
                  formatY={(v) => v.toFixed(0)}
                />
              ) : (
                <div className="muted" style={{ fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
                  No telemetry samples yet. The machine reports automatically once connected.
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}

function GaugeDot({ label }: { label: string }) {
  return <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
}

function ActivityDot() {
  return <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>•</span>
}
