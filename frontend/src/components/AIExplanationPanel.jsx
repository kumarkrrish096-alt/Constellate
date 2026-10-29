import { useEffect, useRef, useState } from 'react'
import { authFetch } from '../auth/AuthService'

function LineReference({ start, end, onJump }) {
  if (!Number.isInteger(start) || start < 1) return null
  const last = Number.isInteger(end) && end >= start ? end : start
  return <button className="ai-line-ref" type="button" onClick={() => onJump(start)} title={`Jump to line ${start}`}>
    L{start}{last !== start ? `–${last}` : ''}
  </button>
}

export default function AIExplanationPanel({ repository, file, onJumpToLine }) {
  const [explanation, setExplanation] = useState(null)
  const [selectedFunction, setSelectedFunction] = useState(null)
  const [question, setQuestion] = useState('')
  const [activeQuestion, setActiveQuestion] = useState(null)
  const [isAsking, setIsAsking] = useState(false)
  const [questionError, setQuestionError] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [meta, setMeta] = useState(null)
  const requestId = useRef(0)
  const activeRequest = useRef(null)

  useEffect(() => () => activeRequest.current?.abort(), [])

  async function requestExplanation(task, targetFunction = selectedFunction, prompt = null) {
    const id = ++requestId.current
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller

    if (task === 'question') {
      setIsAsking(true)
      setQuestionError('')
    } else {
      setActiveQuestion(null)
      setQuestionError('')
      setError('')
      setExplanation(null)
    }

    setStatus('loading')
    setError('')

    try {
      const response = await authFetch(`/api/explanations/${task}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullname: repository.fullname,
          sha: repository.sha,
          filePath: file.path,
          ...(task === 'function' || (task === 'question' && targetFunction)
            ? { functionName: targetFunction.name, functionLine: targetFunction.lineStart }
            : {}),
          ...(prompt ? { question: prompt } : {}),
        }),
      })
      let body = {}
      try { body = await response.json() } catch { /* use the safe fallback below */ }
      if (!response.ok) throw new Error(body.error || 'Could not load an explanation.')
      if (id !== requestId.current) return
      setExplanation(body.explanation)
      setMeta({ model: body.model, generatedAt: body.generatedAt, cacheHit: body.cacheHit })
      if (task === 'question') {
        setActiveQuestion(prompt)
        setIsAsking(false)
      }
      setStatus('ready')
    } catch (requestError) {
      if (requestError.name === 'AbortError' || id !== requestId.current) return
      const message = requestError.message || 'Could not load an explanation.'
      if (task === 'question') {
        setQuestionError(message)
        setIsAsking(false)
        if (explanation) {
          setStatus('ready')
        } else {
          setError(message)
          setStatus('error')
        }
      } else {
        setError(message)
        setStatus('error')
      }
    }
  }

  function selectFunction(fn) {
    const target = { name: fn.name, lineStart: fn.lineStart }
    setSelectedFunction(target)
    requestExplanation('function', target)
  }

  function submitQuestion(event) {
    event.preventDefault()
    const prompt = question.trim()
    if (!prompt || prompt.length > 1000 || isAsking) return
    setQuestion('')
    requestExplanation('question', selectedFunction, prompt)
  }

  function submitSuggested(prompt) {
    if (!prompt || isAsking) return
    setQuestion('')
    requestExplanation('question', selectedFunction, prompt)
  }

  const behaviour = explanation?.behaviour || []
  const functions = explanation?.functions || []
  const dependencies = explanation?.dependencies || []
  const potentialIssues = explanation?.potentialIssues || []

  return (
    <section className="ai-explanation" aria-labelledby="ai-explanation-title">
      <div className="ai-explanation-head">
        <div>
          <h3 id="ai-explanation-title">AI explanation</h3>
          <p className="mono">
            {selectedFunction ? `${selectedFunction.name} · line ${selectedFunction.lineStart}` : file.path}
            {activeQuestion ? ' · Q&A' : ''}
          </p>
        </div>
        {status === 'idle' && <button type="button" className="pb" onClick={() => requestExplanation('file')}>Explain file</button>}
        {(status === 'error' || status === 'ready') && (
          <button type="button" onClick={() => requestExplanation(activeQuestion ? 'question' : (selectedFunction ? 'function' : 'file'), selectedFunction, activeQuestion)}>
            Retry
          </button>
        )}
      </div>

      {status === 'loading' && <p className="sub" role="status">Building a source-grounded explanation…</p>}
      {status === 'error' && (
        <div className="ai-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => requestExplanation(selectedFunction ? 'function' : 'file')}>Retry</button>
        </div>
      )}

      {activeQuestion && status === 'ready' && (
        <div className="ai-question-banner">
          <div className="ai-question-banner-body">
            <span className="tag">Question</span>
            <span className="ai-question-banner-text">“{activeQuestion}”</span>
          </div>
          <button
            type="button"
            className="ai-back-btn"
            onClick={() => { setActiveQuestion(null); requestExplanation(selectedFunction ? 'function' : 'file'); }}
          >
            Reset to full {selectedFunction ? 'function' : 'file'} view
          </button>
        </div>
      )}

      {explanation && (status === 'ready' || isAsking) && <>
        <p className="ai-summary">{explanation.summary}</p>
        {meta?.cacheHit && <p className="mono">Cached explanation · {meta.model}</p>}
        <details className="fq" open>
          <summary>Purpose</summary><div>{explanation.purpose}</div>
        </details>
        <details className="fq" open>
          <summary>Behaviour</summary>
          <div className="ai-list">{behaviour.length ? behaviour.map((item, index) => <p key={`${item.lineStart}-${index}`}><LineReference start={item.lineStart} end={item.lineEnd} onJump={onJumpToLine} />{item.description}</p>) : <p>No behaviour details were returned.</p>}</div>
        </details>
        {functions.length > 0 && <details className="fq">
          <summary>Functions</summary>
          <div className="ai-list">{functions.map((fn, index) => <p key={`${fn.name}-${index}`}><button type="button" className="ai-function" onClick={() => selectFunction(fn)}>{fn.name}</button><LineReference start={fn.lineStart} end={fn.lineEnd} onJump={onJumpToLine} />{fn.purpose}</p>)}</div>
        </details>}
        <details className="fq">
          <summary>Dependencies</summary>
          <div className="ai-list">{dependencies.length ? dependencies.map((item, index) => <p key={`${item.path}-${index}`}><code>{item.path}</code> {item.relationship}</p>) : <p>No in-repository dependencies were identified.</p>}</div>
        </details>
        <details className="fq">
          <summary>Inputs, outputs and side effects</summary>
          <div className="ai-list">
            <p><b>Inputs:</b> {(explanation.inputs || []).join('; ') || 'Not established'}</p>
            <p><b>Outputs:</b> {(explanation.outputs || []).join('; ') || 'Not established'}</p>
            <p><b>Side effects:</b> {(explanation.sideEffects || []).join('; ') || 'None identified from the supplied context'}</p>
          </div>
        </details>
        <details className="fq">
          <summary>Potential issues</summary>
          <div className="ai-list">{potentialIssues.length ? potentialIssues.map((item, index) => <p key={`${item.lineStart}-${index}`}><LineReference start={item.lineStart} end={item.lineEnd} onJump={onJumpToLine} />{item.description}</p>) : <p>No code-supported potential issues were identified.</p>}</div>
        </details>
        {explanation.limitations?.length > 0 && <details className="fq"><summary>Limitations</summary><div className="ai-list">{explanation.limitations.map((item, index) => <p key={index}>{item}</p>)}</div></details>}
        <p className="mono">{meta?.model}{meta?.generatedAt ? ` · ${new Date(meta.generatedAt).toLocaleString()}` : ''}</p>
      </>}

      <form className="ai-question" onSubmit={submitQuestion}>
        <label className="mono" htmlFor="ai-question-input">Ask about this {selectedFunction ? 'function' : 'file'}</label>
        {questionError && (
          <div className="ai-question-error" role="alert">
            <span>{questionError}</span>
            <button type="button" onClick={() => submitSuggested(activeQuestion || question)}>Retry</button>
          </div>
        )}
        <div className="ai-question-row">
          <input
            id="ai-question-input"
            value={question}
            disabled={isAsking}
            maxLength={1000}
            onChange={event => setQuestion(event.target.value)}
            placeholder="Ask a code-specific follow-up"
          />
          <button
            type="submit"
            disabled={!question.trim() || status === 'loading' || isAsking}
            aria-label="Send question"
          >
            {isAsking ? 'Asking…' : 'Ask'}
          </button>
        </div>
        <div className="ai-question-chips">
          <span className="mono">Quick ask:</span>
          <button type="button" disabled={isAsking || status === 'loading'} onClick={() => submitSuggested('What is the primary responsibility of this code?')}>Primary purpose</button>
          <button type="button" disabled={isAsking || status === 'loading'} onClick={() => submitSuggested('Are there any security vulnerabilities or edge-case bugs?')}>Risks & bugs</button>
          <button type="button" disabled={isAsking || status === 'loading'} onClick={() => submitSuggested('What are the main functions and dependencies?')}>Key functions</button>
        </div>
      </form>
    </section>
  )
}

