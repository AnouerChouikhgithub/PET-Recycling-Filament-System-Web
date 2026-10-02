import { useEffect, useRef, useState } from 'react'
import type { RouteName } from '../../lib/router'
import {
  BarChartIcon,
  ChevronDownIcon,
  CpuIcon,
  HelpIcon,
  HomeIcon,
  LogoIcon,
  MonitorIcon,
  MoonIcon,
  RecycleIcon,
  SettingsIcon,
  SunIcon,
  WifiIcon,
  XIcon,
} from '../icons'
import { useTheme } from '../../contexts/ThemeContext'

const NAV: { route: RouteName; label: string; icon: React.ReactNode }[] = [
  { route: 'dashboard', label: 'Home', icon: <HomeIcon size={19} /> },
  { route: 'machine', label: 'Machine', icon: <CpuIcon size={19} /> },
  { route: 'recycling', label: 'Recycling', icon: <RecycleIcon size={19} /> },
  { route: 'impact', label: 'Impact', icon: <BarChartIcon size={19} /> },
]

interface SidebarProps {
  route: RouteName
  onNavigate: (r: RouteName) => void
  open: boolean
  onClose: () => void
  unreadAlerts: number
  connected: boolean
  deviceName: string
}

export function Sidebar({
  route,
  onNavigate,
  open,
  onClose,
  unreadAlerts,
  connected,
  deviceName,
}: SidebarProps) {
  const { mode, resolved, setMode } = useTheme()
  const [themeOpen, setThemeOpen] = useState(false)
  const themeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!themeOpen) return
    const onDown = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setThemeOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [themeOpen])

  const go = (r: RouteName) => {
    onNavigate(r)
    onClose()
  }

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <LogoIcon size={30} />
          <div>
            <div className="brand-name">3awedlou</div>
            <div className="brand-tagline">Plastic today.{'\n'}A brighter tomorrow.</div>
          </div>
          <button
            className="icon-btn sidebar-close-btn"
            style={{ marginLeft: 'auto', width: 30, height: 30, border: 'none', background: 'transparent' }}
            onClick={onClose}
            aria-label="Close menu"
          >
            <XIcon size={16} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {NAV.map((item) => (
            <button
              key={item.route}
              className={`nav-item ${route === item.route ? 'active' : ''}`}
              onClick={() => go(item.route)}
              aria-current={route === item.route ? 'page' : undefined}
            >
              {item.icon}
              {item.label}
              {item.route === 'machine' && unreadAlerts > 0 && (
                <span className="nav-badge">{unreadAlerts}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-section" />

        <div className="conn-widget">
          <div className="conn-widget-top">
            <WifiIcon size={16} />
            <span style={{ color: connected ? 'var(--success)' : 'var(--danger)' }}>
              {connected ? 'Connected' : 'Disconnected'} · Wi-Fi
            </span>
          </div>
          <div className="conn-widget-sub">
            <span className="mono">{deviceName}</span>
            <span className="demo-tag">Demo</span>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="dropdown" ref={themeRef}>
            <button className="nav-item" onClick={() => setThemeOpen((o) => !o)} aria-expanded={themeOpen}>
              {resolved === 'dark' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
              {mode === 'system' ? 'System theme' : resolved === 'dark' ? 'Dark mode' : 'Light mode'}
              <ChevronDownIcon size={14} style={{ marginLeft: 'auto', opacity: 0.7 }} />
            </button>
            {themeOpen && (
              <div className="dropdown-menu" style={{ left: 0, right: 'auto', bottom: 'calc(100% + 6px)', top: 'auto' }}>
                <button className={`dropdown-item ${mode === 'light' ? 'selected' : ''}`} onClick={() => { setMode('light'); setThemeOpen(false) }}>
                  <SunIcon size={15} /> Light
                </button>
                <button className={`dropdown-item ${mode === 'dark' ? 'selected' : ''}`} onClick={() => { setMode('dark'); setThemeOpen(false) }}>
                  <MoonIcon size={15} /> Dark
                </button>
                <button className={`dropdown-item ${mode === 'system' ? 'selected' : ''}`} onClick={() => { setMode('system'); setThemeOpen(false) }}>
                  <MonitorIcon size={15} /> System
                </button>
              </div>
            )}
          </div>
          <button className="nav-item">
            <HelpIcon size={18} />
            Help & Guide
          </button>
          <button className="nav-item">
            <SettingsIcon size={18} />
            Settings
            <ChevronRightIconSmall />
          </button>
        </div>
      </aside>
    </>
  )
}

function ChevronRightIconSmall() {
  return (
    <span style={{ marginLeft: 'auto', display: 'flex', opacity: 0.5 }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="m9 6 6 6-6 6" />
      </svg>
    </span>
  )
}
