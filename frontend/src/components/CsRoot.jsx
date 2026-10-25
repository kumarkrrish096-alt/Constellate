import { useEffect, useRef } from 'react'
import { usePrefs } from './Prefs'
import { makeStars } from '../lib/stars'
import useScrollUnlock from './shared/useScrollUnlock'
import './shared/theme.css'
import '../dashboard.css'

/** The themed #cs wrapper + twinkling sky shared by every page. */
export default function CsRoot({ extra = '', children }) {
  const isDash = extra.includes('dash')
  useScrollUnlock(!isDash)
  const { theme, calm } = usePrefs()
  const pr = useRef({ theme, calm }), cv = useRef()
  useEffect(() => { pr.current = { theme, calm } })
  useEffect(() => {
    const c = cv.current
    const draw = makeStars(c, { calm: () => pr.current.calm, theme: () => pr.current.theme })
    let raf, tl = 0
    const f = t => { raf = requestAnimationFrame(f); if (document.hidden) return; draw(Math.min(.05, (t - tl) / 1000 || .016)); tl = t }
    raf = requestAnimationFrame(f)
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', c._rs) }
  }, [])
  return (
    <div id="cs" data-t={theme} className={(calm ? 'calm ' : '') + extra}>
      <canvas ref={cv} className="sky" />
      {children}
    </div>
  )
}
