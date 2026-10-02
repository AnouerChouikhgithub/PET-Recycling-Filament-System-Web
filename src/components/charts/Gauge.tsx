import { useId } from 'react'

interface GaugeProps {
  value: number
  min?: number
  max?: number
  /** Big center label override (e.g. "78%"). Defaults to the value. */
  display?: string
  /** Small line under the value (e.g. "/ 195°C"). */
  sublabel?: string
  size?: number
}

const R_RATIO = 0.42
const STROKE_RATIO = 0.058

/** Semicircular gauge matching the 3awedlou reference design. */
export function Gauge({ value, min = 0, max = 100, display, sublabel, size = 200 }: GaugeProps) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const pct = Math.min(1, Math.max(0.02, (value - min) / (max - min || 1)))
  const h = size * 0.6
  const cx = size / 2
  const cy = size * 0.52
  const r = size * R_RATIO
  const stroke = size * STROKE_RATIO

  const arc = (fromFrac: number, toFrac: number) => {
    const a0 = Math.PI + Math.PI * fromFrac
    const a1 = Math.PI + Math.PI * toFrac
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    const large = Math.PI * (toFrac - fromFrac) > Math.PI ? 1 : 0
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
  }

  const knobAngle = Math.PI + Math.PI * pct
  const knob = {
    x: cx + r * Math.cos(knobAngle),
    y: cy + r * Math.sin(knobAngle),
  }

  return (
    <svg
      width={size}
      height={h}
      viewBox={`0 0 ${size} ${h}`}
      role="img"
      aria-label={`Gauge at ${display ?? Math.round(value)}`}
    >
      <defs>
        <linearGradient id={`gg-${gid}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--brand-active)" />
          <stop offset="100%" stopColor="var(--brand)" />
        </linearGradient>
      </defs>
      {/* track */}
      <path
        d={arc(0, 1)}
        stroke="var(--chart-track)"
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
      />
      {/* value arc */}
      <path
        d={arc(0, pct)}
        stroke={`url(#gg-${gid})`}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
      />
      {/* knob */}
      <circle
        cx={knob.x}
        cy={knob.y}
        r={stroke / 2 + 2}
        fill="var(--surface)"
        stroke="var(--brand)"
        strokeWidth="2.5"
      />
      {/* value text */}
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        fill="var(--text-1)"
        style={{ fontSize: size * 0.155, fontWeight: 800, letterSpacing: '-0.02em' }}
      >
        {display ?? Math.round(value)}
      </text>
      {sublabel && (
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fill="var(--text-3)"
          style={{ fontSize: Math.max(11, size * 0.062), fontWeight: 600 }}
        >
          {sublabel}
        </text>
      )}
    </svg>
  )
}
