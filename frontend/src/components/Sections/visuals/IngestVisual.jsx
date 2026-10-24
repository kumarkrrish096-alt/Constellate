import { useEffect, useState } from "react"

const FILES = ["src/index.ts", "src/router.ts", "core/parser.ts", "graph/store.ts", "ui/panel.tsx", "api/queue.ts", "utils/cache.ts", "cycle/hooks.ts"]
const S = [[360, 110], [430, 80], [500, 130], [400, 170], [470, 215], [340, 235], [420, 270], [510, 255]]
const L = [[0, 1], [1, 2], [0, 3], [3, 4], [2, 4], [3, 5], [5, 6], [4, 7], [6, 7]]
const URL_TEXT = "github.com/owner/repo"
const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches

export default function IngestVisual({ inViewRef }) {
  const [typed, setTyped] = useState(reduce ? URL_TEXT : "")

  useEffect(() => {
    if (reduce) return
    const id = setInterval(() => {
      if (!inViewRef.current) return
      const t = (performance.now() % 8000) / 8000
      const n = Math.round(Math.min(1, t / 0.2) * URL_TEXT.length)
      setTyped((t < 0.9 ? URL_TEXT.slice(0, n) : "") + (t < 0.2 && n < URL_TEXT.length ? "|" : ""))
    }, 70)
    return () => clearInterval(id)
  }, [inViewRef])

  return (
    <svg viewBox="0 0 560 320" role="img" aria-label="Files from a repository fly out and become stars in a constellation">
      <rect x="16" y="14" width="528" height="30" fill="none" stroke="var(--gold)" strokeOpacity=".7" />
      <text x="28" y="34" fontSize="13">{typed}</text>
      {FILES.map((f, i) => {
        const y = 62 + i * 31, s = S[i], delay = `${i * 0.08}s`
        return (
          <g key={f}>
            <rect className="cx-chip" x="16" y={y} width="150" height="22" fill="none" stroke="var(--mute)" style={{ animationDelay: delay }} />
            <text className="cx-chip cx-m" x="24" y={y + 15} fontSize="11" style={{ animationDelay: delay }}>{f}</text>
            <circle className="cx-fl" cx="166" cy={y + 11} r="3.5" fill="var(--spark)"
              style={{ "--dx": `${s[0] - 166}px`, "--dy": `${s[1] - y - 11}px`, animationDelay: delay }} />
          </g>
        )
      })}
      {L.map(([a, b]) => (
        <path key={`${a}-${b}`} className="cx-ln cx-cl" d={`M${S[a]}L${S[b]}`} pathLength="1" stroke="var(--gold)" strokeWidth="1.2" strokeOpacity=".8" />
      ))}
      {S.map((s, i) => (
        <circle key={i} className="cx-st" cx={s[0]} cy={s[1]} r={i === 3 ? 6 : 4} fill={i === 3 ? "var(--gold)" : "var(--ink)"} style={{ animationDelay: `${i * 0.08}s` }} />
      ))}
    </svg>
  )
}
