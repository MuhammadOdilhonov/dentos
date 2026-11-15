'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  Printer,
  Download,
  Building2,
  Sliders
} from 'lucide-react';
import { TreatmentPlan, Patient, Branch, TreatmentProcedureItem, TreatmentPlanStage } from '../lib/types';
import { useI18n } from '../lib/i18n';
import DentalToothSvg from './DentalToothSvg';
import ToothIcon from './ToothIcon';
import { getLocalizedStageTitle, getLocalizedPlanTitle } from '../lib/treatmentPlanHelpers';

export interface TreatmentPlanPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: TreatmentPlan;
  patient: Patient;
  branch?: Branch | null;
  clinicLogo?: string;
  clinicName?: string;
  customPrintNote?: string;
}

const ADULT_UPPER_LEFT = ['18', '17', '16', '15', '14', '13', '12', '11'];
const ADULT_UPPER_RIGHT = ['21', '22', '23', '24', '25', '26', '27', '28'];
const ADULT_LOWER_LEFT = ['48', '47', '46', '45', '44', '43', '42', '41'];
const ADULT_LOWER_RIGHT = ['31', '32', '33', '34', '35', '36', '37', '38'];

const CHILD_UPPER_LEFT = ['55', '54', '53', '52', '51'];
const CHILD_UPPER_RIGHT = ['61', '62', '63', '64', '65'];
const CHILD_LOWER_LEFT = ['85', '84', '83', '82', '81'];
const CHILD_LOWER_RIGHT = ['71', '72', '73', '74', '75'];

const DEFAULT_AGREEMENT_TEXT =
  'С планом лечения ознакомлен и согласен. Мне понятен план, объем лечения, возможные осложнения на всех этапах лечения, возможность возникновения дополнительного обследования, изменение сроков лечения, дополнительной оплаты. Я получил ответы на все вопросы относительно предстоящего лечения и доверяю квалификации врачей. Цены действительны в течение 180 дней с момента проведенной консультации.';

function formatTeethLabel(teethStr?: string, lang?: string): { isGeneral: boolean; label: string } {
  if (!teethStr || !teethStr.trim()) {
    return {
      isGeneral: true,
      label: lang === 'uz' ? 'Umumiy' : lang === 'en' ? 'General' : 'Общие'
    };
  }
  const list = teethStr
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .sort((a, b) => Number(a) - Number(b));

  if (list.length === 0) {
    return {
      isGeneral: true,
      label: lang === 'uz' ? 'Umumiy' : lang === 'en' ? 'General' : 'Общие'
    };
  }
  if (list.length >= 32) {
    return {
      isGeneral: false,
      label: lang === 'uz' ? 'Barcha 32 tish' : lang === 'en' ? 'All 32 teeth' : 'Все 32 зуба'
    };
  }
  const tishWord = lang === 'uz' ? 'tish' : lang === 'en' ? 'teeth' : 'зуб';
  if (list.length > 4) {
    return {
      isGeneral: false,
      label: `№ ${list.slice(0, 3).join(', ')}... (${list.length} ${tishWord})`
    };
  }
  return {
    isGeneral: false,
    label: `№ ${list.join(', ')}`
  };
}

interface PageStageItem {
  stage: TreatmentPlanStage;
  stageIndex: number; // 0-based original stage index
  procedures: TreatmentProcedureItem[];
  isContinuation?: boolean;
}

interface PageDefinition {
  pageIndex: number;
  stages: PageStageItem[];
  isFirstPage: boolean;
  isLastPage: boolean;
}

