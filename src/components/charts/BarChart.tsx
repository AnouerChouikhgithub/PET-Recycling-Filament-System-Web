import { useState } from 'react'

export interface BarPoint {
  label: string
  value: number
  display?: string
}

interface BarChartProps {
  data: BarPoint[]
  height?: number
  color?: string
  yLabel?: string
}

/** SVG bar chart with dashed grid, value labels and hover tooltip. */
export function BarChart({ data, height = 260, color = 'var(--brand)', yLabel }: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 720
  const H = height
  const padL = 46
  const padR = 10
  const padT = 26
  const padB = 34
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const maxVal = Math.max(...data.map((d) => d.value)) * 1.15 || 1
  const ticks = 4
  const bandW = plotW / data.length
  const barW = Math.min(58, bandW * 0.52)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label="Bar chart"
      onMouseLeave={() => setHover(null)}
    >
      {/* grid + y labels */}
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = (maxVal / ticks) * i
        const y = padT + plotH - (v / maxVal) * plotH
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
              {Math.round(v)}
            </text>
          </g>
        )
      })}
      {yLabel && (
        <text x={10} y={padT - 12} fill="var(--text-3)" style={{ fontSize: 11.5, fontWeight: 600 }}>
          {yLabel}
        </text>
      )}

      {/* bars */}
      {data.map((d, i) => {
        const x = padL + bandW * i + (bandW - barW) / 2
        const bh = (d.value / maxVal) * plotH
        const y = padT + plotH - bh
        const isHover = hover === i
        return (
          <g
            key={d.label}
            onMouseEnter={() => setHover(i)}
            style={{ cursor: 'default' }}
          >
            {/* invisible hover band */}
            <rect x={padL + bandW * i} y={padT} width={bandW} height={plotH} fill="transparent" />
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(2, bh)}
              rx={7}
              fill={color}
              opacity={hover === null || isHover ? 1 : 0.55}
              style={{ transition: 'opacity 140ms ease, y 500ms cubic-bezier(0.2,0.8,0.3,1), height 500ms cubic-bezier(0.2,0.8,0.3,1)' }}
            />
            {/* value label above bar */}
            <text
              x={x + barW / 2}
              y={y - 8}
              textAnchor="middle"
              fill="var(--text-1)"
              style={{ fontSize: 12, fontWeight: 700, opacity: isHover ? 1 : 0.9 }}
            >
              {d.display ?? d.value}
            </text>
            {/* x label */}
            <text
              x={x + barW / 2}
              y={H - 10}
              textAnchor="middle"
              fill="var(--text-2)"
              style={{ fontSize: 12.5, fontWeight: 600 }}
            >
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
