import React, { useEffect, useState, useRef } from 'react';
// MUHIM: `qrcode` FAQAT klientда, kerak bo'lganda dinamik yuklanadi (pastdagi useEffect).
// Yuqorida statik import qilinsa — u server bundle'ga tortiladi va Next dev ba'zan
// `vendor-chunks/qrcode.js` ni topolmay BUTUN sahifaga 500 beradi (bemor sahifasi
// shu modalni import qilgani uchun). Dinamik import bu muammoni butunlay yo'qotadi.
import {
  Printer,
  X,
  CheckCircle2,
  Copy,
  Check,
  QrCode,
  User,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  MapPin
} from 'lucide-react';
import { DentalLabOrder } from '../lib/types';
import { useI18n } from '../lib/i18n';

interface LabOrderReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Partial<DentalLabOrder>;
  onDispatchNext?: () => void;
  isTechnicianView?: boolean;
}

export default function LabOrderReceiptModal({
  isOpen,
  onClose,
  order,
  onDispatchNext,
  isTechnicianView = false
}: LabOrderReceiptModalProps) {
  const { language, tr } = useI18n();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [showFullDetails, setShowFullDetails] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const orderNum = order.order_number || (order.id ? `LAB-${order.id}` : 'LAB-0000');
  const patientFullName = order.patient_name || tr('labreceipt2.noPatientName');

  useEffect(() => {
    if (!isOpen) return;

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const qrPayload = `${baseUrl}/technician?order=${encodeURIComponent(orderNum)}`;

    let cancelled = false;
    (async () => {
      try {
        const QRCode = (await import('qrcode')).default;
        const url = await QRCode.toDataURL(qrPayload, {
          width: 320,
          margin: 1,
          color: { dark: '#0f172a', light: '#ffffff' },
          errorCorrectionLevel: 'H'
        });
        if (!cancelled) setQrDataUrl(url);
      } catch (err) {
        console.error('QR generation error:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, orderNum]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const link = `${baseUrl}/technician?order=${encodeURIComponent(orderNum)}`;
    const copyText = `${patientFullName}\n${orderNum}\n${link}`;
    navigator.clipboard.writeText(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };



  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto">
        
        {/* Modal Top Bar (Hidden on print) */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center font-black text-sm">
              32
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight leading-none">{tr('labreceipt2.title')}</h3>
              <p className="text-[10px] text-blue-100 font-mono mt-0.5">{orderNum}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            PRINTABLE QR CARD (EXACT LAYOUT FROM 3-RASM)
            1. TOP: Ф.И.О пациента
            2. MIDDLE: Large QR Code
            3. BOTTOM: Nomerovka
        ═══════════════════════════════════════════════════════════ */}
        <div className="p-6 text-slate-900 dark:text-white" ref={printRef} id="dental-receipt-print-area">
          <div className="qr-slip-card border-2 border-slate-800 dark:border-slate-300 rounded-2xl p-5 flex flex-col items-center justify-between space-y-4 bg-white dark:bg-slate-900 shadow-sm">
            
            {/* 0. BRANCH HEADER: Location icon & originating branch name */}
            <div className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-black">
              <MapPin className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{order.branch_name || 'Toshkent Markaziy'}</span>
              {order.destination_branch_name && order.destination_branch_name !== order.branch_name && (
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">➔ {order.destination_branch_name}</span>
              )}
            </div>

            {/* 1. TOP BOX: Ф.И.О. пациента */}
            <div className="w-full border-2 border-slate-700 dark:border-slate-400 rounded-xl p-3 text-center bg-slate-50 dark:bg-slate-800/80">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-0.5">
                {tr('labreceipt2.patientHeader')}
              </span>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white break-words">
                {patientFullName}
              </h2>
            </div>

            {/* 2. CENTER BOX: Katta QR-kod */}
            <div className="w-full border-2 border-slate-700 dark:border-slate-400 rounded-xl p-3 flex flex-col items-center justify-center bg-white dark:bg-slate-800/60 min-h-[220px]">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR Code ${orderNum}`}
                  className="w-52 h-52 sm:w-56 sm:h-56 object-contain rounded-lg"
                />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-slate-400 font-bold text-sm">
                  QR...
                </div>
              )}
            </div>

            {/* 3. BOTTOM BOX: Nomerovka */}
            <div className="w-full border-2 border-slate-700 dark:border-slate-400 rounded-xl p-3 text-center bg-slate-50 dark:bg-slate-800/80">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-0.5">
                {tr('labreceipt2.nomerovka')}
              </span>
              <div className="text-xl sm:text-2xl font-black font-mono tracking-wider text-blue-600 dark:text-sky-400">
                {orderNum}
              </div>
            </div>

          </div>

          {/* Optional Collapsible Order Details (No-Print by default) */}
          <div className="mt-4 no-print border-t border-slate-100 dark:border-slate-800 pt-3">
            <button
              type="button"
              onClick={() => setShowFullDetails(!showFullDetails)}
              className="w-full flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 transition py-1"
            >
              <span>{tr('labreceipt2.detailsToggle')}</span>
              {showFullDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showFullDetails && (
              <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5 animate-in fade-in">
                <div className="flex justify-between">
                  <span className="text-slate-500">{tr('labreceipt2.doctor')}:</span>
                  <span className="font-bold">{order.doctor_name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{tr('labreceipt2.technician')}:</span>
                  <span className="font-bold text-blue-600 dark:text-sky-400">{order.technician_name || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{tr('labreceipt2.teeth')}:</span>
                  <span className="font-mono font-bold">#{order.tooth_numbers || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{tr('labreceipt2.shade')}:</span>
                  <span className="font-mono font-bold text-amber-600">{order.color_shade || 'A2'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{tr('labreceipt2.workType')}:</span>
                  <span className="font-bold">{order.work_type || '—'}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Bottom Actions (Hidden on print) */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 no-print">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition"
          >
            {tr('labreceipt2.close')}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-800 dark:text-white shadow-2xs hover:bg-slate-100 dark:hover:bg-slate-600 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copied ? tr('labreceipt2.copiedBtn') : tr('labreceipt2.copyBtn')}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition"
            >
              <Printer className="w-4 h-4" />
              <span>{tr('labreceipt2.printBtn')}</span>
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #dental-receipt-print-area,
          #dental-receipt-print-area * {
            visibility: visible;
          }
          #dental-receipt-print-area {
            position: absolute;
            left: 50%;
            top: 20px;
            transform: translateX(-50%);
            width: 100%;
            max-width: 380px;
            padding: 0;
            background: white !important;
            color: black !important;
          }
          .qr-slip-card {
            border: 2px solid #000 !important;
            box-shadow: none !important;
            page-break-inside: avoid;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
