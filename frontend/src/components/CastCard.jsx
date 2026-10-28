import { useState, useRef } from 'react'
import Icon from './Icon'
import { useDash } from './DashContext'
import { authFetch } from '../auth/AuthService'

const STEPS = ['Submit repository', 'Resolve commit', 'Analyze source', 'Load snapshot']
const GH = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i

export default function CastCard() {
  const { url, setUrl, urlRef, setRepo, setRepository, setSnapshot, setStats, setStatus, setNewId, setSel, say, go } = useDash()
  const [err, setErr] = useState(''), [run, setRun] = useState(null)
  const busy = useRef(false)

  async function cast(repoUrl) {
    if (busy.current) return
    busy.current = true
    setErr('')
    setRun({ step: 0, pct: 0, log: 'Submitting repository…', done: false })
    setStatus({ t: 'Analyzing repository', s: 'Submitting repository', p: 0 })
    try {
      const submitted = await authFetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl }),
      })
      const submission = await submitted.json()
      if (!submitted.ok) throw new Error(submission.error || 'Could not start repository analysis.')

      let job = submission
      if (submission.status !== 'ready') {
        if (!submission.jobId) throw new Error('The analysis service returned no job identifier.')
        setRun({ step: 1, pct: 0.1, log: `Commit resolved · ${submission.sha}`, done: false })
        const startedAt = Date.now()
        while (Date.now() - startedAt < 10 * 60 * 1000) {
          const response = await authFetch(`/api/jobs/${encodeURIComponent(submission.jobId)}`)
          job = await response.json()
          if (!response.ok) throw new Error(job.error || 'Could not read analysis status.')
          const pct = Math.max(0.1, Math.min(0.95, (job.progress || 0) / 100))
          setRun({ step: 2, pct, log: `${job.stage || job.status} · ${Math.round(job.progress || 0)}%`, done: false })
          setStatus({ t: 'Analyzing repository', s: `${job.stage || job.status} · ${Math.round(job.progress || 0)}%`, p: pct })
          if (job.status === 'done') break
          if (job.status === 'failed') throw new Error(job.error || 'Repository analysis failed.')
          await new Promise(resolve => setTimeout(resolve, 1200))
        }
        if (job.status !== 'done') throw new Error('Repository analysis is taking too long. You can try again later.')
      }

      const snapshotUrl = job.snapshotUrl || submission.snapshotUrl
      if (!snapshotUrl) throw new Error('The analysis completed without a snapshot URL.')
      setRun({ step: 3, pct: 0.97, log: 'Loading analyzed snapshot…', done: false })
      const snapshotResponse = await authFetch(snapshotUrl)
      if (!snapshotResponse.ok) throw new Error('Could not load the analyzed snapshot.')
      const snapshot = await snapshotResponse.json()
      const fullname = snapshot.repo?.fullname || submission.fullname || job.fullname
      const sha = snapshot.repo?.sha || submission.sha || job.sha
      if (!fullname || !/^[0-9a-f]{40}$/i.test(sha || '')) throw new Error('The snapshot has an invalid repository identity.')

      setSnapshot(snapshot)
      setRepository({ fullname, sha })
      setRepo(`${fullname} · ${sha.slice(0, 7)}`)
      setSel(-1)
      setStats(stats => ({ ...stats, a: stats.a + 1, f: snapshot.stats?.sourcefiles || snapshot.files?.length || 0 }))
      setNewId(Date.now())
      setRun({ step: 4, pct: 1, log: `${snapshot.stats?.sourcefiles || snapshot.files?.length || 0} analyzed files · ${sha.slice(0, 7)}`, done: true })
      setStatus({ t: 'Atlas ready', s: `${fullname} · ${sha.slice(0, 7)}`, p: 1 })
      say('Repository analysis complete')
    } catch (error) {
      const message = error.message || 'Could not analyze this repository.'
      setErr(message)
      setRun(null)
      setStatus({ t: 'Analysis failed', s: message, p: null })
    } finally {
      busy.current = false
    }
  }
  const submit = () => {
    const m = url.trim().match(GH)
    if (!m) { setErr('Enter a public GitHub URL like github.com/owner/repo.'); urlRef.current?.focus(); return }
    cast(`https://github.com/${m[1]}`)
  }
  const fill = v => { setUrl(v); setErr('') }
  return (
    <div className="card rise" style={{ '--i': 5 }} id="an">
      <div className="ct"><h3>Cast a new atlas</h3><span className="mono">Public GitHub repository · code is read, never run</span></div>
      <div className="row">
        <input ref={urlRef} value={url} onChange={e => { setUrl(e.target.value); setErr('') }} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="https://github.com/expressjs/express" aria-label="GitHub repository URL" />
        <button className="pb" onClick={submit}>Cast atlas</button>
      </div>
      <p className="err" role="alert">{err}</p>
      <div className="hint"><span className="mono">Try</span>
        <button className="chip" onClick={() => fill('https://github.com/expressjs/express')}>expressjs/express (from the archive)</button>
        <button className="chip" onClick={() => fill('https://github.com/pallets/click')}>pallets/click (full cast)</button>
      </div>
      <p className="mono">Analysis is pinned to the repository commit returned by GitHub.</p>
      <div className={'pipe' + (run ? ' on' : '')}>
        <div className="pbar"><i style={{ width: (run?.pct || 0) + '%' }} /></div>
        <div className="pg">
          <ul className="pl">
            {STEPS.map((label, i) => {
              const state = run?.step > i ? 'done' : run?.step === i && !run?.done ? 'run' : ''
              return <li key={label} className={state}><span className="ic">{state === 'done' && <Icon n="check" />}</span>{label}</li>
            })}
          </ul>
          <div className="lgb" aria-live="polite"><div><b>›</b> {run?.log}</div></div>
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          {run?.done && <button className="pb" onClick={() => go('atlas')}>Open atlas <Icon n="arrow-right" /></button>}
        </div>
      </div>
    </div>
  )
}
