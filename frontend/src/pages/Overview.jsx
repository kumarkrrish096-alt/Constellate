import AtlasCanvas from '../components/AtlasCanvas'
import CastCard from '../components/CastCard'
import CountUp from '../components/CountUp'
import Ring from '../components/Ring'
import PfRow from '../components/PfRow'
import Icon from '../components/Icon'
import { useDash } from '../components/DashContext'
import { useAuth } from '../auth/AuthContext'
import { cand, worst } from '../lib/data'
import { ago } from '../lib/utils'

const SPARK = ['M0 22 L12 18 L24 20 L36 10 L48 12 L64 3', 'M0 24 L16 20 L28 14 L40 15 L52 7 L64 4', 'M0 8 L14 12 L26 9 L40 18 L52 15 L64 22', 'M0 18 L14 16 L26 19 L38 12 L50 11 L64 8']

export default function Overview() {
  const { view, go, hist, repo, stats, pickNode, openCast, newId } = useDash()
  const { user } = useAuth()
  const recents = hist.filter(h => h.st !== 'fizzled').sort((a, b) => b.at - a.at).slice(0, 4)
  const nums = [[stats.a, '', 'Atlases cast'], [stats.f, '', 'Files parsed'], [9, '', 'Import cycles'], [74, '%', 'Avg health']]
  return (
    <section className={'view' + (view === 'overview' ? ' on' : '')} id="v-overview">
      <div className="hero2">
        <div className="hello rise" style={{ '--i': 0 }}><div>
          <div className="kick">The Sanctum</div>
          <h1 className="h1">Welcome back, <span>{user}</span></h1>
          <p className="sub">Pick up your chart where you left it.</p>
        </div></div>
        <div className="card omen rise" style={{ '--i': 1 }}>
          <div className="ob"><Icon n="eye" />
            <div className="bx">
              <div className="mono">Omen of the day</div>
              <div className="ot">{worst.name} is reached by {worst.bl} files. Edit it with care, and write a test first.</div>
              <div className="mono">Safest first step for a newcomer: {cand[0].n.name}</div>
            </div>
            <button onClick={() => pickNode(worst.id)}>Show me</button>
          </div>
        </div>
      </div>
      <div className="stats">
        {nums.map(([n, suf, l], i) => (
          <div key={l} className="stat rise" style={{ '--i': i + 1 }}>
            <svg viewBox="0 0 64 28"><path pathLength="1" d={SPARK[i]} /></svg>
            <div className="n"><CountUp to={n} suf={suf} /></div><div className="l">{l}</div>
          </div>
        ))}
      </div>
      <CastCard />
      <div className="card rise" style={{ '--i': 6 }}>
        <div className="ct"><h3>Latest atlas</h3>
          <div className="row"><span className="mono" style={{ alignSelf: 'center' }}>{repo}</span><button onClick={() => go('atlas')}>Open atlas</button></div></div>
        <div className="mapw">
          <AtlasCanvas mini className="cv mini" label="Animated preview of the dependency atlas" />
          <div className="ov"><span className="chip">65 files</span><span className="chip">1 import cycle</span><span className="chip">1 god file</span></div>
        </div>
      </div>
      <div className="card rise" style={{ '--i': 7 }}>
        <div className="ct"><h3>Recent casts</h3><button onClick={() => go('history')}>Open the chronicle</button></div>
        <div>{recents.map((h, i) => (
          <div key={h.id} className={'rp' + (i === 0 && h.id === newId ? ' new' : '')} onClick={() => openCast(h)}>
            <Ring h={h.h} />
            <div><div className="nm">{h.n}</div><div className="mono">{h.l} · {h.f.toLocaleString()} files</div></div>
            <div className="mt"><div className="mono">{h.s}</div><div className="mono">{ago(h.at)}</div></div>
          </div>
        ))}</div>
      </div>
      <div className="card rise" style={{ '--i': 8 }}>
        <div className="ct"><h3>Safest first steps</h3><button onClick={() => go('path')}>See all</button></div>
        <div className="pf-list">{cand.slice(0, 3).map((c, i) => <PfRow key={c.n.id} c={c} i={i} />)}</div>
      </div>
    </section>
  )
}
