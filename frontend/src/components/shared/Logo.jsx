import logo from '../../assets/constellate-logo.png'

/** Constellate sigil, tinted with --red via CSS mask (same technique as the original HTML). */
export default function Logo({ className = '', size }) {
  return (
    <span
      className={`cx-logo ${className}`}
      role="img"
      aria-label="Constellate logo"
      style={{ '--logo': `url("${logo}")`, ...(size ? { width: size } : null) }}
    />
  )
}
