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
  const [activeTab, setActiveTab] = useState('summary')
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
      try { body = await response.json() } catch { /* fallback */ }
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
      {/* Top Header: 'Ask / Explain File' button on the left of the file path */}
      <div className="ai-explanation-head">
        <div className="ai-head-left">
          {status === 'idle' && (
            <button type="button" className="pb ai-explain-btn" onClick={() => requestExplanation('file')}>
              Explain file
            </button>
          )}
          {(status === 'error' || status === 'ready') && (
            <button
              type="button"
              className="pb ai-explain-btn"
              onClick={() => requestExplanation(activeQuestion ? 'question' : (selectedFunction ? 'function' : 'file'), selectedFunction, activeQuestion)}
            >
              Retry
            </button>
          )}
          <div className="ai-file-badge">
            <span className="mono">
              {selectedFunction ? `${selectedFunction.name} · line ${selectedFunction.lineStart}` : file.path}
            </span>
            {activeQuestion && <span className="tag">Q&A</span>}
          </div>
        </div>
        <h3 id="ai-explanation-title" className="ai-panel-title">AI explanation</h3>
      </div>

      {status === 'idle' && (
        <div className="ai-idle-card">
          <p className="ai-idle-msg">
            Click <b>Explain file</b> above to generate a source-grounded explanation and unlock the follow-up Q&A assistant for this file.
          </p>
        </div>
      )}

      {status === 'loading' && <p className="sub" role="status">Building a source-grounded explanation…</p>}
      {status === 'error' && (
        <div className="ai-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => requestExplanation(selectedFunction ? 'function' : 'file')}>Retry</button>
        </div>
      )}

      {/* Active Question Banner */}
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

      {/* Follow-up question bar unlocked once file is explained */}
      {(status === 'ready' || isAsking || questionError) && (
        <form className="ai-question" onSubmit={submitQuestion}>
          <label className="mono" htmlFor="ai-question-input">
            Ask about this {selectedFunction ? 'function' : 'file'}
          </label>
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
              placeholder={`Ask a question about this ${selectedFunction ? 'function' : 'file'}…`}
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
      )}

      {/* Sleek Middle AI Answer Card */}
      {explanation && (status === 'ready' || isAsking) && (
        <div className="ai-card">
          <div className="ai-card-content">
            <p className="ai-summary">{explanation.summary}</p>
            {meta?.cacheHit && <p className="mono">Cached explanation · {meta.model}</p>}

            {explanation.purpose && (
              <div className="ai-purpose-box">
                <span className="mono ai-section-label">PURPOSE</span>
                <p>{explanation.purpose}</p>
              </div>
            )}

            {behaviour.length > 0 && (
              <div className="ai-behaviour-box">
                <span className="mono ai-section-label">BEHAVIOUR</span>
                <div className="ai-list">
                  {behaviour.map((item, index) => (
                    <p key={`${item.lineStart}-${index}`}>
                      <LineReference start={item.lineStart} end={item.lineEnd} onJump={onJumpToLine} />
                      {item.description}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {functions.length > 0 && (
              <div className="ai-functions-box">
                <span className="mono ai-section-label">FUNCTIONS</span>
                <div className="ai-list">
                  {functions.map((fn, index) => (
                    <div key={`${fn.name}-${index}`} className="ai-fn-item">
                      <div className="ai-fn-head">
                        <button type="button" className="ai-function" onClick={() => selectFunction(fn)}>{fn.name}</button>
                        <LineReference start={fn.lineStart} end={fn.lineEnd} onJump={onJumpToLine} />
                      </div>
                      <p className="ai-fn-purpose">{fn.purpose}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dependencies.length > 0 && (
              <div className="ai-deps-box">
                <span className="mono ai-section-label">DEPENDENCIES</span>
                <div className="ai-list">
                  {dependencies.map((item, index) => (
                    <p key={`${item.path}-${index}`}><code>{item.path}</code> {item.relationship}</p>
                  ))}
                </div>
              </div>
            )}

            <details className="fq">
              <summary>Inputs, outputs and side effects</summary>
              <div className="ai-list">
                <p><b>Inputs:</b> {(explanation.inputs || []).join('; ') || 'Not established'}</p>
                <p><b>Outputs:</b> {(explanation.outputs || []).join('; ') || 'Not established'}</p>
                <p><b>Side effects:</b> {(explanation.sideEffects || []).join('; ') || 'None identified'}</p>
              </div>
            </details>

            {potentialIssues.length > 0 && (
              <div className="ai-issues-box">
                <span className="mono ai-section-label">POTENTIAL ISSUES</span>
                <div className="ai-list">
                  {potentialIssues.map((item, index) => (
                    <p key={`${item.lineStart}-${index}`} className="ai-issue-item">
                      <LineReference start={item.lineStart} end={item.lineEnd} onJump={onJumpToLine} />
                      {item.description}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {explanation.limitations?.length > 0 && (
              <details className="fq">
                <summary>Limitations</summary>
                <div className="ai-list">
                  {explanation.limitations.map((item, index) => <p key={index}>• {item}</p>)}
                </div>
              </details>
            )}
          </div>

          <div className="ai-card-footer">
            <span className="mono">{meta?.model}{meta?.generatedAt ? ` · ${new Date(meta.generatedAt).toLocaleString()}` : ''}</span>
          </div>
        </div>
      )}
    </section>
  )
}


