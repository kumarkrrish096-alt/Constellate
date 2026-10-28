import { useEffect, useMemo, useState } from 'react'
import AtlasCanvas from '../components/AtlasCanvas'
import CodePanel from '../components/CodePanel'
import Icon from '../components/Icon'
import { useDash } from '../components/DashContext'
import { usePrefs } from '../components/Prefs'
import { N, PAL } from '../lib/data'
import { dl, snapshot } from '../lib/utils'
import { snapshotAtlas } from '../lib/snapshotAtlas'

const MODES = [['force', 'Force'], ['tree', 'Hierarchy'], ['heat', 'Heatmap']]

export default function AtlasView() {
  const { view, repo, repository, snapshot: analyzedSnapshot, atRef, sel, note, pickNode, dd, setDd, say, mode, setAtlasMode } = useDash()
  const { theme } = usePrefs(), p = PAL[theme]
  const [co, setCo] = useState(false), [q, setQ] = useState(''), [tt, setTt] = useState({ t: '', x: 0, y: 0, on: false })
  const graphData = useMemo(() => analyzedSnapshot ? snapshotAtlas(analyzedSnapshot) : null, [analyzedSnapshot])
  const nodes = useMemo(() => graphData?.N || N, [graphData])
  const t = q.trim().toLowerCase(), m = t ? nodes.filter(n => n.name.toLowerCase().includes(t)).slice(0, 6) : []
  useEffect(() => { atRef.current?.setQ(t ? new Set(nodes.filter(n => n.name.toLowerCase().includes(t)).slice(0, 6).map(n => n.id)) : null) }, [t, atRef, nodes])
  const sha = repository?.sha || repo.split(' · ')[1]

  const clear = () => { setQ(''); setDd(null) }
  const choose = id => { clear(); pickNode(id) }
  const exp = k => {
    setDd(null); const at = atRef.current
    if (k === 'png') at.png(b => { dl(b, 'constellate-atlas.png'); say('PNG saved') })
    else if (k === 'svg') { dl(at.svg(), 'constellate-atlas.svg', 'image/svg+xml'); say('SVG saved') }
    else { dl(JSON.stringify(analyzedSnapshot || snapshot(repo), null, 2), 'constellate-snapshot.json', 'application/json'); say('JSON snapshot saved') }
  }
  const legend = mode === 'heat'
    ? [[`rgba(${p.ink},.5)`, 'low risk'], [p.gold, 'medium'], [p.hot, 'high risk']]
    : [[`rgba(${p.gr},.25)`, 'module region', `1px solid rgba(${p.gr},.6)`], [p.hot, 'import cycle'], ['transparent', 'god file', `1.5px solid ${p.gold}`], [p.gold, 'gold = dependencies'], [p.hot, 'rose = dependents']]
  return (
    <section className={'view' + (view === 'atlas' ? ' on' : '')} id="v-atlas">
      <div className="hello rise" style={{ '--i': 0 }}>
        <div><div className="kick">{repo}</div><h1 className="h1">Dependency atlas</h1><p className="sub">Click a star to light up what it uses and what uses it.</p></div>
        <button onClick={() => { try { navigator.clipboard.writeText(location.origin + '/r/' + sha) } catch { /* ignore */ } say(`Permalink for ${sha} copied`) }}><Icon n="share" /> Copy permalink</button>
      </div>
      <div className="atg">
        <div className="card rise" style={{ '--i': 1 }}>
          <div className="ct">
            <div className="seg">{MODES.map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => { setAtlasMode(k); atRef.current.reset() }}>{l}</button>)}</div>
            <div className="row">
              <button className={'tg' + (co ? ' on' : '')} aria-pressed={co} title="Files edited together, even without imports" onClick={() => { atRef.current.co = !co; setCo(!co) }}><Icon n="arrows-exchange" /> Co-change</button>
              <div style={{ position: 'relative' }}>
                <button onClick={e => { e.stopPropagation(); setDd(dd === 'exm' ? null : 'exm') }}><Icon n="download" /> Export</button>
                <div className={'dd list' + (dd === 'exm' ? ' on' : '')} style={{ top: 44, right: 0, minWidth: 210 }}>
                  <button onClick={() => exp('png')}><Icon n="photo" />PNG image</button>
                  <button onClick={() => exp('svg')}><Icon n="vector" />SVG vector</button>
                  <button onClick={() => exp('json')}><Icon n="braces" />JSON snapshot</button>
                </div>
              </div>
              <button aria-label="Zoom in" onClick={() => atRef.current.zoom(1.3)}><Icon n="plus" /></button>
              <button aria-label="Zoom out" onClick={() => atRef.current.zoom(.77)}><Icon n="minus" /></button>
              <button aria-label="Reset view" onClick={() => atRef.current.reset()}><Icon n="focus-2" /></button>
            </div>
          </div>
          <div className="sb">
            <Icon n="search" />
            <input id="q" value={q} autoComplete="off" placeholder="Find a file or symbol in this atlas" aria-label="Find a file in the atlas"
              onChange={e => { setQ(e.target.value); setDd(e.target.value.trim() ? 'sres' : null) }}
              onKeyDown={e => { if (e.key === 'Enter' && m[0]) choose(m[0].id); if (e.key === 'Escape') clear() }} />
            <span className="kb">/</span>
            <div className={'dd list' + (dd === 'sres' ? ' on' : '')} style={{ top: 46, left: 0, right: 0 }}>
              {m.length ? m.map(n => <button key={n.id} onClick={() => choose(n.id)}><Icon n="file" />{n.name}<span className="mn">cx {n.cx}</span></button>) : <a className="mono">No files match that search.</a>}
            </div>
          </div>
          <div className="mapw">
            <AtlasCanvas key={repository?.sha || 'demo-atlas'} data={graphData || undefined} className="cv big" label="Interactive dependency graph" onReady={a => (atRef.current = a)} onClick={pickNode}
              onHover={(h, x, y) => (h < 0 || !nodes[h] ? setTt(s => ({ ...s, on: false })) : setTt({ t: nodes[h].name + ' · cx ' + nodes[h].cx, x: x + 12, y: y - 8, on: true }))} />
            <div className="tt" style={{ left: tt.x, top: tt.y, opacity: tt.on ? 1 : 0 }}>{tt.t}</div>
          </div>
          <div className="lgd mono">
            {legend.map(([bg, l, bd]) => <span key={l}><i style={{ background: bg, border: bd }} />{l}</span>)}
            {co && <span><i style={{ background: 'transparent', border: `1.5px dotted ${p.gold}` }} />edited together</span>}
          </div>
        </div>
        <div className="card rise" style={{ '--i': 2 }}>
          <div className="ct"><h3>Code panel</h3><span className="mono">{sel >= 0 ? nodes[sel]?.name : note || 'no file selected'}</span></div>
          <div className="pnl"><CodePanel i={sel} data={graphData} repository={repository} /></div>
        </div>
      </div>
    </section>
  )
}
