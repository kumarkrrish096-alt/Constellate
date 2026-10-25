import { useEffect, useRef, useState } from 'react'
import CsRoot from '../components/CsRoot'
import { DashCtx } from '../components/DashContext'
import Sidebar, { BottomNav } from '../components/Sidebar'
import Topbar from '../components/Topbar'
import Pop from '../components/Pop'
import StatusPanel from '../components/StatusPanel'
import Icon from '../components/Icon'
import Overview from './Overview'
import AtlasView from './AtlasView'
import Health from './Health'
import Pathfinder from './Pathfinder'
import Chronicle from './Chronicle'
import { ring, seedH } from '../lib/data'
import { loadHist } from '../lib/utils'

export default function Dashboard() {
  const [view, setView] = useState('overview')
  const [dd, setDd] = useState(null) // 'bell' | 'exm' | 'sres' | 'pop'
  const [pop, setPop] = useState({ tab: 'settings', at: 'bl' })
  const [hist, setHistS] = useState(() => loadHist(seedH))
  const [sel, setSel] = useState(-1), [note, setNote] = useState('')
  const [repo, setRepo] = useState('expressjs/express · a3f9c1e')
  const [stats, setStats] = useState({ a: 12, f: 4812 })
  const [status, setStatus] = useState({ t: '', s: '', p: null })
  const [url, setUrl] = useState(''), [mode, setMode] = useState('force'), [hk, setHk] = useState(0)
  const [newId, setNewId] = useState(null), [badge, setBadge] = useState(true)
  const [toast, setToast] = useState({ m: '', on: false })
  const urlRef = useRef(), atRef = useRef(), tt = useRef()

  const setHist = fn => setHistS(prev => {
    const n = typeof fn === 'function' ? fn(prev) : fn
    try { localStorage.setItem('cs-hist', JSON.stringify(n)) } catch { /* ignore */ }
    return n
  })
  const say = m => { setToast({ m, on: true }); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(t => ({ ...t, on: false })), 2400) }
  const hold = m => { clearTimeout(tt.current); setToast({ m, on: true }) }
  const unhold = () => setToast(t => ({ ...t, on: false }))
  const go = n => {
    setView(n)
    if (n === 'history') setHk(k => k + 1)
    const viewsEl = document.querySelector('#cs .views')
    if (viewsEl) viewsEl.scrollTo({ top: 0, behavior: 'smooth' })
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const pickNode = i => {
    const at = atRef.current
    if (i < 0) { at.select(-1); setSel(-1); return }
    if (view !== 'atlas') go('atlas')
    at.select(i); setSel(i); setNote(''); at.focus(i)
  }
  const setAtlasMode = m => { atRef.current?.setMode(m); setMode(m) }
  const showCycle = () => {
    go('atlas')
    setTimeout(() => { const at = atRef.current; at.setHi(new Set(ring)); at.reset(); setSel(-1); setNote('cycle highlighted') }, 60)
  }
  const showHeat = () => { go('atlas'); setAtlasMode('heat') }
  const focusCast = () => {
    go('overview')
    setTimeout(() => { document.getElementById('an')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); urlRef.current?.focus({ preventScroll: true }) }, 140)
  }
  const openCast = h => {
    if (h.st === 'fizzled') { say('That cast fizzled. Cast it again from the Sanctum'); return }
    setRepo(h.n + ' · ' + h.s); say('Reopening the atlas for ' + h.n); go('atlas')
  }
  const showPop = (tab, at) => {
    if (dd === 'pop' && pop.tab === tab && pop.at === at) { setDd(null); return }
    setPop({ tab, at }); setDd('pop')
  }

  useEffect(() => { document.title = 'Dashboard · Constellate' }, [])
  useEffect(() => { if (view === 'atlas') atRef.current?.resize() }, [view])
  useEffect(() => {
    const click = e => { if (!e.target.closest('#cs .dd,#cs .ib,#cs .sb,#cs .pt')) setDd(null) }
    const key = e => {
      if (e.key === 'Escape') setDd(null)
      if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
        e.preventDefault(); go('atlas'); setTimeout(() => document.getElementById('q')?.focus(), 80)
      }
    }
    document.addEventListener('click', click); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('click', click); document.removeEventListener('keydown', key) }
  }, [])

  const ctx = {
    view, go, dd, setDd, pop, showPop, hist, setHist, sel, setSel, note, repo, setRepo, stats, setStats,
    status, setStatus, url, setUrl, urlRef, atRef, mode, setAtlasMode, hk, newId, setNewId, badge, setBadge,
    say, hold, unhold, pickNode, showCycle, showHeat, focusCast, openCast,
  }
  return (
    <DashCtx.Provider value={ctx}>
      <CsRoot extra="dash">
        <div className="body">
          <Sidebar />
          <div className="main">
            <Topbar />
            <main className="views">
              <Overview /><AtlasView /><Health /><Pathfinder /><Chronicle />
            </main>
          </div>
        </div>
        <BottomNav />
        <StatusPanel />
        <Pop />
        <div className={'toast' + (toast.on ? ' on' : '')} role="status"><Icon n="check" style={{ color: 'var(--gold)' }} /><span>{toast.m}</span></div>
      </CsRoot>
    </DashCtx.Provider>
  )
}
