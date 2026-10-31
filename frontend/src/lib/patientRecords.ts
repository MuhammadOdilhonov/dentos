import { apiFetch, API_BASE_URL, reportApiError, ApiError } from './http';
type Entry = { value: any; version: number };
const records = new Map<string, Record<string, Entry>>();
const inflight = new Map<string, Promise<void>>();
const queues = new Map<string, Promise<void>>();
const failed = new Map<string, () => void>();
let pending = 0;
// Sessiya "avlodi". resetPatientRecords() uni oshiradi; shundan oldin boshlangan
// har qanday GET/PUT (javobi reset'dan keyin kelsa) yangi sessiya keshi/holatiga
// TEGMAYDI. Shu tufayli logout/akkaunt almashishida eski ishlar yangi akkauntga
// bog'lanmaydi va `pending` hech qachon manfiy bo'lmaydi.
let generation = 0;
function identity(id: number) {
  const user = JSON.parse(localStorage.getItem('32desk_auth_user') || 'null');
  if (!user?.clinicId || Number(user.clinicId) === 1) throw new Error('Real klinika kerak.');
  return { cid: Number(user.clinicId), key: `${user.clinicId}:${id}` };
}
function notify() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('dentos-save-state', { detail: { pending, failed: failed.size } }));
}
export async function hydratePatientRecords(id: number) {
  const { cid, key } = identity(id);
  if (records.has(key)) return;
  if (inflight.has(key)) return inflight.get(key);
  const gen = generation;
  const promise = (async () => {
    // report=false — xatoni global chiqarishni apiFetch'ga qoldirmaymiz; eskirgan
    // sessiya xatosi yangi sessiyaga chiqmasligi uchun chaqiruvchi gen-tekshiruvdan keyin o'zi xabar beradi.
    const response = await apiFetch(`${API_BASE_URL}/patient-records/${id}/`, { headers: { 'X-Clinic-ID': String(cid) } }, false);
    const data = await response.json();
    // Reset bo'lgan bo'lsa (eski sessiya) — yangi keshni ustidan yozmaymiz.
    if (gen === generation) records.set(key, data);
  })();
  inflight.set(key, promise);
  try { await promise; } finally { if (gen === generation) inflight.delete(key); }
}
// 409 (konflikt) dan keyin serverning ENG SO'NGGI holatini MAJBURAN qayta oladi
// (hydratePatientRecords `records.has` bo'lsa o'tkazib yuboradi — bu esa doim yangilaydi).
async function refreshPatientRecords(id: number): Promise<void> {
  const { cid, key } = identity(id);
  const gen = generation;
  const response = await apiFetch(`${API_BASE_URL}/patient-records/${id}/`, { headers: { 'X-Clinic-ID': String(cid) } }, false);
  const data = await response.json();
  if (gen === generation) records.set(key, data);
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
  return true;
}
function isPlainObject(v: any): boolean {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

// 409 konfliktida UCH TOMONLAMA (3-way) birlashtirish: `base` = klient tahrirni
// BOSHLAGAN paytdagi (yuborilgan versiyaga mos) holat, `server` = serverning eng
// so'nggi holati, `local` = foydalanuvchi saqlamoqchi bo'lgan holat.
//
// Ko'r-ko'rona union KASALLIGI (eski bug): lokal O'CHIRISHlar server nusxasidan
// qaytib kelardi, server tahrirlari esa doim lokal nusxa bilan bosib tashlanardi.
// 3-way bu ikkisini farqlaydi:
//   - element base'da bor, lekin local'da YO'Q (lokal o'chirgan) → server uni
//     O'ZGARTIRMAGAN bo'lsa o'chirilgan deb qoldiramiz (QAYTARMAYMIZ); server
//     o'zgartirgan bo'lsa (o'chirish vs tahrir konflikti) server tahririni saqlaymiz.
//   - element base'da bor, lekin server'da YO'Q (boshqa xodim o'chirgan) → lokal
//     o'zgartirmagan bo'lsa o'chirilgan deb qoldiramiz; lokal tahrirlagan bo'lsa saqlaymiz.
//   - element faqat bir tomonda yangi qo'shilgan → saqlaymiz.
//   - ikkala tomonda bor va faqat BIRI base'dan farq qilsa → o'sha tomon yutadi
//     (hech kim ikkinchisining tahririni ko'r-ko'rona bosmaydi). Ikkalasi ham
//     o'zgargan bo'lsa (haqiqiy konflikt) — lokal yutadi, lekin aynan o'sha
//     element uchun (butun bo'lim emas).
function mergeItem(base: any, server: any, local: any): any {
  if (isPlainObject(base) && isPlainObject(server) && isPlainObject(local)) {
    return mergeObject(base, server, local);
  }
  // Skalar/aralash: local base'dan farq qilsa local, aks holda server.
  return deepEqual(local, base) ? server : local;
}
function mergeObject(base: any, server: any, local: any): any {
  const result: any = { ...server };               // serverdan boshlaymiz
  for (const k of Object.keys(local)) {
    if (!deepEqual(local[k], base?.[k])) result[k] = local[k];   // local shu kalitni o'zgartirgan → local
    // aks holda local tegmagan → serverniki (allaqachon result'da) qoladi
  }
  for (const k of Object.keys(base || {})) {        // local o'chirgan kalitlar
    if (!(k in local) && deepEqual(server?.[k], base[k])) delete result[k];
  }
  return result;
}
function mergeSection(base: any, server: any, local: any): any {
  if (Array.isArray(server) && Array.isArray(local)) {
    const baseArr: any[] = Array.isArray(base) ? base : [];
    const hasId = (x: any) => x && x.id != null;
    // Har bir element id'ga ega bo'lmasa 3-way qila olmaymiz (pozitsion) — local
    // qiymatni olamiz (joriy, kutilgan natija). Union qilib eski o'chirilganlarni
    // qaytarmaymiz.
    const allHaveIds = [...baseArr, ...server, ...local].every(hasId);
    if (!allHaveIds) return local;
    const baseById = new Map<any, any>(baseArr.map((it) => [it.id, it]));
    const serverById = new Map<any, any>(server.map((it) => [it.id, it]));
    const result: any[] = [];
    const seen = new Set<any>();
    for (const it of local) {                        // lokal tartibni saqlaymiz
      const id = it.id; seen.add(id);
      if (serverById.has(id)) {
        result.push(mergeItem(baseById.get(id), serverById.get(id), it));
      } else if (baseById.has(id)) {
        // server o'chirgan: lokal tegmagan bo'lsa o'chirilgan qoladi, tahrirlagan bo'lsa saqlaymiz
        if (!deepEqual(baseById.get(id), it)) result.push(it);
      } else {
        result.push(it);                             // lokal yangi qo'shgan
      }
    }
    for (const it of server) {                       // local'da yo'q server elementlari
      const id = it.id; if (seen.has(id)) continue;
      if (baseById.has(id)) {
        // lokal o'chirgan: server tegmagan bo'lsa o'chirilgan qoladi, tahrirlagan bo'lsa saqlaymiz
        if (!deepEqual(baseById.get(id), it)) result.push(it);
      } else {
        result.push(it);                             // boshqa xodim yangi qo'shgan
      }
    }
    return result;
  }
  if (isPlainObject(server) && isPlainObject(local)) {
    return mergeObject(isPlainObject(base) ? base : {}, server, local);
  }
  return local;
}

export function readPatientRecord(id: number, section: string, fallback: any = []) {
  const { key } = identity(id);
  return records.get(key)?.[section]?.value ?? fallback;
}
// Keshni SINXRON yangilaydi (versiyaga tegmaydi). Ketma-ket tez savePatientRecord
// chaqiruvlarida (masalan jurnal navbati bilan to'lganda) keyingi readPatientRecord
// eng so'nggi qiymatni ko'rishi uchun — aks holda har chaqiruv eski keshdan o'qib,
// faqat oxirgi yozuv saqlanardi.
export function primeLocalPatientRecord(id: number, section: string, value: any) {
  const { key } = identity(id);
  const data = records.get(key) || {};
  data[section] = { value, version: data[section]?.version ?? 0 };
  records.set(key, data);
}
export function savePatientRecord(id: number, section: string, value: any): void {
  const { cid, key } = identity(id);
  const queueKey = `${key}:${section}`;
  // Snapshot now, before subsequent UI mutations can change the pending request.
  const snapshot = JSON.parse(JSON.stringify(value));
  // `base` = foydalanuvchi shu tahrirni boshlaganda keshda turgan (ya'ni yuboriladigan
  // versiyaga mos) holat. 409'da 3-way merge uchun kerak — o'chirishni qo'shishdan
  // farqlaydi. Save chaqirilgan paytda kesh hali ESKI qiymatni saqlaydi (chaqiruvchi
  // yangi `value` ni alohida uzatadi, keshni o'zi yangilamaydi), shuning uchun shu yer
  // to'g'ri "base". (naryad_log kabi append-only bo'limlar primeLocal bilan keshni
  // oldin yangilaydi — o'sha yerda base==snapshot bo'ladi, lekin u yerda o'chirish yo'q.)
  const base = JSON.parse(JSON.stringify(records.get(key)?.[section]?.value ?? null));
  const run = () => {
    const gen = generation;          // shu urinish qaysi sessiyaga tegishli
    pending++; notify();
    let counted = true;              // pending'ni faqat BIR marta va to'g'ri gen'da kamaytiramiz
    const settle = () => { if (counted && gen === generation) { pending--; notify(); } counted = false; };
    const previous = queues.get(queueKey) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      // Reset bo'lgan bo'lsa — eski navbatdagi yangi so'rovni UMUMAN boshlamaymiz.
      if (gen !== generation) return;
      await hydratePatientRecords(id);
      if (gen !== generation) return;
      // 409 (boshqa yozuvchi versiyani oshirgan) bo'lsa: serverning eng so'nggi holatini
      // olib, foydalanuvchi tahririni U BILAN BIRLASHTIRIB, YANGI versiya bilan qayta
      // yuboramiz. Eski versiya/eski snapshot bilan qayta yubormaymiz (aks holda cheksiz
      // 409 yoki boshqa xodim ishini klobber qilish). Urinishlar CHEGARALANGAN.
      let valueToSend = snapshot;
      const MAX_CONFLICT_RETRIES = 4;
      for (let attempt = 0; ; attempt++) {
        const data = records.get(key)!;
        const version = data[section]?.version || 0;
        try {
          const response = await apiFetch(`${API_BASE_URL}/patient-records/${id}/`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Clinic-ID': String(cid) },
            body: JSON.stringify({ section, value: valueToSend, version }),
          }, false); // xatoni apiFetch global chiqarmasin — pastdagi gen-guard'li catch xabar beradi
          const saved = await response.json();
          // Javob reset'dan keyin kelsa — yangi sessiya keshi/holatiga tegmaymiz.
          if (gen !== generation) return;
          data[section] = saved;
          failed.delete(queueKey);
          return;
        } catch (error) {
          if (error instanceof ApiError && error.status === 409 && attempt < MAX_CONFLICT_RETRIES) {
            if (gen !== generation) return;           // reset bo'lsa (logout) umuman urinmaymiz
            await refreshPatientRecords(id);          // eng so'nggi {value, version}
            if (gen !== generation) return;
            const latest = records.get(key)?.[section];
            // 3-way: base (tahrir boshlangan holat) / server (eng so'nggi) / local (yubormoqchi).
            // O'chirishlarni qaytarmaydi, server tahrirlarini ko'r-ko'rona bosmaydi.
            valueToSend = mergeSection(base, latest?.value ?? [], valueToSend);
            continue;                                  // yangi versiya + birlashgan qiymat bilan qayta urinamiz
          }
          throw error;                                 // 409 bo'lmasa yoki urinishlar tugasa — failed'ga
        }
      }
    }).catch(error => {
      // Eski sessiya ishini "saqlanmadi" deb yangi sessiyada ko'rsatmaymiz.
      if (gen !== generation) return;
      // No automatic overwrite on conflict; keep an explicit retry/error indicator.
      failed.set(queueKey, run);
      reportApiError(error instanceof Error ? error.message : 'Saqlash bajarilmadi.');
    }).finally(settle);
    queues.set(queueKey, task);
  };
  run();
}
export function retryPatientRecords() { for (const run of Array.from(failed.values())) run(); }
// Logout/akkaunt almashishidan OLDIN chaqiriladi: navbatdagi va uchayotgan saqlashlarni
// serverga YUBORIB TUGATADI (failed'larni qayta uriadi). Hammasi saqlansa true qaytaradi.
// Shundan keyingina chaqiruvchi local sessiya/cookie'ni tozalashi mumkin — ma'lumot yo'qolmaydi.
export async function flushPatientRecords(): Promise<boolean> {
  retryPatientRecords();
  // Ikki urinish: failed qayta ishga tushganda yangi navbat paydo bo'lishi mumkin.
  for (let i = 0; i < 3; i++) {
    await Promise.allSettled(Array.from(queues.values()));
    if (failed.size === 0 && pending === 0) break;
    if (failed.size > 0) retryPatientRecords();
  }
  return pending === 0 && failed.size === 0;
}
export function hasUnsavedRecords() { return pending > 0 || failed.size > 0; }
export function clearPatientRecords() { records.clear(); }
// Logout / akkaunt almashishida butun modul holatini tozalaymiz VA avlodni oshiramiz —
// eski akkauntning davom etayotgan GET/PUT'lari yangi akkaunt keshiga/failed/pending'iga
// tegmaydi, navbatdagi yangi so'rovlar boshlanmaydi, pending manfiy bo'lmaydi.
// (Saqlanmagan o'zgarishlar bo'lsa, chaqiruvchi avval ogohlantiradi.)
export function resetPatientRecords() {
  generation++;
  records.clear(); inflight.clear(); queues.clear(); failed.clear(); pending = 0;
  notify();
}
