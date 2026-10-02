export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface StatusBadgeProps {
  tone: BadgeTone
  children: React.ReactNode
  pulse?: boolean
}

const TONES: Record<BadgeTone, string> = {
  success: 'status-badge--success',
  warning: 'status-badge--warning',
  danger: 'status-badge--danger',
  info: 'status-badge--info',
  neutral: 'status-badge--neutral',
}

export function StatusBadge({ tone, children, pulse = false }: StatusBadgeProps) {
  return (
    <span
      className={`status-badge ${TONES[tone]} ${pulse ? 'status-badge--live' : ''}`.trim()}
    >
      <span className="status-dot" style={{ background: 'currentColor' }} />
      {children}
    </span>
  )
}
