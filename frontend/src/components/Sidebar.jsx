import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import Logo from './shared/Logo'
import { useDash } from './DashContext'

export const NAV = [
  ['overview', 'layout-dashboard', 'Sanctum', 'Overview'],
  ['atlas', 'affiliate', 'Atlas', 'Dependency atlas'],
  ['health', 'heartbeat', 'Vitals', 'Architectural health'],
  ['path', 'route', 'Pathfinder', 'Onboarding pathfinder'],
  ['history', 'history', 'Chronicle', 'History of every cast'],
]

export default function Sidebar() {
  const { view, go, hist, showPop, dd, pop } = useDash()
  const nvs = useRef(), [y, setY] = useState(0)
  const ind = () => { const b = nvs.current?.querySelector('.nv.on'); if (b && b.offsetParent) setY(b.offsetTop) }
  useLayoutEffect(ind, [view])
  useEffect(() => {
    addEventListener('resize', ind); document.fonts?.ready.then(ind)
    return () => removeEventListener('resize', ind)
  }, [])
  const open = (t) => dd === 'pop' && pop.tab === t && pop.at === 'bl'
  return (
    <aside className="side" aria-label="Primary">
      <div className="rib" />
      <Link className="brand" to="/" aria-label="Constellate, back to the landing page">
        <Logo size={32} />
        <span>Constellate</span>
      </Link>
      <nav className="nvs" ref={nvs}>
        <span className="ind" style={{ transform: `translateY(${y}px)` }} />
        {NAV.map(([id, ic, label, title]) => (
          <button key={id} className={'nv' + (view === id ? ' on' : '')} title={title} onClick={() => go(id)}>
            <Icon n={ic} />{label}{id === 'history' && <span className="nb">{hist.length}</span>}
          </button>
        ))}
      </nav>
      <div className="sp" />
      <div className="sfoot">
        <button className={'pt' + (open('support') ? ' on' : '')} aria-haspopup="dialog" onClick={e => { e.stopPropagation(); showPop('support', 'bl') }}><Icon n="support" />Support</button>
        <button className={'pt' + (open('settings') ? ' on' : '')} aria-haspopup="dialog" onClick={e => { e.stopPropagation(); showPop('settings', 'bl') }}><Icon n="settings" />Settings</button>
      </div>
    </aside>
  )
}

export function BottomNav() {
  const { view, go } = useDash()
  return (
    <nav className="bnav" aria-label="Primary mobile">
      {NAV.map(([id, ic, label]) => (
        <button key={id} className={view === id ? 'on' : ''} onClick={() => go(id)}>
          <Icon n={ic} />{id === 'path' ? 'Paths' : label}
        </button>
      ))}
    </nav>
  )
}
