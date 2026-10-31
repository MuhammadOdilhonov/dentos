'use client';

import React from 'react';
import { Appointment } from '../lib/types';
import {
  Circle,
  Check,
  AlertCircle,
  Clock,
  ArrowDownCircle,
  PlayCircle,
  XCircle,
  EyeOff,
  CheckCircle2,
  FileText,
  DollarSign,
  MessageSquare,
  AlertTriangle,
  Stethoscope
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';

interface AppointmentCardProps {
  appointment: Appointment;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;
  doctorColor?: string;
}

export const APPOINTMENT_STATUS_MAP: Record<
  string,
  {
    icon: React.ElementType;
    color: string;
    bg: string;
    labelKey: string;
  }
> = {
  new: { icon: Circle, color: '#3B82F6', bg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-400/40', labelKey: 'aptst_new' },
  confirmed: { icon: Check, color: '#06B6D4', bg: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-400/40', labelKey: 'aptst_confirmed' },
  unconfirmed: { icon: AlertCircle, color: '#F59E0B', bg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-400/40', labelKey: 'aptst_unconfirmed' },
  late: { icon: Clock, color: '#F97316', bg: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-400/40', labelKey: 'aptst_late' },
  arrived: { icon: ArrowDownCircle, color: '#EAB308', bg: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-400/40', labelKey: 'aptst_arrived' },
  in_progress: { icon: PlayCircle, color: '#10B981', bg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-400/40', labelKey: 'aptst_in_progress' },
  waiting_bill: { icon: FileText, color: '#8B5CF6', bg: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-400/40', labelKey: 'aptst_waiting_bill' },
  cancelled: { icon: XCircle, color: '#EF4444', bg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-400/40', labelKey: 'aptst_cancelled' },
  no_show: { icon: EyeOff, color: '#64748B', bg: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-400/40', labelKey: 'aptst_no_show' },
  completed: { icon: CheckCircle2, color: '#0D9488', bg: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-400/40', labelKey: 'aptst_completed' },
  debt: { icon: AlertTriangle, color: '#D97706', bg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-400/40', labelKey: 'aptst_debt' },
  reserved: { icon: Circle, color: '#3B82F6', bg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-400/40', labelKey: 'aptst_reserved' }
};

export default function AppointmentCard({ appointment, onClick, style, doctorColor }: AppointmentCardProps) {
  const { language, tk, tr } = useI18n();
  const { user } = useAuth();

  // Role check for doctor
  const isDoctorRole = user?.role === 'doctor';
  const isMyAppointment = isDoctorRole && Boolean(
    (user.id && String(appointment.doctor) === String(user.id)) ||
    (user.name && appointment.doctor_name && (
      user.name.toLowerCase().includes(appointment.doctor_name.toLowerCase()) ||
      appointment.doctor_name.toLowerCase().includes(user.name.toLowerCase())
    ))
  );

  // Doctor color indicator
  const docColor = doctorColor || appointment.doctor_color || '#0EA5E9';

  // Status mapping
  const statusCfg = APPOINTMENT_STATUS_MAP[appointment.status] || APPOINTMENT_STATUS_MAP.new;
  const StatusIcon = statusCfg.icon;
  const statusLabel = tk(statusCfg.labelKey);

  // Time format
  const startTimeStr = new Date(appointment.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endTimeStr = new Date(appointment.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Duration in minutes to dynamically adjust layout density
  const startMs = new Date(appointment.start_time).getTime();
  const endMs = new Date(appointment.end_time).getTime();
  const diffMinutes = Math.max(30, Math.round((endMs - startMs) / 60000));
  const isCompact = diffMinutes <= 35; // 30-minute short slot
  const isMedium = diffMinutes > 35 && diffMinutes <= 65; // 45-60 min standard slot
  const isLarge = diffMinutes > 65; // 90+ min extended slot

  // Financial calculations
  const price = appointment.price || 0;
  const paid = appointment.paid_amount || 0;
  const debt = Math.max(0, price - paid);
  const hasDebt = debt > 0 || appointment.status === 'debt';
  const isFullyPaid = paid > 0 && debt === 0;
  const isZeroPrice = price === 0;

  // Localized texts
  const tPaid = tk('apt_paid');
  const tDebt = tk('aptst_debt');
  const tUnpaid = tk('apt_unpaid');
  const tTotal = tk('total_2');
  const tConsultation = tk('consultation');

  // Patient initials
  const nameParts = appointment.patient_name.trim().split(' ').filter(Boolean);
  const initials =
    nameParts.length >= 2
      ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
      : (nameParts[0]?.slice(0, 2) || 'Б').toUpperCase();

  // Container styling — yakunlangan naryad QIZIL emas, YASHIL (teal) halqa bilan ko'rsatiladi
  const borderRingClass = appointment.status === 'completed'
    ? 'ring-1 ring-teal-500/70'
    : appointment.status === 'debt'
    ? 'ring-1 ring-amber-500/70'
    : appointment.status === 'in_progress'
    ? 'ring-1 ring-emerald-500/80 animate-pulse'
    : '';

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      style={style}
      className={`absolute left-1 right-1 rounded-xl cursor-pointer transition-all hover:shadow-lg hover:z-20 flex overflow-hidden select-none z-10 bg-white dark:bg-[#1E293B] border border-slate-200/90 dark:border-slate-700/80 shadow-xs group ${borderRingClass} ${
        isDoctorRole && isMyAppointment ? 'ring-2 ring-blue-500/70' : ''
      }`}
    >
      {/* 1. DOCTOR VERTICAL ACCENT STRIPE */}
      <div
        className="w-1.5 shrink-0 transition-colors"
        style={{ backgroundColor: docColor }}
        title={`${appointment.doctor_name || 'Shifokor'}`}
      />

      {/* 2. CARD CONTENT BODY */}
      <div className="flex-1 p-2.5 sm:p-3 flex flex-col justify-between overflow-hidden min-w-0">
        {/* COMPACT LAYOUT (30-min slot) */}
        {isCompact ? (
          <div className="flex flex-col justify-between h-full gap-0.5 min-w-0">
            {/* Top row: time + patient + status badge */}
            <div className="flex items-center justify-between gap-1 min-w-0">
              <div className="flex items-center space-x-1.5 truncate min-w-0">
                <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                  {startTimeStr}
                </span>
                <span className="font-extrabold text-xs text-slate-900 dark:text-white truncate">
                  {appointment.patient_name}
                </span>
              </div>
              <div
                className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${statusCfg.color}25` }}
                title={`${tk('appointment_status_label')}: ${statusLabel}`}
              >
                <StatusIcon className="w-2.5 h-2.5" style={{ color: statusCfg.color }} />
              </div>
            </div>

            {/* Bottom row: Procedure + Financial Badge */}
            <div className="flex items-center justify-between gap-1 text-[10px] min-w-0">
              <span className="truncate text-slate-600 dark:text-slate-300 font-medium">
                {appointment.treatment_notes || appointment.procedure || tConsultation}
              </span>

              {/* Financial Chip */}
              {hasDebt ? (
                <span className="px-1.5 py-0.5 rounded font-black text-[9px] bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 shrink-0 border border-rose-200 dark:border-rose-900/60 truncate max-w-[120px]">
                  {tDebt}: {debt > 0 ? `${debt.toLocaleString()}` : tDebt}
                </span>
              ) : isFullyPaid ? (
                <span className="px-1.5 py-0.5 rounded font-black text-[9px] bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-200 dark:border-emerald-900/60 truncate max-w-[120px]">
                  ✓ {paid.toLocaleString()}
                </span>
              ) : price > 0 ? (
                <span className="px-1.5 py-0.5 rounded font-bold text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0 truncate max-w-[100px]">
                  {price.toLocaleString()}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          /* STANDARD & EXPANDED LAYOUT (45-60+ min slots) */
          <div className="flex flex-col justify-between h-full space-y-1 min-w-0">
            {/* Header: Time + Initials + Status Chip + Naryad */}
            <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 dark:border-slate-800/80 pb-1 min-w-0">
              <div className="flex items-center space-x-1.5 min-w-0">
                <span className="flex items-center space-x-1 font-mono text-[11px] font-extrabold text-slate-700 dark:text-slate-200 truncate">
                  <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>{startTimeStr} – {endTimeStr}</span>
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {/* Qizil "Naryad" belgisi OLIB TASHLANDI — yakunlangandan keyin qizil bo'lib turmasin.
                    Yakunlangan holati status chip (Yakunlangan) orqali ko'rsatiladi. */}
                {/* Status chip with label */}
                <div
                  className="flex items-center space-x-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border"
                  style={{
                    backgroundColor: `${statusCfg.color}15`,
                    borderColor: `${statusCfg.color}40`,
                    color: statusCfg.color
                  }}
                  title={`${tk('appointment_status_label')}: ${statusLabel}`}
                >
                  <StatusIcon className="w-2.5 h-2.5" />
                  <span className="truncate max-w-[65px]">{statusLabel}</span>
                </div>
              </div>
            </div>

            {/* Middle: Patient Name & Treatment */}
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-1">
                <h4 className="font-black text-xs sm:text-[13px] text-slate-900 dark:text-white truncate tracking-tight">
                  {appointment.patient_name}
                </h4>
                {appointment.sms_sent && (
                  <span title="SMS yuborilgan" className="text-emerald-500 shrink-0 ml-1">
                    <MessageSquare className="w-3 h-3" />
                  </span>
                )}
              </div>
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 truncate mt-0.5">
                {appointment.treatment_notes || appointment.procedure || tConsultation}
              </p>
              {isLarge && appointment.doctor_name && (
                <div className="flex items-center space-x-1 text-[10px] text-slate-400 mt-0.5 font-medium truncate">
                  <Stethoscope className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{appointment.doctor_name}</span>
                </div>
              )}
            </div>

            {/* Bottom: FINANCIAL DETAILS (Qabul qilingan pul & Qarz) */}
            <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between text-[10px] gap-1 min-w-0">
              {/* Financial badge breakdown */}
              {isZeroPrice ? (
                <span className="text-[10px] font-bold text-slate-400 italic">
                  {tConsultation}
                </span>
              ) : hasDebt ? (
                <div className="flex flex-wrap items-center gap-1 min-w-0">
                  {paid > 0 ? (
                    <>
                      <span className="px-1.5 py-0.5 rounded font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60 shrink-0">
                        {tPaid}: {paid.toLocaleString()}
                      </span>
                      <span className="px-1.5 py-0.5 rounded font-black bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200/80 dark:border-rose-800/60 shrink-0">
                        {tDebt}: {debt.toLocaleString()} UZS
                      </span>
                    </>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded font-black bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200/80 dark:border-rose-800/60 flex items-center space-x-1 shrink-0">
                      <AlertTriangle className="w-2.5 h-2.5 inline shrink-0" />
                      <span>{tUnpaid}: {debt.toLocaleString()} UZS</span>
                    </span>
                  )}
                </div>
              ) : isFullyPaid ? (
                <div className="flex items-center space-x-1 shrink-0">
                  <span className="px-1.5 py-0.5 rounded font-black bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center space-x-1">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                    <span>{tPaid}: {paid.toLocaleString()} UZS</span>
                  </span>
                </div>
              ) : (
                <span className="px-1.5 py-0.5 rounded font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                  {tTotal}: {price.toLocaleString()} UZS
                </span>
              )}

              {/* Total service price indicator on right */}
              {!isZeroPrice && hasDebt && paid > 0 && (
                <span className="font-bold text-slate-400 text-[9px] shrink-0 ml-auto">
                  {tTotal}: {price.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
