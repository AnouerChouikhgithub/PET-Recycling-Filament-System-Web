import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return <div className={`card ${className}`.trim()}>{children}</div>
}

interface CardHeaderProps {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}

export function CardHeader({ icon, title, subtitle, actions }: CardHeaderProps) {
  return (
    <div className="card-header card-header-offset">
      <div>
        <div className="card-title">
          {icon && <span className="card-title-icon">{icon}</span>}
          {title}
        </div>
        {subtitle && <div className="card-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="row" style={{ gap: 10 }}>{actions}</div>}
    </div>
  )
}
