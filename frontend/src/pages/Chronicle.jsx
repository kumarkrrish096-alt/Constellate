import { useState } from 'react'
import CountUp from '../components/CountUp'
import Icon from '../components/Icon'
import Ring from '../components/Ring'
import { useDash } from '../components/DashContext'
import { ago, castsThisWeek, dl, dur, STL } from '../lib/utils'

const grp = t => {
  const s = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const df = Math.round((s(new Date()) - s(new Date(t))) / 864e5)
  return df <= 0 ? 'Today' : df === 1 ? 'Yesterday' : df < 7 ? 'Earlier this week' : 'Long ago'
}
const Seg = ({ items, v, set }) => <div className="seg">{items.map(([k, l]) => <button key={k} className={v === k ? 'on' : ''} onClick={() => set(k)}>{l}</button>)}</div>
const fm = d => (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d)

function HistRow({ h, i, anim, sel, on }) {
  const bad = h.st === 'fizzled', [armed, setArmed] = useState(false), [gone, setGone] = useState(false)
  const erase = () => {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 2200); return }
    setGone(true); setTimeout(() => on.erase(h), 380)
  }
  return (
    <div className={`he ${h.st}${sel ? ' sel' : ''}${gone ? ' gone' : ''}${anim ? '' : ' noanim'}`} style={{ '--i': i }}>
      <span className="hn" />
      <div className="hc">
        {!bad && <button className="hsel" aria-label="Select to compare" title="Select to compare" onClick={() => on.sel(h.id)}><Icon n="check" /></button>}
        <div className="hi">
          <div className="hh"><b>{h.n}</b><span className="mono">{h.s || 'no SHA'}</span><span className={'stt ' + h.st}>{STL[h.st]}</span></div>
          <div className="mono">{h.l}{h.f ? ' · ' + h.f.toLocaleString() + ' files' : ''}{bad ? '' : ` · ${h.cy} cycles · ${h.g} god files · ${dur(h.ms)}`} · {ago(h.at)}</div>
          {h.note && <div className="hnote">{h.note}</div>}
        </div>
        {!bad && <Ring h={h.h} />}
        <div className="hb">
          {bad ? <button onClick={() => on.recast(h)}><Icon n="refresh" />Recast</button> : (
            <>
              <button onClick={() => on.open(h)}><Icon n="affiliate" />Reopen</button>
              <button aria-label="Copy permalink" onClick={() => on.link(h)}><Icon n="link" /></button>
              <button aria-label="Download JSON" onClick={() => on.json(h)}><Icon n="download" /></button>
            </>
          )}
          <button className={'erase' + (armed ? ' armed' : '')} onClick={erase}><Icon n="trash" />{armed ? 'Sure?' : 'Erase'}</button>
        </div>
      </div>
    </div>
  )
}

