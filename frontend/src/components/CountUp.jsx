import { useEffect, useRef, useState } from 'react'

export default function CountUp({ to, suf = '', ms = 1300 }) {
  const [v, setV] = useState(0), cur = useRef(0)
  useEffect(() => {
    const from = cur.current, t0 = performance.now()
    let raf
    const f = t => {
      const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3)
      cur.current = from + (to - from) * e; setV(Math.round(cur.current))
      if (p < 1) raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [to, ms])
  return <>{v.toLocaleString()}{suf}</>
}
