'use client';

/**
 * NetworkStatusBar — ekran tepasidagi ixcham status + NAVIGATSIYA progress chizig'i.
 *
 *   Rang:  yashil = onlayn · sariq = so'rov ketyapti / sahifa ochilmoqda · qizil = oflayn.
 *   Chap:  holat yozuvi (aria-live — skrinriderga o'qiladi).   O'ng: ping · tezlik · amal.
 *
 *   #2  "/" bosh sahifada BAR ko'rinmaydi, joy ajratilmaydi, health polling ishlamaydi.
 *   #3  Link/router.push/replace/back-forward/query-param navigatsiyasida DARHOL sariq bo'lib
 *       "… bo'limi ochilmoqda" ko'rsatadi; progress harakatlanadi (taxminiy %); sahifa
 *       committed (pathname+search) + route GET so'rovlari tinchigach 100% → yashil.
 *       Mantiq test qilinadigan NavProgress kontrollerida (lib/navProgress.ts).
 *   #4  AbortError (navigatsiya/caller cancel) SARIQ XATO BO'LMAYDI; muvaffaqiyatli so'rov
 *       eski "stuck"ni tozalaydi; health polling bir vaqtda bitta, timeoutli, statusni tekshiradi.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { retryPatientRecords } from '../lib/patientRecords';
import { NavProgress } from '../lib/navProgress';

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

type Phase = 'online' | 'busy' | 'offline';

interface State {
  phase: Phase;
  statusText: string;
  op: string;
  ping: number | null;
  mbps: number | null;
  stuck: boolean;
  stuckText: string;
  navActive: boolean;
  navLabel: string;
  navPct: number;
}

const LINE: Record<Phase, string> = { online: '#22c55e', busy: '#f59e0b', offline: '#ef4444' };

const SECTION: Record<string, string> = {
  dashboard: 'Boshqaruv paneli', appointments: 'Qabullar', patients: 'Bemorlar',
  lab: 'Laboratoriya', staff: 'Xodimlar', naryads: 'Naryadlar', warehouse: 'Ombor',
  reports: 'Hisobotlar', tasks: 'Vazifalar', pulse: 'Puls', settings: 'Sozlamalar',
  'photo-protocol': 'Foto-protokol', 'super-admin': 'SuperAdmin', technician: 'Texnik',
  help: 'Yordam', login: 'Kirish',
};
export function sectionLabel(path: string): string {
  const seg = path.replace(/\/+$/, '').split('/').filter(Boolean)[0] || '';
  const name = SECTION[seg];
  return name ? `${name} bo‘limi ochilmoqda…` : 'Ma’lumotlar yuklanmoqda…';
}

function opLabel(method: string, url: string): string {
  const m = method.toUpperCase();
  let path = url;
  try { path = new URL(url, window.location.origin).pathname; } catch {}
  const seg = path.replace(/\/+$/, '').split('/').filter(Boolean);
  const last = seg[seg.length - 1] || '';
  const map: Record<string, string> = {
    'login': 'Kirish', 'logout': 'Chiqish', 'me': 'Tekshiruv',
    'patients': 'Bemorlar', 'appointments': 'Qabullar', 'employees': 'Xodimlar',
    'finance': 'Moliya', 'lab-orders': 'Laboratoriya', 'service-catalog': 'Xizmatlar',
    'telegram': 'Telegram', 'branches': 'Filiallar', 'patient-media': 'Media',
    'photo-protocol': 'Foto-protokol', 'tasks': 'Vazifalar', 'monthly-plan': 'Reja',
  };
  const human = map[last] || map[seg[seg.length - 2]] || 'Server';
  if (m === 'GET') return `${human} yuklanmoqda…`;
  if (m === 'DELETE') return `${human} o'chirilmoqda…`;
  return `${human} saqlanmoqda…`;
}

function isAbortError(e: any): boolean {
  return !!e && (e.name === 'AbortError' || e.code === 20 || /aborted|abort/i.test(e.message || ''));
}

export default function NetworkStatusBar() {
  const pathname = usePathname();
  const isLanding = pathname === '/';
  const [mounted, setMounted] = useState(false);
  const [st, setSt] = useState<State>({
    phase: 'online', statusText: 'Onlayn', op: '', ping: null, mbps: null,
    stuck: false, stuckText: '', navActive: false, navLabel: '', navPct: 0,
  });

  const active = useRef(0);
  const lastOp = useRef('');
  const pendingSaves = useRef(0);
  const stuckRef = useRef<{ on: boolean; text: string }>({ on: false, text: '' });
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // recompute'ni NavProgress emit ichidan chaqirish uchun (nav tugaganda bar DARHOL yashil bo'lsin)
  const recomputeRef = useRef<() => void>(() => {});

  // ── Navigatsiya progress kontrolleri (test qilinadigan yadro) ──
  const navRef = useRef<NavProgress | null>(null);
  const navTicker = useRef<ReturnType<typeof setInterval> | null>(null);
  const navDoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navErr = useRef(false);
  if (navRef.current === null) {
    navRef.current = new NavProgress((snap) => {
      const isErr = snap.phase === 'error';
      navErr.current = isErr;
      setSt((o) => ({
        ...o,
        navActive: snap.active,
        navLabel: snap.label,
        navPct: isErr ? 0 : snap.pct,
        ...(isErr ? { stuck: true, stuckText: snap.label } : {}),
      }));
      if (isErr) stuckRef.current = { on: true, text: snap.label };
      // Navigatsiya tugagach (yoki xato) — statusni DARHOL qayta hisoblaymiz:
      // aks holda "... ochilmoqda" yozuvi va sariq rang keyingi so'rovgacha osilib qoladi.
      if (!snap.active) setTimeout(() => recomputeRef.current(), 0);
      // Tik faqat FAOL navigatsiya davomida (keraksiz doimiy timer yo'q).
      if (snap.active && !navTicker.current) {
        navTicker.current = setInterval(() => navRef.current?.tick(), 120);
      } else if (!snap.active && navTicker.current) {
        clearInterval(navTicker.current); navTicker.current = null;
      }
      // 'done' → bar'ni biroz keyin yashiramiz, FAQAT yangi navigatsiya boshlanmagan bo'lsa (gen guard).
      if (snap.phase === 'done') {
        const g = snap.gen;
        if (navDoneTimer.current) clearTimeout(navDoneTimer.current);
        navDoneTimer.current = setTimeout(() => {
          const c = navRef.current;
          if (c && c.generation === g && !c.snapshot.active) c.clearDone();
        }, 320);
      }
    });
  }

  // --netbar-h ni pathname'ga qarab SAKRAMASDAN o'rnatamiz ("/" da 0, aks holda 26px).
  useIsoLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--netbar-h', isLanding ? '0px' : '26px');
  }, [isLanding]);

  useEffect(() => { setMounted(true); }, []);

  // ── Navigatsiyani kuzatish: Link bosish + router.push/replace + back/forward + query-param ──
  useEffect(() => {
    if (isLanding) return; // bosh sahifada navigatsiya progressi kerak emas
    const c = navRef.current!;
    const lastLoc = { path: window.location.pathname, search: window.location.search };

    // Anchor/Link bosilganda — URL o'zgarishidan OLDIN darhol boshlaymiz (foydalanuvchi tez ko'radi).
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      let el = e.target as HTMLElement | null;
      while (el && el.tagName !== 'A') el = el.parentElement;
      const a = el as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!href || a.target === '_blank' || a.hasAttribute('download')) return;
      let dest: URL;
      try { dest = new URL(href, window.location.href); } catch { return; }
      if (dest.origin !== window.location.origin) return;                 // tashqi havola
      if (dest.pathname === '/' ) return;                                 // bosh sahifada bar yo'q
      if (dest.pathname === window.location.pathname && dest.search === window.location.search) return; // bir xil URL / hash-only
      c.start({ pathname: dest.pathname, search: dest.search }, sectionLabel(dest.pathname));
    };

    // router.push/replace (dastur orqali) va back/forward — history hodisasi orqali.
    const onLoc = () => {
      const path = window.location.pathname;
      const search = window.location.search;
      if (!c.snapshot.active) {
        // Click bilan boshlanmagan dasturiy navigatsiya (router.push / pagination / query)
        if ((path !== lastLoc.path || search !== lastLoc.search) && path !== '/') {
          c.start({ pathname: path, search }, sectionLabel(path));
        }
      }
      c.onLocation(path, search);   // destination mos kelsa — committed
      lastLoc.path = path; lastLoc.search = search;
    };

    // history.pushState/replaceState'ni BIR MARTA o'raymiz (Strict Mode/HMR takror o'ramasin).
    // MUHIM: Next router pushState'ni React'ning useInsertionEffect fazasida chaqiradi.
    // Agar shu yerda SINXRON setState qilsak — "useInsertionEffect must not schedule updates"
    // xatosi chiqadi (va error boundary butun sahifani — masalan naryadni — bosib qo'yadi).
    // Shuning uchun hodisani KEYINGI makrotaskka suramiz: setState faqat insertion fazadan
    // keyin ishlaydi. (popstate/click — oddiy brauzer hodisalari, ular xavfsiz.)
    const w = window as any;
    if (!w.__dentosHistoryPatched) {
      w.__dentosHistoryPatched = true;
      const origPush = history.pushState.bind(history);
      const origReplace = history.replaceState.bind(history);
      const fireLater = () => setTimeout(() => window.dispatchEvent(new Event('dentos-locationchange')), 0);
      history.pushState = function (this: History, ...args: any[]) {
        const r = origPush(...(args as [any, string, any]));
        fireLater();
        return r;
      } as any;
      history.replaceState = function (this: History, ...args: any[]) {
        const r = origReplace(...(args as [any, string, any]));
        fireLater();
        return r;
      } as any;
    }

    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onLoc);
    window.addEventListener('dentos-locationchange', onLoc);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onLoc);
      window.removeEventListener('dentos-locationchange', onLoc);
      if (navTicker.current) { clearInterval(navTicker.current); navTicker.current = null; }
      if (navDoneTimer.current) { clearTimeout(navDoneTimer.current); navDoneTimer.current = null; }
      c.cancel(); // bo'lim/sahifa almashsa yoki unmount — faol progressni tozalaymiz
    };
  }, [isLanding]);

  // pathname o'zgarganda commit'ni ham chaqiramiz (usePathname App Router'da ishonchli signal).
  useEffect(() => {
    if (isLanding) return;
    navRef.current?.onLocation(window.location.pathname, window.location.search);
  }, [pathname, isLanding]);

  useEffect(() => {
    const conn: any = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    // navigator.connection.downlink brauzerda 10 Mbps bilan CHEKLANGAN va qo'pol taxmin —
    // shuning uchun avval so'nggi yuklangan resurslardan REAL tezlikni o'lchaymiz,
    // ma'lumot yetmasa downlink'ka qaytamiz.
    try { if (performance.setResourceTimingBufferSize) performance.setResourceTimingBufferSize(500); } catch {}
    const measureMbps = (): number | null => {
      try {
        const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const now = performance.now();
        // So'nggi 15s ichida yuklangan, hajmi sezilarli (>20KB) resurslar bo'yicha
        const recent = entries.filter((e) => e.responseEnd > now - 15000 && e.transferSize > 20000 && e.duration > 30);
        if (recent.length === 0) return null;
        let bits = 0; let timeMs = 0;
        for (const e of recent) { bits += e.transferSize * 8; timeMs += e.duration; }
        if (timeMs <= 0) return null;
        return bits / (timeMs / 1000) / 1e6; // Mbps
      } catch { return null; }
    };
    const readMbps = () => {
      const measured = measureMbps();
      if (measured != null && measured > 0) return measured;
      return conn && typeof conn.downlink === 'number' ? conn.downlink : null;
    };

    const recompute = () => {
      setSt((old) => {
        const navSnap = navRef.current?.snapshot;
        let phase: Phase; let statusText: string; let op = '';
        if (!navigator.onLine) {
          phase = 'offline'; statusText = 'Oflayn — internet yo‘q';
        } else if (navSnap && navSnap.active) {
          phase = 'busy'; statusText = navSnap.label; op = '';
        } else if (active.current > 0 || pendingSaves.current > 0) {
          phase = 'busy';
          statusText = pendingSaves.current > 0 ? `Saqlanmoqda (${pendingSaves.current})…` : 'Serverga yuborilmoqda…';
          op = lastOp.current;
        } else {
          phase = 'online'; statusText = 'Onlayn';
        }
        return { ...old, phase, statusText, op, mbps: readMbps(),
          stuck: stuckRef.current.on, stuckText: stuckRef.current.text };
      });
    };

    const setStuck = (on: boolean, text = '') => { stuckRef.current = { on, text }; recompute(); };
    recomputeRef.current = recompute;

    const armSlowWatch = () => {
      if (slowTimer.current) return;
      slowTimer.current = setTimeout(() => {
        if (active.current > 0 || pendingSaves.current > 0) setStuck(true, 'Ulanish sekin — davom ettirish uchun bosing');
      }, 8000);
    };
    const disarmSlowWatch = () => {
      if (slowTimer.current && active.current === 0 && pendingSaves.current === 0) {
        clearTimeout(slowTimer.current); slowTimer.current = null;
      }
      // Barcha so'rovlar tugadi — "Ulanish sekin" ogohlantirishi o'z-o'zidan yo'qolsin
      // (yuklash tugagandan keyin ham sariq/stuck holat osilib qolmasin).
      if (active.current === 0 && pendingSaves.current === 0 && stuckRef.current.on
          && !navErr.current && stuckRef.current.text.startsWith('Ulanish sekin')) {
        setStuck(false);
      }
    };

    // window.fetch'ni o'rab /api faoliyatini kuzatamiz
    const w = window as any;
    const orig: typeof fetch = w.__dentosOrigFetch || window.fetch.bind(window);
    w.__dentosOrigFetch = orig;
    const patched = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      let url = ''; let method = 'GET';
      try {
        if (typeof input === 'string') url = input;
        else if (input instanceof URL) url = input.toString();
        else if (input instanceof Request) { url = input.url; method = input.method || 'GET'; }
        if (init?.method) method = init.method;
      } catch {}
      const isApi = url.includes('/api/');
      const isHealth = url.includes('/api/health/');
      const track = isApi && !isHealth;
      if (track) {
        active.current += 1; lastOp.current = opLabel(method, url); armSlowWatch(); recompute();
        navRef.current?.apiStart(method);  // FAQAT GET nav tayyorligiga ta'sir qiladi
      }
      try {
        const res = await orig(input as any, init);
        if (track) {
          if (res.ok && stuckRef.current.on && !navErr.current) setStuck(false); // ulanish tiklandi
          if (!res.ok && res.status >= 500) setStuck(true, 'Server javob bermadi — qayta urinish');
        }
        return res;
      } catch (e) {
        if (track && !isAbortError(e)) setStuck(true, 'Ulanish uzildi — qayta urinish'); // abort ≠ xato
        throw e;
      } finally {
        if (track) {
          active.current = Math.max(0, active.current - 1);
          disarmSlowWatch(); recompute();
          navRef.current?.apiEnd(method);  // route GET tinchisa — nav tugashi mumkin
        }
      }
    };
    window.fetch = patched as typeof fetch;

    // Ping — /api/health/. Bir vaqtda BITTA, timeoutli, HTTP statusni tekshiradi.
    let pingStop = false;
    let pingInFlight = false;
    const measurePing = async () => {
      if (pingStop || pingInFlight || isLanding || !navigator.onLine) return;
      pingInFlight = true;
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 4000);
      const t0 = performance.now();
      try {
        const res = await orig(`/api/health/?t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
        setSt((old) => ({ ...old, ping: res.ok ? Math.round(performance.now() - t0) : null }));
      } catch { setSt((old) => ({ ...old, ping: null })); }
      finally { clearTimeout(to); pingInFlight = false; }
    };
    if (!isLanding) measurePing();
    const pingTimer = setInterval(measurePing, 5000);

    const onOnline = () => { if (!navErr.current) setStuck(false); measurePing(); recompute(); };
    const onOffline = () => recompute();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (conn && conn.addEventListener) conn.addEventListener('change', recompute);

    const onSave = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (typeof d.pending === 'number') { pendingSaves.current = d.pending; if (d.pending > 0) armSlowWatch(); else disarmSlowWatch(); }
      if (typeof d.failed === 'number' && d.failed > 0) setStuck(true, 'Ba’zi ma’lumot saqlanmadi — qayta saqlash');
      if (d.error) setStuck(true, 'Saqlanmadi — qayta saqlash');
      recompute();
    };
    window.addEventListener('dentos-save-state', onSave);

    recompute();

    return () => {
      pingStop = true;
      clearInterval(pingTimer);
      if (slowTimer.current) clearTimeout(slowTimer.current);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('dentos-save-state', onSave);
      if (conn && conn.removeEventListener) conn.removeEventListener('change', recompute);
      if (window.fetch === patched) window.fetch = orig;
    };
  }, [isLanding]);

  if (!mounted || isLanding) return null; // #2: "/" bosh sahifada bar YO'Q

  const color = LINE[st.phase];
  const busy = st.phase === 'busy';
  const showNav = st.navActive || st.navPct > 0;

  const handleRetry = () => {
    if (navErr.current) {
      // Navigatsiya timeout bo'ldi — sahifani tegishlicha qayta yuklaymiz (yolg'on 100% emas edi).
      navErr.current = false;
      window.location.reload();
      return;
    }
    try { retryPatientRecords(); } catch {}
    try { window.dispatchEvent(new CustomEvent('dentos-retry')); } catch {}
    stuckRef.current = { on: false, text: '' };
    setSt((old) => ({ ...old, stuck: false, stuckText: '' }));
  };

  return (
    <>
      <div
        className="fixed top-0 left-0 right-0 z-[99999] flex items-center justify-between gap-2 px-3 text-white select-none"
        style={{ height: 'var(--netbar-h)', background: 'rgba(9,14,28,0.94)', backdropFilter: 'blur(8px)',
                 borderTop: `3px solid ${color}`, boxShadow: '0 1px 4px rgba(0,0,0,.25)' }}
        role="status" aria-live="polite"
      >
        {showNav && (
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-amber-500/20 overflow-hidden pointer-events-none" aria-hidden>
            <div className="h-full bg-amber-300 transition-[width] duration-200 ease-out" style={{ width: `${st.navPct}%` }} />
          </div>
        )}
        {busy && !showNav && (
          <div className="absolute top-0 left-0 right-0 h-[3px] overflow-hidden pointer-events-none" aria-hidden>
            <div className="absolute inset-y-0 w-1/3 animate-[dentosSlide_1.1s_linear_infinite]"
                 style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.9), transparent)' }} />
          </div>
        )}

        <span className="flex items-center gap-1.5 text-[11px] font-bold whitespace-nowrap min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} aria-hidden />
          <span className="truncate">
            {st.statusText}{showNav && st.navActive ? <span className="text-amber-300 font-semibold"> ~{Math.round(st.navPct)}%</span> : null}
          </span>
        </span>

        <span className="flex items-center gap-2 text-[11px] font-semibold whitespace-nowrap" aria-hidden>
          {st.op && <span className="text-amber-300 hidden sm:inline">{st.op}</span>}
          <span style={{ color: st.ping == null ? '#f87171' : st.ping < 120 ? '#4ade80' : st.ping < 400 ? '#fbbf24' : '#f87171' }}>
            {st.ping == null ? '— ms' : `${st.ping} ms`}
          </span>
          <span className="text-white/30">·</span>
          <span className="text-sky-300">{st.mbps == null ? '—' : `${st.mbps.toFixed(st.mbps < 10 ? 1 : 0)} Mbps`}</span>
        </span>
      </div>

      {st.stuck && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[99998] pointer-events-none" style={{ top: 'var(--netbar-h)' }}>
          <button
            onClick={handleRetry}
            className="pointer-events-auto mt-1.5 flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] font-bold
                       bg-amber-400 hover:bg-amber-300 text-amber-950 shadow-lg shadow-amber-900/30
                       border border-amber-500/40 animate-[dentosDrop_.25s_ease-out] transition active:scale-95"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            {st.stuckText || 'Qayta urinish'}
          </button>
        </div>
      )}

      <style>{`
        @keyframes dentosSlide { 0% { transform: translateX(-120%);} 100% { transform: translateX(420%);} }
        @keyframes dentosDrop { from { opacity: 0; transform: translateY(-8px);} to { opacity: 1; transform: translateY(0);} }
      `}</style>
    </>
  );
}
