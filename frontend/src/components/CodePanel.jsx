import { N, CO, god, cyc } from '../lib/data'
import { cm, esc } from '../lib/utils'
import { useDash } from './DashContext'

const hl = t => esc(t)
  .replace(/\b(import|from|export|function|const|return)\b/g, '<b class="k" style="font-weight:400">$1</b>')
  .replace(/'[^']*'/g, m => `<span class="s">${m}</span>`)

export default function CodePanel({ i }) {
  const { pickNode } = useDash()
  if (i < 0) return <p className="sub" style={{ margin: 0 }}>Pick a star in the atlas to read its file.</p>
  const n = N[i]
  const co = CO.filter(c => c.a === i || c.b === i).map(c => ({ j: c.a === i ? c.b : c.a, w: c.w }))
  const L = []
  n.out.slice(0, 4).forEach(j => L.push({ t: `import { ${cm(N[j])} } from './${N[j].name.replace('.ts', '')}'`, cy: cyc.has(i) && cyc.has(j) }))
  if (n.out.length) L.push({ t: '' })
  if (i === god) L.push({ t: `// imported by ${n.inn.length} files directly` })
  L.push({ t: `export function ${cm(n)}(input: Input) {` }, { t: '  const ast = parse(input)' }, { t: '  return walk(ast).filter(Boolean)' }, { t: '}' })
  const Chip = ({ j, extra = '' }) => <button className="chip" onClick={() => pickNode(j)}>{N[j].name}{extra}</button>
  return (
    <>
      <div className="kv">
        <span>tokens <b>{n.tok.toLocaleString()}</b></span><span>complexity <b>{n.cx}</b></span><span>churn <b>{n.ch}</b></span><span>health <b>{n.h}</b></span><span>blast <b>{n.bl}</b></span>
      </div>
      <div className="mono">Imports</div>
      <div className="imps">{n.out.length ? n.out.map(j => <Chip key={j} j={j} />) : <span className="mono">none</span>}</div>
      <div className="mono">Imported by {n.inn.length} · reaches {n.bl} files</div>
      {co.length > 0 && <><div className="mono">Edited together with</div><div className="imps">{co.map(c => <Chip key={c.j} j={c.j} extra={' · ' + c.w} />)}</div></>}
      <div className="code">
        {L.map((l, k) => (
          <div key={i + '-' + k} className={l.cy ? 'cy' : ''} style={{ animationDelay: k * 50 + 'ms' }}>
            <i>{k + 1}</i>
            <span><span dangerouslySetInnerHTML={{ __html: hl(l.t) }} />{l.cy && <span className="cyt">circular import</span>}</span>
          </div>
        ))}
      </div>
    </>
  )
}
