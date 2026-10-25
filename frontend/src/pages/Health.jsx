import { useDash } from '../components/DashContext'
import Icon from '../components/Icon'
import { N, ring, cyc } from '../lib/data'

const W = 520, H = 290, m = { l: 44, r: 14, t: 14, b: 34 }
const X = c => m.l + c / 62 * (W - m.l - m.r), Y = c => H - m.b - c / 100 * (H - m.t - m.b)
const hot = N.slice().sort((a, b) => b.risk - a.risk).slice(0, 5)
const dots = N.slice().sort((a, b) => a.bl - b.bl)

export default function Health() {
  const { view, pickNode, showCycle, showHeat, hold, unhold } = useDash()
  return (
    <section className={'view' + (view === 'health' ? ' on' : '')} id="v-health">
      <div className="hello rise" style={{ '--i': 0 }}>
        <div><div className="kick">Churn × complexity</div><h1 className="h1">Architectural health</h1><p className="sub">The top right is where files break.</p></div>
        <button onClick={showHeat}><Icon n="flame" /> Heatmap in atlas</button>
      </div>
      <div className="card rise" style={{ '--i': 1 }}>
        <div className="ct"><h3>Risk map</h3><span className="mono">Bubble size = blast radius</span></div>
        {view === 'health' && (
          <svg className="sc" viewBox={`0 0 ${W} ${H}`} onPointerLeave={unhold}>
            <rect x={X(30)} y={Y(100)} width={X(62) - X(30)} height={Y(52) - Y(100)} fill="var(--hot)" opacity=".1" stroke="var(--hot)" strokeDasharray="4 4" strokeOpacity=".6" />
            <text x={X(31)} y={Y(97)} style={{ fill: 'var(--hot)' }}>fragile zone</text>
            <line x1={m.l} y1={H - m.b} x2={W - m.r} y2={H - m.b} stroke="var(--line)" />
            <line x1={m.l} y1={m.t} x2={m.l} y2={H - m.b} stroke="var(--line)" />
            <text x={W / 2 - 30} y={H - 8}>complexity</text><text x="4" y={m.t + 8}>churn</text>
            {dots.map((n, k) => {
              const c = n.risk > .6 ? 'var(--hot)' : n.risk > .38 ? 'var(--gold)' : 'var(--mute)'
              return <circle key={n.id} className="sd" cx={X(n.cx)} cy={Y(n.ch)} r={3 + Math.min(14, n.bl * .22)} fill={c} fillOpacity=".62"
                stroke={cyc.has(n.id) ? 'var(--spark)' : c} style={{ animationDelay: k * 14 + 'ms' }}
                onClick={() => pickNode(n.id)} onPointerMove={() => hold(`${n.name} · cx ${n.cx} · churn ${n.ch} · blast ${n.bl}`)} />
            })}
          </svg>
        )}
      </div>
      <div className="card rise" style={{ '--i': 2 }}>
        <div className="ct"><h3>Import cycles</h3><button onClick={showCycle}>Show in atlas</button></div>
        <div className="chn">
          {[...ring, ring[0]].map((i, k) => (
            <span key={k} style={{ display: 'contents' }}>
              <button className="chip" onClick={() => pickNode(i)}>{N[i].name}</button>
              {k < 5 && <Icon n="arrow-right" className="ar" />}
            </span>
          ))}
        </div>
      </div>
      <div className="card rise" style={{ '--i': 3 }}>
        <div className="ct"><h3>Hotspots</h3><span className="mono">Highest combined risk</span></div>
        <div>{hot.map(n => (
          <div key={n.id} className="hr" style={{ marginBottom: 12, cursor: 'pointer' }} onClick={() => pickNode(n.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--ttl)', fontWeight: 600 }}>{n.name}</span><span className="mono">risk {Math.round(n.risk * 100)}</span></div>
            <div className="bar2"><i style={{ '--w': n.risk * 100 + '%' }} /></div>
          </div>
        ))}</div>
      </div>
    </section>
  )
}
