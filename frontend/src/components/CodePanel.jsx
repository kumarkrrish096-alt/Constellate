import { N as defN, CO as defCO, god as defGod, cyc as defCyc } from '../lib/data';
import { cm, esc } from '../lib/utils';
import { useDash } from './DashContext';

const hl = (t) =>
  esc(t)
    .replace(/\b(import|from|export|function|const|return|class|type|interface)\b/g, '<b class="k" style="font-weight:400">$1</b>')
    .replace(/'[^']*'/g, (m) => `<span class="s">${m}</span>`)
    .replace(/"[^"]*"/g, (m) => `<span class="s">${m}</span>`);

export default function CodePanel({ i, data }) {
  const { activeData, pickNode } = useDash();
  const ds = data || activeData;
  const N = ds?.N || defN;
  const CO = ds?.CO || defCO;
  const god = ds?.god !== undefined ? ds.god : defGod;
  const cyc = ds?.cyc || defCyc;

  if (i < 0 || !N[i]) {
    return <p className="sub" style={{ margin: 0 }}>Pick a star in the atlas to inspect its source & dependency metrics.</p>;
  }

  const n = N[i];
  const co = (CO || [])
    .filter((c) => c.a === i || c.b === i)
    .map((c) => ({ j: c.a === i ? c.b : c.a, w: c.w || 1 }))
    .filter((c) => N[c.j]);

  const L = [];
  (n.out || []).slice(0, 5).forEach((j) => {
    if (N[j]) {
      const cleanTarget = N[j].name.replace(/\.[^/.]+$/, '');
      L.push({
        t: `import { ${cm(N[j])} } from './${cleanTarget}'`,
        cy: cyc.has(i) && cyc.has(j),
      });
    }
  });

  if (n.out && n.out.length) L.push({ t: '' });
  if (i === god && god >= 0) L.push({ t: `// Architectural god file: imported directly by ${n.inn.length} components` });

  // If the backend AST parser extracted real exports / functions, display them
  if (Array.isArray(n.exports) && n.exports.length > 0) {
    L.push({ t: `// Exported symbols: ${n.exports.slice(0, 4).join(', ')}${n.exports.length > 4 ? '…' : ''}` });
  }

  const fnName = cm(n);
  L.push(
    { t: `export function ${fnName}(input: Context) {` },
    { t: '  // AST parsed file: complexity ' + n.cx + ', tokens ' + (n.tok || 0).toLocaleString() },
    { t: '  return analyze(input).filter(Boolean);' },
    { t: '}' }
  );

  const Chip = ({ j, extra = '' }) =>
    N[j] ? (
      <button className="chip" onClick={() => pickNode(j)}>
        {N[j].name}
        {extra}
      </button>
    ) : null;

  return (
    <>
      <div className="kv">
        <span>tokens <b>{(n.tok || 0).toLocaleString()}</b></span>
        <span>complexity <b>{n.cx}</b></span>
        <span>churn <b>{n.ch}</b></span>
        <span>health <b>{n.h}</b></span>
        <span>blast <b>{n.bl}</b></span>
      </div>
      <div className="mono">Imports</div>
      <div className="imps">
        {n.out && n.out.length > 0 ? (
          n.out.map((j) => <Chip key={j} j={j} />)
        ) : (
          <span className="mono">none (root or leaf)</span>
        )}
      </div>
      <div className="mono">Imported by {(n.inn || []).length} · reaches {n.bl} files</div>
      {co.length > 0 && (
        <>
          <div className="mono">Edited together with</div>
          <div className="imps">
            {co.map((c) => (
              <Chip key={c.j} j={c.j} extra={' · ' + c.w} />
            ))}
          </div>
        </>
      )}
      <div className="code">
        {L.map((l, k) => (
          <div key={i + '-' + k} className={l.cy ? 'cy' : ''} style={{ animationDelay: k * 50 + 'ms' }}>
            <i>{k + 1}</i>
            <span>
              <span dangerouslySetInnerHTML={{ __html: hl(l.t) }} />
              {l.cy && <span className="cyt">circular import</span>}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
