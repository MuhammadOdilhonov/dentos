'use client';
import { useEffect, useState } from 'react';
import { hasUnsavedRecords, retryPatientRecords } from '../lib/patientRecords';
export default function SaveStatus() {
  const [state, setState] = useState({ pending: 0, failed: 0, error: '' });
  useEffect(() => {
    const update = (event: Event) => setState(old => {
      const detail = (event as CustomEvent).detail || {};
      const next = { ...old, ...detail };
      // Sog'lom holatga qaytganda (faol saqlash yoki hammasi saqlangan, xatosiz)
      // eski xatoni tozalaymiz — stale "saqlanmadi" boshqa sahifada qolib ketmasin.
      if (!('error' in detail) && (next.pending > 0 || next.failed === 0)) {
        next.error = '';
      }
      return next;
    });
    const leave = (event: BeforeUnloadEvent) => { if (hasUnsavedRecords()) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('dentos-save-state', update);
    window.addEventListener('beforeunload', leave);
    return () => { window.removeEventListener('dentos-save-state', update); window.removeEventListener('beforeunload', leave); };
  }, []);
  if (!state.pending && !state.failed && !state.error) return null;
  return <div role="status" className="px-4 py-2 text-sm bg-amber-100 text-amber-950">
    {state.pending ? `Bazaga saqlanmoqda (${state.pending})… ` : ''}
    {state.error && <span>{state.error} </span>}
    {state.failed > 0 && <button className="underline font-bold" onClick={retryPatientRecords}>Qayta saqlash</button>}
    {!state.pending && !state.failed && <button className="ml-3 underline" onClick={() => setState({pending:0, failed:0, error:''})}>Yopish</button>}
  </div>;
}
