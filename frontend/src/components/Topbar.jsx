import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { useDash } from './DashContext'
import { initials, useAuth } from '../auth/AuthContext'
import { ago } from '../lib/utils'

export default function Topbar() {
  const { dd, setDd, showPop, say, badge, setBadge, hist, openCast } = useDash()
  const { user, email, logout } = useAuth(), nav = useNavigate()
  const navEl = useRef(), bell = useRef(), menu = useRef(), [right, setRight] = useState(200)
  const onBell = e => {
    e.stopPropagation()
    const n = navEl.current.getBoundingClientRect(), b = bell.current.getBoundingClientRect(), w = menu.current.offsetWidth || 270
    setRight(Math.max(8, Math.min(n.right - b.right, n.width - w - 8)))
    setDd(dd === 'bell' ? null : 'bell'); setBadge(false)
  }
  const out = async () => {
    say('Signed out')
    await logout()
    nav('/', { replace: true })
  }
  const userPop = e => { e.stopPropagation(); showPop('settings', innerWidth > 720 ? 'bl' : 'tr') }
  return (
    <header className="nav" ref={navEl}>
      <Link className="homebtn" to="/" aria-label="Home, back to the landing page"><Icon n="home" /><span>Home</span></Link>
      <div className="nsp" />
      <div className="util">
        <button className="ib" ref={bell} aria-label="Notifications" onClick={onBell}>
          <Icon n="bell" />{badge && <span className="bd" />}
        </button>
        <button className="ib pt sup-m" aria-haspopup="dialog" aria-label="Support" onClick={e => { e.stopPropagation(); showPop('support', 'tr') }}><Icon n="support" /></button>
        <span className="vsep" />
        <button className="usr pt" aria-haspopup="dialog" aria-label="Account and settings" onClick={userPop}>
          <span className="avc" aria-hidden="true">{initials(user)}</span>
          <span className="un"><b>{user}</b><span>{email}</span></span>
        </button>
        <button className="ib" aria-label="Log out" onClick={out}><Icon n="logout" /></button>
      </div>
      <div ref={menu} className={'dd list' + (dd === 'bell' ? ' on' : '')} style={{ top: 'calc(100% + 8px)', right, minWidth: 270 }}>
        {hist && hist.length > 0 ? (
          hist
            .filter((h) => h.st !== 'fizzled')
            .sort((a, b) => b.at - a.at)
            .slice(0, 5)
            .map((h) => (
              <a key={h.id} style={{ cursor: 'pointer' }} onClick={() => { openCast(h); setDd(null); }}>
                <Icon n={h.st === 'cached' ? 'check' : 'repeat'} />
                {h.n}
                <span className="mn">{ago(h.at)}</span>
              </a>
            ))
        ) : (
          <div style={{ padding: '12px 16px', opacity: 0.6, fontSize: '0.85em' }}>
            No analyses yet. Cast your first atlas!
          </div>
        )}
      </div>
    </header>
  )
}
