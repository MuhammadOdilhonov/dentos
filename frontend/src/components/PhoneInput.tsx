'use client';
// Yagona telefon kiritish komponenti — davlat kodi tanlash (dropdown) + avto-formatlash.
// Saqlanadigan qiymat: "+998 90 000 00 00" ko'rinishida (davlat kodi + guruhlangan raqam).
// Backend baribir faqat raqamlarni oladi (normalize_phone), shuning uchun format muammo tug'dirmaydi.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export type Country = { iso: string; dial: string; flag: string; name: string; groups: number[] };

// Dial kodlari NOYOB (parsing aniq bo'lishi uchun). Milliy raqam guruhlanishi = groups.
export const COUNTRIES: Country[] = [
  { iso: 'UZ', dial: '998', flag: '🇺🇿', name: "O'zbekiston", groups: [2, 3, 2, 2] },
  { iso: 'RU', dial: '7', flag: '🇷🇺', name: 'Rossiya', groups: [3, 3, 2, 2] },
  { iso: 'KG', dial: '996', flag: '🇰🇬', name: "Qirg'iziston", groups: [3, 3, 3] },
  { iso: 'TJ', dial: '992', flag: '🇹🇯', name: 'Tojikiston', groups: [2, 3, 2, 2] },
  { iso: 'TM', dial: '993', flag: '🇹🇲', name: 'Turkmaniston', groups: [2, 2, 2, 2] },
  { iso: 'AZ', dial: '994', flag: '🇦🇿', name: 'Ozarbayjon', groups: [2, 3, 2, 2] },
  { iso: 'TR', dial: '90', flag: '🇹🇷', name: 'Turkiya', groups: [3, 3, 2, 2] },
  { iso: 'UA', dial: '380', flag: '🇺🇦', name: 'Ukraina', groups: [2, 3, 2, 2] },
  { iso: 'BY', dial: '375', flag: '🇧🇾', name: 'Belarus', groups: [2, 3, 2, 2] },
];

const DIAL_SORTED = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
const DEFAULT = COUNTRIES[0];

const maxLen = (c: Country) => c.groups.reduce((s, n) => s + n, 0);

export function formatNational(country: Country, national: string): string {
  const out: string[] = [];
  let i = 0;
  for (const g of country.groups) {
    if (i >= national.length) break;
    out.push(national.slice(i, i + g));
    i += g;
  }
  if (i < national.length) out.push(national.slice(i));
  return out.join(' ');
}

// Saqlangan qiymatni (yoki bo'shni) davlat + milliy raqamga ajratadi.
export function parsePhone(value: string): { country: Country; national: string } {
  const digits = (value || '').replace(/\D/g, '');
  if (digits) {
    for (const c of DIAL_SORTED) {
      if (digits.startsWith(c.dial)) {
        return { country: c, national: digits.slice(c.dial.length).slice(0, maxLen(c)) };
      }
    }
  }
  return { country: DEFAULT, national: digits.slice(0, maxLen(DEFAULT)) };
}

export function buildPhone(country: Country, national: string): string {
  const nat = national.replace(/\D/g, '').slice(0, maxLen(country));
  return nat ? `+${country.dial} ${formatNational(country, nat)}` : `+${country.dial} `;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
};

export default function PhoneInput({ value, onChange, id, disabled, required, autoFocus, placeholder, className }: Props) {
  const parsed = parsePhone(value);
  const [country, setCountry] = useState<Country>(parsed.country);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Tashqi qiymat davlati o'zgarsa (masalan, forma yangi ma'lumot yuklaganda) — moslaymiz.
  useEffect(() => {
    if (value && parsed.country.iso !== country.iso && parsed.national) {
      setCountry(parsed.country);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const national = parsePhone(value).national;

  const pickCountry = (c: Country) => {
    setCountry(c);
    setOpen(false);
    onChange(buildPhone(c, national));
  };

  const onType = (raw: string) => {
    const nat = raw.replace(/\D/g, '').slice(0, maxLen(country));
    onChange(buildPhone(country, nat));
  };

  const base = className ||
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white';

  return (
    <div ref={boxRef} className={`relative flex items-center ${base} focus-within:ring-2 focus-within:ring-sky-500`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 pl-3 pr-2 py-3 shrink-0 text-sm font-semibold disabled:opacity-50"
      >
        <span className="text-base leading-none">{country.flag}</span>
        <span>+{country.dial}</span>
        <ChevronDown size={14} className="opacity-60" />
      </button>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        value={formatNational(country, national)}
        onChange={(e) => onType(e.target.value)}
        placeholder={placeholder || formatNational(country, '0'.repeat(maxLen(country)))}
        className="flex-1 min-w-0 bg-transparent pr-3 py-3 outline-none"
      />
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-60 max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1">
          {COUNTRIES.map((c) => (
            <button
              key={c.iso}
              type="button"
              onClick={() => pickCountry(c)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${c.iso === country.iso ? 'bg-sky-50 dark:bg-sky-950/40 font-semibold' : ''}`}
            >
              <span className="text-base leading-none">{c.flag}</span>
              <span className="flex-1 text-slate-700 dark:text-slate-200">{c.name}</span>
              <span className="text-slate-400">+{c.dial}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
