import { BellIcon, LogoIcon, MenuIcon, MoonIcon, SunIcon } from '../icons'
import { useTheme } from '../../contexts/ThemeContext'

interface TopbarProps {
  onMenu: () => void
  unreadAlerts: number
  onNotifications: () => void
}

export function Topbar({ onMenu, unreadAlerts, onNotifications }: TopbarProps) {
  const { resolved, toggle } = useTheme()

  return (
    <div className="topbar">
      <div className="row" style={{ gap: 10 }}>
        <button className="icon-btn" onClick={onMenu} aria-label="Open menu">
          <MenuIcon size={19} />
        </button>
        <div className="topbar-brand">
          <LogoIcon size={24} />
          3awedlou
        </div>
      </div>
      <div className="topbar-actions">
        <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
          {resolved === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
        </button>
        <button className="icon-btn" onClick={onNotifications} aria-label="Notifications">
          <BellIcon size={18} />
          {unreadAlerts > 0 && <span className="icon-btn-badge">{unreadAlerts}</span>}
        </button>
      </div>
    </div>
  )
}
