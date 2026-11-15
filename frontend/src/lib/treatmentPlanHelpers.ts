/**
 * Helpers for localized Treatment Plan titles, variants, and stages.
 * If user hasn't explicitly customized the name, it automatically adapts
 * to the currently selected application language (uz, ru, en).
 * If user entered a custom name, their custom string is preserved.
 */

export function getLocalizedPlanTitle(title: string | undefined | null, lang: string): string {
  if (!title || !title.trim()) {
    return lang === 'uz' ? 'Nomsiz reja' : lang === 'en' ? 'Untitled plan' : 'Без названия';
  }
  const t = title.trim().toLowerCase();
  const defaultTitles = [
    'без названия',
    'nomsiz reja',
    'untitled plan',
    'kompleks davolash',
    'комплексное лечение',
    'comprehensive treatment'
  ];
  if (defaultTitles.includes(t)) {
    return lang === 'uz' ? 'Nomsiz reja' : lang === 'en' ? 'Untitled plan' : 'Без названия';
  }
  return title;
}

export function getLocalizedVariantName(name: string | undefined | null, fallbackIndex: number, lang: string): string {
  if (!name || !name.trim()) {
    return lang === 'uz' ? `${fallbackIndex}-variant` : lang === 'en' ? `Variant ${fallbackIndex}` : `Вариант ${fallbackIndex}`;
  }
  const trimmed = name.trim();
  const match = trimmed.match(/^(?:вариант\s*(\d+)|(\d+)-variant|variant\s*(\d+))$/i);
  if (match) {
    const num = match[1] || match[2] || match[3] || String(fallbackIndex);
    return lang === 'uz' ? `${num}-variant` : lang === 'en' ? `Variant ${num}` : `Вариант ${num}`;
  }
  return name;
}

export function getLocalizedStageTitle(title: string | undefined | null, fallbackIndex: number, lang: string): string {
  if (!title || !title.trim()) {
    return lang === 'uz' ? `Bosqich ${fallbackIndex}` : lang === 'en' ? `Stage ${fallbackIndex}` : `Этап ${fallbackIndex}`;
  }
  const trimmed = title.trim();
  const match = trimmed.match(/^(?:этап\s*(\d+)|(\d+)-bosqich|bosqich\s*(\d+)|stage\s*(\d+))$/i);
  if (match) {
    const num = match[1] || match[2] || match[3] || match[4] || String(fallbackIndex);
    return lang === 'uz' ? `Bosqich ${num}` : lang === 'en' ? `Stage ${num}` : `Этап ${num}`;
  }
  return title;
}
