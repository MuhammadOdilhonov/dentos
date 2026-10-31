// #1 regressiya — navigatsiya progress kontrolleri (lib/navProgress.ts). Soxta soat bilan
// deterministik. Qamrab olingan holatlar: dashboard→qabullar, query-only tugashi (90% da
// qolmaslik), A→B→C generatsiya, eski GET/commit yangi progressni nollamasligi, fon saqlash
// (PUT) bloklamasligi, hard timeout → xato, pct running paytda 100% emasligi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-resolve.mjs', import.meta.url);

const { NavProgress, normalizeSearch } = await import('../src/lib/navProgress.ts');

function make() {
  let nowv = 0;
  const snaps = [];
  const np = new NavProgress((s) => snaps.push({ ...s }), { quietMs: 300, hardTimeoutMs: 12000, now: () => nowv });
  return { np, snaps, adv: (ms) => { nowv += ms; }, setNow: (v) => { nowv = v; } };
}

test('normalizeSearch', () => {
  assert.equal(normalizeSearch(''), '');
  assert.equal(normalizeSearch('a=1'), '?a=1');
  assert.equal(normalizeSearch('?a=1'), '?a=1');
  assert.equal(normalizeSearch(null), '');
});

test('dashboard→qabullar: GET yuklangach TUGAYDI (yashil holatga qaytadi)', () => {
  const { np, adv } = make();
  np.start({ pathname: '/appointments', search: '' }, 'Qabullar bo‘limi ochilmoqda…');
  assert.equal(np.snapshot.active, true);
  assert.ok(np.snapshot.pct < 100, 'boshida 100% emas');
  np.apiStart('GET');                 // sahifa ma'lumotini yuklaydi
  np.onLocation('/appointments', ''); // route committed
  np.tick();
  assert.equal(np.snapshot.active, true, 'GET uchayotganda tugamaydi');
  np.apiEnd('GET');
  assert.equal(np.snapshot.active, true, 'quiet davri hali o‘tmagan');
  adv(300); np.tick();
  assert.equal(np.snapshot.active, false, 'GET tinchigach tugaydi');
  assert.equal(np.snapshot.phase, 'done');
  assert.equal(np.snapshot.pct, 100);
});

test('query-only o‘tish: 90% da QOLMAYDI, tugaydi', () => {
  const { np, adv } = make();
  np.start({ pathname: '/patients', search: '?page=2' }, '…');
  // ko'p tik — committed emas → shift 90% da to'xtaydi, lekin ACTIVE qoladi (hali)
  for (let i = 0; i < 50; i++) np.tick();
  assert.ok(np.snapshot.pct <= 90 && np.snapshot.active, 'committed emas → ≤90%, hali faol');
  np.onLocation('/patients', 'page=2'); // normalizatsiya: 'page=2' === '?page=2'
  adv(300); np.tick();
  assert.equal(np.snapshot.active, false, 'query-only navigatsiya TUGADI');
  assert.equal(np.snapshot.pct, 100);
});

test('A→B→C tez navigatsiya: faqat oxirgi (C) generatsiya tugaydi; eski commit e‘tiborsiz', () => {
  const { np, adv } = make();
  np.start({ pathname: '/a', search: '' }, 'A');
  np.start({ pathname: '/b', search: '' }, 'B');
  np.start({ pathname: '/c', search: '' }, 'C');
  const gC = np.generation;
  np.onLocation('/a', '');  // ESKI destination — e'tiborsiz
  assert.equal(np.snapshot.committed, false, 'A commit e‘tiborsiz (dest = /c)');
  assert.equal(np.snapshot.label, 'C');
  np.onLocation('/c', '');
  adv(300); np.tick();
  assert.equal(np.snapshot.active, false);
  assert.equal(np.snapshot.gen, gC);
});

test('eski GET tugashi YANGI (committed bo‘lmagan) progressni nollamaydi/tugatmaydi', () => {
  const { np } = make();
  np.start({ pathname: '/a', search: '' }, 'A');
  np.apiStart('GET');                         // A ning GET'i
  np.start({ pathname: '/b', search: '' }, 'B'); // yangi nav — hisoblagich 0 ga tushadi
  np.apiEnd('GET');                           // eski A GET tugadi
  assert.equal(np.snapshot.active, true, 'B hali faol');
  assert.equal(np.snapshot.committed, false, 'B committed emas → tugamaydi');
});

test('fon saqlash (PUT/POST) navigatsiyani USHLAB TURMAYDI', () => {
  const { np, adv } = make();
  np.start({ pathname: '/a', search: '' }, 'A');
  np.onLocation('/a', '');     // committed, GET yo'q
  np.apiStart('PUT');          // fon saqlash — nav tayyorligiga ta'sir qilmaydi
  np.apiStart('POST');
  adv(300); np.tick();
  assert.equal(np.snapshot.active, false, 'PUT/POST uchayotgan bo‘lsa ham tugaydi');
});

test('hard timeout → XATO (yolg‘on 100% EMAS)', () => {
  const { np, setNow } = make();
  np.start({ pathname: '/a', search: '' }, 'A');
  setNow(13000); np.tick();
  assert.equal(np.snapshot.phase, 'error');
  assert.equal(np.snapshot.active, false);
  assert.notEqual(np.snapshot.pct, 100, 'timeoutda 100% ko‘rsatmaydi');
});

test('routeReady hodisasi darhol tugatadi (route-bog‘langan tayyorlik)', () => {
  const { np } = make();
  np.start({ pathname: '/reports', search: '' }, '…');
  np.onLocation('/reports', '');
  np.apiStart('GET');          // GET hali uchmoqda, lekin sahifa o'zini tayyor dedi
  np.routeReady('/reports');
  assert.equal(np.snapshot.active, false, 'routeReady → darhol tugaydi');
  assert.equal(np.snapshot.pct, 100);
});

test('cancel: unmount/bo‘lim almashishida faol progress tozalanadi', () => {
  const { np } = make();
  np.start({ pathname: '/a', search: '' }, 'A');
  np.cancel();
  assert.equal(np.snapshot.active, false);
  assert.equal(np.snapshot.phase, 'idle');
});
