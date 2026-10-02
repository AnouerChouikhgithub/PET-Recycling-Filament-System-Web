import { useMemo, useState } from 'react'
import { SearchIcon, SpoolIcon } from '../components/icons'
import { Card } from '../components/ui/Card'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Modal } from '../components/ui/Modal'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states'
import { PageHeader } from '../components/layout/PageHeader'
import { useAsync } from '../lib/useAsync'
import { machinesApi } from '../api/machines'
import { useMachine } from '../contexts/MachineContext'
import { formatDateTime, formatKg } from '../lib/format'
import { ApiError } from '../api/client'
import type { FilamentProduction, FilamentQuality } from '../types/api'

const QUALITY_TONE: Record<FilamentQuality, 'success' | 'info' | 'warning' | 'danger'> = {
  excellent: 'success',
  good: 'info',
  fair: 'warning',
  poor: 'danger',
}

export function FilamentPage() {
  const { selectedId } = useMachine()
  const { data, loading, error, retry } = useAsync(
    () => (selectedId ? machinesApi.production(selectedId, { limit: 100 }) : Promise.resolve([])),
    [selectedId],
  )
  const [query, setQuery] = useState('')
  const [quality, setQuality] = useState<'all' | FilamentQuality>('all')
  const [detail, setDetail] = useState<FilamentProduction | null>(null)

  const batches = useMemo(() => data ?? [], [data])

  const filtered = useMemo(
    () =>
      batches
        .filter((b) => quality === 'all' || b.quality === quality)
        .filter((b) => {
          if (!query) return true
          const q = query.toLowerCase()
          return b.batchCode.toLowerCase().includes(q) || b.color.toLowerCase().includes(q)
        })
        .sort((a, b) => b.producedAt.localeCompare(a.producedAt)),
    [batches, quality, query],
  )

  const totalWeight = batches.reduce((a, b) => a + b.weightGrams, 0)

  return (
    <>
      <PageHeader
        eyebrow="Filament"
        title="Filament batches"
        subtitle="Every spool your 3awedlou has produced, tracked from waste PET to printable material."
      />

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="card row" style={{ gap: 14, padding: '18px 20px' }}>
          <span className="stat-card-icon"><SpoolIcon size={21} /></span>
          <div>
            <div className="stat-value">{batches.length}</div>
            <div className="stat-label">batches logged</div>
          </div>
        </div>
        <div className="card row" style={{ gap: 14, padding: '18px 20px' }}>
          <span className="stat-card-icon"><SpoolIcon size={21} /></span>
          <div>
            <div className="stat-value">{formatKg(totalWeight / 1000)}</div>
            <div className="stat-label">total filament</div>
          </div>
        </div>
        <div className="card row" style={{ gap: 14, padding: '18px 20px' }}>
          <span className="stat-card-icon"><SpoolIcon size={21} /></span>
          <div>
            <div className="stat-value">{batches.length > 0 ? `${batches[0].diameterTarget.toFixed(2)} mm` : '1.75 mm'}</div>
            <div className="stat-label">standard diameter</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div className="row-between">
          <div className="chips">
            {(['all', 'excellent', 'good', 'fair', 'poor'] as const).map((q) => (
              <button key={q} className={`chip ${quality === q ? 'active' : ''}`} onClick={() => setQuality(q)}>
                {q === 'all' ? 'All quality' : `${q[0].toUpperCase()}${q.slice(1)}`}
              </button>
            ))}
          </div>
          <div className="search-box">
            <SearchIcon size={16} />
            <input
              className="input"
              placeholder="Search batch or color…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading batches…" />
      ) : error ? (
        <ErrorState message={(error as ApiError).message} onRetry={retry} />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            title={batches.length === 0 ? 'No batches yet' : 'No batches match'}
            desc={batches.length === 0 ? 'Batches are logged when the machine produces filament.' : 'Try a different quality filter or clear the search.'}
          />
        </Card>
      ) : (
        <div className="grid grid-4">
          {filtered.map((b) => (
            <button key={b.id} className="card batch-card" onClick={() => setDetail(b)}>
              <div className="batch-card-top">
                <span className="batch-id">{b.batchCode}</span>
                <StatusBadge tone={QUALITY_TONE[b.quality]}>{b.quality}</StatusBadge>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <span className="batch-swatch" style={{ background: b.colorHex }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{b.color}</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {b.diameterActual != null ? `${b.diameterActual.toFixed(2)} mm` : `${b.diameterTarget.toFixed(2)} mm target`} · {b.material}
                  </div>
                </div>
              </div>
              <div className="batch-facts">
                <div>
                  <dt>Weight</dt>
                  <dd>{Math.round(b.weightGrams)} g</dd>
                </div>
                <div>
                  <dt>Produced</dt>
                  <dd>{formatDateTime(b.producedAt).split('·')[0]}</dd>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Batch detail */}
      <Modal open={detail != null} onClose={() => setDetail(null)} title={detail ? `Batch ${detail.batchCode}` : ''} size="sm">
        {detail && (
          <div className="stack" style={{ gap: 12 }}>
            <div className="row" style={{ gap: 14 }}>
              <span className="batch-swatch" style={{ background: detail.colorHex, width: 52, height: 52 }} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{detail.color}</div>
                <div className="muted" style={{ fontSize: 13 }}>{detail.material} · recycled PET filament</div>
              </div>
            </div>
            <FactRow k="Produced" v={formatDateTime(detail.producedAt)} />
            <FactRow k="Diameter target" v={`${detail.diameterTarget.toFixed(2)} mm`} />
            <FactRow k="Diameter actual" v={detail.diameterActual != null ? `${detail.diameterActual.toFixed(2)} mm` : '—'} />
            <FactRow k="Weight" v={`${Math.round(detail.weightGrams)} g`} />
            {detail.lengthMeters != null && <FactRow k="Length" v={`${Math.round(detail.lengthMeters)} m`} />}
            <FactRow k="Quality" v={detail.quality} />
            {detail.notes && (
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px', fontSize: 13.5, color: 'var(--text-2)' }}>
                {detail.notes}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

function FactRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="row-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
      <span className="muted" style={{ fontSize: 13.5 }}>{k}</span>
      <span style={{ fontWeight: 600, fontSize: 13.5, textTransform: 'capitalize' }}>{v}</span>
    </div>
  )
}
