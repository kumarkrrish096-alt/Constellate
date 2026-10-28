import { useEffect, useRef } from 'react'
import { Atlas } from '../lib/atlas'
import { usePrefs } from './Prefs'

export default function AtlasCanvas({ className, label, mini, data, onReady, onHover, onClick }) {
  const cv = useRef(), { theme, calm } = usePrefs()
  const pr = useRef({ theme, calm }), cb = useRef({ onHover, onClick })
  useEffect(() => { pr.current = { theme, calm }; cb.current = { onHover, onClick } })
  useEffect(() => {
    const env = { calm: () => pr.current.calm, theme: () => pr.current.theme }
    const opts = mini ? { mini: true } : { inter: true, hover: (h, x, y) => cb.current.onHover?.(h, x, y), click: h => cb.current.onClick?.(h) }
    const a = Atlas(cv.current, opts, env, data)
    onReady?.(a)
    let raf, t0 = 0
    const loop = t => {
      raf = requestAnimationFrame(loop)
      if (document.hidden) return
      const dt = Math.min(.05, (t - t0) / 1000 || .016); t0 = t
      if (cv.current.offsetParent) a.tick(dt)
    }
    raf = requestAnimationFrame(loop)
    const rs = () => a.resize(); addEventListener('resize', rs)
    const t = setTimeout(rs, 80)
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', rs); clearTimeout(t); a.destroy?.() }
    // eslint-disable-next-line
  }, [data])
  return <canvas ref={cv} className={className} aria-label={label} />
}
