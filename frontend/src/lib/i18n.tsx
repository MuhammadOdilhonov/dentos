'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { translate, translateRaw } from './locales';

export type Language = 'uz' | 'ru' | 'en';

export interface Translations {
  // Nav
  dashboard: string;
  appointments: string;
  patients: string;
  warehouse: string;
  reports: string;
  tasks: string;
  laboratory: string;
  naryads: string;
  pulse: string;
  help: string;
  settings: string;

  // Header
  searchPlaceholder: string;
  today: string;
  addPatient: string;
  notifications: string;
  logout: string;
  switchRole: string;
  themeToggle: string;

  // Auth & Roles
  loginTitle: string;
  loginSubtitle: string;
  usernameLabel: string;
  passwordLabel: string;
  loginButton: string;
  quickLoginLabel: string;
  loginError: string;
  roleDirector: string;
  roleAdmin: string;
  roleKassa: string;
  roleDoctor: string;

  // Dashboard & KPIs
  totalRevenue: string;
  todayVisits: string;
  newPatients: string;
  netProfit: string;
  patientDebts: string;
  doctorKpiTitle: string;
  popularServices: string;
  liveMonitor: string;
  stockAlerts: string;
  labPipeline: string;
  monthlyRevenue: string;
  completedVisits: string;
  monthlyTarget: string;
  paymentBreakdown: string;
  averageCheck: string;
  retentionRate: string;
  roomOccupancy: string;
  quickActions: string;
  exportExcel: string;
  overview: string;
  staffManagement: string;

  // Staff Management
  addEmployee: string;
  allStaff: string;
  doctors: string;
  nurses: string;
  admins: string;
  cashiers: string;
  fullName: string;
  specialty: string;
  role: string;
  phone: string;
  cabinetChair: string;
  salaryRate: string;
  schedule: string;
  activeStatus: string;
  vacationStatus: string;
  enterName: string;
  saveEmployee: string;

  // Calendar & Schedule
  dayView: string;
  threeDaysView: string;
  weekView: string;
  monthView: string;
  byEmployees: string;
  byChairs: string;
  time: string;
  bookSlot: string;
  appointmentDetails: string;
  newAppointment: string;
  patient: string;
  doctor: string;
  service: string;
  duration: string;
  chair: string;
  price: string;
  paid: string;
  debt: string;
  paymentMethod: string;
  cash: string;
  card: string;
  transfer: string;
  insurance: string;
  smsNotification: string;
  inRoom: string;
  waiting: string;
  print: string;
  filters: string;

  // Statuses
  statusConfirmed: string;
  statusInProgress: string;
  statusCompleted: string;
  statusDebt: string;
  statusReserved: string;
  statusCancelled: string;

  // Actions & Common
  save: string;
  cancel: string;
  edit: string;
  delete: string;
  search: string;
  date: string;
  status: string;
  sum: string;
  actions: string;
  yes: string;
  no: string;
  male: string;
  female: string;
  birthDate: string;
  gender: string;
  comments: string;
}

// Barcha tarjima matnlari lib/locales/ ichida (uz.ts / ru.ts / en.ts):
//   dict  -> eski t.xxx lug'ati (Translations)
//   tk    -> tk('key') registri

// Eski `t.xxx` lug'ati — endi locale fayldagi `dict` namespace'dan olinadi.
export function dictFor(language: Language): Translations {
  return (translateRaw('dict', language) as Translations) || (translateRaw('dict', 'ru') as Translations);
}

// tk('key') — matn lib/locales/<lang>.ts dagi `tk` bo'limidan (uz/ru/en o'z faylida).
// Yangi matn: uchala faylning `tk` bo'limiga 1 qatordan qo'shing.
export function tkey(key: string, language: Language): string {
  const v = translateRaw('tk.' + key, language);
  return typeof v === 'string' ? v : key;
}

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
  tk: (key: string) => string;
  // Yangi markaziy tarjima: tr('warehouse.title') — lib/locales/ dagi uz/ru/en dan oladi
  tr: (key: string) => string;
  trRaw: (key: string) => any;  // massiv / obyekt qaytarish uchun (FAQ va h.k.)
}

const I18nContext = createContext<I18nContextType>({
  language: 'ru',
  setLanguage: () => {},
  t: dictFor('ru'),
  tk: (k) => tkey(k, 'ru'),
  tr: (k) => translate(k, 'ru'),
  trRaw: (k) => translateRaw(k, 'ru')
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ru');

  useEffect(() => {
    const handleSync = () => {
      try {
        const stored = localStorage.getItem('32desk_lang') as Language;
        if (stored && ['uz', 'ru', 'en'].includes(stored)) {
          setLanguageState(stored);
        }
      } catch {}
    };

    handleSync();
    window.addEventListener('storage', handleSync);
    window.addEventListener('32desk_lang_changed', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('32desk_lang_changed', handleSync);
    };
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('32desk_lang', lang);
      window.dispatchEvent(new Event('32desk_lang_changed'));
    } catch {}
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t: dictFor(language), tk: (k: string) => tkey(k, language), tr: (k: string) => translate(k, language), trRaw: (k: string) => translateRaw(k, language) }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
