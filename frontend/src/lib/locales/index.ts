// Markaziy tarjima registri — barcha tillar shu yerda (uz / ru / en),
// har bir tsx fayl o'z bo'limi (namespace) bilan.
//
// Ishlatish (komponentda):
//   const { tr } = useI18n();
//   tr('warehouse.title')          // joriy tilda matn
//
// Yangi matn qo'shish: uz.ts / ru.ts / en.ts ichidagi tegishli bo'limga 1 qatordan qo'shing.
import { uz } from './uz';
import { ru } from './ru';
import { en } from './en';
import type { Language } from '../i18n';

export const LOCALES = { uz, ru, en } as const;

// Xom qiymatni (string / massiv / obyekt) qaytaradi — FAQ massivlari va h.k. uchun
export function translateRaw(key: string, lang: Language): any {
  const dict: any = (LOCALES as any)[lang] || LOCALES.ru;
  const val = key.split('.').reduce((acc: any, part) => (acc == null ? acc : acc[part]), dict);
  if (val != null) return val;
  for (const l of ['uz', 'ru', 'en'] as Language[]) {
    const alt: any = key.split('.').reduce((acc: any, part) => (acc == null ? acc : acc[part]), (LOCALES as any)[l]);
    if (alt != null) return alt;
  }
  return undefined;
}

// "warehouse.title" → LOCALES[lang].warehouse.title (faqat matn)
export function translate(key: string, lang: Language): string {
  const val = translateRaw(key, lang);
  return typeof val === 'string' ? val : key;
}
