import ICONS from './icons.js'

export default function Icon({ n, className = '', style }) {
  return <svg className={('i ' + className).trim()} style={style} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[n] || '' }} />
}
