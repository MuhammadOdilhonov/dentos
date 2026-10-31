// Navigatsiya progressi — FREYMVORKSIZ, test qilinadigan yadro. React (NetworkStatusBar)
// faqat DOM hodisalarini shu kontrollerga ulaydi; shuning uchun mantiqni to'liq unit-test
// qilsa bo'ladi (query-only tugashi, A→B→C generatsiya, eski timer/so'rov yangi progressni
// nollamasligi, timeout→xato, fon saqlash bloklamasligi).
//
// Asosiy g'oyalar:
//  - Har navigatsiyaga GENERATION (gen) + destination {pathname, search} biriktiriladi.
//  - Yangi start() eskisini almashtiradi (gen oshadi, holat tozalanadi). Eski gen'ning kech
//    kelgan GET'i/tiki yangi progressni TUGATMAYDI va NOLLAMAYDI.
//  - Tugash FAQAT: committed (pathname+search = destination) VA route tayyorligi:
//      * routeReady(pathname) hodisasi (sahifa o'zini tayyor deb e'lon qiladi), YOKI
//      * committed'dan keyin GET so'rovlari `quietMs` davomida tinch (fon saqlash/POST emas).
//  - Faqat GET nav tayyorligiga ta'sir qiladi — fon saqlash (PUT/POST) bloklamaydi.
//  - hardTimeoutMs ichida tayyor bo'lmasa → 'error' (yolg'on 100% EMAS).

export interface NavSnapshot {
  active: boolean;
  committed: boolean;
  pct: number;
  label: string;
  phase: 'idle' | 'running' | 'done' | 'error';
  estimated: boolean; // haqiqiy o'lchov emas — taxminiy
  gen: number;
}
export interface NavDest { pathname: string; search: string; }
export interface NavProgressOptions {
  quietMs?: number;
  hardTimeoutMs?: number;
  now?: () => number;
}

export function normalizeSearch(s: string | null | undefined): string {
  if (!s) return '';
  return s.startsWith('?') ? s : `?${s}`;
}

export class NavProgress {
  private gen = 0;
  private dest: NavDest | null = null;
  private startedAt = 0;
  private lastGetActivityAt = 0;
  private getInFlight = 0;
  private readyByEvent = false;
  private snap: NavSnapshot = { active: false, committed: false, pct: 0, label: '', phase: 'idle', estimated: true, gen: 0 };
  private quietMs: number;
  private hardTimeoutMs: number;
  private now: () => number;
  private emit: (s: NavSnapshot) => void;

  constructor(emit: (s: NavSnapshot) => void = () => {}, opts: NavProgressOptions = {}) {
    this.emit = emit;
    this.quietMs = opts.quietMs ?? 300;
    this.hardTimeoutMs = opts.hardTimeoutMs ?? 12000;
    this.now = opts.now ?? (() => Date.now());
  }

  get snapshot(): NavSnapshot { return this.snap; }
  get generation(): number { return this.gen; }

  start(dest: NavDest, label: string): number {
    this.gen++;
    this.dest = { pathname: dest.pathname, search: normalizeSearch(dest.search) };
    this.startedAt = this.now();
    this.lastGetActivityAt = this.startedAt;
    this.getInFlight = 0;
    this.readyByEvent = false;
    this.snap = { active: true, committed: false, pct: 8, label, phase: 'running', estimated: true, gen: this.gen };
    this.push();
    return this.gen;
  }

  // Joriy URL (pathname + search). destination bilan mos kelsa — committed.
  onLocation(pathname: string, search: string): void {
    if (!this.snap.active || !this.dest) return;
    if (pathname === this.dest.pathname && normalizeSearch(search) === this.dest.search) {
      if (!this.snap.committed) {
        this.snap = { ...this.snap, committed: true };
        this.lastGetActivityAt = this.now();
        this.push();
      }
      this.maybeFinish();
    }
  }

  // Sahifa o'zini "tayyor" deb e'lon qiladi (ixtiyoriy, route-bog'langan signal).
  routeReady(pathname: string): void {
    if (!this.snap.active || !this.dest) return;
    if (pathname === this.dest.pathname) { this.readyByEvent = true; this.maybeFinish(); }
  }

  // FAQAT GET nav tayyorligiga ta'sir qiladi (fon saqlash POST/PUT bloklamaydi).
  apiStart(method: string): void {
    if (!this.snap.active || (method || 'GET').toUpperCase() !== 'GET') return;
    this.getInFlight++;
    this.lastGetActivityAt = this.now();
  }
  apiEnd(method: string): void {
    if (!this.snap.active || (method || 'GET').toUpperCase() !== 'GET') return;
    this.getInFlight = Math.max(0, this.getInFlight - 1);
    this.lastGetActivityAt = this.now();
    this.maybeFinish();
  }

  // Davriy chaqiriladi (animatsiya + timeout). Faol bo'lmasa — hech narsa.
  tick(): void {
    if (!this.snap.active) return;
    if (this.now() - this.startedAt > this.hardTimeoutMs) { this.fail(); return; }
    const ceiling = this.snap.committed ? 96 : 90;
    const pct = Math.min(ceiling, this.snap.pct + (ceiling - this.snap.pct) * 0.16 + 0.4);
    this.snap = { ...this.snap, pct };
    this.push();
    this.maybeFinish();
  }

  private maybeFinish(): void {
    if (!this.snap.active || !this.snap.committed) return;
    const quiet = this.getInFlight === 0 && (this.now() - this.lastGetActivityAt) >= this.quietMs;
    if (this.readyByEvent || quiet) this.finish();
  }
  private finish(): void {
    this.snap = { ...this.snap, active: false, committed: false, pct: 100, phase: 'done' };
    this.dest = null;
    this.push();
  }
  private fail(): void {
    this.snap = { ...this.snap, active: false, committed: false, phase: 'error', label: 'Sahifa ochilmadi — qayta urinish' };
    this.dest = null;
    this.push();
  }
  cancel(): void {
    if (!this.snap.active) return;
    this.snap = { ...this.snap, active: false, committed: false, phase: 'idle' };
    this.dest = null;
    this.push();
  }
  // 'done'/'error' holatidan keyin bar'ni yashirish (yangi nav boshlanmagan bo'lsa).
  clearDone(): void {
    if (this.snap.active) return;
    this.snap = { ...this.snap, pct: 0, phase: 'idle', label: '' };
    this.push();
  }

  private push(): void { this.emit(this.snap); }
}
