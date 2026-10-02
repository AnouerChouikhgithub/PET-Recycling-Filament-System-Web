import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  )
}

export function ConnPill({
  connected,
  machineName,
  transport,
}: {
  connected: boolean
  machineName?: string
  /** realtime transport actually in use — shown honestly */
  transport?: 'websocket' | 'polling'
}) {
  return (
    <div className="conn-pill">
      <span className="status-dot" style={{ background: connected ? 'var(--success)' : 'var(--danger)', animation: connected ? 'pulse-dot 1.6s ease-in-out infinite' : undefined }} />
      <div>
        <div className="conn-pill-title" style={{ color: connected ? 'var(--success)' : 'var(--danger)' }}>
          {connected ? 'Connected' : 'Offline'}{machineName ? ` · ${machineName}` : ''}
        </div>
        <div className="conn-pill-sub">
          {transport === 'polling' ? 'API refresh · 10 s' : transport === 'websocket' ? 'Live stream' : 'Via 3awedlou API'}
        </div>
      </div>
    </div>
  )
}
