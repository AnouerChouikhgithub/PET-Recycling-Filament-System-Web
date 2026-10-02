import type { MachineAlert } from '../../data/types'
import { CheckCircleIcon, InfoIcon, WarningIcon, AlertOctagonIcon, CheckIcon } from '../icons'
import { timeAgo } from '../../lib/format'
import { EmptyState } from '../ui/states'

const SEV_ICON = {
  success: CheckCircleIcon,
  info: InfoIcon,
  warning: WarningIcon,
  error: AlertOctagonIcon,
}

const SEV_TONE: Record<MachineAlert['severity'], string> = {
  success: 'success',
  info: 'info',
  warning: 'warning',
  error: 'danger',
}

export function NotificationList({
  alerts,
  onMarkRead,
  onMarkAll,
}: {
  alerts: MachineAlert[]
  onMarkRead: (id: string) => void
  onMarkAll: () => void
}) {
  return (
    <div>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Notifications</div>
        {alerts.some((a) => !a.read) && (
          <button className="btn btn-ghost btn-sm" onClick={onMarkAll}>
            <CheckIcon size={14} /> Mark all read
          </button>
        )}
      </div>
      {alerts.length === 0 ? (
        <EmptyState title="All clear" desc="No notifications right now." />
      ) : (
        <div className="stack" style={{ gap: 8, maxHeight: 380, overflowY: 'auto' }}>
          {alerts.map((a) => {
            const Icon = SEV_ICON[a.severity]
            return (
              <button
                key={a.id}
                className="card row"
                style={{
                  alignItems: 'flex-start',
                  gap: 11,
                  padding: '11px 13px',
                  textAlign: 'left',
                  width: '100%',
                  borderColor: a.read ? 'var(--border)' : 'var(--brand-soft-border)',
                  background: a.read ? 'var(--surface)' : 'var(--brand-soft)',
                }}
                onClick={() => onMarkRead(a.id)}
                title={a.read ? undefined : 'Mark as read'}
              >
                <div className={`toast-icon ${SEV_TONE[a.severity]}`} style={{ width: 28, height: 28 }}>
                  <Icon size={15} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 1 }}>{a.message}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>{timeAgo(a.date)}</div>
                </div>
                {!a.read && <span className="status-dot" style={{ background: 'var(--brand)', marginTop: 6 }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
