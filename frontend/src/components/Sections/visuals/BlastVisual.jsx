const cx = 280, cy = 160
const R = [50, 92, 134], K = [5, 8, 12], T = [1.3, 2.6, 3.85]
const POS = []
R.forEach((r, k) => {
  for (let i = 0; i < K[k]; i++) {
    const a = (i / K[k]) * 6.283 + k * 0.5
    POS.push([cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r * 0.98, k, i])
  }
})
const G = POS.filter((p) => p[2] === 2)[3]

export default function BlastVisual() {
  return (
    <svg viewBox="0 0 560 320" role="img" aria-label="A change ripples outward from a god file through three rings of dependents">
      {R.map((r) => <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="var(--gold)" strokeOpacity=".3" strokeDasharray="2 5" />)}
      {POS.map(([x, y], i) => <path key={"l" + i} d={`M${cx} ${cy}L${x} ${y}`} stroke="var(--mute)" strokeOpacity=".14" />)}
      {POS.map(([x, y, k], i) => <circle key={"h" + i} className="cx-hop" cx={x} cy={y} r="3.4" style={{ animationDelay: `${T[k]}s` }} />)}
      <circle className="cx-pulse" cx={cx} cy={cy} r={134 * 1.25} fill="none" stroke="var(--spark)" strokeWidth="1.5" style={{ transform: "scale(.05)" }} />
      <circle cx={cx} cy={cy} r="11" fill="var(--gold)" style={{ filter: "drop-shadow(0 0 8px #FF3B30)" }} />
      <text x={cx} y={cy + 28} textAnchor="middle" fontSize="11">god file</text>
      <circle cx={G[0]} cy={G[1]} r="9" fill="none" stroke="var(--gold)" strokeDasharray="3 3" className="cx-ring" style={{ animation: "none" }} />
      <text className="cx-m" x={Math.min(G[0], 500)} y={G[1] + (G[1] > cy ? 24 : -16)} textAnchor="middle" fontSize="11">start here</text>
    </svg>
  )
}
