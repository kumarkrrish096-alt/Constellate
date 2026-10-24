import { useEffect, useRef } from "react"
import useThemeColors from "../../shared/useThemeColors"

const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches

/** Interactive dependency graph (canvas). Hover a star to light up what it uses / what uses it. */
export default function AtlasVisual({ inViewRef }) {
  const ref = useRef(null)
  const [colors] = useThemeColors(ref)

  useEffect(() => {
    const c = ref.current, x = c.getContext("2d")
    const rnd = ((a) => () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    })(145)

    const cen = [[0.25, 0.34], [0.72, 0.3], [0.5, 0.74]], ns = [], es = []
    let w, h, sel = 0, mx = -1, my = -1, tt = 0, last = 0, hold = 0, auto = 0, raf = 0
    cen.forEach((p, k) => {
      const s = ns.length
      for (let i = 0; i < 13; i++) {
        ns.push({ k, bx: p[0] + (rnd() - 0.5) * 0.28, by: p[1] + (rnd() - 0.5) * 0.3, ph: rnd() * 6, o: [], i: [] })
        if (i) {
          const j = s + Math.floor(rnd() * i)
          es.push([s + i, j])
          if (rnd() < 0.3) es.push([s + i, s + Math.floor(rnd() * i)])
        }
      }
    })
    ;[[2, 15], [8, 30], [20, 33], [5, 36], [28, 12]].forEach((e) => es.push(e))
    const hub = 0
    for (let n = 0; n < 12; n++) { const r = Math.floor(rnd() * 39); if (r) es.push([r, hub]) }
    es.forEach(([a, b]) => { ns[a].o.push(b); ns[b].i.push(a) })

    const fit = () => {
      const d = Math.min(window.devicePixelRatio || 1, 2)
      w = c.clientWidth; h = c.clientHeight
      c.width = w * d; c.height = h * d
      x.setTransform(d, 0, 0, d, 0, 0)
    }
    fit()
    window.addEventListener("resize", fit)

    const P = (n) => [(n.bx + Math.sin(tt * 0.5 + n.ph) * 0.012) * w, (n.by + Math.cos(tt * 0.4 + n.ph) * 0.016) * h]
    const onMove = (e) => {
      const r = c.getBoundingClientRect()
      mx = e.clientX - r.left; my = e.clientY - r.top
      let b = 1e9
      ns.forEach((n, i) => {
        const p = P(n), d = Math.hypot(p[0] - mx, p[1] - my)
        if (d < b && d < 40) { b = d; sel = i; hold = 2.5 }
      })
    }
    c.addEventListener("pointermove", onMove)

    const draw = (now) => {
      raf = requestAnimationFrame(draw)
      if (!inViewRef.current) return
      const col = colors.current
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      if (!reduce) tt += dt
      hold -= dt
      if (hold <= 0) { auto += dt; if (auto > 2.4) { auto = 0; sel = (sel + 7) % ns.length } }
      x.clearRect(0, 0, w, h)
      const sn = ns[sel], O = new Set(sn.o), I = new Set(sn.i)
      es.forEach(([a, b]) => {
        const pa = P(ns[a]), pb = P(ns[b]), hi = (a === sel && O.has(b)) || (b === sel && I.has(a))
        x.strokeStyle = hi ? (a === sel ? col.gold : col.red) : col.mute
        x.globalAlpha = hi ? 0.95 : 0.2
        x.lineWidth = hi ? 1.8 : 0.8
        x.beginPath(); x.moveTo(pa[0], pa[1]); x.lineTo(pb[0], pb[1]); x.stroke()
      })
      ns.forEach((n, i) => {
        const p = P(n), isS = i === sel, o = O.has(i), d = I.has(i)
        x.globalAlpha = isS || o || d ? 1 : 0.75
        x.fillStyle = isS ? col.gold : d ? col.red : o ? col.gold : col.ink
        x.shadowColor = isS ? "#FF3B30" : d ? col.red : "transparent"
        x.shadowBlur = isS ? 18 : d ? 8 : 0
        x.beginPath(); x.arc(p[0], p[1], i === hub ? 8 : isS ? 5.5 : o || d ? 4 : 2.6, 0, 6.283); x.fill()
        x.shadowBlur = 0
      })
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", fit)
      c.removeEventListener("pointermove", onMove)
    }
  }, [colors, inViewRef])

  return <canvas ref={ref} aria-label="Interactive dependency graph" />
}
