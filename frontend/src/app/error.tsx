'use client';

// App Router segment error boundary. SSR yoki klient render xatosida (masalan sovuq
// start /dashboard 500) butun oq ekran o'rniga tiklanadigan UI ko'rsatadi va xato
// DIGEST'ini loglaydi — digest serverdagi to'liq stack bilan mos keladi, maxfiy
// ma'lumot (token/parol/stack) foydalanuvchiga chiqmaydi. "Qayta urinish" reset() bilan
// segmentni qayta render qiladi; "Bosh sahifa" to'liq qayta yuklaydi (eski chunk/RSC
// mos kelmasligi — ChunkLoadError — ham shu yerdan tuziladi).

import { useEffect } from 'react';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const isChunk = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported/i.test(error?.message || '');
    // eslint-disable-next-line no-console
    console.error('[dentos route error]', error?.name || 'Error', error?.message, error?.digest ? `digest=${error.digest}` : '', isChunk ? '(chunk)' : '');
  }, [error]);

  const isChunk = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported/i.test(error?.message || '');

  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
          {isChunk ? 'Sahifa yangilandi' : 'Bu bo‘limni ochishda xatolik'}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {isChunk
            ? 'Ilova yangilangan — iltimos sahifani qayta yuklang.'
            : 'Vaqtinchalik xatolik yuz berdi. Qayta urinib ko‘ring.'}
        </p>
        {error?.digest && (
          <p className="mt-2 text-[11px] text-slate-400 font-mono">kod: {error.digest}</p>
        )}
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            onClick={() => (isChunk ? window.location.reload() : reset())}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 active:scale-95 transition"
          >
            {isChunk ? 'Qayta yuklash' : 'Qayta urinish'}
          </button>
          <button
            onClick={() => (window.location.href = '/')}
            className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition"
          >
            Bosh sahifa
          </button>
        </div>
      </div>
    </div>
  );
}
