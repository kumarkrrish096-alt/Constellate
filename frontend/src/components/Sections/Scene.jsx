import { useEffect, useRef } from "react"

/**
 * One caption + panel row. Toggles `.in` while on screen (pauses CSS animations when off screen)
 * and shares an `inViewRef` with visuals that run their own JS loops.
 * `children` is a function: ({ inViewRef }) => <Visual />
 */
export default function Scene({ id, flip = false, title, text, children }) {
  const ref = useRef(null)
  const inViewRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    const io = new IntersectionObserver(
      ([e]) => {
        inViewRef.current = e.isIntersecting
        el.classList.toggle("in", e.isIntersecting)
      },
      { rootMargin: "80px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <section ref={ref} id={id} className={`cx-fr cx-scene${flip ? " rev" : ""}`}>
      <div className="cx-cap">
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      <div className="cx-panel">{children({ inViewRef })}</div>
    </section>
  )
}
