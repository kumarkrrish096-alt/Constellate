import { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import { useDash } from './DashContext';
import { submitAnalysis, streamJobEvents, fetchSnapshot } from '../lib/api';

const STEPS = [
  ['Invoke', 'Format checked'],
  ['Consult the archive', 'Resolving commit SHA'],
  ['Join the queue', 'Job created, stream open'],
  ['Gather the scrolls', 'Shallow clone, limits'],
  ['Read the runes', 'Tree-sitter ASTs'],
  ['Draw the constellation', 'Imports, cycles, clusters'],
  ['Study the chronicle', 'Churn, co-change'],
  ['Seal the snapshot', 'Written by SHA'],
  ['Reveal the atlas', 'Ready to explore'],
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GH = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/i;

function mapStageToStepIndex(stage) {
  if (!stage) return 2;
  const s = stage.toLowerCase();
  if (s.includes('queue')) return 2;
  if (s.includes('list') || s.includes('clone') || s.includes('scrolls') || s.includes('detect')) return 3;
  if (s.includes('parse') || s.includes('runes') || s.includes('ast')) return 4;
  if (s.includes('graph') || s.includes('resolve') || s.includes('import') || s.includes('constellation')) return 5;
  if (s.includes('history') || s.includes('chronicle') || s.includes('score') || s.includes('churn')) return 6;
  if (s.includes('snapshot') || s.includes('assemble') || s.includes('seal') || s.includes('write')) return 7;
  if (s.includes('done') || s.includes('reveal')) return 8;
  return 3;
}

export default function CastCard() {
  const {
    setHist,
    url,
    setUrl,
    urlRef,
    loadSnapshotData,
    setStatus,
    setNewId,
    say,
    go,
    setSnapshot,
    setRepository,
    setRepo,
    setSel,
    setStats,
  } = useDash();
  const [err, setErr] = useState('');
  const [run, setRun] = useState(null);
  const [drag, setDrag] = useState(false);
  const [isCasting, setIsCasting] = useState(false);
  const busy = useRef(false);
  const seq = useRef(0);
  const streamCleanup = useRef(null);

  useEffect(() => {
    return () => {
      streamCleanup.current?.();
    };
  }, []);

  async function cast(repoFullName) {
    if (busy.current) return;
    busy.current = true;
    setIsCasting(true);
    setErr('');
    streamCleanup.current?.();

    const st = Array(9).fill('');
    let log = [];
    let pct = 0;
    const upd = (done = false, isFailed = false) => setRun({ st: [...st], log: [...log], pct, done, failed: isFailed });
    const push = (m) => {
      log = [...log, { k: seq.current++, t: m }].slice(-10);
    };

    const t0 = Date.now();
    st[0] = 'run';
    push(`Invoking celestial forge for ${repoFullName}…`);
    pct = 10;
    upd();
    setStatus({ t: `Casting ${repoFullName}`, s: 'Step 1 of 9 · Invoke', p: 0.1 });

    const cleanRepoUrl = `https://github.com/${repoFullName}`;

    try {
      await wait(300);
      st[0] = 'done';
      st[1] = 'run';
      push('Consulting the archive and GitHub API…');
      pct = 20;
      upd();
      setStatus({ t: `Casting ${repoFullName}`, s: 'Step 2 of 9 · Consult the archive', p: 0.2 });

      // Call backend API: POST /api/analyze
      const result = await submitAnalysis(cleanRepoUrl);

      // CASE 1: Cache Hit (status: "ready")
      if (result.status === 'ready' && result.snapshotUrl) {
        const sha = result.sha || 'HEAD';
        push(`Found in the archive at commit ${sha.slice(0, 7)}`);
        st[1] = 'done';
        for (let i = 2; i <= 7; i++) st[i] = 'skip';
        st[8] = 'run';
        pct = 85;
        upd();

        push('Fetching sealed snapshot from archive…');
        const snapshot = await fetchSnapshot(result.snapshotUrl);

        st[8] = 'done';
        pct = 100;
        push('The atlas is revealed');

        const adapted = loadSnapshotData ? loadSnapshotData(snapshot, `${repoFullName} · ${sha.slice(0, 7)}`) : { N: [], ring: [], god: -1, stats: { health: 80 } };

        setSnapshot?.(snapshot);
        setRepository?.({ fullname: repoFullName, sha });
        setRepo?.(`${repoFullName} · ${sha.slice(0, 7)}`);
        setSel?.(-1);
        setStats?.(stats => ({ ...stats, a: (stats.a || 0) + 1, f: snapshot.stats?.sourcefiles || snapshot.files?.length || 0 }));

        const histEntry = {
          id: Date.now(),
          n: repoFullName,
          s: sha.slice(0, 7),
          l: adapted.N[0]?.language || 'Source',
          f: adapted.N.length,
          h: adapted.stats.health,
          cy: adapted.ring.length,
          g: adapted.god >= 0 ? 1 : 0,
          st: 'cached',
          ms: Date.now() - t0,
          at: Date.now(),
          snapshotUrl: result.snapshotUrl,
          snapshot,
        };

        setHist?.((h) => [histEntry, ...(h || [])]);
        setNewId?.(histEntry.id);
        upd(true);
        say(`Found in archive. Atlas revealed for ${repoFullName}`);
        setStatus({ t: 'Atlas ready', s: `${repoFullName} · ${sha.slice(0, 7)}`, p: 1 });
        busy.current = false;
        setIsCasting(false);
        setTimeout(() => {
          if (!busy.current) setStatus({ t: '', s: '', p: null });
        }, 4000);
        return;
      }

      // CASE 2: Cache Miss (Job queued on backend)
      const jobId = result.jobId;
      const sha = result.sha || 'HEAD';
      st[1] = 'done';
      st[2] = 'run';
      push(`Queued in astral engine at ${sha.slice(0, 7)}. Job ID: ${jobId.slice(-6)}`);
      if (result.queueposition) {
        push(`Queue position: ${result.queueposition}`);
      }
      pct = 30;
      upd();

      // Listen for SSE events / fallback polling
      await new Promise((resolve, reject) => {
        let lastReportedStep = 2;

        streamCleanup.current = streamJobEvents(jobId, {
          onProgress: (jobView) => {
            const currentStep = mapStageToStepIndex(jobView.stage);

            for (let i = 2; i < currentStep; i++) {
              if (st[i] === 'run') st[i] = 'done';
            }
            st[currentStep] = 'run';

            if (jobView.progress !== undefined && jobView.progress !== null) {
              pct = Math.max(pct, Math.min(95, Math.round(jobView.progress)));
            }

            if (currentStep !== lastReportedStep) {
              lastReportedStep = currentStep;
              const stepName = STEPS[currentStep]?.[0] || 'Processing';
              const stageDesc = jobView.stage ? ` (${jobView.stage})` : '';
              push(`${stepName}${stageDesc}…`);
              setStatus({
                t: `Casting ${repoFullName}`,
                s: `Step ${currentStep + 1} of 9 · ${stepName}`,
                p: pct / 100,
              });
            }

            upd();
          },

          onDone: async (jobView) => {
            try {
              for (let i = 0; i < 8; i++) {
                if (st[i] === 'run') st[i] = 'done';
              }
              st[8] = 'run';
              pct = 95;
              push('Snapshot sealed. Loading atlas constellation…');
              upd();

              const snapshotUrl = jobView.snapshotUrl || `/api/snapshots/${repoFullName}/${jobView.sha || sha}`;
              const snapshot = await fetchSnapshot(snapshotUrl);

              st[8] = 'done';
              pct = 100;
              push('The atlas is revealed');

              const adapted = loadSnapshotData ? loadSnapshotData(snapshot, `${repoFullName} · ${(jobView.sha || sha).slice(0, 7)}`) : { N: [], ring: [], god: -1, stats: { health: 80 } };

              setSnapshot?.(snapshot);
              setRepository?.({ fullname: repoFullName, sha: (jobView?.sha || sha) });
              setRepo?.(`${repoFullName} · ${(jobView?.sha || sha).slice(0, 7)}`);
              setSel?.(-1);
              setStats?.(stats => ({ ...stats, a: (stats.a || 0) + 1, f: snapshot.stats?.sourcefiles || snapshot.files?.length || 0 }));

              const histEntry = {
                id: Date.now(),
                n: repoFullName,
                s: (jobView.sha || sha).slice(0, 7),
                l: adapted.N[0]?.language || 'Source',
                f: adapted.N.length,
                h: adapted.stats.health,
                cy: adapted.ring.length,
                g: adapted.god >= 0 ? 1 : 0,
                st: 'cast',
                ms: Date.now() - t0,
                at: Date.now(),
                snapshotUrl,
                snapshot,
              };

              setHist?.((h) => [histEntry, ...(h || [])]);
              setNewId?.(histEntry.id);
              upd(true);
              say(`Atlas cast for ${repoFullName}`);
              setStatus({ t: 'Atlas ready', s: `${repoFullName} · ${(jobView.sha || sha).slice(0, 7)}`, p: 1 });
              busy.current = false;
              setIsCasting(false);
              setTimeout(() => {
                if (!busy.current) setStatus({ t: '', s: '', p: null });
              }, 4000);
              resolve();
            } catch (err) {
              reject(err);
            }
          },

          onFailed: (jobView) => {
            const reason = jobView.error || 'The analysis worker encountered a failure.';
            reject(new Error(reason));
          },

          onError: (networkErr) => {
            console.warn('Job tracking stream notice:', networkErr.message);
          },
        });
      });
    } catch (err) {
      busy.current = false;
      setIsCasting(false);
      const errorMsg = err.message || 'Could not complete repository analysis.';
      setErr(errorMsg);
      push(`✕ Analysis fizzled: ${errorMsg}`);
      st.forEach((s, idx) => {
        if (s === 'run') st[idx] = 'fail';
      });
      upd(true, true);

      const histEntry = {
        id: Date.now(),
        n: repoFullName,
        s: '',
        l: 'Source',
        f: 0,
        h: 0,
        cy: 0,
        g: 0,
        st: 'fizzled',
        ms: Date.now() - t0,
        at: Date.now(),
        note: errorMsg,
      };
      setHist?.((h) => [histEntry, ...(h || [])]);
      say(`Cast fizzled: ${errorMsg}`);
      setStatus({ t: 'Cast fizzled', s: errorMsg, p: null });
    }
  }

  const submit = () => {
    const m = url.trim().match(GH);
    if (!m) {
      setErr('Enter a public GitHub URL like github.com/owner/repo or https://github.com/owner/repo.');
      urlRef.current?.focus();
      return;
    }
    setErr('');
    cast(m[1]);
  };

  const zip = (f) => {
    if (!f) return;
    if (!/\.zip$/i.test(f.name)) {
      setErr('That file is not a .zip. Choose a zip archive of your repository.');
      return;
    }
    setErr('Direct zip upload is in active ingestion staging. Please submit via public GitHub URL for full topological analysis.');
  };

  const fill = (v) => {
    setUrl(v);
    setErr('');
  };

  return (
    <div className="card rise" style={{ '--i': 5 }} id="an">
      <div className="ct">
        <h3>Cast a new atlas</h3>
        <span className="mono">Public GitHub repository URL · code is read, never run</span>
      </div>
      <div className="row">
        <input
          ref={urlRef}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setErr('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="https://github.com/expressjs/express"
          aria-label="GitHub repository URL"
        />
        <button className="pb" onClick={submit} disabled={isCasting}>
          {isCasting ? 'Casting…' : 'Cast atlas'}
        </button>
      </div>
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
      <div className="hint">
        <span className="mono">Try</span>
        <button className="chip" onClick={() => fill('https://github.com/expressjs/express')}>
          expressjs/express (from the archive)
        </button>
        <button className="chip" onClick={() => fill('https://github.com/pallets/click')}>
          pallets/click (real cast)
        </button>
      </div>
      <label
        className={'dz' + (drag ? ' drag' : '')}
        onDragEnter={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDrag(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          zip(e.dataTransfer.files[0]);
        }}
      >
        <Icon n="file-zip" />
        Drop a .zip here or browse
        <input
          type="file"
          accept=".zip"
          style={{ display: 'none' }}
          onChange={(e) => {
            zip(e.target.files[0]);
            e.target.value = '';
          }}
        />
      </label>
      <div className={'pipe' + (run ? ' on' : '')}>
        <div className="pbar">
          <i style={{ width: (run?.pct || 0) + '%', background: run?.failed ? 'var(--hot)' : undefined }} />
        </div>
        <div className="pg">
          <ul className="pl">
            {STEPS.map((s, i) => (
              <li key={i} className={run?.st[i] || ''}>
                <span className="ic">
                  {run?.st[i] === 'done' && <Icon n="check" />}
                  {run?.st[i] === 'fail' && <span style={{ color: 'var(--hot)', fontWeight: 700 }}>✕</span>}
                </span>
                {s[0]}
                <small>{s[1]}</small>
              </li>
            ))}
          </ul>
          <div className="lgb" aria-live="polite">
            {run?.log?.map((l) => (
              <div key={l.k}>
                <b>›</b> {l.t}
              </div>
            ))}
          </div>
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          {run?.done && !run?.failed && (
            <button className="pb" onClick={() => go('atlas')}>
              Open atlas <Icon n="arrow-right" />
            </button>
          )}
          {run?.failed && (
            <button className="pb" onClick={submit}>
              Retry cast <Icon n="refresh" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
