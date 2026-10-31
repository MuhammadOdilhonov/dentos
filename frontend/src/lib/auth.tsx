'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch, API_BASE_URL } from './http';
import { clearPatientRecords, resetPatientRecords, hasUnsavedRecords, flushPatientRecords } from './patientRecords';
import { clinicApi } from './api';

export type UserRole = 'superadmin' | 'director' | 'deputy_director' | 'admin' | 'kassa' | 'doctor' | 'technician';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  roleLabel: string;
  initials: string;
  clinicId?: number | null;
  clinicName?: string;
  branchId?: number | null;
  branchName?: string;
  // Klinikaning yoqilgan modullari (superadmin tomonidan boshqariladi). Superadmin uchun undefined = hammasi ochiq.
  modules?: Record<string, boolean>;
}

// DEMO tugmalari — direktordan texnikgacha barcha rollar (superadmin ISTISNO:
// u faqat haqiqiy login talab qiladi). Bular haqiqiy backend akkauntlari (seed,
// hammasi klinika #1 "Dentos Toshkent Markaziy" + texnik shunga ulangan): backend
// /auth/login/ orqali kiradi, hech qanday frontend bypass YO'Q.
export const DEMO_LOGINS: Partial<Record<UserRole, { username: string; pass: string }>> = {
  director: { username: 'director', pass: '123456' },
  deputy_director: { username: 'deputy_director', pass: '123456' },
  admin: { username: 'admin', pass: '123456' },
  doctor: { username: 'doctor', pass: '123456' },
  kassa: { username: 'kassa', pass: '123456' },
  technician: { username: 'texnik_alisher', pass: '123456' },
};

// Backenddan kelgan user obyektini AuthUser ko'rinishiga o'giradi.
function mapBackendUser(u: any): AuthUser {
  return {
    id: String(u.id),
    username: u.username,
    name: u.full_name || u.name || u.username,
    role: u.role as UserRole,
    roleLabel: u.role_label || u.role,
    initials: u.initials || (u.full_name || u.username).slice(0, 2).toUpperCase(),
    clinicId: u.clinic ?? null,
    clinicName: u.clinic_name || undefined,
    branchId: u.branch ?? null,
    branchName: u.branch_name || undefined,
    modules: u.enabled_modules || undefined
  };
}

