import { maxB } from '../lib/data'
import Icon from './Icon'
import { useDash } from './DashContext'

const Meter = ({ l, v, w }) => (
  <div className="pf-meter">
    <div className="pf-meter-head">
      <span className="pf-meter-label">{l}</span>
      <span className="pf-meter-val">{v}</span>
    </div>
    <div className="bar2">
      <i style={{ '--w': w + '%' }} />
    </div>
  </div>
)

export default function PfRow({ c, i }) {
  const { pickNode } = useDash()
  return (
    <div
      className={'pf' + (i === 0 ? ' pf-top' : '')}
      onClick={() => pickNode(c.n.id)}
    >
      <div className="rk">{i + 1}</div>
      <div className="pf-content">
        <div className="pf-info">
          <div className="ti">
            <span>{c.iss}</span>
            {i === 0 && <span className="tag">start here</span>}
          </div>
          <div className="mono pf-path">
            #{c.no} · {c.n.name}
            {c.t ? ' · tests nearby' : ''}
          </div>
        </div>
        <div className="bs pf-meters">
          <Meter l="Blast" v={c.n.bl} w={Math.max(6, (c.n.bl / maxB) * 100)} />
          <Meter l="Complexity" v={c.n.cx} w={(c.n.cx / 58) * 100} />
          <Meter l="Churn" v={c.n.ch} w={c.n.ch} />
        </div>
      </div>
      <div className="pf-action">
        <Icon n="chevron-right" style={{ color: 'var(--mute)' }} />
      </div>
    </div>
  )
}

