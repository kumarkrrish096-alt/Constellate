const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches
const cx = 280, cy = 160
const NAMES = ["graph/index.ts", "graph/walk.ts", "core/types.ts", "api/router.ts", "ui/hooks.ts"]
const PT = NAMES.map((_, i) => {
  const a = -Math.PI / 2 + (i / 5) * Math.PI * 2
  return [cx + Math.cos(a) * 92, cy + Math.sin(a) * 92]
})
const LOOP = "M" + PT.map((p) => p.join(" ")).join("L") + "Z"
const OUTER = [[60, 50], [500, 60], [70, 270], [505, 262], [280, 22], [280, 300]]
const TARGET = [3, 1, 4, 2, 0, 2]

export default function CycleVisual() {
  return (
    <svg viewBox="0 0 560 320" role="img" aria-label="Five files importing each other in a loop with a spark circling">
      <circle className="cx-ring" cx={cx} cy={cy} r="128" fill="none" stroke="var(--gold)" strokeDasharray="2 8" strokeOpacity=".7" />
      {OUTER.map((o, i) => (
        <g key={i}>
          <path d={`M${o}L${PT[TARGET[i]]}`} stroke="var(--mute)" strokeOpacity=".35" />
          <circle cx={o[0]} cy={o[1]} r="2.6" fill="var(--mute)" />
        </g>
      ))}
      <path className="cx-flow" d={LOOP} fill="none" stroke="var(--red)" strokeWidth="1.6" strokeDasharray="8 6" />
      {PT.map((p, i) => {
        const right = p[0] > cx + 5, left = p[0] < cx - 5
        return (
          <g key={NAMES[i]}>
            <circle className="cx-cn" cx={p[0]} cy={p[1]} r="6.5" style={{ animationDelay: `${i}s` }} />
            <text x={p[0] + (right ? 14 : left ? -14 : 0)} y={p[1] + (i === 0 ? -14 : left || right ? 4 : 20)}
              textAnchor={right ? "start" : left ? "end" : "middle"} fontSize="11">{NAMES[i]}</text>
          </g>
        )
      })}
      <circle r="4" fill="var(--spark)" style={{ filter: "drop-shadow(0 0 6px #FF3B30)" }}>
        {!reduce && <animateMotion dur="5s" repeatCount="indefinite" path={LOOP} />}
      </circle>
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="20" style={{ fontFamily: "Pirata One,serif", fill: "var(--red)" }}>circular import</text>
    </svg>
  )
}
