import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { useDash } from './DashContext'
import { initials, useAuth } from '../auth/AuthContext'

export default function Topbar() {
  const { dd, setDd, showPop, say, badge, setBadge } = useDash()
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
        <a><Icon n="check" />Atlas ready: expressjs/express<span className="mn">2h</span></a>
        <a><Icon n="repeat" />New cycle in vuejs/core<span className="mn">1d</span></a>
        <a><Icon n="clock" />GitHub rate limit reset<span className="mn">1d</span></a>
      </div>
    </header>
  )
}
