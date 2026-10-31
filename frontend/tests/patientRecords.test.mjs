// Deterministik frontend regressiya testlari — patientRecords sessiya/avlod (generation)
// bekor qilish semantikasi. Tashqi test-framework YO'Q; Node 24 native TS + lokal
// resolve hook (ts-resolve.mjs) bilan ishlaydi:
//   node --import ./tests/ts-resolve.mjs ... --test tests/patientRecords.test.mjs
// Eslatma: --import orqali hook register qilinadi (quyida).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-resolve.mjs', import.meta.url);

// ── Mock brauzer muhiti ───────────────────────────────────────────────────
const events = [];
globalThis.window = {
  dispatchEvent(e) { events.push(e.detail); return true; },
  addEventListener() {}, removeEventListener() {}, location: {},
};
globalThis.localStorage = {
  _d: { '32desk_auth_user': JSON.stringify({ clinicId: 2 }) },
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
  key() { return null; }, get length() { return 0; },
};
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
globalThis.AbortController = class { constructor(){ this.signal = {}; } abort(){} };

// Boshqariladigan fetch: har bir chaqiruvni qo'lda hal qilamiz (kechiktirilgan javob).
let fetchQueue = [];
globalThis.fetch = (url, opts) => new Promise((resolve, reject) => {
  fetchQueue.push({ url: String(url), method: (opts?.method || 'GET'), body: opts?.body, resolve, reject });
});
function respondJson(entry, body, ok = true, status = 200) {
  entry.resolve({ ok, status, async json() { return body; }, clone() { return this; } });
}
function respondError(entry, status, detail) {
  entry.resolve({ ok: false, status, async json() { return { detail }; }, clone() { return this; } });
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const sawError = (msg) => events.some((d) => d && d.error === msg);

const pr = await import('../src/lib/patientRecords.ts');

function resetFetch() { fetchQueue = []; events.length = 0; pr.resetPatientRecords(); }

test('reset cancels an in-flight PUT: no negative pending, no new-session write', async () => {
  resetFetch();
  // 1) Saqlash boshlandi → GET (hydrate) so'rovi navbatга tushadi.
  pr.savePatientRecord(10, 'notes', [{ t: 'A' }]);
  await tick();
  assert.equal(pr.hasUnsavedRecords(), true, 'pending>0 bo‘lishi kerak');
  const get1 = fetchQueue.find((f) => f.method === 'GET');
  assert.ok(get1, 'hydrate GET yuborilishi kerak');
  respondJson(get1, {}); // hydrate javobi
  await tick();
  const put1 = fetchQueue.find((f) => f.method === 'PUT');
  assert.ok(put1, 'PUT yuborilishi kerak');
  // 2) PUT javobi KELMASDAN reset qilinadi (logout/akkaunt almashishi).
  pr.resetPatientRecords();
  assert.equal(pr.hasUnsavedRecords(), false, 'reset darhol tozalaydi');
  // 3) Eski PUT javobi endi qaytadi.
  respondJson(put1, { value: [{ t: 'A' }], version: 1 });
  await tick(); await tick();
  // pending manfiy bo‘lmasligi va yangi sessiya holati buzilmasligi kerak.
  const lastPending = events.length ? events[events.length - 1].pending : 0;
  assert.ok(lastPending >= 0, `pending manfiy bo‘lmasin, oldi: ${lastPending}`);
  assert.equal(pr.hasUnsavedRecords(), false, 'eski ish yangi sessiyada "saqlanmadi" ko‘rsatmasin');
});

test('stale GET after reset does not populate new-session cache', async () => {
  resetFetch();
  pr.savePatientRecord(11, 'notes', [{ t: 'B' }]);
  await tick();
  const get1 = fetchQueue.find((f) => f.method === 'GET');
  pr.resetPatientRecords();                 // reset GET javobidan oldin
  respondJson(get1, { notes: { value: [{ t: 'STALE' }], version: 9 } });
  await tick(); await tick();
  // Yangi sessiyada eski hydration qiymati ko‘rinmasligi kerak.
  assert.deepEqual(pr.readPatientRecord(11, 'notes', []), [], 'stale hydration keshga yozmasin');
});

test('version conflict (409) surfaces failed, no silent overwrite', async () => {
  resetFetch();
  pr.savePatientRecord(12, 'notes', [{ t: 'C' }]);
  await tick();
  respondJson(fetchQueue.find((f) => f.method === 'GET'), { notes: { value: [], version: 0 } });
  await tick();
  const put1 = fetchQueue.find((f) => f.method === 'PUT');
  put1.resolve({ ok: false, status: 409, async json() { return { detail: 'conflict', version: 3 }; }, clone() { return this; } });
  await tick(); await tick();
  assert.equal(pr.hasUnsavedRecords(), true, '409 dan keyin "failed" bo‘lishi kerak');
});

// ── 409 konflikt: retry YANGI versiya + BIRLASHGAN qiymat yuboradi (eski versiya emas),
//    foydalanuvchi tahririni ham, boshqa xodim ishini ham yo'qotmaydi, cheksiz loop yo'q ──
test('409 conflict: retry refetches version and MERGES (no stale version, no clobber)', async () => {
  resetFetch();
  // Foydalanuvchi #99 ga o'z yozuvini qo'shadi (id:1).
  pr.savePatientRecord(99, 'notes', [{ id: 1, t: 'MINE' }]);
  await tick();
  // Hydrate: klient version 0 deb biladi.
  const hydrate = fetchQueue.find((f) => f.method === 'GET'); hydrate._done = 1;
  respondJson(hydrate, { notes: { value: [], version: 0 } });
  await tick();
  // 1-PUT: version 0 bilan ketadi, lekin boshqa xodim allaqachon version 1 qilgan → 409.
  const put1 = fetchQueue.find((f) => f.method === 'PUT' && !f._done); put1._done = 1;
  assert.equal(JSON.parse(put1.body).version, 0, '1-PUT version=0 yuboradi');
  put1.resolve({ ok: false, status: 409, async json() { return { detail: 'conflict', version: 1 }; }, clone() { return this; } });
  await tick(); await tick();
  // Retry AVVAL serverni qayta o'qiydi (GET) — bu bug'ning aynan tuzatilishi.
  const refetch = fetchQueue.find((f) => f.method === 'GET' && !f._done); if (refetch) refetch._done = 1;
  assert.ok(refetch, '409 dan keyin qayta GET (refetch) bo‘lishi kerak');
  // Server qiymatida boshqa xodimning yozuvi bor (id:2).
  respondJson(refetch, { notes: { value: [{ id: 2, t: 'THEIRS' }], version: 1 } });
  await tick(); await tick();
  // 2-PUT: YANGI version (1) + BIRLASHGAN qiymat (ikkala yozuv ham).
  const put2 = fetchQueue.find((f) => f.method === 'PUT' && !f._done); if (put2) put2._done = 1;
  assert.ok(put2, '2-PUT (retry) bo‘lishi kerak');
  const body2 = JSON.parse(put2.body);
  assert.equal(body2.version, 1, 'retry YANGI versiya (1) yuborishi kerak — eski 0 EMAS');
  const ids = body2.value.map((x) => x.id).sort();
  assert.deepEqual(ids, [1, 2], 'birlashgan qiymat ikkala yozuvni ham saqlashi kerak (klobber yo‘q)');
  // Server qabul qiladi.
  put2.resolve({ ok: true, status: 200, async json() { return { value: body2.value, version: 2 }; }, clone() { return this; } });
  await tick(); await tick();
  assert.equal(pr.hasUnsavedRecords(), false, 'konflikt hal bo‘lgach saqlanmagan qolmaydi');
});

// ── #1 regressiya: ikki sessiya bir vaqtda — LOKAL O'CHIRISH qaytib kelmasligi ──
//    base=[{id:1},{id:2}], local foydalanuvchi id:2 ni O'CHIRDI → local=[{id:1}].
//    Boshqa xodim shu orada hech narsa o'zgartirmadi → server=[{id:1},{id:2}].
//    409'dan keyin BIRLASHTIRISH id:2 ni QAYTARMASLIGI kerak (ko'r-ko'rona union bug'i).
test('409 merge: LOKAL o‘chirilgan yozuv qaytib kelmaydi (no resurrection)', async () => {
  resetFetch();
  // Kesh "base" ni bilishi uchun avval hydrate qilamiz: [{id:1},{id:2}] version 0.
  const hp = pr.hydratePatientRecords(50);   // await QILMAYMIZ — GET'ga javob keyin beramiz (deadlock bo'lmasin)
  await tick();
  respondJson(fetchQueue.find((f) => f.method === 'GET' && !f._done), { notes: { value: [{ id: 1, t: 'A' }, { id: 2, t: 'B' }], version: 0 } });
  await hp;
  fetchQueue.forEach((f) => { if (f.method === 'GET') f._done = 1; });
  // Foydalanuvchi id:2 ni o'chiradi → faqat id:1 qoladi (base keshdagi [1,2] bo'ladi).
  pr.savePatientRecord(50, 'notes', [{ id: 1, t: 'A' }]);
  await tick();
  // 1-PUT: version 0. Boshqa xodim versiyani 1 qilgan (lekin KONTENT o'zgarmagan) → 409.
  const put1 = fetchQueue.find((f) => f.method === 'PUT' && !f._done); put1._done = 1;
  put1.resolve({ ok: false, status: 409, async json() { return { detail: 'conflict', version: 1 }; }, clone() { return this; } });
  await tick(); await tick();
  // Retry serverni qayta o'qiydi: server HALI ikkala yozuvni saqlaydi (o'chirish faqat lokal).
  const refetch = fetchQueue.find((f) => f.method === 'GET' && !f._done); refetch._done = 1;
  respondJson(refetch, { notes: { value: [{ id: 1, t: 'A' }, { id: 2, t: 'B' }], version: 1 } });
  await tick(); await tick();
  // 2-PUT: BIRLASHGAN qiymat — id:2 QAYTMASLIGI kerak (lokal o'chirgan, server tegmagan).
  const put2 = fetchQueue.find((f) => f.method === 'PUT' && !f._done); put2._done = 1;
  const body2 = JSON.parse(put2.body);
  const ids = body2.value.map((x) => x.id).sort();
  assert.deepEqual(ids, [1], 'o‘chirilgan id:2 birlashtirishdan keyin QAYTMASLIGI kerak');
  put2.resolve({ ok: true, status: 200, async json() { return { value: body2.value, version: 2 }; }, clone() { return this; } });
  await tick(); await tick();
  assert.equal(pr.hasUnsavedRecords(), false, 'o‘chirish saqlangach failed qolmaydi');
});

// ── #1 regressiya: o'chirish vs boshqa xodim TAHRIRI konflikti — server tahriri YUTADI ──
//    base=[{id:1},{id:2}], local id:2 ni o'chirdi, lekin server id:2 ni TAHRIRLADI.
//    Bu haqiqiy konflikt: boshqa xodim ishini jim yo'qotmaslik uchun server yozuvi saqlanadi.
test('409 merge: o‘chirish vs boshqa xodim tahriri — server tahririni saqlaydi', async () => {
  resetFetch();
  const hp = pr.hydratePatientRecords(51);
  await tick();
  respondJson(fetchQueue.find((f) => f.method === 'GET' && !f._done), { notes: { value: [{ id: 1, t: 'A' }, { id: 2, t: 'B' }], version: 0 } });
  await hp;
  fetchQueue.forEach((f) => { if (f.method === 'GET') f._done = 1; });
  pr.savePatientRecord(51, 'notes', [{ id: 1, t: 'A' }]);   // lokal id:2 ni o'chirdi
  await tick();
  const put1 = fetchQueue.find((f) => f.method === 'PUT' && !f._done); put1._done = 1;
  put1.resolve({ ok: false, status: 409, async json() { return { detail: 'conflict', version: 1 }; }, clone() { return this; } });
  await tick(); await tick();
  const refetch = fetchQueue.find((f) => f.method === 'GET' && !f._done); refetch._done = 1;
  // Server id:2 ni TAHRIRLADI (t: 'B'→'B2') — ya'ni base'dan farq qiladi.
  respondJson(refetch, { notes: { value: [{ id: 1, t: 'A' }, { id: 2, t: 'B2' }], version: 1 } });
  await tick(); await tick();
  const put2 = fetchQueue.find((f) => f.method === 'PUT' && !f._done); put2._done = 1;
  const body2 = JSON.parse(put2.body);
  const item2 = body2.value.find((x) => x.id === 2);
  assert.ok(item2, 'o‘chirish vs tahrir konfliktida server tahriri (id:2) SAQLANISHI kerak');
  assert.equal(item2.t, 'B2', 'boshqa xodimning tahriri jim yo‘qolmasligi kerak');
});

// ── Bug #3: reset'dan keyin eskirgan so'rov xatosi yangi sessiyaga CHIQMASLIGI ──
async function startSaveThroughPut(pid) {
  pr.savePatientRecord(pid, 'notes', [{ t: 'x' }]);
  await tick();
  respondJson(fetchQueue.find((f) => f.method === 'GET'), {}); // hydrate ok
  await tick();
  return fetchQueue.find((f) => f.method === 'PUT');
}

test('reset then old PUT 500: stale error does NOT leak to new session', async () => {
  resetFetch();
  const put = await startSaveThroughPut(30);
  pr.resetPatientRecords();                 // yangi sessiya boshlandi
  respondError(put, 500, 'OLD SESSION ERROR');
  await tick(); await tick();
  assert.equal(sawError('OLD SESSION ERROR'), false, 'eskirgan 500 xatosi global chiqmasligi kerak');
  assert.equal(pr.hasUnsavedRecords(), false);
});

test('reset then old PUT network error: no stale error leak', async () => {
  resetFetch();
  const put = await startSaveThroughPut(31);
  pr.resetPatientRecords();
  put.reject(new Error('network down'));
  await tick(); await tick();
  // apiFetch tarmoq xatosida umumiy xabar beradi — lekin reset'dan keyin chiqmasligi kerak.
  assert.equal(events.some((d) => d && d.error), false, 'eskirgan tarmoq xatosi chiqmasligi kerak');
  assert.equal(pr.hasUnsavedRecords(), false);
});

test('reset then old 409: no stale error, no failed in new session', async () => {
  resetFetch();
  const put = await startSaveThroughPut(32);
  pr.resetPatientRecords();
  respondError(put, 409, 'Boshqa xodim o‘zgartirdi');
  await tick(); await tick();
  assert.equal(events.some((d) => d && d.error), false);
  assert.equal(pr.hasUnsavedRecords(), false, 'eski 409 yangi sessiyada "failed" qoldirmasin');
});

test('ACTIVE session PUT 500 DOES surface the error (not hidden)', async () => {
  resetFetch();
  const put = await startSaveThroughPut(33);
  respondError(put, 500, 'LIVE ERROR');     // reset YO'Q — faol sessiya
  await tick(); await tick();
  assert.equal(sawError('LIVE ERROR'), true, 'faol sessiya xatosi ko‘rinishi kerak');
  assert.equal(pr.hasUnsavedRecords(), true, 'faol sessiyada failed bo‘lishi kerak');
});

test('normal save succeeds and clears pending to zero', async () => {
  resetFetch();
  pr.savePatientRecord(13, 'notes', [{ t: 'D' }]);
  await tick();
  respondJson(fetchQueue.find((f) => f.method === 'GET'), {});
  await tick();
  respondJson(fetchQueue.find((f) => f.method === 'PUT'), { value: [{ t: 'D' }], version: 1 });
  await tick(); await tick();
  assert.equal(pr.hasUnsavedRecords(), false, 'muvaffaqiyatli saqlashdan keyin pending=0');
  assert.deepEqual(pr.readPatientRecord(13, 'notes', []), [{ t: 'D' }]);
});

// ── Logout flush: saqlanmagan o'zgarishlar AVVAL serverga yuboriladi ──
test('flushPatientRecords waits for pending save then reports saved', async () => {
  resetFetch();
  pr.savePatientRecord(40, 'notes', [{ t: 'F' }]);
  await tick();
  const flushP = pr.flushPatientRecords();   // logout shu funksiyani kutadi
  await tick();
  respondJson(fetchQueue.find((f) => f.method === 'GET'), {});
  await tick();
  respondJson(fetchQueue.find((f) => f.method === 'PUT'), { value: [{ t: 'F' }], version: 1 });
  const allSaved = await flushP;
  assert.equal(allSaved, true, 'hammasi saqlangach flush true qaytaradi');
  assert.equal(pr.hasUnsavedRecords(), false, 'flushdan keyin saqlanmagan qolmaydi');
  assert.deepEqual(pr.readPatientRecord(40, 'notes', []), [{ t: 'F' }]);
});

test('flushPatientRecords returns false when save keeps failing (logout ogohlantiradi)', async () => {
  resetFetch();
  pr.savePatientRecord(41, 'notes', [{ t: 'G' }]);
  await tick();
  const flushP = pr.flushPatientRecords();
  // GET va har bir PUT paydo bo'lishi bilan 500 bilan rad etamiz (flush 3 marta qayta uriadi)
  for (let i = 0; i < 14; i++) {
    await tick();
    const get = fetchQueue.find((f) => f.method === 'GET' && !f._done); if (get) { get._done = 1; respondJson(get, {}); }
    const put = fetchQueue.find((f) => f.method === 'PUT' && !f._done); if (put) { put._done = 1; respondError(put, 500, 'server xato'); }
  }
  const allSaved = await flushP;
  assert.equal(allSaved, false, 'saqlanmagan bo‘lsa flush false qaytaradi');
  assert.equal(pr.hasUnsavedRecords(), true, 'failed hali turibdi — logout foydalanuvchidan so‘raydi');
});
