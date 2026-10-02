import { useMemo, useState } from 'react'
import {
  CheckCircleIcon,
  DownloadIcon,
  InfoIcon,
  WarningIcon,
  AlertOctagonIcon,
  ActivityIcon,
} from '../components/icons'
import { Card } from '../components/ui/Card'
import { DataTable } from '../components/ui/DataTable'
import type { Column } from '../components/ui/DataTable'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { ErrorState, LoadingState } from '../components/ui/states'
import { PageHeader } from '../components/layout/PageHeader'
import { useAsync } from '../lib/useAsync'
import { machinesApi } from '../api/machines'
import { useMachine } from '../contexts/MachineContext'
import { exportCsv } from '../lib/csv'
import { formatDate, formatDateTime, formatDuration, timeAgo } from '../lib/format'
import type { FilamentProduction, MachineSession, MachineTelemetry } from '../types/api'

type TabKey = 'sessions' | 'batches' | 'telemetry' | 'alerts'

export function HistoryPage() {
  const { selectedId, alerts } = useMachine()
  const sessionsQ = useAsync(
    () => (selectedId ? machinesApi.sessions(selectedId, { limit: 100 }) : Promise.resolve([])),
    [selectedId],
  )
  const batchesQ = useAsync(
    () => (selectedId ? machinesApi.production(selectedId, { limit: 100 }) : Promise.resolve([])),
    [selectedId],
  )
  const telemetryQ = useAsync(
    () => (selectedId ? machinesApi.telemetryHistory(selectedId, { limit: 50 }) : Promise.resolve([])),
    [selectedId],
  )

  const [tab, setTab] = useState<TabKey>('sessions')
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [detail, setDetail] = useState<MachineSession | null>(null)

  const sessions = sessionsQ.data ?? []
  const batches = batchesQ.data ?? []
  const telemetry = telemetryQ.data ?? []

  const loading = sessionsQ.loading || batchesQ.loading
  const error = sessionsQ.error ?? batchesQ.error

  const sortedSessions = useMemo(() => {
    const rows = [...sessions]
    const dir = sort.dir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      switch (sort.key) {
        case 'id':
          return a.id.localeCompare(b.id) * dir
        case 'materialInput':
          return ((a.materialInput ?? 0) - (b.materialInput ?? 0)) * dir
        case 'materialOutput':
          return ((a.materialOutput ?? 0) - (b.materialOutput ?? 0)) * dir
        case 'status':
          return a.status.localeCompare(b.status) * dir
        default:
          return a.startedAt.localeCompare(b.startedAt) * dir
      }
    })
    return rows
  }, [sessions, sort])

  const sortedBatches = useMemo(() => {
    const rows = [...batches]
    const dir = sort.dir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      switch (sort.key) {
        case 'batchCode':
          return a.batchCode.localeCompare(b.batchCode) * dir
        case 'color':
          return a.color.localeCompare(b.color) * dir
        case 'weightGrams':
          return (a.weightGrams - b.weightGrams) * dir
        default:
          return a.producedAt.localeCompare(b.producedAt) * dir
      }
    })
    return rows
  }, [batches, sort])

  const onSortChange = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))

  const sessionColumns: Column<MachineSession>[] = [
    { key: 'id', header: 'Session', render: (s) => <span className="session-id-badge">#{s.id.slice(0, 6)}</span> },
    {
      key: 'date',
      header: 'Started',
      sortable: true,
      render: (s) => (
        <div>
          <div style={{ fontWeight: 600 }}>{formatDate(s.startedAt)}</div>
          <div className="td-muted" style={{ fontSize: 12 }}>{formatDateTime(s.startedAt).split('·')[1]}</div>
        </div>
      ),
    },
    { key: 'materialInput', header: 'PET Input', sortable: true, align: 'right', render: (s) => (s.materialInput != null ? `${Math.round(s.materialInput)} g` : '—') },
    {
      key: 'materialOutput',
      header: 'Filament Output',
      sortable: true,
      align: 'right',
      hideOnMobile: true,
      render: (s) => (s.materialOutput != null ? `${Math.round(s.materialOutput)} g` : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (s) =>
        s.status === 'completed' ? (
          <StatusBadge tone="success">Completed</StatusBadge>
        ) : s.status === 'in_progress' ? (
          <StatusBadge tone="info" pulse>In progress</StatusBadge>
        ) : s.status === 'paused' ? (
          <StatusBadge tone="warning">Paused</StatusBadge>
        ) : (
          <StatusBadge tone="danger">Failed</StatusBadge>
        ),
    },
    {
      key: 'duration',
      header: 'Duration',
      hideOnMobile: true,
      render: (s) => <span className="td-muted">{s.durationMinutes != null ? formatDuration(s.durationMinutes) : '—'}</span>,
    },
  ]

  const batchColumns: Column<FilamentProduction>[] = [
    { key: 'batchCode', header: 'Batch', sortable: true, render: (b) => <span className="session-id-badge">{b.batchCode}</span> },
    {
      key: 'color',
      header: 'Color',
      sortable: true,
      render: (b) => (
        <span className="row" style={{ gap: 8 }}>
          <span className="color-dot" style={{ background: b.colorHex }} />
          {b.color}
        </span>
      ),
    },
    { key: 'diameter', header: 'Diameter', align: 'right', hideOnMobile: true, render: (b) => (b.diameterActual != null ? `${b.diameterActual.toFixed(2)} mm` : '—') },
    { key: 'weightGrams', header: 'Weight', sortable: true, align: 'right', render: (b) => `${Math.round(b.weightGrams)} g` },
    { key: 'date', header: 'Created', sortable: true, render: (b) => <span className="td-muted">{formatDate(b.producedAt)}</span> },
    {
      key: 'quality',
      header: 'Quality',
      hideOnMobile: true,
      render: (b) => (
        <StatusBadge tone={b.quality === 'excellent' ? 'success' : b.quality === 'good' ? 'info' : b.quality === 'fair' ? 'warning' : 'danger'}>
          {b.quality}
        </StatusBadge>
      ),
    },
  ]

  const handleExport = () => {
    exportCsv(
      `3awedlou-history-${tab}-${new Date().toISOString().slice(0, 10)}.csv`,
      tab === 'sessions'
        ? ['Session', 'Started', 'PET (g)', 'Filament (g)', 'Duration (min)', 'Status']
        : ['Batch', 'Color', 'Diameter (mm)', 'Weight (g)', 'Created', 'Quality'],
      tab === 'sessions'
        ? sortedSessions.map((s) => [s.id.slice(0, 8), formatDateTime(s.startedAt), s.materialInput ?? '', s.materialOutput ?? '', s.durationMinutes != null ? Math.round(s.durationMinutes) : '', s.status])
        : sortedBatches.map((b) => [b.batchCode, b.color, b.diameterActual ?? '', Math.round(b.weightGrams), formatDateTime(b.producedAt), b.quality]),
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="History"
        title="Full activity log"
        subtitle="Everything the backend has recorded — sessions, batches, telemetry and alerts."
        actions={
          <Button variant="secondary" onClick={handleExport}>
            <DownloadIcon size={16} /> Export view
          </Button>
        }
      />

      <div className="tabs" style={{ marginBottom: 16 }}>
        {(
          [
            ['sessions', `Sessions (${sessions.length})`],
            ['batches', `Batches (${batches.length})`],
            ['telemetry', 'Telemetry'],
            ['alerts', `Alerts (${alerts.length})`],
          ] as [TabKey, string][]
        ).map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState label="Loading history…" />
      ) : error ? (
        <ErrorState message={(error as Error).message} onRetry={sessionsQ.retry} />
      ) : (
        <Card>
          <div className="card-body card-body-flush" style={{ paddingTop: 0 }}>
            {tab === 'sessions' && (
              <DataTable
                columns={sessionColumns}
                rows={sortedSessions}
                rowKey={(s) => s.id}
                onRowClick={setDetail}
                sort={sort}
                onSortChange={onSortChange}
                emptyTitle="No sessions yet"
              />
            )}
            {tab === 'batches' && (
              <DataTable
                columns={batchColumns}
                rows={sortedBatches}
                rowKey={(b) => b.id}
                sort={sort}
                onSortChange={onSortChange}
                emptyTitle="No batches yet"
              />
            )}
            {tab === 'telemetry' && <TelemetryList samples={telemetry} />}
            {tab === 'alerts' && (
              <div>
                {alerts.length === 0 ? (
                  <div className="muted" style={{ padding: 20, fontSize: 13.5 }}>No alerts — all clear.</div>
                ) : (
                  alerts.map((a) => {
                    const tone = a.severity === 'error' ? 'danger' : a.severity === 'warning' ? 'warning' : a.severity === 'success' ? 'success' : 'info'
                    const Icon = a.severity === 'error' ? AlertOctagonIcon : a.severity === 'warning' ? WarningIcon : a.severity === 'success' ? CheckCircleIcon : InfoIcon
                    return (
                      <div key={a.id} className="alert-row">
                        <span className={`timeline-icon ${tone === 'danger' ? '' : tone}`}>
                          <Icon size={15} />
                        </span>
                        <div className="timeline-content">
                          <div>
                            <div className="timeline-title">{a.title}</div>
                            <div className="timeline-meta">{a.message}</div>
                          </div>
                          <span className="timeline-time">{timeAgo(a.date)}</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      <Modal open={detail != null} onClose={() => setDetail(null)} title={detail ? `Session ${detail.id.slice(0, 8)}` : ''} size="sm">
        {detail && (
          <div className="stack" style={{ gap: 10 }}>
            <HistRow k="Started" v={formatDateTime(detail.startedAt)} />
            <HistRow k="Ended" v={detail.endedAt != null ? formatDateTime(detail.endedAt) : '—'} />
            <HistRow k="Status" v={detail.status.replace('_', ' ')} />
            <HistRow k="PET input" v={detail.materialInput != null ? `${Math.round(detail.materialInput)} g` : '—'} />
            <HistRow k="Filament output" v={detail.materialOutput != null ? `${Math.round(detail.materialOutput)} g` : '—'} />
            <HistRow k="Duration" v={detail.durationMinutes != null ? formatDuration(detail.durationMinutes) : '—'} />
            {detail.notes && <HistRow k="Notes" v={detail.notes} />}
          </div>
        )}
      </Modal>

      <div style={{ height: 8 }} />
    </>
  )
}

/** Telemetry tab — raw history straight from the API. */
function TelemetryList({ samples }: { samples: MachineTelemetry[] }) {
  if (samples.length === 0) {
    return <div className="muted" style={{ padding: 20, fontSize: 13.5 }}>No telemetry recorded yet.</div>
  }
  return (
    <div>
      {samples.map((t) => (
        <div key={t.id} className="alert-row">
          <span className="timeline-icon">
            <ActivityIcon size={15} />
          </span>
          <div className="timeline-content">
            <div>
              <div className="timeline-title">
                {t.temperature != null ? `${t.temperature.toFixed(1)}°C` : '—'}
                {t.targetTemperature != null ? ` → ${Math.round(t.targetTemperature)}°C` : ''}
                {t.motorSpeed != null ? ` · ${t.motorSpeed} RPM` : ''}
                {t.filamentDiameter != null ? ` · ${t.filamentDiameter.toFixed(2)} mm` : ''}
              </div>
              <div className="timeline-meta">
                heater {t.heaterState ? 'on' : 'off'} · motor {t.motorState ? 'on' : 'off'} · fan {t.fanState ? 'on' : 'off'}
                {t.energyConsumption != null ? ` · ${t.energyConsumption.toFixed(2)} kWh` : ''}
              </div>
            </div>
            <span className="timeline-time">{timeAgo(t.recordedAt)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function HistRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="row-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
      <span className="muted" style={{ fontSize: 13.5 }}>{k}</span>
      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{v}</span>
    </div>
  )
}
