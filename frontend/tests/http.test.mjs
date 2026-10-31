// Deterministik regressiya testlari — apiFetch timeout + chaqiruvchi (caller) bekor
// qilishini BITTA controller'ga birlashtirishi. Tashqi framework YO'Q; ts-resolve hook.
//   node --test tests/http.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-resolve.mjs', import.meta.url);

const events = [];
globalThis.window = {
  dispatchEvent(e) { events.push(e.detail); return true; },
  addEventListener() {}, removeEventListener() {},
};
globalThis.localStorage = {
  _d: { '32desk_auth_user': JSON.stringify({ clinicId: 2 }) },
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
// Node'ning haqiqiy AbortController/Headers bor — trivial mock EMAS: signal.aborted,
// addEventListener('abort') haqiqatda ishlaydi, shuning uchun birlashtirishni sinay olamiz.

// setTimeout'ni ushlaymiz: 30s kutmasdan timeout'ni qo'lda otamiz.
let capturedTimeoutFn = null;
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => { capturedTimeoutFn = fn; return 1; };
globalThis.clearTimeout = () => {};
const fireTimeout = () => { const fn = capturedTimeoutFn; capturedTimeoutFn = null; if (fn) fn(); };
const tick = () => new Promise((r) => realSetTimeout(r, 0));

function abortError() { const e = new Error('aborted'); e.name = 'AbortError'; return e; }
// Haqiqiy fetch kabi: signal abort bo'lsa reject qiladi, aks holda OSILIB turadi.
let lastInit = null;
globalThis.fetch = (input, init) => {
  lastInit = init;
  return new Promise((_resolve, reject) => {
    const sig = init.signal;
    if (sig.aborted) return reject(abortError());
    sig.addEventListener('abort', () => reject(abortError()));
  });
};

const { apiFetch } = await import('../src/lib/http.ts');

test('timeout BIR controller orqali fetch signalini bekor qiladi (caller signal berilgan bo‘lsa ham)', async () => {
  events.length = 0;
  const callerController = new AbortController();
  // Chaqiruvchi signal berdi, lekin uni HECH QACHON abort qilmaydi — faqat timeout bo'ladi.
  const p = apiFetch('/api/slow/', { signal: callerController.signal });
  await tick();
  // Regressiya: fetch'ga berilgan signal — birlashgan controller signali bo'lishi,
  // va timeout otilganda u ABORTED bo'lishi kerak (ilgari caller signali hech abort bo'lmasdi).
  assert.equal(lastInit.signal.aborted, false, 'boshida aborted=false');
  fireTimeout();                       // 30s o'rniga timeout'ni qo'lda otamiz
  assert.equal(lastInit.signal.aborted, true, 'timeout fetch signalini bekor qilishi SHART');
  await assert.rejects(p, (err) => err.name === 'ApiError' || err.message.includes('vaqt tugadi'));
  // Timeout — haqiqiy xato: report=true bo'lgani uchun global xabar chiqadi.
  assert.ok(events.some((d) => d && d.error && d.error.includes('vaqt tugadi')), 'timeout global xato berishi kerak');
});

test('chaqiruvchi bekor qilsa (navigatsiya) — global "Saqlanmadi" xatosi CHIQMAYDI', async () => {
  events.length = 0;
  const callerController = new AbortController();
  const p = apiFetch('/api/page/', { signal: callerController.signal }); // report default = true
  await tick();
  callerController.abort();             // sahifadan chiqish / tez A→B o'tish
  await assert.rejects(p, (err) => err.name === 'AbortError');
  assert.equal(events.some((d) => d && d.error), false, 'bekor qilingan so‘rov global xato bermasligi kerak');
});

test('darhol bekor qilingan caller signal: fetch bekor holatda boshlanadi, xato chiqmaydi', async () => {
  events.length = 0;
  const callerController = new AbortController();
  callerController.abort();             // so'rovdan OLDIN bekor qilingan
  const p = apiFetch('/api/page/', { signal: callerController.signal });
  await assert.rejects(p, (err) => err.name === 'AbortError');
  assert.equal(events.some((d) => d && d.error), false, 'oldindan bekor qilingan so‘rov ham jim bo‘lishi kerak');
});
