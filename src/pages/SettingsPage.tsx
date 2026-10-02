import { useState } from 'react'
import {
  BellIcon,
  CpuIcon,
  MailIcon,
  MapPinIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  ThermometerIcon,
  UserIcon,
  SpoolIcon,
} from '../components/icons'
import { Card, CardHeader } from '../components/ui/Card'
import { Toggle } from '../components/ui/Toggle'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/layout/PageHeader'
import { useTheme } from '../contexts/ThemeContext'
import { useMachine } from '../contexts/MachineContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { timeAgo } from '../lib/format'

type SettingsTab = 'profile' | 'notifications' | 'machine' | 'appearance'

export function SettingsPage() {
  const { mode, setMode } = useTheme()
  const { view, machines, selectMachine } = useMachine()
  const { user, logout } = useAuth()
  const toast = useToast()

  const [tab, setTab] = useState<SettingsTab>('profile')
  const [emailNotifs, setEmailNotifs] = useState(true)
  const [reduceMotion, setReduceMotion] = useState(false)

  const machine = view?.machine
  const telemetry = view?.telemetry

  const save = (what: string) =>
    toast.push('info', `${what} are local`, 'Notification and appearance preferences are stored on this device; account sync arrives with the backend phase.')

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Your 3awedlou, your way."
        subtitle="Profile, notifications and machine preferences."
      />

      <div className="tabs" style={{ marginBottom: 18 }}>
        {(
          [
            ['profile', 'Profile'],
            ['notifications', 'Notifications'],
            ['machine', 'Machine'],
            ['appearance', 'Appearance'],
          ] as [SettingsTab, string][]
        ).map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      <div className="stack" style={{ maxWidth: 760 }}>
        {tab === 'profile' && (
          <Card>
            <CardHeader icon={<UserIcon size={18} />} title="Profile" subtitle="From your 3awedlou account" />
            <div className="card-body stack" style={{ gap: 16 }}>
              <div className="row" style={{ gap: 16 }}>
                <div className="avatar">{user?.name.charAt(0) ?? '?'}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{user?.name}</div>
                  <div className="muted" style={{ fontSize: 13 }}>Owner · {machine?.identifier ?? 'no machine'}</div>
                </div>
              </div>
              <div className="grid grid-2">
                <div className="field">
                  <label className="field-label" htmlFor="s-name">Full name</label>
                  <input id="s-name" className="input" value={user?.name ?? ''} readOnly />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="s-email">Email</label>
                  <input id="s-email" className="input" type="email" value={user?.email ?? ''} readOnly />
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MailIcon size={14} /> {user?.email}
                </span>
                <span className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPinIcon size={14} /> member since {user ? new Date(user.createdAt).toLocaleDateString() : '—'}
                </span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="demo-tag">Account</span>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Profile editing arrives with the account API (phase 3).
                </span>
              </div>
            </div>
          </Card>
        )}

        {tab === 'notifications' && (
          <Card>
            <CardHeader icon={<BellIcon size={18} />} title="Notifications" subtitle="Choose what 3awedlou tells you about" />
            <div className="card-body">
              <SettingRow
                title="Session complete"
                desc="Show a notification when a recycling session finishes."
                checked
                onChange={() => save('Session notifications')}
              />
              <SettingRow
                title="Machine offline"
                desc="Alert when the machine stops reporting to the backend."
                checked
                onChange={() => save('Offline alerts')}
              />
              <SettingRow
                title="Error alerts"
                desc="Immediate warnings when something needs attention."
                checked
                onChange={() => save('Error alerts')}
              />
              <SettingRow
                title="Email notifications"
                desc="Also send these events to your email address."
                checked={emailNotifs}
                onChange={setEmailNotifs}
              />
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
                <Button onClick={() => save('Notification preferences')}>Save preferences</Button>
              </div>
            </div>
          </Card>
        )}

        {tab === 'machine' && (
          <>
            <Card>
              <CardHeader icon={<SettingsIcon size={18} />} title="Connected machines" subtitle="Linked to your account in the backend" />
              <div className="card-body stack" style={{ gap: 10 }}>
                {machines.length === 0 && (
                  <div className="muted" style={{ fontSize: 13.5 }}>No machines are linked to your account yet.</div>
                )}
                {machines.map((m) => (
                  <button
                    key={m.id}
                    className="list-row"
                    style={{ textAlign: 'left' }}
                    onClick={() => {
                      selectMachine(m.id)
                      toast.push('success', 'Machine selected', m.name)
                    }}
                  >
                    <span className="session-id-badge">{m.identifier}</span>
                    <span style={{ fontWeight: 600, flex: 1 }}>{m.name}</span>
                    <span className="td-muted">{m.status}</span>
                  </button>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader icon={<SpoolIcon size={18} />} title="Active machine" subtitle="Reported by the backend" />
              <div className="card-body stack" style={{ gap: 10 }}>
                <div className="row-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <span className="muted" style={{ fontSize: 13.5 }}>Device</span>
                  <span style={{ fontWeight: 600 }}>{machine?.name ?? '—'}</span>
                </div>
                <div className="row-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <span className="muted" style={{ fontSize: 13.5 }}>Identifier</span>
                  <span style={{ fontWeight: 600 }}>{machine?.identifier ?? '—'}</span>
                </div>
                <div className="row-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <span className="muted" style={{ fontSize: 13.5 }}>Status</span>
                  <span style={{ fontWeight: 600 }}>
                    {machine ? `${machine.status} (reported: ${machine.reportedStatus})` : '—'}
                  </span>
                </div>
                <div className="row-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <span className="muted" style={{ fontSize: 13.5 }}>Last seen</span>
                  <span style={{ fontWeight: 600 }}>{machine?.lastSeenAt ? timeAgo(machine.lastSeenAt) : 'never'}</span>
                </div>
                <div className="row-between">
                  <span className="muted" style={{ fontSize: 13.5 }}>Latest sample</span>
                  <span style={{ fontWeight: 600 }}>
                    {telemetry ? timeAgo(telemetry.recordedAt) : 'no telemetry'}
                    {telemetry?.temperature != null ? ` · ${telemetry.temperature.toFixed(1)}°C` : ''}
                  </span>
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader icon={<ThermometerIcon size={18} />} title="Extrusion limits" subtitle="Enforced by the backend command guard" />
              <div className="card-body">
                <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                  The backend refuses commands outside safe ranges before they ever reach the
                  machine: heater target ≤ 300 °C, motor and fan 0–100 %. The same limits will be
                  mirrored in the ESP32 firmware.
                </div>
              </div>
            </Card>
          </>
        )}

        {tab === 'appearance' && (
          <Card>
            <CardHeader icon={<MonitorIcon size={18} />} title="Appearance" subtitle="Theme applies instantly and is remembered on this device" />
            <div className="card-body stack" style={{ gap: 12 }}>
              <div className="theme-cards">
                <ThemeCard
                  active={mode === 'light'}
                  title="Light"
                  icon={<SunIcon size={18} />}
                  preview={{ bg: '#f6f7f6', surface: '#ffffff', text: '#101613', accent: '#16a34a' }}
                  onClick={() => setMode('light')}
                />
                <ThemeCard
                  active={mode === 'dark'}
                  title="Dark"
                  icon={<MoonIcon size={18} />}
                  preview={{ bg: '#0b0f0d', surface: '#131a16', text: '#f2f7f4', accent: '#22c55e' }}
                  onClick={() => setMode('dark')}
                />
                <ThemeCard
                  active={mode === 'system'}
                  title="System"
                  icon={<MonitorIcon size={18} />}
                  preview={{ bg: 'linear-gradient(90deg,#f6f7f6 50%,#0b0f0d 50%)', surface: '#ffffff', text: '#101613', accent: '#16a34a' }}
                  onClick={() => setMode('system')}
                />
              </div>
              <SettingRow
                title="Reduce motion"
                desc="Minimise non-essential animations across the interface."
                checked={reduceMotion}
                onChange={setReduceMotion}
              />
              <div className="demo-banner">
                Theme and display preferences persist locally in your browser. Account sync arrives with the backend phase.
              </div>
            </div>
          </Card>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, maxWidth: 760 }}>
        <Button variant="ghost" onClick={logout}>
          Sign out
        </Button>
      </div>
      <CpuIconless />
    </>
  )
}

function SettingRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="settings-row">
      <div>
        <div className="settings-row-title">{title}</div>
        <div className="settings-row-desc">{desc}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  )
}

function ThemeCard({
  active,
  title,
  icon,
  preview,
  onClick,
}: {
  active: boolean
  title: string
  icon: React.ReactNode
  preview: { bg: string; surface: string; text: string; accent: string }
  onClick: () => void
}) {
  return (
    <button
      className={`theme-card ${active ? 'active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className="theme-card-preview" style={{ background: preview.bg }}>
        <span style={{ background: preview.surface, color: preview.text }} className="theme-card-chip">
          <span style={{ background: preview.accent }} className="theme-card-dot" />
          <span style={{ background: preview.accent, width: 26 }} className="theme-card-bar" />
        </span>
      </span>
      <span className="theme-card-label">
        {icon} {title}
      </span>
    </button>
  )
}

function CpuIconless() {
  void CpuIcon
  return null
}
