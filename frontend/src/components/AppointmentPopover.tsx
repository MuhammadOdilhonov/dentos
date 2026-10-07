'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Appointment, AppointmentStatus, Patient } from '../lib/types';
import { useI18n } from '../lib/i18n';
import { clinicApi } from '../lib/api';
import {
  X,
  ChevronDown,
  FileText,
  MessageSquare,
  Circle,
  Check,
  AlertCircle,
  Clock,
  ArrowDownCircle,
  PlayCircle,
  XCircle,
  EyeOff,
  CheckCircle2,
  SquarePen,
  CreditCard,
  Trash2,
  AlertTriangle,
  Building2
} from 'lucide-react';

interface AppointmentPopoverProps {
  appointment: Appointment | null;
  patient?: Patient | null;
  anchorRect?: DOMRect | { top: number; left: number; width: number; height: number; right: number; bottom: number } | null;
  onClose: () => void;
  onStatusChange: (id: number, status: AppointmentStatus) => void;
  onOpenBill: (appointment: Appointment) => void;
  onEdit?: (appointment: Appointment) => void;
  onDelete?: (id: number) => void;
}

export const STATUS_CONFIG: Record<
  AppointmentStatus,
  {
    labelRu: string;
    labelUz: string;
    labelEn: string;
    color: string;
    dotColor: string;
    icon: React.ElementType;
    textColor: string;
    bgBadge: string;
  }
> = {
  new: {
    labelRu: 'Новый',
    labelUz: 'Yangi',
    labelEn: 'New',
    color: '#3B82F6',
    dotColor: 'bg-blue-500',
    icon: Circle,
    textColor: 'text-blue-600 dark:text-sky-400',
    bgBadge: 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800'
  },
  confirmed: {
    labelRu: 'Подтвержден',
    labelUz: 'Tasdiqlangan',
    labelEn: 'Confirmed',
    color: '#06B6D4',
    dotColor: 'bg-cyan-500',
    icon: Check,
    textColor: 'text-cyan-600 dark:text-cyan-400',
    bgBadge: 'bg-cyan-50 dark:bg-cyan-950/60 border-cyan-200 dark:border-cyan-800'
  },
  unconfirmed: {
    labelRu: 'Не подтвержден',
    labelUz: 'Tasdiqlanmagan',
    labelEn: 'Unconfirmed',
    color: '#F59E0B',
    dotColor: 'bg-amber-500',
    icon: AlertCircle,
    textColor: 'text-amber-600 dark:text-amber-400',
    bgBadge: 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800'
  },
  late: {
    labelRu: 'Опоздал',
    labelUz: 'Kechikdi',
    labelEn: 'Late',
    color: '#F97316',
    dotColor: 'bg-orange-500',
    icon: Clock,
    textColor: 'text-orange-600 dark:text-orange-400',
    bgBadge: 'bg-orange-50 dark:bg-orange-950/60 border-orange-200 dark:border-orange-800'
  },
  arrived: {
    labelRu: 'Прибыл',
    labelUz: 'Keldi',
    labelEn: 'Arrived',
    color: '#EAB308',
    dotColor: 'bg-yellow-500',
    icon: ArrowDownCircle,
    textColor: 'text-yellow-600 dark:text-yellow-400',
    bgBadge: 'bg-yellow-50 dark:bg-yellow-950/60 border-yellow-200 dark:border-yellow-800'
  },
  in_progress: {
    labelRu: 'На приёме',
    labelUz: 'Qabulda',
    labelEn: 'In Treatment',
    color: '#10B981',
    dotColor: 'bg-emerald-500',
    icon: PlayCircle,
    textColor: 'text-emerald-600 dark:text-emerald-400',
    bgBadge: 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800'
  },
  waiting_bill: {
    labelRu: 'Ждёт счёт',
    labelUz: 'Hisob kutmoqda',
    labelEn: 'Waiting for Bill',
    color: '#F59E0B',
    dotColor: 'bg-amber-500',
    icon: FileText,
    textColor: 'text-amber-600 dark:text-amber-400',
    bgBadge: 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800'
  },
  cancelled: {
    labelRu: 'Отменен',
    labelUz: 'Bekor qilingan',
    labelEn: 'Cancelled',
    color: '#EF4444',
    dotColor: 'bg-rose-500',
    icon: XCircle,
    textColor: 'text-rose-600 dark:text-rose-400',
    bgBadge: 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800'
  },
  no_show: {
    labelRu: 'Не явился',
    labelUz: 'Kelmadi',
    labelEn: 'No Show',
    color: '#DC2626',
    dotColor: 'bg-red-600',
    icon: EyeOff,
    textColor: 'text-red-600 dark:text-red-400',
    bgBadge: 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800'
  },
  completed: {
    labelRu: 'Завершен',
    labelUz: 'Yakunlangan',
    labelEn: 'Completed',
    color: '#64748B',
    dotColor: 'bg-slate-500',
    icon: CheckCircle2,
    textColor: 'text-slate-600 dark:text-slate-300',
    bgBadge: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
  },
  debt: {
    labelRu: 'Задолженность',
    labelUz: 'Qarzdorlik',
    labelEn: 'Debt',
    color: '#EA580C',
    dotColor: 'bg-orange-600',
    icon: AlertCircle,
    textColor: 'text-orange-600 dark:text-orange-400',
    bgBadge: 'bg-orange-50 dark:bg-orange-950/60 border-orange-200 dark:border-orange-800'
  },
  reserved: {
    labelRu: 'Забронировано',
    labelUz: 'Band qilingan',
    labelEn: 'Reserved',
    color: '#3B82F6',
    dotColor: 'bg-blue-500',
    icon: Circle,
    textColor: 'text-blue-600 dark:text-sky-400',
    bgBadge: 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800'
  }
};

