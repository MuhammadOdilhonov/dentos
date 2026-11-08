'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { clinicApi } from '../lib/api';

interface ToothState {
  status: 'healthy' | 'caries' | 'filling' | 'crown' | 'missing' | 'implant';
  diagnosis?: string;
  doctor?: string;   // kim kiritdi (ism)
  doctorId?: string; // kim kiritdi (id)
  date?: string;     // qachon kiritildi
}

type Lang = 'uz' | 'ru' | 'en';

// Boshqa DentalChart nusxalari (mini + to'liq) bir xil ma'lumotni ko'rsatishi uchun
const TOOTH_CHART_SYNC_EVENT = '32desk:toothchart-updated';

interface DentalChartProps {
  patientId?: number;
}



// Status → glyph fill / label colors
const STATUS_COLOR: Record<ToothState['status'], string> = {
  healthy: '#CBD5E1',
  caries: '#F43F5E',
  filling: '#0EA5E9',
  crown: '#F59E0B',
  implant: '#8B5CF6',
  missing: '#94A3B8'
};

const ToothGlyph: React.FC<{ color: string; missing?: boolean; flip?: boolean }> = ({ color, missing, flip }) => (
  <svg viewBox="0 0 24 28" className={`w-6 h-7 ${flip ? 'rotate-180' : ''}`} fill="none">
    <path
      d="M12 2C7 2 3.5 4 3.5 8.5c0 3 1 5 1.6 8.5.5 3 .8 7 2.4 7 1.5 0 1.6-3 2.3-5.5.4-1.6 1-2.5 2.2-2.5s1.8.9 2.2 2.5c.7 2.5.8 5.5 2.3 5.5 1.6 0 1.9-4 2.4-7 .6-3.5 1.6-5.5 1.6-8.5C20.5 4 17 2 12 2Z"
      fill={missing ? 'none' : `${color}33`}
      stroke={color}
      strokeWidth="1.4"
      strokeDasharray={missing ? '2 2' : undefined}
    />
  </svg>
);

