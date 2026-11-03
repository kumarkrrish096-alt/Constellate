import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import CsRoot from '../components/CsRoot'
import HelpContent from '../components/HelpContent'
import Icon from '../components/Icon'
import { usePrefs } from '../components/Prefs'
import { useAuth } from '../auth/AuthContext'
import About from '../components/Sections/About'
import { SUPPORT } from '../config'

const TABS = [['help', 'Help Center'], ['report', 'Report an Issue'], ['contact', 'Contact the Team']]
const WHERE = ['Sanctum', 'Atlas', 'Vitals', 'Pathfinder', 'Chronicle', 'Support pages', 'Somewhere else']

function Report() {
  const { user, email } = useAuth()
  const [f, setF] = useState({ t: '', w: 'Sanctum', r: '', d: '', s: '', e: '' }), [msg, setMsg] = useState('')
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }))
  const v = x => (x && x.trim()) || '(not provided)'

  const buildReport = () => {
    const reporterName = user?.trim() || 'Authenticated user'
    const reporterEmail = email?.trim() || '(no email on file)'

    return [
      'CONSTELLATE ISSUE REPORT',
      '========================',
      '',
      'REPORTER',
      `  Name:  ${reporterName}`,
      `  Email: ${reporterEmail}`,
      '',
      'ISSUE SUMMARY',
      `  ${v(f.t)}`,
      '',
      'LOCATION & REPOSITORY',
      `  Where it happened:     ${f.w}`,
      `  Repository and commit: ${v(f.r)}`,
      '',
      'WHAT HAPPENED (ACTUAL BEHAVIOR)',
      v(f.d),
      '',
      'WHAT YOU EXPECTED (EXPECTED BEHAVIOR)',
      v(f.e),
      '',
      'STEPS TO REPRODUCE',
      v(f.s),
    ].join('\n')
  }

  const copy = async () => {
    if (!f.t.trim()) { setMsg('Add a one-line summary first.'); return }
    const t = buildReport()
    try { await navigator.clipboard.writeText(t); setMsg('Report copied.') } catch {
      const a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select()
      let ok = false; try { ok = document.execCommand('copy') } catch { /* ignore */ }
      a.remove(); setMsg(ok ? 'Report copied.' : 'Copy was blocked. Select the text in the form instead.')
    }
  }

  return (
    <section className="on">
      <div className="kick">Support</div><h1 className="h1">Report an Issue</h1>
      <p className="sub">Describe what went wrong. The details you add, plus your reporter profile, are put into a ready-to-send report.</p>
      <div className="card">
        <form className="rf" onSubmit={e => e.preventDefault()} noValidate>
          <label>What went wrong, in one line<input value={f.t} onChange={set('t')} maxLength={120} placeholder="e.g. Atlas stays blank after casting" autoComplete="off" /></label>
          <div className="two">
            <label>Where it happened<select value={f.w} onChange={set('w')}>{WHERE.map(w => <option key={w}>{w}</option>)}</select></label>
            <label>Repository and commit (optional)<input value={f.r} onChange={set('r')} maxLength={120} placeholder="owner/repo · a3f9c1e" autoComplete="off" /></label>
          </div>
          <label>What happened (actual behavior)<textarea value={f.d} onChange={set('d')} placeholder="What you saw on screen" /></label>
          <label>Steps to reproduce<textarea value={f.s} onChange={set('s')} placeholder={'1. Open Sanctum\n2. Paste the URL\n3. Press Cast atlas'} /></label>
          <label>What you expected (expected behavior)<textarea value={f.e} onChange={set('e')} placeholder="What should have happened instead" /></label>
          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
            <button type="button" className="pb" onClick={copy}>Copy report</button>
            {SUPPORT.issueUrl && <a className="pb" href={SUPPORT.issueUrl} target="_blank" rel="noopener">Open issue tracker</a>}
            <span className="rstat" role="status" aria-live="polite">{msg}</span>
          </div>
        </form>
        <p className="rnote">{SUPPORT.issueUrl ? 'Copy the report, then paste it into a new issue on the tracker.' : <>The team&apos;s issue tracker address has not been added to this build yet. Copy the report and send it to a team member from <Link className="lnk" to="/support/contact">Contact the Team</Link>.</>}</p>
      </div>
    </section>
  )
}

const TEAM = [['KR', 'Krrish', 'ECE', '20244098'], ['KB', 'Krish Bhalotia', 'ECE', '20244095'], ['SJ', 'Sujal Jain', 'ECM', '20248025']]
function Contact() {
  return (
    <section className="on">
      <div className="kick">Webster 2026 · Team 145</div><h1 className="h1">Contact the Team</h1>
      <p className="sub">Constellate is built by three students for Problem Statement 06, The Astral Cartographer.</p>
      <div className="tm">{TEAM.map(([i, n, b, r]) => <div key={i} className="card"><span className="avc" aria-hidden="true">{i}</span><h3>{n}</h3><span className="br">{b}</span><span className="rg2">Reg. no. {r}</span></div>)}</div>
      <div className="card"><p style={{ margin: 0 }}>
        {SUPPORT.teamEmail ? <>Email the team at <a className="lnk" href={'mailto:' + SUPPORT.teamEmail}>{SUPPORT.teamEmail}</a>. </> : 'Public contact details have not been published for the team yet. '}
        For a bug, use <Link className="lnk" to="/support/report">Report an Issue</Link> and for how-to questions see the <Link className="lnk" to="/support/help">Help Center</Link>.
      </p></div>
    </section>
  )
}

export default function Support() {
  const { page } = useParams(), { theme, setTheme } = usePrefs()
  const tab = TABS.find(t => t[0] === page)
  const barRef = useRef(null)
  const [barHeight, setBarHeight] = useState(0)

  useEffect(() => { if (tab) document.title = tab[1] + ' · Constellate' }, [tab])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page])

  useEffect(() => {
    const update = () => {
      if (barRef.current) setBarHeight(barRef.current.offsetHeight)
    }
    update()
    window.addEventListener('resize', update)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (ro && barRef.current) ro.observe(barRef.current)
    return () => {
      window.removeEventListener('resize', update)
      ro?.disconnect()
    }
  }, [])

  if (!tab) return <Navigate to="/dashboard" replace />
  return (
    <CsRoot extra="supm">
      <div className="spg">
        <header className="spbar" ref={barRef}>
          <Link className="brand" to="/dashboard" aria-label="Constellate, back to the dashboard"><span className="lg" role="img" aria-label="Constellate logo" />Constellate</Link>
          <nav className="spt" aria-label="Support pages">{TABS.map(([p, l]) => <Link key={p} to={'/support/' + p} aria-current={p === page ? 'page' : undefined}>{l}</Link>)}</nav>
          <div className="spr">
            <div className="seg">{['dark', 'light'].map(t => <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>{t === 'dark' ? 'Dark' : 'Light'}</button>)}</div>
            <Link className="homebtn" to="/dashboard"><Icon n="layout-dashboard" /><span>Dashboard</span></Link>
          </div>
        </header>
        <div className="spbar-spacer" style={barHeight ? { height: `${barHeight}px` } : undefined} aria-hidden="true" />
        <main className="spm">
          {page === 'help' && <section className="on"><HelpContent /></section>}
          {page === 'report' && <Report />}
          {page === 'contact' && <Contact />}
        </main>
        {page === 'contact' && <About showNav={false} />}
      </div>
    </CsRoot>
  )
}
