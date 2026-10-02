import { useMemo, useRef, useState } from 'react'

export interface LinePoint {
  x: string
  y: number
}

interface LineChartProps {
  data: LinePoint[]
  height?: number
  color?: string
  yLabel?: string
  formatY?: (v: number) => string
}

/** Smooth area line chart with gradient fill and hover crosshair. */
export function LineChart({
  data,
  height = 240,
  color = 'var(--brand)',
  yLabel,
  formatY = (v) => String(Math.round(v * 10) / 10),
}: LineChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const W = 760
  const H = height
  const padL = 44
  const padR = 14
  const padT = 16
  const padB = 28
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const { min, max } = useMemo(() => {
    const vals = data.map((d) => d.y)
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const pad = (hi - lo) * 0.25 || 1
    return { min: Math.max(0, lo - pad), max: hi + pad }
  }, [data])

  const px = (i: number) => padL + (i / Math.max(1, data.length - 1)) * plotW
  const py = (v: number) => padT + plotH - ((v - min) / (max - min || 1)) * plotH

  // Smooth path via simple quadratic midpoint smoothing
  const path = useMemo(() => {
    if (data.length < 2) return ''
    let d = `M ${px(0)} ${py(data[0].y)}`
    for (let i = 1; i < data.length; i++) {
      const x0 = px(i - 1)
      const y0 = py(data[i - 1].y)
      const x1 = px(i)
      const y1 = py(data[i].y)
      const mx = (x0 + x1) / 2
      d += ` C ${mx} ${y0}, ${mx} ${y1}, ${x1} ${y1}`
    }
    return d
  }, [data, min, max]) // eslint-disable-line react-hooks/exhaustive-deps

  const areaPath = `${path} L ${px(data.length - 1)} ${padT + plotH} L ${px(0)} ${padT + plotH} Z`

  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const idx = Math.round(((x - padL) / plotW) * (data.length - 1))
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)))
  }

  const gid = useMemo(() => `lg${Math.random().toString(36).slice(2, 8)}`, [])
  const ticks = [0, 0.5, 1].map((f) => min + (max - min) * f)

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label="Line chart"
      onMouseMove={onMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((t, i) => {
        const y = py(t)
        return (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y}
              y2={y}
              stroke={i === 0 ? 'var(--border-strong)' : 'var(--chart-grid)'}
              strokeDasharray={i === 0 ? undefined : '3 4'}
            />
            <text x={padL - 8} y={y + 4} textAnchor="end" fill="var(--text-3)" style={{ fontSize: 11.5 }}>
              {formatY(t)}
            </text>
          </g>
        )
      })}
      {yLabel && (
        <text x={8} y={padT + 4} fill="var(--text-3)" style={{ fontSize: 11.5, fontWeight: 600 }}>
          {yLabel}
        </text>
      )}

      <path d={areaPath} fill={`url(#${gid})`} />
      <path d={path} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />

      {/* x labels — sparse */}
      {data.map((d, i) => {
        const every = Math.ceil(data.length / 7)
        if (i % every !== 0 && i !== data.length - 1) return null
        return (
          <text
            key={i}
            x={px(i)}
            y={H - 8}
            textAnchor="middle"
            fill="var(--text-2)"
            style={{ fontSize: 11.5, fontWeight: 600 }}
          >
            {d.x}
          </text>
        )
      })}

      {hoverIdx !== null && (
        <g>
          <line
            x1={px(hoverIdx)}
            x2={px(hoverIdx)}
            y1={padT}
            y2={padT + plotH}
            stroke="var(--border-strong)"
            strokeDasharray="3 3"
          />
          <circle cx={px(hoverIdx)} cy={py(data[hoverIdx].y)} r="5" fill={color} stroke="var(--surface)" strokeWidth="2.5" />
        </g>
      )}
    </svg>
  )
}

export function ChartTooltip({
  x,
  y,
  children,
}: {
  x: number
  y: number
  children: React.ReactNode
}) {
  return (
    <div className="chart-tooltip" style={{ left: x, top: y }}>
      {children}
    </div>
  )
}
