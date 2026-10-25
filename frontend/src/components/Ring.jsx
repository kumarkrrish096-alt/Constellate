import { useEffect, useState } from 'react'

export default function Ring({ h }) {
  const c = 2 * Math.PI * 16, [o, setO] = useState(c)
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setO(c * (1 - h / 100))))
    return () => cancelAnimationFrame(r)
  }, [h, c])
  return (
    <div className="rg">
      <svg width="40" height="40" viewBox="0 0 38 38">
        <circle className="bg" cx="19" cy="19" r="16" />
        <circle className="fg" cx="19" cy="19" r="16" strokeDasharray={c} strokeDashoffset={o} />
      </svg>
      <b>{h}</b>
    </div>
  )
}
