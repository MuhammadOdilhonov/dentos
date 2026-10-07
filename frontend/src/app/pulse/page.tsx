'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { clinicApi } from '../../lib/api';
import {
  Appointment,
  Employee,
  FinancialTransaction,
  WorkplaceItem,
  Branch
} from '../../lib/types';
import { useI18n } from '../../lib/i18n';
import { useBranch } from '../../lib/branchContext';
import {
  Activity,
  Armchair,
  Clock,
  User,
  CheckCircle2,
  RefreshCw,
  DollarSign,
  Calendar,
  Sparkles,
  ChevronRight,
  Stethoscope,
  ExternalLink,
  ShieldCheck,
  Check,
  Building2,
  MapPin,
  Filter,
  Plus
} from 'lucide-react';
import { useAuth } from '../../lib/auth';

export default function PulsePage() {
  const { user } = useAuth();
  const { t, tr } = useI18n();
  const { currentBranchId, currentBranch, branches, selectBranch } = useBranch();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [workplaces, setWorkplaces] = useState<WorkplaceItem[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'busy' | 'free'>('all');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Keep a live minute ticker for chair elapsed times
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const loadPulseData = useCallback(async () => {
    try {
      const [apts, emps, wp, txs] = await Promise.all([
        clinicApi.getAppointments(),
        clinicApi.getEmployees(),
        clinicApi.getWorkplaces(),
        clinicApi.getTransactions()
      ]);
      setAppointments(apts || []);
      setEmployees(emps || []);
      setWorkplaces(wp || []);
      setTransactions(txs || []);
    } catch (err) {
      console.error('Failed to load clinic pulse data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial fetch and auto-refresh every 15s
  useEffect(() => {
    loadPulseData();
    const interval = setInterval(() => {
      loadPulseData();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadPulseData]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await loadPulseData();
  };

  // 1. Filter today's appointments (branch-aware)
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const todayAppointments = useMemo(() => {
    return appointments.filter((a) => {
      if (!a.start_time || !a.start_time.startsWith(todayStr)) return false;
      if (!currentBranchId) return true;
      return (
        a.branch === currentBranchId ||
        (currentBranch && a.branch_name && a.branch_name.toLowerCase().includes(currentBranch.name.toLowerCase()))
      );
    });
  }, [appointments, todayStr, currentBranchId, currentBranch]);

  // 2. Today's live financial collection (branch-aware)
  const todayCashCollection = useMemo(() => {
    return transactions
      .filter((tx) => {
        if (tx.type !== 'income' || !tx.date?.startsWith(todayStr)) return false;
        if (!currentBranchId) return true;
        return (
          tx.branch === currentBranchId ||
          (currentBranch && (tx as any).branch_name && (tx as any).branch_name.toLowerCase().includes(currentBranch.name.toLowerCase()))
        );
      })
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  }, [transactions, todayStr, currentBranchId, currentBranch]);

  // 3. Dynamic chairs resolution: combine configured workplaces with appointments and branch filters
  const chairsList = useMemo(() => {
    const fallbackChairs: (WorkplaceItem & { branch?: number; branch_name?: string })[] = [
      { id: 1, name: '1-kreslo (Xirurgiya / Implantatsiya)', color: '#3B82F6', branch: 1, branch_name: 'Toshkent Markaziy' },
      { id: 2, name: '2-kreslo (Ortopediya / Protezlash)', color: '#10B981', branch: 1, branch_name: 'Toshkent Markaziy' },
      { id: 3, name: '3-kreslo (Ortodontiya / Breketlar)', color: '#8B5CF6', branch: 2, branch_name: 'Chilonzor' },
      { id: 4, name: '4-kreslo (Terapiya / Endodontiya)', color: '#F59E0B', branch: 2, branch_name: 'Chilonzor' },
      { id: 5, name: '5-kreslo (Bolalar stomatologiyasi)', color: '#EC4899', branch: 3, branch_name: 'Yunusobod' },
      { id: 6, name: '6-kreslo (Estetik restavratsiya)', color: '#06B6D4', branch: 3, branch_name: 'Yunusobod' }
    ];

    const isDemoClinic = !user?.clinicId || user?.clinicId === 1;
    let source: any[] = [];
    if (workplaces.length > 0) {
      source = workplaces;
    } else if (isDemoClinic) {
      source = fallbackChairs;
    } else {
      source = [];
    }

    // Ensure branch mapping exists on every workplace item
    source = source.map((wp, idx) => {
      const brId = wp.branch || ((idx % 3) + 1);
      const brObj = branches.find((b) => b.id === brId);
      return {
        ...wp,
        branch: brId,
        branch_name: wp.branch_name || brObj?.name || (brId === 1 ? 'Toshkent Markaziy' : brId === 2 ? 'Chilonzor' : 'Yunusobod')
      };
    });

    // If a specific branch is selected, filter to that branch's chairs
    if (currentBranchId) {
      source = source.filter((wp) => wp.branch === currentBranchId);
    }

    const nowMs = currentTime.getTime();

    return source.map((wp, idx) => {
      const chairName = wp.name || `Kreslo ${idx + 1}`;
      const chairColor = wp.color || '#3B82F6';
      const chairBranchName = (wp as any).branch_name || 'Toshkent Markaziy';

      // Find matching appointments for this chair
      const chairApts = todayAppointments.filter((a) => {
        if (!a.chair_name) return false;
        const cLower = chairName.toLowerCase();
        const aLower = a.chair_name.toLowerCase();
        return (
          aLower.includes(cLower) ||
          cLower.includes(aLower) ||
          (aLower.includes(`kreslo ${idx + 1}`) || aLower.includes(`кресло ${idx + 1}`))
        );
      });

      // Check if there is an appointment currently in progress or active right now
      const activeApt = chairApts.find((a) => {
        if (a.status === 'in_progress') return true;
        if (a.status === 'completed' || a.status === 'cancelled') return false;
        const startMs = new Date(a.start_time).getTime();
        const endMs = new Date(a.end_time).getTime();
        return startMs <= nowMs && nowMs <= endMs;
      });

      // Find assigned / default doctor for this chair (filtered to branch if possible)
      const assignedDoc = employees.find(
        (e) =>
          e.role === 'doctor' &&
          (!currentBranchId || e.branch === currentBranchId) &&
          (e.chair === chairName ||
            (e.assigned_chairs && e.assigned_chairs.includes(chairName)) ||
            (activeApt && (e.id === activeApt.doctor || e.full_name === activeApt.doctor_name)))
      ) || employees.filter((e) => e.role === 'doctor' && (!currentBranchId || e.branch === currentBranchId))[idx % Math.max(1, employees.filter((e) => e.role === 'doctor').length)];

      // Find upcoming appointments today on this chair
      const upcomingApts = chairApts
        .filter((a) => {
          if (a.status === 'completed' || a.status === 'cancelled') return false;
          if (activeApt && a.id === activeApt.id) return false;
          return new Date(a.start_time).getTime() > nowMs;
        })
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

      const nextApt = upcomingApts[0] || null;

      const isOccupied = Boolean(activeApt);

      let elapsedMinutes = 0;
      let remainingMinutes = 0;
      if (activeApt) {
        const startMs = new Date(activeApt.start_time).getTime();
        const endMs = new Date(activeApt.end_time).getTime();
        elapsedMinutes = Math.max(1, Math.round((nowMs - startMs) / 60000));
        remainingMinutes = Math.max(0, Math.round((endMs - nowMs) / 60000));
      }

      return {
        id: wp.id || idx + 1,
        name: chairName,
        color: chairColor,
        branchName: chairBranchName,
        branchId: (wp as any).branch,
        isOccupied,
        activeApt,
        assignedDoc,
        nextApt,
        elapsedMinutes,
        remainingMinutes,
        totalTodayApts: chairApts.length
      };
    });
  }, [workplaces, todayAppointments, employees, currentTime, currentBranchId, branches]);

  // Filtered chairs by status (all / busy / free)
  const filteredChairs = useMemo(() => {
    if (filterMode === 'busy') return chairsList.filter((c) => c.isOccupied);
    if (filterMode === 'free') return chairsList.filter((c) => !c.isOccupied);
    return chairsList;
  }, [chairsList, filterMode]);

  // 4. Waiting Queue in Reception (branch-aware)
  const waitingQueue = useMemo(() => {
    return todayAppointments
      .filter((a) => a.status === 'confirmed' || a.status === 'new' || a.status === 'arrived')
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [todayAppointments]);

  // Metrics
  const totalChairs = chairsList.length;
  const occupiedCount = chairsList.filter((c) => c.isOccupied).length;
  const occupancyPercent = totalChairs > 0 ? Math.round((occupiedCount / totalChairs) * 100) : 0;
  const activeTreatmentsCount = occupiedCount;
  const waitingCount = waitingQueue.length;

  const formatMoney = (val: number) => (Number(val) || 0).toLocaleString('uz-UZ');

  return (
    <div className="space-y-6 text-slate-900 dark:text-white transition-colors">
      {/* 1. Page Header with Live Indicator & Quick Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {t.pulse || 'Klinika Pulsi'}
            </h1>
            <span className="px-2.5 py-0.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded-full text-xs font-bold uppercase flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>{tr('pulse.liveMode')}</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Stomatologik kreslolar bandligi, muolaja davomiyligi va navbatning real vaqtdagi monitoringi
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          {/* Live Sync Badge */}
          <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 bg-white dark:bg-[#1E293B] rounded-xl border border-slate-200 dark:border-[#334155] text-xs font-semibold shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-600 dark:text-slate-300">Har 15 soniyada avto-yangilanish</span>
          </div>

          {/* Manual Refresh Button */}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-[#1E293B] text-slate-700 dark:text-white border border-slate-200 dark:border-[#334155] hover:bg-slate-50 dark:hover:bg-[#0F172A] transition disabled:opacity-50 shadow-xs"
            title={tr('pulse.refreshTitle')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-500' : ''}`} />
            <span>{tr('pulse.refresh')}</span>
          </button>
        </div>
      </div>

      {/* 1.1 Branch Filter Navigation Bar */}
      <div className="bg-white dark:bg-[#1E293B] p-3 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 flex items-center justify-center border border-blue-200 dark:border-blue-800">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-800 dark:text-white block">
              Filial bo‘yicha jonli monitoring:
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {currentBranchId ? `${tr('pulse.activeBranch')}: ${currentBranch?.name || ''}` : tr('pulse.allBranchesView')}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => selectBranch(null)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
              !currentBranchId
                ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-500/20'
                : 'bg-slate-100 dark:bg-[#0F172A] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <span>{tr('pulse.allBranches')}</span>
            <span
              className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                !currentBranchId ? 'bg-blue-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              Umumiy
            </span>
          </button>

          {(branches.length > 0
            ? branches
            : [
                { id: 1, name: 'Toshkent Markaziy' },
                { id: 2, name: 'Chilonzor' },
                { id: 3, name: 'Yunusobod' }
              ]
          ).map((b) => {
            const isSelected = currentBranchId === b.id;
            return (
              <button
                key={b.id}
                onClick={() => selectBranch(isSelected ? null : b.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-500/20'
                    : 'bg-slate-100 dark:bg-[#0F172A] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 opacity-70" />
                <span>{b.name}</span>
                {isSelected && <Check className="w-3.5 h-3.5 ml-1" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Top Live Real-time KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Occupancy % */}
        <div className="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
              {t.roomOccupancy || 'Kreslolar bandligi'}
            </p>
            <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
              {occupancyPercent}%
            </h3>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
              {totalChairs} ta kreslodan {occupiedCount} tasi band ({totalChairs - occupiedCount} bo‘sh)
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-sky-950/60 text-blue-600 dark:text-sky-400 border border-blue-200/60 dark:border-sky-800/60 flex items-center justify-center shadow-xs">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        {/* Patients currently in treatment */}
        <div className="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
              Muolajadagi bemorlar
            </p>
            <h3 className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 mt-1">
              {activeTreatmentsCount}
            </h3>
            <p className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold mt-0.5">
              Kreslolarda muolaja ketmoqda
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200/60 dark:border-purple-800/60 flex items-center justify-center shadow-xs">
            <Armchair className="w-6 h-6" />
          </div>
        </div>

        {/* Waiting in Reception */}
        <div className="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
              Kutish zalida (Resepshn)
            </p>
            <h3 className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 mt-1">
              {waitingCount}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
              Bugun navbatdagi qabullar
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60 flex items-center justify-center shadow-xs">
            <User className="w-6 h-6" />
          </div>
        </div>

        {/* Today's Cash Collection */}
        <div className="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
              Bugungi tushum (Kassa)
            </p>
            <h3 className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1 truncate">
              {formatMoney(todayCashCollection)} UZS
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
              Bugun qabul qilingan to‘lovlar
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60 flex items-center justify-center shadow-xs">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 3. Chairs Interactive Visualizer Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Armchair className="w-5 h-5 text-blue-600 dark:text-sky-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Stomatologik kabinetlar va kreslolar holati
            </h2>
            {currentBranchId && (
              <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-bold">
                {currentBranch?.name}
              </span>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center bg-slate-100 dark:bg-[#0F172A] p-1 rounded-xl border border-slate-200 dark:border-[#334155] self-start sm:self-auto">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filterMode === 'all'
                  ? 'bg-white dark:bg-[#1E293B] text-blue-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Barchasi ({chairsList.length})
            </button>
            <button
              onClick={() => setFilterMode('busy')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filterMode === 'busy'
                  ? 'bg-white dark:bg-[#1E293B] text-rose-600 dark:text-rose-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Band ({occupiedCount})
            </button>
            <button
              onClick={() => setFilterMode('free')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filterMode === 'free'
                  ? 'bg-white dark:bg-[#1E293B] text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Bo‘sh ({totalChairs - occupiedCount})
            </button>
          </div>
        </div>

        {/* Chairs Grid or Empty State */}
        {chairsList.length === 0 ? (
          <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-[#1E293B] p-12 text-center shadow-xs">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-sky-400">
              <Armchair className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Hozircha kreslolar mavjud emas</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-5">
              Ushbu klinikaga hali stomatologik kreslolar yoki kabinetlar qo‘shilmagan. Sozlamalar bo‘limidan yangi ish o‘rni (kreslo) yarating.
            </p>
            <a
              href="/settings"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Yangi kreslo qo‘shish
            </a>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredChairs.map((chair) => {
            const isBusy = chair.isOccupied;
            const apt = chair.activeApt;
            const doc = chair.assignedDoc;
            const docName = apt?.doctor_name || doc?.full_name || tr('pulse.onDutyDoctor');
            const docAvatar = doc?.avatar;
            const docSpec = doc?.specialty || tr('pulse.dentist');

            return (
              <div
                key={chair.id}
                className={`p-5 rounded-3xl border transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                  isBusy
                    ? 'bg-white dark:bg-[#1E293B] border-rose-200 dark:border-rose-900/80 shadow-md ring-1 ring-rose-300/60 dark:ring-rose-700/60'
                    : 'bg-white dark:bg-[#1E293B] border-slate-200 dark:border-[#334155] hover:border-slate-300 dark:hover:border-slate-600 shadow-xs'
                }`}
              >
                <div>
                  {/* Chair Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: chair.color }}
                      />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[140px]" title={chair.name}>
                        {chair.name}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center space-x-1 ${
                        isBusy
                          ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300'
                          : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isBusy ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'
                        }`}
                      />
                      <span>{isBusy ? tr('pulse.busy') : tr('pulse.free')}</span>
                    </span>
                  </div>

                  {/* Branch Tag */}
                  <div className="mb-2 flex items-center space-x-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <Building2 className="w-3 h-3 text-blue-500" />
                    <span>{chair.branchName}</span>
                  </div>

                  {/* Doctor Info */}
                  <div className="flex items-center space-x-3 mb-4 p-2 rounded-xl bg-slate-50/80 dark:bg-[#0F172A] border border-slate-100 dark:border-[#334155]">
                    {docAvatar ? (
                      <img
                        src={docAvatar}
                        alt={docName}
                        className="w-10 h-10 rounded-xl object-cover"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-xl text-white font-bold text-xs flex items-center justify-center shadow-xs"
                        style={{ backgroundColor: doc?.color || chair.color || '#0284C7' }}
                      >
                        {docName.split(' ')[1]?.[0] || docName[0] || 'D'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {docName}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {docSpec}
                      </p>
                    </div>
                  </div>

                  {/* Body: Treatment Details or Free Status */}
                  {isBusy && apt ? (
                    <div className="p-3.5 bg-rose-50/70 dark:bg-rose-950/30 rounded-2xl border border-rose-200/80 dark:border-rose-900/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-rose-800 dark:text-rose-300 font-bold uppercase">
                          Muolajadagi bemor:
                        </span>
                        <Link
                          href={`/patients/${apt.patient}`}
                          className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline flex items-center space-x-0.5"
                        >
                          <span>{tr('pulse.card')}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </Link>
                      </div>

                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {apt.patient_name}
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate" title={apt.treatment_notes || apt.procedure}>
                        {apt.treatment_notes || apt.procedure || tr('pulse.defaultProcedure')}
                      </p>

                      <div className="flex items-center justify-between text-[10px] font-semibold text-rose-700 dark:text-rose-300 pt-1 border-t border-rose-200/60 dark:border-rose-900/50">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3 h-3 inline" />
                          <span>{tr('pulse.inChair')}: {chair.elapsedMinutes} {tr('pulse.minutes')}</span>
                        </span>
                        {chair.remainingMinutes > 0 && (
                          <span>~{chair.remainingMinutes} daq qoldi</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 dark:bg-[#0F172A] rounded-2xl border border-slate-200/80 dark:border-[#334155] space-y-2">
                      <p className="text-center text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center justify-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{tr('pulse.readyForVisit')}</span>
                      </p>
                      {chair.nextApt ? (
                        <div className="pt-2 border-t border-slate-200/60 dark:border-[#334155] text-[11px] text-slate-600 dark:text-slate-300">
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Keyingi qabul:</p>
                          <div className="flex items-center justify-between font-medium mt-0.5">
                            <span className="truncate">{chair.nextApt.patient_name}</span>
                            <span className="font-mono font-bold text-blue-600 dark:text-sky-400">
                              {new Date(chair.nextApt.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 text-center pt-1">
                          Bugunga boshqa qabullar rejalashtirilmagan
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer: Sterilization status and today count */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#334155] flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center space-x-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{tr('pulse.sterilization')}</span>
                  </span>
                  <span className="font-mono font-bold text-slate-600 dark:text-slate-300">
                    Bugun: {chair.totalTodayApts} ta
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* 4. Real-time Waiting Queue in Reception */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <User className="w-4 h-4 text-emerald-500" />
              <span>{tr('pulse.waitingRoom')}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Bugun jadval bo‘yicha kelgan va qabulni kutayotgan bemorlar ro‘yxati
            </p>
          </div>
          <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold self-start sm:self-auto">
            {waitingQueue.length} ta bemor navbatda
          </span>
        </div>

        {waitingQueue.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {waitingQueue.map((apt) => (
              <div
                key={apt.id}
                className="p-3.5 bg-slate-50/80 dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155] rounded-xl flex items-center justify-between text-xs hover:border-blue-300 dark:hover:border-sky-700 transition"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold flex items-center justify-center shrink-0 shadow-xs">
                    {apt.patient_name[0] || 'B'}
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={`/patients/${apt.patient}`}
                      className="font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-sky-400 truncate block"
                    >
                      {apt.patient_name}
                    </Link>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {apt.doctor_name} • <span className="font-medium">{apt.chair_name || 'Kreslo'}</span>
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0 ml-2">
                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 px-2 py-1 rounded-md border border-emerald-200 dark:border-emerald-800 block">
                    {new Date(apt.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                    {apt.status === 'confirmed' ? tr('pulse.arrived') : tr('pulse.waiting')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border border-dashed border-slate-200 dark:border-[#334155] rounded-2xl text-slate-400">
            <User className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-xs font-semibold">Hozirda kutish zalida navbat yo‘q</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Barcha kelgan bemorlar o‘z shifokorlari kabinetida qabul qilinmoqda
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