function Compare({ a, b, clear }) {
  const rows = [['Health', a.h, b.h, 100, 1], ['Files', a.f, b.f, Math.max(a.f, b.f, 1), 0], ['Cycles', a.cy, b.cy, Math.max(a.cy, b.cy, 1), -1], ['God files', a.g, b.g, Math.max(a.g, b.g, 1), -1]]
  const msg = a.n === b.n
    ? `${b.n} ${b.h >= a.h ? 'grew sturdier' : 'grew more fragile'} between ${a.s} and ${b.s}: health ${fm(b.h - a.h)}, cycles ${fm(b.cy - a.cy)}, god files ${fm(b.g - a.g)}.`
    : 'These are two different realms. Compare them with care.'
  const lab = h => <div><b>{h.n}</b><div className="mono">{h.s} · {ago(h.at)}</div></div>
  return (
    <div className="card cmp on">
      <div className="ct"><h3>Two casts, side by side</h3><button onClick={clear}>Clear</button></div>
      <div className="cmpg">
        <span />{lab(a)}{lab(b)}<span />
        {rows.map(r => {
          const d = r[2] - r[1], cl = !d || !r[4] ? '' : (r[4] > 0 ? d > 0 : d < 0) ? 'good' : 'bad'
          return (
            <FragRow key={r[0]}>
              <div className="mono">{r[0]}</div>
              <div><span className="v">{r[1].toLocaleString()}</span><div className="bar2"><i style={{ '--w': r[1] / r[3] * 100 + '%' }} /></div></div>
              <div><span className="v">{r[2].toLocaleString()}</span><div className="bar2"><i style={{ '--w': r[2] / r[3] * 100 + '%' }} /></div></div>
              <div className={'dl ' + cl}>{d ? fm(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : 'same'}</div>
            </FragRow>
          )
        })}
      </div>
      <p className="sub" style={{ marginTop: 12 }}>{msg}</p>
    </div>
  )
}
const FragRow = ({ children }) => <>{children}</>

export default function Chronicle() {
  const { view, hist, setHist, hk, openCast, say, setUrl, focusCast, setNewId } = useDash()
  const [hf, setHf] = useState('all'), [hs, setHs] = useState('new'), [hq, setHq] = useState('')
  const [picks, setPicks] = useState([]), [still, setStill] = useState(''), [fk, setFk] = useState(0)
  const key = hk + '-' + fk, anim = still !== key // animate on every visit / filter change, not on search or erase

  const wk = castsThisWeek(hist)
  const cs = hist.filter(h => h.st === 'cast' || h.st === 'cached')
  const ar = cs.length ? Math.round(hist.filter(h => h.st === 'cached').length / cs.length * 100) : 0
  const tr = hist.filter(h => h.st === 'partial' || h.st === 'fizzled').length
  const cm = hist.filter(h => h.st === 'cast'), av = cm.length ? cm.reduce((a, h) => a + h.ms, 0) / cm.length / 1000 : 0

  let l = hist.slice()
  if (hf === 'cast') l = l.filter(h => h.st === 'cast'); else if (hf === 'cached') l = l.filter(h => h.st === 'cached')
  else if (hf === 'trouble') l = l.filter(h => h.st === 'partial' || h.st === 'fizzled')
  if (hq) l = l.filter(h => (h.n + ' ' + h.s).toLowerCase().includes(hq))
  l.sort(hs === 'new' ? (a, b) => b.at - a.at : hs === 'health' ? (a, b) => b.h - a.h : (a, b) => b.f - a.f)

  const pk = picks.filter(id => hist.some(h => h.id === id))
  const pair = pk.length === 2 ? pk.map(id => hist.find(h => h.id === id)).sort((x, y) => x.at - y.at) : null
  const on = {
    sel: id => setPicks(p => { const n = p.includes(id) ? p.filter(x => x !== id) : [...p, id]; return n.length > 2 ? n.slice(1) : n }),
    open: openCast,
    recast: h => { setUrl('https://github.com/' + h.n); focusCast(); say('Ready to recast ' + h.n) },
    link: h => { try { navigator.clipboard.writeText(location.origin + '/r/' + h.s) } catch { /* ignore */ } say(`Permalink for ${h.s} copied`) },
    json: h => { dl(JSON.stringify({ repository: h.n, sha: h.s, language: h.l, files: h.f, health: h.h, importCycles: h.cy, godFiles: h.g, castInMs: h.ms, castAt: new Date(h.at).toISOString() }, null, 2), h.n.replace('/', '-') + '-' + h.s + '.json', 'application/json'); say('JSON saved') },
    erase: h => { setHist(x => x.filter(y => y.id !== h.id)); setPicks(p => p.filter(x => x !== h.id)); setStill(key); setNewId(null); say('Struck from the chronicle') },
  }
  const filt = (set, v) => { set(v); setFk(k => k + 1) }

  let last = '', n = 0
  const items = []
  l.forEach(h => {
    if (hs === 'new') { const g = grp(h.at); if (g !== last) { last = g; items.push(<div key={'g' + g} className="dg">{g}</div>) } }
    else if (!last) { last = 'x'; items.push(<div key="g" className="dg">Ranked by {hs === 'health' ? 'health' : 'size'}<small>{l.length} casts</small></div>) }
    items.push(<HistRow key={h.id} h={h} i={n++} anim={anim} sel={pk.includes(h.id)} on={on} />)
  })

  return (
    <section className={'view' + (view === 'history' ? ' on' : '')} id="v-history">
      <div className="hello rise" style={{ '--i': 0 }}>
        <div><div className="kick">Every atlas you have cast</div><h1 className="h1">The Chronicle</h1>
          <p className="sub">Each cast is kept by commit, so the same SHA always opens the same sky. Reopen one, set two side by side, or strike one from the record.</p></div>
        <button className="pb" onClick={focusCast}><Icon n="plus" /> Cast an atlas</button>
      </div>
      <div className="stats" key={hk}>
        <div className="stat rise" style={{ '--i': 1 }}><div className="n"><CountUp to={wk} /></div><div className="l">Casts this week</div></div>
        <div className="stat rise" style={{ '--i': 2 }}><div className="n"><CountUp to={ar} suf="%" /></div><div className="l">From the archive</div></div>
        <div className="stat rise" style={{ '--i': 3 }}><div className="n"><CountUp to={tr} /></div><div className="l">Troubled casts</div></div>
        <div className="stat rise" style={{ '--i': 4 }}><div className="n">{av.toFixed(1)} s</div><div className="l">Average cast</div></div>
      </div>
      {pair && <Compare a={pair[0]} b={pair[1]} clear={() => setPicks([])} />}
      <div className="hf rise" style={{ '--i': 5 }}>
        <div className="sbx"><Icon n="search" /><input value={hq} onChange={e => { setHq(e.target.value.trim().toLowerCase()); setStill(key) }} placeholder="Search a repository or SHA" aria-label="Search the chronicle" /></div>
        <Seg v={hf} set={v => filt(setHf, v)} items={[['all', 'All'], ['cast', 'Cast'], ['cached', 'Archive'], ['trouble', 'Trouble']]} />
        <Seg v={hs} set={v => filt(setHs, v)} items={[['new', 'Newest'], ['health', 'Health'], ['size', 'Size']]} />
      </div>
      <p className="mono" style={{ margin: '0 0 4px' }}>Select two casts with the tick to compare them.</p>
      <div className="tl" key={key}>
        {items.length ? items : hist.length
          ? <div className="empty"><b>Nothing matches</b>No cast fits that search. Loosen the filter.</div>
          : <div className="empty"><b>The Chronicle is silent</b>You have not cast an atlas yet. Cast your first from the Sanctum.</div>}
      </div>
    </section>
  )
}
