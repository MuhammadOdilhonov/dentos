'use client';

import React, { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function PhotoProtocolRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const patientId = searchParams.get('patientId');
    if (patientId) {
      router.replace(`/patients?tab=foto&patientId=${patientId}`);
    } else {
      router.replace('/patients?tab=foto');
    }
  }, [router, searchParams]);

  return (
    <div className="p-12 text-center text-sm font-semibold text-slate-400 flex flex-col items-center justify-center space-y-2">
      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <span>Bemorlar fotoprotokoliga yo‘naltirilmoqda...</span>
    </div>
  );
}

export default function PhotoProtocolPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Yuklanmoqda...</div>}>
      <PhotoProtocolRedirect />
    </Suspense>
  );
}
