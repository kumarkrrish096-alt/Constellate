import { useEffect, useRef, useState } from "react"

/**
 * Reads --ink / --mute / --gold / --red / --scrim from the nearest `.cx` scope
 * and refreshes them when the hero flips <html data-theme> or the OS theme changes.
 * Returns [colorsRef, version]; `version` bumps on every refresh so canvases can redraw.
 */
export default function useThemeColors(elRef) {
  const colors = useRef({ ink: "#EADFC8", mute: "#BBA995", gold: "#B8323A", red: "#C4202E", scrim: "14,6,7" })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const read = () => {
      const el = elRef.current
      if (!el) return
      const s = getComputedStyle(el)
      const g = (n) => s.getPropertyValue(n).trim()
      colors.current = { ink: g("--ink"), mute: g("--mute"), gold: g("--gold"), red: g("--red"), scrim: g("--scrim") }
      setVersion((v) => v + 1)
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    mq.addEventListener?.("change", read)
    return () => {
      mo.disconnect()
      mq.removeEventListener?.("change", read)
    }
  }, [elRef])

  return [colors, version]
}
