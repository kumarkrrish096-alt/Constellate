import { useState } from 'react';
import PfRow from '../components/PfRow';
import { useDash } from '../components/DashContext';
import { cand as defCand } from '../lib/data';

export default function Pathfinder() {
  const { view, activeData } = useDash();
  const [f, setF] = useState('all');

  const cand = activeData?.cand || defCand;
  const l = (cand || []).filter(
    (c) => f === 'all' || (f === 'tests' && c.t) || (f === 'tiny' && (c.n?.bl || 0) <= 3)
  );

  return (
    <section className={'view' + (view === 'path' ? ' on' : '')} id="v-path">
      <div className="hello rise" style={{ '--i': 0 }}>
        <div>
          <div className="kick">Smart onboarding</div>
          <h1 className="h1">Pathfinder</h1>
          <p className="sub">
            Where a newcomer can step without waking the god files. Ranked by blast radius, complexity, churn, and nearby tests.
          </p>
        </div>
      </div>
      <div className="card rise" style={{ '--i': 1 }}>
        <div className="ct">
          <div className="seg">
            {[
              ['all', 'All'],
              ['tests', 'Has tests'],
              ['tiny', 'Small blast'],
            ].map(([k, t]) => (
              <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>
                {t}
              </button>
            ))}
          </div>
          <span className="mono">{l.length} suggestions</span>
        </div>
        <div key={f} className="pf-list">
          {l.length ? (
            l.map((c, i) => <PfRow key={c.n?.id ?? i} c={c} i={i} />)
          ) : (
            <p className="sub">Nothing matches that filter. Try All.</p>
          )}
        </div>
      </div>
    </section>
  );
}