export default function TreatmentPlanPrintModal({
  isOpen,
  onClose,
  plan,
  patient,
  branch,
  clinicLogo,
  clinicName,
  customPrintNote
}: TreatmentPlanPrintModalProps) {
  const { tk, language } = useI18n();
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Exact 32Desk Print Parameters
  const [isSpisokMode, setIsSpisokMode] = useState(false); // "Список" toggle
  const [groupProcedures, setGroupProcedures] = useState(false); // "Сгруппировать" toggle
  const [hideNote, setHideNote] = useState(false); // "Скрыть примечание" toggle
  const [showAdultChart, setShowAdultChart] = useState(true); // "Взрослая карта"
  const [showChildChart, setShowChildChart] = useState(false); // "Детская карта"
  const [teethScale, setTeethScale] = useState(1); // Slider: scale 0.75 - 1.25
  const agreementFromSettings =
    (typeof window !== 'undefined' ? localStorage.getItem('32desk_treatment_plan_print_note') : null) ||
    customPrintNote ||
    DEFAULT_AGREEMENT_TEXT;
  const [doctorNote, setDoctorNote] = useState(''); // Izoh va shartlar (doctor note)

  if (!isOpen) return null;

  // Extract all teeth referenced in the plan for dental chart highlighting
  const teethWithProcedures = new Set<string>();
  const teethCounts: Record<string, number> = {};

  (plan.stages || []).forEach((stage) => {
    (stage.procedures || []).forEach((proc) => {
      if (proc.teeth) {
        String(proc.teeth).split(',').forEach((t) => {
          const cleanT = t.trim();
          if (cleanT) {
            teethWithProcedures.add(cleanT);
            teethCounts[cleanT] = (teethCounts[cleanT] || 0) + 1;
          }
        });
      }
    });
  });

  // Calculate total cost
  const totalCost = (plan.stages || []).reduce((sum, s) => {
    const stageSum = (s.procedures || []).reduce(
      (pSum, p) => pSum + (Number(p.price) || 0) * (Number(p.quantity) || 1),
      0
    );
    return sum + stageSum;
  }, 0);

  const handlePrint = () => {
    const printArea = printAreaRef.current;
    if (!printArea) {
      window.print();
      return;
    }

    try {
      // Create a hidden isolated iframe for 100% clean, non-blank multi-page printing
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
      if (!iframeDoc) {
        window.print();
        return;
      }

      // Collect all stylesheets and style tags, filtering out any parent visibility:hidden styles
      const styleNodes: string[] = [];
      document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
        styleNodes.push(link.outerHTML);
      });
      document.querySelectorAll('style').forEach((style) => {
        const text = style.innerHTML || '';
        if (!text.includes('visibility: hidden') && !text.includes('visibility:hidden')) {
          styleNodes.push(style.outerHTML);
        }
      });

      const docTitle = `${patient.full_name} - ${getLocalizedPlanTitle(plan.title, language)}`;

      iframeDoc.open();
      iframeDoc.write(`<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="utf-8" />
  <base href="${window.location.origin}">
  <title>${docTitle}</title>
  ${styleNodes.join('\n')}
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm 8mm 10mm;
    }
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      box-sizing: border-box !important;
      visibility: visible !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
      color: #0f172a !important;
      width: 100% !important;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
      visibility: visible !important;
    }
    #tp-print-container {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
      display: block !important;
      visibility: visible !important;
    }
    .tp-page {
      width: 100% !important;
      max-width: 100% !important;
      min-height: 275mm !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      padding: 6mm 8mm !important;
      margin: 0 0 10mm 0 !important;
      border: none !important;
      box-shadow: none !important;
      background: white !important;
      color: #0f172a !important;
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      visibility: visible !important;
    }
    .tp-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
      margin-bottom: 0 !important;
    }
    .tp-avoid-break {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .print\\:hidden, [class*="print:hidden"] {
      display: none !important;
    }
    .print\\:block, [class*="print:block"] {
      display: block !important;
    }
  </style>
</head>
<body style="background: white !important; padding: 0 !important; margin: 0 !important;">
  <div id="tp-print-container">
    ${printArea.innerHTML}
  </div>
</body>
</html>`);
      iframeDoc.close();

      const cleanup = () => {
        try {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        } catch {}
      };

      if (iframe.contentWindow) {
        iframe.contentWindow.onafterprint = cleanup;
      }
      setTimeout(cleanup, 60000);

      // Wait 300ms for iframe styles and SVG icons to render
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (err) {
          console.error('[TreatmentPlanPrint] iframe print error, fallback', err);
          window.print();
        }
      }, 300);
    } catch (e) {
      console.error('[TreatmentPlanPrint] Print initiation error', e);
      window.print();
    }
  };

  const formattedDate = new Date(plan.created_at || Date.now()).toLocaleDateString(
    language === 'uz' ? 'uz-UZ' : language === 'ru' ? 'ru-RU' : 'en-US',
    { day: 'numeric', month: 'long', year: 'numeric' }
  );

  // ── Smart Dynamic A4 Pagination Engine ──
  // Only paginate to Sheet 2 when content actually does not fit on Sheet 1!
  const stages = plan.stages || [];
  const totalProceduresCount = stages.reduce(
    (sum, s) => sum + (s.procedures || []).length,
    0
  );

  // Maximum items that fit on Sheet 1 TOGETHER with Header, Dental Chart, Totals, Consent & Signature.
  // With compact dental formula (~50px) and clean procedure cards (~38px), up to 10 procedures fit comfortably on 1 sheet!
  const MAX_SINGLE_PAGE_ITEMS = (showAdultChart || showChildChart) ? 10 : 12;

  // Maximum items on Sheet 1 when content exceeds 1 sheet and spills to Sheet 2.
  // Since Bottom Blocks go to Sheet 2, Sheet 1 has even MORE space for procedures: up to 11-13 items!
  const MAX_PAGE_1_ITEMS_WHEN_SPLIT = (showAdultChart || showChildChart) ? 11 : 14;

  const pages: PageDefinition[] = [];

  if (totalProceduresCount <= MAX_SINGLE_PAGE_ITEMS) {
    // ── CASE 1: EVERYTHING FITS COMFORTABLY ON 1 SHEET ──
    // No artificial split! Both Stage 1 and Stage 2 (and 3) stay together on 1 sheet.
    pages.push({
      pageIndex: 1,
      stages: stages.map((s, idx) => ({
        stage: s,
        stageIndex: idx,
        procedures: s.procedures || []
      })),
      isFirstPage: true,
      isLastPage: true
    });
  } else {
    // ── CASE 2: OVERFLOWS SHEET 1 → SPLIT ACROSS 2 SHEETS ──
    // Fill Sheet 1 with what fits (up to MAX_PAGE_1_ITEMS_WHEN_SPLIT).
    // The rest cleanly overflows to Sheet 2.
    const page1Stages: PageStageItem[] = [];
    const page2Stages: PageStageItem[] = [];
    let accumulatedCount = 0;

    stages.forEach((stage, sIdx) => {
      const procs = stage.procedures || [];
      if (accumulatedCount + procs.length <= MAX_PAGE_1_ITEMS_WHEN_SPLIT) {
        // Full stage fits on Page 1
        page1Stages.push({
          stage,
          stageIndex: sIdx,
          procedures: procs
        });
        accumulatedCount += procs.length;
      } else if (accumulatedCount < MAX_PAGE_1_ITEMS_WHEN_SPLIT) {
        // Stage partially fits on Page 1, remainder overflows to Page 2
        const spaceLeft = MAX_PAGE_1_ITEMS_WHEN_SPLIT - accumulatedCount;
        if (spaceLeft >= 2) {
          page1Stages.push({
            stage,
            stageIndex: sIdx,
            procedures: procs.slice(0, spaceLeft)
          });
          page2Stages.push({
            stage,
            stageIndex: sIdx,
            procedures: procs.slice(spaceLeft),
            isContinuation: true
          });
          accumulatedCount += procs.length;
        } else {
          // If only 1 item would fit, start stage cleanly on Page 2
          page2Stages.push({
            stage,
            stageIndex: sIdx,
            procedures: procs
          });
          accumulatedCount += procs.length;
        }
      } else {
        // Completely goes to Page 2
        page2Stages.push({
          stage,
          stageIndex: sIdx,
          procedures: procs
        });
      }
    });

    pages.push({
      pageIndex: 1,
      stages: page1Stages.length > 0 ? page1Stages : [
        {
          stage: stages[0],
          stageIndex: 0,
          procedures: (stages[0]?.procedures || []).slice(0, MAX_PAGE_1_ITEMS_WHEN_SPLIT)
        }
      ],
      isFirstPage: true,
      isLastPage: false
    });

    pages.push({
      pageIndex: 2,
      stages: page2Stages,
      isFirstPage: false,
      isLastPage: true
    });
  }

  const totalPages = pages.length;

  return (
    <div className="tp-modal-backdrop fixed inset-0 z-[95] bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white animate-in fade-in duration-150">
      {/* Explicit Print Styles for True Multi-Page A4 Pagination */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 10mm 8mm 10mm;
          }
          html, body {
            height: auto !important;
            min-height: 100% !important;
            overflow: visible !important;
            background: white !important;
            color: black !important;
          }
          .tp-modal-backdrop {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            min-height: 100% !important;
            background: white !important;
            z-index: 99999 !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .tp-modal-window {
            position: static !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            max-height: none !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .tp-modal-scroll {
            position: static !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #tp-print-container {
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .tp-page {
            position: relative !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            width: 100% !important;
            min-height: 270mm !important;
            margin: 0 0 10mm 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
            break-after: page !important;
            page-break-after: always !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .tp-page:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
            margin-bottom: 0 !important;
          }
          .tp-avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <div className="tp-modal-window bg-white dark:bg-[#0f172a] rounded-2xl w-[99vw] h-[98vh] max-w-[99vw] max-h-[98vh] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row overflow-hidden text-slate-800 dark:text-slate-100 print:shadow-none print:border-none print:max-h-none print:w-full">
        
        {/* LEFT / CENTER: PRINTABLE A4 SHEETS (Multi-Page preview) */}
        <div className="tp-modal-scroll flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-950 flex flex-col items-center print:p-0 print:bg-white">
          <div id="tp-print-container" ref={printAreaRef} className="w-full max-w-[210mm] flex flex-col items-center">
            {pages.map((p, pageIdx) => (
              <React.Fragment key={p.pageIndex}>
                {/* On-screen Page Divider between Sheet 1 and Sheet 2 */}
                {pageIdx > 0 && (
                  <div className="flex items-center justify-center my-6 print:hidden w-full gap-3 select-none">
                    <div className="h-px bg-slate-300 dark:bg-slate-700 flex-1 max-w-[140px]" />
                    <span className="px-3.5 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider shadow-xs">
                      {language === 'uz'
                        ? `${p.pageIndex}-sahifa (Varoq ${p.pageIndex})`
                        : language === 'en'
                        ? `Page ${p.pageIndex} (Sheet ${p.pageIndex})`
                        : `Страница ${p.pageIndex} (Лист ${p.pageIndex})`}
                    </span>
                    <div className="h-px bg-slate-300 dark:bg-slate-700 flex-1 max-w-[140px]" />
                  </div>
                )}

                {/* DISTINCT A4 SHEET CONTAINER */}
                <div className="tp-page w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-900 p-6 sm:p-8 rounded-xl shadow-lg border border-slate-200 print:border-none print:shadow-none print:p-0 print:m-0 flex flex-col justify-between text-[11px] leading-snug">
                  <div className="space-y-3.5">
                    
                    {/* ── HEADER ON SHEET 1: CLINIC INFO + PATIENT + PLAN TITLE ── */}
                    {p.isFirstPage ? (
                      <div className="flex items-start justify-between pb-3 border-b-2 border-slate-900 gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-200 p-1 overflow-hidden shrink-0">
                            {clinicLogo ? (
                              <img src={clinicLogo} alt="Clinic Logo" className="max-w-full max-h-full object-contain" />
                            ) : (
                              <Building2 className="w-7 h-7 text-blue-600" />
                            )}
                          </div>
                          <div>
                            <h1 className="text-base font-black tracking-tight text-slate-900 uppercase">
                              {clinicName || branch?.name || 'DENTOS CLINIC'}
                            </h1>
                            <p className="text-[10px] text-slate-600 mt-0.5">
                              {branch?.address || 'Toshkent sh., Markaziy filial'}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {branch?.phone || '+998 (71) 200-00-32'}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <h2 className="text-base font-black uppercase tracking-wider text-slate-900">
                            {getLocalizedPlanTitle(plan.title, language)}
                          </h2>
                          <p className="text-[11px] font-bold text-slate-700 mt-0.5">
                            {language === 'uz' ? `${formattedDate} dagi reja` : `от ${formattedDate}`}
                          </p>
                          <p className="text-xs font-black text-blue-800 mt-1">
                            {patient.full_name}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {patient.phone}
                          </p>
                        </div>
                      </div>
                    ) : (
                      /* ── RUNNING HEADER ON SHEET 2 (and subsequent sheets) ── */
                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-300 gap-2 tp-avoid-break">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-xs uppercase tracking-tight text-slate-900">
                            {clinicName || branch?.name || 'DENTOS CLINIC'}
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="text-[10px] text-slate-600 font-semibold">
                            {getLocalizedPlanTitle(plan.title, language)} ({language === 'uz' ? 'davomi' : language === 'ru' ? 'продолжение' : 'cont.'})
                          </span>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <span className="font-bold text-xs text-blue-800">{patient.full_name}</span>
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            {p.pageIndex} / {totalPages}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* ── COMPACT DENTAL TOOTH FORMULA (Sheet 1 only, ~55px tall, no scrollbar) ── */}
                    {p.isFirstPage && (showAdultChart || showChildChart) && (
                      <div className="p-2 rounded-xl bg-slate-50/80 border border-slate-200 space-y-1 tp-avoid-break overflow-visible">
                        {/* Adult Chart */}
                        {showAdultChart && (
                          <div>
                            <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 block text-center mb-0.5">
                              {tk('tp_adult_chart') || 'Взрослая карта'} (18–48)
                            </span>
                            <div className="flex flex-col items-center gap-1 w-full overflow-visible">
                              {/* Upper row */}
                              <div className="flex items-center gap-0.5 sm:gap-1">
                                <div className="flex items-center gap-0.5 sm:gap-1">
                                  {ADULT_UPPER_LEFT.map((t) => (
                                    <DentalToothSvg
                                      key={t}
                                      tooth={t}
                                      size={Math.round(18 * teethScale)}
                                      hasProcedures={teethWithProcedures.has(t)}
                                      procedureCount={teethCounts[t] || 0}
                                    />
                                  ))}
                                </div>
                                <div className="w-px h-4 bg-slate-300 mx-1" />
                                <div className="flex items-center gap-0.5 sm:gap-1">
                                  {ADULT_UPPER_RIGHT.map((t) => (
                                    <DentalToothSvg
                                      key={t}
                                      tooth={t}
                                      size={Math.round(18 * teethScale)}
                                      hasProcedures={teethWithProcedures.has(t)}
                                      procedureCount={teethCounts[t] || 0}
                                    />
                                  ))}
                                </div>
                              </div>

                              {/* Lower row */}
                              <div className="flex items-center gap-0.5 sm:gap-1">
                                <div className="flex items-center gap-0.5 sm:gap-1">
                                  {ADULT_LOWER_LEFT.map((t) => (
                                    <DentalToothSvg
                                      key={t}
                                      tooth={t}
                                      size={Math.round(18 * teethScale)}
                                      hasProcedures={teethWithProcedures.has(t)}
                                      procedureCount={teethCounts[t] || 0}
                                    />
                                  ))}
                                </div>
                                <div className="w-px h-4 bg-slate-300 mx-1" />
                                <div className="flex items-center gap-0.5 sm:gap-1">
                                  {ADULT_LOWER_RIGHT.map((t) => (
                                    <DentalToothSvg
                                      key={t}
                                      tooth={t}
                                      size={Math.round(18 * teethScale)}
                                      hasProcedures={teethWithProcedures.has(t)}
                                      procedureCount={teethCounts[t] || 0}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Child Chart */}
                        {showChildChart && (
                          <div className="pt-1 border-t border-slate-200">
                            <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 block text-center mb-0.5">
                              {tk('tp_child_chart') || 'Детская карта'} (51–85)
                            </span>
                            <div className="flex flex-col items-center gap-1 w-full overflow-visible">
                              <div className="flex items-center gap-0.5 sm:gap-1">
                                <div className="flex items-center gap-0.5 sm:gap-1">
                                  {CHILD_UPPER_LEFT.map((t) => (
                                    <DentalToothSvg
                                      key={t}
                                      tooth={t}
                                      size={Math.round(16 * teethScale)}
                                      hasProcedures={teethWithProcedures.has(t)}
                                      procedureCount={teethCounts[t] || 0}
                                    />
                                  ))}
                                </div>
                                <div className="w-px h-4 bg-slate-300 mx-1" />
                                <div className="flex items-center gap-0.5 sm:gap-1">
                                  {CHILD_UPPER_RIGHT.map((t) => (
                                    <DentalToothSvg
                                      key={t}
                                      tooth={t}
                                      size={Math.round(16 * teethScale)}
                                      hasProcedures={teethWithProcedures.has(t)}
                                      procedureCount={teethCounts[t] || 0}
                                    />
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5 sm:gap-1">
                                <div className="flex items-center gap-0.5 sm:gap-1">
                                  {CHILD_LOWER_LEFT.map((t) => (
                                    <DentalToothSvg
                                      key={t}
                                      tooth={t}
                                      size={Math.round(16 * teethScale)}
                                      hasProcedures={teethWithProcedures.has(t)}
                                      procedureCount={teethCounts[t] || 0}
                                    />
                                  ))}
                                </div>
                                <div className="w-px h-4 bg-slate-300 mx-1" />
                                <div className="flex items-center gap-0.5 sm:gap-1">
                                  {CHILD_LOWER_RIGHT.map((t) => (
                                    <DentalToothSvg
                                      key={t}
                                      tooth={t}
                                      size={Math.round(16 * teethScale)}
                                      hasProcedures={teethWithProcedures.has(t)}
                                      procedureCount={teethCounts[t] || 0}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── STAGES & PROCEDURES SECTION ── */}
                    <div className="space-y-3">
                      {p.stages.map((stageItem) => {
                        const { stage, stageIndex, procedures: stageProcs, isContinuation } = stageItem;
                        if (stageProcs.length === 0) return null;
                        const stageSum = stageProcs.reduce(
                          (sum, pr) => sum + (Number(pr.price) || 0) * (Number(pr.quantity) || 1),
                          0
                        );

                        // ── MODE 1: ПО ЗУБАМ (isSpisokMode is false) ──
                        if (!isSpisokMode) {
                          // Group procedures sharing the exact same teeth string together into one card
                          let effectiveProcs = [...stageProcs];
                          if (groupProcedures) {
                            const groupedMap: Record<string, TreatmentProcedureItem> = {};
                            stageProcs.forEach((item) => {
                              const key = `${item.title}_${item.price}`;
                              if (!groupedMap[key]) {
                                groupedMap[key] = { ...item };
                              } else {
                                groupedMap[key].quantity = (Number(groupedMap[key].quantity) || 1) + (Number(item.quantity) || 1);
                                if (item.teeth) {
                                  const set = new Set(
                                    [
                                      ...String(groupedMap[key].teeth || '').split(','),
                                      ...String(item.teeth).split(',')
                                    ].map((t) => t.trim()).filter(Boolean)
                                  );
                                  groupedMap[key].teeth = Array.from(set).join(', ');
                                }
                              }
                            });
                            effectiveProcs = Object.values(groupedMap);
                          }

                          // Group into card blocks by teeth pattern
                          const groupedCards: {
                            teethStr: string;
                            items: TreatmentProcedureItem[];
                          }[] = [];

                          effectiveProcs.forEach((pr) => {
                            const tStr = pr.teeth ? String(pr.teeth).trim() : '';
                            const existing = groupedCards.find((c) => c.teethStr === tStr);
                            if (existing) {
                              existing.items.push(pr);
                            } else {
                              groupedCards.push({ teethStr: tStr, items: [pr] });
                            }
                          });

                          return (
                            <div key={`${stage.id}_${stageIndex}`} className="space-y-2 tp-avoid-break">
                              {/* Stage Header */}
                              <div className="flex items-center justify-between bg-slate-100 px-3 py-1.5 rounded-md font-bold text-[11px]">
                                <span className="text-slate-900 uppercase">
                                  {getLocalizedStageTitle(stage.title, stageIndex + 1, language)}
                                  {isContinuation ? ` (${language === 'uz' ? 'davomi' : language === 'ru' ? 'продолжение' : 'cont.'})` : ''}
                                </span>
                                <span className="font-mono text-slate-800 font-black">
                                  {stageSum.toLocaleString('ru-RU')} {tk('currency_som') || 'Сум'}
                                </span>
                              </div>

                              {/* Procedures Cards */}
                              <div className="space-y-1.5">
                                {groupedCards.map((card, cIdx) => {
                                  const { isGeneral, label } = formatTeethLabel(card.teethStr, language);
                                  return (
                                    <div
                                      key={cIdx}
                                      className="p-2 sm:p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 flex items-start gap-2.5"
                                    >
                                      {/* Tooth Badge */}
                                      <div
                                        className={`shrink-0 flex items-center justify-center px-2 py-1 min-w-[50px] h-10 rounded-lg border-2 ${
                                          isGeneral
                                            ? 'bg-slate-100 border-slate-300 text-slate-500 text-[10px] font-bold text-center'
                                            : 'bg-blue-50 border-blue-500 text-blue-600 gap-1.5'
                                        }`}
                                      >
                                        {!isGeneral && <ToothIcon className="w-3.5 h-3.5 shrink-0" selected filled />}
                                        <span className="text-[11px] font-black font-mono leading-tight whitespace-nowrap">
                                          {label}
                                        </span>
                                      </div>

                                      {/* Items inside this card */}
                                      <div className="flex-1 min-w-0 divide-y divide-slate-100">
                                        {card.items.map((proc, prIdx) => {
                                          const procTotal = (Number(proc.price) || 0) * (Number(proc.quantity) || 1);
                                          return (
                                            <div key={prIdx} className="py-0.5 flex items-center justify-between text-[11px] gap-2">
                                              <div className="flex-1 min-w-0 pr-2">
                                                <p className="font-semibold text-slate-900 leading-snug truncate">
                                                  {proc.title}
                                                </p>
                                                {proc.duration && (
                                                  <span className="text-[10px] text-slate-400 font-normal">
                                                    {proc.duration}
                                                  </span>
                                                )}
                                              </div>
                                              <div className="w-12 text-center text-slate-500 font-bold shrink-0">
                                                ×{proc.quantity || 1}
                                              </div>
                                              <div className="w-28 text-right font-mono font-black text-slate-900 shrink-0">
                                                {procTotal.toLocaleString('ru-RU')} {tk('currency_som') || 'Сум'}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }

                        // ── MODE 2: СПИСОК / ТАБЛИЦА (isSpisokMode is true) ──
                        let displayTableItems: {
                          teethText: string;
                          title: string;
                          duration?: string;
                          quantity: number;
                          price: number;
                          total: number;
                        }[] = [];

                        if (groupProcedures) {
                          const groupedMap: Record<string, { teeth: Set<string>; title: string; duration?: string; quantity: number; price: number }> = {};
                          stageProcs.forEach((item) => {
                            const key = `${item.title}_${item.price}`;
                            if (!groupedMap[key]) {
                              groupedMap[key] = {
                                teeth: new Set(),
                                title: item.title,
                                duration: item.duration,
                                quantity: 0,
                                price: Number(item.price) || 0
                              };
                            }
                            groupedMap[key].quantity += Number(item.quantity) || 1;
                            if (item.teeth) {
                              String(item.teeth).split(',').forEach((t) => groupedMap[key].teeth.add(t.trim()));
                            }
                          });
                          displayTableItems = Object.values(groupedMap).map((g) => ({
                            teethText: Array.from(g.teeth).sort((a, b) => Number(a) - Number(b)).join(', ') || (language === 'uz' ? 'Umumiy' : '—'),
                            title: g.title,
                            duration: g.duration,
                            quantity: g.quantity,
                            price: g.price,
                            total: g.quantity * g.price
                          }));
                        } else {
                          displayTableItems = stageProcs.map((item) => ({
                            teethText: item.teeth ? String(item.teeth).trim() : (language === 'uz' ? 'Umumiy' : '—'),
                            title: item.title,
                            duration: item.duration,
                            quantity: Number(item.quantity) || 1,
                            price: Number(item.price) || 0,
                            total: (Number(item.price) || 0) * (Number(item.quantity) || 1)
                          }));
                        }

                        return (
                          <div key={`${stage.id}_${stageIndex}`} className="space-y-1.5 tp-avoid-break">
                            {/* Stage Header */}
                            <div className="flex items-center justify-between bg-slate-100 px-3 py-1 rounded-md font-bold text-[11px]">
                              <span className="text-slate-900 uppercase">
                                {getLocalizedStageTitle(stage.title, stageIndex + 1, language)}
                                {isContinuation ? ` (${language === 'uz' ? 'davomi' : language === 'ru' ? 'продолжение' : 'cont.'})` : ''}
                              </span>
                              <span className="font-mono text-slate-800 font-black">
                                {stageSum.toLocaleString('ru-RU')} {tk('currency_som') || 'Сум'}
                              </span>
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-[10px] border-collapse">
                                <thead>
                                  <tr className="border-b border-slate-200 text-slate-400 uppercase text-[9px] font-black">
                                    <th className="py-1 px-2 w-8 text-center">№</th>
                                    <th className="py-1 px-2 w-28">{tk('teeth_word') || (language === 'uz' ? 'Tishlar' : 'Зубы')}</th>
                                    <th className="py-1 px-2">{tk('service_name') || (language === 'uz' ? 'Xizmat' : 'Услуга')}</th>
                                    <th className="py-1 px-2 text-center w-14">{tk('quantity_word') || (language === 'uz' ? 'Soni' : 'Кол-во')}</th>
                                    <th className="py-1 px-2 text-right w-24">{tk('price_word') || (language === 'uz' ? 'Narxi' : 'Стоимость')}</th>
                                    <th className="py-1 px-2 text-right w-24">{tk('total_sum') || (language === 'uz' ? 'Jami' : 'Всего')}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {displayTableItems.map((item, pIdx) => (
                                    <tr key={pIdx} className="hover:bg-slate-50/50">
                                      <td className="py-1.5 px-2 text-center text-slate-400 font-mono">{pIdx + 1}</td>
                                      <td className="py-1.5 px-2 font-mono font-bold text-blue-600 whitespace-nowrap">
                                        {item.teethText}
                                      </td>
                                      <td className="py-1.5 px-2 text-slate-900 font-medium">
                                        {item.title}
                                        {item.duration && <span className="text-[9px] text-slate-400 ml-1.5 font-normal">({item.duration})</span>}
                                      </td>
                                      <td className="py-1.5 px-2 text-center text-slate-700 font-bold">
                                        {item.quantity}
                                      </td>
                                      <td className="py-1.5 px-2 text-right font-mono text-slate-600">
                                        {item.price.toLocaleString('ru-RU')}
                                      </td>
                                      <td className="py-1.5 px-2 text-right font-mono font-black text-slate-900">
                                        {item.total.toLocaleString('ru-RU')}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* ── TOTALS, CONSENT, NOTE & SIGNATURE ON LAST PAGE ── */}
                    {p.isLastPage && (
                      <div className="space-y-3 pt-2">
                        {/* Total Cost Row */}
                        <div className="flex justify-between items-center pt-2.5 border-t-2 border-slate-900 font-black text-xs tp-avoid-break">
                          <span className="uppercase tracking-wider text-slate-800">
                            {language === 'uz' ? 'JAMI' : language === 'en' ? 'TOTAL' : 'ВСЕГО'}:
                          </span>
                          <span className="font-mono text-sm text-blue-800">
                            {totalCost.toLocaleString('ru-RU')} {tk('currency_som') || 'Сум'}
                          </span>
                        </div>

                        {/* Official Agreement & Consent (always printed) */}
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[9px] text-slate-700 leading-relaxed italic tp-avoid-break">
                          {agreementFromSettings}
                        </div>

                        {/* Doctor Note (textarea on screen, printable block in print) */}
                        {!hideNote && (
                          <div className="space-y-1 tp-avoid-break">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block print:hidden">
                              {language === 'uz' ? 'Izoh va shartlar' : language === 'en' ? 'Notes and terms' : 'Примечание и условия'}:
                            </span>
                            <textarea
                              value={doctorNote}
                              onChange={(e) => {
                                setDoctorNote(e.target.value);
                                try {
                                  localStorage.setItem('32desk_treatment_plan_print_note', e.target.value);
                                } catch {}
                              }}
                              placeholder={
                                language === 'uz'
                                  ? 'Shifokor izohi va shartlari...'
                                  : language === 'en'
                                  ? 'Doctor notes and terms...'
                                  : 'Примечание и условия врача...'
                              }
                              rows={2}
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 outline-none focus:ring-1 focus:ring-blue-500 resize-none print:hidden"
                            />
                            {doctorNote.trim() && (
                              <div className="hidden print:block p-2 bg-slate-50 border border-slate-200 rounded text-[9px] text-slate-800 leading-relaxed">
                                <span className="font-bold">{language === 'uz' ? 'Izoh' : language === 'en' ? 'Note' : 'Примечание'}: </span>
                                <span>{doctorNote}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Patient Signature Block */}
                        <div className="pt-3 pb-1 flex items-center justify-between text-xs text-slate-800 font-medium tp-avoid-break">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 font-bold">
                              {language === 'uz' ? 'Bemor:' : language === 'en' ? 'Patient:' : 'Пациент:'}
                            </span>
                            <span className="font-black text-slate-900">{patient.full_name}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-500 text-[10px] font-bold">
                                {language === 'uz' ? 'F.I.SH.' : language === 'en' ? 'Full Name' : 'Ф.И.О.'}
                              </span>
                              <span className="border-b border-slate-400 w-32 sm:w-40 inline-block">&nbsp;</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-500 text-[10px] font-bold">
                                {language === 'uz' ? 'Imzo' : language === 'en' ? 'Signature' : 'Подпись'}
                              </span>
                              <span className="border-b border-slate-400 w-24 sm:w-32 inline-block">&nbsp;</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                  </div>

                  {/* ── FOOTER AT BOTTOM OF EVERY PAGE ── */}
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[9px] text-slate-400 select-none tp-avoid-break mt-4">
                    <span>Dentos Clinic Management</span>
                    <span className="font-mono font-bold">
                      {totalPages === 1
                        ? (language === 'uz' ? '1-sahifa' : language === 'en' ? 'Page 1' : 'Страница 1')
                        : language === 'uz'
                        ? `${p.pageIndex}-sahifa / ${totalPages}`
                        : language === 'en'
                        ? `Page ${p.pageIndex} of ${totalPages}`
                        : `Страница ${p.pageIndex} из ${totalPages}`}
                    </span>
                  </div>

                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* RIGHT SIDEBAR: ПАРАМЕТРЫ ПЕЧАТИ (Exact 32Desk Print Parameters Sidebar) */}
        <div className="w-full lg:w-80 bg-white dark:bg-slate-900 p-5 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 flex flex-col justify-between shrink-0 space-y-4 print:hidden overflow-y-auto">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-600 dark:text-sky-400" />
                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  {tk('tp_print_params') || 'Параметры печати'}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Switch: Список */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  {tk('tp_table_list') || 'Список'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {isSpisokMode ? (tk('tp_only_table') || 'Только таблица') : (tk('tp_with_chart') || 'С зубной картой')}
                </span>
              </div>
              <input
                type="checkbox"
                checked={isSpisokMode}
                onChange={(e) => setIsSpisokMode(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
              />
            </label>

            {/* Switch: Сгруппировать */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  {tk('tp_group_services') || 'Сгруппировать'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {tk('tp_group_desc') || 'Одинаковые услуги в одну строку'}
                </span>
              </div>
              <input
                type="checkbox"
                checked={groupProcedures}
                onChange={(e) => setGroupProcedures(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
              />
            </label>

            {/* Switch: Скрыть примечание */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  {tk('tp_hide_note') || 'Скрыть примечание'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {language === 'uz'
                    ? 'Faqat shifokor izohini yashirish (rozilik qoladi)'
                    : language === 'en'
                    ? 'Hide doctor note only (consent remains)'
                    : 'Скрыть только примечание врача (согласие остаётся)'}
                </span>
              </div>
              <input
                type="checkbox"
                checked={hideNote}
                onChange={(e) => setHideNote(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
              />
            </label>

            {/* Switch: Взрослая карта */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  {tk('tp_adult_chart') || 'Взрослая карта'}
                </span>
                <span className="text-[10px] text-slate-400">18–48</span>
              </div>
              <input
                type="checkbox"
                checked={showAdultChart}
                onChange={(e) => setShowAdultChart(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
              />
            </label>

            {/* Switch: Детская карта */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  {tk('tp_child_chart') || 'Детская карта'}
                </span>
                <span className="text-[10px] text-slate-400">51–85</span>
              </div>
              <input
                type="checkbox"
                checked={showChildChart}
                onChange={(e) => setShowChildChart(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
              />
            </label>

            {/* Slider: Размер карты зубов */}
            {(showAdultChart || showChildChart) && (
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-900 dark:text-white">
                    {tk('tp_teeth_size') || 'Размер карты зубов'}
                  </span>
                  <span className="text-blue-600 dark:text-sky-400 font-mono">
                    {Math.round(teethScale * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.75"
                  max="1.25"
                  step="0.05"
                  value={teethScale}
                  onChange={(e) => setTeethScale(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Action Buttons matching 32Desk: Печать, Скачать, Закрыть */}
          <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handlePrint}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{tk('tp_print_plan') || 'Печать'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-700 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{tk('tp_download_pdf') || 'Скачать'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-xl text-xs font-bold transition text-center cursor-pointer"
            >
              {tk('close') || 'Закрыть'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
