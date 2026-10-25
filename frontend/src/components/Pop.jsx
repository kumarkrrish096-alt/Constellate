import { Link } from 'react-router-dom'
import { useDash } from './DashContext'
import { usePrefs } from './Prefs'

const LINKS = [['help', 'Help Center'], ['report', 'Report an Issue'], ['contact', 'Contact the Team']]

export default function Pop() {
  const { dd, setDd, pop } = useDash(), p = usePrefs()
  const sw = (l, d, on, set) => (
    <div className="srow"><div><b>{l}</b><span>{d}</span></div>
      <button className="sw" role="switch" aria-checked={on} aria-label={l} onClick={() => set(!on)}><i /></button></div>
  )
  return (
    <div className={'dd pop' + (dd === 'pop' ? ' on' : '')} data-at={pop.at} role="dialog" aria-label={pop.tab === 'support' ? 'Support' : 'Settings'} onClick={e => e.stopPropagation()}>
      <div>
        {pop.tab === 'settings' ? (
          <>
            <div className="srow"><div><b>Appearance</b><span>Charcoal or parchment</span></div>
              <div className="seg">{['dark', 'light'].map(t => <button key={t} className={p.theme === t ? 'on' : ''} onClick={() => p.setTheme(t)}>{t === 'dark' ? 'Dark' : 'Light'}</button>)}</div></div>
            {sw('Reduce motion', 'Stills page and atlas animation', p.calm, p.setCalm)}
            {sw('Status panel', 'Queue panel at the bottom', p.stp, p.setStp)}
          </>
        ) : LINKS.map(([k, l]) => <Link key={k} className="mi" to={'/support/' + k} onClick={() => setTimeout(() => setDd(null), 0)}>{l}</Link>)}
      </div>
    </div>
  )
}