export default function DentalChart({ patientId }: DentalChartProps = {}) {
  const { language, tr } = useI18n();
  const { user } = useAuth();
  const lng = (language as Lang) || 'ru';

  const [isPediatric, setIsPediatric] = useState(false);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  // Yangi bemorda ranglar BO'LMAYDI — bo'sh boshlanadi, keyin bemorga saqlangani yuklanadi
  const [teethData, setTeethData] = useState<Record<number, ToothState>>({});

  // Bemor almashganda yoki boshqa nusxada o'zgarganda — saqlangan formulani yuklaymiz
  const loadChart = useCallback(() => {
    if (patientId == null) { setTeethData({}); return; }
    try {
      const raw = clinicApi.getPatientToothChart(patientId) || {};
      const parsed: Record<number, ToothState> = {};
      Object.keys(raw).forEach((k) => { parsed[Number(k)] = raw[k]; });
      setTeethData(parsed);
    } catch { setTeethData({}); }
  }, [patientId]);

  useEffect(() => { loadChart(); }, [loadChart]);

  // Bir sahifadagi boshqa DentalChart nusxasi (mini/to'liq) o'zgartirsa — sinxron yangilanadi
  useEffect(() => {
    if (patientId == null) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.patientId === patientId) loadChart();
    };
    window.addEventListener(TOOTH_CHART_SYNC_EVENT, handler);
    return () => window.removeEventListener(TOOTH_CHART_SYNC_EVENT, handler);
  }, [patientId, loadChart]);

  const upperAdult = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const lowerAdult = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
  const upperChild = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
  const lowerChild = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

  const upperTeeth = isPediatric ? upperChild : upperAdult;
  const lowerTeeth = isPediatric ? lowerChild : lowerAdult;

  const statusOf = (num: number): ToothState['status'] => teethData[num]?.status || 'healthy';

  const setToothStatus = (num: number, status: ToothState['status']) => {
    setTeethData(prev => {
      // 'healthy' = belgini olib tashlash (rang yo'q)
      const next = { ...prev };
      if (status === 'healthy') {
        delete next[num];
      } else {
        next[num] = {
          status,
          doctor: user?.name || prev[num]?.doctor,
          doctorId: user?.id || prev[num]?.doctorId,
          date: new Date().toLocaleDateString(lng === 'uz' ? 'uz-UZ' : lng === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
        };
      }
      if (patientId != null) {
        try {
          clinicApi.savePatientToothChart(patientId, next as Record<string, any>);
          window.dispatchEvent(new CustomEvent(TOOTH_CHART_SYNC_EVENT, { detail: { patientId } }));
        } catch {}
      }
      return next;
    });
    setSelectedTooth(null);
  };

  const renderRow = (teeth: number[], flip: boolean) => (
    <div className="flex flex-wrap justify-center gap-x-1 gap-y-1">
      {teeth.map(num => {
        const st = statusOf(num);
        const color = STATUS_COLOR[st];
        const active = selectedTooth === num;
        return (
          <button
            key={num}
            type="button"
            onClick={() => setSelectedTooth(num)}
            className={`flex flex-col items-center w-8 rounded-lg py-1 transition ${
              active ? 'bg-blue-50 dark:bg-blue-950/50 ring-1 ring-blue-400' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
            } ${flip ? 'flex-col-reverse' : ''}`}
          >
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 leading-none">{num}</span>
            <ToothGlyph color={color} missing={st === 'missing'} flip={flip} />
          </button>
        );
      })}
    </div>
  );

  const legend: ToothState['status'][] = ['healthy', 'caries', 'filling', 'crown', 'implant', 'missing'];

  return (
    <div className="w-full select-none relative text-slate-900 dark:text-white">
      {/* Header: title + adult/child segmented toggle */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{tr('dentalchart.title')}</span>
        <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-[11px] font-semibold">
          {[false, true].map(ped => {
            const activeTab = isPediatric === ped;
            return (
              <button
                key={String(ped)}
                type="button"
                onClick={() => {
                  setIsPediatric(ped);
                  setSelectedTooth(null);
                }}
                className={`px-2.5 py-1 rounded-md transition ${
                  activeTab
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                {ped ? tr('dentalchart.child') : tr('dentalchart.adult')}
              </button>
            );
          })}
        </div>
      </div>

      {/* Upper jaw */}
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 text-center">{tr('dentalchart.upper')}</p>
      {renderRow(upperTeeth, false)}

      <div className="my-2 border-t border-dashed border-slate-200 dark:border-slate-700" />

      {/* Lower jaw */}
      {renderRow(lowerTeeth, true)}
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-1 text-center">{tr('dentalchart.lower')}</p>

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-x-3 gap-y-1.5 justify-center text-[10px] font-medium text-slate-600 dark:text-slate-400">
        {legend.map(st => (
          <div key={st} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[st] }} />
            <span>{tr(`dentalchart.${st}`)}</span>
          </div>
        ))}
      </div>

      {/* Tooth diagnosis popover */}
      {selectedTooth !== null && (
        <div className="absolute inset-0 bg-white/97 dark:bg-slate-900/97 backdrop-blur-sm rounded-2xl p-4 flex flex-col z-20 animate-in fade-in border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 mb-3">
            <h4 className="text-sm font-bold">
              {tr('dentalchart.tooth')} #{selectedTooth}
            </h4>
            <button type="button" onClick={() => setSelectedTooth(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* Kim kiritgani — doctor + sana */}
          {teethData[selectedTooth]?.doctor && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">
              {tr('dentalchart.enteredBy')}: <span className="font-semibold text-slate-600 dark:text-slate-300">{teethData[selectedTooth]?.doctor}</span>
              {teethData[selectedTooth]?.date ? ` · ${teethData[selectedTooth]?.date}` : ''}
            </p>
          )}
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">{tr('dentalchart.diagnose')}:</p>
          <div className="grid grid-cols-2 gap-1.5">
            {legend.map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setToothStatus(selectedTooth, st)}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-semibold transition hover:brightness-95 ${
                  statusOf(selectedTooth) === st ? 'ring-2 ring-offset-1' : ''
                }`}
                style={{
                  borderColor: `${STATUS_COLOR[st]}66`,
                  backgroundColor: `${STATUS_COLOR[st]}14`,
                  color: STATUS_COLOR[st]
                }}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[st] }} />
                {tr(`dentalchart.${st}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSelectedTooth(null)}
            className="mt-3 w-full py-2 bg-slate-800 dark:bg-slate-700 text-white rounded-lg text-xs font-bold"
          >
            {tr('dentalchart.close')}
          </button>
        </div>
      )}
    </div>
  );
}
