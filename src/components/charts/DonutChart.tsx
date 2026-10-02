import { useId } from 'react'

interface DonutProps {
  /** 0..1 fraction */
  pct: number
  size?: number
  centerTitle: string
  centerSub: string
  badge?: React.ReactNode
}

/** Full-circle donut used on the Impact page. */
export function DonutChart({ pct, size = 210, centerTitle, centerSub, badge }: DonutProps) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const stroke = size * 0.082
  const r = (size - stroke) / 2 - 4
  const cx = size / 2
  const cy = size / 2
  const c = 2 * Math.PI * r
  const frac = Math.min(1, Math.max(0.03, pct))

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={centerTitle}>
        <defs>
          <linearGradient id={`dg-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand)" />
            <stop offset="100%" stopColor="var(--brand-hover)" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} stroke="var(--chart-track)" strokeWidth={stroke} fill="none" />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={`url(#dg-${gid})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 700ms cubic-bezier(0.2,0.8,0.3,1)' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontSize: size * 0.15, fontWeight: 800, letterSpacing: '-0.02em' }}>{centerTitle}</div>
        <div style={{ fontSize: size * 0.062, fontWeight: 600, color: 'var(--text-2)' }}>{centerSub}</div>
        {badge}
      </div>
    </div>
  )
}
