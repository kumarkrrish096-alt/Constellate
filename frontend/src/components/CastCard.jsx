import { useState, useRef } from 'react'
import Icon from './Icon'
import { useDash } from './DashContext'

const STEPS = [['Invoke', 'Format checked'], ['Consult the archive', 'Resolving commit SHA'], ['Join the queue', 'Job created, stream open'], ['Gather the scrolls', 'Shallow clone, limits'], ['Read the runes', 'Tree-sitter ASTs'], ['Draw the constellation', 'Imports, cycles, clusters'], ['Study the chronicle', 'Churn, co-change'], ['Seal the snapshot', 'Written by SHA'], ['Reveal the atlas', 'Ready to explore']]
const wait = ms => new Promise(r => setTimeout(r, ms))
const GH = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i

export default function CastCard() {
  const { hist, setHist, url, setUrl, urlRef, setRepo, setStats, setStatus, setNewId, say, go } = useDash()
  const [err, setErr] = useState(''), [run, setRun] = useState(null), [drag, setDrag] = useState(false)
  const busy = useRef(false), seq = useRef(0)

  async function cast(name) {
    if (busy.current) return
    busy.current = true
    const st = Array(9).fill(''); let log = [], pct = 0
    const upd = (done = false) => setRun({ st: [...st], log: [...log], pct, done })
    const prior = hist.find(h => h.n.toLowerCase() === name.toLowerCase() && h.st !== 'fizzled'), hit = !!prior, t0 = Date.now()
    const sha = hit ? prior.s : Array.from({ length: 7 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
    const files = hit ? prior.f : 200 + Math.floor(Math.random() * 900)
    const msg = ['Invocation accepted for ' + name, hit ? 'Found in the archive at ' + sha : 'HEAD resolved to ' + sha + '. No snapshot yet', 'Queued. Position 1 of 1', 'Cloned at depth 1. 38 binaries skipped', 'Reading the runes…', 'Constellation drawn. Clusters via Louvain', 'Reading the last 12 months of history', 'Snapshot sealed atomically', 'The atlas is revealed']
    const push = m => { log = [...log, { k: seq.current++, t: m }].slice(-8) }
    upd()
    for (let i = 0; i < 9; i++) {
      if (hit && i >= 2 && i <= 7) { st[i] = 'skip'; upd(); continue }
      st[i] = 'run'; push(msg[i]); upd()
      setStatus({ t: 'Casting ' + name, s: `Step ${i + 1} of 9 · ${STEPS[i][0]}`, p: i / 9 })
      if (i === 4) {
        await new Promise(r => {
          const p0 = performance.now()
          const f = t => {
            const p = Math.min(1, (t - p0) / 1500)
            log = [...log.slice(0, -1), { ...log[log.length - 1], t: `${Math.round(files * p).toLocaleString()} of ${files.toLocaleString()} files read` }]
            upd()
            if (p < 1) requestAnimationFrame(f); else r()
          }
          requestAnimationFrame(f)
        })
      } else await wait(i === 0 ? 350 : hit ? 420 : 650)
      st[i] = 'done'; pct = (i + 1) / 9 * 100; upd()
      setStatus({ t: 'Casting ' + name, s: `Step ${i + 1} of 9 · ${STEPS[i][0]}`, p: (i + 1) / 9 })
    }
    const e = {
      id: Date.now(), n: name, s: sha, l: hit ? prior.l : 'TypeScript', f: files,
      h: hit ? prior.h : 60 + Math.floor(Math.random() * 30), cy: hit ? prior.cy : Math.floor(Math.random() * 5),
      g: hit ? prior.g : Math.floor(Math.random() * 4), st: hit ? 'cached' : 'cast', ms: Date.now() - t0, at: Date.now(),
    }
    setHist(h => [e, ...h]); setNewId(e.id); setRepo(name + ' · ' + sha)
    if (!hit) setStats(s => ({ a: s.a + 1, f: s.f + files }))
    upd(true)
    say(hit ? 'Found in the archive. Atlas revealed' : 'Atlas cast for ' + name)
    setStatus({ t: 'Atlas ready', s: name + ' · ' + sha, p: 1 })
    busy.current = false
    setTimeout(() => { if (!busy.current) setStatus({ t: '', s: '', p: null }) }, 4500)
  }
  const submit = () => {
    const m = url.trim().match(GH)
    if (!m) { setErr('Enter a public GitHub URL like github.com/owner/repo.'); urlRef.current?.focus(); return }
    setErr(''); cast(m[1])
  }
  const zip = f => {
    if (!f) return
    if (!/\.zip$/i.test(f.name)) { setErr('That file is not a .zip. Choose a zip archive of your repository.'); return }
    setErr(''); cast(f.name.replace(/\.zip$/i, ''))
  }
  const fill = v => { setUrl(v); setErr('') }
  return (
    <div className="card rise" style={{ '--i': 5 }} id="an">
      <div className="ct"><h3>Cast a new atlas</h3><span className="mono">URL or zip · code is read, never run</span></div>
      <div className="row">
        <input ref={urlRef} value={url} onChange={e => { setUrl(e.target.value); setErr('') }} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="https://github.com/expressjs/express" aria-label="GitHub repository URL" />
        <button className="pb" onClick={submit}>Cast atlas</button>
      </div>
      <p className="err" role="alert">{err}</p>
      <div className="hint"><span className="mono">Try</span>
        <button className="chip" onClick={() => fill('https://github.com/expressjs/express')}>expressjs/express (from the archive)</button>
        <button className="chip" onClick={() => fill('https://github.com/pallets/click')}>pallets/click (full cast)</button>
      </div>
      <label className={'dz' + (drag ? ' drag' : '')}
        onDragEnter={e => { e.preventDefault(); setDrag(true) }} onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={e => { e.preventDefault(); setDrag(false) }} onDrop={e => { e.preventDefault(); setDrag(false); zip(e.dataTransfer.files[0]) }}>
        <Icon n="file-zip" />Drop a .zip here or browse
        <input type="file" accept=".zip" style={{ display: 'none' }} onChange={e => { zip(e.target.files[0]); e.target.value = '' }} />
      </label>
      <div className={'pipe' + (run ? ' on' : '')}>
        <div className="pbar"><i style={{ width: (run?.pct || 0) + '%' }} /></div>
        <div className="pg">
          <ul className="pl">
            {STEPS.map((s, i) => (
              <li key={i} className={run?.st[i] || ''}><span className="ic">{run?.st[i] === 'done' && <Icon n="check" />}</span>{s[0]}<small>{s[1]}</small></li>
            ))}
          </ul>
          <div className="lgb" aria-live="polite">{run?.log.map(l => <div key={l.k}><b>›</b> {l.t}</div>)}</div>
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          {run?.done && <button className="pb" onClick={() => go('atlas')}>Open atlas <Icon n="arrow-right" /></button>}
        </div>
      </div>
    </div>
  )
}