interface AuthContextType {
  user: AuthUser | null;
  isInitialized: boolean;
  login: (username: string, pass: string) => Promise<boolean>;
  loginWithBackendUser: (backendUser: any) => void;
  logout: () => Promise<void>;
  switchRole: (role: UserRole) => Promise<void>;
  updateCurrentUser: (updates: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isInitialized: false,
  login: async () => false,
  loginWithBackendUser: () => {},
  logout: async () => {},
  switchRole: async () => {},
  updateCurrentUser: () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // 1) Avval localStorage'dan optimistik tiklaymiz (tez ko'rinish uchun).
    let stored: AuthUser | null = null;
    try {
      const raw = localStorage.getItem('32desk_auth_user');
      if (raw) { stored = JSON.parse(raw); setUser(stored); }
    } catch { stored = null; }

    // 2) Server sessiyasi bilan MOSLAYMIZ (/auth/me). Cookie yo'q/eskirgan bo'lsa
    //    "yolg'on kirilgan" holatda qolmaymiz; API 401 zanjiri boshlanmaydi.
    (async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/auth/me/`, { method: 'GET' });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data?.user) persist(mapBackendUser(data.user));
        } else if (res.status === 401) {
          // Sessiya yo'q — localStorage'dagi eski holatni tozalaymiz.
          setUser(null);
          try { localStorage.removeItem('32desk_auth_user'); } catch {}
        }
        // boshqa statuslarda localStorage holatini saqlab qolamiz
      } catch {
        // Tarmoq xatosi (offline bo'lishi mumkin) — mavjud localStorage holatini
        // buzMAYMIZ, foydalanuvchini to'satdan chiqarib yubormaymiz.
      } finally {
        if (!cancelled) setIsInitialized(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const persist = (u: AuthUser) => {
    setUser(u);
    try {
      localStorage.setItem('32desk_auth_user', JSON.stringify(u));
    } catch {}
  };

  const updateCurrentUser = (updates: Partial<AuthUser>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    persist(updated);
  };

  // FAQAT backend bazasidan tekshiradi — hech qanday offline/demo bypass yo'q.
  const login = async (username: string, pass: string): Promise<boolean> => {
    const cleanUser = username.trim();
    const cleanPass = pass.trim();

    const backendUser = await clinicApi.platformLogin(cleanUser, cleanPass);
    if (backendUser) {
      persist(mapBackendUser(backendUser));
      return true;
    }
    return false;
  };

  // SMS/Telegram kod tasdiqlangach backend qaytargan user'ni saqlaydi
  const loginWithBackendUser = (backendUser: any) => {
    persist(mapBackendUser(backendUser));
  };

  const logout = async () => {
    // 1-QADAM: API'ga yuborilishi kerak bo'lgan saqlanmagan o'zgarishlarni AVVAL yuboramiz
    // (flush). Faqat shundan keyin cookie/localStorage tozalanadi — ma'lumot yo'qolmaydi.
    if (hasUnsavedRecords() && typeof window !== 'undefined') {
      const allSaved = await flushPatientRecords();
      if (!allSaved) {
        // Ba'zi o'zgarishlar serverga yetib bormadi — jim yo'qotmaymiz, foydalanuvchidan so'raymiz.
        const ok = window.confirm('Ba’zi o‘zgarishlar serverga saqlanmadi va chiqsangiz yo‘qoladi. Baribir chiqasizmi?');
        if (!ok) return; // qolishni tanladi — hech narsa tozalanmaydi, sessiya ochiq qoladi
      }
    }
    // 2-QADAM: Serverga logout so'rovini YUBORIB, javobini KUTAMIZ — server javobi
    // httpOnly `dentos_session` cookie'sini O'CHIRADI (delete_cookie). Javobni kutmasak,
    // redirect ulgurib, cookie o'chmay sessiya serverda ochiq qolishi mumkin.
    try {
      await apiFetch(`${API_BASE_URL}/auth/logout/`, { method: 'POST' });
    } catch {
      // Tarmoq uzilsa ham foydalanuvchini local sessiyadan chiqaramiz.
    }
    // Eski akkauntning saqlash navbatlari/xatolari yangi akkauntga bog'lanmasin.
    resetPatientRecords();
    clearPatientRecords();
    // MUHIM: real klinikada ko'p ma'lumot localStorage'da (eslatma, rentgen, foto va h.k.).
    // Shuning uchun logout'da ularni O'CHIRMAYMIZ — faqat sessiya + keshni tozalaymiz.
    // DEMO klinikada esa hammasini tozalaymiz (keyingi kishiga demo ma'lumot ko'rinmasin).
    const wasDemo = Number(user?.clinicId) === 1;
    setUser(null);
    try {
      const keepPrefs = new Set(['32desk_theme', '32desk_lang', '32desk_sidebar_collapsed']);
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const isOurs = k.startsWith('32desk_') || k.startsWith('dentos_');
        if (!isOurs || keepPrefs.has(k)) continue;
        const isSessionOrCache = k === '32desk_auth_user' || k === 'dentos_created_clinics_auth' || k.startsWith('32desk_apicache_');
        if (wasDemo || isSessionOrCache) toRemove.push(k); // real: faqat sessiya/kesh; demo: hammasi
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  // Demo tugmalari — FAQAT direktor va texnik. Haqiqiy backend akkauntiga kiradi
  // (DEMO_LOGINS). Bypass yo'q; backend ulanmasa yoki rad etsa — xato qaytaradi.
  const switchRole = async (role: UserRole) => {
    const creds = DEMO_LOGINS[role];
    if (!creds) throw new Error('Demo mavjud emas');
    const ok = await login(creds.username, creds.pass);
    if (!ok) throw new Error('Demo akkauntga kirish amalga oshmadi (backend tekshiring)');
  };

  return (
    <AuthContext.Provider value={{ user, isInitialized, login, loginWithBackendUser, logout, switchRole, updateCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
