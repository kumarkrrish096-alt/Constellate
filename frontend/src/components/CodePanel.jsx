import { useEffect, useRef, useState } from 'react';
import AIExplanationPanel from './AIExplanationPanel';
import { useDash } from './DashContext';
import { N as defN, CO as defCO, god as defGod, cyc as defCyc } from '../lib/data';
import { cm, esc } from '../lib/utils';

const hl = (t) =>
  esc(t)
    .replace(/\b(import|from|export|function|const|return|class|type|interface)\b/g, '<b class="k" style="font-weight:400">$1</b>')
    .replace(/'[^']*'/g, (m) => `<span class="s">${m}</span>`)
    .replace(/"[^"]*"/g, (m) => `<span class="s">${m}</span>`);

export default function CodePanel({ i, data, repository: propRepo }) {
  const { activeData, repository: ctxRepo, pickNode } = useDash();
  const ds = data || activeData;
  const repository = propRepo || ctxRepo;
  const [sourceState, setSourceState] = useState(null);
  const sourceRef = useRef(null);

  const N = ds?.N || defN;
  const CO = ds?.CO || defCO;
  const god = ds?.god !== undefined ? ds.god : defGod;
  const cyc = ds?.cyc || defCyc;

  const node = N?.[i];
  const file = node?.sourceFile;
  const snapshot = ds?.snapshot;
  const path = file?.path || node?.name;

  useEffect(() => {
    if (i < 0 || !repository || !path || !/^[0-9a-f]{40}$/i.test(repository.sha || '')) {
      setSourceState(null);
      return;
    }
    const controller = new AbortController();
    let active = true;
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    fetch(`https://raw.githubusercontent.com/${repository.fullname}/${repository.sha}/${encodedPath}`, {
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'text/plain' },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Source is unavailable for this commit.');
        const length = Number(response.headers.get('content-length'));
        if (length > 1024 * 1024) throw new Error('Source file exceeds the 1 MB viewer limit.');
        const text = await response.text();
        if (text.length > 1024 * 1024) throw new Error('Source file exceeds the 1 MB viewer limit.');
        if (active) setSourceState({ path, status: 'ready', source: text });
      })
      .catch((error) => {
        if (active && error.name !== 'AbortError') {
          setSourceState({ path, status: 'error', message: error.message || 'Source could not be loaded.' });
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [i, path, repository]);

  if (i < 0 || !node) {
    return <p className="sub" style={{ margin: 0 }}>Pick a star in the atlas to inspect its source & dependency metrics.</p>;
  }

  const outgoing = (snapshot?.edges || []).filter((edge) => edge.s === file?.id);
  const incoming = (snapshot?.edges || []).filter((edge) => edge.t === file?.id);
  const cochange = (snapshot?.cochange || []).filter((pair) => pair.a === file?.id || pair.b === file?.id);
  const imports = outgoing.map((edge) => ({ file: snapshot.files[edge.t], edge })).filter((item) => item.file);
  const importers = incoming.map((edge) => ({ file: snapshot.files[edge.s], edge })).filter((item) => item.file);

  const selectPath = (target) => {
    const id = ds?.filesByPath?.get(target);
    if (Number.isInteger(id)) pickNode(id);
  };

  const jumpToLine = (line) =>
    sourceRef.current?.querySelector(`[data-line="${line}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const co = (CO || [])
    .filter((c) => c.a === i || c.b === i)
    .map((c) => ({ j: c.a === i ? c.b : c.a, w: c.w || 1 }))
    .filter((c) => N[c.j]);

  const Chip = ({ j, extra = '' }) =>
    N[j] ? (
      <button className="chip" onClick={() => pickNode(j)}>
        {N[j].name}
        {extra}
      </button>
    ) : null;

  // Build synthetic preview lines if raw source isn't loaded
  const L = [];
  (node.out || []).slice(0, 5).forEach((j) => {
    if (N[j]) {
      const cleanTarget = N[j].name.replace(/\.[^/.]+$/, '');
      L.push({
        t: `import { ${cm(N[j])} } from './${cleanTarget}'`,
        cy: cyc?.has?.(i) && cyc?.has?.(j),
      });
    }
  });

  if (node.out && node.out.length) L.push({ t: '' });
  if (i === god && god >= 0) L.push({ t: `// Architectural god file: imported directly by ${(node.inn || []).length} components` });
  if (Array.isArray(node.exports) && node.exports.length > 0) {
    L.push({ t: `// Exported symbols: ${node.exports.slice(0, 4).join(', ')}${node.exports.length > 4 ? '…' : ''}` });
  }
  const fnName = cm(node);
  L.push(
    { t: `export function ${fnName}(input: Context) {` },
    { t: '  // AST parsed file: complexity ' + (node.cx ?? file?.complexity ?? 0) + ', tokens ' + ((node.tok ?? file?.tokens) || 0).toLocaleString() },
    { t: '  return analyze(input).filter(Boolean);' },
    { t: '}' }
  );

  const currentSource = sourceState?.path === path ? sourceState : null;

  return (
    <>
      <div className="kv">
        <span>lines <b>{file?.lines ?? node.lines ?? 'unknown'}</b></span>
        <span>complexity <b>{file?.complexity ?? node.cx ?? 'unknown'}</b></span>
        <span>tokens <b>{(file?.tokens ?? node.tok ?? 0).toLocaleString()}</b></span>
        <span>health <b>{file?.health?.score ?? node.h ?? 'unknown'}</b></span>
        <span>blast <b>{file?.blastradius ?? node.bl ?? 'unknown'}</b></span>
      </div>

      <div className="mono">Imports</div>
      <div className="imps">
        {imports.length > 0 ? (
          imports.map(({ file: dep, edge }) => (
            <button className="chip" key={dep.id} onClick={() => selectPath(dep.path)}>
              {dep.path} · {edge.kinds?.join(', ') || 'import'}
            </button>
          ))
        ) : node.out && node.out.length > 0 ? (
          node.out.map((j) => <Chip key={j} j={j} />)
        ) : (
          <span className="mono">none (root or leaf)</span>
        )}
      </div>

      <div className="mono">Imported by {(importers.length || (node.inn || []).length)} · reaches {file?.blastradius ?? node.bl ?? 0} files</div>
      {importers.length > 0 && (
        <div className="imps">
          {importers.map(({ file: imp, edge }) => (
            <button className="chip" key={imp.id} onClick={() => selectPath(imp.path)}>
              {imp.path} · line {edge.lines?.join(', ') || 'unknown'}
            </button>
          ))}
        </div>
      )}

      {cochange.length > 0 && (
        <>
          <div className="mono">Changed together</div>
          <div className="imps">
            {cochange.map((pair) => {
              const id = pair.a === file.id ? pair.b : pair.a;
              const partner = snapshot?.files?.[id];
              return partner ? (
                <button className="chip" key={id} onClick={() => selectPath(partner.path)}>
                  {partner.path} · {pair.count} commits
                </button>
              ) : null;
            })}
          </div>
        </>
      )}

      {co.length > 0 && cochange.length === 0 && (
        <>
          <div className="mono">Edited together with</div>
          <div className="imps">
            {co.map((c) => (
              <Chip key={c.j} j={c.j} extra={' · ' + c.w} />
            ))}
          </div>
        </>
      )}

      {repository && file && (
        <AIExplanationPanel
          key={`${repository.sha}:${path}`}
          repository={repository}
          file={file}
          onJumpToLine={jumpToLine}
        />
      )}

      <div className="mono">Source · {repository ? `${repository.fullname}@${repository.sha.slice(0, 7)} · ${path}` : path}</div>

      {currentSource?.status === 'ready' ? (
        <div className="code" ref={sourceRef}>
          {currentSource.source.split('\n').map((line, index) => (
            <div key={index} data-line={index + 1}>
              <i>{index + 1}</i>
              <span>{line || ' '}</span>
            </div>
          ))}
        </div>
      ) : currentSource?.status === 'error' ? (
        <>
          <p className="err" role="alert">{currentSource.message}</p>
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
      ) : (
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
      )}
    </>
  );
}
