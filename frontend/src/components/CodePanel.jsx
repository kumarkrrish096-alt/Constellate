import { useEffect, useRef, useState } from 'react'
import AIExplanationPanel from './AIExplanationPanel'
import { useDash } from './DashContext'

export default function CodePanel({ i, data, repository }) {
  const { pickNode } = useDash()
  const [sourceState, setSourceState] = useState(null)
  const sourceRef = useRef(null)
  const node = data?.N[i]
  const file = node?.sourceFile
  const snapshot = data?.snapshot
  const path = file?.path || node?.name
  const outgoing = (snapshot?.edges || []).filter(edge => edge.s === file?.id)
  const incoming = (snapshot?.edges || []).filter(edge => edge.t === file?.id)
  const cochange = (snapshot?.cochange || []).filter(pair => pair.a === file?.id || pair.b === file?.id)
  const imports = outgoing.map(edge => ({ file: snapshot.files[edge.t], edge })).filter(item => item.file)
  const importers = incoming.map(edge => ({ file: snapshot.files[edge.s], edge })).filter(item => item.file)

  useEffect(() => {
    if (i < 0 || !data || !repository || !path || !/^[0-9a-f]{40}$/i.test(repository.sha)) return
    const controller = new AbortController()
    let active = true
    const encodedPath = path.split('/').map(encodeURIComponent).join('/')
    fetch(`https://raw.githubusercontent.com/${repository.fullname}/${repository.sha}/${encodedPath}`, {
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'text/plain' },
    }).then(async response => {
      if (!response.ok) throw new Error('Source is unavailable for this commit.')
      const length = Number(response.headers.get('content-length'))
      if (length > 1024 * 1024) throw new Error('Source file exceeds the 1 MB viewer limit.')
      const text = await response.text()
      if (text.length > 1024 * 1024) throw new Error('Source file exceeds the 1 MB viewer limit.')
      if (active) setSourceState({ path, status: 'ready', source: text })
    }).catch(error => {
      if (active && error.name !== 'AbortError') setSourceState({ path, status: 'error', message: error.message || 'Source could not be loaded.' })
    })
    return () => { active = false; controller.abort() }
  }, [data, i, path, repository])

  const currentSource = sourceState?.path === path ? sourceState : null
  if (i < 0) return <p className="sub" style={{ margin: 0 }}>Pick a star in the atlas to read its file.</p>
  if (!data || !node || !file) return <p className="sub" style={{ margin: 0 }}>Run an analysis to view real source and architecture details.</p>
  const selectPath = target => {
    const id = data.filesByPath.get(target)
    if (Number.isInteger(id)) pickNode(id)
  }
  const jumpToLine = line => sourceRef.current?.querySelector(`[data-line="${line}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return (
    <>
      <div className="kv">
        <span>lines <b>{file.lines ?? 'unknown'}</b></span><span>complexity <b>{file.complexity ?? 'unknown'}</b></span><span>tokens <b>{file.tokens?.toLocaleString() ?? 'unknown'}</b></span><span>health <b>{file.health?.score ?? 'unknown'}</b></span><span>blast <b>{file.blastradius ?? 'unknown'}</b></span>
      </div>
      <div className="mono">Imports</div>
      <div className="imps">{imports.length ? imports.map(({ file: dependency, edge }) => <button className="chip" key={dependency.id} onClick={() => selectPath(dependency.path)}>{dependency.path} · {edge.kinds.join(', ')}</button>) : <span className="mono">none in analyzed graph</span>}</div>
      <div className="mono">Imported by {importers.length} · reaches {file.blastradius ?? 'unknown'} files</div>
      {importers.length > 0 && <><div className="mono">Imported by</div><div className="imps">{importers.map(({ file: importer, edge }) => <button className="chip" key={importer.id} onClick={() => selectPath(importer.path)}>{importer.path} · line {edge.lines?.join(', ') || 'unknown'}</button>)}</div></>}
      {cochange.length > 0 && <><div className="mono">Changed together</div><div className="imps">{cochange.map(pair => { const id = pair.a === file.id ? pair.b : pair.a; const partner = snapshot.files[id]; return partner ? <button className="chip" key={id} onClick={() => selectPath(partner.path)}>{partner.path} · {pair.count} commits</button> : null })}</div></>}
      <AIExplanationPanel key={`${repository?.sha}:${path}`} repository={repository} file={file} onJumpToLine={jumpToLine} />
      <div className="mono">Source · {repository.fullname}@{repository.sha.slice(0, 7)} · {path}</div>
      {!currentSource && <p className="sub">Loading source from the pinned public commit…</p>}
      {currentSource?.status === 'error' && <p className="err" role="alert">{currentSource.message}</p>}
      {currentSource?.status === 'ready' && <div className="code" ref={sourceRef}>{currentSource.source.split('\n').map((line, index) => <div key={index} data-line={index + 1}><i>{index + 1}</i><span>{line || ' '}</span></div>)}</div>}
    </>
  )
}
