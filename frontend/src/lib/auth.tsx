'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
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

// Offline (backend o'chiq) uchun zaxira demo akkauntlar — normal holatda backend ishlatiladi.
export const DEMO_ACCOUNTS: Record<string, { pass: string[]; user: AuthUser }> = {
  superadmin: {
    pass: ['123456', '123'],
    user: { id: '0', username: 'superadmin', name: 'dentOS SuperAdmin', role: 'superadmin', roleLabel: 'SuperAdmin / Platforma', initials: 'DS', clinicName: 'dentOS Platforma' }
  },
  director: {
    pass: ['123456', '123'],
    user: { id: '1', username: 'director', name: 'Jasur Usmonov', role: 'director', roleLabel: 'Direktor / Bosh vrach', initials: 'JU', clinicId: 1, clinicName: '32Desk Toshkent Markaziy' }
  },
  deputy_director: {
    pass: ['123456', '123'],
    user: { id: '15', username: 'deputy_director', name: 'Muzaffar Olimov', role: 'deputy_director', roleLabel: 'Direktor o‘rinbosari / Boshqaruvchi', initials: 'MO', clinicId: 1, clinicName: '32Desk Toshkent Markaziy' }
  },
  admin: {
    pass: ['123456', '123'],
    user: { id: '2', username: 'admin', name: 'Aziza Karimova', role: 'admin', roleLabel: 'Administrator (Markaziy)', initials: 'AK', clinicId: 1, clinicName: '32Desk Toshkent Markaziy', branchId: 1, branchName: 'Toshkent Markaziy filiali' }
  },
  admin_chilonzor: {
    pass: ['123456', '123'],
    user: { id: '21', username: 'admin_chilonzor', name: 'Madina Rahimova', role: 'admin', roleLabel: 'Administrator (Chilonzor)', initials: 'MR', clinicId: 1, clinicName: '32Desk Chilonzor', branchId: 2, branchName: 'Chilonzor filiali' }
  },
  admin_yunusobod: {
    pass: ['123456', '123'],
    user: { id: '22', username: 'admin_yunusobod', name: 'Shoira Ergasheva', role: 'admin', roleLabel: 'Administrator (Yunusobod)', initials: 'SE', clinicId: 1, clinicName: '32Desk Yunusobod', branchId: 3, branchName: 'Yunusobod filiali' }
  },
  kassa: {
    pass: ['123456', '123'],
    user: { id: '3', username: 'kassa', name: 'Dilorom Saidova', role: 'kassa', roleLabel: 'Kassir', initials: 'DS', clinicId: 1, clinicName: '32Desk Toshkent Markaziy', branchId: 1, branchName: 'Toshkent Markaziy filiali' }
  },
  doctor: {
    pass: ['123456', '123'],
    user: { id: '4', username: 'doctor', name: 'Sardor Alimov', role: 'doctor', roleLabel: 'Vrach-Stomatolog', initials: 'SA', clinicId: 1, clinicName: '32Desk Toshkent Markaziy', branchId: 1, branchName: 'Toshkent Markaziy filiali' }
  },
  technician: {
    pass: ['123456', '123'],
    user: { id: '1', username: 'texnik_alisher', name: 'Алишер Каримов', role: 'technician', roleLabel: 'Zubnoy Texnik', initials: 'АК', clinicName: 'Apex Dental Lab' }
  },
  texnik_alisher: {
    pass: ['123456', '123'],
    user: { id: '1', username: 'texnik_alisher', name: 'Алишер Каримов', role: 'technician', roleLabel: 'Zubnoy Texnik', initials: 'АК', clinicName: 'Apex Dental Lab' }
  },
  texnik_farhod: {
    pass: ['123456', '123'],
    user: { id: '2', username: 'texnik_farhod', name: 'Фарход Юсупов', role: 'technician', roleLabel: 'Zubnoy Texnik', initials: 'ФЮ', clinicName: 'MasterDent CAD/CAM Lab' }
  },
  texnik_dilshod: {
    pass: ['123456', '123'],
    user: { id: '3', username: 'texnik_dilshod', name: 'Дилшод Хакимов', role: 'technician', roleLabel: 'Zubnoy Texnik', initials: 'ДХ', clinicName: 'SmileAlign Orto Lab' }
  }
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
  logout: () => void;
  switchRole: (role: UserRole) => Promise<void>;
  updateCurrentUser: (updates: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isInitialized: false,
  login: async () => false,
  loginWithBackendUser: () => {},
  logout: () => {},
  switchRole: async () => {},
  updateCurrentUser: () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('32desk_auth_user');
      if (stored) setUser(JSON.parse(stored));
    } catch {
      setUser(null);
    } finally {
      setIsInitialized(true);
    }
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

  // Avval BACKEND bazasidan tekshiradi; backend o'chiq bo'lsa demo akkauntga tushadi.
  const login = async (username: string, pass: string): Promise<boolean> => {
    const cleanUser = username.trim();
    const cleanPass = pass.trim();

    const backendUser = await clinicApi.platformLogin(cleanUser, cleanPass);
    if (backendUser) {
      persist(mapBackendUser(backendUser));
      return true;
    }

    // Offline zaxira
    const account = DEMO_ACCOUNTS[cleanUser.toLowerCase()];
    if (account && (account.pass.includes(cleanPass) || cleanPass === '123456')) {
      persist(account.user);
      return true;
    }
    return false;
  };

  // SMS/Telegram kod tasdiqlangach backend qaytargan user'ni saqlaydi
  const loginWithBackendUser = (backendUser: any) => {
    persist(mapBackendUser(backendUser));
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem('32desk_auth_user');
    } catch {}
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  // Tez rol tanlash tugmalari — o'sha rol nomi bilan backendga 123456 parol orqali kiradi.
  const switchRole = async (role: UserRole) => {
    const username = role === 'technician' ? 'texnik_alisher' : role;
    const ok = await login(username, '123456');
    if (!ok) {
      const account = DEMO_ACCOUNTS[role];
      if (account) persist(account.user);
    }
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
