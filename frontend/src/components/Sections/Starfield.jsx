import { useEffect, useRef } from "react"
import useThemeColors from "../shared/useThemeColors"

/** Twinkling star layers behind the Process + Features sections (port of #sky / .skyx). */
export default function Starfield() {
  const base = useRef(null), l1 = useRef(null), l2 = useRef(null)
  const [colors, version] = useThemeColors(base)

  useEffect(() => {
    const draw = () => {
      const sk = base.current
      if (!sk || !sk.parentElement) return
      const p = sk.parentElement, w = p.clientWidth, h = p.clientHeight
      const d = Math.min(window.devicePixelRatio || 1, 2)
      const rgb = (colors.current.ink.match(/[0-9a-f]{2}/gi) || ["ff", "ff", "ff"]).map((v) => parseInt(v, 16))
      const lightTheme = (rgb[0] + rgb[1] + rgb[2]) / 3 < 128
      const fill = lightTheme ? "#000" : colors.current.ink
      const glow = lightTheme ? "rgba(139,15,26,.9)" : "rgba(255,59,48,.9)"
      const cs = [sk, l1.current, l2.current].map((c) => {
        c.width = w * d; c.height = h * d
        const x = c.getContext("2d")
        x.setTransform(d, 0, 0, d, 0, 0)
        x.shadowColor = glow; x.shadowBlur = 8; x.fillStyle = fill
        return x
      })
      let a = 7
      const r = () => (a = (a * 1664525 + 1013904223) >>> 0) / 4294967296
      for (let i = 0, n = Math.round((w * h) / 9000); i < n; i++) {
        const x = cs[i % 3]
        x.globalAlpha = 0.3 + r() * 0.5
        x.beginPath(); x.arc(r() * w, r() * h, r() * 1.1 + 0.3, 0, 6.283); x.fill()
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(base.current.parentElement)
    return () => ro.disconnect()
  }, [colors, version])

  return (
    <>
      <canvas ref={base} className="cx-sky" aria-hidden="true" />
      <canvas ref={l1} className="cx-skyx l1" aria-hidden="true" />
      <canvas ref={l2} className="cx-skyx l2" aria-hidden="true" />
    </>
  )
}
