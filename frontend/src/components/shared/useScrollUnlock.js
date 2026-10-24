import { useEffect } from 'react'

/** Lets the page scroll while this route is mounted (see `.cx-scroll` in theme.css). */
export default function useScrollUnlock() {
  useEffect(() => {
    const els = [document.documentElement, document.body]
    els.forEach((e) => e.classList.add('cx-scroll'))
    return () => els.forEach((e) => e.classList.remove('cx-scroll'))
  }, [])
}
