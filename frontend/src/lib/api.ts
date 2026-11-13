import { apiFetch, ApiError, reportApiError } from './http';
import { hydratePatientRecords, readPatientRecord, savePatientRecord, primeLocalPatientRecord } from './patientRecords';
import {
  Employee, Patient, Appointment, FinancialTransaction,
  ClinicTask, WarehouseItem, DentalLabOrder, DashboardStats,
  NaryadDraftItem, NaryadLogEntry, NaryadCatalogItem, DoctorNaryadAssignment,
  TreatmentPlanStage, DentalTechnician, PlatformSetting, DoctorCertificate, DoctorDiploma,
  TechnicianPriceItem, ClinicTenant, ClinicDossierData, WorkplaceItem, SpecialtyItem,
  EmployeeScheduleInterval, EmployeeDaySchedule, Branch, ServiceCategory
} from './types';
import {
  mockEmployees, mockPatients, mockAppointments,
  mockTransactions, mockTasks, mockWarehouse,
  mockLabOrders, mockStats, mockClinics, mockTechnicians, mockBranches
} from './mockData';

// Default to the same-origin reverse-proxy path ('/api'). In local dev Next.js
// rewrites '/api/*' to 127.0.0.1:8000 (next.config.mjs); in production Caddy
// proxies it. Never hardcode 127.0.0.1 — that would bypass the proxy in a browser.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

export function getActiveClinicId(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('32desk_auth_user');
    if (!raw) return null;
    const user = JSON.parse(raw);
    if (user?.clinicId !== undefined && user?.clinicId !== null) {
      return Number(user.clinicId);
    }
  } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Demo (namoyish) klinika (id = 1) — FAQAT KO'RISH rejimi.
// Demo akkauntda: ma'lumot qo'shish/o'zgartirish/o'chirish, fayl (skan/rentgen/
// fotoprotokol) yuklash va Telegram ulash O'CHIRILGAN. Mavjud namuna ma'lumot
// ko'rinadi, lekin saqlanmaydi. Real klinikalar (id ≠ 1) to'liq ishlaydi.
// ──────────────────────────────────────────────────────────────────────────
export const DEMO_CLINIC_ID = 1;

export function isDemoClinic(cid?: number | null): boolean {
  const id = cid !== undefined ? cid : getActiveClinicId();
  return Number(id) === DEMO_CLINIC_ID;
}

/**
 * Demo klinika bo'lsa `true` qaytaradi — amal BAZAGA jo'natilmaydi (saqlanmaydi).
 * ALERT YO'Q: foydalanuvchi formani to'ldirib, "Saqlash"ni bosib ko'raveradi,
 * faqat natija bazaga ketmaydi. Eslatma — tepadagi aylanuvchi banner (DemoBanner).
 */
export function demoBlocked(_message?: string): boolean {
  return isDemoClinic();
}

export function getClinicStorageKey(baseKey: string, explicitCid?: number | null): string {
  const cid = explicitCid !== undefined ? explicitCid : getActiveClinicId();
  if (cid) {
    return `${baseKey}_clinic_${cid}`;
  }
  return baseKey;
}

// ──────────────────────────────────────────────────────────────────────────
// DEMO namuna media (bemor #1) — demo klinikada rentgen/foto/skan "ko'rsatish"
// uchun. Saqlanmaydi; getter'lar faqat demo'da va #1-bemorda bo'sh bo'lsa qaytaradi.
// ──────────────────────────────────────────────────────────────────────────
const DEMO_SAMPLE_XRAYS = [
  {
    id: 'demo_xray_1', type: 'image', title: 'OPTG — Panoramik rentgen (demo namuna)',
    date: '2026-10-10', src: '/dicom_slices/axial_190.png',
    notes: 'Demo namuna rentgen tasviri (haqiqiy bemor ma\'lumoti emas).',
    brightness: 0, contrast: 110, inverted: false, zoom: 1, rotation: 0,
  },
];
const DEMO_SAMPLE_PHOTO_DOC = [
  {
    id: 'demo_slide_1', background: '#ffffff', elements: [
      { id: 'demo_h', type: 'heading', x: 8, y: 6, width: 84, height: 12, content: 'Foto protokol — demo bemor', fontSize: 34, bold: true, color: '#17212b' },
      { id: 'demo_img', type: 'image', src: '/login/photo-protocol-demo.png', caption: 'Klinik foto (demo namuna)', x: 8, y: 24, width: 62, height: 60, fit: 'contain' as const },
    ],
  },
];
const DEMO_SAMPLE_SCAN = { hasScan: true, scanDate: '2026-10-10', fileName: 'demo_maxillary.stl', notes: 'Demo 3D intraoral skan namunasi.' };
// Demo'dagi OXIRGI bemor (clinic 1 ichidagi eng katta id) — namuna media shunga biriktiriladi.
const DEMO_SAMPLE_PATIENT_ID = 37;

// ──────────────────────────────────────────────────────────────────────────
// Tarmoq keshi (GET) — bo'limdan bo'limga o'tishni tezlashtiradi (SWR uslubi).
//
// Bir xil GET so'rovi 15s ichida takrorlansa — tarmoqqa chiqmasdan darhol keshdan
// qaytariladi (shuning uchun sahifalar "qotib" turmaydi). localStorage-merge qatlami
// kesh ustiga yopishgani uchun foydalanuvchining o'z o'zgarishlari baribir ko'rinadi.
// Har qanday yozish (create/update/delete) bustApiCache() bilan keshni tozalaydi.
// ──────────────────────────────────────────────────────────────────────────
const FETCH_CACHE_TTL = 15000; // ms — yangi deb hisoblanadigan oyna
const _fetchCache = new Map<string, { ts: number; data: any }>();
const _inflight = new Map<string, Promise<any>>();

// Bemor media presence keshi (BAZADAN) — yashil ptichka sinxron o'qishi uchun.
let _mediaPresenceCache: Record<string, { foto: boolean; rentgen: boolean; skan: boolean }> = {};
let _mediaPresenceTotals: { foto: number; rentgen: number; skan: number; patients_with_media: number; files_total: number } | null = null;

export function bustApiCache(): void {
  _fetchCache.clear();
  _inflight.clear();
}

// ──────────────────────────────────────────────────────────────────────────
// Demo klinika (id = 1) ma'lumotini HAFTADA 1 marta avtomatik tozalash.
// Foydalanuvchi demo ichida qo'shgan localStorage o'zgarishlari o'chiriladi va
// demo yana toza namuna (mockData) holatiga qaytadi. Real klinikalarga (id≠1)
// tegilmaydi. Modul yuklanganda (client) bir marta ishga tushadi.
// ──────────────────────────────────────────────────────────────────────────
const DEMO_SEED_TS_KEY = '32desk_demo_seed_ts';
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export function maybeResetDemoData(): void {
  if (typeof window === 'undefined') return;
  try {
    // FAQAT demo klinika (yoki login qilinmagan) uchun. Real klinikaga TEGILMAYDI —
    // ya'ni real foydalanuvchiga '32desk_demo_seed_ts' yozilmaydi va lokal ma'lumoti o'chmaydi.
    const cid = getActiveClinicId();
    if (cid && Number(cid) !== DEMO_CLINIC_ID) return;
    const last = Number(localStorage.getItem(DEMO_SEED_TS_KEY) || 0);
    if (last && Date.now() - last < ONE_WEEK_MS) return;
    const legacyDemoKeys = [
      '32desk_custom_employees', '32desk_custom_patients', '32desk_custom_appointments',
      '32desk_branch_plans_current', '32desk_monthly_plan_current'
    ];
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Faqat demo klinika (id 1) kalitlari: "..._clinic_1" bilan tugaydiganlar + eski kalitlar
      if (/_clinic_1$/.test(k) || legacyDemoKeys.includes(k)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
    localStorage.setItem(DEMO_SEED_TS_KEY, String(Date.now()));
    bustApiCache();
  } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
}
if (typeof window !== 'undefined') {
  try { maybeResetDemoData(); } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
}

async function safeFetch<T>(url: string, fallback: T, options?: RequestInit): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase();
  const cacheable = method === 'GET';
  const cid = getActiveClinicId();

  // Offline (backend o'chiq) uchun localStorage kesh — oxirgi MUVAFFAQIYATLI javob saqlanadi.
  // Backend ishlamasa mock emas, SHU oxirgi haqiqiy ma'lumot ko'rsatiladi (bir xil ko'rinadi).
  const lsKey = `32desk_apicache_${cid || 0}_${url}`;
  const readLs = (): T | undefined => {
    if (!isDemoClinic() || !cacheable || typeof window === 'undefined') return undefined;
    try { const raw = localStorage.getItem(lsKey); if (raw) return JSON.parse(raw) as T; } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
    return undefined;
  };
  const writeLs = (data: any) => {
    if (!isDemoClinic() || !cacheable || typeof window === 'undefined') return;
    try { localStorage.setItem(lsKey, JSON.stringify(data)); } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
  };

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> || {})
    };
    if (cid && !headers['X-Clinic-ID'] && !headers['X-Clinic-Id']) {
      headers['X-Clinic-ID'] = String(cid);
    }

    const isTenantOrAuth = url.includes('/clinics') || url.includes('/auth') || url.includes('/technicians/login') || url.includes('/platform-settings');
    const finalUrl = (cid && !isTenantOrAuth && !url.includes('clinic='))
      ? (url.includes('?') ? `${url}&clinic=${cid}` : `${url}?clinic=${cid}`)
      : url;

    const cacheKey = `${cid || 0}:${finalUrl}`;

    if (cacheable) {
      // 1) Yangi kesh bo'lsa — darhol qaytaramiz (tarmoqqa chiqmaymiz)
      const hit = _fetchCache.get(cacheKey);
      if (hit && Date.now() - hit.ts < FETCH_CACHE_TTL) {
        return hit.data as T;
      }
      // 2) Xuddi shu so'rov allaqachon jarayonda bo'lsa — o'shanga ulanamiz (dedup)
      const pending = _inflight.get(cacheKey);
      if (pending) return (await pending) as T;
    }

    const doFetch = (async () => {
      const res = await apiFetch(finalUrl, { ...options, headers, next: { revalidate: 0 } });
      if (!res.ok) {
        // Xato bo'lsa — avval xotira keshi, keyin localStorage (oxirgi haqiqiy), oxirida fallback
        const stale = cacheable ? _fetchCache.get(cacheKey) : undefined;
        if (stale) return stale.data;
        const ls = readLs();
        if (ls !== undefined) return ls;
        return fallback;
      }
      const json = await res.json();
      if (cacheable) { _fetchCache.set(cacheKey, { ts: Date.now(), data: json }); writeLs(json); }
      return json;
    })();

    if (cacheable) {
      _inflight.set(cacheKey, doFetch);
      try {
        return (await doFetch) as T;
      } finally {
        _inflight.delete(cacheKey);
      }
    }
    return (await doFetch) as T;
  } catch {
    // Tarmoq umuman yo'q — oxirgi haqiqiy (localStorage) ma'lumotни qaytaramiz, bo'lmasa fallback
    const ls = readLs();
    if (ls !== undefined) return ls;
    return fallback;
  }
}

// Naryad jurnaliga bitta yozuvni qo'llaydi (real baza va demo uchun bir xil).
// 'removed' bo'lsa — BARQAROR naryad_id (bo'lmasa id) orqali mavjud FAOL yozuvni topib
// "bekor qilingan" deb belgilaydi. Narx yoki nom o'xshashligi bilan MOSLASHTIRMAYDI.
function applyNaryadLogEntry(list: NaryadLogEntry[], entry: NaryadLogEntry, patientId: number): NaryadLogEntry[] {
  const out = list.slice();
  if (entry.action === 'removed') {
    const key = entry.naryad_id ?? entry.id;
    const idx = out.findIndex(it => it.status !== 'cancelled' && (it.naryad_id ?? it.id) === key);
    if (idx >= 0) {
      out[idx] = { ...out[idx], status: 'cancelled', action: 'removed',
        cancelled_by: entry.author, cancelled_date: entry.date, reason: entry.reason || 'Отменено' };
    } else {
      out.unshift({ ...entry, patient_id: entry.patient_id ?? patientId, status: 'cancelled',
        cancelled_by: entry.author, cancelled_date: entry.date });
    }
  } else {
    out.unshift({ ...entry, patient_id: entry.patient_id ?? patientId, status: 'active' });
  }
  return out;
}

