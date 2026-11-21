'use client';

import React, { useRef } from 'react';
import { X, Download, Printer } from 'lucide-react';

// Hisob-faktura / hisob-kitob chop etish modali (32desk "Печать" uslubida).
// To'lovlar tabidan ochiladi: bemorning barcha hisob/to'lovlarini A4 hujjat
// ko'rinishida ko'rsatadi, "Chop etish" (printer / PDF saqlash) imkoni bilan.

export interface SettlementLine {
  date: string;          // "08.06.2026 14:48"
  title: string;         // xizmat nomi yoki amal
  qty?: number;
  amount: number;        // hisoblangan (charge) summasi
  paid?: number;         // to'langan qism
  kind: 'charge' | 'payment' | 'avans';
}

interface SettlementPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  clinicName: string;
  clinicPhone?: string;
  clinicAddress?: string;
  patientName: string;
  patientPhone?: string;
  lines: SettlementLine[];
  totalCharged: number;
  totalPaid: number;
  debt: number;           // joriy qarz (musbat son)
}

export default function SettlementPrintModal({
  isOpen,
  onClose,
  clinicName,
  clinicPhone,
  clinicAddress,
  patientName,
  patientPhone,
  lines,
  totalCharged,
  totalPaid,
  debt,
}: SettlementPrintModalProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmt = (n: number) => n.toLocaleString('ru-RU');
  // Faqat hisob (xizmat) qatorlari — jadvalda ko'rsatiladi (to'lov/avans alohida jamda)
  const serviceLines = lines.filter((l) => l.kind === 'charge');

  const handlePrint = () => {
    const printArea = printAreaRef.current;
    if (!printArea) { window.print(); return; }
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeDoc) { window.print(); return; }

      const styleNodes: string[] = [];
      document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => styleNodes.push(link.outerHTML));
      document.querySelectorAll('style').forEach((style) => {
        const text = style.innerHTML || '';
        if (!text.includes('visibility: hidden') && !text.includes('visibility:hidden')) styleNodes.push(style.outerHTML);
      });

      iframeDoc.open();
      iframeDoc.write(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <base href="${window.location.origin}">
  <title>Hisob-faktura — ${patientName}</title>
  ${styleNodes.join('\n')}
  <style>
    @page { size: A4 portrait; margin: 12mm 12mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box !important; visibility: visible !important; }
    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; color: #0f172a !important; width: 100% !important; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif !important; }
    #stl-print { width: 100% !important; background: #fff !important; }
  </style>
</head>
<body>
  <div id="stl-print">${printArea.innerHTML}</div>
</body>
</html>`);
      iframeDoc.close();

      const cleanup = () => { try { if (document.body.contains(iframe)) document.body.removeChild(iframe); } catch {} };
      if (iframe.contentWindow) iframe.contentWindow.onafterprint = cleanup;
      setTimeout(cleanup, 60000);
      setTimeout(() => {
        try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
        catch { window.print(); }
      }, 300);
    } catch { window.print(); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-3xl my-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden border border-slate-200 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
        {/* Modal boshqaruvi (chop etilmaydi) */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850 shrink-0">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Hisob-faktura · chop etish / PDF</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hujjat (A4) — chop etiladigan qism */}
        <div className="overflow-y-auto p-6 bg-slate-100 dark:bg-slate-950">
          <div ref={printAreaRef} className="bg-white text-slate-900 mx-auto p-8 rounded-lg shadow-sm" style={{ maxWidth: '190mm' }}>
            {/* Header: klinika + hisob */}
            <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
              <div>
                <div className="w-14 h-14 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-lg">
                  {clinicName.slice(0, 2).toUpperCase()}
                </div>
              </div>
              <div className="text-right">
                <h1 className="text-lg font-black text-slate-900">{clinicName}</h1>
                {clinicAddress && <p className="text-xs text-slate-600 mt-1">{clinicAddress}</p>}
                {clinicPhone && <p className="text-xs text-slate-600 mt-0.5">{clinicPhone}</p>}
              </div>
            </div>

            {/* Hisob № / sana + bemor */}
            <div className="flex items-start justify-between mt-4">
              <div>
                <p className="text-[11px] text-slate-400">Hisob-faktura</p>
                <p className="text-sm font-bold text-slate-700">{today}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide">Hisob kim uchun</p>
                <p className="text-sm font-black text-slate-900">{patientName}</p>
                {patientPhone && <p className="text-xs text-slate-500">{patientPhone}</p>}
              </div>
            </div>

            {/* Xizmatlar jadvali */}
            <table className="w-full mt-5 text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-left border-y border-slate-200">
                  <th className="py-2 px-2 font-bold">SANA</th>
                  <th className="py-2 px-2 font-bold">XIZMAT / AMAL</th>
                  <th className="py-2 px-2 font-bold text-right">SUMMA</th>
                  <th className="py-2 px-2 font-bold text-right">TO‘LANGAN</th>
                </tr>
              </thead>
              <tbody>
                {serviceLines.length === 0 ? (
                  <tr><td colSpan={4} className="py-4 px-2 text-center text-slate-400">Hisob yozuvlari yo‘q</td></tr>
                ) : serviceLines.map((l, i) => (
                  <tr key={i} className="border-b border-slate-100 align-top">
                    <td className="py-2 px-2 text-slate-500 whitespace-nowrap">{l.date}</td>
                    <td className="py-2 px-2 text-slate-800">{l.title || '—'}</td>
                    <td className="py-2 px-2 text-right font-mono text-slate-800">{fmt(l.amount)}</td>
                    <td className="py-2 px-2 text-right font-mono text-emerald-700">{l.paid ? fmt(l.paid) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Jamlar */}
            <div className="mt-5 flex justify-end">
              <div className="w-72 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Jami hisoblangan</span>
                  <span className="font-bold font-mono text-slate-900">{fmt(totalCharged)} so‘m</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Jami to‘langan</span>
                  <span className="font-bold font-mono text-emerald-700">{fmt(totalPaid)} so‘m</span>
                </div>
                <div className="flex items-center justify-between pt-2 mt-1 border-t-2 border-slate-800">
                  <span className="font-black text-slate-900">{debt > 0 ? 'QOLGAN QARZ' : 'QARZ YO‘Q'}</span>
                  <span className={`font-black font-mono text-base ${debt > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {debt > 0 ? `${fmt(debt)} so‘m` : '0 so‘m'}
                  </span>
                </div>
              </div>
            </div>

            <p className="mt-6 text-[10px] text-slate-400">Narxlar QQS hisobga olingan holda. Ushbu hujjat {clinicName} tomonidan berildi.</p>
          </div>
        </div>

        {/* Pastki boshqaruv tugmalari (chop etilmaydi) */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
            Yopish
          </button>
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition">
            <Download className="w-4 h-4" /> PDF saqlash
          </button>
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm">
            <Printer className="w-4 h-4" /> Chop etish
          </button>
        </div>
      </div>
    </div>
  );
}
