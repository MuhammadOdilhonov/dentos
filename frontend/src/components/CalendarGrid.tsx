'use client';

import React, { useState, useMemo } from 'react';
import { Employee, Appointment, WorkplaceItem } from '../lib/types';
import AppointmentCard from './AppointmentCard';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { clinicApi } from '../lib/api';
import {
  ChevronLeft,
  ChevronRight,
  Printer,
  Maximize2,
  SlidersHorizontal,
  Clock,
  User,
  Armchair,
  Plus,
  DollarSign,
  AlertTriangle,
  CreditCard,
  CheckCircle2,
  Wallet
} from 'lucide-react';

interface CalendarGridProps {
  currentDate: Date;
  onDateChange: (newDate: Date) => void;
  employees: Employee[];
  appointments: Appointment[];
  onSelectAppointment: (apt: Appointment, rect?: DOMRect) => void;
  onSlotClick: (doctorId: number, timeStr: string) => void;
  workplaces?: WorkplaceItem[];
  currentBranchId?: number | null;
}

export default function CalendarGrid({
  currentDate,
  onDateChange,
  employees,
  appointments,
  onSelectAppointment,
  onSlotClick,
  workplaces = [],
  currentBranchId = null
}: CalendarGridProps) {
  const { t, language, tr } = useI18n();
  const { user } = useAuth();
  // Administrator/kassa (reception) moliyaviy/monitoring KPI panelni KO'RMAYDI.
  const canSeeFinance = ['director', 'deputy_director', 'superadmin'].includes(user?.role || '');
  const [viewMode, setViewMode] = useState<'day' | '3days' | 'week' | 'month'>('day');
  const [groupMode, setGroupMode] = useState<'employees' | 'chairs'>('employees');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Shifokor ustunlarini surib qayta tartiblash — har bir akkaunt uchun saqlanadi
  const orderStorageKey = user ? `32desk_doc_order_${user.id}` : null;
  const [doctorOrder, setDoctorOrder] = useState<number[]>([]);
  const [dragDocId, setDragDocId] = useState<number | null>(null);
  const [dragOverDocId, setDragOverDocId] = useState<number | null>(null);

  React.useEffect(() => {
    if (!orderStorageKey) return;
    // 1) localStorage — darhol (instant + offline/demo zaxira)
    try {
      const raw = localStorage.getItem(orderStorageKey);
      setDoctorOrder(raw ? JSON.parse(raw) : []);
    } catch { setDoctorOrder([]); }
    // 2) SERVERDAN — akkauntga saqlangan tartib (boshqa qurilma/brauzerdan ham bir xil)
    let cancelled = false;
    clinicApi.getUserPrefs().then((prefs) => {
      if (cancelled) return;
      const order = prefs?.calendar_doctor_order;
      if (Array.isArray(order)) {
        setDoctorOrder(order);
        try { localStorage.setItem(orderStorageKey, JSON.stringify(order)); } catch {}
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [orderStorageKey]);

  // Ism to'liq, familiya qisqa: "Muhammad Odilxonov" -> "Muhammad O."
  const shortDocName = (full?: string) => {
    if (!full) return '';
    const parts = full.replace(/^(Dr\.?\s*)/i, '').trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return parts[0] || '';
    const rest = parts.slice(1).map((p) => `${p[0].toUpperCase()}.`).join(' ');
    return `${parts[0]} ${rest}`;
  };

  // Live timer for current time red line
  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Time slots from 09:00 to 22:30 (every 30 mins)
  const timeSlots: string[] = [];
  for (let h = 9; h <= 22; h++) {
    timeSlots.push(`${h.toString().padStart(2, '0')}:00`);
    if (h < 22 || (h === 22)) {
      timeSlots.push(`${h.toString().padStart(2, '0')}:30`);
    }
  }

  const SLOT_HEIGHT = 56; // px per 30 mins
  const BASE_HOUR = 9;
  const BASE_MINUTE = 0;
  const BASE_TOTAL_MINUTES = BASE_HOUR * 60 + BASE_MINUTE;

  // Real-time position calculation for the red line
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const minutesFromStart = currentMinutes - BASE_TOTAL_MINUTES;
  const currentTopOffset = (minutesFromStart / 30) * SLOT_HEIGHT;
  const isWithinRange = minutesFromStart >= 0 && minutesFromStart <= timeSlots.length * 30;
  const currentTimeFormatted = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Filter doctors and sort by branch so colleagues of same filial are clustered together.
  // Agar foydalanuvchi ustunlarni qo'lda surgan bo'lsa — o'sha saqlangan tartib ustun.
  const rawDoctors = employees.filter((e) => e.role === 'doctor');
  const doctors = useMemo(() => {
    const branchSort = (a: Employee, b: Employee) => {
      const aBranch = a.branch_name || (typeof a.branch === 'object' ? (a.branch as any)?.name : '') || 'Boshqa';
      const bBranch = b.branch_name || (typeof b.branch === 'object' ? (b.branch as any)?.name : '') || 'Boshqa';
      return aBranch.localeCompare(bBranch);
    };
    const base = [...rawDoctors];
    if (doctorOrder.length > 0) {
      return base.sort((a, b) => {
        const ia = doctorOrder.indexOf(a.id);
        const ib = doctorOrder.indexOf(b.id);
        if (ia === -1 && ib === -1) return branchSort(a, b);
        if (ia === -1) return 1; // saqlanmaganlar oxiriga
        if (ib === -1) return -1;
        return ia - ib;
      });
    }
    return base.sort(branchSort);
  }, [rawDoctors, doctorOrder]);

  // Ustunni boshqa ustun ustiga tashlaganda tartibni yangilab, akkauntga saqlaymiz
  const reorderable = viewMode === 'day' && groupMode === 'employees';
  const handleReorderDrop = (targetDocId: number) => {
    const src = dragDocId;
    setDragDocId(null);
    setDragOverDocId(null);
    if (src == null || src === targetDocId) return;
    const ids = doctors.map((d) => d.id);
    const from = ids.indexOf(src);
    const to = ids.indexOf(targetDocId);
    if (from === -1 || to === -1) return;
    ids.splice(from, 1);
    ids.splice(to, 0, src);
    setDoctorOrder(ids);
    if (orderStorageKey) {
      try { localStorage.setItem(orderStorageKey, JSON.stringify(ids)); } catch {}
    }
    // SERVERGA saqlaymiz — faqat shu akkauntga, boshqa qurilmadan ham ko'rinadi
    clinicApi.saveUserPref('calendar_doctor_order', ids);
  };

  // Format date display dynamically by active locale
  const localeMap = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' };
  const dateString = currentDate.toLocaleDateString(localeMap[language] || 'ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'long'
  });

  const handlePrevDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    onDateChange(d);
  };

  const handleNextDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    onDateChange(d);
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Group columns by employee or by chairs (loaded from real workplaces for the active branch)
  const chairColors = ['#0EA5E9', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#6366F1'];

  const columns = groupMode === 'employees'
    ? doctors.map((doc) => {
        const bName = doc.branch_name || (typeof doc.branch === 'object' ? (doc.branch as any)?.name : '') || '';
        return {
          id: doc.id,
          title: doc.full_name,
          subtitle: doc.specialty,
          chair: doc.chair,
          avatar: doc.avatar,
          color: doc.color,
          doctorId: doc.id,
          chairName: doc.chair,
          branchName: bName
        };
      })
    : (workplaces && workplaces.length > 0
        ? workplaces.map((wp, idx) => {
            const assignedDoc = doctors.find((d) => d.chair === wp.name || (d as any).chair_name === wp.name);
            return {
              id: wp.id,
              title: wp.name,
              subtitle: assignedDoc ? assignedDoc.full_name : (wp.branch_name || t.chair),
              chair: String(wp.id),
              doctorId: assignedDoc?.id || (doctors[idx % (doctors.length || 1)]?.id) || 1,
              chairName: wp.name,
              color: wp.color || chairColors[idx % chairColors.length],
              avatar: assignedDoc?.avatar,
              branchName: wp.branch_name || ''
            };
          })
        : [
            { id: 101, title: `${t.chair} 1`, subtitle: doctors[0]?.full_name || 'Dr. Alimov', chair: '1', doctorId: doctors[0]?.id || 1, chairName: 'Кресло 1', color: '#0EA5E9', avatar: doctors[0]?.avatar, branchName: '' },
            { id: 102, title: `${t.chair} 2`, subtitle: doctors[1]?.full_name || 'Dr. Usmanov', chair: '2', doctorId: doctors[1]?.id || 2, chairName: 'Кресло 2', color: '#8B5CF6', avatar: doctors[1]?.avatar, branchName: '' },
            { id: 103, title: `${t.chair} 3`, subtitle: doctors[2]?.full_name || 'Dr. Rasulov', chair: '3', doctorId: doctors[2]?.id || 3, chairName: 'Кресло 3', color: '#10B981', avatar: doctors[2]?.avatar, branchName: '' },
            { id: 104, title: `${t.chair} 4`, subtitle: doctors[3]?.full_name || 'Dr. Abdullaeva', chair: '4', doctorId: doctors[3]?.id || 4, chairName: 'Кресло 4', color: '#F59E0B', avatar: doctors[3]?.avatar, branchName: '' }
          ]
      );

  // Helper to compute card position
  const getCardStyle = (apt: Appointment) => {
    const start = new Date(apt.start_time);
    const end = new Date(apt.end_time);

    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const endMinutes = end.getHours() * 60 + end.getMinutes();

    const diffMinutes = Math.max(endMinutes - startMinutes, 30);
    const offsetMinutes = startMinutes - BASE_TOTAL_MINUTES;

    const top = (offsetMinutes / 30) * SLOT_HEIGHT;
    const height = (diffMinutes / 30) * SLOT_HEIGHT - 4;

    return {
      top: `${Math.max(top, 0)}px`,
      height: `${Math.max(height, 36)}px`
    };
  };

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const aptDate = (a: Appointment) => new Date(a.start_time);

  // Dates shown as columns for the 3-day / week views
  const viewDates: Date[] = [];
  if (viewMode === '3days' || viewMode === 'week') {
    const count = viewMode === '3days' ? 3 : 7;
    const start = new Date(currentDate);
    if (viewMode === 'week') {
      const dow = (start.getDay() + 6) % 7; // Monday-based
      start.setDate(start.getDate() - dow);
    }
    for (let i = 0; i < count; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      viewDates.push(d);
    }
  }

  // Month matrix (6 weeks × 7 days) for the month view
  const monthCells: Date[] = [];
  if (viewMode === 'month') {
    const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const startDow = (first.getDay() + 6) % 7; // Monday-based
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - startDow);
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      monthCells.push(d);
    }
  }

  // Unified grid columns for time-based views (day = doctors/chairs, 3day/week = dates)
  interface GridCol {
    key: string;
    headerTop: string;
    headerSub: string;
    badge?: string;
    branchName?: string;
    color: string;
    avatar?: string;
    doctorId?: number;
    appts: Appointment[];
    onSlot: (time: string) => void;
    isToday?: boolean;
    perApptColor?: boolean;
  }

  const gridCols: GridCol[] =
    viewMode === 'day'
      ? columns.map((col) => ({
          key: String(col.id),
          headerTop: col.title,
          headerSub: col.subtitle,
          badge: col.chair,
          branchName: (col as any).branchName || '',
          color: col.color || '#0EA5E9',
          avatar: col.avatar,
          doctorId: col.doctorId,
          appts: appointments.filter((a) => {
            if (!isSameDay(aptDate(a), currentDate)) return false;
            if (groupMode === 'employees') {
              return a.doctor === col.doctorId || (a as any).doctor_id === col.doctorId;
            } else {
              return a.chair_name === col.chairName || (a as any).workplace === col.id || (a as any).workplace_id === col.id;
            }
          }),
          onSlot: (time: string) => onSlotClick(col.doctorId, time)
        }))
      : viewDates.map((d) => ({
          key: d.toISOString(),
          headerTop: d.toLocaleDateString(localeMap[language] || 'ru-RU', { weekday: 'short' }),
          headerSub: d.toLocaleDateString(localeMap[language] || 'ru-RU', { day: 'numeric', month: 'short' }),
          color: '#3B82F6',
          appts: appointments.filter((a) => isSameDay(aptDate(a), d)),
          onSlot: () => {
            onDateChange(new Date(d));
            setViewMode('day');
          },
          isToday: isSameDay(d, new Date()),
          perApptColor: true
        }));

  // Ustun kengligi: noutbukda 12 tagacha shifokor ekranga sig'adi (gorizontal scroll yo'q),
  // 12 tadan ko'p bo'lsa — har biriga 128px beriladi va scroll paydo bo'ladi.
  const manyDocs = viewMode === 'day' && gridCols.length > 12;
  const colMinPx = viewMode === 'day' ? (manyDocs ? 128 : 0) : 120;
  const gridTemplateColumns = `repeat(${gridCols.length}, minmax(${colMinPx}px, 1fr))`;
  // 80px = chapdagi vaqt ustuni kengligi
  const gridMinWidthPx = colMinPx > 0 ? 80 + colMinPx * gridCols.length : undefined;

  // Dynamic daily/period appointments & financial stats
  const activeDayAppointments = useMemo(() => {
    if (viewMode === 'day') {
      return appointments.filter((a) => isSameDay(aptDate(a), currentDate));
    }
    if (viewMode === '3days' || viewMode === 'week') {
      return appointments.filter((a) => viewDates.some((d) => isSameDay(aptDate(a), d)));
    }
    // month
    return appointments.filter((a) => {
      const d = aptDate(a);
      return d.getFullYear() === currentDate.getFullYear() && d.getMonth() === currentDate.getMonth();
    });
  }, [appointments, viewMode, currentDate, viewDates]);

  const stats = useMemo(() => {
    const totalVisits = activeDayAppointments.length;
    const completedVisits = activeDayAppointments.filter((a) => a.status === 'completed').length;
    const inProgressVisits = activeDayAppointments.filter((a) => a.status === 'in_progress').length;
    const waitingVisits = activeDayAppointments.filter((a) =>
      ['confirmed', 'unconfirmed', 'reserved', 'arrived'].includes(a.status)
    ).length;

    const totalRevenuePaid = activeDayAppointments.reduce((sum, a) => sum + (Number(a.paid_amount) || 0), 0);
    const totalValue = activeDayAppointments.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
    const totalDebt = activeDayAppointments.reduce(
      (sum, a) => sum + Math.max(0, (Number(a.price) || 0) - (Number(a.paid_amount) || 0)),
      0
    );
    const debtCount = activeDayAppointments.filter(
      (a) => a.status === 'debt' || (Number(a.price) || 0) > (Number(a.paid_amount) || 0)
    ).length;

    return {
      totalVisits,
      completedVisits,
      inProgressVisits,
      waitingVisits,
      totalRevenuePaid,
      totalValue,
      totalDebt,
      debtCount
    };
  }, [activeDayAppointments]);


  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden select-none transition-colors">
      {/* 2.1. Taqvim Boshqaruvi (Filtrlar paneli) */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-3 transition-colors">
        {/* Date Navigator */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-0.5 shadow-xs">
            <button
              onClick={handlePrevDay}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition"
              title={tr('calgrid.previous')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-100 transition"
            >
              {t.today}
            </button>
            <button
              onClick={handleNextDay}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-300 transition"
              title={tr('calgrid.next')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 capitalize">{dateString}</span>
          </div>
        </div>

        {/* View mode tabs (Kun / 3 Kun / Hafta / Oy) */}
        <div className="flex items-center bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300">
          <button
            onClick={() => setViewMode('day')}
            className={`px-3 py-1.5 rounded-lg transition ${
              viewMode === 'day'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-sky-400 shadow-xs font-bold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.dayView}
          </button>
          <button
            onClick={() => setViewMode('3days')}
            className={`px-3 py-1.5 rounded-lg transition ${
              viewMode === '3days'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-sky-400 shadow-xs font-bold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.threeDaysView}
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`px-3 py-1.5 rounded-lg transition ${
              viewMode === 'week'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-sky-400 shadow-xs font-bold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.weekView}
          </button>
          <button
            onClick={() => setViewMode('month')}
            className={`px-3 py-1.5 rounded-lg transition ${
              viewMode === 'month'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-sky-400 shadow-xs font-bold'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.monthView}
          </button>
        </div>

        {/* Grouping mode: Xodimlar bo'yicha / Kreslolar bo'yicha */}
        <div className="flex items-center space-x-1.5 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setGroupMode('employees')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition ${
              groupMode === 'employees'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-sky-400 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>{t.byEmployees}</span>
          </button>
          <button
            onClick={() => setGroupMode('chairs')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition ${
              groupMode === 'chairs'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-sky-400 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Armchair className="w-3.5 h-3.5" />
            <span>{t.byChairs}</span>
          </button>
        </div>

        {/* Action icons: Print, Fullscreen, Filters */}
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => window.print()}
            className="p-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl transition shadow-xs"
            title={t.print}
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl transition shadow-xs"
            title={tr('calgrid.fullscreen')}
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            className="p-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl transition shadow-xs"
            title={t.filters}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2.1.B. Real-time Daily Financial & Operational Statistics Bar —
          FAQAT moliyaviy ruxsatli rollarga. Administrator/kassa (reception) KO'RMAYDI. */}
      {canSeeFinance && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 px-3.5 py-2.5 bg-slate-100/70 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 transition-colors">
        {/* 1. Received Payment (Kirim / Paid) */}
        <div className="bg-white dark:bg-[#1E293B] p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block truncate">
              {tr('calstats.revenue')}
            </span>
            <div className="flex items-baseline space-x-1 mt-0.5">
              <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400">
                {stats.totalRevenuePaid.toLocaleString()}
              </span>
              <span className="text-[10px] font-bold text-slate-400">UZS</span>
            </div>
            <span className="text-[10px] font-semibold text-emerald-600/90 dark:text-emerald-400/90 block truncate mt-0.5">
              ✓ {stats.completedVisits} {tr('calstats.paidVisits')}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 ml-2">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>

        {/* 2. Outstanding Debt (Dolg / Qarz) */}
        <div className="bg-white dark:bg-[#1E293B] p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block truncate">
              {tr('calstats.debt')}
            </span>
            <div className="flex items-baseline space-x-1 mt-0.5">
              <span className={`text-sm sm:text-base font-black ${stats.totalDebt > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>
                {stats.totalDebt.toLocaleString()}
              </span>
              <span className="text-[10px] font-bold text-slate-400">UZS</span>
            </div>
            <span className={`text-[10px] font-semibold block truncate mt-0.5 ${stats.debtCount > 0 ? 'text-rose-600/90 dark:text-rose-400/90 font-bold' : 'text-slate-400'}`}>
              {stats.debtCount > 0 ? `⚠️ ${stats.debtCount} ${tr('calstats.debtVisits')}` : tr('calstats.noDebt')}
            </span>
          </div>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ml-2 ${stats.totalDebt > 0 ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-500'}`}>
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>

        {/* 3. Total Services Value (Jami xizmatlar) */}
        <div className="bg-white dark:bg-[#1E293B] p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block truncate">
              {tr('calstats.total')}
            </span>
            <div className="flex items-baseline space-x-1 mt-0.5">
              <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                {stats.totalValue.toLocaleString()}
              </span>
              <span className="text-[10px] font-bold text-slate-400">UZS</span>
            </div>
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block truncate mt-0.5">
              {tr('calstats.avg')}: {stats.totalVisits > 0 ? Math.round(stats.totalValue / stats.totalVisits).toLocaleString() : 0} UZS
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 ml-2">
            <CreditCard className="w-4 h-4" />
          </div>
        </div>

        {/* 4. Appointments Monitor (Qabullar soni) */}
        <div className="bg-white dark:bg-[#1E293B] p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block truncate">
              {tr('calstats.visits')}
            </span>
            <div className="flex items-baseline space-x-1 mt-0.5">
              <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                {stats.totalVisits}
              </span>
              <span className="text-[10px] font-bold text-slate-400">{tr('calstats.unitVisits')}</span>
            </div>
            <span className="text-[10px] font-semibold text-indigo-600 dark:text-sky-400 block truncate mt-0.5">
              {stats.completedVisits} {tr('calstats.completed')} • {stats.inProgressVisits} {tr('calstats.inProgress')}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 ml-2">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
      </div>
      )}

      {/* 2.2. Calendar body — month = month grid, otherwise a time grid */}
      {viewMode === 'month' ? (
        <div className="flex-1 overflow-auto p-3 bg-slate-50/30 dark:bg-slate-900/20">
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => {
              const ref = new Date(2024, 0, 1 + i); // Mon..Sun
              return (
                <div key={i} className="text-center text-[11px] font-bold text-slate-400 uppercase py-1">
                  {ref.toLocaleDateString(localeMap[language] || 'ru-RU', { weekday: 'short' })}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {monthCells.map((cell) => {
              const dayAppts = appointments
                .filter((a) => isSameDay(aptDate(a), cell))
                .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
              const inMonth = cell.getMonth() === currentDate.getMonth();
              const today = isSameDay(cell, new Date());
              return (
                <button
                  key={cell.toISOString()}
                  onClick={() => {
                    onDateChange(new Date(cell));
                    setViewMode('day');
                  }}
                  className={`min-h-[96px] text-left p-1.5 rounded-xl border transition hover:border-blue-400 hover:shadow-sm ${
                    inMonth ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/60 dark:bg-slate-900/40 opacity-60'
                  } ${today ? 'border-blue-500 ring-1 ring-blue-400' : 'border-slate-200 dark:border-slate-800'}`}
                >
                  <div className={`text-xs font-bold mb-1 ${today ? 'text-blue-600' : 'text-slate-600 dark:text-slate-300'}`}>
                    {cell.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayAppts.slice(0, 3).map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-1 text-[10px] truncate rounded px-1 py-0.5"
                        style={{ backgroundColor: `${a.doctor_color || '#3B82F6'}22` }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: a.doctor_color || '#3B82F6' }} />
                        <span className="truncate text-slate-700 dark:text-slate-200">
                          {new Date(a.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {a.patient_name}
                        </span>
                      </div>
                    ))}
                    {dayAppts.length > 3 && (
                      <div className="text-[10px] font-bold text-blue-600 dark:text-sky-400 px-1">
                        +{dayAppts.length - 3}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto relative flex flex-col bg-slate-50/30 dark:bg-slate-900/20">
          {/* Sticky header (doctors/chairs for day, dates for 3-day/week) */}
          <div className="sticky top-0 z-30 flex bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-xs" style={{ minWidth: gridMinWidthPx }}>
            <div className="w-20 flex-shrink-0 p-3 bg-slate-100/90 dark:bg-slate-800/90 border-r border-slate-200 dark:border-slate-700/80 flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400">
              <Clock className="w-4 h-4 mr-1 text-slate-400 dark:text-slate-500" />
              <span>{t.time}</span>
            </div>
            <div className="flex-1 grid" style={{ gridTemplateColumns: gridTemplateColumns }}>
              {gridCols.map((col) => {
                const canDrag = reorderable && col.doctorId != null;
                const isDragTarget = canDrag && dragOverDocId === col.doctorId && dragDocId !== col.doctorId;
                return (
                <div
                  key={col.key}
                  draggable={canDrag}
                  onDragStart={canDrag ? () => setDragDocId(col.doctorId!) : undefined}
                  onDragOver={canDrag ? (e) => { e.preventDefault(); if (dragOverDocId !== col.doctorId) setDragOverDocId(col.doctorId!); } : undefined}
                  onDragLeave={canDrag ? () => setDragOverDocId((prev) => (prev === col.doctorId ? null : prev)) : undefined}
                  onDrop={canDrag ? () => handleReorderDrop(col.doctorId!) : undefined}
                  onDragEnd={canDrag ? () => { setDragDocId(null); setDragOverDocId(null); } : undefined}
                  title={canDrag ? tr('calgrid.dragReorder') : undefined}
                  className={`px-1.5 py-1.5 min-h-[50px] border-r border-slate-200 dark:border-slate-800 flex items-center transition ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''} ${
                    isDragTarget ? 'ring-2 ring-inset ring-blue-500 bg-blue-50 dark:bg-blue-950/40' : col.isToday ? 'bg-blue-50/70 dark:bg-blue-950/30' : 'bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/60'
                  } ${dragDocId === col.doctorId ? 'opacity-40' : ''}`}
                >
                  {viewMode === 'day' ? (
                    // Shifokor ustuni — ixcham: avatar + ism (familiya qisqa) + filial·stol bitta qatorda
                    <div className="relative w-full flex items-center gap-1.5 overflow-hidden rounded-lg px-0.5">
                      {/* orqa fon — avatar yoki rang (watermark) */}
                      {col.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={col.avatar} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-10 dark:opacity-[0.14] pointer-events-none select-none" />
                      ) : (
                        <div className="absolute inset-0 opacity-10 dark:opacity-20 pointer-events-none" style={{ backgroundColor: col.color }} />
                      )}
                      {col.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={col.avatar} alt={col.headerTop} draggable={false} className="relative z-10 w-7 h-7 rounded-full object-cover ring-2 ring-white dark:ring-slate-800 shadow-sm shrink-0" />
                      ) : (
                        <div className="relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-white font-black text-xs shadow-sm ring-2 ring-white dark:ring-slate-800 shrink-0" style={{ backgroundColor: col.color }}>
                          {col.headerTop[0]}
                        </div>
                      )}
                      <div className="relative z-10 flex flex-col items-start justify-center min-w-0 flex-1 leading-tight">
                        <p className="text-[11px] font-black text-slate-900 dark:text-white truncate max-w-full" title={col.headerTop}>{shortDocName(col.headerTop)}</p>
                        {/* Filial faqat "barcha filiallar" ko'rinishida chiqadi — bitta filial ochilganda ortiqcha, shuning uchun yashiriladi */}
                        {(() => {
                          const showBranch = !currentBranchId && !!col.branchName;
                          const showBadge = !!col.badge;
                          if (!showBranch && !showBadge) return null;
                          return (
                            <div className="flex items-center gap-1 max-w-full min-w-0">
                              {showBranch && (
                                <span className="text-[9px] font-bold text-cyan-700 dark:text-cyan-300 truncate" title={col.branchName}>
                                  {col.branchName}
                                </span>
                              )}
                              {showBranch && showBadge && <span className="text-[9px] text-slate-300 dark:text-slate-600 shrink-0">·</span>}
                              {showBadge && (
                                <span className="text-[9px] font-semibold text-blue-600 dark:text-sky-400 truncate" title={col.badge}>
                                  {col.badge}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full text-center">
                      <p className={`text-[11px] font-semibold uppercase ${col.isToday ? 'text-blue-600' : 'text-slate-400'}`}>{col.headerTop}</p>
                      <p className={`text-sm font-black ${col.isToday ? 'text-blue-600' : 'text-slate-800 dark:text-white'}`}>{col.headerSub}</p>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>

          {/* Time labels + columns */}
          <div className="flex relative flex-1" style={{ minWidth: gridMinWidthPx }}>
            <div className="w-20 flex-shrink-0 bg-slate-50/80 dark:bg-slate-900/80 border-r border-slate-200 dark:border-slate-800 select-none relative">
              {isWithinRange && (
                <div
                  style={{ top: `${currentTopOffset - 9}px` }}
                  className="absolute left-1 right-1 z-20 bg-red-600 text-white text-[10px] font-mono font-black px-1.5 py-0.5 rounded-md shadow-md flex items-center justify-between pointer-events-none"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  <span>{currentTimeFormatted}</span>
                </div>
              )}
              {timeSlots.map((time) => (
                <div
                  key={time}
                  style={{ height: `${SLOT_HEIGHT}px` }}
                  className="flex items-start justify-center pt-1 border-b border-slate-200 dark:border-slate-800"
                >
                  <span className={`text-[11px] font-mono ${time.endsWith(':00') ? 'font-bold text-slate-700 dark:text-slate-200' : 'font-medium text-slate-500 dark:text-slate-300'}`}>
                    {time}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex-1 grid relative" style={{ gridTemplateColumns: gridTemplateColumns }}>
              {isWithinRange && (
                <div style={{ top: `${currentTopOffset}px` }} className="absolute left-0 right-0 z-20 pointer-events-none flex items-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-600 -ml-1 ring-2 ring-white dark:ring-slate-900 shadow-md" />
                  <div className="flex-1 h-[2px] bg-red-500 shadow-sm shadow-red-500/50" />
                </div>
              )}

              {gridCols.map((col) => (
                <div key={col.key} className="border-r border-slate-200 dark:border-slate-800 relative min-h-full">
                  {timeSlots.map((time) => (
                    <div
                      key={time}
                      style={{ height: `${SLOT_HEIGHT}px` }}
                      onClick={() => col.onSlot(time)}
                      className="border-b border-b-slate-200 dark:border-b-slate-800 hover:bg-blue-50/40 dark:hover:bg-blue-900/20 transition-colors cursor-pointer relative group flex items-center justify-center"
                    >
                      <span className="opacity-0 group-hover:opacity-100 transition text-[10px] text-blue-600 dark:text-sky-400 font-bold bg-white/95 dark:bg-slate-800 px-2 py-0.5 rounded-full shadow-xs border border-blue-200 dark:border-slate-700 flex items-center space-x-1">
                        <Plus className="w-3 h-3" />
                        <span>{t.bookSlot} {time}</span>
                      </span>
                    </div>
                  ))}

                  {col.appts.map((apt) => (
                    <AppointmentCard
                      key={apt.id}
                      appointment={apt}
                      doctorColor={col.perApptColor ? (apt.doctor_color || '#0EA5E9') : col.color}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        onSelectAppointment(apt, rect);
                      }}
                      style={getCardStyle(apt)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
