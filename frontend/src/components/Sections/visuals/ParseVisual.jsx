const CODE = ["import { parse } from \u0027./parser\u0027", "export function build(src) {", "  const tree = parse(src)", "  return link(tree)", "}"]
const N = {
  p: [415, 36, "program", 0.2],
  i: [340, 106, "import_statement", 1.2],
  f: [470, 106, "function_declaration", 1.2],
  il: [340, 176, "\"./parser\"", 2.2],
  c: [470, 176, "call_expression", 2.2],
  pl: [470, 246, "parse(src)", 3.2],
}
const EDGES = [["p", "i", 1], ["p", "f", 1], ["i", "il", 2], ["f", "c", 2], ["c", "pl", 3]]

export default function ParseVisual() {
  const hl = (y, d) => <rect className="cx-hl" x="8" y={y - 15} width="262" height="22" style={{ animationDelay: `${d}s` }} />
  return (
    <svg viewBox="0 0 560 320" role="img" aria-label="Code lines become nodes of a syntax tree">
      {hl(62, 1.2)}
      {hl(118, 2.4)}
      {CODE.map((c, i) => (
        <text key={i} x="16" y={62 + i * 28} fontSize="11.5" className={i === 0 ? "" : "cx-m"} style={i === 0 ? { fill: "var(--ink)" } : undefined}>{c}</text>
      ))}
      {EDGES.map(([a, b, k]) => (
        <path key={a + b} className="cx-ed cx-dr" pathLength="1" stroke="var(--gold)" strokeWidth="1.2" style={{ animationDelay: `${k}s` }}
          d={`M${N[a][0]} ${N[a][1] + 11}C${N[a][0]} ${N[a][1] + 40},${N[b][0]} ${N[b][1] - 40},${N[b][0]} ${N[b][1] - 11}`} />
      ))}
      {Object.entries(N).map(([k, [x, y, t, d]]) => {
        const w = t.length * 5.6 + 16
        return (
          <g key={k} className="cx-nd" style={{ animationDelay: `${d}s` }}>
            <rect x={x - w / 2} y={y - 11} width={w} height="22" style={{ fill: "rgba(var(--scrim),.9)" }} stroke={k === "c" || k === "pl" ? "var(--red)" : "var(--gold)"} />
            <text x={x} y={y + 4} textAnchor="middle" fontSize="9.5">{t}</text>
          </g>
        )
      })}
    </svg>
  )
}
