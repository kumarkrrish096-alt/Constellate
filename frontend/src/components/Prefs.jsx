import { createContext, useContext, useEffect, useState } from 'react'

const Ctx = createContext(null)
const rd = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v } catch { return d } }
const wr = (k, v) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

export function PrefsProvider({ children }) {
  const [theme, setT] = useState(() => (rd('cs-theme', 'dark') === 'light' ? 'light' : 'dark'))
  const [calm, setC] = useState(() => rd('cs-calm', '0') === '1')
  const [stp, setS] = useState(() => rd('cs-stp', '1') !== '0')
  const [stpMin, setM] = useState(() => rd('cs-stpmin', '0') === '1')
  useEffect(() => {
    document.documentElement.style.background = document.body.style.background = theme === 'dark' ? '#0E0607' : '#E8DCC4'
  }, [theme])
  const mk = (set, key, enc = v => (v ? '1' : '0')) => v => { set(v); wr(key, enc(v)) }
  const value = {
    theme, calm, stp, stpMin,
    setTheme: mk(setT, 'cs-theme', v => v), setCalm: mk(setC, 'cs-calm'),
    setStp: mk(setS, 'cs-stp'), setStpMin: mk(setM, 'cs-stpmin'),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const usePrefs = () => useContext(Ctx)
