import Icon from './Icon'
import { useDash } from './DashContext'
import { usePrefs } from './Prefs'

export default function StatusPanel() {
  const { status } = useDash(), { stp, stpMin, setStpMin } = usePrefs()
  return (
    <aside className={'stp' + (!stp ? ' off' : '') + (stpMin ? ' min' : '')} role="status" aria-live="polite">
      <button className="tile" aria-label="Queue status" onClick={() => stpMin && setStpMin(false)}><Icon n="heartbeat" /></button>
      <div className="tx">
        <b>{status.t || 'The queue is quiet'}</b>
        <span>{status.s || '0 jobs · 4 workers'}</span>
        <div className="stbar" style={{ display: status.p == null ? 'none' : 'block' }}><i style={{ width: Math.round((status.p || 0) * 100) + '%' }} /></div>
      </div>
      <button className="stx" aria-label="Collapse status panel" onClick={() => setStpMin(true)}><Icon n="chevron-down" /></button>
    </aside>
  )
}
