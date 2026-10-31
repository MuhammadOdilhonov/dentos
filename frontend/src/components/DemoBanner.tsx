'use client';

import React, { useState, useEffect } from 'react';
import { isDemoClinic } from '../lib/api';
import { useAuth } from '../lib/auth';

// Demo rejimda tepada ko'rinadigan ingichka ogohlantirish qatori.
// Matn 3 tilda (uz/ru/en) karusel kabi aylanib turadi — "ma'lumotlar saqlanmaydi".
const MESSAGES = [
  "⚠️ Demo versiya — kiritilgan ma'lumotlar saqlanmaydi (faqat namoyish). To'liq versiya uchun biz bilan bog'laning.",
  "⚠️ Демо-версия — введённые данные не сохраняются (только показ). Для полной версии свяжитесь с нами.",
  "⚠️ Demo version — entered data is not saved (preview only). Contact us for the full version.",
];

export default function DemoBanner() {
  const { user, isInitialized } = useAuth();
  const [idx, setIdx] = useState(0);

  // Demo sessiyasi: demo klinika (#1) yoki demo texnik akkaunti.
  const isDemo = isInitialized && !!user && (isDemoClinic() || user.role === 'technician');

  useEffect(() => {
    if (!isDemo) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % MESSAGES.length), 3800);
    return () => clearInterval(t);
  }, [isDemo]);

  if (!isDemo) return null;

  return (
    <div className="w-full shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white overflow-hidden shadow-sm">
      <div className="relative h-8">
        {MESSAGES.map((m, i) => (
          <span
            key={i}
            className={`absolute inset-0 flex items-center justify-center px-4 text-[11px] sm:text-xs font-bold tracking-wide text-center transition-all duration-700 ease-out ${
              i === idx ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3 pointer-events-none'
            }`}
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}
