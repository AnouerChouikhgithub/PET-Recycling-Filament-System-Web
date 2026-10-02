import { useMemo, useState } from 'react'
import {
  CalendarIcon,
  ChevronRightIcon,
  DownloadIcon,
  FileIcon,
  SearchIcon,
  SpoolIcon,
  BottleIcon,
} from '../components/icons'
import { Card, CardHeader } from '../components/ui/Card'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states'
import { PageHeader, ConnPill } from '../components/layout/PageHeader'
import { useAsync } from '../lib/useAsync'
import { machinesApi } from '../api/machines'
import { useMachine } from '../contexts/MachineContext'
import { useToast } from '../contexts/ToastContext'
import { exportCsv } from '../lib/csv'
import { formatDate, formatDateTime } from '../lib/format'
import { ApiError } from '../api/client'
import type { MachineSession } from '../types/api'

type RangeKey = 'all' | 'week' | 'month'

function withinRange(iso: string, range: RangeKey): boolean {
  if (range === 'all') return true
  const days = range === 'week' ? 7 : 30
  return Date.now() - new Date(iso).getTime() <= days * 24 * 3600 * 1000
}

export function RecyclingPage() {
  const { view, selectedId, realtimeMode } = useMachine()
  const toast = useToast()

  const [range, setRange] = useState<RangeKey>('all')
  const [colorFilter, setColorFilter] = useState<string>('All')
  const [query, setQuery] = useState('')
  const [detailSession, setDetailSession] = useState<MachineSession | null>(null)
  const [detailBatch, setDetailBatch] = useState<(typeof batchesRows)[number] | null>(null)
  const [exporting, setExporting] = useState(false)

  const machineId = selectedId

  const sessionsQ = useAsync(
    () => (machineId ? machinesApi.sessions(machineId, { limit: 100 }) : Promise.resolve([])),
    [machineId],
  )
  const batchesQ = useAsync(
    () => (machineId ? machinesApi.production(machineId, { limit: 100 }) : Promise.resolve([])),
    [machineId],
  )
  const recyclingQ = useAsync(
    () => (machineId ? machinesApi.recycling(machineId, { limit: 1 }) : Promise.resolve({ records: [], totals: { records: 0, inputGrams: null, outputGrams: null } })),
    [machineId],
  )

  const sessionsRows = sessionsQ.data ?? []
  const batchesRows = batchesQ.data ?? []
  const totals = view?.recyclingTotals ?? recyclingQ.data?.totals ?? { records: 0, inputGrams: null, outputGrams: null }

  const filteredSessions = useMemo(() => {
    return sessionsRows
      .filter((s) => withinRange(s.startedAt, range))
      .filter((s) => {
        if (!query) return true
        const q = query.toLowerCase()
        return s.id.toLowerCase().includes(q) || (s.notes ?? '').toLowerCase().includes(q)
      })
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }, [sessionsRows, range, query])

  const filteredBatches = useMemo(() => {
    return batchesRows
      .filter((b) => withinRange(b.producedAt, range))
      .filter((b) => colorFilter === 'All' || b.color === colorFilter)
      .filter((b) => {
        if (!query) return true
        const q = query.toLowerCase()
        return b.batchCode.toLowerCase().includes(q) || b.color.toLowerCase().includes(q)
      })
      .sort((a, b) => b.producedAt.localeCompare(a.producedAt))
  }, [batchesRows, range, colorFilter, query])

  const colors = useMemo(
    () => ['All', ...Array.from(new Set(batchesRows.map((b) => b.color)))],
    [batchesRows],
  )

  const totalPetKg = (totals.inputGrams ?? 0) / 1000
  const totalFilKg = (totals.outputGrams ?? 0) / 1000

  const handleExport = async () => {
    setExporting(true)
    try {
      exportCsv(
        `3awedlou-recycling-${new Date().toISOString().slice(0, 10)}.csv`,
        ['Session', 'Started', 'PET Input (g)', 'Filament Output (g)', 'Duration (min)', 'Status'],
        filteredSessions.map((s) => [
          s.id.slice(0, 8),
          formatDateTime(s.startedAt),
          s.materialInput ?? '',
          s.materialOutput ?? '',
          s.durationMinutes != null ? Math.round(s.durationMinutes) : '',
          s.status,
        ]),
      )
      toast.push('success', 'Report exported', 'CSV downloaded to your device.')
    } catch (e) {
      toast.push('error', 'Export failed', (e as Error).message)
    } finally {
      setExporting(false)
    }
  }

  const loading = sessionsQ.loading || batchesQ.loading
  const error = sessionsQ.error ?? batchesQ.error

  return (
    <>
      <PageHeader
        eyebrow="Recycling"
        title="Your recycling history"
        subtitle="Past sessions and filament batches recorded by the backend."
        actions={
          <ConnPill
            connected={(view?.machine.status ?? 'offline') !== 'offline'}
            machineName={view?.machine.identifier}
            transport={realtimeMode}
          />
        }
      />

      {/* Totals — real recycling records from the API */}
      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card row" style={{ gap: 14, padding: '18px 20px' }}>
          <span className="stat-card-icon"><BottleIcon size={21} /></span>
          <div>
            <div className="stat-value">{totalPetKg.toFixed(1)} kg</div>
            <div className="stat-label">PET recycled (measured)</div>
          </div>
        </div>
        <div className="card row" style={{ gap: 14, padding: '18px 20px' }}>
          <span className="stat-card-icon"><SpoolIcon size={21} /></span>
          <div>
            <div className="stat-value">{totalFilKg.toFixed(1)} kg</div>
            <div className="stat-label">filament produced</div>
          </div>
        </div>
        <div className="card row" style={{ gap: 14, padding: '18px 20px' }}>
          <span className="stat-card-icon"><CalendarIcon size={21} /></span>
          <div>
            <div className="stat-value">{totals.records}</div>
            <div className="stat-label">recycling records</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div className="row-between">
          <div className="chips">
            {(
              [
                { k: 'all', label: 'All' },
                { k: 'week', label: 'This Week' },
                { k: 'month', label: 'This Month' },
              ] as { k: RangeKey; label: string }[]
            ).map((r) => (
              <button key={r.k} className={`chip ${range === r.k ? 'active' : ''}`} onClick={() => setRange(r.k)}>
                {r.label}
              </button>
            ))}
            <select
              className="select"
              style={{ width: 'auto', padding: '7px 34px 7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600 }}
              value={colorFilter}
              onChange={(e) => setColorFilter(e.target.value)}
              aria-label="Filter batches by color"
            >
              {colors.map((c) => (
                <option key={c} value={c}>{c === 'All' ? 'By Color' : c}</option>
              ))}
            </select>
          </div>
          <div className="search-box">
            <SearchIcon size={16} />
            <input
              className="input"
              placeholder="Search sessions or batches…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading history…" />
      ) : error ? (
        <ErrorState message={(error as ApiError).message} onRetry={() => { sessionsQ.retry(); batchesQ.retry(); recyclingQ.retry() }} />
      ) : (
        <div className="recycle-grid">
          {/* Sessions table */}
          <Card>
            <CardHeader
              icon={<FileIcon size={17} />}
              title="Recycling Sessions"
              actions={<span className="muted" style={{ fontSize: 13 }}>{filteredSessions.length} shown</span>}
            />
            <div className="card-body card-body-flush" style={{ paddingTop: 4 }}>
              {filteredSessions.length === 0 ? (
                <EmptyState title="No sessions yet" desc="Sessions appear here once the machine runs." />
              ) : (
                filteredSessions.slice(0, 8).map((s) => (
                  <button
                    key={s.id}
                    className="list-row"
                    onClick={() => setDetailSession(s)}
                  >
                    <span className="session-id-badge">#{s.id.slice(0, 6)}</span>
                    <span className="list-col hide-sm">{formatDate(s.startedAt)}</span>
                    <span className="td-num">{s.materialInput != null ? `${Math.round(s.materialInput)} g` : '—'}</span>
                    <span className="td-num hide-sm">{s.materialOutput != null ? `${Math.round(s.materialOutput)} g` : '—'}</span>
                    <span>
                      {s.status === 'completed' ? (
                        <StatusBadge tone="success">Completed</StatusBadge>
                      ) : s.status === 'in_progress' ? (
                        <StatusBadge tone="info" pulse>In progress</StatusBadge>
                      ) : s.status === 'paused' ? (
                        <StatusBadge tone="warning">Paused</StatusBadge>
                      ) : (
                        <StatusBadge tone="danger">Failed</StatusBadge>
                      )}
                    </span>
                    <ChevronRightIcon size={15} style={{ color: 'var(--text-3)' }} />
                  </button>
                ))
              )}
              {filteredSessions.length > 8 && (
                <div style={{ padding: '12px 20px' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => toast.push('info', 'Full history', 'See the History page for the complete log.')}>
                    View all sessions <ChevronRightIcon size={13} />
                  </button>
                </div>
              )}
            </div>
          </Card>

          {/* Batches table */}
          <Card>
            <CardHeader
              icon={<SpoolIcon size={17} />}
              title="Filament Batches"
              actions={<span className="muted" style={{ fontSize: 13 }}>{filteredBatches.length} shown</span>}
            />
            <div className="card-body card-body-flush" style={{ paddingTop: 4 }}>
              {filteredBatches.length === 0 ? (
                <EmptyState title="No batches match" desc="Try clearing the color filter." />
              ) : (
                filteredBatches.slice(0, 8).map((b) => (
                  <button key={b.id} className="list-row" onClick={() => setDetailBatch(b)}>
                    <span className="session-id-badge">{b.batchCode}</span>
                    <span className="row" style={{ gap: 8 }}>
                      <span className="color-dot" style={{ background: b.colorHex }} />
                      <span className="hide-sm">{b.color}</span>
                    </span>
                    <span className="td-num hide-sm">{b.diameterTarget.toFixed(2)} mm</span>
                    <span className="td-num">{Math.round(b.weightGrams)} g</span>
                    <span className="td-muted hide-sm">{formatDate(b.producedAt)}</span>
                    <ChevronRightIcon size={15} style={{ color: 'var(--text-3)' }} />
                  </button>
                ))
              )}
              {filteredBatches.length > 8 && (
                <div style={{ padding: '12px 20px' }}>
                  <button className="btn btn-ghost btn-sm">
                    View all batches <ChevronRightIcon size={13} />
                  </button>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Export banner */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="export-banner">
          <div className="row" style={{ gap: 14 }}>
            <span className="export-banner-icon"><FileIcon size={20} /></span>
            <div>
              <div style={{ fontWeight: 700 }}>Export Recycling Report</div>
              <div className="muted" style={{ fontSize: 13 }}>
                Download a CSV file of the sessions shown above
              </div>
            </div>
          </div>
          <Button onClick={handleExport} disabled={exporting || filteredSessions.length === 0}>
            <DownloadIcon size={16} /> {exporting ? 'Preparing…' : 'Export Recycling Report'}
          </Button>
        </div>
      </div>

      {/* Detail modal — session */}
      <Modal
        open={detailSession != null}
        onClose={() => setDetailSession(null)}
        title={detailSession ? `Session ${detailSession.id.slice(0, 8)}` : ''}
        size="sm"
      >
        {detailSession && (
          <div className="stack" style={{ gap: 10 }}>
            <DetailRow k="Started" v={formatDateTime(detailSession.startedAt)} />
            <DetailRow k="Status" v={detailSession.status.replace('_', ' ')} />
            <DetailRow k="PET input" v={detailSession.materialInput != null ? `${Math.round(detailSession.materialInput)} g` : '—'} />
            <DetailRow k="Filament output" v={detailSession.materialOutput != null ? `${Math.round(detailSession.materialOutput)} g` : '—'} />
            <DetailRow k="Duration" v={detailSession.durationMinutes != null ? `${Math.round(detailSession.durationMinutes)} min` : '—'} />
            {detailSession.notes && <DetailRow k="Notes" v={detailSession.notes} />}
          </div>
        )}
      </Modal>

      {/* Detail modal — batch */}
      <Modal
        open={detailBatch != null}
        onClose={() => setDetailBatch(null)}
        title={detailBatch ? `Batch ${detailBatch.batchCode}` : ''}
        size="sm"
      >
        {detailBatch && (
          <div className="stack" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 12 }}>
              <span className="batch-swatch" style={{ background: detailBatch.colorHex, width: 44, height: 44 }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{detailBatch.color}</div>
                <div className="muted" style={{ fontSize: 13 }}>{detailBatch.material} · rPET filament</div>
              </div>
            </div>
            <DetailRow k="Produced" v={formatDateTime(detailBatch.producedAt)} />
            <DetailRow k="Diameter" v={detailBatch.diameterActual != null ? `${detailBatch.diameterActual.toFixed(2)} mm` : `${detailBatch.diameterTarget.toFixed(2)} mm target`} />
            <DetailRow k="Weight" v={`${Math.round(detailBatch.weightGrams)} g`} />
            <DetailRow k="Quality" v={detailBatch.quality} />
            {detailBatch.notes && <DetailRow k="Quality notes" v={detailBatch.notes} />}
          </div>
        )}
      </Modal>
    </>
  )
}

function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="row-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
      <span className="muted" style={{ fontSize: 13.5 }}>{k}</span>
      <span style={{ fontWeight: 600, fontSize: 13.5, textAlign: 'right' }}>{v}</span>
    </div>
  )
}
