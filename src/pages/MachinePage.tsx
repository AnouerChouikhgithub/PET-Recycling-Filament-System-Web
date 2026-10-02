import { useState } from 'react'
import {
  ActivityIcon,
  CpuIcon,
  FanIcon,
  InfoIcon,
  LinkIcon,
  PauseIcon,
  PlayIcon,
  SpoolIcon,
  StopIcon,
  ThermometerIcon,
  WarningIcon,
  CheckCircleIcon,
  CpuIcon as MotorIcon,
} from '../components/icons'
import { Card, CardHeader } from '../components/ui/Card'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import { PageHeader, ConnPill } from '../components/layout/PageHeader'
import { useMachine } from '../contexts/MachineContext'
import { useToast } from '../contexts/ToastContext'
import { timeAgo } from '../lib/format'
import { ApiError } from '../api/client'

const SUB_ICON = {
  heater: ThermometerIcon,
  motor: MotorIcon,
  cooling: FanIcon,
  spooler: SpoolIcon,
}

export function MachinePage() {
  const {
    view,
    loading,
    error,
    alerts,
    realtimeMode,
    sendCommand,
  } = useMachine()
  const toast = useToast()

  const [confirmStop, setConfirmStop] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const machine = view?.machine
  const telemetry = view?.telemetry ?? null
  const activeSession = view?.activeSession ?? null
  const connected = machine ? machine.status !== 'offline' : false

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label)
    try {
      await action()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message
      toast.push('error', 'Command rejected', msg)
    } finally {
      setBusy(null)
    }
  }

  const pause = () => run('pause', () => sendCommand('pause'))
  const resume = () => run('resume', () => sendCommand('resume'))
  const stop = () =>
    run('stop', async () => {
      setConfirmStop(false)
      await sendCommand('stop')
      toast.push('success', 'Stop command accepted', 'The machine will wind down and report back.')
    })

  if (loading && !view) {
    return (
      <>
        <PageHeader eyebrow="Machine control" title="Loading machine…" />
        <Card><div className="card-body"><div className="spinner" /></div></Card>
      </>
    )
  }
  if (error && !view) {
    return (
      <>
        <PageHeader eyebrow="Machine control" title="Machine" />
        <Card><div className="card-body" style={{ padding: 20 }}>Failed to load: {error}</div></Card>
      </>
    )
  }
  if (!machine || !view) {
    return (
      <>
        <PageHeader eyebrow="Machine control" title="No machine linked." />
        <Card><div className="card-body" style={{ padding: 20 }}>Your account has no machine assigned yet.</div></Card>
      </>
    )
  }

  const status = machine.status
  const running = status === 'extruding' || status === 'heating'
  const paused = status === 'paused'
  const offline = status === 'offline'
  const activeWarnings = alerts.filter((a) => a.severity === 'warning' || a.severity === 'error')

  const controlDisabled = offline || busy !== null

  return (
    <>
      <PageHeader
        eyebrow="Machine control"
        title={offline ? 'Machine is offline.' : running ? 'Your machine is running smoothly.' : paused ? 'Session paused.' : 'Machine is on standby.'}
        subtitle="Live data from your 3awedlou, delivered through the backend API."
        actions={<ConnPill connected={connected} machineName={machine.identifier} transport={realtimeMode} />}
      />

      <div className="stack">
        {/* Connection banner (replaces the old demo banner) */}
        <div className={`demo-banner ${offline ? '' : ''}`}>
          <div className="demo-banner-left">
            {offline ? <WarningIcon size={19} /> : <InfoIcon size={19} />}
            <span>
              {offline ? (
                <>
                  <strong>Machine offline.</strong> Last report{' '}
                  {machine.lastSeenAt ? timeAgo(machine.lastSeenAt) : 'never'}. Commands are disabled until it reconnects.
                </>
              ) : (
                <>
                  <strong>Connected via 3awedlou backend.</strong> Data refreshes automatically — reported status “{machine.reportedStatus}”.
                </>
              )}
            </span>
          </div>
        </div>

        {/* Live sensor readings (real telemetry) */}
        <Card>
          <CardHeader
            icon={<ActivityIcon size={18} />}
            title="Live Sensor Readings"
            subtitle={telemetry ? `Last sample ${timeAgo(telemetry.recordedAt)}` : 'Awaiting telemetry…'}
            actions={
              connected ? (
                <StatusBadge tone="success" pulse>Reporting</StatusBadge>
              ) : (
                <StatusBadge tone="danger">Offline</StatusBadge>
              )
            }
          />
          <div className="card-body card-body-flush" style={{ paddingTop: 4 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Value</th>
                    <th className="hide-sm">Last 48 samples</th>
                    <th className="hide-sm">Target</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {view.sensors.map((s) => {
                    const tone = s.status === 'nominal' ? 'success' : s.status === 'warning' ? 'warning' : 'danger'
                    const decimals = s.decimals ?? 0
                    const noData = s.history.length === 0
                    return (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>{s.label}</td>
                        <td className="td-num" style={{ fontSize: 15 }}>
                          {noData ? '—' : `${s.value.toFixed(decimals)} ${s.unit}`}
                        </td>
                        <td className="hide-sm">
                          {noData ? (
                            <span className="muted" style={{ fontSize: 12 }}>no samples</span>
                          ) : (
                            <span className="sensor-spark" aria-hidden>
                              {s.history.slice(-16).map((v, i, arr) => {
                                const lo = Math.min(...arr)
                                const hi = Math.max(...arr, lo + 0.001)
                                const hPct = 20 + ((v - lo) / (hi - lo)) * 80
                                return <span key={i} style={{ height: `${hPct}%` }} />
                              })}
                            </span>
                          )}
                        </td>
                        <td className="td-muted hide-sm">
                          {noData ? '—' : `${s.target.toFixed(decimals)} ${s.unit}`}
                        </td>
                        <td>
                          <StatusBadge tone={noData ? 'neutral' : tone} pulse={!noData && connected}>
                            {noData ? '—' : s.status === 'nominal' ? 'Nominal' : s.status === 'warning' ? 'Drifting' : 'Check'}
                          </StatusBadge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        {/* Subsystems */}
        <Card>
          <CardHeader icon={<CpuIcon size={18} />} title="Subsystem Status" subtitle="Derived from the latest reported telemetry" />
          <div className="card-body" style={{ paddingTop: 4 }}>
            <div className="grid grid-4">
              {view.subsystems.map((sub) => {
                const Icon = SUB_ICON[sub.key]
                const tone =
                  sub.state === 'on' ? 'success' : sub.state === 'fault' ? 'danger' : 'neutral'
                return (
                  <div key={sub.key} className={`subsystem-tile ${sub.state === 'off' ? 'off' : ''} ${sub.state === 'fault' ? 'fault' : ''}`}>
                    <span className="subsystem-tile-icon">
                      <Icon size={19} />
                    </span>
                    <div>
                      <div className="subsystem-tile-title">{sub.label}</div>
                      <StatusBadge tone={tone} pulse={sub.state === 'on'}>
                        {sub.state === 'on' ? 'Active' : sub.state === 'fault' ? 'Fault' : 'Off'}
                      </StatusBadge>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>
              Machine “{machine.name}” · reported status {machine.reportedStatus} · last seen{' '}
              {machine.lastSeenAt ? timeAgo(machine.lastSeenAt) : 'never'}
            </div>
          </div>
        </Card>

        {/* Session control — guarded commands to the backend */}
        <Card>
          <CardHeader
            icon={<PlayIcon size={16} />}
            title="Session Control"
            subtitle="Commands are validated by the backend before reaching the machine."
          />
          <div className="card-body">
            <div className="session-control-row">
              <div className="field" style={{ maxWidth: 320 }}>
                <label className="field-label">Current session</label>
                <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                  {activeSession
                    ? `Started ${timeAgo(activeSession.startedAt)}${activeSession.materialInput != null ? ` · ${Math.round(activeSession.materialInput)} g PET loaded` : ''}${activeSession.status === 'paused' ? ' · paused' : ''}`
                    : 'No active session on this machine.'}
                </div>
              </div>

              <div className="session-control-actions">
                {paused ? (
                  <Button onClick={resume} disabled={controlDisabled}>
                    <PlayIcon size={15} /> {busy === 'resume' ? 'Sending…' : 'Resume'}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={pause} disabled={controlDisabled || !running}>
                    <PauseIcon size={15} /> {busy === 'pause' ? 'Sending…' : 'Pause'}
                  </Button>
                )}
                <Button variant="danger" onClick={() => setConfirmStop(true)} disabled={controlDisabled || (!running && !paused)}>
                  <span className="btn-dot" /> Stop
                </Button>
              </div>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <LinkIcon size={14} style={{ color: 'var(--text-3)' }} />
              <span className="muted" style={{ fontSize: 12.5 }}>
                Session start from the web dashboard arrives in the firmware phase — the command
                pipeline (start · pause · resume · stop · setTargetTemperature · setMotorSpeed · setFan) is live end-to-end.
              </span>
            </div>
          </div>
        </Card>

        {/* Warnings */}
        <Card>
          <CardHeader
            icon={<WarningIcon size={18} />}
            title="Warnings & Errors"
            actions={<span className="demo-tag">Derived from machine state</span>}
          />
          <div className="card-body" style={{ paddingTop: 4 }}>
            {activeWarnings.length === 0 ? (
              <div className="ok-banner">
                <CheckCircleIcon size={20} />
                <div>
                  <strong>No warnings — all systems nominal.</strong>
                  <div className="muted" style={{ fontSize: 13 }}>
                    We’ll show any warnings or errors here if something needs attention.
                  </div>
                </div>
              </div>
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {activeWarnings.map((a) => (
                  <div key={a.id} className={`alert-banner alert-banner--${a.severity === 'error' ? 'error' : 'warning'}`}>
                    <WarningIcon size={18} />
                    <div>
                      <strong>{a.title}</strong>
                      <div className="muted" style={{ fontSize: 13 }}>{a.message}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{timeAgo(a.date)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Stop confirmation */}
      {confirmStop && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setConfirmStop(false)}>
          <div className="modal modal-sm" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div className="modal-title">Stop this session?</div>
            </div>
            <div className="modal-body">
              A stop command will be validated by the backend and sent to the machine. The heater
              powers down and the spooled filament is recorded when the machine confirms.
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmStop(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={stop} disabled={busy === 'stop'}>
                <StopIcon size={14} /> {busy === 'stop' ? 'Sending…' : 'Stop session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