const STATUS_MENU_KEYS: AppointmentStatus[] = [
  'new',
  'confirmed',
  'unconfirmed',
  'late',
  'arrived',
  'in_progress',
  'waiting_bill',
  'cancelled',
  'no_show',
  'completed'
];

export default function AppointmentPopover({
  appointment,
  patient,
  anchorRect,
  onClose,
  onStatusChange,
  onOpenBill,
  onEdit,
  onDelete
}: AppointmentPopoverProps) {
  const { language, tk, tr } = useI18n();
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isBlockedDeleteOpen, setIsBlockedDeleteOpen] = useState(false);
  const [isEditAlertOpen, setIsEditAlertOpen] = useState(false);

  // Bemorning xizmat tili (istalgan vaqtda o'zgartirish mumkin!)
  const [patientLang, setPatientLang] = useState<'uz' | 'ru' | 'en'>(
    appointment?.patient_service_lang || patient?.service_lang || 'uz'
  );
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (appointment?.patient_service_lang) {
      setPatientLang(appointment.patient_service_lang);
    } else if (patient?.service_lang) {
      setPatientLang(patient.service_lang);
    }
  }, [appointment?.patient_service_lang, patient?.service_lang]);

  const handleLangChange = async (newLang: 'uz' | 'ru' | 'en') => {
    setPatientLang(newLang);
    if (appointment) {
      appointment.patient_service_lang = newLang;
      if (appointment.patient) {
        await clinicApi.updatePatientLang(appointment.patient, newLang);
      }
    }
    setIsLangDropdownOpen(false);
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setIsLangDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  if (!appointment) return null;


  // Format time e.g. 16:30 - 18:30
  const startTime = new Date(appointment.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endTime = new Date(appointment.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Calculate duration in hours/minutes
  const durMs = Math.max(0, new Date(appointment.end_time).getTime() - new Date(appointment.start_time).getTime());
  const durHours = durMs / (1000 * 60 * 60);
  const durLabel = durHours >= 1 
    ? `${durHours % 1 === 0 ? durHours : durHours.toFixed(1)} ${tk('dur_hour_short')}` 
    : `${Math.round(durMs / 60000)} ${tk('dur_min_short')}`;

  // Initials e.g. MK / МК
  const nameParts = appointment.patient_name.trim().split(' ').filter(Boolean);
  const initials =
    nameParts.length >= 2
      ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
      : (nameParts[0]?.slice(0, 2) || 'Б').toUpperCase();

  // Status config
  const currentStatus = (appointment.status in STATUS_CONFIG ? appointment.status : 'unconfirmed') as AppointmentStatus;
  const currentCfg = STATUS_CONFIG[currentStatus];

  const getStatusLabel = (cfg: typeof currentCfg) => {
    if (language === 'uz') return cfg.labelUz;
    if (language === 'en') return cfg.labelEn;
    return cfg.labelRu;
  };

  const balanceNumber = patient?.balance ?? (appointment.status === 'debt' ? -Math.abs(appointment.price - appointment.paid_amount) : 0);

  // ── FOYDALANUVCHI QOIDASI: 1 KUN OLDIN TAHRIRLASH VA O'CHIRISH BO'LADI ──
  // Agar qabul sanasiga kamida 1 kun bo'lsa (diffDays >= 1): tahrirlash va o'chirish mumkin.
  // Agar bugun yoki o'tgan sana bo'lsa (diffDays <= 0): o'chirib bo'lmaydi! Faqat "Kelmadi" ga o'tkazish mumkin.
  const aptDate = new Date(appointment.start_time);
  const aptDay = new Date(aptDate.getFullYear(), aptDate.getMonth(), aptDate.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((aptDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const canEditAndDelete = diffDays >= 1; // Kamida 1 kun oldin

  const handleEditClick = () => {
    if (canEditAndDelete) {
      if (onEdit) onEdit(appointment);
    } else {
      // Qabul kuni - ogohlantirish oynasi
      setIsEditAlertOpen(true);
    }
  };

  const handleDeleteClick = () => {
    if (canEditAndDelete) {
      // 1 kun oldin -> tasdiqlab o'chirish mumkin
      setIsConfirmDeleteOpen(true);
    } else {
      // Qabul kuni -> o'chirib bo'lmaydi, faqat "Kelmadi" ga o'tkazish mumkin!
      setIsBlockedDeleteOpen(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-100">
      {/* Click away backdrop */}
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#334155] w-full max-w-[420px] max-h-[90vh] overflow-y-auto text-slate-900 dark:text-white transition-all select-none animate-in zoom-in-95 duration-100">
        {/* TOP ROW: Time (16:30 - 18:30) + Status Badge button + Close */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 dark:border-[#334155]">
          <span className="font-mono text-sm font-black text-slate-900 dark:text-white tracking-tight">
            {startTime} - {endTime}
          </span>

          <div className="flex items-center space-x-2">
            {/* Status Dropdown Trigger */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                className="flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155] hover:bg-slate-200/80 dark:hover:bg-slate-800 transition shadow-xs text-slate-800 dark:text-slate-200"
              >
                <span className={`w-2 h-2 rounded-full ${currentCfg.dotColor}`} />
                <span>{getStatusLabel(currentCfg)}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400" />
              </button>

              {/* Status Menu Dropdown */}
              {isStatusDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-52 bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#334155] py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 select-none">
                  {STATUS_MENU_KEYS.map((sKey) => {
                    const cfg = STATUS_CONFIG[sKey];
                    const Icon = cfg.icon;
                    const isSelected = appointment.status === sKey;
                    return (
                      <button
                        key={sKey}
                        type="button"
                        onClick={() => {
                          onStatusChange(appointment.id, sKey);
                          setIsStatusDropdownOpen(false);
                        }}
                        className={`w-full px-3.5 py-2 text-left text-xs font-bold flex items-center space-x-2.5 transition ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#0F172A]'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${cfg.textColor}`} />
                        <span className="flex-1">{getStatusLabel(cfg)}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-[#0F172A] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* MIDDLE BODY: Patient Info, Balance, Service, Plan Link (Rasmdagidek) */}
        <div className="p-5 space-y-4">
          {/* Patient row: Avatar MK + Name + Phone + Balance */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-full bg-[#DCEBFB] dark:bg-sky-950 text-[#1E56A0] dark:text-sky-300 font-black text-sm flex items-center justify-center shadow-xs flex-shrink-0">
                {initials}
              </div>
              <div>
                <Link
                  href={`/patients/${appointment.patient || 1}`}
                  className="font-black text-sm text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-sky-400 transition"
                >
                  {appointment.patient_name}
                </Link>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {appointment.patient_phone}
                  </p>
                  {/* Dinamik xizmat tili o'zgartirgichi */}
                  <div className="relative" ref={langRef}>
                    <button
                      type="button"
                      onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition cursor-pointer shadow-2xs"
                      title={tr('apptpop2.serviceLanguageClickToChange')}
                    >
                      <span>🌐</span>
                      <span>
                        {patientLang === 'uz' ? "O'zbek" : patientLang === 'en' ? 'English' : 'Русский'}
                      </span>
                      <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                    </button>

                    {isLangDropdownOpen && (
                      <div className="absolute left-0 mt-1.5 w-36 bg-white dark:bg-[#1E293B] rounded-xl shadow-2xl border border-slate-200 dark:border-[#334155] py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                        <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                          {tr('apptpop2.serviceLanguage')}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLangChange('uz')}
                          className={`w-full px-2.5 py-1.5 text-left text-xs font-bold flex items-center justify-between transition ${
                            patientLang === 'uz'
                              ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span>🇺🇿 O‘zbek</span>
                          {patientLang === 'uz' && <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLangChange('ru')}
                          className={`w-full px-2.5 py-1.5 text-left text-xs font-bold flex items-center justify-between transition ${
                            patientLang === 'ru'
                              ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span>🇷🇺 Русский</span>
                          {patientLang === 'ru' && <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLangChange('en')}
                          className={`w-full px-2.5 py-1.5 text-left text-xs font-bold flex items-center justify-between transition ${
                            patientLang === 'en'
                              ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span>🇬🇧 English</span>
                          {patientLang === 'en' && <Check className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Balance */}
            <div className="text-right flex-shrink-0">
              <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-400 block">
                {tr('apptpop2.balance')}
              </span>
              <span
                className={`text-xs font-black font-mono ${
                  balanceNumber < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {balanceNumber.toLocaleString()} {tr('apptpop2.uzs')}
              </span>
            </div>
          </div>

          {/* Service & Doctor row (e.g. "Без услуги" / "Абдуллох Максудов · 2 ч.") */}
          <div className="pt-2 border-t border-slate-100 dark:border-[#334155]/60 space-y-1">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {appointment.procedure || tr('apptpop2.noService')}
            </h4>
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <span>{appointment.doctor_name} · {durLabel}</span>
              {appointment.branch_name && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 border border-blue-200 dark:border-blue-800">
                  <Building2 className="w-2.5 h-2.5" />
                  {appointment.branch_name}
                </span>
              )}
            </div>
          </div>

          {/* Comment / Note row */}
          <div className="flex items-center space-x-2 text-xs font-medium text-slate-700 dark:text-slate-300">
            <MessageSquare className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span className="truncate">
              {appointment.treatment_notes || tr('apptpop2.noNotes')}
            </span>
          </div>
        </div>

        {/* BOTTOM ACTION BAR:
            - Chapda: [Tahrirlash] [O'chirish]
            - O'ngda: [💳 Hisob / Счет / Invoice]
        */}
        <div className="px-5 py-3.5 bg-slate-50/70 dark:bg-[#0F172A]/70 border-t border-slate-100 dark:border-[#334155] flex items-center justify-between rounded-b-2xl">
          {/* 2 ta tugma: Tahrirlash va O'chirish */}
          <div className="flex items-center space-x-2">
            {/* Tahrirlash tugmasi (Pen / SquarePen) */}
            <button
              type="button"
              onClick={handleEditClick}
              title={
                canEditAndDelete
                  ? tr('apptpop2.edit')
                  : tr('apptpop2.editingOnAppointmentDayIsRestricte')
              }
              className="w-9 h-9 rounded-xl border border-slate-200 dark:border-[#334155] bg-white dark:bg-[#1E293B] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center transition shadow-xs active:scale-95"
            >
              <SquarePen className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </button>

            {/* O'chirish tugmasi (Red X inside circle) */}
            <button
              type="button"
              onClick={handleDeleteClick}
              title={
                canEditAndDelete
                  ? tr('apptpop2.delete')
                  : tr('apptpop2.cannotDeleteOnAppointmentDayMove')
              }
              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition shadow-xs active:scale-95 ${
                canEditAndDelete
                  ? 'border-slate-200 dark:border-[#334155] bg-white dark:bg-[#1E293B] hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500'
                  : 'border-slate-200 dark:border-[#334155] bg-slate-100/60 dark:bg-slate-800/60 text-rose-400 hover:bg-rose-50/80 cursor-pointer'
              }`}
            >
              <XCircle className="w-4 h-4 text-rose-500" />
            </button>
          </div>

          {/* O'ng tomonda ko'k [💳 Счет] tugmasi */}
          <button
            type="button"
            onClick={() => onOpenBill(appointment)}
            className="flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md shadow-blue-500/20 transition active:scale-95"
          >
            <CreditCard className="w-4 h-4" />
            <span>{tr('apptpop2.invoice')}</span>
          </button>
        </div>
      </div>

      {/* ══ MODAL 1: 1 KUN OLDIN O'CHIRISHNI TASDIQLASH ══ */}
      {isConfirmDeleteOpen && (
        <div className="fixed inset-0 z-70 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#334155] max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {tk('delete_appointment_title')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tk('cancel_1day_before')}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              {tr('apptpop2.deleteConfirm').replace('{name}', appointment.patient_name || '').replace('{time}', startTime)}
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-[#334155]">
              <button
                type="button"
                onClick={() => setIsConfirmDeleteOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {tr('apptpop2.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmDeleteOpen(false);
                  if (onDelete) onDelete(appointment.id);
                  onClose();
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                {tr('apptpop2.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL 2: QABUL KUNI O'CHIRISHNI TAQIQLASH VA «KELMADI» GA O'TKAZISH ══ */}
      {isBlockedDeleteOpen && (
        <div className="fixed inset-0 z-70 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#334155] max-w-md w-full p-5 space-y-4">
            <div className="flex items-center space-x-3 text-amber-600 dark:text-amber-400">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {tk('cannot_delete_today')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tk('mark_as_noshow_only')}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {tk('noshow_explanation')}
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-[#334155]">
              <button
                type="button"
                onClick={() => setIsBlockedDeleteOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {tr('apptpop2.close')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onStatusChange(appointment.id, 'no_show');
                  setIsBlockedDeleteOpen(false);
                  onClose();
                }}
                className="flex items-center space-x-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                <EyeOff className="w-4 h-4" />
                <span>{tk('move_to_noshow')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL 3: QABUL KUNI TAHRIRLASH HAQIDA BILDIRISHNOMA ══ */}
      {isEditAlertOpen && (
        <div className="fixed inset-0 z-70 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#334155] max-w-md w-full p-5 space-y-4">
            <div className="flex items-center space-x-3 text-sky-600 dark:text-sky-400">
              <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {tk('edit_on_day_title')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tk('edit_on_day_sub')}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {tk('edit_on_day_text')}
            </p>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-[#334155]">
              <button
                type="button"
                onClick={() => {
                  onStatusChange(appointment.id, 'no_show');
                  setIsEditAlertOpen(false);
                  onClose();
                }}
                className="flex items-center space-x-1.5 px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-xs font-bold transition"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>{tk('move_to_noshow')}</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsEditAlertOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition"
                >
                  {tr('apptpop2.close')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditAlertOpen(false);
                    if (onEdit) onEdit(appointment);
                  }}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition"
                >
                  {tr('apptpop2.edit')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
