import { Link } from "react-router-dom"
import Logo from "../shared/Logo"

const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches
const goTo = (id) => (e) => {
  e.preventDefault()
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" })
}

export default function About() {
  return (
    <footer className="cx-about" id="about">
      <div className="cx-ab-line" />
      <div className="cx-ab-in">
        <div className="cx-ab-sigil"><Logo /></div>
        <div className="cx-ab-name">Constellate</div>
        <div className="cx-ab-center">
          <p className="cx-eyebrow">About us</p>
          {/* Placeholder copy derived from your hero text: edit freely */}
          <p>
            Constellate is a star chart for your codebase. It reads a repository, draws its imports, finds its import
            cycles and measures blast radius, so you know where it is safe to step.
          </p>
        </div>
        <nav className="cx-ab-nav" aria-label="Footer">
          <a href="#process" onClick={goTo("process")}>Process</a>
          <a href="#features" onClick={goTo("features")}>Features</a>
          <Link to="/login">Login</Link>
          <Link to="/signup">Sign up</Link>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })}>Back to top</button>
        </nav>
        <div className="cx-ab-rule" />
        <p className="cx-ab-fine">© 2026 Constellate · From the tangle of a thousand files, the stars are drawn.</p>
      </div>
    </footer>
  )
}
