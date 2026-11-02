import { useDash } from '../components/DashContext';
import Icon from '../components/Icon';
import { N as defN, ring as defRing, cyc as defCyc } from '../lib/data';

const W = 520;
const H = 290;
const m = { l: 44, r: 14, t: 14, b: 34 };

export default function Health() {
  const { view, pickNode, showCycle, showHeat, hold, unhold, activeData } = useDash();

  const N = activeData?.N || defN;
  const ring = activeData?.ring || defRing;
  const cyc = activeData?.cyc || defCyc;

  const maxComplexity = Math.max(20, ...N.map((n) => n.cx || 0));
  const maxChurn = Math.max(40, ...N.map((n) => n.ch || 0));
  const X = (c) => m.l + (Math.min(c, maxComplexity) / maxComplexity) * (W - m.l - m.r);
  const Y = (c) => H - m.b - (Math.min(c, maxChurn) / maxChurn) * (H - m.t - m.b);

  const hot = [...N].sort((a, b) => (b.risk || 0) - (a.risk || 0)).slice(0, 5);
  const dots = [...N].sort((a, b) => (a.bl || 0) - (b.bl || 0));

  const healthScore = activeData?.stats?.health ?? 80;
  const healthColor = healthScore >= 75 ? 'var(--gold)' : healthScore >= 50 ? 'var(--ttl)' : 'var(--hot)';

  return (
    <section className={'view' + (view === 'health' ? ' on' : '')} id="v-health">
      <div className="hello rise" style={{ '--i': 0 }}>
        <div>
          <div className="kick">Churn × complexity</div>
          <h1 className="h1">Architectural health</h1>
          <p className="sub">The top right is where files break.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '6px 14px',
            background: 'var(--card-bg, rgba(255,255,255,0.03))',
            border: '1px solid var(--line)',
            borderRadius: 8,
          }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 700, color: healthColor, lineHeight: 1.1 }}>
              {healthScore}%
            </span>
            <span className="mono" style={{ fontSize: '0.68rem', opacity: 0.8 }}>Health Score</span>
          </div>
          <button onClick={showHeat}>
            <Icon n="flame" /> Heatmap in atlas
          </button>
        </div>
      </div>
      <div className="card rise" style={{ '--i': 1 }}>
        <div className="ct">
          <h3>Risk map</h3>
          <span className="mono">Bubble size = blast radius</span>
        </div>
        {view === 'health' && (
          <svg className="sc" viewBox={`0 0 ${W} ${H}`} onPointerLeave={unhold}>
            <rect
              x={X(Math.round(maxComplexity * 0.45))}
              y={Y(maxChurn)}
              width={X(maxComplexity) - X(Math.round(maxComplexity * 0.45))}
              height={Math.max(10, Y(Math.round(maxChurn * 0.52)) - Y(maxChurn))}
              fill="var(--hot)"
              opacity=".1"
              stroke="var(--hot)"
              strokeDasharray="4 4"
              strokeOpacity=".6"
            />
            <text x={X(Math.round(maxComplexity * 0.46))} y={Y(Math.round(maxChurn * 0.95))} style={{ fill: 'var(--hot)' }}>
              fragile zone
            </text>
            <line x1={m.l} y1={H - m.b} x2={W - m.r} y2={H - m.b} stroke="var(--line)" />
            <line x1={m.l} y1={m.t} x2={m.l} y2={H - m.b} stroke="var(--line)" />
            <text x={W / 2 - 30} y={H - 8}>
              complexity
            </text>
            <text x="4" y={m.t + 8}>
              churn
            </text>
            {dots.map((n, k) => {
              const c = n.risk > 0.6 ? 'var(--hot)' : n.risk > 0.38 ? 'var(--gold)' : 'var(--mute)';
              return (
                <circle
                  key={n.id}
                  className="sd"
                  cx={X(n.cx)}
                  cy={Y(n.ch)}
                  r={3 + Math.min(14, (n.bl || 0) * 0.22)}
                  fill={c}
                  fillOpacity=".62"
                  stroke={cyc.has(n.id) ? 'var(--spark)' : c}
                  style={{ animationDelay: k * 14 + 'ms' }}
                  onClick={() => pickNode(n.id)}
                  onPointerMove={() => hold(`${n.name} · cx ${n.cx} · churn ${n.ch} · blast ${n.bl}`)}
                />
              );
            })}
          </svg>
        )}
      </div>
      <div className="card rise" style={{ '--i': 2 }}>
        <div className="ct">
          <h3>Import cycles</h3>
          {ring.length > 0 && <button onClick={showCycle}>Show in atlas</button>}
        </div>
        {ring.length > 0 ? (
          <div className="chn">
            {[...ring, ring[0]].map((i, k) => (
              <span key={k} style={{ display: 'contents' }}>
                <button className="chip" onClick={() => pickNode(i)}>
                  {N[i]?.name || `Node ${i}`}
                </button>
                {k < ring.length && <Icon n="arrow-right" className="ar" />}
              </span>
            ))}
          </div>
        ) : (
          <p className="sub" style={{ margin: 0 }}>
            No circular dependency cycles detected in this snapshot. The architecture flows acyclically.
          </p>
        )}
      </div>
      <div className="card rise" style={{ '--i': 3 }}>
        <div className="ct">
          <h3>Hotspots</h3>
          <span className="mono">Highest combined risk</span>
        </div>
        <div>
          {hot.length ? (
            hot.map((n) => (
              <div
                key={n.id}
                className="hr"
                style={{ marginBottom: 12, cursor: 'pointer' }}
                onClick={() => pickNode(n.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ttl)', fontWeight: 600 }}>{n.name}</span>
                  <span className="mono">risk {Math.round((n.risk || 0) * 100)}</span>
                </div>
                <div className="bar2">
                  <i style={{ '--w': (n.risk || 0) * 100 + '%' }} />
                </div>
              </div>
            ))
          ) : (
            <p className="sub">No hotspots detected.</p>
          )}
        </div>
      </div>
    </section>
  );
}
