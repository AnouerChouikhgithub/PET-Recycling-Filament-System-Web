import { useState } from 'react'
import { BottleIcon, InfoIcon, LeafIcon, RecycleIcon, BarChartIcon } from '../components/icons'
import { Card, CardHeader } from '../components/ui/Card'
import { ErrorState, LoadingState } from '../components/ui/states'
import { PageHeader, ConnPill } from '../components/layout/PageHeader'
import { DonutChart } from '../components/charts/DonutChart'
import { BarChart } from '../components/charts/BarChart'
import type { BarPoint } from '../components/charts/BarChart'
import { machinesApi } from '../api/machines'
import { useAsync } from '../lib/useAsync'
import { useMachine } from '../contexts/MachineContext'
import { formatNumber } from '../lib/format'

type RangeKey = '6m' | 'all'

export function ImpactPage() {
  const { view, selectedId, realtimeMode } = useMachine()
  const [metric, setMetric] = useState<'pet' | 'bottles'>('pet')
  const [range, setRange] = useState<RangeKey>('6m')

  // Recycling records carry measured input/output mass + energy-related notes.
  const recyclingQ = useAsync(
    () => (selectedId ? machinesApi.recycling(selectedId, { limit: 200 }) : Promise.resolve({ records: [], totals: { records: 0, inputGrams: null, outputGrams: null } })),
    [selectedId],
  )

  if (recyclingQ.loading && !recyclingQ.data) {
    return (
      <>
        <PageHeader eyebrow="Your environmental impact" title="Real change, one bottle at a time." />
        <LoadingState />
      </>
    )
  }
  if (recyclingQ.error && !recyclingQ.data) {
    return <ErrorState message={(recyclingQ.error as Error).message} onRetry={recyclingQ.retry} />
  }

  const records = recyclingQ.data?.records ?? []
  const totals = recyclingQ.data?.totals ?? { records: 0, inputGrams: null, outputGrams: null }

  // Measured values (from recycling records)…
  const totalPetKg = (totals.inputGrams ?? 0) / 1000
  const totalFilamentKg = (totals.outputGrams ?? 0) / 1000
  // …and clearly-labelled estimates (documented conversion factors).
  const bottlesEquivalent = Math.round(totalPetKg * 25)
  const co2AvoidedKg = Math.round(totalPetKg * 0.45 * 10) / 10

  const monthly = buildMonthly(records)
  const visibleMonths = range === '6m' ? monthly.slice(-6) : monthly

  const chartData: BarPoint[] = visibleMonths.map((m) => ({
    label: m.month,
    value: metric === 'pet' ? m.petKg : m.petKg * 25,
    display: metric === 'pet' ? `${m.petKg.toFixed(1)} kg` : `≈ ${formatNumber(Math.round(m.petKg * 25))}`,
  }))

  return (
    <>
      <PageHeader
        eyebrow="Your environmental impact"
        title="Real change, one bottle at a time."
        subtitle="The difference your 3awedlou has made, measured from your recycling records."
        actions={
          <ConnPill
            connected={(view?.machine.status ?? 'offline') !== 'offline'}
            machineName={view?.machine.identifier}
            transport={realtimeMode}
          />
        }
      />

      <div className="stack">
        {/* Hero */}
        <Card>
          <div className="impact-hero">
            <DonutChart
              pct={Math.min(1, totalPetKg / 60)}
              centerTitle={`${totalPetKg.toFixed(1)} kg`}
              centerSub="PET diverted"
              badge={
                <span className="status-badge status-badge--success" style={{ marginTop: 4 }}>
                  <span className="status-dot" style={{ background: 'currentColor' }} />
                  Measured
                </span>
              }
            />
            <div className="impact-hero-text">
              <h3>Total PET diverted from landfill</h3>
              <div className="row" style={{ gap: 8, marginBottom: 10 }}>
                <span className="muted" style={{ fontSize: 13 }}>Measured from {totals.records} recycling records</span>
                <span className="demo-tag">Measured</span>
              </div>
              <p>
                Every kilogram of PET you recycle keeps plastic out of landfill and helps create a
                more circular future. That’s roughly {formatNumber(bottlesEquivalent)} bottles given
                a second life as 3D-printing filament.
              </p>
              <div className="row" style={{ gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <div className="mini-stat">
                  <strong>{totalFilamentKg.toFixed(1)} kg</strong>
                  <span>filament produced</span>
                </div>
                <div className="mini-stat">
                  <strong>{records.length}</strong>
                  <span>recycling records</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Estimates */}
        <div className="grid grid-2">
          <Card>
            <EstimateCard
              icon={<BottleIcon size={22} />}
              value={`≈ ${formatNumber(bottlesEquivalent)}`}
              label="bottles (estimated)"
              info="Assumes an average of 25 standard 0.5 L PET bottles per kilogram of recycled plastic."
            />
          </Card>
          <Card>
            <EstimateCard
              icon={<LeafIcon size={22} />}
              value={`≈ ${co2AvoidedKg} kg`}
              label="CO₂e avoided (estimated)"
              info="Estimated at 0.45 kg CO₂e avoided per kg of PET recycled, based on published lifecycle averages. Not a measured value."
            />
          </Card>
        </div>

        {/* Chart */}
        <Card>
          <CardHeader
            icon={<BarChartIcon size={18} />}
            title="PET recycled over time"
            subtitle={metric === 'pet' ? 'Monthly totals from your recycling records' : 'Estimated bottle count per month'}
            actions={
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <div className="segmented">
                  <button className={metric === 'pet' ? 'active' : ''} onClick={() => setMetric('pet')}>kg</button>
                  <button className={metric === 'bottles' ? 'active' : ''} onClick={() => setMetric('bottles')}>bottles</button>
                </div>
                <div className="segmented">
                  <button className={range === '6m' ? 'active' : ''} onClick={() => setRange('6m')}>6 months</button>
                  <button className={range === 'all' ? 'active' : ''} onClick={() => setRange('all')}>All time</button>
                </div>
              </div>
            }
          />
          <div className="card-body" style={{ paddingTop: 6 }}>
            {chartData.length === 0 ? (
              <div className="muted" style={{ fontSize: 13.5, padding: '24px 0', textAlign: 'center' }}>
                No recycling records yet — the chart fills in as sessions complete.
              </div>
            ) : (
              <BarChart data={chartData} yLabel={metric === 'pet' ? 'kg' : 'bottles'} height={280} />
            )}
          </div>
        </Card>

        {/* Methodology note */}
        <Card>
          <div className="about-numbers">
            <span className="export-banner-icon"><InfoIcon size={20} /></span>
            <div>
              <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                About these numbers
                <RecycleIcon size={15} style={{ color: 'var(--brand)' }} />
              </div>
              <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>
                Weights are measured by the machine and stored in the backend. Bottle counts and
                CO₂e are estimates based on average PET bottle weight and published lifecycle
                factors — they are clearly labelled as estimates wherever they appear.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}

/** Group recycling records by month (measured input mass). */
function buildMonthly(records: { recycledAt: string; inputMassGrams: number | null }[]): { month: string; petKg: number }[] {
  const byMonth = new Map<string, number>()
  for (const r of records) {
    if (r.inputMassGrams == null) continue
    const d = new Date(r.recycledAt)
    const key = d.toLocaleString('en-US', { month: 'short' }) + (d.getMonth() === 0 ? ` ${d.getFullYear()}` : '')
    byMonth.set(key, (byMonth.get(key) ?? 0) + r.inputMassGrams / 1000)
  }
  return Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, petKg]) => ({ month, petKg: Math.round(petKg * 10) / 10 }))
}

function EstimateCard({
  icon,
  value,
  label,
  info,
}: {
  icon: React.ReactNode
  value: string
  label: string
  info: string
}) {
  return (
    <div className="estimate-card">
      <span className="stat-card-icon">{icon}</span>
      <div style={{ flex: 1 }}>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
      <span className="info-icon" title={info} tabIndex={0} aria-label={info}>
        <InfoIcon size={17} />
      </span>
    </div>
  )
}
