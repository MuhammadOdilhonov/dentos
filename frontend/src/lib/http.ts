export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) { super(message); this.name = 'ApiError'; this.status = status; }
}
export function reportApiError(message: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('dentos-save-state', { detail: { error: message } }));
}
// `report` (default true) — xatoda global `dentos-save-state` eventini chiqaradimi.
// Sessiyaga bog'liq qatlamlar (masalan patientRecords) `false` berib, xatoni
// KO'RSATISH mas'uliyatini o'ziga oladi: shunda reset/akkaunt almashishidan keyin
// eskirgan so'rovning xatosi yangi sessiyaga chiqib qolmaydi. ApiError baribir
// tashlanadi — chaqiruvchi avlod (generation) tekshiruvidan so'ng o'zi reportApiError qiladi.
export async function apiFetch(input: string, options: RequestInit = {}, report = true): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('X-Dentos-Request', '1');
  const isAuth = input.includes('/auth/') || input.includes('/technicians/login/');
  if (!isAuth && typeof window !== 'undefined' && !headers.has('X-Clinic-ID')) {
    try {
      const user = JSON.parse(localStorage.getItem('32desk_auth_user') || 'null');
      if (user?.clinicId) headers.set('X-Clinic-ID', String(user.clinicId));
    } catch {}
  }
  // Timeout VA chaqiruvchi bekor qilishini BITTA controller'ga birlashtiramiz.
  // Ilgari `signal: options.signal || controller.signal` edi: caller signal berilsa
  // timeout controller fetch'ga UMUMAN ulanmasdi — ya'ni sekin server caller signalli
  // so'rovda hech qachon to'xtamasdi. Endi ikkala sabab ham shu controller'ni bekor qiladi.
  const controller = new AbortController();
  const callerSignal = options.signal;
  let timedOut = false;
  let canceledByCaller = false;
  const onCallerAbort = () => { canceledByCaller = true; controller.abort(); };
  if (callerSignal) {
    if (callerSignal.aborted) { canceledByCaller = true; controller.abort(); }
    else callerSignal.addEventListener('abort', onCallerAbort);
  }
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.body instanceof FormData ? 300000 : 30000);
  try {
    const response = await fetch(input, { ...options, credentials: 'include', headers, signal: controller.signal });
    let demo = false;
    try { demo = Number(JSON.parse(localStorage.getItem('32desk_auth_user') || 'null')?.clinicId) === 1; } catch {}
    if (!response.ok && !isAuth && !demo) {
      const body = await response.clone().json().catch(() => ({}));
      const message = typeof body.detail === 'string' ? body.detail : `Server saqlamadi (HTTP ${response.status}). ${JSON.stringify(body).slice(0, 250)}`;
      if (report) reportApiError(message);
      throw new ApiError(message, response.status);
    }
    return response;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Chaqiruvchi ATAYLAB bekor qildi (sahifadan chiqish / tez A→B navigatsiya) — bu XATO EMAS.
    // Global "Saqlanmadi" ko'rsatmaymiz; eskirgan sahifa so'rovi yangi ekranga xato chiqarmasin.
    // ApiError'ni AbortError nomi bilan tashlaymiz — chaqiruvchi uni jim o'tkazib yuboradi.
    if (canceledByCaller) {
      const aborted = new ApiError('So‘rov bekor qilindi.', 0);
      aborted.name = 'AbortError';
      throw aborted;
    }
    const failure = new ApiError(timedOut
      ? 'Server javob bermadi (vaqt tugadi). Ma’lumot saqlangan deb hisoblamang.'
      : 'Serverga ulanish uzildi yoki vaqt tugadi. Ma’lumot saqlangan deb hisoblamang.');
    if (report) reportApiError(failure.message);
    throw failure;
  } finally {
    clearTimeout(timer);
    if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
  }
}