export const clinicApi = {
  async hydratePatient(patientId: number) { if (!isDemoClinic()) await hydratePatientRecords(patientId); },
  // Employees
  async getEmployees(branchId?: number, overrideClinicId?: number): Promise<Employee[]> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    const storageKey = getClinicStorageKey('32desk_custom_employees', cid);
    let customEmps: Employee[] = [];
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) customEmps = JSON.parse(stored);
        if (!stored && (cid === 1)) {
          const legacy = localStorage.getItem('32desk_custom_employees');
          if (legacy) customEmps = JSON.parse(legacy);
        }
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }

    const params = new URLSearchParams();
    if (branchId) params.append('branch', String(branchId));
    if (cid) params.append('clinic', String(cid));
    const q = params.toString() ? `?${params.toString()}` : '';

    const fallbackEmployees = (cid === 1) ? mockEmployees : [];
    const defaultEmps = await safeFetch<Employee[]>(`${API_BASE}/employees/${q}`, fallbackEmployees);
    if (!isDemoClinic(cid)) return defaultEmps;

    // Properly merge custom overrides by id
    const customMap = new Map(customEmps.map((e) => [e.id, e]));
    const merged = defaultEmps.map((e) => {
      const custom = customMap.get(e.id);
      if (!custom) return e;
      return {
        ...e,
        ...custom,
        branch: custom.branch !== undefined && custom.branch !== null ? custom.branch : e.branch,
        branch_name: custom.branch_name || e.branch_name
      };
    });
    for (const e of customEmps) {
      if (!defaultEmps.some((de) => de.id === e.id)) {
        merged.unshift(e);
      }
    }
    // O'chirilgan xodimlarni (seed bo'lsa ham) chiqarib tashlaymiz
    let deletedIds: number[] = [];
    if (typeof window !== 'undefined') {
      try {
        const delStored = localStorage.getItem(getClinicStorageKey('32desk_deleted_employees', cid));
        if (delStored) deletedIds = JSON.parse(delStored);
      } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
    }
    const visible = deletedIds.length ? merged.filter((e) => !deletedIds.includes(e.id)) : merged;
    if (branchId) {
      return visible.filter((e) => !e.branch || e.branch === branchId);
    }
    return visible;
  },

  async createEmployee(data: Partial<Employee>): Promise<Employee> {
    if (demoBlocked()) return { id: 0, ...(data as any) } as Employee;
    bustApiCache();
    const cid = data.clinic !== undefined ? data.clinic : getActiveClinicId();
    const payload = {
      ...data,
      clinic: cid || undefined
    };
    try {
      const res = await apiFetch(`${API_BASE}/employees/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const created = await res.json();
        if (typeof window !== 'undefined') {
          try {
            const storageKey = getClinicStorageKey('32desk_custom_employees', cid);
            const stored = localStorage.getItem(storageKey);
            const customEmps: Employee[] = stored ? JSON.parse(stored) : [];
            const idx = customEmps.findIndex(e => e.id === created.id);
            if (idx >= 0) customEmps[idx] = created;
            else customEmps.unshift(created);
            localStorage.setItem(storageKey, JSON.stringify(customEmps));
          } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
            console.error(e);
          }
        }
        return created;
      }
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.warn('Backend createEmployee failed, falling back:', e);
    }

    const newEmp: Employee = {
      id: Date.now(),
      clinic: cid ?? undefined,
      full_name: data.full_name || 'Новый сотрудник',
      first_name: data.first_name,
      last_name: data.last_name,
      role: data.role || 'doctor',
      chair: data.chair || 'Кресло 1',
      assigned_chairs: data.assigned_chairs || (data.chair ? [data.chair] : []),
      specialty: data.specialty || 'Стоматолог-Терапевт',
      color: data.color || '#3B82F6',
      phone: data.phone || '+998 90 000 00 00',
      phone_extra: data.phone_extra,
      email: data.email || '',
      birth_date: data.birth_date,
      gender: data.gender || 'male',
      salary_rate: data.salary_rate || '35% от выручки',
      commission_rate: data.commission_rate,
      naryad_type: data.naryad_type || 'clinic',
      schedule: data.schedule || 'Пн-Пт: 09:00 - 18:00',
      schedule_details: data.schedule_details || [],
      branch: data.branch,
      branch_name: data.branch_name,
      is_active: data.is_active !== undefined ? data.is_active : true,
      can_login: data.can_login ?? true,
      username: data.username,
      password: data.password || '123456',
      avatar: data.avatar
    };

    if (typeof window !== 'undefined') {
      try {
        const storageKey = getClinicStorageKey('32desk_custom_employees', cid);
        const stored = localStorage.getItem(storageKey);
        const customEmps: Employee[] = stored ? JSON.parse(stored) : [];
        customEmps.unshift(newEmp);
        localStorage.setItem(storageKey, JSON.stringify(customEmps));
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }
    return newEmp;
  },

  async updateEmployee(id: number, data: Partial<Employee>): Promise<Employee | null> {
    if (demoBlocked()) return null;
    bustApiCache();
    const cid = data.clinic !== undefined ? data.clinic : getActiveClinicId();
    let serverUpdated: Employee | null = null;
    try {
      const res = await apiFetch(`${API_BASE}/employees/${id}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        serverUpdated = await res.json();
      }
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.warn('Backend updateEmployee failed:', e);
    }

    if (typeof window !== 'undefined') {
      try {
        const storageKey = getClinicStorageKey('32desk_custom_employees', cid);
        const stored = localStorage.getItem(storageKey);
        let customEmps: Employee[] = stored ? JSON.parse(stored) : [];
        const index = customEmps.findIndex((e) => e.id === id);
        if (index !== -1) {
          customEmps[index] = { ...customEmps[index], ...(serverUpdated || {}), ...data };
          localStorage.setItem(storageKey, JSON.stringify(customEmps));
          return customEmps[index];
        } else {
          const defaultEmp = (cid === 1) ? mockEmployees.find((e) => e.id === id) : null;
          const base = defaultEmp || { id };
          const updated = { ...base, ...(serverUpdated || {}), ...data } as Employee;
          customEmps.push(updated);
          localStorage.setItem(storageKey, JSON.stringify(customEmps));
          return updated;
        }
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }
    return serverUpdated;
  },

  async deleteEmployee(id: number, overrideClinicId?: number): Promise<boolean> {
    if (demoBlocked()) return false;
    bustApiCache();
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    try {
      await apiFetch(`${API_BASE}/employees/${id}/`, {
        method: 'DELETE',
        headers: { ...(cid ? { 'X-Clinic-ID': String(cid) } : {}) }
      });
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.warn('Backend deleteEmployee failed:', e);
    }
    if (typeof window !== 'undefined') {
      try {
        // 1) Custom (foydalanuvchi yaratgan) ro'yxatdan olib tashlaymiz
        const storageKey = getClinicStorageKey('32desk_custom_employees', cid);
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const list: Employee[] = JSON.parse(stored);
          localStorage.setItem(storageKey, JSON.stringify(list.filter((e) => e.id !== id)));
        }
        // 2) Seed (namuna) xodimni ham "o'chirilgan" deb belgilaymiz — getEmployees filtrlaydi
        const delKey = getClinicStorageKey('32desk_deleted_employees', cid);
        const delStored = localStorage.getItem(delKey);
        const delIds: number[] = delStored ? JSON.parse(delStored) : [];
        if (!delIds.includes(id)) delIds.push(id);
        localStorage.setItem(delKey, JSON.stringify(delIds));
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }
    return true;
  },

  // Patients
  async getPatients(search?: string, overrideClinicId?: number): Promise<Patient[]> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    const storageKey = getClinicStorageKey('32desk_custom_patients', cid);
    let customPatients: Patient[] = [];
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) customPatients = JSON.parse(stored);
        if (!stored && (cid === 1)) {
          const legacy = localStorage.getItem('32desk_custom_patients');
          if (legacy) customPatients = JSON.parse(legacy);
        }
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (cid) params.append('clinic', String(cid));
    const qs = params.toString() ? `?${params.toString()}` : '';

    const fallbackPatients = (cid === 1) ? mockPatients : [];
    const defaultPatients = await safeFetch<Patient[]>(
      `${API_BASE}/patients/${qs}`,
      fallbackPatients
    );
    if (!isDemoClinic(cid)) return defaultPatients;

    const customMap = new Map(customPatients.map((p) => [p.id, p]));
    const merged = defaultPatients.map((p) => customMap.get(p.id) || p);
    for (const p of customPatients) {
      if (!defaultPatients.some((dp) => dp.id === p.id)) {
        merged.unshift(p);
      }
    }

    // O'chirilgan bemorlarni (seed bo'lsa ham) chiqarib tashlaymiz
    let deletedIds: number[] = [];
    if (typeof window !== 'undefined') {
      try {
        const delStored = localStorage.getItem(getClinicStorageKey('32desk_deleted_patients', cid));
        if (delStored) deletedIds = JSON.parse(delStored);
      } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
    }
    const visible = deletedIds.length ? merged.filter((p) => !deletedIds.includes(p.id)) : merged;

    const sanitized = visible.map((p) => ({
      ...p,
      balance: Math.round(Number(p.balance) || 0)
    }));

    if (!search) return sanitized;
    const q = search.toLowerCase();
    return sanitized.filter((p) => p.full_name.toLowerCase().includes(q) || p.phone.includes(q));
  },

  async deletePatient(patientId: number, overrideClinicId?: number): Promise<boolean> {
    if (demoBlocked()) return false;
    bustApiCache();
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    try {
      await apiFetch(`${API_BASE}/patients/${patientId}/`, {
        method: 'DELETE',
        headers: { ...(cid ? { 'X-Clinic-ID': String(cid) } : {}) }
      });
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.warn('Backend deletePatient failed:', e);
    }
    if (typeof window !== 'undefined') {
      try {
        const storageKey = getClinicStorageKey('32desk_custom_patients', cid);
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const list: Patient[] = JSON.parse(stored);
          localStorage.setItem(storageKey, JSON.stringify(list.filter((p) => p.id !== patientId)));
        }
        const delKey = getClinicStorageKey('32desk_deleted_patients', cid);
        const delStored = localStorage.getItem(delKey);
        const delIds: number[] = delStored ? JSON.parse(delStored) : [];
        if (!delIds.includes(patientId)) delIds.push(patientId);
        localStorage.setItem(delKey, JSON.stringify(delIds));
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }
    return true;
  },

  async createPatient(data: Partial<Patient>): Promise<Patient> {
    if (demoBlocked()) return { id: 0, ...(data as any) } as Patient;
    bustApiCache();
    const cid = data.clinic !== undefined ? data.clinic : getActiveClinicId();
    const payload = {
      ...data,
      clinic: cid || undefined
    };

    try {
      const res = await apiFetch(`${API_BASE}/patients/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const created = await res.json();
        if (typeof window !== 'undefined') {
          const storageKey = getClinicStorageKey('32desk_custom_patients', cid);
          try {
            const stored = localStorage.getItem(storageKey);
            const list: Patient[] = stored ? JSON.parse(stored) : [];
            list.unshift(created);
            localStorage.setItem(storageKey, JSON.stringify(list));
          } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
            console.error(e);
          }
        }
        return created;
      }
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }

    const newP: Patient = {
      id: Date.now(),
      clinic: cid ?? undefined,
      full_name: data.full_name || 'Yangi bemor',
      phone: data.phone || '',
      category_status: data.category_status || 'Birlamchi',
      balance: 0,
      gender: data.gender || 'M',
      birth_date: data.birth_date || '1995-01-01',
      medical_history: data.medical_history || '',
      notes: data.notes || '',
      created_at: new Date().toISOString()
    };

    if (typeof window !== 'undefined') {
      try {
        const storageKey = getClinicStorageKey('32desk_custom_patients', cid);
        const stored = localStorage.getItem(storageKey);
        const list: Patient[] = stored ? JSON.parse(stored) : [];
        list.unshift(newP);
        localStorage.setItem(storageKey, JSON.stringify(list));
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }

    if (cid === 1) {
      mockPatients.unshift(newP);
    }
    return newP;
  },

  async updatePatient(patientId: number, data: Partial<Patient>): Promise<void> {
    if (demoBlocked()) return;
    bustApiCache();
    const cid = data.clinic !== undefined ? data.clinic : getActiveClinicId();
    try {
      await apiFetch(`${API_BASE}/patients/${patientId}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: JSON.stringify(data)
      });
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.warn('Backend updatePatient failed:', e);
    }

    if (typeof window !== 'undefined') {
      try {
        const storageKey = getClinicStorageKey('32desk_custom_patients', cid);
        const stored = localStorage.getItem(storageKey);
        let customPatients: Patient[] = stored ? JSON.parse(stored) : [];
        const idx = customPatients.findIndex((p) => p.id === patientId);
        if (idx !== -1) {
          customPatients[idx] = { ...customPatients[idx], ...data };
        } else {
          const orig = (cid === 1) ? mockPatients.find((p) => p.id === patientId) : null;
          if (orig) customPatients.push({ ...orig, ...data });
        }
        localStorage.setItem(storageKey, JSON.stringify(customPatients));

        if (data.service_lang) {
          const aptKey = getClinicStorageKey('32desk_custom_appointments', cid);
          const storedApts = localStorage.getItem(aptKey);
          if (storedApts) {
            try {
              let aptList: Appointment[] = JSON.parse(storedApts);
              aptList = aptList.map(a => a.patient === patientId ? { ...a, patient_service_lang: data.service_lang } : a);
              localStorage.setItem(aptKey, JSON.stringify(aptList));
            } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
              console.error(e);
            }
          }
        }
      } catch (err) { if (err instanceof ApiError && !isDemoClinic()) throw err;
        console.error('Local updatePatient failed:', err);
      }
    }

    if (cid === 1) {
      const pat = mockPatients.find((p) => p.id === patientId);
      if (pat) Object.assign(pat, data);
      if (data.service_lang) {
        mockAppointments.forEach(a => {
          if (a.patient === patientId) a.patient_service_lang = data.service_lang;
        });
      }
    }
  },

  async updatePatientLang(patientId: number, lang: 'uz' | 'ru' | 'en'): Promise<void> {
    return this.updatePatient(patientId, { service_lang: lang });
  },

  // Appointments with robust localStorage persistence
  async getAppointments(date?: string, branchId?: number, overrideClinicId?: number): Promise<Appointment[]> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    const storageKey = getClinicStorageKey('32desk_custom_appointments', cid);
    let customApts: Appointment[] = [];
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) customApts = JSON.parse(stored);
        if (!stored && (cid === 1)) {
          const legacy = localStorage.getItem('32desk_custom_appointments');
          if (legacy) customApts = JSON.parse(legacy);
        }
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }

    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (branchId) params.append('branch', String(branchId));
    if (cid) params.append('clinic', String(cid));
    const qs = params.toString() ? `?${params.toString()}` : '';

    const fallbackAppointments = (cid === 1) ? mockAppointments : [];
    const defaultApts = await safeFetch<Appointment[]>(
      `${API_BASE}/appointments/${qs}`,
      fallbackAppointments
    );
    if (!isDemoClinic(cid)) return defaultApts;

    const customIds = new Set(customApts.map((a) => a.id));
    const merged = [...customApts, ...defaultApts.filter((a) => !customIds.has(a.id))];

    const sanitized = merged.map((a) => ({
      ...a,
      price: Math.round(Number(a.price) || 0),
      paid_amount: Math.round(Number(a.paid_amount) || 0)
    }));

    let result = sanitized;
    if (date) {
      result = result.filter((a) => a.start_time.startsWith(date));
    }
    if (branchId) {
      result = result.filter((a) => !a.branch || a.branch === branchId);
    }
    return result;
  },

  async createAppointment(data: Partial<Appointment>): Promise<Appointment> {
    if (demoBlocked()) return { id: 0, ...(data as any) } as Appointment;
    bustApiCache();
    const cid = data.clinic !== undefined ? data.clinic : getActiveClinicId();
    const payload = {
      ...data,
      clinic: cid || undefined
    };

    try {
      const res = await apiFetch(`${API_BASE}/appointments/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const created = await res.json();
        if (typeof window !== 'undefined') {
          const storageKey = getClinicStorageKey('32desk_custom_appointments', cid);
          try {
            const stored = localStorage.getItem(storageKey);
            const customApts: Appointment[] = stored ? JSON.parse(stored) : [];
            customApts.unshift(created);
            localStorage.setItem(storageKey, JSON.stringify(customApts));
          } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
            console.error(e);
          }
        }
        return created;
      }
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }

    const newApt: Appointment = {
      id: Date.now(),
      clinic: cid ?? undefined,
      patient: data.patient || 1,
      patient_name: data.patient_name || 'Bemor',
      patient_phone: data.patient_phone || '+998 90 123 45 67',
      doctor: data.doctor || 1,
      doctor_name: data.doctor_name || '',
      doctor_color: data.doctor_color || '#0EA5E9',
      branch: data.branch,
      branch_name: data.branch_name,
      start_time: data.start_time || new Date().toISOString(),
      end_time: data.end_time || new Date(Date.now() + 3600000).toISOString(),
      treatment_notes: data.treatment_notes || 'Konsultatsiya',
      sms_sent: Boolean(data.sms_sent),
      status: data.status || 'unconfirmed',
      color_code: data.color_code || '#F59E0B',
      price: Math.round(Number(data.price) || 250000),
      paid_amount: Math.round(Number(data.paid_amount) || 0),
      chair_name: data.chair_name || 'Kreslo 1'
    };

    if (typeof window !== 'undefined') {
      try {
        const storageKey = getClinicStorageKey('32desk_custom_appointments', cid);
        const stored = localStorage.getItem(storageKey);
        const customApts: Appointment[] = stored ? JSON.parse(stored) : [];
        customApts.unshift(newApt);
        localStorage.setItem(storageKey, JSON.stringify(customApts));
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }

    if (cid === 1) {
      mockAppointments.unshift(newApt);
    }
    return newApt;
  },

  async updateAppointmentStatus(id: number, status: Appointment['status']): Promise<void> {
    if (demoBlocked()) return;
    bustApiCache();
    const cid = getActiveClinicId();
    try {
      await apiFetch(`${API_BASE}/appointments/${id}/change_status/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: JSON.stringify({ status })
      });
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }

    const colorMap: Record<string, string> = {
      new: '#3B82F6',
      confirmed: '#06B6D4',
      unconfirmed: '#F59E0B',
      late: '#F97316',
      arrived: '#EAB308',
      in_progress: '#10B981',
      waiting_bill: '#F59E0B',
      cancelled: '#EF4444',
      no_show: '#DC2626',
      completed: '#64748B',
      debt: '#EA580C',
      reserved: '#3B82F6'
    };

    if (typeof window !== 'undefined') {
      try {
        const storageKey = getClinicStorageKey('32desk_custom_appointments', cid);
        const stored = localStorage.getItem(storageKey);
        let customApts: Appointment[] = stored ? JSON.parse(stored) : [];
        const found = customApts.find((a) => a.id === id);
        if (found) {
          found.status = status;
          found.color_code = colorMap[status] || found.color_code;
          localStorage.setItem(storageKey, JSON.stringify(customApts));
        }
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }

    if (cid === 1) {
      const apt = mockAppointments.find((a) => a.id === id);
      if (apt) {
        apt.status = status;
        apt.color_code = colorMap[status] || apt.color_code;
      }
    }
  },

  async updatePatientBalance(patientId: number, delta: number): Promise<void> {
    if (demoBlocked()) return;
    bustApiCache();
    const cid = getActiveClinicId();
    const numDelta = Math.round(Number(delta) || 0);
    if (typeof window !== 'undefined') {
      try {
        const storageKey = getClinicStorageKey('32desk_custom_patients', cid);
        const stored = localStorage.getItem(storageKey);
        let customPatients: Patient[] = stored ? JSON.parse(stored) : [];
        const found = customPatients.find((p) => p.id === patientId);
        if (found) {
          found.balance = Math.round(Number(found.balance) || 0) + numDelta;
        } else {
          const original = (cid === 1) ? mockPatients.find((p) => p.id === patientId) : null;
          if (original) {
            customPatients.push({ ...original, balance: Math.round(Number(original.balance) || 0) + numDelta });
          }
        }
        localStorage.setItem(storageKey, JSON.stringify(customPatients));
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }

    if (cid === 1) {
      const pat = mockPatients.find((p) => p.id === patientId);
      if (pat) {
        pat.balance = Math.round(Number(pat.balance) || 0) + numDelta;
      }
    }
  },

  async updateAppointment(id: number, data: Partial<Appointment>): Promise<Appointment | null> {
    if (demoBlocked()) return null;
    bustApiCache();
    const cid = data.clinic !== undefined ? data.clinic : getActiveClinicId();
    if (typeof window !== 'undefined') {
      try {
        const storageKey = getClinicStorageKey('32desk_custom_appointments', cid);
        const stored = localStorage.getItem(storageKey);
        let customApts: Appointment[] = stored ? JSON.parse(stored) : [];
        const index = customApts.findIndex((a) => a.id === id);
        if (index !== -1) {
          customApts[index] = { ...customApts[index], ...data };
          localStorage.setItem(storageKey, JSON.stringify(customApts));
          return customApts[index];
        } else {
          const original = (cid === 1) ? mockAppointments.find((a) => a.id === id) : null;
          if (original) {
            const updated = { ...original, ...data };
            customApts.unshift(updated);
            localStorage.setItem(storageKey, JSON.stringify(customApts));
            return updated;
          }
        }
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }

    if (cid === 1) {
      const apt = mockAppointments.find((a) => a.id === id);
      if (apt) {
        Object.assign(apt, data);
        return apt;
      }
    }
    return null;
  },

  async deleteAppointment(id: number): Promise<{ ok: boolean; error?: string }> {
    if (demoBlocked()) return { ok: false, error: 'demo' };
    bustApiCache();
    const cid = getActiveClinicId();
    try {
      const res = await apiFetch(`${API_BASE}/appointments/${id}/`, {
        method: 'DELETE',
        headers: cid ? { 'X-Clinic-ID': String(cid) } : undefined
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { ok: false, error: errData.detail || 'Delete failed' };
      }
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.warn('Backend delete failed, falling back to local storage:', e);
    }

    if (typeof window !== 'undefined') {
      try {
        const storageKey = getClinicStorageKey('32desk_custom_appointments', cid);
        const stored = localStorage.getItem(storageKey);
        let customApts: Appointment[] = stored ? JSON.parse(stored) : [];
        customApts = customApts.filter((a) => a.id !== id);
        localStorage.setItem(storageKey, JSON.stringify(customApts));
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }

    if (cid === 1) {
      const idx = mockAppointments.findIndex((a) => a.id === id);
      if (idx !== -1) mockAppointments.splice(idx, 1);
    }

    return { ok: true };
  },

  async testReplyAlgorithm(phone: string, text: string, appointmentId?: number): Promise<any> {
    try {
      const res = await apiFetch(`${API_BASE}/reminders/process-reply/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, text, appointment_id: appointmentId })
      });
      if (res.ok) return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;}

    // Fallback local NLP evaluator
    const lower = (text || '').toLowerCase().trim();
    let intent = 'unknown';
    let newStatus = 'unconfirmed';
    let replyMessage = '';

    if (/boshqa vaqt|ko'chiring|ko'chirish|boshqa kun|перенести|другое время|reschedule|postpone/.test(lower)) {
      intent = 'reschedule';
      newStatus = 'unconfirmed';
      replyMessage = 'Xabaringiz qabul qilindi. Administratorimiz yangi qulay vaqtni kelishish uchun siz bilan bog‘lanadi.';
    } else if (/kela olmayman|kelolmayman|bora olmayman|borolmayman|bormayman|kelmayman|bekor|не смогу|не приду|отмените|cancel/.test(lower)) {
      intent = 'cancel';
      newStatus = 'cancelled';
      replyMessage = 'Xabaringiz qabul qilindi. Qabulingiz bekor qilindi. Istalgan paytda qayta yozilishingiz mumkin.';
    } else if (/kechikaman|kechikamiz|sal kechroq|kech qolaman|10 minut|15 minut|20 minut|опоздаю|задержусь|late|delay/.test(lower)) {
      intent = 'late';
      newStatus = 'late';
      replyMessage = 'Qabul qilindi. Kechikishingiz haqida shifokorga xabar berildi. Sizni kutib qolamiz.';
    } else if (/ha|boraman|kelaman|tasdiqlayman|albatta|bo'ladi|да|буду|приду|подтверждаю|конечно|yes|confirm|sure/.test(lower)) {
      intent = 'confirm';
      newStatus = 'confirmed';
      replyMessage = 'Rahmat! Qabulingiz muvaffaqiyatli tasdiqlandi. Belgilangan vaqtda klinikamizda kutib qolamiz.';
    }

    return {
      ok: true,
      intent,
      new_status: intent !== 'unknown' ? newStatus : undefined,
      action_taken: intent !== 'unknown' ? 'status_updated' : 'manual_review_needed',
      reply_message: replyMessage,
      note: intent === 'unknown' ? 'Algoritm niyatni aniqlay olmadi. Qabul holatiga tegilmadi, administrator ko‘rib chiqishi uchun qoldirildi.' : undefined
    };
  },

  // --- Checkout draft (unpaid naryads) + naryad log, persisted per patient ---
  // Struck-but-unpaid naryads survive closing/reopening the checkout and page
  // reloads. Keyed by patient id inside a single localStorage map.
  getCheckoutDraft(patientId: number): NaryadDraftItem[] {
    if (typeof window !== 'undefined' && !isDemoClinic()) return readPatientRecord(patientId, 'checkout', []);
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('32desk_checkout_drafts');
      const map: Record<string, NaryadDraftItem[]> = stored ? JSON.parse(stored) : {};
      return map[patientId] || [];
    } catch {
      return [];
    }
  },

  saveCheckoutDraft(patientId: number, items: NaryadDraftItem[]): void {
    if (typeof window !== 'undefined' && !isDemoClinic()) { savePatientRecord(patientId, 'checkout', items); return; }
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('32desk_checkout_drafts');
      const map: Record<string, NaryadDraftItem[]> = stored ? JSON.parse(stored) : {};
      map[patientId] = items;
      localStorage.setItem('32desk_checkout_drafts', JSON.stringify(map));
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
  },

  clearCheckoutDraft(patientId: number): void {
    this.saveCheckoutDraft(patientId, []);
  },

  // --- Patient naryads (Cart of services in Patient Card) ---
  getPatientNaryads(patientId: number): any[] {
    if (typeof window !== 'undefined' && !isDemoClinic()) return readPatientRecord(patientId, 'naryads', []);
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(`32desk_patient_naryads_${patientId}`);
      if (stored) return JSON.parse(stored);
      // Fallback: convert checkout draft items if available
      const drafts = this.getCheckoutDraft(patientId);
      if (drafts && drafts.length > 0) {
        return drafts.map(d => ({
          id: Number(d.id) || Date.now(),
          title: d.name,
          name: d.name,
          unitPrice: d.price,
          teeth: [],
          doctor: d.doctor || '',
          date: 'Bugun',
          price: d.price * (d.quantity || 1),
          isDebt: false,
          quantity: d.quantity || 1
        }));
      }
      return [];
    } catch {
      return [];
    }
  },

  savePatientNaryads(patientId: number, naryads: any[]): void {
    if (typeof window !== 'undefined' && !isDemoClinic()) { savePatientRecord(patientId, 'naryads', naryads); return; }
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(`32desk_patient_naryads_${patientId}`, JSON.stringify(naryads));
      // Keep checkout draft in sync
      const draftItems: NaryadDraftItem[] = naryads.map(n => ({
        id: String(n.id),
        name: n.title || n.name,
        price: n.unitPrice || n.price,
        quantity: n.quantity || 1,
        doctor: n.doctor || ''
      }));
      this.saveCheckoutDraft(patientId, draftItems);
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
  },

  clearPatientNaryads(patientId: number): void {
    if (!isDemoClinic()) { savePatientRecord(patientId, 'naryads', []); this.clearCheckoutDraft(patientId); return; }
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(`32desk_patient_naryads_${patientId}`);
      this.clearCheckoutDraft(patientId);
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
  },

  // --- Patient notes (Заметки / Основные feed) — persisted per patient ---
  getPatientNotes(patientId: number): any[] {
    if (typeof window !== 'undefined' && !isDemoClinic()) return readPatientRecord(patientId, 'notes', []);
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('32desk_patient_notes');
      const map: Record<string, any[]> = stored ? JSON.parse(stored) : {};
      return map[patientId] || [];
    } catch {
      return [];
    }
  },

  savePatientNotes(patientId: number, notes: any[]): void {
    if (typeof window !== 'undefined' && !isDemoClinic()) { savePatientRecord(patientId, 'notes', notes); return; }
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('32desk_patient_notes');
      const map: Record<string, any[]> = stored ? JSON.parse(stored) : {};
      map[patientId] = notes;
      localStorage.setItem('32desk_patient_notes', JSON.stringify(map));
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
  },

  // --- Per-account UI sozlamalari (SERVERDA saqlanadi, faqat o'sha akkauntga) ---
  // Masalan qabullar taqvimidagi shifokor ustunlari tartibi. Demo klinikada yoki
  // tarmoqsiz — chaqiruvchi localStorage'ga tushadi.
  async getUserPrefs(): Promise<Record<string, any>> {
    if (isDemoClinic()) return {};
    try {
      const res = await apiFetch(`${API_BASE}/me/prefs/`, { method: 'GET' });
      if (!res.ok) return {};
      return await res.json();
    } catch { return {}; }
  },

  async saveUserPref(key: string, value: any): Promise<void> {
    if (isDemoClinic()) return;
    try {
      await apiFetch(`${API_BASE}/me/prefs/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
    } catch { /* localStorage zaxira chaqiruvchida qoladi */ }
  },

  // --- Patient tooth chart (tish formulasi) — har bir bemor uchun alohida saqlanadi ---
  // Qaytadigan qiymat: { [toothNumber]: { status, doctor, doctorId, date } }
  getPatientToothChart(patientId: number): Record<string, any> {
    if (typeof window !== 'undefined' && !isDemoClinic()) return readPatientRecord(patientId, 'toothChart', {});
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem('32desk_patient_tooth_chart');
      const map: Record<string, Record<string, any>> = stored ? JSON.parse(stored) : {};
      return map[patientId] || {};
    } catch {
      return {};
    }
  },

  savePatientToothChart(patientId: number, chart: Record<string, any>): void {
    if (typeof window !== 'undefined' && !isDemoClinic()) { savePatientRecord(patientId, 'toothChart', chart); return; }
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('32desk_patient_tooth_chart');
      const map: Record<string, Record<string, any>> = stored ? JSON.parse(stored) : {};
      map[patientId] = chart;
      localStorage.setItem('32desk_patient_tooth_chart', JSON.stringify(map));
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
  },

  // --- Patient payments (Оплаты receipts) — persisted per patient with operator/method/target ---
  getPatientPayments(patientId: number): any[] {
    if (typeof window !== 'undefined' && !isDemoClinic()) return readPatientRecord(patientId, 'payments', []);
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('32desk_patient_payments');
      const map: Record<string, any[]> = stored ? JSON.parse(stored) : {};
      return map[patientId] || [];
    } catch {
      return [];
    }
  },

  savePatientPayments(patientId: number, payments: any[]): void {
    if (typeof window !== 'undefined' && !isDemoClinic()) { savePatientRecord(patientId, 'payments', payments); return; }
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('32desk_patient_payments');
      const map: Record<string, any[]> = stored ? JSON.parse(stored) : {};
      map[patientId] = payments;
      localStorage.setItem('32desk_patient_payments', JSON.stringify(map));
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
  },

  appendPatientPayment(patientId: number, payment: any): void {
    const list = this.getPatientPayments(patientId);
    this.savePatientPayments(patientId, [payment, ...list]);
  },

  getPatientTreatments(patientId: number): any[] {
    if (typeof window !== 'undefined' && !isDemoClinic()) return readPatientRecord(patientId, 'treatments', []);
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('32desk_patient_treatments');
      const map: Record<string, any[]> = stored ? JSON.parse(stored) : {};
      return map[patientId] || [];
    } catch {
      return [];
    }
  },

  savePatientTreatments(patientId: number, treatments: any[]): void {
    if (typeof window !== 'undefined' && !isDemoClinic()) { savePatientRecord(patientId, 'treatments', treatments); return; }
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('32desk_patient_treatments');
      const map: Record<string, any[]> = stored ? JSON.parse(stored) : {};
      map[patientId] = treatments;
      localStorage.setItem('32desk_patient_treatments', JSON.stringify(map));
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
  },

  // ── Rentgen ro'yxati (per-patient) ──
  getPatientXrays(patientId: number): any[] {
    if (typeof window !== 'undefined' && !isDemoClinic()) return readPatientRecord(patientId, 'xrays', []);
    if (typeof window === 'undefined') return [];
    try {
      const map = JSON.parse(localStorage.getItem('32desk_patient_xrays') || '{}');
      const stored = map[patientId];
      if ((!stored || stored.length === 0) && isDemoClinic() && Number(patientId) === DEMO_SAMPLE_PATIENT_ID) return DEMO_SAMPLE_XRAYS;
      return stored || [];
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; return []; }
  },
  savePatientXrays(patientId: number, xrays: any[]): void {
    if (typeof window !== 'undefined' && !isDemoClinic()) { savePatientRecord(patientId, 'xrays', xrays); return; }
    if (typeof window === 'undefined') return;
    if (isDemoClinic()) return; // demo: rentgen saqlanmaydi
    try {
      const map = JSON.parse(localStorage.getItem('32desk_patient_xrays') || '{}');
      map[patientId] = xrays;
      localStorage.setItem('32desk_patient_xrays', JSON.stringify(map));
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; console.error(e); }
  },

  // ── Foto hujjat bloklari (Word-uslubidagi muharrir, per-patient) ──
  getPatientPhotoDoc(patientId: number): any[] {
    if (typeof window === 'undefined') return [];
    try {
      const map = JSON.parse(localStorage.getItem('32desk_patient_photo_doc') || '{}');
      const stored = map[patientId];
      if ((!stored || stored.length === 0) && isDemoClinic() && Number(patientId) === DEMO_SAMPLE_PATIENT_ID) return DEMO_SAMPLE_PHOTO_DOC;
      return stored || [];
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; return []; }
  },
  savePatientPhotoDoc(patientId: number, blocks: any[]): void {
    if (!isDemoClinic()) { void this.savePatientPhotoDocBackend(patientId, blocks).catch(error => reportApiError(String(error))); return; }
    if (typeof window === 'undefined') return;
    if (isDemoClinic()) return; // demo: fotoprotokol saqlanmaydi
    try {
      const map = JSON.parse(localStorage.getItem('32desk_patient_photo_doc') || '{}');
      map[patientId] = blocks;
      localStorage.setItem('32desk_patient_photo_doc', JSON.stringify(map));
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; console.error(e); }
    // + BAZAGA — admin/boshqa qurilma ko'radi, foto ptichkasi va hisob ishlaydi
    this.savePatientPhotoDocBackend(patientId, blocks).catch(() => {});
  },

  // ── 3D Skan (per-patient) ──
  getPatient3DScan(patientId: number): { hasScan: boolean; scanDate?: string; notes?: string; fileName?: string; fileUrl?: string } {
    if (typeof window !== 'undefined' && !isDemoClinic()) return readPatientRecord(patientId, 'scan', { hasScan: false });
    if (typeof window === 'undefined') return { hasScan: false };
    try {
      const map = JSON.parse(localStorage.getItem('32desk_patient_3d_scans') || '{}');
      const stored = map[patientId];
      if ((!stored || !stored.hasScan) && isDemoClinic() && Number(patientId) === DEMO_SAMPLE_PATIENT_ID) return DEMO_SAMPLE_SCAN;
      return stored || { hasScan: false };
    } catch { return { hasScan: false }; }
  },
  savePatient3DScan(patientId: number, scanData: { hasScan: boolean; scanDate?: string; notes?: string; fileName?: string; fileUrl?: string }): void {
    if (typeof window !== 'undefined' && !isDemoClinic()) { savePatientRecord(patientId, 'scan', scanData); return; }
    if (typeof window === 'undefined') return;
    if (isDemoClinic()) return; // demo: 3D skan saqlanmaydi
    try {
      const map = JSON.parse(localStorage.getItem('32desk_patient_3d_scans') || '{}');
      map[patientId] = scanData;
      localStorage.setItem('32desk_patient_3d_scans', JSON.stringify(map));
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; console.error(e); }
  },

  // ═══════════ Bemor media (BAZADA — foto/rentgen/skan) ═══════════
  // Yashil ptichka va admin umumiy hisobi uchun YAGONA manba.
  async uploadPatientMedia(
    patientId: number, kind: 'foto' | 'rentgen' | 'skan', file: Blob | File,
    fileName?: string, meta?: Record<string, any>, overrideClinicId?: number
  ): Promise<boolean> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    if (!cid || isDemoClinic(cid)) return false; // demo: bazaga yozilmaydi
    try {
      const fd = new FormData();
      fd.append('patient', String(patientId));
      fd.append('kind', kind);
      fd.append('file', file, fileName || (file as File).name || `${kind}.bin`);
      if (meta) fd.append('meta', JSON.stringify(meta));
      const res = await apiFetch(`${API_BASE}/patient-media/`, {
        method: 'POST', headers: { 'X-Clinic-ID': String(cid) }, body: fd,
      });
      if (res.ok) {
        // keshni yangilaymiz — ptichka darhol yashil bo'lsin
        const slot = _mediaPresenceCache[String(patientId)] || { foto: false, rentgen: false, skan: false };
        slot[kind] = true;
        _mediaPresenceCache[String(patientId)] = slot;
      }
      if (res.ok) bustApiCache();
      return res.ok;
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; return false; }
  },

  async listPatientMedia(patientId: number, kind?: 'foto' | 'rentgen' | 'skan', overrideClinicId?: number): Promise<any[]> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    if (!cid) return [];
    try {
      const q = `?clinic=${cid}&patient=${patientId}${kind ? `&kind=${kind}` : ''}`;
      const res = await apiFetch(`${API_BASE}/patient-media/${q}`, { headers: { 'X-Clinic-ID': String(cid) }, next: { revalidate: 0 } });
      if (!res.ok) return [];
      return await res.json();
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; return []; }
  },

  async deletePatientMedia(mediaId: number, overrideClinicId?: number): Promise<boolean> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    try {
      const res = await apiFetch(`${API_BASE}/patient-media/${mediaId}/`, {
        method: 'DELETE', headers: cid ? { 'X-Clinic-ID': String(cid) } : {},
      });
      return res.ok || res.status === 204;
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; return false; }
  },

  // Klinika bo'yicha presence (yashil ptichka) + umumiy hisob (admin).
  async fetchMediaPresence(overrideClinicId?: number): Promise<{ map: Record<string, any>; totals: any } | null> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    if (!cid) return null;
    try {
      const res = await apiFetch(`${API_BASE}/patient-media/presence/?clinic=${cid}`, { headers: { 'X-Clinic-ID': String(cid) }, next: { revalidate: 0 } });
      if (!res.ok) return null;
      const data = await res.json();
      _mediaPresenceCache = { ...(data.map || {}) };
      _mediaPresenceTotals = data.totals || null;
      return data;
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; return null; }
  },

  getMediaTotals(): { foto: number; rentgen: number; skan: number; patients_with_media: number; files_total: number } | null {
    return _mediaPresenceTotals;
  },

  // ── Foto-protokol hujjati (BAZADA) ──
  async fetchPatientPhotoDoc(patientId: number, overrideClinicId?: number): Promise<any[] | null> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    if (!cid) return null;
    try {
      // report=false — bu O'QISH; muvaffaqiyatsiz bo'lsa global "Saqlanmadi" (yozish) bannerini
      // chiqarMAYDI. Xatoda `null` qaytaramiz: chaqiruvchi (studio) buni "o'qilmadi" deb biladi
      // va BO'SH hujjat bilan ustidan yozmaydi; [] esa "server bo'sh" (haqiqiy) degani.
      const res = await apiFetch(`${API_BASE}/photo-protocol/?clinic=${cid}&patient=${patientId}`, { headers: { 'X-Clinic-ID': String(cid) }, next: { revalidate: 0 } }, false);
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data.doc) ? data.doc : [];
    } catch { return null; }
  },

  // Server CANONICAL doc'ni qaytaradi (base64 rasmlar /api/patient-media/.../download/ ga
  // aylantirilgan). Buni { ok, doc } sifatida qaytaramiz — studio uni yangi lokal tahrirlarni
  // yo'qotmasdan singdiradi (keyingi saqlashlarda katta base64 qayta yuborilmaydi).
  async savePatientPhotoDocBackend(patientId: number, doc: any[], overrideClinicId?: number): Promise<{ ok: boolean; doc: any[] | null }> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    if (!cid || isDemoClinic(cid)) return { ok: false, doc: null };
    try {
      // report=false — foto saqlash xatosi global patientRecords "Qayta saqlash" bannerini
      // chiqarmaydi (u foto POST'ini qayta urina OLMAYDI — boshqa yo'l). Studio o'zining
      // holati va qayta-urinish tugmasi bilan boshqaradi.
      const res = await apiFetch(`${API_BASE}/photo-protocol/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Clinic-ID': String(cid) },
        body: JSON.stringify({ patient: patientId, clinic: cid, doc }),
      }, false);
      let canonical: any[] | null = null;
      if (res.ok) {
        try { const data = await res.json(); if (Array.isArray(data?.doc)) canonical = data.doc; } catch {}
        // doc'da rasm bo'lsa — foto ptichkasini yoqamiz
        const hasImg = Array.isArray(doc) && doc.some((b: any) =>
          (b?.kind === 'image' && b?.url) || (b?.type === 'image' && b?.src) ||
          (Array.isArray(b?.elements) && b.elements.some((e: any) => e?.type === 'image' && (e?.src || e?.url))));
        if (hasImg) {
          const slot = _mediaPresenceCache[String(patientId)] || { foto: false, rentgen: false, skan: false };
          slot.foto = true;
          _mediaPresenceCache[String(patientId)] = slot;
        }
        bustApiCache();
      }
      return { ok: res.ok, doc: canonical };
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; return { ok: false, doc: null }; }
  },

  // Bemor kartochkasidagi yashil ptichka uchun: foto/rentgen/skan bor-yo'qligi.
  // Avval BAZA keshi (fetchMediaPresence), bo'lmasa localStorage fallback.
  getPatientMediaPresence(patientId: number): { foto: boolean; rentgen: boolean; skan: boolean } {
    const backend = _mediaPresenceCache[String(patientId)];
    if (backend) return { foto: !!backend.foto, rentgen: !!backend.rentgen, skan: !!backend.skan };
    const xr = this.getPatientXrays(patientId);
    const doc = this.getPatientPhotoDoc(patientId);
    const scan = this.getPatient3DScan(patientId);
    const foto = Array.isArray(doc) && doc.some((b: any) =>
      (b?.kind === 'image' && b?.url) || (b?.type === 'image' && b?.src) ||
      (Array.isArray(b?.elements) && b.elements.some((e: any) => e?.type === 'image' && e?.src))
    );
    return { rentgen: Array.isArray(xr) && xr.length > 0, foto, skan: !!(scan && scan.hasScan) };
  },

  // Foto tab kartochkasida ko'rsatish uchun — bemorning BIRINCHI foto rasmi (src) yoki null.
  getPatientFirstPhoto(patientId: number): string | null {
    const doc = this.getPatientPhotoDoc(patientId);
    if (!Array.isArray(doc)) return null;
    for (const b of doc) {
      if (b?.type === 'image' && b?.src) return b.src;
      if (b?.kind === 'image' && b?.url) return b.url;
      if (Array.isArray(b?.elements)) {
        const img = b.elements.find((e: any) => e?.type === 'image' && e?.src);
        if (img) return img.src;
      }
    }
    return null;
  },

  // ── Aloqa (Связь): xabarlar jurnali (per-patient) — Telegram/WhatsApp/SMS ──
  getPatientComms(patientId: number): any[] {
    if (typeof window !== 'undefined' && !isDemoClinic()) return readPatientRecord(patientId, 'comms', []);
    if (typeof window === 'undefined') return [];
    try {
      const map = JSON.parse(localStorage.getItem('32desk_patient_comms') || '{}');
      return map[patientId] || [];
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; return []; }
  },
  savePatientComms(patientId: number, msgs: any[]): void {
    if (typeof window !== 'undefined' && !isDemoClinic()) { savePatientRecord(patientId, 'comms', msgs); return; }
    if (typeof window === 'undefined') return;
    try {
      const map = JSON.parse(localStorage.getItem('32desk_patient_comms') || '{}');
      map[patientId] = msgs;
      localStorage.setItem('32desk_patient_comms', JSON.stringify(map));
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; console.error(e); }
  },
  // Telegram chat tarixi (per-patient)
  getPatientTgChat(patientId: number): any[] {
    if (typeof window !== 'undefined' && !isDemoClinic()) return readPatientRecord(patientId, 'tgchat', []);
    if (typeof window === 'undefined') return [];
    try {
      const map = JSON.parse(localStorage.getItem('32desk_patient_tgchat') || '{}');
      return map[patientId] || [];
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; return []; }
  },
  savePatientTgChat(patientId: number, chat: any[]): void {
    if (typeof window !== 'undefined' && !isDemoClinic()) { savePatientRecord(patientId, 'tgchat', chat); return; }
    if (typeof window === 'undefined') return;
    try {
      const map = JSON.parse(localStorage.getItem('32desk_patient_tgchat') || '{}');
      map[patientId] = chat;
      localStorage.setItem('32desk_patient_tgchat', JSON.stringify(map));
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; console.error(e); }
  },

  // ── Ijtimoiy tarmoq ulanishlari (Telegram / WhatsApp) — raqam + kod bilan qurilma ulash ──
  // Ulangan qurilma o'sha akkauntda "dentos.app" nomi bilan ko'rinadi.
  getSocialConnections(overrideClinicId?: number): { telegram: { connected: boolean; phone: string; connectedAt: string; device: string }; whatsapp: { connected: boolean; phone: string; connectedAt: string; device: string } } {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    const storageKey = getClinicStorageKey('32desk_social_connections', cid);
    const def = {
      telegram: { connected: false, phone: '', connectedAt: '', device: 'dentos.app' },
      whatsapp: { connected: false, phone: '', connectedAt: '', device: 'dentos.app' }
    };
    if (typeof window === 'undefined') return def;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
      return stored ? { ...def, ...stored } : def;
    } catch { return def; }
  },
  saveSocialConnections(cfg: any, overrideClinicId?: number): void {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    const storageKey = getClinicStorageKey('32desk_social_connections', cid);
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(storageKey, JSON.stringify(cfg)); } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; console.error(e); }
  },

  // ── Telegram REAL ulash (backend Telethon orqali) ──
  async telegramStatus(phone?: string, overrideClinicId?: number): Promise<any> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    try {
      const params = new URLSearchParams();
      if (phone) params.append('phone', phone);
      if (cid) params.append('clinic', String(cid));
      const q = params.toString() ? `?${params.toString()}` : '';
      const res = await apiFetch(`${API_BASE}/telegram/status/${q}`, {
        headers: cid ? { 'X-Clinic-ID': String(cid) } : {}
      });
      const data = await res.json();
      if (typeof window !== 'undefined') {
        const cur = clinicApi.getSocialConnections(cid || undefined);
        const updated = {
          ...cur,
          telegram: {
            connected: !!data.connected,
            phone: data.phone || (data.connected ? cur.telegram.phone : ''),
            connectedAt: data.connectedAt || cur.telegram.connectedAt || '',
            device: data.device || 'dentos.app'
          }
        };
        clinicApi.saveSocialConnections(updated, cid || undefined);
      }
      return data;
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      return { connected: false, error: 'network', message: String(e) };
    }
  },
  async telegramSendCode(phone: string): Promise<any> {
    if (demoBlocked()) return { ok: false, demo: true };
    try {
      const res = await apiFetch(`${API_BASE}/telegram/send-code/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Clinic-ID': String(getActiveClinicId() || '') }, body: JSON.stringify({ phone })
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { ok: false, error: 'network', message: String(e) }; }
  },
  async telegramResendCode(phone: string): Promise<any> {
    if (demoBlocked()) return { ok: false, demo: true };
    try {
      const res = await apiFetch(`${API_BASE}/telegram/resend-code/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Clinic-ID': String(getActiveClinicId() || '') }, body: JSON.stringify({ phone })
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { ok: false, error: 'network', message: String(e) }; }
  },
  async telegramSignIn(phone: string, code: string): Promise<any> {
    if (demoBlocked()) return { ok: false, demo: true };
    try {
      const res = await apiFetch(`${API_BASE}/telegram/sign-in/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Clinic-ID': String(getActiveClinicId() || '') }, body: JSON.stringify({ phone, code })
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { ok: false, error: 'network', message: String(e) }; }
  },
  async telegramPassword(phone: string, password: string): Promise<any> {
    if (demoBlocked()) return { ok: false, demo: true };
    try {
      const res = await apiFetch(`${API_BASE}/telegram/password/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Clinic-ID': String(getActiveClinicId() || '') }, body: JSON.stringify({ phone, password })
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { ok: false, error: 'network', message: String(e) }; }
  },
  async telegramQrStart(): Promise<any> {
    if (demoBlocked()) return { ok: false, demo: true };
    try {
      const res = await apiFetch(`${API_BASE}/telegram/qr-start/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Clinic-ID': String(getActiveClinicId() || '') }, body: '{}'
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { ok: false, error: 'network', message: String(e) }; }
  },
  async telegramQrStatus(tokenId: string): Promise<any> {
    try {
      const res = await apiFetch(`${API_BASE}/telegram/qr-status/?token_id=${encodeURIComponent(tokenId)}`);
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { ok: false, error: 'network', message: String(e) }; }
  },
  async telegramBotLogin(botToken: string): Promise<any> {
    if (demoBlocked()) return { ok: false, demo: true };
    try {
      const res = await apiFetch(`${API_BASE}/telegram/bot-login/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Clinic-ID': String(getActiveClinicId() || '') }, body: JSON.stringify({ bot_token: botToken })
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { ok: false, error: 'network', message: String(e) }; }
  },
  async telegramDisconnect(phone?: string): Promise<any> {
    try {
      const res = await apiFetch(`${API_BASE}/telegram/disconnect/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phone || '' })
      });
      const data = await res.json();
      if (typeof window !== 'undefined') {
        const cur = clinicApi.getSocialConnections();
        clinicApi.saveSocialConnections({
          ...cur,
          telegram: { connected: false, phone: '', connectedAt: '', device: 'dentos.app' }
        });
      }
      return data;
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { ok: false, error: 'network', message: String(e) }; }
  },
  // Bemor bilan Telegram yozishmasini qidirish (offset_id=0 → oxirgilari; offset_id=X → X'dan eskilari)
  async telegramChat(patientPhone: string, limit = 10, name = '', offsetId = 0): Promise<any> {
    try {
      const res = await apiFetch(`${API_BASE}/telegram/chat/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: patientPhone, limit, name, offset_id: offsetId })
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { ok: false, error: 'network', message: String(e) }; }
  },
  // Bemorga Telegram orqali real xabar yuborish
  async telegramSend(patientPhone: string, text: string, name = ''): Promise<any> {
    try {
      const res = await apiFetch(`${API_BASE}/telegram/send/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: patientPhone, text, name })
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { ok: false, error: 'network', message: String(e) }; }
  },

  // ── Avto-eslatma (qabuldan oldin Telegram xabar) ──
  // ── Avto-eslatma (qabuldan oldin Telegram xabar) ──
  async getReminderConfig(overrideClinicId?: number): Promise<any> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    try {
      const q = cid ? `?clinic=${cid}` : '';
      const res = await apiFetch(`${API_BASE}/reminders/config/${q}`, {
        headers: cid ? { 'X-Clinic-ID': String(cid) } : {}
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { enabled: false, error: String(e) }; }
  },
  async saveReminderConfig(cfg: any, overrideClinicId?: number): Promise<any> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    try {
      const q = cid ? `?clinic=${cid}` : '';
      const res = await apiFetch(`${API_BASE}/reminders/config/${q}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: JSON.stringify(cfg)
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { ok: false, error: 'network', message: String(e) }; }
  },
  async runRemindersNow(): Promise<any> {
    const cid = getActiveClinicId();
    try {
      const res = await apiFetch(`${API_BASE}/reminders/run/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: '{}'
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { ok: false, error: 'network', message: String(e) }; }
  },

  // ── Xabar shablonlari (3 tilda, o'rniga qo'yiladigan parametrlar bilan) ──
  getMessageTemplates(overrideClinicId?: number): { id: number; title: string; uz: string; ru: string; en: string }[] {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    const storageKey = getClinicStorageKey('32desk_msg_templates', cid);
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    // Barcha klinikalar uchun standart professional stomatologiya shablonlari (3 tilda)
    const defaults = [
      {
        id: 1,
        title: 'Qabul eslatmasi (Ertangi tashrif)',
        uz: 'Assalomu alaykum, {name}! Eslatib o‘tamiz, ertaga soat {time} da {clinic} klinikasida qabulingiz bor. Shifokor: {doctor}. Tashrifingizni tasdiqlash uchun «Kelaman» deb javob bering.',
        ru: 'Здравствуйте, {name}! Напоминаем, что завтра в {time} у вас приём в клинике {clinic}. Врач: {doctor}. Для подтверждения визита ответьте «Приду».',
        en: 'Hello, {name}! Reminder: tomorrow at {time} you have an appointment at {clinic}. Doctor: {doctor}. Please reply "Confirm" to verify your visit.'
      },
      {
        id: 2,
        title: 'Qabul tasdiqlandi',
        uz: 'Hurmatli {name}, sizning {date} soat {time} dagi qabulingiz muvaffaqiyatli tasdiqlandi. Shifokor: {doctor}. Manzil: {clinic}. Sizni kutamiz!',
        ru: 'Уважаемый(ая) {name}, ваша запись на {date} в {time} успешно подтверждена. Врач: {doctor}. Адрес: {clinic}. Ждём вас!',
        en: 'Dear {name}, your appointment on {date} at {time} has been confirmed. Doctor: {doctor}. Clinic: {clinic}. See you soon!'
      },
      {
        id: 3,
        title: 'Yarim yillik profilaktik ko‘rik',
        uz: 'Hurmatli {name}! Oxirgi tashrifingizdan 6 oy o‘tdi. Tishlaringiz salomatligi uchun bepul profilaktik ko‘rikka taklif qilamiz: {clinic}.',
        ru: 'Уважаемый(ая) {name}! С вашего последнего визита прошло 6 месяцев. Приглашаем на профилактический осмотр зубов в клинику {clinic}.',
        en: 'Dear {name}! It has been 6 months since your last visit. We welcome you for a preventive dental check-up at {clinic}.'
      },
      {
        id: 4,
        title: 'Muolajadan keyingi holat so‘rovi',
        uz: 'Assalomu alaykum, {name}! Kechagi muolajadan so‘ng ahvolingiz yaxshimi? Savollaringiz yoki bezovtalik bo‘lsa, darhol bizga xabar bering. {clinic}.',
        ru: 'Здравствуйте, {name}! Как ваше самочувствие после вчерашней процедуры? Если есть вопросы или дискомфорт, пожалуйста, напишите нам. {clinic}.',
        en: 'Hello, {name}! How are you feeling after your recent treatment? Please let us know if you experience any discomfort. {clinic}.'
      },
      {
        id: 5,
        title: 'To‘lov va kassa hisob cheki',
        uz: 'Hurmatli {name}! {clinic} klinikasidagi qabul to‘lovingiz muvaffaqiyatli qabul qilindi. Salomatligingiz biz uchun muhim. Tabassumingiz charog‘on bo‘lsin!',
        ru: 'Уважаемый(ая) {name}! Оплата визита в клинику {clinic} успешно зачислена. Спасибо за доверие к нашей стоматологии!',
        en: 'Dear {name}! Your payment at {clinic} was processed successfully. Thank you for choosing our dental clinic!'
      },
      {
        id: 6,
        title: 'Qabul vaqtini o‘zgartirish / Kechikish',
        uz: 'Hurmatli {name}, agar qabul vaqtingizni o‘zgartirish yoki kechikish zarurati tug‘ilsa, iltimos oldindan bizga xabar bering: {clinic}.',
        ru: 'Уважаемый(ая) {name}, если вам необходимо изменить время приема или вы задерживаетесь, пожалуйста, предупредите нас заранее: {clinic}.',
        en: 'Dear {name}, if you need to reschedule or are running late, please notify us in advance: {clinic}.'
      }
    ];
    return defaults;
  },
  saveMessageTemplates(list: any[], overrideClinicId?: number): void {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    const storageKey = getClinicStorageKey('32desk_msg_templates', cid);
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(storageKey, JSON.stringify(list)); } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; console.error(e); }
  },

  // ── WhatsApp Business Cloud API ──
  async whatsappGetConfig(): Promise<any> {
    try { const res = await apiFetch(`${API_BASE}/whatsapp/config/`); return await res.json(); }
    catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { connected: false, error: String(e) }; }
  },
  async whatsappSaveConfig(cfg: { phone_number_id: string; access_token?: string; verify_token?: string }): Promise<any> {
    try {
      const res = await apiFetch(`${API_BASE}/whatsapp/config/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg)
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { ok: false, error: 'network', message: String(e) }; }
  },
  async whatsappChat(patientPhone: string): Promise<any> {
    try {
      const res = await apiFetch(`${API_BASE}/whatsapp/chat/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: patientPhone })
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { ok: false, error: 'network', message: String(e) }; }
  },
  async whatsappSend(patientPhone: string, text: string): Promise<any> {
    try {
      const res = await apiFetch(`${API_BASE}/whatsapp/send/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: patientPhone, text })
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; return { ok: false, error: 'network', message: String(e) }; }
  },

  // ── Klinika xabar-akkauntlari sozlamalari (Telegram bot / WhatsApp / SMS shlyuz) ──
  // Hozircha localStorage'da; keyin klinika o'z tokenlarini kiritadi, real yuborishga ulanadi.
  getMessagingConfig(): { telegram: { botToken: string; enabled: boolean }; whatsapp: { phoneId: string; token: string; enabled: boolean }; sms: { provider: string; apiKey: string; sender: string; enabled: boolean } } {
    const def = {
      telegram: { botToken: '', enabled: false },
      whatsapp: { phoneId: '', token: '', enabled: false },
      sms: { provider: 'eskiz', apiKey: '', sender: '', enabled: false }
    };
    if (typeof window === 'undefined') return def;
    try {
      const stored = JSON.parse(localStorage.getItem('32desk_messaging_config') || 'null');
      return stored ? { ...def, ...stored } : def;
    } catch { return def; }
  },
  saveMessagingConfig(cfg: any): void {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem('32desk_messaging_config', JSON.stringify(cfg)); } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; console.error(e); }
  },

  // ── Laboratoriya o'chirish overlay'i (backend yozuvini o'chirmasdan "Удалён" holatini saqlaydi) ──
  getLabDeletions(): Record<string, { deletedBy: string; deletedAt: string }> {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem('32desk_lab_deletions') || '{}');
    } catch { return {}; }
  },
  markLabDeleted(orderId: string, deletedBy: string, deletedAt: string): void {
    if (typeof window === 'undefined') return;
    try {
      const map = this.getLabDeletions();
      map[orderId] = { deletedBy, deletedAt };
      localStorage.setItem('32desk_lab_deletions', JSON.stringify(map));
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e; console.error(e); }
  },

  // --- Bekor qilingan davolash/naryad ID'lari (barqaror string id'lar: t-/apt-/nar-) ---
  // Real klinika: BAZADA (clinic-scoped, 'cancelled_treatments' bo'limi). Demo: localStorage.
  getCancelledTreatments(patientId: number): string[] {
    if (typeof window !== 'undefined' && !isDemoClinic()) return (readPatientRecord(patientId, 'cancelled_treatments', []) as string[]);
    if (typeof window === 'undefined') return [];
    try { const s = localStorage.getItem(`32desk_cancelled_treatments_${patientId}`); return s ? JSON.parse(s) : []; }
    catch { return []; }
  },
  saveCancelledTreatments(patientId: number, ids: string[]): void {
    if (typeof window !== 'undefined' && !isDemoClinic()) { savePatientRecord(patientId, 'cancelled_treatments', ids); return; }
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(`32desk_cancelled_treatments_${patientId}`, JSON.stringify(ids)); }
    catch (e) { console.error(e); }
  },

  getNaryadLog(patientId?: number): NaryadLogEntry[] {
    if (typeof window === 'undefined') return [];
    // Real klinika: jurnal BAZADA — clinic-scoped, auth, PatientRecord 'naryad_log' bo'limi.
    if (patientId != null && !isDemoClinic()) return readPatientRecord(patientId, 'naryad_log', []) as NaryadLogEntry[];
    try {
      const stored = localStorage.getItem('32desk_naryad_logs');
      const map: Record<string, NaryadLogEntry[]> = stored ? JSON.parse(stored) : {};
      if (patientId != null) {
        return map[patientId] || [];
      }
      // If no patientId, return all logs sorted by date/id
      const all: NaryadLogEntry[] = [];
      Object.values(map).forEach(list => all.push(...list));
      return all.sort((a, b) => b.id - a.id);
    } catch {
      return [];
    }
  },

  appendNaryadLog(patientId: number, entry: NaryadLogEntry): void {
    if (typeof window === 'undefined') return;
    // Real klinika: BAZAGA yoziladi (clinic-scoped). Bekor qilishda BARQAROR naryad_id
    // orqali moslashtiramiz (narx/nom o'xshashligi bilan EMAS).
    if (!isDemoClinic()) {
      const list = readPatientRecord(patientId, 'naryad_log', []) as NaryadLogEntry[];
      const next = applyNaryadLogEntry(list, entry, patientId);
      primeLocalPatientRecord(patientId, 'naryad_log', next);   // ketma-ket tez chaqiruvlar to'g'ri yig'ilsin
      savePatientRecord(patientId, 'naryad_log', next);
      return;
    }
    // Demo: localStorage (xatti-harakat saqlanadi) — bir xil stabil-id mantiq bilan.
    try {
      const stored = localStorage.getItem('32desk_naryad_logs');
      const map: Record<string, NaryadLogEntry[]> = stored ? JSON.parse(stored) : {};
      const nextList = applyNaryadLogEntry(map[patientId] || [], entry, patientId);
      map[patientId] = nextList;
      localStorage.setItem('32desk_naryad_logs', JSON.stringify(map));
      const allStored = localStorage.getItem('32desk_all_naryad_logs');
      const allLogs: NaryadLogEntry[] = allStored ? JSON.parse(allStored) : [];
      localStorage.setItem('32desk_all_naryad_logs', JSON.stringify([{ ...nextList[0], patient_id: patientId }, ...allLogs].slice(0, 1000)));
    } catch (e) { console.error(e); }
  },

  getAllNaryadLogs(): NaryadLogEntry[] {
    if (typeof window === 'undefined') return [];
    try {
      const allStored = localStorage.getItem('32desk_all_naryad_logs');
      if (allStored) return JSON.parse(allStored);
      // Fallback: collect from per-patient map
      const stored = localStorage.getItem('32desk_naryad_logs');
      const map: Record<string, NaryadLogEntry[]> = stored ? JSON.parse(stored) : {};
      const all: NaryadLogEntry[] = [];
      Object.entries(map).forEach(([pId, list]) => {
        list.forEach(item => all.push({ ...item, patient_id: Number(pId) }));
      });
      return all.sort((a, b) => b.id - a.id);
    } catch {
      return [];
    }
  },

  // --- Treatment Plans (План лечения) — persisted per patient ---
  getTreatmentPlans(patientId: number): TreatmentPlanStage[] {
    if (typeof window !== 'undefined' && !isDemoClinic()) return readPatientRecord(patientId, 'plans', []);
    if (typeof window === 'undefined') return DEFAULT_TREATMENT_PLANS;
    try {
      const stored = localStorage.getItem(`32desk_treatment_plans_${patientId}`);
      if (stored) return JSON.parse(stored);
      return DEFAULT_TREATMENT_PLANS;
    } catch {
      return DEFAULT_TREATMENT_PLANS;
    }
  },

  saveTreatmentPlans(patientId: number, plans: TreatmentPlanStage[]): void {
    if (typeof window !== 'undefined' && !isDemoClinic()) { savePatientRecord(patientId, 'plans', plans); return; }
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(`32desk_treatment_plans_${patientId}`, JSON.stringify(plans));
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
  },


  async recordPayment(
    appointmentId: number,
    amount: number,
    payment_method: string,
    operator_name?: string,
    cash_register?: string
  ): Promise<void> {
    const reg = cash_register || (
      payment_method.toLowerCase().includes('перевод') || payment_method.toLowerCase().includes('счет') || payment_method.toLowerCase().includes('bank') ? 'bank_transfer' :
      payment_method.toLowerCase().includes('click') || payment_method.toLowerCase().includes('payme') ? 'online' :
      payment_method.toLowerCase().includes('карт') || payment_method.toLowerCase().includes('терминал') || payment_method.toLowerCase().includes('humo') || payment_method.toLowerCase().includes('uzcard') ? 'terminal' :
      'cash'
    );

    try {
      await apiFetch(`${API_BASE}/appointments/${appointmentId}/record_payment/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: crypto.randomUUID(),
          amount,
          payment_method,
          operator_name: operator_name || 'Kassir',
          cash_register: reg
        })
      });
      bustApiCache();
      if (!isDemoClinic()) return;
    } catch (error) { if (!isDemoClinic()) throw error; }

    let aptObj: Appointment | undefined;

    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('32desk_custom_appointments');
        let customApts: Appointment[] = stored ? JSON.parse(stored) : [];
        const found = customApts.find((a) => a.id === appointmentId);
        if (found) {
          found.paid_amount += amount;
          if (found.paid_amount >= found.price && found.status === 'debt') {
            found.status = 'completed';
            found.color_code = '#64748B';
          }
          aptObj = found;
          localStorage.setItem('32desk_custom_appointments', JSON.stringify(customApts));
        }
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }

    const apt = mockAppointments.find((a) => a.id === appointmentId);
    if (apt) {
      apt.paid_amount += amount;
      if (apt.paid_amount >= apt.price && apt.status === 'debt') {
        apt.status = 'completed';
        apt.color_code = '#64748B';
      }
      if (!aptObj) aptObj = apt;
    }

    // Automatically record FinancialTransaction in real database / storage
    if (amount > 0) {
      await this.createTransaction({
        appointment: appointmentId,
        patient: aptObj?.patient || apt?.patient,
        patient_name: aptObj?.patient_name || apt?.patient_name || 'Bemor',
        doctor: aptObj?.doctor || apt?.doctor,
        doctor_name: aptObj?.doctor_name || apt?.doctor_name || 'Shifokor',
        amount,
        type: 'income',
        category: 'Оплата приема',
        payment_method,
        cash_register: reg,
        operator_name: operator_name || 'Kassir',
        date: new Date().toISOString().replace('T', ' ').substring(0, 16),
        notes: aptObj?.treatment_notes || apt?.treatment_notes || 'Qabul to‘lovi'
      });
    }
  },

  async toggleSms(appointmentId: number): Promise<boolean> {
    try {
      const res = await apiFetch(`${API_BASE}/appointments/${appointmentId}/toggle_sms/`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        return data.sms_sent;
      }
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
    const apt = mockAppointments.find(a => a.id === appointmentId);
    if (apt) {
      apt.sms_sent = !apt.sms_sent;
      return apt.sms_sent;
    }
    return false;
  },

  // Finance transactions with robust persistence (backend API + localStorage)
  async getTransactions(branchId?: number, overrideClinicId?: number): Promise<FinancialTransaction[]> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    const storageKey = getClinicStorageKey('32desk_custom_transactions', cid);
    let customTx: FinancialTransaction[] = [];
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) customTx = JSON.parse(stored);
        if (!stored && (cid === 1)) {
          const legacy = localStorage.getItem('32desk_custom_transactions');
          if (legacy) customTx = JSON.parse(legacy);
        }
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }

    const params = new URLSearchParams();
    if (branchId) params.append('branch', String(branchId));
    if (cid) params.append('clinic', String(cid));
    const q = params.toString() ? `?${params.toString()}` : '';

    const fallbackTransactions = (cid === 1) ? mockTransactions : [];
    const backendData = await safeFetch<FinancialTransaction[]>(`${API_BASE}/finance/${q}`, fallbackTransactions);
    if (!isDemoClinic(cid)) return backendData;
    const customIds = new Set(customTx.map(t => t.id));
    const merged = [...customTx, ...backendData.filter(t => !customIds.has(t.id))];

    const branchNameMap: Record<number, string> = {
      1: 'Toshkent Markaziy filiali',
      2: 'Chilonzor filiali',
      3: 'Yunusobod filiali'
    };

    const resolveBranchId = (t: FinancialTransaction): number | null => {
      if (t.branch) return t.branch;
      if (t.doctor === 1 || t.doctor === 4) return 1;
      if (t.doctor === 2) return 2;
      if (t.doctor === 3) return 3;
      if (t.appointment === 1 || t.appointment === 4 || t.appointment === 5 || t.appointment === 8 || t.appointment === 9) return 1;
      if (t.appointment === 2 || t.appointment === 6) return 2;
      if (t.appointment === 3 || t.appointment === 7) return 3;
      return null;
    };

    const normalized = merged.map(t => {
      const bId = resolveBranchId(t);
      return {
        ...t,
        branch: bId,
        branch_name: t.branch_name || (bId ? branchNameMap[bId] : undefined),
        amount: Number(t.amount) || 0
      };
    });

    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(normalized));
    }

    let res = normalized.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (branchId) {
      res = res.filter(t => t.branch === branchId);
    }
    return res;
  },

  // ═══════════ Oylik moliyaviy reja (BAZADA — localStorage emas) ═══════════
  async getMonthlyPlan(month?: string, overrideClinicId?: number): Promise<{
    exists: boolean; month: string; single_clinic_plan: number;
    branch_plans: Record<string, number>; acknowledged: boolean;
  } | null> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    if (!cid) return null;
    try {
      const q = month ? `?clinic=${cid}&month=${month}` : `?clinic=${cid}`;
      const res = await apiFetch(`${API_BASE}/monthly-plan/${q}`, {
        headers: { 'X-Clinic-ID': String(cid) },
        next: { revalidate: 0 },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async saveMonthlyPlan(payload: {
    single_clinic_plan: number; branch_plans?: Record<string, number>;
    month?: string; acknowledged?: boolean;
  }, overrideClinicId?: number): Promise<boolean> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    if (!cid) return false;
    try {
      const res = await apiFetch(`${API_BASE}/monthly-plan/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Clinic-ID': String(cid) },
        body: JSON.stringify({ clinic: cid, acknowledged: true, ...payload }),
      });
      if (res.ok) bustApiCache();
      return res.ok;
    } catch {
      return false;
    }
  },

  async createTransaction(data: Omit<FinancialTransaction, 'id'>): Promise<FinancialTransaction> {
    bustApiCache();
    const cid = (data as any).clinic !== undefined ? (data as any).clinic : getActiveClinicId();
    const newTx: FinancialTransaction = {
      ...data,
      clinic: cid ?? undefined,
      id: Date.now(),
      amount: Number(data.amount) || 0,
      date: data.date || new Date().toISOString().replace('T', ' ').substring(0, 16)
    };

    try {
      const res = await apiFetch(`${API_BASE}/finance/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: JSON.stringify(newTx)
      });
      if (res.ok) {
        const saved = await res.json();
        const normSaved = { ...saved, amount: Number(saved.amount) || 0 };
        this.saveTransactionLocal(normSaved, cid);
        return normSaved;
      }
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }

    this.saveTransactionLocal(newTx, cid);
    return newTx;
  },

  saveTransactionLocal(tx: FinancialTransaction, overrideClinicId?: number) {
    if (typeof window === 'undefined') return;
    try {
      const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
      const storageKey = getClinicStorageKey('32desk_custom_transactions', cid);
      const cleanTx = { ...tx, amount: Number(tx.amount) || 0 };
      const stored = localStorage.getItem(storageKey);
      const list: FinancialTransaction[] = stored ? JSON.parse(stored) : ((cid === 1) ? [...mockTransactions] : []);
      const filtered = list.filter(t => t.id !== cleanTx.id);
      filtered.unshift(cleanTx);
      localStorage.setItem(storageKey, JSON.stringify(filtered));
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
  },

  async deleteTransaction(id: number): Promise<void> {
    const cid = getActiveClinicId();
    if (typeof window !== 'undefined') {
      try {
        const storageKey = getClinicStorageKey('32desk_custom_transactions', cid);
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const list: FinancialTransaction[] = JSON.parse(stored);
          localStorage.setItem(storageKey, JSON.stringify(list.filter(t => t.id !== id)));
        }
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }
    try {
      await apiFetch(`${API_BASE}/finance/${id}/`, {
        method: 'DELETE',
        headers: cid ? { 'X-Clinic-ID': String(cid) } : undefined
      });
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
  },

  // Tasks
  async getTasks(overrideClinicId?: number): Promise<ClinicTask[]> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    const storageKey = getClinicStorageKey('32desk_tasks', cid);
    let localTasks: ClinicTask[] = [];
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          localTasks = JSON.parse(stored);
        } else if (cid === 1) {
          const legacy = localStorage.getItem('32desk_tasks');
          if (legacy) localTasks = JSON.parse(legacy);
        }
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }

    const q = cid ? `?clinic=${cid}` : '';
    const fallbackTasks = (cid === 1) ? mockTasks : [];
    const backendData = await safeFetch<ClinicTask[]>(`${API_BASE}/tasks/${q}`, fallbackTasks);
    if (!isDemoClinic(cid)) return backendData;
    if (localTasks.length === 0) {
      localTasks = backendData || fallbackTasks;
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(localTasks));
      }
      return localTasks;
    }
    const localMap = new Map(localTasks.map((t) => [t.id, t]));
    const merged = [...localTasks];
    backendData.forEach((b) => {
      if (!localMap.has(b.id)) {
        merged.push(b);
      }
    });
    return merged;
  },

  async createTask(taskData: Omit<ClinicTask, 'id'> & { id?: number }): Promise<ClinicTask> {
    bustApiCache();
    const cid = (taskData as any).clinic !== undefined ? (taskData as any).clinic : getActiveClinicId();
    const newTask: ClinicTask = {
      id: taskData.id || Date.now(),
      clinic: cid ?? undefined,
      title: taskData.title,
      description: taskData.description || '',
      assignee: taskData.assignee,
      assignee_name: taskData.assignee_name || 'Shifokor',
      creator: taskData.creator,
      creator_name: taskData.creator_name,
      creator_role: taskData.creator_role,
      stage: taskData.stage || (taskData.status === 'completed' ? 'completed' : 'new'),
      completed_by: taskData.completed_by,
      completed_by_name: taskData.completed_by_name,
      completed_at: taskData.completed_at,
      patient: taskData.patient,
      patient_name: taskData.patient_name,
      priority: taskData.priority || 'medium',
      status: taskData.status || 'pending',
      due_date: taskData.due_date || new Date().toISOString().split('T')[0],
      start_date: taskData.start_date || new Date().toISOString().split('T')[0],
      task_type: taskData.task_type || 'general',
      service: taskData.service,
      created_at: new Date().toISOString()
    };

    try {
      await apiFetch(`${API_BASE}/tasks/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: JSON.stringify(newTask)
      });
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }

    if (typeof window !== 'undefined') {
      try {
        const storageKey = getClinicStorageKey('32desk_tasks', cid);
        const stored = localStorage.getItem(storageKey);
        const tasks: ClinicTask[] = stored ? JSON.parse(stored) : ((cid === 1) ? [...mockTasks] : []);
        tasks.unshift(newTask);
        localStorage.setItem(storageKey, JSON.stringify(tasks));
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }
    return newTask;
  },

  async updateTask(id: number, patch: Partial<ClinicTask>): Promise<ClinicTask | null> {
    bustApiCache();
    const cid = (patch as any).clinic !== undefined ? (patch as any).clinic : getActiveClinicId();
    try {
      await apiFetch(`${API_BASE}/tasks/${id}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: JSON.stringify(patch)
      });
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }

    if (typeof window !== 'undefined') {
      try {
        const storageKey = getClinicStorageKey('32desk_tasks', cid);
        const stored = localStorage.getItem(storageKey);
        const tasks: ClinicTask[] = stored ? JSON.parse(stored) : ((cid === 1) ? [...mockTasks] : []);
        const idx = tasks.findIndex((t) => t.id === id);
        if (idx !== -1) {
          tasks[idx] = { ...tasks[idx], ...patch };
          localStorage.setItem(storageKey, JSON.stringify(tasks));
          return tasks[idx];
        }
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }
    return null;
  },

  async deleteTask(id: number): Promise<boolean> {
    bustApiCache();
    const cid = getActiveClinicId();
    if (typeof window !== 'undefined') {
      try {
        const storageKey = getClinicStorageKey('32desk_tasks', cid);
        const stored = localStorage.getItem(storageKey);
        const tasks: ClinicTask[] = stored ? JSON.parse(stored) : ((cid === 1) ? [...mockTasks] : []);
        const next = tasks.filter((t) => t.id !== id);
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
        console.error(e);
      }
    }
    try {
      await apiFetch(`${API_BASE}/tasks/${id}/`, {
        method: 'DELETE',
        headers: cid ? { 'X-Clinic-ID': String(cid) } : undefined
      });
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
    return true;
  },

  async getPatientTasks(patientId: number): Promise<ClinicTask[]> {
    const all = await this.getTasks();
    return all.filter((t) => t.patient === patientId);
  },

  // Warehouse
  async getWarehouse(overrideClinicId?: number, branchId?: number | null): Promise<WarehouseItem[]> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    let q = cid ? `?clinic=${cid}` : '';
    if (branchId !== undefined && branchId !== null) {
      q += (q ? '&' : '?') + `branch=${branchId}`;
    }
    const storageKey = getClinicStorageKey('32desk_warehouse', cid);
    let list: WarehouseItem[] = [];
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) list = JSON.parse(stored);
      } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
    }
    const fallbackWarehouse = (cid === 1) ? mockWarehouse : [];
    const backendData = await safeFetch<WarehouseItem[]>(`${API_BASE}/warehouse/${q}`, list.length ? list : fallbackWarehouse);
    if (!isDemoClinic(cid)) return backendData;
    if (backendData && backendData.length > 0) {
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(backendData));
      }
      return backendData;
    }
    return list.length ? list : fallbackWarehouse;
  },

  async createWarehouseItem(data: Partial<WarehouseItem>, overrideClinicId?: number): Promise<WarehouseItem> {
    bustApiCache();
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    const payload = { ...data, clinic: cid || 1 };
    try {
      const res = await apiFetch(`${API_BASE}/warehouse/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Clinic-ID': String(cid || 1) },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const created: WarehouseItem = await res.json();
        const current = await this.getWarehouse(cid || undefined);
        const updated = [created, ...current.filter(i => String(i.id) !== String(created.id))];
        if (typeof window !== 'undefined') {
          localStorage.setItem(getClinicStorageKey('32desk_warehouse', cid), JSON.stringify(updated));
        }
        return created;
      }
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error('Create warehouse item error:', e);
    }
    const newItem: WarehouseItem = {
      id: Date.now(),
      name: data.name || '',
      category: data.category || 'Расходники',
      quantity: Number(data.quantity) || 0,
      unit: data.unit || 'шт',
      min_quantity: Number(data.min_quantity) || 5,
      cost: Number(data.cost) || 0
    };
    const current = await this.getWarehouse(cid || undefined);
    const updated = [newItem, ...current];
    if (typeof window !== 'undefined') {
      localStorage.setItem(getClinicStorageKey('32desk_warehouse', cid), JSON.stringify(updated));
    }
    return newItem;
  },

  async updateWarehouseItem(id: number | string, data: Partial<WarehouseItem>, overrideClinicId?: number): Promise<WarehouseItem | null> {
    bustApiCache();
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    try {
      const res = await apiFetch(`${API_BASE}/warehouse/${id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Clinic-ID': String(cid || 1) },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const updatedItem = await res.json();
        const current = await this.getWarehouse(cid || undefined);
        const updated = current.map(i => String(i.id) === String(id) ? { ...i, ...updatedItem } : i);
        if (typeof window !== 'undefined') {
          localStorage.setItem(getClinicStorageKey('32desk_warehouse', cid), JSON.stringify(updated));
        }
        return updatedItem;
      }
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error('Update warehouse item error:', e);
    }
    const current = await this.getWarehouse(cid || undefined);
    const target = current.find(i => String(i.id) === String(id));
    if (!target) return null;
    const merged = { ...target, ...data };
    const updated = current.map(i => String(i.id) === String(id) ? merged : i);
    if (typeof window !== 'undefined') {
      localStorage.setItem(getClinicStorageKey('32desk_warehouse', cid), JSON.stringify(updated));
    }
    return merged;
  },

  async deleteWarehouseItem(id: number | string, overrideClinicId?: number): Promise<boolean> {
    bustApiCache();
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    try {
      const res = await apiFetch(`${API_BASE}/warehouse/${id}/`, {
        method: 'DELETE',
        headers: { 'X-Clinic-ID': String(cid || 1) }
      });
      if (res.ok || res.status === 204) {
        const current = await this.getWarehouse(cid || undefined);
        const updated = current.filter(i => String(i.id) !== String(id));
        if (typeof window !== 'undefined') {
          localStorage.setItem(getClinicStorageKey('32desk_warehouse', cid), JSON.stringify(updated));
        }
        return true;
      }
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error('Delete warehouse item error:', e);
    }
    const current = await this.getWarehouse(cid || undefined);
    const updated = current.filter(i => String(i.id) !== String(id));
    if (typeof window !== 'undefined') {
      localStorage.setItem(getClinicStorageKey('32desk_warehouse', cid), JSON.stringify(updated));
    }
    return true;
  },

  // Dental Lab
  async getLabOrders(overrideClinicId?: number): Promise<DentalLabOrder[]> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    const storageKey = getClinicStorageKey('32desk_lab_orders', cid);
    let list: DentalLabOrder[] = [];
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          list = JSON.parse(stored);
        } else if (cid === 1) {
          const legacy = localStorage.getItem('32desk_lab_orders');
          if (legacy) list = JSON.parse(legacy);
        }
      } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
    }
    const q = cid ? `?clinic=${cid}` : '';
    const fallbackOrders = (cid === 1) ? mockLabOrders : [];
    const backendData = await safeFetch<DentalLabOrder[]>(`${API_BASE}/lab-orders/${q}`, list.length ? list : fallbackOrders);
    if (!isDemoClinic(cid)) return backendData;
    if (backendData && backendData.length > 0) {
      const existingIds = new Set(backendData.map(b => b.id));
      const merged = [...backendData, ...list.filter(l => !existingIds.has(l.id))];
      this.saveLabOrders(merged, cid || undefined);
      return merged;
    }
    if (!list.length && (cid === 1)) {
      list = mockLabOrders;
      this.saveLabOrders(list, cid || undefined);
    }
    return list;
  },

  saveLabOrders(orders: DentalLabOrder[], overrideClinicId?: number): void {
    if (typeof window === 'undefined') return;
    try {
      const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
      const storageKey = getClinicStorageKey('32desk_lab_orders', cid);
      localStorage.setItem(storageKey, JSON.stringify(orders));
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
  },

  async createLabOrder(order: Omit<DentalLabOrder, 'id'>): Promise<DentalLabOrder> {
    bustApiCache();
    const cid = (order as any).clinic !== undefined ? (order as any).clinic : getActiveClinicId();
    const list = await this.getLabOrders(cid || undefined);
    const orderNum = order.order_number || `LAB-${Math.floor(1000 + Math.random() * 9000)}`;
    const newOrder: DentalLabOrder = {
      ...order,
      clinic: cid ?? undefined,
      id: Date.now(),
      order_number: orderNum,
      status: order.status || 'biriktirildi',
      created_at: new Date().toISOString()
    };

    // Try backend create
    try {
      const res = await apiFetch(`${API_BASE}/lab-orders/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: JSON.stringify({
          ...order,
          clinic: cid || undefined,
          order_number: orderNum
        })
      });
      if (res.ok) {
        const saved = await res.json();
        const updated = [saved, ...list.filter(o => o.id !== saved.id)];
        this.saveLabOrders(updated, cid || undefined);
        return saved;
      }
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }

    const updated = [newOrder, ...list];
    this.saveLabOrders(updated, cid || undefined);
    return newOrder;
  },

  async updateLabOrder(id: number, updates: Partial<DentalLabOrder>): Promise<DentalLabOrder | null> {
    bustApiCache();
    const cid = (updates as any).clinic !== undefined ? (updates as any).clinic : getActiveClinicId();
    const list = await this.getLabOrders(cid || undefined);
    const idx = list.findIndex(o => o.id === id);
    let updatedItem: DentalLabOrder | null = null;
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updates };
      updatedItem = list[idx];
      this.saveLabOrders(list, cid || undefined);
    }

    try {
      await apiFetch(`${API_BASE}/lab-orders/${id}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: JSON.stringify(updates)
      });
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }

    return updatedItem;
  },

  async updateLabOrderStatus(id: number, status: string, extra?: Partial<DentalLabOrder>): Promise<DentalLabOrder | null> {
    bustApiCache();
    return this.updateLabOrder(id, {
      status,
      ...extra,
      completed_date: (status === 'klinika oldi' || status.includes('Готово') || status.includes('Tayyor'))
        ? new Date().toISOString().split('T')[0]
        : undefined
    });
  },

  async deleteLabOrder(id: number): Promise<void> {
    const cid = getActiveClinicId();
    const list = await this.getLabOrders(cid || undefined);
    this.saveLabOrders(list.filter(o => o.id !== id), cid || undefined);
    try {
      await apiFetch(`${API_BASE}/lab-orders/${id}/`, {
        method: 'DELETE',
        headers: cid ? { 'X-Clinic-ID': String(cid) } : undefined
      });
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
  },

  // Stats
  async getDashboardStats(branchId?: number, overrideClinicId?: number): Promise<DashboardStats> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    const params = new URLSearchParams();
    if (branchId) params.append('branch', String(branchId));
    if (cid) params.append('clinic', String(cid));
    const q = params.toString() ? `?${params.toString()}` : '';

    const emptyStats: DashboardStats = {
      today: new Date().toISOString().split('T')[0],
      total_appointments_today: 0,
      completed_today: 0,
      in_progress_today: 0,
      income_today: 0,
      expense_today: 0,
      cash_balance: 0,
      total_patients: 0,
      pending_tasks: 0,
      tasks_badge_count: 0,
      doctors: []
    };
    const fallbackStats = (cid === 1) ? mockStats : emptyStats;
    return safeFetch<DashboardStats>(`${API_BASE}/dashboard/stats/${q}`, fallbackStats);
  },

  // Search
  async globalSearch(query: string, overrideClinicId?: number) {
    if (!query) return { patients: [], appointments: [] };
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    const q = `${encodeURIComponent(query)}${cid ? `&clinic=${cid}` : ''}`;
    const fallback = (cid === 1) ? {
      patients: mockPatients.filter(p => p.full_name.toLowerCase().includes(query.toLowerCase()) || p.phone.includes(query)),
      appointments: mockAppointments.filter(a => a.patient_name.toLowerCase().includes(query.toLowerCase()) || a.treatment_notes.toLowerCase().includes(query.toLowerCase()))
    } : { patients: [], appointments: [] };

    return safeFetch(`${API_BASE}/search/?q=${q}`, fallback);
  },

  // --- Director: Workplaces (Chairs / Cabinets) ---
  async getWorkplaces(branchId?: number, overrideClinicId?: number): Promise<WorkplaceItem[]> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    const storageKey = getClinicStorageKey('32desk_workplaces', cid);
    const demoWorkplaces: WorkplaceItem[] = [
      { id: 1, name: 'Кресло 1 (Терапия)', color: '#3B82F6', branch: 1, branch_name: 'Toshkent Markaziy filiali' },
      { id: 2, name: 'Кресло 2 (Ортопедия)', color: '#10B981', branch: 1, branch_name: 'Toshkent Markaziy filiali' },
      { id: 3, name: 'Кресло 3 (Хирургия)', color: '#8B5CF6', branch: 1, branch_name: 'Toshkent Markaziy filiali' },
      { id: 4, name: 'Кресло 4 (Детское)', color: '#F59E0B', branch: 2, branch_name: 'Chilonzor filiali' },
    ];
    const fallback: WorkplaceItem[] = (cid === 1) ? demoWorkplaces : [];

    // BACKEND-FIRST: avval backenddan olamiz (kreslolar backendda saqlanadi).
    // Eski kod localStorage'ni afzal ko'rardi — bo'sh/eskirgan kesh tufayli kreslolar YO'QOLARDI.
    const params = new URLSearchParams();
    if (branchId) params.append('branch', String(branchId));
    if (cid) params.append('clinic', String(cid));
    const q = params.toString() ? `?${params.toString()}` : '';

    try {
      const res = await apiFetch(`${API_BASE}/workplaces/${q}`, {
        headers: cid ? { 'X-Clinic-ID': String(cid) } : undefined,
      });
      if (res.ok) {
        const data: WorkplaceItem[] = await res.json();
        if (typeof window !== 'undefined' && !branchId) {
          localStorage.setItem(storageKey, JSON.stringify(data));
        }
        if (branchId) return data.filter(w => !w.branch || w.branch === branchId);
        return data;
      }
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }

    // Backend ishlamasa — localStorage kesh yoki demo fallback
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const parsed: WorkplaceItem[] = JSON.parse(stored);
          if (branchId) return parsed.filter(w => !w.branch || w.branch === branchId);
          return parsed;
        }
      } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
    }
    return branchId ? fallback.filter(w => !w.branch || w.branch === branchId) : fallback;
  },

  async createWorkplace(data: Partial<WorkplaceItem>): Promise<WorkplaceItem> {
    const cid = data.clinic !== undefined ? data.clinic : getActiveClinicId();
    const storageKey = getClinicStorageKey('32desk_workplaces', cid);
    const payload = {
      ...data,
      clinic: cid || undefined
    };

    try {
      const res = await apiFetch(`${API_BASE}/workplaces/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const item = await res.json();
        const current = await this.getWorkplaces(undefined, cid || undefined);
        const next = [...current.filter(w => w.id !== item.id), item];
        if (typeof window !== 'undefined') localStorage.setItem(storageKey, JSON.stringify(next));
        return item;
      }
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
    const newItem: WorkplaceItem = {
      id: Date.now(),
      clinic: cid || undefined,
      name: data.name || 'Yangi ish o‘rni (kreslo)',
      color: data.color || '#3B82F6',
      is_active: true
    };
    const current = await this.getWorkplaces(undefined, cid || undefined);
    const next = [...current, newItem];
    if (typeof window !== 'undefined') localStorage.setItem(storageKey, JSON.stringify(next));
    return newItem;
  },

  async updateWorkplace(id: number | string, data: Partial<WorkplaceItem>): Promise<WorkplaceItem | null> {
    const cid = data.clinic !== undefined ? data.clinic : getActiveClinicId();
    const storageKey = getClinicStorageKey('32desk_workplaces', cid);
    try {
      const res = await apiFetch(`${API_BASE}/workplaces/${id}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const updated = await res.json();
        const current = await this.getWorkplaces(undefined, cid || undefined);
        const next = current.map(w => w.id === id ? updated : w);
        if (typeof window !== 'undefined') localStorage.setItem(storageKey, JSON.stringify(next));
        return updated;
      }
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
    const current = await this.getWorkplaces(undefined, cid || undefined);
    const idx = current.findIndex(w => String(w.id) === String(id));
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...data };
      if (typeof window !== 'undefined') localStorage.setItem(storageKey, JSON.stringify(current));
      return current[idx];
    }
    return null;
  },

  async deleteWorkplace(id: number | string): Promise<boolean> {
    const cid = getActiveClinicId();
    const storageKey = getClinicStorageKey('32desk_workplaces', cid);
    try {
      await apiFetch(`${API_BASE}/workplaces/${id}/`, {
        method: 'DELETE',
        headers: cid ? { 'X-Clinic-ID': String(cid) } : {}
      });
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
    const current = await this.getWorkplaces(undefined, cid || undefined);
    const next = current.filter(w => String(w.id) !== String(id));
    if (typeof window !== 'undefined') localStorage.setItem(storageKey, JSON.stringify(next));
    return true;
  },

  // --- Director: Specialties ---
  async getSpecialties(): Promise<SpecialtyItem[]> {
    const fallback: SpecialtyItem[] = [
      { id: 1,  name: 'Терапевт',                 name_ru: 'Терапевт',                 name_uz: 'Terapevt',                  name_en: 'Therapist',          is_default: true },
      { id: 2,  name: 'Ортопед',                  name_ru: 'Ортопед',                  name_uz: 'Ortoped',                   name_en: 'Orthopedist',        is_default: true },
      { id: 3,  name: 'Ортодонт',                 name_ru: 'Ортодонт',                 name_uz: 'Ortodont',                  name_en: 'Orthodontist',       is_default: true },
      { id: 4,  name: 'Хирург',                   name_ru: 'Хирург',                   name_uz: 'Xirurg',                    name_en: 'Surgeon',            is_default: true },
      { id: 5,  name: 'Имплантолог',              name_ru: 'Имплантолог',              name_uz: 'Implantolog',               name_en: 'Implantologist',     is_default: true },
      { id: 6,  name: 'Пародонтолог',             name_ru: 'Пародонтолог',             name_uz: 'Parodontolog',              name_en: 'Periodontist',       is_default: true },
      { id: 7,  name: 'Детский стоматолог',       name_ru: 'Детский стоматолог',       name_uz: 'Bolalar stomatologi',       name_en: 'Pediatric dentist',  is_default: true },
      { id: 8,  name: 'Ассистент врача',          name_ru: 'Ассистент врача',          name_uz: 'Shifokor assistenti',       name_en: "Doctor's assistant", is_default: true },
      { id: 9,  name: 'Гигиенист',                name_ru: 'Гигиенист',                name_uz: 'Gigienist',                 name_en: 'Hygienist',          is_default: true },
      { id: 10, name: 'Стоматолог общей практики', name_ru: 'Стоматолог общей практики', name_uz: 'Umumiy amaliyot stomatologi', name_en: 'General dentist',  is_default: true },
    ];
    // Har doim YANGI ma'lumotni olamiz (safeFetch o'zida xotira-kesh + offline fallback bor).
    // localStorage keshni BIRINCHI qaytarmaymiz — aks holda qo'shilgan/o'zgargan
    // mutaxassislik ko'rinmay, eski ro'yxat qotib qolardi. localStorage faqat backend
    // umuman javob bermaganda (offline) oxirgi haqiqiy ma'lumot sifatida ishlatiladi.
    const res = await safeFetch<SpecialtyItem[]>(`${API_BASE}/specialties/`, fallback);
    if (typeof window !== 'undefined') {
      if (res && res.length > 0 && res !== fallback) {
        localStorage.setItem('32desk_specialties_v2', JSON.stringify(res));
      } else {
        // Backend javob bermadi (fallback qaytdi) — oxirgi saqlangan haqiqiy ro'yxat bo'lsa shuni beramiz
        try {
          const stored = localStorage.getItem('32desk_specialties_v2');
          if (stored) return JSON.parse(stored);
        } catch { /* ignore */ }
      }
    }
    return res;
  },

  // names: 3 tilli nomlar. Kamida bittasi to'ldirilsa yetadi; kanonik name ruscha
  // (bo'sh bo'lsa uz/en dan olinadi) — xodim mutaxassisligi shu matnda saqlanadi.
  async createSpecialty(names: { ru?: string; uz?: string; en?: string }): Promise<SpecialtyItem> {
    const ru = (names.ru || '').trim();
    const uz = (names.uz || '').trim();
    const en = (names.en || '').trim();
    const canonical = ru || uz || en;
    const payload = { name: canonical, name_ru: ru || canonical, name_uz: uz, name_en: en };
    try {
      const res = await apiFetch(`${API_BASE}/specialties/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const item = await res.json();
        const current = await this.getSpecialties();
        const next = [...current.filter(s => s.id !== item.id), item];
        if (typeof window !== 'undefined') localStorage.setItem('32desk_specialties_v2', JSON.stringify(next));
        return item;
      }
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
    const newItem: SpecialtyItem = {
      id: Date.now(),
      name: canonical,
      name_ru: ru || canonical,
      name_uz: uz,
      name_en: en,
      is_active: true
    };
    const current = await this.getSpecialties();
    const next = [...current, newItem];
    if (typeof window !== 'undefined') localStorage.setItem('32desk_specialties_v2', JSON.stringify(next));
    return newItem;
  },

  async deleteSpecialty(id: number | string): Promise<boolean> {
    try {
      await apiFetch(`${API_BASE}/specialties/${id}/`, { method: 'DELETE' });
    } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
    const current = await this.getSpecialties();
    const next = current.filter(s => String(s.id) !== String(id));
    if (typeof window !== 'undefined') localStorage.setItem('32desk_specialties_v2', JSON.stringify(next));
    return true;
  },

  // --- Director: Naryad / Service Price Catalog ---
  // BAZADA (backend /service-catalog/). Klinika bo'yicha scoping serverda (cookie
  // sessiyasi) va X-Clinic-ID bo'yicha. Narx boshqa qurilma/sessiyada bir xil ko'rinadi.
  // DEMO klinika (id=1): hardcoded DEFAULT_NARYAD_CATALOG — saqlanmaydi.
  _mapCatalogRow(row: any): NaryadCatalogItem {
    return {
      id: String(row.id),
      clinic: row.clinic ?? null,
      branch: row.branch ?? null,
      branch_name: row.branch_name || '',
      name: row.name,
      category: row.category || '',
      category_ref: row.category_ref != null ? String(row.category_ref) : null,
      category_name: row.category_name || row.category || '',
      code: row.code || '',
      base_price: Number(row.base_price) || 0,
      default_percent: row.default_percent ?? undefined,
      description: row.description || '',
      duration_min: row.duration_min ?? null,
      buffer_min: row.buffer_min ?? null,
      price_fixed: row.price_fixed ?? true,
      duration_fixed: row.duration_fixed ?? true,
      show_in_calendar: row.show_in_calendar ?? false,
      package_items: Array.isArray(row.package_items) ? row.package_items : [],
      diagnoses: Array.isArray(row.diagnoses) ? row.diagnoses : [],
      manipulations: Array.isArray(row.manipulations) ? row.manipulations : [],
      reminder_enabled: row.reminder_enabled ?? false,
      reminder_days: row.reminder_days ?? null,
      created_at: row.created_at,
    };
  },

  _mapCategoryRow(row: any): ServiceCategory {
    return {
      id: String(row.id),
      clinic: row.clinic ?? null,
      branch: row.branch ?? null,
      branch_name: row.branch_name || '',
      name: row.name,
      description: row.description || '',
      show_in_calendar: row.show_in_calendar ?? false,
      item_count: typeof row.item_count === 'number' ? row.item_count : undefined,
      created_at: row.created_at,
    };
  },

  // --- Service categories (32desk «Услуга») — BAZADA /service-categories/ ---
  async getServiceCategories(branchId?: number | null): Promise<ServiceCategory[]> {
    if (typeof window === 'undefined') return [];
    if (isDemoClinic()) return DEMO_SERVICE_CATEGORIES;
    const q = branchId !== undefined && branchId !== null ? `?branch=${branchId}` : '';
    const rows = await safeFetch<any[]>(`${API_BASE}/service-categories/${q}`, []);
    return Array.isArray(rows) ? rows.map((r) => this._mapCategoryRow(r)) : [];
  },

  async createServiceCategory(cat: Omit<ServiceCategory, 'id'>): Promise<ServiceCategory> {
    if (isDemoClinic()) return { ...cat, id: `demo-${Date.now()}` } as ServiceCategory;
    const res = await apiFetch(`${API_BASE}/service-categories/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: cat.name,
        description: cat.description || '',
        show_in_calendar: !!cat.show_in_calendar,
        branch: cat.branch ?? null,
      }),
    });
    const row = await res.json();
    bustApiCache();
    return this._mapCategoryRow(row);
  },

  async updateServiceCategory(id: string, updates: Partial<ServiceCategory>): Promise<ServiceCategory | null> {
    if (isDemoClinic()) return null;
    const body: Record<string, any> = {};
    for (const k of ['name', 'description', 'show_in_calendar', 'branch'] as const) {
      if (updates[k] !== undefined) body[k] = updates[k];
    }
    const res = await apiFetch(`${API_BASE}/service-categories/${id}/`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const row = await res.json();
    bustApiCache();
    return this._mapCategoryRow(row);
  },

  async deleteServiceCategory(id: string): Promise<void> {
    if (isDemoClinic()) return;
    await apiFetch(`${API_BASE}/service-categories/${id}/`, { method: 'DELETE' });
    bustApiCache();
  },

  // Klinika serverda sessiya (cookie + X-Clinic-ID) bo'yicha aniqlanadi — shuning
  // uchun bu metodlar klinika argumentini OLMAYDI (chalg'ituvchi bo'lardi).
  async getNaryadCatalog(branchId?: number | null): Promise<NaryadCatalogItem[]> {
    if (typeof window === 'undefined') return DEFAULT_NARYAD_CATALOG;
    // DEMO: narxlar bilan to'liq katalog. Saqlanmaydi.
    if (isDemoClinic()) {
      return DEFAULT_NARYAD_CATALOG.map((d) => ({ ...d }));
    }
    // Backend down bo'lsa [] (bo'sh) — soxta narx ko'rsatmaymiz. Yangi klinikada ham
    // katalog bo'sh bo'lishi normal (direktor to'ldiradi yoki import qiladi).
    const q = branchId !== undefined && branchId !== null ? `?branch=${branchId}` : '';
    const rows = await safeFetch<any[]>(`${API_BASE}/service-catalog/${q}`, []);
    return Array.isArray(rows) ? rows.map((r) => this._mapCatalogRow(r)) : [];
  },

  // Yangi klinika katalogi BO'SH boshlanadi — serverga avtomatik yozilmaydi.
  // Direktor naryadlar sahifasida qo'lda qo'shadi yoki import qiladi (nazoratli).
  initClinicWithZeroPrices(): NaryadCatalogItem[] {
    return [];
  },

  async createNaryadCatalogItem(item: Omit<NaryadCatalogItem, 'id'>): Promise<NaryadCatalogItem> {
    if (isDemoClinic()) {
      // demo: saqlanmaydi — vaqtinchalik obyekt qaytaramiz (reload'da yo'qoladi)
      return { ...item, id: `demo-${Date.now()}` } as NaryadCatalogItem;
    }
    const res = await apiFetch(`${API_BASE}/service-catalog/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: item.name, category: item.category,
        category_ref: item.category_ref ? Number(item.category_ref) : null,
        branch: item.branch ?? null,
        code: item.code || '',
        base_price: item.base_price, default_percent: item.default_percent,
        description: item.description || '',
        duration_min: item.duration_min ?? null, buffer_min: item.buffer_min ?? null,
        price_fixed: item.price_fixed ?? true, duration_fixed: item.duration_fixed ?? true,
        show_in_calendar: item.show_in_calendar ?? false,
        package_items: item.package_items || [], diagnoses: item.diagnoses || [],
        manipulations: item.manipulations || [],
        reminder_enabled: item.reminder_enabled ?? false, reminder_days: item.reminder_days ?? null,
      }),
    });
    const row = await res.json();
    bustApiCache();
    return this._mapCatalogRow(row);
  },

  async updateNaryadCatalogItem(id: string, updates: Partial<NaryadCatalogItem>): Promise<NaryadCatalogItem | null> {
    if (isDemoClinic()) return null; // demo: saqlanmaydi
    const body: Record<string, any> = {};
    for (const k of ['name', 'category', 'code', 'base_price', 'default_percent', 'description',
      'duration_min', 'buffer_min', 'price_fixed', 'duration_fixed', 'show_in_calendar',
      'package_items', 'diagnoses', 'manipulations', 'reminder_enabled', 'reminder_days', 'branch'] as const) {
      if (updates[k] !== undefined) body[k] = updates[k];
    }
    if (updates.category_ref !== undefined) body.category_ref = updates.category_ref ? Number(updates.category_ref) : null;
    const res = await apiFetch(`${API_BASE}/service-catalog/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const row = await res.json();
    bustApiCache();
    return this._mapCatalogRow(row);
  },

  async deleteNaryadCatalogItem(id: string): Promise<void> {
    if (isDemoClinic()) return; // demo: saqlanmaydi
    await apiFetch(`${API_BASE}/service-catalog/${id}/`, { method: 'DELETE' });
    bustApiCache();
  },

  // Nazoratli import — ATOMAR va IDEMPOTENT (backend `bulk_import` tranzaksiyasi).
  // source='local': shu brauzerdagi eski katalogni import qiladi; topilmasa/buzilgan
  //   bo'lsa ANIQ xato tashlaydi (standart narxlarga YASHIRIN o'tmaydi).
  // source='default': standart ro'yxatni narx 0 bilan import qiladi (ochiq tanlov).
  // O'rtada xato bo'lsa server hech narsa yozmaydi; qayta urinish dublikat yaratmaydi
  // (mavjud nomlar o'tkazib yuboriladi). {created, skipped} qaytaradi.
  async importNaryadCatalog(source: 'local' | 'default'): Promise<{ created: number; skipped: number }> {
    if (isDemoClinic()) return { created: 0, skipped: 0 };
    let items: Omit<NaryadCatalogItem, 'id'>[] = [];
    if (source === 'local') {
      if (typeof window === 'undefined') throw new ApiError('Lokal ma’lumot faqat brauzerda mavjud.');
      const cid = getActiveClinicId();
      const keys = [cid ? `32desk_naryad_catalog_${cid}` : null, cid ? `dentos_naryad_catalog_${cid}` : null].filter(Boolean) as string[];
      let raw: string | null = null;
      for (const key of keys) { raw = localStorage.getItem(key); if (raw) break; }
      if (!raw) throw new ApiError('Bu brauzerda importga eski narx ma’lumoti topilmadi.');
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('empty');
        items = parsed;
      } catch {
        throw new ApiError('Eski narx ma’lumoti buzilgan — import qilib bo‘lmadi.');
      }
    } else {
      items = DEFAULT_NARYAD_CATALOG.map((d) => ({ ...d, base_price: 0 }));
    }
    const res = await apiFetch(`${API_BASE}/service-catalog/bulk_import/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.map((it) => ({
        name: it.name, category: it.category, base_price: Number(it.base_price) || 0,
        default_percent: it.default_percent, description: it.description || '',
      })) }),
    });
    bustApiCache();
    const data = await res.json();
    return { created: Number(data.created) || 0, skipped: Number(data.skipped) || 0 };
  },

  // --- Director: Doctor Naryad Assignments & Custom Pricing ---
  // BAZADA (backend /doctor-naryads/), klinika+shifokor+xizmat bo'yicha scoping.
  // DEMO (id=1): hardcoded DEFAULT_DOCTOR_NARYADS — saqlanmaydi.
  _mapRateRow(row: any): DoctorNaryadAssignment {
    return {
      id: String(row.id),
      doctor_id: Number(row.doctor_id),
      naryad_id: String(row.naryad_id),
      name: row.name || '',
      category: row.category || '',
      custom_price: Number(row.custom_price) || 0,
      commission_percent: Number(row.commission_percent) || 0,
      is_custom_price: !!row.is_custom_price,
      notes: row.notes || '',
    };
  },

  async getDoctorNaryads(doctorId?: number): Promise<DoctorNaryadAssignment[]> {
    if (isDemoClinic()) {
      return doctorId != null ? DEFAULT_DOCTOR_NARYADS.filter(d => d.doctor_id === doctorId) : DEFAULT_DOCTOR_NARYADS;
    }
    const q = doctorId != null ? `?doctor=${doctorId}` : '';
    const rows = await safeFetch<any[]>(`${API_BASE}/doctor-naryads/${q}`, []);
    return Array.isArray(rows) ? rows.map((r) => this._mapRateRow(r)) : [];
  },

  async assignDoctorNaryad(assignment: Omit<DoctorNaryadAssignment, 'id'>): Promise<DoctorNaryadAssignment | null> {
    if (isDemoClinic()) return { ...assignment, id: `demo-${Date.now()}` } as DoctorNaryadAssignment;
    // Backend upsert (klinika+shifokor+xizmat bo'yicha) — takroriy "assign" xavfsiz.
    const res = await apiFetch(`${API_BASE}/doctor-naryads/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doctor_id: assignment.doctor_id, naryad_id: assignment.naryad_id,
        custom_price: assignment.custom_price, commission_percent: assignment.commission_percent,
        is_custom_price: assignment.is_custom_price ?? false, notes: assignment.notes || '',
      }),
    });
    bustApiCache();
    return this._mapRateRow(await res.json());
  },

  async updateDoctorNaryad(id: string, updates: Partial<DoctorNaryadAssignment>): Promise<DoctorNaryadAssignment | null> {
    if (isDemoClinic()) return null;
    const body: Record<string, any> = {};
    for (const k of ['custom_price', 'commission_percent', 'is_custom_price', 'notes'] as const) {
      if (updates[k] !== undefined) body[k] = updates[k];
    }
    const res = await apiFetch(`${API_BASE}/doctor-naryads/${id}/`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    bustApiCache();
    return this._mapRateRow(await res.json());
  },

  async removeDoctorNaryad(id: string): Promise<void> {
    if (isDemoClinic()) return;
    await apiFetch(`${API_BASE}/doctor-naryads/${id}/`, { method: 'DELETE' });
    bustApiCache();
  },

  // --- Doctor Certificates & Diplomas ---
  async addDoctorCertificate(empId: number, cert: Omit<DoctorCertificate, 'id'>): Promise<DoctorCertificate> {
    const newCert: DoctorCertificate = {
      ...cert,
      id: `cert-${Date.now()}`
    };
    const emps = await this.getEmployees();
    const emp = emps.find(e => e.id === empId);
    if (emp) {
      const existingCerts = emp.certificates || [];
      const updatedCerts = [...existingCerts, newCert];
      await this.updateEmployee(empId, { certificates: updatedCerts });
    }
    return newCert;
  },

  async deleteDoctorCertificate(empId: number, certId: string): Promise<void> {
    const emps = await this.getEmployees();
    const emp = emps.find(e => e.id === empId);
    if (emp) {
      const updatedCerts = (emp.certificates || []).filter(c => c.id !== certId);
      await this.updateEmployee(empId, { certificates: updatedCerts });
    }
  },

  async addDoctorDiploma(empId: number, diploma: Omit<DoctorDiploma, 'id'>): Promise<DoctorDiploma> {
    const newDip: DoctorDiploma = {
      ...diploma,
      id: `dip-${Date.now()}`
    };
    const emps = await this.getEmployees();
    const emp = emps.find(e => e.id === empId);
    if (emp) {
      const existingDips = emp.diplomas || [];
      const updatedDips = [...existingDips, newDip];
      await this.updateEmployee(empId, { diplomas: updatedDips });
    }
    return newDip;
  },

  async deleteDoctorDiploma(empId: number, diplomaId: string): Promise<void> {
    const emps = await this.getEmployees();
    const emp = emps.find(e => e.id === empId);
    if (emp) {
      const updatedDips = (emp.diplomas || []).filter(d => d.id !== diplomaId);
      await this.updateEmployee(empId, { diplomas: updatedDips });
    }
  },

  // --- Dental Technicians ---
  // --- Platforma login (rol + klinika bazadan) ---
  async platformLogin(username: string, password: string): Promise<any | null> {
    try {
      const res = await apiFetch(`${API_BASE}/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok && data.ok) return data.user;
      if (res.status !== 400) throw new ApiError(data.detail || data.message || `Kirish serverida xato (HTTP ${res.status}).`, res.status);
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }

    // XAVFSIZLIK: offline/localStorage bypass OLIB TASHLANDI.
    // Kirish faqat backend /auth/login/ orqali — login/parol bazadan tekshiriladi.
    // Yaratilgan klinikalar ham backendда director akkaunti sifatida saqlanadi,
    // shuning uchun ular ham shu endpoint orqali kiradi.
    return null;
  },

  // ── SMS / Telegram kod bilan kirish (OTP) ──
  async requestLoginCode(phone: string, method: 'sms' | 'telegram'): Promise<{ ok: boolean; message?: string; sent?: boolean; dev_code?: string | null }> {
    try {
      const res = await apiFetch(`${API_BASE}/auth/request-code/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, method })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      return { ok: false, message: data.message || `Xatolik (HTTP ${res.status})` };
    } catch {
      return { ok: false, message: 'Serverga ulanib bo‘lmadi' };
    }
  },

  async verifyLoginCode(phone: string, code: string): Promise<any | null> {
    try {
      const res = await apiFetch(`${API_BASE}/auth/verify-code/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) return data.user;
      return { __error: data.message || 'Kod noto‘g‘ri' };
    } catch {
      return { __error: 'Serverga ulanib bo‘lmadi' };
    }
  },

  async updateUserProfile(data: {
    user_id?: string;
    current_username?: string;
    username?: string;
    email?: string;
    password?: string;
    current_password?: string;
    full_name?: string;
    phone?: string;
    clinic_id?: number;
    role?: string;
  }): Promise<{ ok: boolean; message: string; user?: any }> {
    try {
      const res = await apiFetch(`${API_BASE}/auth/update-profile/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const resData = await res.json();
      if (res.ok && resData.ok) {
        // Also update local storage cache if present
        this.syncUpdatedUserInLocalCache(resData.user || data);
        return resData;
      }
      if (resData.message) {
        return { ok: false, message: resData.message };
      }
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }

    // Offline fallback update:
    this.syncUpdatedUserInLocalCache(data);
    return { ok: true, message: 'Profil va kirish ma’lumotlari saqlandi' };
  },

  // ── Sun'iy Intellektli Administrator va Konsultant API ──
  async aiAgentChat(clinicId: number, phone: string, message: string, patientName?: string): Promise<{
    ok: boolean;
    action?: string;
    intent?: string;
    reply: string;
    appointment_id?: number;
    date?: string;
    time?: string;
    doctor?: string;
    new_status?: string;
  }> {
    try {
      const res = await apiFetch(`${API_BASE}/ai-agent/chat/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Clinic-ID': String(clinicId)
        },
        body: JSON.stringify({ clinic_id: clinicId, phone, message, patient_name: patientName })
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      return {
        ok: false,
        reply: 'Tarmoq xatosi. AI serverga ulanish imkoni bo‘lmadi.'
      };
    }
  },

  async aiAgentGetSettings(clinicId: number): Promise<any> {
    try {
      const res = await apiFetch(`${API_BASE}/ai-agent/settings/?clinic=${clinicId}`, {
        headers: { 'X-Clinic-ID': String(clinicId) }
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      return { ok: false, has_ai_agent: false, has_auto_reminders: false };
    }
  },

  async aiAgentSaveSettings(clinicId: number, data: { has_ai_agent?: boolean; has_auto_reminders?: boolean; ai_agent_settings?: any }): Promise<any> {
    try {
      const res = await apiFetch(`${API_BASE}/ai-agent/settings/?clinic=${clinicId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Clinic-ID': String(clinicId)
        },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      return { ok: false, message: String(e) };
    }
  },

  syncUpdatedUserInLocalCache(data: any) {
    if (typeof window === 'undefined') return;
    try {
      // 1. Update current user in 32desk_auth_user
      const curStr = localStorage.getItem('32desk_auth_user');
      if (curStr) {
        const curUser = JSON.parse(curStr);
        if (data.username || data.email) curUser.username = data.username || data.email;
        if (data.full_name || data.name) curUser.name = data.full_name || data.name;
        localStorage.setItem('32desk_auth_user', JSON.stringify(curUser));
      }

      // 2. Update in dentos_created_clinics_auth list
      const listStr = localStorage.getItem('dentos_created_clinics_auth');
      if (listStr) {
        const list = JSON.parse(listStr);
        if (Array.isArray(list)) {
          const updated = list.map((item: any) => {
            if (
              (data.current_username && item.email?.toLowerCase() === data.current_username.toLowerCase()) ||
              (data.user_id && String(item.clinic_id) === String(data.user_id))
            ) {
              return {
                ...item,
                email: data.username || data.email || item.email,
                password: data.password || item.password,
                full_name: data.full_name || data.name || item.full_name
              };
            }
            return item;
          });
          localStorage.setItem('dentos_created_clinics_auth', JSON.stringify(updated));
        }
      }
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
  },

  // --- Zubnoy texniklar (backend bazadan) ---
  async getTechnicians(overrideClinicId?: number): Promise<DentalTechnician[]> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    const params = new URLSearchParams();
    if (cid) params.append('clinic', String(cid));
    const q = params.toString() ? `?${params.toString()}` : '';
    // Texniklar platforma darajasidagi resurs — superadmin (clinic yo'q) ham ko'rsin.
    return safeFetch<DentalTechnician[]>(`${API_BASE}/technicians/${q}`, mockTechnicians);
  },

  async getAvailableTechnicians(): Promise<DentalTechnician[]> {
    return safeFetch<DentalTechnician[]>(`${API_BASE}/technicians/available/`, mockTechnicians);
  },

  async toggleTechnicianLink(techId: number, action: 'link' | 'unlink'): Promise<{ ok: boolean; linked_technicians?: number[] }> {
    const cid = getActiveClinicId();
    try {
      const res = await apiFetch(`${API_BASE}/technicians/toggle_link/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: JSON.stringify({ technician_id: techId, action })
      });
      if (res.ok) return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error('toggleTechnicianLink error:', e);
    }
    return { ok: false };
  },

  async createTechnician(data: Partial<DentalTechnician>): Promise<DentalTechnician> {
    bustApiCache();
    try {
      const res = await apiFetch(`${API_BASE}/technicians/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
    return {
      id: Date.now(),
      name: data.name || 'Yangi Texnik',
      lab_name: data.lab_name || 'Dental Lab',
      phone: data.phone || '',
      username: data.username || `tech_${Date.now()}`,
      password: data.password || '123456',
      is_active: data.is_active ?? true,
      linked_clinics: data.linked_clinics || [],
      price_list: data.price_list || [],
      created_at: new Date().toISOString()
    };
  },

  async updateTechnician(id: number, data: Partial<DentalTechnician>): Promise<DentalTechnician> {
    bustApiCache();
    try {
      const res = await apiFetch(`${API_BASE}/technicians/${id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
    return { id, name: data.name || '', lab_name: data.lab_name || '', phone: data.phone || '', username: data.username || '', is_active: true, linked_clinics: [], price_list: [] } as DentalTechnician;
  },

  async technicianLogin(credentials: { username: string; password: string }): Promise<{ success: boolean; technician?: DentalTechnician; error?: string }> {
    try {
      const res = await apiFetch(`${API_BASE}/technicians/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });
      const data = await res.json();
      return data.ok ? { success: true, technician: data.technician } : { success: false, error: data.message };
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      return { success: false, error: 'Сервер недоступен' };
    }
  },

  async updateTechnicianPriceList(id: number, priceList: TechnicianPriceItem[]): Promise<DentalTechnician> {
    try {
      const res = await apiFetch(`${API_BASE}/technicians/${id}/update_price_list/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price_list: priceList })
      });
      if (res.ok) {
        // update_price_list faqat {ok, price_list} qaytaradi — to'liq texnik obyektni qайta olamiz
        const full = await apiFetch(`${API_BASE}/technicians/${id}/`);
        if (full.ok) return await full.json();
      }
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
    return this.updateTechnician(id, { price_list: priceList });
  },

  // --- Platform Setting (SuperMupperDirectorAdmin) ---
  async getPlatformSettings(): Promise<PlatformSetting> {
    return safeFetch<PlatformSetting>(`${API_BASE}/platform-settings/current/`, {
      id: 1,
      clinic_name: 'Premium Clinic',
      plan_tier: 'Enterprise Max',
      storage_quota_gb: 50,
      storage_used_gb: 4.8,
      enabled_modules: {
        sms_reminders: true,
        telegram_bot: true,
        whatsapp_integration: true,
        dental_lab: true,
        chair_management: true,
        three_d_chart: true,
        doctor_commission: true,
        analytics_export: true
      },
      max_doctors: 25,
      updated_at: new Date().toISOString()
    });
  },

  async updatePlatformSettings(data: Partial<PlatformSetting>): Promise<PlatformSetting> {
    try {
      const current = await this.getPlatformSettings();
      const targetId = current?.id || 1;
      const res = await apiFetch(`${API_BASE}/platform-settings/${targetId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
    return { ...((await this.getPlatformSettings()) || {}), ...data } as PlatformSetting;
  },

  // --- Clinic Tenants (Multi-Clinic & SuperAdmin Management) — backend bazadan ---
  async getClinics(): Promise<ClinicTenant[]> {
    return safeFetch<ClinicTenant[]>(`${API_BASE}/clinics/`, mockClinics);
  },

  async getClinic(id: number): Promise<ClinicTenant | null> {
    return safeFetch<ClinicTenant | null>(`${API_BASE}/clinics/${id}/`, null);
  },

  async createClinic(data: Partial<ClinicTenant> & { director_email?: string; director_password?: string }): Promise<ClinicTenant> {
    bustApiCache();
    const slug = (data.name || 'clinic').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'clinic';
    const finalEmail = data.director_email?.trim() || `director.${slug}@gmail.com`;
    const finalPassword = data.director_password?.trim() || (Math.random().toString(36).slice(-6) + '7D');

    const payload = {
      ...data,
      director_email: finalEmail,
      director_password: finalPassword,
    };

    // MUHIM: backend javob bermasa SOXTA klinika qaytarmaymiz — xatolikni ko'rsatamiz.
    // Aks holda superadmin kredensiallar oladi-yu, klinika aslida SAQLANMAYDI
    // va ro'yxatda ko'rinmaydi. Shuning uchun xatoni yuqoriga uzatamiz.
    let res: Response;
    try {
      res = await apiFetch(`${API_BASE}/clinics/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      throw new Error('Serverga ulanib bo‘lmadi. Backend ishlab turganiga ishonch hosil qiling va qayta urinib ko‘ring.');
    }

    if (!res.ok) {
      let msg = `Klinika yaratishda xatolik (HTTP ${res.status})`;
      try { const err = await res.json(); msg = err.detail || err.message || JSON.stringify(err); } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
      throw new Error(msg);
    }

    const created = await res.json();
    const creds = created.credentials || {
      email: finalEmail,
      password: finalPassword,
      role: 'director',
      full_name: created.director_name || data.director_name || 'Klinika Rahbari',
      clinic_id: created.id,
      clinic_name: created.name
    };
    created.credentials = creds;
    this.saveCreatedClinicAuth(creds);

    // YANGI KLINIKA — standart naryad katalogini (DEFAULT_NARYAD_CATALOG, ~87 ta xizmat,
    // narx 0, lekin FOIZ bilan) AVTOMATIK yuklaymiz. Bu eski xatti-harakatni tiklaydi:
    // klinika ochilganda naryadlar tayyor turadi (narxini direktor keyin yozadi).
    // Superadmin X-Clinic-ID bilan yangi klinikaga yozadi (access.py superadmin'ga ruxsat beradi).
    // bulk_import IDEMPOTENT — takror chaqirilса dublikat yaratmaydi. Best-effort: xato bo'lsa
    // klinika baribir yaratilgan, direktor naryadlar sahifasida "Standart ro'yxat" bilan import qiladi.
    try {
      if (created?.id && Number(created.id) !== 1) {
        await apiFetch(`${API_BASE}/service-catalog/bulk_import/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Clinic-ID': String(created.id) },
          body: JSON.stringify({
            items: DEFAULT_NARYAD_CATALOG.map((d) => ({
              name: d.name, category: d.category, base_price: 0,
              default_percent: d.default_percent, description: d.description || '',
            })),
          }),
        }, false);
        bustApiCache();
      }
    } catch { /* seed best-effort — pastda "Standart ro'yxat" tugmasi zaxira yo'l */ }

    return created;
  },

  saveCreatedClinicAuth(creds: any) {
    if (typeof window === 'undefined') return;
    try {
      const listStr = localStorage.getItem('dentos_created_clinics_auth') || '[]';
      const list = JSON.parse(listStr);
      const filtered = list.filter((c: any) => c.email?.toLowerCase() !== creds.email?.toLowerCase());
      filtered.unshift(creds);
      localStorage.setItem('dentos_created_clinics_auth', JSON.stringify(filtered));
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
  },

  async updateClinic(id: number, data: Partial<ClinicTenant>): Promise<ClinicTenant> {
    bustApiCache();
    try {
      const res = await apiFetch(`${API_BASE}/clinics/${id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
    return { id, ...data } as ClinicTenant;
  },

  async deleteClinic(id: number): Promise<boolean> {
    bustApiCache();
    try {
      const res = await apiFetch(`${API_BASE}/clinics/${id}/`, { method: 'DELETE' });
      if (res.ok) bustApiCache();
      return res.ok;
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
      return false;
    }
  },

  async getClinicDossier(id: number): Promise<ClinicDossierData | null> {
    return safeFetch<ClinicDossierData | null>(`${API_BASE}/clinics/${id}/dossier/`, null);
  },

  // Superadmin: klinika direktorining Gmail (login) va/yoki parolini o'zgartiradi.
  async setDirectorCredentials(
    clinicId: number,
    data: { director_email?: string; director_password?: string }
  ): Promise<{ ok: boolean; message?: string; director_email?: string; director_password?: string }> {
    bustApiCache();
    try {
      const res = await apiFetch(`${API_BASE}/clinics/${clinicId}/set_director_credentials/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const resData = await res.json().catch(() => ({}));
      if (res.ok && resData.ok) {
        // Offline login ro'yxatini (dentos_created_clinics_auth) shu klinika bo'yicha yangilaymiz.
        // MUHIM: joriy (superadmin) sessiyaga tegmaymiz.
        if (typeof window !== 'undefined') {
          try {
            const listStr = localStorage.getItem('dentos_created_clinics_auth');
            if (listStr) {
              const list = JSON.parse(listStr);
              if (Array.isArray(list)) {
                const updated = list.map((item: any) =>
                  String(item.clinic_id) === String(clinicId)
                    ? {
                        ...item,
                        email: resData.director_email || data.director_email || item.email,
                        username: resData.director_email || data.director_email || item.username,
                        password: resData.director_password || data.director_password || item.password
                      }
                    : item
                );
                localStorage.setItem('dentos_created_clinics_auth', JSON.stringify(updated));
              }
            }
          } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
        }
        return resData;
      }
      return { ok: false, message: resData.message || `Xatolik (HTTP ${res.status})` };
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      return { ok: false, message: 'Serverga ulanib bo‘lmadi' };
    }
  },

  async linkTechnicianToClinic(clinicId: number, technicianId: number, action: 'link' | 'unlink'): Promise<{ ok: boolean; clinic?: ClinicTenant }> {
    bustApiCache();
    try {
      const res = await apiFetch(`${API_BASE}/clinics/${clinicId}/link_technician/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ technician_id: technicianId, action })
      });
      if (res.ok) return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
    return { ok: false };
  },

  // --- Branches (Filiallar) ---
  async getBranches(activeOnly?: boolean, overrideClinicId?: number): Promise<Branch[]> {
    const cid = overrideClinicId !== undefined ? overrideClinicId : getActiveClinicId();
    const params = new URLSearchParams();
    if (activeOnly) params.append('active', 'true');
    if (cid) params.append('clinic', String(cid));
    const q = params.toString() ? `?${params.toString()}` : '';

    const fallbackBranches = (cid === 1) ? mockBranches : [];
    return safeFetch<Branch[]>(`${API_BASE}/branches/${q}`, fallbackBranches);
  },

  async getBranch(id: number): Promise<Branch | null> {
    const cid = getActiveClinicId();
    const fallbackBranches = (cid === 1) ? mockBranches : [];
    return safeFetch<Branch | null>(`${API_BASE}/branches/${id}/`, fallbackBranches.find(b => b.id === id) || null);
  },

  async createBranch(data: Partial<Branch>): Promise<Branch> {
    bustApiCache();
    const cid = data.clinic !== undefined ? data.clinic : getActiveClinicId();
    const payload = {
      ...data,
      clinic: cid || undefined
    };

    // MUHIM: backend javob bermasa SOXTA filial qaytarmaymiz — xatolikni ko'taramiz.
    // Aks holda filial "yaratilgandek" ko'rinadi-yu, ro'yxat yangilanganda YO'QOLADI.
    let res: Response;
    try {
      res = await apiFetch(`${API_BASE}/branches/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cid ? { 'X-Clinic-ID': String(cid) } : {})
        },
        body: JSON.stringify(payload)
      });
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      throw new Error('Serverga ulanib bo‘lmadi. Filial saqlanmadi — qayta urinib ko‘ring.');
    }
    if (!res.ok) {
      let msg = `Filial saqlashda xatolik (HTTP ${res.status})`;
      try { const err = await res.json(); msg = err.detail || err.message || JSON.stringify(err); } catch (error) { if (error instanceof ApiError && !isDemoClinic()) throw error; }
      throw new Error(msg);
    }
    return await res.json();
  },

  async updateBranch(id: number, data: Partial<Branch>): Promise<Branch> {
    bustApiCache();
    try {
      const res = await apiFetch(`${API_BASE}/branches/${id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) return await res.json();
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
    }
    return { id, ...data } as Branch;
  },

  async deleteBranch(id: number): Promise<boolean> {
    bustApiCache();
    try {
      const res = await apiFetch(`${API_BASE}/branches/${id}/`, { method: 'DELETE' });
      if (res.ok) bustApiCache();
      return res.ok;
    } catch (e) { if (e instanceof ApiError && !isDemoClinic()) throw e;
      console.error(e);
      return false;
    }
  }
};

const DEFAULT_NARYAD_CATALOG: NaryadCatalogItem[] = [
  // 1. Konsultatsiya va Diagnostika
  { id: 'nar-1', name: 'Первичная консультация врача-стоматолога (осмотр, план лечения)', category: 'Диагностика', base_price: 150000, default_percent: 50, description: 'Birlamchi ko‘rik, tish holatini baholash va davolash rejasini tuzish' },
  { id: 'nar-2', name: 'Консультация главного врача / консилиум специалистов', category: 'Диагностика', base_price: 300000, default_percent: 50, description: 'Bosh shifokor ko‘rigi va murakkab holatlar bo‘yicha konsilium' },
  { id: 'nar-3', name: 'Прицельный радиовизиографический снимок (визиография 1 зуба)', category: 'Диагностика', base_price: 50000, default_percent: 40, description: 'Raqamli viziografda 1 ta tish rentgen tasviri' },
  { id: 'nar-4', name: 'Ортопантомограмма (ОПТГ — панорамный снимок)', category: 'Диагностика', base_price: 120000, default_percent: 40, description: 'Ikkala jag‘ning to‘liq panoramik rentgen tasviri' },
  { id: 'nar-5', name: '3D компьютерная томография (КЛКТ обеих челюстей)', category: 'Диагностика', base_price: 350000, default_percent: 40, description: 'Yuqori aniqlikdagi 3D KT tomografiya tasviri' },
  { id: 'nar-6', name: 'Диагностический фотопротокол и цифровой дизайн улыбки (DSD)', category: 'Диагностика', base_price: 400000, default_percent: 50, description: 'Fotoapparatda tishlar suratini olish va raqamli tabassum loyihalash' },

  // 2. Terapiya va Karies
  { id: 'nar-7', name: 'Лечение поверхностного кариеса + пломба Filtek Ultimate', category: 'Терапия', base_price: 450000, default_percent: 35, description: 'Emal darajasidagi kariesni davolash va yorug‘lik nuri plomba' },
  { id: 'nar-8', name: 'Лечение среднего кариеса + световая пломба Estelite Asteria', category: 'Терапия', base_price: 650000, default_percent: 40, description: 'O‘rtacha kariesni davolash va yapon nanokompozit plombasi' },
  { id: 'nar-9', name: 'Лечение глубокого кариеса с лечебной изолирующей прокладкой', category: 'Терапия', base_price: 750000, default_percent: 35, description: 'Chuqur kariesda pulpa himoyasi va kompozit plomba' },
  { id: 'nar-10', name: 'Художественная реставрация фронтального зуба фотополимером', category: 'Терапия', base_price: 1100000, default_percent: 35, description: 'Old tishning anatomik shakli va rangini to‘liq qayta tiklash' },
  { id: 'nar-11', name: 'Восстановление культи зуба под коронку (Build-up)', category: 'Терапия', base_price: 600000, default_percent: 35, description: 'Toj kiydirish uchun tish asosi (kultya)ni tiklash' },
  { id: 'nar-12', name: 'Прямой композитный винир (1 зуб)', category: 'Терапия', base_price: 1200000, default_percent: 35, description: 'Og‘iz bo‘shlig‘ida to‘g‘ridan-to‘g‘ri qo‘yiladigan kompozit vinir' },
  { id: 'nar-13', name: 'Установка стекловолоконного штифта с адгезивной фиксацией', category: 'Терапия', base_price: 350000, default_percent: 35, description: 'Shisha tolali shtift o‘rnatish va mustahkamlash' },
  { id: 'nar-14', name: 'Снятие старой пломбы / трепанация искусственной коронки', category: 'Терапия', base_price: 100000, default_percent: 30, description: 'Eski nosoz plombani olib tashlash' },
  { id: 'nar-15', name: 'Использование коффердама (раббердама) при лечении', category: 'Терапия', base_price: 80000, default_percent: 30, description: 'Steril izolyatsiya tizimi' },

  // 3. Endodontiya
  { id: 'nar-16', name: 'Эндодонтическое лечение 1-канального зуба (пульпит / периодонтит)', category: 'Endodontiya', base_price: 600000, default_percent: 35, description: '1 ta ildiz kanalini mexanik va medikamentoz tozalash va plombalash' },
  { id: 'nar-17', name: 'Эндодонтическое лечение 2-канального зуба', category: 'Endodontiya', base_price: 900000, default_percent: 35, description: '2 ta ildiz kanalini davolash va 3D guttapercha bilan yopish' },
  { id: 'nar-18', name: 'Эндодонтическое лечение 3-канального зуба', category: 'Endodontiya', base_price: 1200000, default_percent: 35, description: '3 ta ildiz kanalini davolash va to‘liq germetik yopish' },
  { id: 'nar-19', name: 'Эндодонтическое лечение 4-канального зуба (моляр)', category: 'Endodontiya', base_price: 1500000, default_percent: 35, description: 'Murakkab 4-kanalli katta oziq tishini endodontik davolash' },
  { id: 'nar-20', name: 'Распломбировка 1 корневого канала (гуттаперча / паста)', category: 'Endodontiya', base_price: 250000, default_percent: 35, description: 'Eski kanal plomba materialini eritib tozalash' },
  { id: 'nar-21', name: 'Распломбировка 1 канала, запломбированного резорцин-формалином', category: 'Endodontiya', base_price: 400000, default_percent: 40, description: 'Qattiq sementlangan kanalni ochish' },
  { id: 'nar-22', name: 'Извлечение сломанного инструмента из корневого канала', category: 'Endodontiya', base_price: 600000, default_percent: 40, description: 'Mikroskop ostida kanalda singan asbobni chiqarib olish' },
  { id: 'nar-23', name: 'Временное пломбирование канала лечебной пастой (Каласепт / Метапекс)', category: 'Endodontiya', base_price: 200000, default_percent: 30, description: 'Kanal ichiga yallig‘lanishga qarshi dori qo‘yish' },
  { id: 'nar-24', name: 'Закрытие перфорации корня зуба материалом ProRoot MTA', category: 'Endodontiya', base_price: 450000, default_percent: 35, description: 'MTA biokeramika bilan tish devoridagi teshikni yopish' },

  // 4. Gigiyena va Profilaktika
  { id: 'nar-25', name: 'Профессиональная гигиена полости рта (GBT протокол)', category: 'Gigiyena', base_price: 1500000, default_percent: 45, description: 'Shveysariya EMS apparatida kompleks bio-plenka tozalash' },
  { id: 'nar-26', name: 'Комплексная чистка (ультразвук + Air Flow + полировка пастой)', category: 'Gigiyena', base_price: 800000, default_percent: 40, description: 'Toshlarni tushirish va mayin poroshok bilan sayqallash' },
  { id: 'nar-27', name: 'Ультразвуковое снятие твердого зубного камня (все зубы)', category: 'Gigiyena', base_price: 500000, default_percent: 40, description: 'Skaler bilan mineral tish toshlarini olib tashlash' },
  { id: 'nar-28', name: 'Снятие мягкого пигментированного налета Air Flow', category: 'Gigiyena', base_price: 450000, default_percent: 40, description: 'Choy, kofe va tamaki dog‘larini tozalash' },
  { id: 'nar-29', name: 'Глубокое фторирование и минерализация эмали (обе челюсти)', category: 'Gigiyena', base_price: 300000, default_percent: 50, description: 'Tish emalini kariesdan himoya qilish uchun ftorlash' },
  { id: 'nar-30', name: 'Реминерализующая терапия Tooth Mousse / APF гель', category: 'Gigiyena', base_price: 250000, default_percent: 50, description: 'Emal sezuvchanligini pasaytirish va mustahkamlash' },
  { id: 'nar-31', name: 'Клиническое аппаратное отбеливание зубов Beyond Polus Advanced', category: 'Gigiyena', base_price: 2500000, default_percent: 40, description: 'Sovuq nurli Beyond apparatida 6-8 tonga oqartirish' },
  { id: 'nar-32', name: 'Домашнее отбеливание Opalescence (набор + индивидуальные каппы)', category: 'Gigiyena', base_price: 1800000, default_percent: 35, description: 'Uy sharoitida individual kappalar bilan oqartirish' },

  // 5. Jarrohlik (Xirurgiya)
  { id: 'nar-33', name: 'Простое удаление подвижного зуба с анестезией', category: 'Хирургия', base_price: 350000, default_percent: 35, description: 'Parodontit oqibatida qimirlagan tishni og‘riqsiz olish' },
  { id: 'nar-34', name: 'Простое удаление постоянного зуба (однокорневой)', category: 'Хирургия', base_price: 450000, default_percent: 35, description: '1 ildizli tishni asoratsiz sug‘urish' },
  { id: 'nar-35', name: 'Сложное удаление многокорневого зуба с разъединением корней', category: 'Хирургия', base_price: 850000, default_percent: 35, description: 'Ildizlari qiyshiq yoki singan tishni ehtiyotkorlik bilan olish' },
  { id: 'nar-36', name: 'Удаление зуба мудрости (8-й зуб, прорезавшийся)', category: 'Хирургия', base_price: 700000, default_percent: 35, description: 'Yuqori yoki pastki aql tishini sug‘urish' },
  { id: 'nar-37', name: 'Атипичное удаление ретинированного / дистопированного зуба мудрости', category: 'Хирургия', base_price: 1400000, default_percent: 40, description: 'Milk yoki suyak ichida yotgan aql tishini jarrohlik yo‘li bilan olish' },
  { id: 'nar-38', name: 'Цистэктомия с резекцией верхушки корня зуба (1 зуб)', category: 'Хирургия', base_price: 1200000, default_percent: 35, description: 'Tish ildizidagi kistani olib tashlash operatsiyasi' },
  { id: 'nar-39', name: 'Лечение альвеолита с ревизией и кюретажем лунки', category: 'Хирургия', base_price: 250000, default_percent: 35, description: 'Olingan tish o‘rnida yallig‘lanishni davolash' },
  { id: 'nar-40', name: 'Периостотомия (вскрытие поднадкостничного флюса / абсцесса)', category: 'Хирургия', base_price: 400000, default_percent: 35, description: 'Yiringli flyusni yorish va drenaj qo‘yish' },
  { id: 'nar-41', name: 'Пластика уздечки губы / языка (френулопластика лазером или скальпелем)', category: 'Хирургия', base_price: 600000, default_percent: 35, description: 'Til yoki lab yuganagini to‘g‘rilash' },
  { id: 'nar-42', name: 'Ушивание лунки после удаления (шовный материал Vicryl)', category: 'Хирургия', base_price: 150000, default_percent: 30, description: 'Tish o‘rnini tikish' },

  // 6. Implantologiya
  { id: 'nar-43', name: 'Установка имплантата Osstem TS III (Южная Корея)', category: 'Implantologiya', base_price: 4200000, default_percent: 30, description: 'Osstem kompaniyasining yuqori sifatli titan implantati' },
  { id: 'nar-44', name: 'Установка имплантата Dentium SuperLine (Южная Корея)', category: 'Implantologiya', base_price: 4800000, default_percent: 30, description: 'Dentium premium darajadagi titan implantati' },
  { id: 'nar-45', name: 'Установка имплантата Straumann Roxolid SLA (Швейцария)', category: 'Implantologiya', base_price: 7500000, default_percent: 35, description: 'Shveysariya jahon standarti, tez birikuvchi implant' },
  { id: 'nar-46', name: 'Установка имплантата Megagen AnyOne / AnyRidge', category: 'Implantologiya', base_price: 4500000, default_percent: 30, description: 'Megagen innovatsion koxleoid implantati' },
  { id: 'nar-47', name: 'Установка формирователя десны (ФДМ)', category: 'Implantologiya', base_price: 400000, default_percent: 30, description: 'Milk shakllantiruvchi qopqoq o‘rnatish' },
  { id: 'nar-48', name: 'Закрытый синус-лифтинг (мягкий подъем дна гайморовой пазухи)', category: 'Implantologiya', base_price: 3500000, default_percent: 30, description: 'Yuqori jag‘da suyak balandligini yopiq usulda ko‘paytirish' },
  { id: 'nar-49', name: 'Открытый синус-лифтинг (латеральное окно)', category: 'Implantologiya', base_price: 6000000, default_percent: 30, description: 'Katta suyak yetishmovchiligida ochiq sinus-lifting' },
  { id: 'nar-50', name: 'Костная пластика (аугментация биоматериалом Bio-Oss 0.5g)', category: 'Implantologiya', base_price: 4500000, default_percent: 30, description: 'Suyak to‘qimasini o‘stirish uchun suyak kukuni' },
  { id: 'nar-51', name: 'Установка коллагеновой барьерной мембраны (Bio-Gide)', category: 'Implantologiya', base_price: 2000000, default_percent: 30, description: 'Suyakni himoyalovchi membrana o‘rnatish' },
  { id: 'nar-52', name: 'Использование хирургического навигационного шаблона для имплантации', category: 'Implantologiya', base_price: 1500000, default_percent: 25, description: '3D rejalashtirilgan yo‘naltiruvchi shablon' },

  // 7. Ortopediya va Protezlash
  { id: 'nar-53', name: 'Металлокерамическая коронка Duceram Plus (Германия)', category: 'Ортопедия', base_price: 1200000, default_percent: 35, description: 'Mustahkam metall karkasli keramika toj' },
  { id: 'nar-54', name: 'Циркониевая коронка цельноанатомическая Prettau (CAD/CAM)', category: 'Ортопедия', base_price: 2400000, default_percent: 35, description: 'Yuqori aniqlikdagi monolit sirkoniy toj' },
  { id: 'nar-55', name: 'Керамическая коронка E.max Press (Ivoclar Vivadent)', category: 'Ортопедия', base_price: 3000000, default_percent: 35, description: 'Tabiiy tishdan ajralmaydigan presslangan keramika' },
  { id: 'nar-56', name: 'Керамические коронки E MAX (Premium LAB)', category: 'Ортопедия', base_price: 18000000, default_percent: 40, description: 'Premium laboratoriya E.max to‘plam tojlar' },
  { id: 'nar-57', name: 'Керамический винир E.max (высокая эстетика, 1 ед.)', category: 'Ортопедия', base_price: 4500000, default_percent: 35, description: 'Yuksak estetikaga ega yupqa keramika vinir' },
  { id: 'nar-58', name: 'Временная коронка PMMA лабораторная (фрезерованная)', category: 'Ортопедия', base_price: 350000, default_percent: 30, description: 'Laboratoriyada frezerlangan vaqtinchalik toj' },
  { id: 'nar-59', name: 'Временная коронка прямая (изготовление в кресле Luxatemp)', category: 'Ортопедия', base_price: 200000, default_percent: 30, description: 'Kresloda darhol tayyorlanadigan vaqtinchalik toj' },
  { id: 'nar-60', name: 'Индивидуальный циркониевый абатмент на титановом основании', category: 'Ортопедия', base_price: 1200000, default_percent: 30, description: 'Implant ustiga sirkoniy tayanch birikma' },
  { id: 'nar-61', name: 'Металлокерамическая коронка на имплантате', category: 'Ортопедия', base_price: 2200000, default_percent: 35, description: 'Implant ustiga o‘rnatiladigan metallokeramika' },
  { id: 'nar-62', name: 'Циркониевая коронка на имплантате с винтовой фиксацией', category: 'Ортопедия', base_price: 3400000, default_percent: 35, description: 'Vintli mahkamlanuvchi sirkoniy toj' },
  { id: 'nar-63', name: 'Полный съемный акриловый протез (1 челюсть, зубы Ivoclar)', category: 'Ортопедия', base_price: 2500000, default_percent: 35, description: 'Butunlay tishsiz jag‘ uchun to‘liq olinadigan protez' },
  { id: 'nar-64', name: 'Частичный съемный пластиночный протез (микропротез «бабочка»)', category: 'Ортопедия', base_price: 1300000, default_percent: 30, description: '1-3 ta tish o‘rnini bosuvchi qulay kapalak protez' },
  { id: 'nar-65', name: 'Нейлоновый эластичный протез Valplast / Deflex (1 челюсть)', category: 'Ортопедия', base_price: 3500000, default_percent: 35, description: 'Moslashuvchan sinmaydigan neylon protez' },
  { id: 'nar-66', name: 'Бюгельный протез на кламмерах (дуговой)', category: 'Ортопедия', base_price: 5500000, default_percent: 35, description: 'Quyma metall karkasli byugel protez' },
  { id: 'nar-67', name: 'Рельсовый бюгельный протез на имплантатах (на балке)', category: 'Ортопедия', base_price: 25000000, default_percent: 35, description: 'Balka tizimiga mahkamlanuvchi relsli byugel protez' },
  { id: 'nar-68', name: 'Фрезерованная балка с опорой на 8 имплантатов керамокомпозит', category: 'Ортопедия', base_price: 50000000, default_percent: 35, description: '8 ta implant ustiga o‘rnatilgan yuksak mustahkam karkas' },
  { id: 'nar-69', name: 'Снятие искусственной коронки (штампованной / металлокерамической)', category: 'Ортопедия', base_price: 150000, default_percent: 30, description: 'Eski tojni ehtiyotkorlik bilan yorib olish' },
  { id: 'nar-70', name: 'Фиксация коронки на постоянный стеклоиономерный цемент (Fuji I / RelyX)', category: 'Ортопедия', base_price: 120000, default_percent: 30, description: 'Doimiy mustahkam sementga yopishtirish' },

  // 8. Ortodontiya
  { id: 'nar-71', name: 'Металлическая брекет-система Damon Q (1 челюсть)', category: 'Ортодонтия', base_price: 7000000, default_percent: 30, description: 'AQSh Damon Q o‘z-o‘zini ligaturlaydigan metall breket' },
  { id: 'nar-72', name: 'Керамическая самолигирующая брекет-система Damon Clear (1 челюсть)', category: 'Ортодонтия', base_price: 9500000, default_percent: 30, description: 'Ko‘rinmaydigan shaffof keramika breket tizimi' },
  { id: 'nar-73', name: 'Сапфировая эстетическая брекет-система Inspire ICE (1 челюсть)', category: 'Ортодонтия', base_price: 10500000, default_percent: 30, description: 'Toza kristall safir estetik breket' },
  { id: 'nar-74', name: 'Активация брекет-системы и замена ортодонтической дуги', category: 'Ортодонтия', base_price: 350000, default_percent: 40, description: 'Breket tortish va simni yangilash' },
  { id: 'nar-75', name: 'Фиксация несъемного проволочного ретейнера (1 челюсть)', category: 'Ортодонтия', base_price: 800000, default_percent: 35, description: 'Breket yechilgach tishlarni ushlab turuvchi reteyner' },
  { id: 'nar-76', name: 'Ретенционная прозрачная каппа (1 челюсть)', category: 'Ортодонтия', base_price: 600000, default_percent: 35, description: 'Natijani saqlovchi tungi shaffof kappa' },
  { id: 'nar-77', name: 'Съемная ортодонтическая пластинка с винтом Бертони (детская)', category: 'Ортодонтия', base_price: 2200000, default_percent: 35, description: 'Bolalar jag‘ini kengaytiruvchi plastinka' },
  { id: 'nar-78', name: 'Курс лечения элайнерами (набор прозрачных капп, полный кейс)', category: 'Ортодонтия', base_price: 18000000, default_percent: 25, description: 'Ko‘rinmas elaynerlar bilan tishlarni to‘g‘rilash kursi' },

  // 9. Bolalar stomatologiyasi
  { id: 'nar-79', name: 'Лечение кариеса молочного зуба + цветная пломba Twinky Star', category: 'Bolalar', base_price: 350000, default_percent: 40, description: 'Bolalar uchun xavfsiz va qiziqarli rangli plomba' },
  { id: 'nar-80', name: 'Пульпотомия / Лечение пульпита молочного зуба в 1 посещение', category: 'Bolalar', base_price: 450000, default_percent: 35, description: 'Sut tishi pulpasini davolash' },
  { id: 'nar-81', name: 'Удаление молочного зуба с приятной аппликационной анестезией', category: 'Bolalar', base_price: 180000, default_percent: 35, description: 'Og‘riqsiz va qo‘rquvsiz sut tishini olish' },
  { id: 'nar-82', name: 'Герметизация фиссур постоянного моляра (1 зуб)', category: 'Bolalar', base_price: 220000, default_percent: 40, description: 'Chiqayotgan tish chuqurchalarini kariesdan germetik yopish' },
  { id: 'nar-83', name: 'Серебрение молочного зуба (Saforide 38%, 1 зуб)', category: 'Bolalar', base_price: 90000, default_percent: 40, description: 'Boshlang‘ich kariesni to‘xtatish uchun kumushlash' },

  // 10. Parodontologiya
  { id: 'nar-84', name: 'Вектор-терапия при пародонтите (аппарат Vector Paro, 1 челюсть)', category: 'Parodontologiya', base_price: 1200000, default_percent: 40, description: 'Milk yallig‘lanishini mikroskopik darajada tozalash' },
  { id: 'nar-85', name: 'Закрытый кюретаж пародонтальных карманов (1 сегмент / 4-6 зубов)', category: 'Parodontologiya', base_price: 400000, default_percent: 35, description: 'Milk osti chuqur kirlarni tozalash' },
  { id: 'nar-86', name: 'Плазмолифтинг десен (PRP аутоплазма, 1 процедура)', category: 'Parodontologiya', base_price: 600000, default_percent: 40, description: 'Bemor o‘z qoni plazmasi bilan milkni qayta tiklash' },
  { id: 'nar-87', name: 'Шинирование подвижных зубов стекловолоконной лентой (1 зуб)', category: 'Parodontologiya', base_price: 250000, default_percent: 35, description: 'Qimirlagan tishlarni mustahkam biriktirish' }
];

// DEMO klinika (id=1) uchun chap panel kategoriyalari — DEFAULT_NARYAD_CATALOG dan
// aniq kategoriyalar. Saqlanmaydi (demo).
const DEMO_SERVICE_CATEGORIES: ServiceCategory[] = Array.from(
  new Set(DEFAULT_NARYAD_CATALOG.map((d) => d.category).filter(Boolean))
).map((name, i) => ({
  id: `democat-${i + 1}`,
  name,
  description: '',
  show_in_calendar: false,
  item_count: DEFAULT_NARYAD_CATALOG.filter((d) => d.category === name).length,
}));

const DEFAULT_DOCTOR_NARYADS: DoctorNaryadAssignment[] = [
  { id: 'dna-1', doctor_id: 1, naryad_id: 'nar-6', name: 'Циркониевая коронка Prettau', category: 'Ортопедия', custom_price: 2500000, commission_percent: 35 },
  { id: 'dna-2', doctor_id: 1, naryad_id: 'nar-5', name: 'Керамические коронки E MAX (Premium LAB)', category: 'Ортопедия', custom_price: 18000000, commission_percent: 40 },
  { id: 'dna-3', doctor_id: 1, naryad_id: 'nar-1', name: 'Рельсовый бюгельный протез на имплантатах (на балке)', category: 'Ортопедия', custom_price: 25000000, commission_percent: 35 },
  { id: 'dna-4', doctor_id: 1, naryad_id: 'nar-20', name: 'Керамический винир E.max', category: 'Эстетика', custom_price: 4800000, commission_percent: 38 },
  { id: 'dna-5', doctor_id: 2, naryad_id: 'nar-16', name: 'Установка имплантата Osstem (Корея)', category: 'Хирургия', custom_price: 4500000, commission_percent: 30 },
  { id: 'dna-6', doctor_id: 2, naryad_id: 'nar-17', name: 'Установка имплантата Straumann (Швейцария)', category: 'Хирургия', custom_price: 8000000, commission_percent: 35 },
  { id: 'dna-7', doctor_id: 2, naryad_id: 'nar-18', name: 'Синус-лифтинг закрытый', category: 'Хирургия', custom_price: 3500000, commission_percent: 30 },
  { id: 'dna-8', doctor_id: 2, naryad_id: 'nar-15', name: 'Удаление зуба сложное (дистопия/ретинированный)', category: 'Хирургия', custom_price: 950000, commission_percent: 35 },
  { id: 'dna-9', doctor_id: 3, naryad_id: 'nar-8', name: 'Лечение кариеса + световая пломба Estelite', category: 'Терапия', custom_price: 700000, commission_percent: 40 },
  { id: 'dna-10', doctor_id: 3, naryad_id: 'nar-9', name: 'Эндодонтическое лечение корневого канала (1 канал)', category: 'Терапия', custom_price: 850000, commission_percent: 35 },
  { id: 'dna-11', doctor_id: 3, naryad_id: 'nar-10', name: 'Реставрация зуба фотополимером', category: 'Терапия', custom_price: 950000, commission_percent: 35 },
  { id: 'dna-12', doctor_id: 3, naryad_id: 'nar-4', name: 'Композитный винир', category: 'Терапия', custom_price: 3500000, commission_percent: 35 },
  { id: 'dna-13', doctor_id: 4, naryad_id: 'nar-19', name: 'Брекет-система металлическая Damon Q (1 челюсть)', category: 'Ортодонтия', custom_price: 7500000, commission_percent: 35 },
  { id: 'dna-14', doctor_id: 4, naryad_id: 'nar-7', name: 'Консультация врача (осмотр, план лечения, 3D рентген)', category: 'Терапия', custom_price: 500000, commission_percent: 50 },
  { id: 'dna-15', doctor_id: 5, naryad_id: 'nar-11', name: 'Профессиональная гигиена полости рта (GBT протокол)', category: 'Гигиена', custom_price: 1500000, commission_percent: 45 },
  { id: 'dna-16', doctor_id: 5, naryad_id: 'nar-12', name: 'Фторирование эмали', category: 'Гигиена', custom_price: 350000, commission_percent: 50 },
  { id: 'dna-17', doctor_id: 5, naryad_id: 'nar-13', name: 'Отбеливание зубов Beyond Polus', category: 'Гигиена', custom_price: 2600000, commission_percent: 40 }
];

export const DEFAULT_TREATMENT_PLANS: TreatmentPlanStage[] = [];

