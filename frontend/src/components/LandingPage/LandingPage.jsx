import { useEffect, useRef, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUser, isLoggedIn, logout, restoreSession } from '../../auth/AuthService';
import { initAtlas } from './atlas';
import './LandingPage.css';

/**
 * LandingPage — the main constellation visualization component.
 *
 * Manages the Three.js atlas lifecycle through refs and useEffect,
 * keeping DOM interactions cleanly separated from React state.
 */
export default function LandingPage() {
  const [user, setUser] = useState(() => (isLoggedIn() ? getUser() : null));

  // The cached user is only a hint for first paint; confirm with the server.
  useEffect(() => {
    let cancelled = false;
    restoreSession().then((u) => { if (!cancelled) setUser(u); });
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    setUser(null);
    await logout();
  };

  /* ── Refs for DOM elements the atlas needs ──────────── */
  const glRef = useRef(null);
  const fxRef = useRef(null);
  const flashRef = useRef(null);
  const tipRef = useRef(null);
  const toastRef = useRef(null);
  const lLoopRef = useRef(null);
  const lGodRef = useRef(null);
  const telRef = useRef(null);
  const stepsRef = useRef(null);
  const doneRef = useRef(null);
  const dtRef = useRef(null);
  const atlasRef = useRef(null);

  /* ── Atlas lifecycle ────────────────────────────────── */
  useEffect(() => {
    let atlas = null;
    try {
      atlas = initAtlas({
        glCanvas: glRef.current,
        fxCanvas: fxRef.current,
        flashEl: flashRef.current,
        tipEl: tipRef.current,
        toastEl: toastRef.current,
        lLoopEl: lLoopRef.current,
        lGodEl: lGodRef.current,
        telEl: telRef.current,
        stepsEl: stepsRef.current,
        doneEl: doneRef.current,
        dtEl: dtRef.current,
      });
      atlasRef.current = atlas;
    } catch (err) {
      console.warn('WebGL unavailable:', err);
      document.body.classList.add('nogl');
      if (telRef.current) {
        telRef.current.textContent = 'WebGL unavailable, showing static view';
      }
    }

    return () => {
      if (atlas) atlas.destroy();
      atlasRef.current = null;
    };
  }, []);

  /* ── Handlers ───────────────────────────────────────── */
  const handleReplay = useCallback(() => {
    atlasRef.current?.replay();
  }, []);

  const handleBack = useCallback(() => {
    atlasRef.current?.closeDone();
  }, []);

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div className="landing-page">
      {/* WebGL + FX canvases */}
      <canvas id="gl" className="landing-canvas" ref={glRef} />
      <canvas id="fx" className="landing-canvas" ref={fxRef} />
      <div id="flash" ref={flashRef} />

      {/* Hero */}
      <main className="content">
        <h1>Every codebase is a constellation.</h1>
        <p className="sub">
          Constellate turns any GitHub repository into a star chart of its
          imports, import cycles and blast radius, so you know where it is
          safe to step.
        </p>
      </main>

      {/* Floating labels */}
      <div className="lbl" id="lLoop" ref={lLoopRef}>circular import, 5 files</div>
      <div className="lbl" id="lGod" ref={lGodRef}>god file</div>
      <div id="tip" ref={tipRef} />
      <div id="toast" ref={toastRef} />

      {/* Bottom bar */}
      <footer className="bot">

      </footer>

      {/* Done overlay */}
      <section id="done" aria-live="polite" ref={doneRef}>
        <h2 id="dt" ref={dtRef} />
        <div id="steps" ref={stepsRef} />
        <button id="back" type="button" onClick={handleBack}>
          Return to the atlas
        </button>
      </section>
    </div>
  );
}
