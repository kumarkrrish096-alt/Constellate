import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import Logo from "../shared/Logo"
import { useAuth } from "../../auth/AuthContext"

/** Fixed Login / Sign up bar. Gains a blurred background + brand mark after scrolling, like the original header. */
export default function AuthNav() {
  const [scrolled, setScrolled] = useState(false)
  const { isAuthenticated, logout } = useAuth()

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 20)
    on()
    window.addEventListener("scroll", on, { passive: true })
    return () => window.removeEventListener("scroll", on)
  }, [])

  return (
    <header className={`cx-top${scrolled ? " scrolled" : ""}`}>
      <Link to="/" className="cx-mark" aria-label="Constellate home" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        <Logo /> Constellate
      </Link>
      <nav className="cx-auth" aria-label="Account">
        {isAuthenticated ? (
          <>
            <Link className="cx-btn solid" to="/dashboard">Dashboard</Link>
            <button type="button" className="cx-btn ghost" onClick={logout}>Log out</button>
          </>
        ) : (
          <>
            <Link className="cx-btn ghost" to="/login">Login</Link>
            <Link className="cx-btn solid" to="/signup">Sign up</Link>
          </>
        )}
      </nav>
    </header>
  )
}
