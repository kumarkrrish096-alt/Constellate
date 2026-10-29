import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { authFetch } from '../auth/AuthService'
import AIExplanationPanel from './AIExplanationPanel'

vi.mock('../auth/AuthService', () => ({ authFetch: vi.fn() }))

const repository = { fullname: 'owner/repo', sha: 'a'.repeat(40) }
const file = { id: 0, path: 'src/module.js' }
const explanation = {
  summary: 'Runs the selected operation.',
  purpose: 'Coordinates a source-level operation.',
  behaviour: [{ description: 'Calls a helper.', lineStart: 2, lineEnd: 3 }],
  functions: [{ name: 'run', purpose: 'Runs the operation.', lineStart: 1, lineEnd: 4 }],
  dependencies: [{ path: 'src/helper.js', relationship: 'Provides the helper.' }],
  inputs: ['source'],
  outputs: ['result'],
  sideEffects: [],
  potentialIssues: [],
  limitations: ['Runtime behavior is not established statically.'],
}

function response(body, ok = true) {
  return Promise.resolve({ ok, json: async () => body })
}

afterEach(() => cleanup())

describe('AIExplanationPanel', () => {
  it('shows loading and a retryable provider error', async () => {
    const user = userEvent.setup()
    let rejectRequest
    authFetch.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectRequest = reject }))
    render(<AIExplanationPanel repository={repository} file={file} />)

    await user.click(screen.getByRole('button', { name: 'Explain file' }))
    expect(screen.getByRole('status').textContent).toContain('Building a source-grounded explanation')
    rejectRequest(new Error('Gemini API rate limit was reached.'))
    expect((await screen.findByRole('alert')).textContent).toContain('Gemini API rate limit was reached.')
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(2)
  })

  it('requests a function explanation and links line references to the code viewer', async () => {
    const user = userEvent.setup()
    authFetch
      .mockResolvedValueOnce(await response({ explanation, model: 'test-model', generatedAt: new Date().toISOString(), cacheHit: true }))
      .mockResolvedValueOnce(await response({ explanation, model: 'test-model', generatedAt: new Date().toISOString(), cacheHit: false }))
    const onJumpToLine = vi.fn()
    render(<AIExplanationPanel repository={repository} file={file} onJumpToLine={onJumpToLine} />)

    await user.click(screen.getByRole('button', { name: 'Explain file' }))
    await screen.findByText('Runs the selected operation.')
    await user.click(screen.getByRole('button', { name: 'run' }))

    await waitFor(() => expect(authFetch).toHaveBeenLastCalledWith('/api/explanations/function', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        fullname: repository.fullname,
        sha: repository.sha,
        filePath: file.path,
        functionName: 'run',
        functionLine: 1,
      }),
    })))
    await user.click(screen.getByTitle('Jump to line 2'))
    expect(onJumpToLine).toHaveBeenCalledWith(2)
  })

  it('sends follow-up questions with the current selected function identity', async () => {
    const user = userEvent.setup()
    authFetch
      .mockResolvedValueOnce(await response({ explanation, model: 'test-model', generatedAt: new Date().toISOString() }))
      .mockResolvedValueOnce(await response({ explanation, model: 'test-model', generatedAt: new Date().toISOString() }))
    render(<AIExplanationPanel repository={repository} file={file} />)

    await user.click(screen.getByRole('button', { name: 'Explain file' }))
    await screen.findByText('Runs the selected operation.')
    await user.click(screen.getByRole('button', { name: 'run' }))
    await waitFor(() => expect(authFetch).toHaveBeenLastCalledWith('/api/explanations/function', expect.anything()))
    await user.type(screen.getByRole('textbox', { name: 'Ask about this function' }), 'Why is this needed?')
    await user.click(screen.getByRole('button', { name: 'Send question' }))

    await waitFor(() => expect(authFetch).toHaveBeenLastCalledWith('/api/explanations/question', expect.objectContaining({
      body: JSON.stringify({
        fullname: repository.fullname,
        sha: repository.sha,
        filePath: file.path,
        functionName: 'run',
        functionLine: 1,
        question: 'Why is this needed?',
      }),
    })))
  })

  it('does not display an old file response after the selected file changes', async () => {
    const user = userEvent.setup()
    let resolveOldRequest
    let oldSignal
    authFetch.mockImplementationOnce((path, options) => {
      oldSignal = options.signal
      return new Promise(resolve => { resolveOldRequest = resolve })
    })
    const PanelHarness = ({ selectedFile }) => <AIExplanationPanel key={`${repository.sha}:${selectedFile.path}`} repository={repository} file={selectedFile} />
    const view = render(<PanelHarness selectedFile={file} />)
    await user.click(screen.getByRole('button', { name: 'Explain file' }))

    view.rerender(<PanelHarness selectedFile={{ ...file, path: 'src/new.js' }} />)
    expect(oldSignal.aborted).toBe(true)
    resolveOldRequest(await response({ explanation: { ...explanation, summary: 'STALE OLD FILE ANSWER' } }))

    expect((await screen.findByText('src/new.js')).textContent).toBe('src/new.js')
    expect(screen.queryByText('STALE OLD FILE ANSWER')).toBeNull()
    expect(screen.getByRole('button', { name: 'Explain file' })).not.toBeNull()
  })
})