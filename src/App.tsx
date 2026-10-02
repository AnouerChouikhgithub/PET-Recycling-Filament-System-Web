import { useEffect, useMemo, useRef, useState } from 'react'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { MachineProvider, useMachine } from './contexts/MachineContext'
import { useRoute, navigateTo } from './lib/router'
import type { RouteName } from './lib/router'
import { Sidebar } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import { NotificationList } from './components/layout/NotificationPanel'
import { BellIcon, LogoutIcon } from './components/icons'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { MachinePage } from './pages/MachinePage'
import { RecyclingPage } from './pages/RecyclingPage'
import { FilamentPage } from './pages/FilamentPage'
import { ImpactPage } from './pages/ImpactPage'
import { HistoryPage } from './pages/HistoryPage'
import { SettingsPage } from './pages/SettingsPage'
import { useTheme } from './contexts/ThemeContext'
import { formatTime } from './lib/format'
import { realtimeService } from './realtime/realtimeService'

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

/** Auth gate: login screen until signed in, then the machine-backed shell. */
function Gate() {
  const { user, initializing } = useAuth()

  if (initializing) {
    return (
      <div className="login-screen">
        <div className="spinner" style={{ width: 34, height: 34 }} />
      </div>
    )
  }

  if (!user) return <LoginPage />

  return (
    <MachineProvider>
      <Shell />
    </MachineProvider>
  )
}

function Shell() {
  const [route, navigate] = useRoute()
  const { view, alerts, unreadAlerts, markAlertRead, markAllAlertsRead, error } = useMachine()
  const { user, logout } = useAuth()
  const { resolved } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!notifOpen) return
    const onDown = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [notifOpen])

  // Keep hash valid on first load
  useEffect(() => {
    if (!window.location.hash) navigateTo('dashboard')
  }, [])

  // Stop realtime polling when the tab is hidden — battery/bandwidth friendly.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) realtimeService.disconnect()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const handleNavigate = (r: RouteName) => {
    navigate(r)
    setNotifOpen(false)
  }

  const connected = view ? view.machine.status !== 'offline' : false
  const deviceName = view?.machine.identifier ?? '—'
  const userName = useMemo(() => user?.name.split(' ')[0] ?? 'there', [user?.name])

  return (
    <div className="app">
      <Sidebar
        route={route}
        onNavigate={handleNavigate}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        unreadAlerts={unreadAlerts}
        connected={connected}
        deviceName={deviceName}
      />

      <div className="app-main">
        <Topbar
          onMenu={() => setSidebarOpen(true)}
          unreadAlerts={unreadAlerts}
          onNotifications={() => setNotifOpen((o) => !o)}
        />

        {/* Desktop notification anchor */}
        <div className="page-actions desktop-actions">
          <div ref={notifRef} style={{ position: 'relative', display: 'flex' }}>
            <button
              className="icon-btn"
              onClick={() => setNotifOpen((o) => !o)}
              aria-label="Notifications"
              aria-expanded={notifOpen}
            >
              <BellIcon size={18} />
              {unreadAlerts > 0 && <span className="icon-btn-badge">{unreadAlerts}</span>}
            </button>
            {notifOpen && (
              <div
                className="card"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: 380,
                  maxWidth: 'calc(100vw - 32px)',
                  padding: 14,
                  zIndex: 80,
                  boxShadow: 'var(--shadow-lg)',
                }}
              >
                <NotificationList alerts={alerts} onMarkRead={markAlertRead} onMarkAll={markAllAlertsRead} />
              </div>
            )}
          </div>
        </div>

        <main className="app-scroll">
          <div className="app-content">
            {error && (
              <div className="alert-banner alert-banner--error" style={{ marginBottom: 14 }}>
                <span>
                  <strong>Backend unavailable.</strong> {error}
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>
                  Reload
                </button>
              </div>
            )}
            {route === 'dashboard' && <DashboardPage />}
            {route === 'machine' && <MachinePage />}
            {route === 'recycling' && <RecyclingPage />}
            {route === 'filament' && <FilamentPage />}
            {route === 'impact' && <ImpactPage />}
            {route === 'history' && <HistoryPage />}
            {route === 'settings' && <SettingsPage />}
          </div>

          <footer className="app-footer">
            <span>
              3awedlou · Plastic today. A brighter tomorrow. ·{' '}
              {import.meta.env.VITE_ENVIRONMENT === 'production' ? 'Production' : 'Development'} ·{' '}
              {realtimeService.mode === 'polling' ? 'API refresh 10 s' : 'Live'} ·{' '}
              {formatTime(new Date().toISOString())}
            </span>
            <span className="row" style={{ gap: 10 }}>
              <span className="theme-hint">
                {resolved === 'dark' ? 'Dark' : 'Light'} theme · {userName}
              </span>
              <button className="icon-btn" onClick={logout} aria-label="Sign out" title="Sign out">
                <LogoutIcon size={16} />
              </button>
            </span>
          </footer>
        </main>
      </div>
    </div>
  )
}
