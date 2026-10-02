import { AlertOctagonIcon, BoxesIcon } from '../icons'

export function LoadingState({ label = 'Loading data…' }: { label?: string }) {
  return (
    <div className="state-block" role="status">
      <div className="spinner" />
      <div className="state-desc">{label}</div>
    </div>
  )
}

export function EmptyState({
  title = 'Nothing here yet',
  desc,
  action,
}: {
  title?: string
  desc?: string
  action?: React.ReactNode
}) {
  return (
    <div className="state-block">
      <BoxesIcon size={34} />
      <div className="state-title">{title}</div>
      {desc && <div className="state-desc">{desc}</div>}
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-block">
      <AlertOctagonIcon size={34} />
      <div className="state-title">Something went wrong</div>
      <div className="state-desc">{message}</div>
      {onRetry && (
        <button className="btn btn-secondary btn-sm" onClick={onRetry} style={{ marginTop: 6 }}>
          Try again
        </button>
      )}
    </div>
  )
}

export function Skeleton({ w = '100%', h = 14, r = 8 }: { w?: number | string; h?: number; r?: number }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r }} />
}
