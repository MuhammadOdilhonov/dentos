'use client';

// Root (layout) darajasidagi xatolar uchun zaxira boundary. error.tsx faqat
// segment render xatosini ushlaydi; layout/providerlardagi xato bu yerga tushadi.
// O'z <html>/<body>ini render qiladi (Next talabi). Maxfiy ma'lumot chiqarmaydi.

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[dentos global error]', error?.name || 'Error', error?.message, error?.digest ? `digest=${error.digest}` : '');
  }, [error]);

  return (
    <html lang="uz">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#070D1E', color: '#e2e8f0' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Tizimda kutilmagan xatolik</h2>
            <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 16px' }}>
              Iltimos sahifani qayta yuklang. Takrorlansa, administratorga xato kodini bildiring.
            </p>
            {error?.digest && <p style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>kod: {error.digest}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button onClick={() => reset()} style={{ background: '#2563eb', color: '#fff', border: 0, borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}>
                Qayta urinish
              </button>
              <button onClick={() => (window.location.href = '/')} style={{ background: 'transparent', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}>
                Bosh sahifa
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
