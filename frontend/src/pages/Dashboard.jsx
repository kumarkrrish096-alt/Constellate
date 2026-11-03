import { useEffect, useRef, useState } from 'react';
import CsRoot from '../components/CsRoot';
import { DashCtx } from '../components/DashContext';
import Sidebar, { BottomNav } from '../components/Sidebar';
import Topbar from '../components/Topbar';
import Pop from '../components/Pop';
import StatusPanel from '../components/StatusPanel';
import Icon from '../components/Icon';
import Overview from './Overview';
import AtlasView from './AtlasView';
import Health from './Health';
import Pathfinder from './Pathfinder';
import Chronicle from './Chronicle';
import { loadHist } from '../lib/utils';
import { getDemoDataset, adaptSnapshot } from '../lib/adapter';
import { fetchHistory, fetchSnapshot } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

export default function Dashboard() {
  const { rawUser } = useAuth();
  const userId = rawUser?.id;
  const [view, setView] = useState('overview');
  const [dd, setDd] = useState(null); // 'bell' | 'exm' | 'sres' | 'pop'
  const [pop, setPop] = useState({ tab: 'settings', at: 'bl' });
  const [historyState, setHistoryState] = useState(() => ({ userId, items: loadHist(userId) }));
  const hist = historyState.userId === userId ? historyState.items : loadHist(userId);
  const [activeData, setActiveData] = useState(() => getDemoDataset());
  const [sel, setSel] = useState(-1);
  const [note, setNote] = useState('');
  const [repo, setRepo] = useState('No atlas cast yet');
  const [repository, setRepository] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [stats, setStats] = useState({ a: 0, f: 0, cycles: 0, health: 0 });
  const [status, setStatus] = useState({ t: '', s: '', p: null });
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState('force');
  const [hk, setHk] = useState(0);
  const [newId, setNewId] = useState(null);
  const [badge, setBadge] = useState(true);
  const [toast, setToast] = useState({ m: '', on: false });
  const urlRef = useRef();
  const atRef = useRef();
  const tt = useRef();

  const setHist = (fn) =>
    setHistoryState((current) => {
      const previous = current.userId === userId ? current.items : loadHist(userId);
      const n = typeof fn === 'function' ? fn(previous) : fn;
      if (userId) {
        try {
          localStorage.setItem(`cs-hist:${userId}`, JSON.stringify(n));
        } catch {
          /* ignore */
        }
      }
      return { userId, items: n };
    });

  useEffect(() => {
    let active = true;
    if (!userId) return () => { active = false; };

    fetchHistory().then((items) => {
      if (!active) return;
      const cached = new Map(loadHist(userId).map((item) => [String(item.id), item]));
      const history = items.map((item) => {
        const previous = cached.get(String(item.id));
        return {
          ...previous,
          ...item,
          l: item.l || previous?.l,
          f: item.f ?? previous?.f,
          h: item.h ?? previous?.h,
          cy: item.cy ?? previous?.cy,
          g: item.g ?? previous?.g,
          ms: item.ms ?? previous?.ms,
          snapshot: previous?.snapshot,
        };
      });
      setHistoryState({ userId, items: history });
      try {
        localStorage.setItem(`cs-hist:${userId}`, JSON.stringify(history));
      } catch {
        /* ignore */
      }
    }).catch(() => {});

    return () => { active = false; };
  }, [userId]);

  const say = (m) => {
    setToast({ m, on: true });
    clearTimeout(tt.current);
    tt.current = setTimeout(() => setToast((t) => ({ ...t, on: false })), 2400);
  };

  const hold = (m) => {
    clearTimeout(tt.current);
    setToast({ m, on: true });
  };

  const unhold = () => setToast((t) => ({ ...t, on: false }));

  const go = (n) => {
    setView(n);
    if (n === 'history') setHk((k) => k + 1);
    const viewsEl = document.querySelector('#cs .views');
    if (viewsEl) viewsEl.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pickNode = (i) => {
    const at = atRef.current;
    if (i < 0) {
      at?.select(-1);
      setSel(-1);
      return;
    }
    if (view !== 'atlas') go('atlas');
    at?.select(i);
    setSel(i);
    setNote('');
    at?.focus(i);
  };

  const setAtlasMode = (m) => {
    atRef.current?.setMode(m);
    setMode(m);
  };

  const showCycle = () => {
    go('atlas');
    setTimeout(() => {
      const at = atRef.current;
      if (at) {
        at.setHi(new Set(activeData.ring));
        at.reset();
        setSel(-1);
        setNote(activeData.ring.length ? 'cycle highlighted' : 'no import cycles detected');
      }
    }, 60);
  };

  const showHeat = () => {
    go('atlas');
    setAtlasMode('heat');
  };

  const focusCast = () => {
    go('overview');
    setTimeout(() => {
      document.getElementById('an')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      urlRef.current?.focus({ preventScroll: true });
    }, 140);
  };

  const loadSnapshotData = (snap, label) => {
    const adapted = adaptSnapshot(snap, label);
    setActiveData(adapted);
    setSnapshot(snap);
    if (snap?.repo?.fullname && snap?.repo?.sha) {
      setRepository({ fullname: snap.repo.fullname, sha: snap.repo.sha });
    }
    setRepo(adapted.label);
    setStats((s) => ({
      a: s.a + (adapted.isDemo ? 0 : 1),
      f: adapted.N.length,
      cycles: adapted.ring.length,
      health: adapted.stats.health,
    }));
    setSel(-1);
    setNote('');
    atRef.current?.setData(adapted);
    return adapted;
  };

  const openCast = async (h) => {
    if (h.st === 'fizzled') {
      say('That cast fizzled. Cast it again from the Sanctum');
      return;
    }
    if (h.snapshot) {
      loadSnapshotData(h.snapshot, h.n + ' · ' + h.s);
      say('Reopening the atlas for ' + h.n);
      go('atlas');
      return;
    }
    if (h.snapshotUrl) {
      say('Fetching snapshot for ' + h.n + '…');
      try {
        const snap = await fetchSnapshot(h.snapshotUrl);
        loadSnapshotData(snap, h.n + ' · ' + h.s);
        say('Reopening the atlas for ' + h.n);
        go('atlas');
        return;
      } catch {
        say('Could not load snapshot for ' + h.n);
      }
    }
    // Try fetching from backend snapshots route if available
    if (h.n && h.s && /^[0-9a-f]{40}$/i.test(h.s)) {
      try {
        const snap = await fetchSnapshot(`/snapshots/${h.n}/${h.s}`);
        loadSnapshotData(snap, h.n + ' · ' + h.s);
        say('Reopening the atlas for ' + h.n);
        go('atlas');
        return;
      } catch {
        /* fallback to repository profile dataset */
      }
    }
    // Load tailored dataset for this repository
    const demo = getDemoDataset(h.n, h.s, h);
    setActiveData(demo);
    setRepo(demo.label);
    setStats({
      a: 1,
      f: demo.stats.f || demo.N.length,
      cycles: demo.stats.cycles,
      health: demo.stats.health,
    });
    setSel(-1);
    setNote('');
    atRef.current?.setData(demo);
    say('Reopening the atlas for ' + h.n);
    go('atlas');
  };

  const showPop = (tab, at) => {
    if (dd === 'pop' && pop.tab === tab && pop.at === at) {
      setDd(null);
      return;
    }
    setPop({ tab, at });
    setDd('pop');
  };

  useEffect(() => {
    document.title = 'Dashboard · Constellate';
  }, []);

  useEffect(() => {
    if (view === 'atlas') atRef.current?.resize();
  }, [view]);

  useEffect(() => {
    const click = (e) => {
      if (!e.target.closest('#cs .dd,#cs .ib,#cs .sb,#cs .pt')) setDd(null);
    };
    const key = (e) => {
      if (e.key === 'Escape') setDd(null);
      if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
        e.preventDefault();
        go('atlas');
        setTimeout(() => document.getElementById('q')?.focus(), 80);
      }
    };
    document.addEventListener('click', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('click', click);
      document.removeEventListener('keydown', key);
    };
  }, []);

  const ctx = {
    view,
    go,
    dd,
    setDd,
    pop,
    showPop,
    hist,
    setHist,
    activeData,
    setActiveData,
    loadSnapshotData,
    sel,
    setSel,
    note,
    repo,
    setRepo,
    repository,
    setRepository,
    snapshot,
    setSnapshot,
    stats,
    setStats,
    status,
    setStatus,
    url,
    setUrl,
    urlRef,
    atRef,
    mode,
    setAtlasMode,
    hk,
    newId,
    setNewId,
    badge,
    setBadge,
    say,
    hold,
    unhold,
    pickNode,
    showCycle,
    showHeat,
    focusCast,
    openCast,
  };

  return (
    <DashCtx.Provider value={ctx}>
      <CsRoot extra="dash">
        <div className="body">
          <Sidebar />
          <div className="main">
            <Topbar />
            <main className="views">
              <Overview />
              <AtlasView />
              <Health />
              <Pathfinder />
              <Chronicle />
            </main>
          </div>
        </div>
        <BottomNav />
        <StatusPanel />
        <Pop />
        <div className={'toast' + (toast.on ? ' on' : '')} role="status">
          <Icon n="check" style={{ color: 'var(--gold)' }} />
          <span>{toast.m}</span>
        </div>
      </CsRoot>
    </DashCtx.Provider>
  );
}
