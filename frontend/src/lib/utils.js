import { N, F, CO, ring } from './data'

export const dl = (data, name, type) => {
  const b = data instanceof Blob ? data : new Blob([data], { type })
  const u = URL.createObjectURL(b), a = document.createElement('a')
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(u), 1500)
}
export const ago = t => {
  const m = Math.round((Date.now() - t) / 6e4)
  if (m < 1) return 'just now'
  if (m < 60) return m + 'm ago'
  const h = Math.round(m / 60)
  if (h < 24) return h + 'h ago'
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : d + 'd ago'
}
export const castsThisWeek = hist => hist.filter(h => Date.now() - h.at < 7 * 864e5).length
export const dur = ms => (ms ? (ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(1) + ' s') : 'none')
export const cm = n => n.name.replace(/\.ts$/, '').split('/').pop().replace(/[-.](\w)/g, (m, c) => c.toUpperCase())
export const esc = s => s.replace(/</g, '&lt;')
export const STL = { cast: 'Cast', cached: 'From the archive', partial: 'Partial cast', fizzled: 'Fizzled' }
export const snapshot = repo => {
  const t = repo.split(' · ')
  return {
    repository: t[0], sha: t[1] || '', tool: 'Constellate',
    files: N.map(n => ({ path: n.name, cluster: F[n.k], complexity: n.cx, churn: n.ch, tokens: n.tok, health: n.h, blastRadius: n.bl, imports: n.out.map(j => N[j].name) })),
    importCycles: [ring.map(i => N[i].name)],
    coChange: CO.map(c => ({ a: N[c.a].name, b: N[c.b].name, commits: c.w })),
  }
}
export const loadHist = seed => {
  let h = null
  try { h = JSON.parse(localStorage.getItem('cs-hist')) } catch { /* ignore */ }
  return Array.isArray(h) && h.length ? h : seed()
}
