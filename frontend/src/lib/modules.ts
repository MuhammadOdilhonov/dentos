// ──────────────────────────────────────────────────────────────────────────
// Klinika MODULLARI — yagona manba (superadmin boshqaradi).
//
// Superadmin modulni O'CHIRSA — u klinika foydalanuvchilaridan BUTUNLAY yo'qoladi:
//   • sidebardan menyu punkti ketadi (navKeys)
//   • to'g'ridan-to'g'ri URL bilan kirsa ham route guard qaytaradi (routes)
//   • sahifa ichidagi tegishli funksiyalar yashiriladi (isModuleEnabled bilan)
//
// Modul faqat ANIQ `false` bo'lsagina bloklanadi. Belgilanmagan (undefined) =
// yoqilgan (yangi klinikalar hamma narsaga ega bo'ladi, keyin superadmin cheklaydi).
// Superadmin har doim hamma narsani ko'radi (modules === undefined).
// ──────────────────────────────────────────────────────────────────────────

import type { AuthUser } from './auth';

export interface ClinicModuleDef {
  key: string;
  label: string; // uz — superadmin paneli uchun
  desc: string;
  navKeys: string[]; // shu modulga bog'liq sidebar nav kalitlari
  routes: string[]; // shu modulga bog'liq route prefikslari (guard uchun)
  group: 'core' | 'comms' | 'smart';
}

export const CLINIC_MODULES: ClinicModuleDef[] = [
  {
    key: 'lab',
    label: 'Zubnoy laboratoriya',
    desc: 'Naryadlar, protez buyurtmalari va texnik taqvimi',
    navKeys: ['lab', 'naryads'],
    routes: ['/lab', '/naryads'],
    group: 'core',
  },
  {
    key: 'warehouse',
    label: 'Omborxona',
    desc: 'Materiallar, qoldiq va sotuvlar',
    navKeys: ['warehouse'],
    routes: ['/warehouse'],
    group: 'core',
  },
  {
    key: 'reports',
    label: 'Hisobot & moliya',
    desc: 'Kassa, tushum/xarajat va moliyaviy tahlil',
    navKeys: ['reports'],
    routes: ['/reports'],
    group: 'core',
  },
  {
    key: 'tasks',
    label: 'Vazifalar',
    desc: 'Xodimlarga topshiriqlar va nazorat',
    navKeys: ['tasks'],
    routes: ['/tasks'],
    group: 'core',
  },
  {
    key: 'pulse',
    label: 'Klinika pulsi',
    desc: 'Jonli monitoring va ko‘rsatkichlar paneli',
    navKeys: ['pulse'],
    routes: ['/pulse'],
    group: 'core',
  },
  {
    key: 'charts_3d',
    label: '3D tish formulasi, Rentgen & Skan',
    desc: 'Bemor kartasidagi rentgen, 3D skan va grafik tish modeli',
    navKeys: ['patients_rentgen', 'patients_skan'],
    routes: [],
    group: 'core',
  },
  {
    key: 'chairs',
    label: 'Kreslolar boshqaruvi',
    desc: 'Xonalar va kreslolar taqsimoti',
    navKeys: [],
    routes: [],
    group: 'core',
  },
  {
    key: 'commissions',
    label: 'Shifokor komissiyasi',
    desc: 'Avtomatik foiz hisob-kitobi va shifokor maoshi',
    navKeys: [],
    routes: [],
    group: 'core',
  },
  {
    key: 'sms',
    label: 'SMS eslatmalar',
    desc: 'Qabuldan oldin avtomatik SMS',
    navKeys: [],
    routes: [],
    group: 'comms',
  },
  {
    key: 'telegram',
    label: 'Telegram bot',
    desc: 'Bemorlar bilan 2 tomonlama Telegram aloqasi',
    navKeys: [],
    routes: [],
    group: 'comms',
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp integratsiyasi',
    desc: 'WhatsApp orqali xabar yuborish',
    navKeys: [],
    routes: [],
    group: 'comms',
  },
  {
    key: 'auto_reminders',
    label: 'Avto-eslatma (aqlli)',
    desc: 'Qabuldan oldin avto-xabar + javobga qarab statusni yangilash',
    navKeys: [],
    routes: [],
    group: 'smart',
  },
  {
    key: 'ai_agent',
    label: 'AI administrator',
    desc: 'Chatda maslahat berish va avtomatik qabulga yozish',
    navKeys: [],
    routes: [],
    group: 'smart',
  },
];

const NAV_TO_MODULE = new Map<string, string>();
CLINIC_MODULES.forEach((m) => m.navKeys.forEach((nav) => NAV_TO_MODULE.set(nav, m.key)));

/** Superadmin — har doim hamma modul ochiq. Klinikada esa faqat aniq `false` bloklangan. */
export function isModuleEnabled(user: AuthUser | null | undefined, key: string): boolean {
  if (!user) return true;
  if (user.role === 'superadmin') return true;
  if (!user.modules) return true; // modul ma'lumoti yo'q — ochiq deb olamiz (offline/eski sessiya)
  return user.modules[key] !== false;
}

/** Sidebar nav kaliti bloklanganmi (shu nav bog'langan modul o'chirilgan bo'lsa). */
export function isNavBlocked(user: AuthUser | null | undefined, navKey: string): boolean {
  const moduleKey = NAV_TO_MODULE.get(navKey);
  if (!moduleKey) return false; // modulga bog'lanmagan nav — doim ko'rinadi
  return !isModuleEnabled(user, moduleKey);
}

/** Route (sahifa) bloklanganmi — URL bilan to'g'ridan-to'g'ri kirishni to'xtatish uchun. */
export function isRouteBlocked(user: AuthUser | null | undefined, pathname: string): boolean {
  if (!user || user.role === 'superadmin' || !user.modules) return false;
  for (const m of CLINIC_MODULES) {
    if (isModuleEnabled(user, m.key)) continue;
    if (m.routes.some((r) => pathname === r || pathname.startsWith(r + '/'))) return true;
  }
  return false;
}
