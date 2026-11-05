'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useI18n } from '../lib/i18n';
import { clinicApi } from '../lib/api';
import { useBranch } from '../lib/branchContext';
import {
  Employee,
  Patient,
  Appointment,
  FinancialTransaction,
  WarehouseItem,
  DentalLabOrder,
  Branch,
  WorkplaceItem
} from '../lib/types';
import {
  DollarSign,
  Calendar,
  Users,
  TrendingUp,
  AlertCircle,
  Clock,
  Package,
  FlaskConical,
  CreditCard,
  Building2,
  Armchair,
  Stethoscope,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  FileSpreadsheet,
  RefreshCw,
  Download,
  Settings,
  Edit3,
  X,
  Check,
  MapPin
} from 'lucide-react';
import { useAuth } from '../lib/auth';

export default function DirectorDashboard() {
  const { user } = useAuth();
  // Direktor o'rinbosari (deputy) oylik moliyaviy rejani FAQAT KO'RADI — yoza/tahrirlay olmaydi.
  const isDeputy = user?.role === 'deputy_director';
  // Administrator/kassa (reception) MOLIYAVIY va analitik ko'rsatkichlarni KO'RMAYDI:
  // tushum, foyda, qarz, o'rtacha chek, qabullar monitoringi, jami xizmatlar.
  const canSeeFinance = ['director', 'deputy_director', 'superadmin'].includes(user?.role || '');
  const { language, tr } = useI18n();
  const { currentBranchId, currentBranch } = useBranch();
  const [period, setPeriod] = useState<'today' | 'yesterday' | 'week' | 'month' | 'year'>('month');

  // Real data states fetched from clinicApi
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [warehouse, setWarehouse] = useState<WarehouseItem[]>([]);
  const [labOrders, setLabOrders] = useState<DentalLabOrder[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [workplaces, setWorkplaces] = useState<WorkplaceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const rawCid = user?.clinicId;
  const cid = rawCid ?? 1;
  // Soxta (demo) ma'lumot ko'rsatilmaydi — har bir klinika faqat o'z real ma'lumotini oladi.
  const isDemo = false;

  // Per-branch monthly plans state (Branch ID -> Target UZS)
  const defaultBranchTargets = useMemo<Record<number, number>>(() => {
    if (!isDemo) return {} as Record<number, number>;
    const demo: Record<number, number> = {
      1: 150000000, // Toshkent Markaziy
      2: 80000000,  // Chilonzor
      3: 70000000   // Yunusobod
    };
    return demo;
  }, [isDemo]);

  const [branchPlans, setBranchPlans] = useState<Record<number, number>>(() => {
    if (typeof window !== 'undefined') {
      const storageKey = isDemo ? '32desk_branch_plans_current' : `32desk_branch_plans_clinic_${cid}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === 'object') return { ...defaultBranchTargets, ...parsed };
        } catch (e) {}
      }
    }
    return defaultBranchTargets;
  });

  const [singleClinicPlan, setSingleClinicPlan] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const storageKey = isDemo ? '32desk_monthly_plan_current' : `32desk_monthly_plan_clinic_${cid}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const val = Number(stored);
        if (!isNaN(val) && val > 0) return val;
      }
    }
    return isDemo ? 300000000 : 0;
  });

  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [inputBranchPlans, setInputBranchPlans] = useState<Record<number, number>>(branchPlans);
  const [inputSinglePlan, setInputSinglePlan] = useState<number>(singleClinicPlan);
  // Reja backenddan yuklanmaguncha avto-modal ochilmaydi (cid race oldini oladi)
  const [planLoaded, setPlanLoaded] = useState<boolean>(false);

  // Oylik rejani BAZADAN yuklaymiz (localStorage emas). cid aniqlangach ishga tushadi.
  useEffect(() => {
    if (isDemo) { setPlanLoaded(true); return; }
    if (!rawCid) return; // user hali yuklanmadi — kutamiz
    let cancelled = false;
    (async () => {
      const plan = await clinicApi.getMonthlyPlan(undefined, cid);
      if (cancelled) return;
      if (plan) {
        const bp: Record<number, number> = {};
        Object.entries(plan.branch_plans || {}).forEach(([k, v]) => { bp[Number(k)] = Number(v) || 0; });
        if (Object.keys(bp).length > 0) { setBranchPlans(bp); setInputBranchPlans(bp); }
        if (Number(plan.single_clinic_plan) > 0) {
          setSingleClinicPlan(Number(plan.single_clinic_plan));
          setInputSinglePlan(Number(plan.single_clinic_plan));
        }
      }
      setPlanLoaded(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCid, cid]);

  // Dynamically computed target:
  // If no branches exist, returns overall clinic plan target.
  // If currentBranchId is chosen, returns that branch's target.
  // If null ("Umumiy"), returns sum of all branch plans.
  const monthlyPlanTarget = useMemo(() => {
    if (branches.length === 0) {
      return singleClinicPlan;
    }
    if (currentBranchId) {
      return Number(branchPlans[currentBranchId]) || defaultBranchTargets[currentBranchId] || 0;
    }
    const sum = Object.values(branchPlans).reduce((acc, v) => acc + (Number(v) || 0), 0);
    return sum > 0 ? sum : singleClinicPlan;
  }, [branches.length, currentBranchId, branchPlans, defaultBranchTargets, singleClinicPlan]);

  const handleSavePlans = (newPlans: Record<number, number>, newSinglePlan: number) => {
    setBranchPlans(newPlans);
    setSingleClinicPlan(newSinglePlan);
    // BAZAGA yozamiz (localStorage emas) — logout/boshqa qurilmada ham saqlanadi.
    const branchPlansStr: Record<string, number> = {};
    Object.entries(newPlans).forEach(([k, v]) => { branchPlansStr[String(k)] = Number(v) || 0; });
    clinicApi.saveMonthlyPlan({
      single_clinic_plan: Number(newSinglePlan) || 0,
      branch_plans: branchPlansStr,
      acknowledged: true,
    }, cid).catch(() => {});
    if (typeof window !== 'undefined') {
      // localStorage faqat tezkor kesh sifatida (backend asosiy manba)
      const branchKey = isDemo ? '32desk_branch_plans_current' : `32desk_branch_plans_clinic_${cid}`;
      const planKey = isDemo ? '32desk_monthly_plan_current' : `32desk_monthly_plan_clinic_${cid}`;
      localStorage.setItem(branchKey, JSON.stringify(newPlans));
      const total = branches.length > 0
        ? Object.values(newPlans).reduce((acc, v) => acc + (Number(v) || 0), 0)
        : newSinglePlan;
      localStorage.setItem(planKey, total.toString());
      const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
      localStorage.setItem(`32desk_plan_ack_${cid}_${monthKey}`, '1');
    }
    setIsPlanModalOpen(false);
  };

  // Oy boshida (yoki reja hali belgilanmagan bo'lsa) oylik moliyaviy reja modalini avtomatik ochamiz
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isDeputy) return; // deputy rejani tahrirlamaydi — modal avto-ochilmaydi
    if (!planLoaded) return; // BAZADAN reja yuklanmaguncha kutamiz (aks holda bekorga ochiladi)
    // Joriy oy uchun reja qiymati bormi? (backenddan state'ga yuklangan)
    const hasPlan = branches.length > 0
      ? Object.values(branchPlans).some((v) => Number(v) > 0)
      : Number(singleClinicPlan) > 0;
    // Reja umuman belgilanmagan bo'lsa — kiritish uchun ochamiz.
    if (!hasPlan) {
      setInputBranchPlans(branchPlans);
      setInputSinglePlan(singleClinicPlan);
      setIsPlanModalOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planLoaded, branchPlans, singleClinicPlan, branches.length]);

  // Multi-language text dictionary for dashboard
  const txt = {
    uz: {
      title: 'Direktor boshqaruv paneli',
      subtitle: 'Klinikaning real vaqtdagi moliyaviy va operatsion ko‘rsatkichlari (100% jonli baza)',
      refresh: 'Yangilash',
      exportExcel: 'CSV yuklab olish',
      today: 'Bugun',
      yesterday: 'Kecha',
      week: 'Hafta',
      month: 'Joriy oy',
      year: '2026-yil',
      totalRevTitle: 'Umumiy tushum',
      targetLabel: 'Oylik reja: 250,000,000 UZS',
      netProfitTitle: 'Sof foyda (EBITDA)',
      todayVisitsTitle: 'Qabullar soni',
      newPatientsTitle: 'Yangi bemorlar',
      avgCheckTitle: 'O‘rtacha chek',
      debtTitle: 'Bemorlar qarzdorligi',
      monthlyPlanTitle: 'Oylik moliyaviy reja ijrosi',
      planCompleted: 'Bajarildi',
      planRemaining: 'Qoldi',
      daysRemaining: 'kun qoldi',
      paymentsTitle: 'To‘lov usullari bo‘yicha tushum tarkibi',
      cash: 'Naqd pul',
      terminal: 'Bank kartasi (Humo / Uzcard)',
      onlinePay: 'Onlayn to‘lov (Click / Payme)',
      transfer: 'Bank hisob raqami (Perechislenie)',
      doctorRankingTitle: 'Shifokorlar ish samaradorligi va daromadi',
      docName: 'Shifokor / Mutaxassislik',
      docVisits: 'Qabullar',
      docRevenue: 'Tushum',
      docAvgCheck: 'O‘rtacha chek',
      docPlan: 'Reja %',
      docPayout: 'Shifokor ulushi (35%)',
      servicesTitle: 'Ommabop stomatologik xizmatlar reytingi',
      servicesSub: 'Amalda o‘tkazilgan muolajalar va tushum tarkibi',
      chairStatusTitle: 'Kabinetlar va kreslolarning real holati',
      chairBusy: 'Band (Muolaja ketmoqda)',
      chairFree: 'Bo‘sh (Qabulga tayyor)',
      warehouseTitle: 'Omborda tugayotgan materiallar',
      warehouseAlert: 'Tezkor xarid zarur',
      warehouseNormal: 'Yetarli zaxira',
      labTitle: 'Laboratoriya buyurtmalari jarayoni',
      labReady: 'Tayyor (Klinikada)',
      labWork: 'Texnikda (Ishlanmoqda)',
      viewAllStaff: 'Xodimlarni boshqarish',
      viewFullReport: 'Batafsil moliya hisoboti',
      noData: 'Ma’lumot mavjud emas',
      klinikaPlusiTitle: 'Klinika Plusi (Sof Foyda / EBITDA) Filiallar Kesimida Tahlili',
      klinikaPlusiSub: 'Har bir filial tushumi, 35% shifokor ulushi, laboratoriya, materiallar va operatsion xarajatlar tahlili'
    },
    ru: {
      title: 'Панель управления директора',
      subtitle: 'Финансовые и операционные показатели клиники в реальном времени (Живая база)',
      refresh: 'Обновить',
      exportExcel: 'Экспорт в CSV',
      today: 'Сегодня',
      yesterday: 'Вчера',
      week: 'Неделя',
      month: 'Текущий месяц',
      year: '2026 год',
      totalRevTitle: 'Общая выручка',
      targetLabel: 'План на месяц: 250,000,000 UZS',
      netProfitTitle: 'Чистая прибыль (EBITDA)',
      todayVisitsTitle: 'Количество приемов',
      newPatientsTitle: 'Новые пациенты',
      avgCheckTitle: 'Средний чек',
      debtTitle: 'Задолженность пациентов',
      monthlyPlanTitle: 'Выполнение месячного финансового плана',
      planCompleted: 'Выполнено',
      planRemaining: 'Осталось',
      daysRemaining: 'дней осталось',
      paymentsTitle: 'Структура выручки по способам оплаты',
      cash: 'Наличные',
      terminal: 'Банковские карты (Humo / Uzcard)',
      onlinePay: 'Онлайн оплата (Click / Payme)',
      transfer: 'Перечисление (Расчетный счет)',
      doctorRankingTitle: 'Эффективность врачей и расчет зарплаты',
      docName: 'Врач / Специальность',
      docVisits: 'Приемов',
      docRevenue: 'Выручка',
      docAvgCheck: 'Средний чек',
      docPlan: 'План %',
      docPayout: 'Доля врача (35%)',
      servicesTitle: 'Рейтинг популярных услуг клиники',
      servicesSub: 'Фактически оказанные медицинские услуги',
      chairStatusTitle: 'Статус кабинетов и стоматологических кресел',
      chairBusy: 'Занято (Идет прием)',
      chairFree: 'Свободно (Готово к приему)',
      warehouseTitle: 'Заканчивающиеся материалы на складе',
      warehouseAlert: 'Требуется срочная закупка',
      warehouseNormal: 'В норме',
      labTitle: 'Заказы в зуботехническую лабораторию',
      labReady: 'Готово (В клинике)',
      labWork: 'В работе (У техника)',
      viewAllStaff: 'Управление персоналом',
      viewFullReport: 'Полный финотчет',
      noData: 'Нет данных',
      klinikaPlusiTitle: 'Плюс клиники (Чистая прибыль / EBITDA) в разрезе филиалов',
      klinikaPlusiSub: 'Анализ выручки, доли врачей (35%), расходов на лабораторию, расходников и операционных затрат по филиалам'
    },
    en: {
      title: 'Director Executive Dashboard',
      subtitle: 'Real-time financial and operational metrics of the clinic (100% Live DB)',
      refresh: 'Refresh',
      exportExcel: 'Download CSV',
      today: 'Today',
      yesterday: 'Yesterday',
      week: 'Week',
      month: 'Current Month',
      year: 'Year 2026',
      totalRevTitle: 'Total Revenue',
      targetLabel: 'Monthly target: 250,000,000 UZS',
      netProfitTitle: 'Net Profit (EBITDA)',
      todayVisitsTitle: 'Total Visits',
      newPatientsTitle: 'New Patients',
      avgCheckTitle: 'Average Check',
      debtTitle: 'Patient Receivables (Debt)',
      monthlyPlanTitle: 'Monthly Revenue Plan Execution',
      planCompleted: 'Completed',
      planRemaining: 'Remaining',
      daysRemaining: 'days left',
      paymentsTitle: 'Revenue Breakdown by Payment Channels',
      cash: 'Cash',
      terminal: 'Card / Terminal (Humo / Uzcard)',
      onlinePay: 'Online Payment (Click / Payme)',
      transfer: 'Bank Wire Transfer',
      doctorRankingTitle: 'Doctor Performance & Revenue Production',
      docName: 'Doctor / Specialty',
      docVisits: 'Visits',
      docRevenue: 'Revenue',
      docAvgCheck: 'Avg Check',
      docPlan: 'Target %',
      docPayout: 'Doctor 35% Payout',
      servicesTitle: 'Top Performing Clinical Services',
      servicesSub: 'Actual rendered medical treatments and revenue',
      chairStatusTitle: 'Real-time Chair & Operatory Monitor',
      chairBusy: 'In Treatment',
      chairFree: 'Available',
      warehouseTitle: 'Critical Warehouse Inventory Alerts',
      warehouseAlert: 'Urgent restocking needed',
      warehouseNormal: 'Normal Stock',
      labTitle: 'Dental Lab Work Orders',
      labReady: 'Delivered to clinic',
      labWork: 'In production',
      viewAllStaff: 'Manage Staff',
      viewFullReport: 'Full Finance Report',
      noData: 'No data',
      klinikaPlusiTitle: 'Clinic Net Profit (EBITDA) & Branch Financial Analysis',
      klinikaPlusiSub: 'Analysis of branch revenue, 35% doctor fee, lab fees, consumables, and operating costs'
    }
  };

  const l = txt[language as 'uz' | 'ru' | 'en'] || txt.uz;

  // Load all data from API / Database / LocalStorage
  const loadDashboardData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [txs, apts, pts, emps, wh, labs, brs, wps] = await Promise.all([
        clinicApi.getTransactions(currentBranchId || undefined),
        clinicApi.getAppointments(undefined, currentBranchId || undefined),
        clinicApi.getPatients(),
        clinicApi.getEmployees(currentBranchId || undefined),
        clinicApi.getWarehouse(),
        clinicApi.getLabOrders(),
        clinicApi.getBranches(),
        clinicApi.getWorkplaces(currentBranchId || undefined)
      ]);
      const branchEmps = currentBranchId ? (emps || []).filter(e => e.branch === currentBranchId) : (emps || []);
      const branchApts = currentBranchId
        ? (apts || []).filter(a => (a.branch || (emps || []).find(e => e.id === a.doctor)?.branch) === currentBranchId)
        : (apts || []);
      const branchTxs = currentBranchId
        ? (txs || []).filter(t => (t.branch || (emps || []).find(e => e.id === t.doctor)?.branch) === currentBranchId)
        : (txs || []);

      setTransactions(branchTxs);
      setAppointments(branchApts);
      setPatients(pts || []);
      setEmployees(branchEmps);
      setWarehouse(wh || []);
      setLabOrders(labs || []);
      setBranches(brs || []);
      setWorkplaces(wps || []);
    } catch (err) {
      console.error('Failed to load Director Dashboard data:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [currentBranchId]);

  useEffect(() => {
    loadDashboardData();

    // Listen to changes in other tabs or components
    const handleStorage = (e: StorageEvent) => {
      if (
        e.key === '32desk_custom_transactions' ||
        e.key === '32desk_custom_appointments' ||
        e.key === '32desk_custom_patients'
      ) {
        loadDashboardData();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [loadDashboardData]);

  // Robust Date Parser
  const parseDateSafe = (dStr: string | undefined): Date | null => {
    if (!dStr) return null;
    const isoStr = dStr.includes(' ') && !dStr.includes('T') ? dStr.replace(' ', 'T') : dStr;
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? null : d;
  };

  // Bulletproof currency and percentage formatters (never returns NaN or 'не число')
  const formatMoney = useCallback((val: number | string | undefined | null): string => {
    const num = Number(val);
    if (!val || isNaN(num) || !isFinite(num)) return '0';
    return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }, []);

  const formatPercent = useCallback((val: number | string | undefined | null): number => {
    const num = Number(val);
    if (!val || isNaN(num) || !isFinite(num)) return 0;
    return Math.min(100, Math.max(0, Math.round(num)));
  }, []);

  // Uzbek transliteration & localization helpers
  const localizeDoctorName = useCallback((name: string | undefined): string => {
    if (!name) return 'Shifokor';
    if (language !== 'uz') return name;
    return name
      .replace(/Сардор Алимов/g, 'Sardor Alimov')
      .replace(/Сервер Усманов/g, 'Server Usmanov')
      .replace(/Озод Расулов/g, 'Ozod Rasulov')
      .replace(/Мальвина Абдуллаева/g, 'Malvina Abdullaeva');
  }, [language]);

  const localizeSpecialty = useCallback((spec: string | undefined): string => {
    if (!spec) return 'Stomatolog';
    if (language !== 'uz') return spec;
    return spec
      .replace(/Хирург/gi, 'Xirurg')
      .replace(/Имплантолог/gi, 'Implantolog')
      .replace(/Ортопед/gi, 'Ortoped')
      .replace(/Протезист/gi, 'Protezist')
      .replace(/Ортодонт/gi, 'Ortodont')
      .replace(/Терапевт/gi, 'Terapevt')
      .replace(/Детский врач/gi, 'Bolalar shifokori')
      .replace(/Стоматолог-Терапевт/gi, 'Stomatolog-Terapevt');
  }, [language]);

  // Period Filter predicate
  const isDateInPeriod = useCallback(
    (dateStr: string | undefined, selectedPeriod: 'today' | 'yesterday' | 'week' | 'month' | 'year'): boolean => {
      const d = parseDateSafe(dateStr);
      if (!d) return false;
      const now = new Date();

      if (selectedPeriod === 'today') {
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()
        );
      }
      if (selectedPeriod === 'yesterday') {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        return (
          d.getFullYear() === y.getFullYear() &&
          d.getMonth() === y.getMonth() &&
          d.getDate() === y.getDate()
        );
      }
      if (selectedPeriod === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        weekAgo.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(now);
        endOfWeek.setHours(23, 59, 59, 999);
        return d >= weekAgo && d <= endOfWeek;
      }
      if (selectedPeriod === 'month') {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }
      if (selectedPeriod === 'year') {
        return d.getFullYear() === now.getFullYear();
      }
      return true;
    },
    []
  );

  // Filtered transactions for the chosen period
  const periodTransactions = useMemo(() => {
    return transactions.filter((tx) => isDateInPeriod(tx.date, period));
  }, [transactions, period, isDateInPeriod]);

  // Income transactions
  const periodIncomes = useMemo(() => {
    return periodTransactions.filter((tx) => tx.type === 'income');
  }, [periodTransactions]);

  // Expense transactions
  const periodExpenses = useMemo(() => {
    return periodTransactions.filter((tx) => tx.type === 'expense');
  }, [periodTransactions]);

  // Filtered appointments for the chosen period
  const periodAppointments = useMemo(() => {
    return appointments.filter((apt) => isDateInPeriod(apt.start_time, period));
  }, [appointments, period, isDateInPeriod]);

  // 1. Total Revenue
  const totalRevenue = useMemo(() => {
    return periodIncomes.reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);
  }, [periodIncomes]);

  // 2. Total Expenses
  const totalExpenses = useMemo(() => {
    return periodExpenses.reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0);
  }, [periodExpenses]);

  // 3. Net Profit (EBITDA) & Margin
  const netProfit = totalRevenue - totalExpenses;
  const profitMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0;

  // 4. Visits Breakdown
  const completedVisits = useMemo(() => {
    return periodAppointments.filter((a) => a.status === 'completed').length;
  }, [periodAppointments]);

  const inChairVisits = useMemo(() => {
    return periodAppointments.filter((a) => a.status === 'in_progress').length;
  }, [periodAppointments]);

  const waitingVisits = useMemo(() => {
    return periodAppointments.filter((a) =>
      ['confirmed', 'unconfirmed', 'reserved', 'arrived'].includes(a.status)
    ).length;
  }, [periodAppointments]);

  const totalVisitsCount = periodAppointments.length || periodIncomes.length;

  // 5. New Patients registered in this period
  const newPatientsCount = useMemo(() => {
    const pts = patients.filter((p) => isDateInPeriod(p.created_at, period));
    return pts.length > 0 ? pts.length : period === 'month' ? patients.length : Math.min(patients.length, periodAppointments.length);
  }, [patients, period, isDateInPeriod, periodAppointments.length]);

  // 6. Average Check
  const avgCheck = useMemo(() => {
    const divisor = completedVisits > 0 ? completedVisits : periodIncomes.length > 0 ? periodIncomes.length : 1;
    return totalRevenue > 0 ? Math.round(totalRevenue / divisor) : 0;
  }, [totalRevenue, completedVisits, periodIncomes.length]);

  // 7. Patient Outstanding Debts
  const debtStats = useMemo(() => {
    const debtPatients = patients.filter((p) => (p.balance || 0) < 0);
    const sumBalanceDebt = debtPatients.reduce((acc, p) => acc + Math.abs(p.balance || 0), 0);
    const sumAptDebt = appointments
      .filter((a) => a.status === 'debt' || (Number(a.price) || 0) > (Number(a.paid_amount) || 0))
      .reduce((acc, a) => acc + Math.max(0, (Number(a.price) || 0) - (Number(a.paid_amount) || 0)), 0);
    const totalDebt = Math.max(sumBalanceDebt, sumAptDebt);
    const count = Math.max(debtPatients.length, appointments.filter((a) => a.status === 'debt').length);
    return {
      totalDebt: Number(totalDebt) || 0,
      count: Number(count) || 0
    };
  }, [patients, appointments]);

  // 8. Monthly Plan Progress
  const monthlyPlanStats = useMemo(() => {
    const monthTxs = transactions.filter((tx) => tx.type === 'income' && isDateInPeriod(tx.date, 'month'));
    const monthActual = monthTxs.reduce((acc, tx) => acc + (Number(tx.amount) || 0), 0) || totalRevenue;
    const target = monthlyPlanTarget;
    const percent = target > 0 ? Math.min(100, Math.max(0, Math.round((monthActual / target) * 100))) : 0;
    const remaining = Math.max(0, target - monthActual);

    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = Math.max(0, lastDayOfMonth - now.getDate());

    return {
      monthActual: Number(monthActual) || 0,
      target,
      percent: Number(percent) || 0,
      remaining: Number(remaining) || 0,
      daysLeft
    };
  }, [transactions, isDateInPeriod, totalRevenue, monthlyPlanTarget]);

  // 9. Payment Methods Breakdown (Cash, Terminal, Online, Bank Transfer)
  const paymentBreakdown = useMemo(() => {
    let cash = 0;
    let terminal = 0;
    let online = 0;
    let transfer = 0;

    periodIncomes.forEach((tx) => {
      const pm = (tx.payment_method || '').toLowerCase();
      const cr = (tx.cash_register || '').toLowerCase();
      const amt = Number(tx.amount) || 0;

      if (pm.includes('naqd') || pm.includes('налич') || cr === 'cash') {
        cash += amt;
      } else if (pm.includes('karta') || pm.includes('карт') || pm.includes('terminal') || cr === 'terminal') {
        terminal += amt;
      } else if (pm.includes('click') || pm.includes('payme') || pm.includes('onlayn') || pm.includes('онлайн') || cr === 'online') {
        online += amt;
      } else {
        transfer += amt;
      }
    });

    // If period has zero incomes, show 0 UZS cleanly
    const sum = cash + terminal + online + transfer;
    const calcPercent = (val: number) => (sum > 0 ? Math.round((val / sum) * 1000) / 10 : 0);

    return [
      { label: l.cash, amount: cash, percent: calcPercent(cash), color: 'bg-emerald-500' },
      { label: l.terminal, amount: terminal, percent: calcPercent(terminal), color: 'bg-sky-500' },
      { label: l.onlinePay, amount: online, percent: calcPercent(online), color: 'bg-indigo-500' },
      { label: l.transfer, amount: transfer, percent: calcPercent(transfer), color: 'bg-amber-500' }
    ];
  }, [periodIncomes, l]);

  // 10. Doctor Performance Ranking Table (Target auto-distributed from Monthly Plan)
  const doctorPerformance = useMemo(() => {
    const doctorsList = employees.filter((e) => e.role === 'doctor');
    const activeDocs = employees.filter((e) => e.role === 'doctor' && e.is_active);
    const activeDocCount = activeDocs.length || 1;
    const docMonthlyQuota = Math.round(monthlyPlanTarget / activeDocCount);

    return doctorsList.map((doc) => {
      // Appointments for this doctor
      const docApts = periodAppointments.filter(
        (a) =>
          a.doctor === doc.id ||
          (a.doctor_name && doc.full_name && (
            a.doctor_name.toLowerCase().includes(doc.full_name.toLowerCase()) ||
            doc.full_name.toLowerCase().includes(a.doctor_name.toLowerCase())
          ))
      );

      // Incomes directly recorded under this doctor
      const directIncome = periodIncomes
        .filter(
          (tx) =>
            tx.doctor === doc.id ||
            (tx.doctor_name && doc.full_name && (
              tx.doctor_name.toLowerCase().includes(doc.full_name.toLowerCase()) ||
              doc.full_name.toLowerCase().includes(tx.doctor_name.toLowerCase())
            ))
        )
        .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

      // Production sum from doctor's completed appointments (pure numeric)
      const aptRevenue = docApts.reduce(
        (sum, a) => sum + (Number(a.paid_amount) || Number(a.price) || 0),
        0
      );
      const revenue = Math.max(Number(directIncome) || 0, Number(aptRevenue) || 0);

      const visits = docApts.length || (revenue > 0 ? Math.max(1, Math.round(revenue / 500000)) : 0);
      const docAvg = visits > 0 ? Math.round(revenue / visits) : 0;

      // Period proportional target based on allocated monthly quota
      const docTarget =
        period === 'month'
          ? docMonthlyQuota
          : period === 'year'
          ? docMonthlyQuota * 12
          : period === 'week'
          ? Math.round(docMonthlyQuota / 4)
          : Math.round(docMonthlyQuota / 26);
      const targetPercent = docTarget > 0 ? Math.round((revenue / docTarget) * 100) : 0;

      // Doctor 35% commission
      const payout = Math.round(revenue * 0.35);

      // Doctor's branch
      const bObj = branches.find((b) => b.id === doc.branch);
      const branchName = doc.branch_name || bObj?.name || 'Toshkent Markaziy';

      return {
        id: doc.id,
        name: localizeDoctorName(doc.full_name),
        spec: localizeSpecialty(doc.specialty),
        branchName,
        color: doc.color || '#0EA5E9',
        visits: Number(visits) || 0,
        revenue: Number(revenue) || 0,
        avgCheck: Number(docAvg) || 0,
        docTarget: Number(docTarget) || 0,
        targetPercent: Number(targetPercent) || 0,
        payout: Number(payout) || 0
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [employees, periodAppointments, periodIncomes, period, monthlyPlanTarget, branches, localizeDoctorName, localizeSpecialty]);

  // 11. Real-time Chairs Monitor (Dynamic from Real Workplaces and Branch Filter)
  const chairMonitor = useMemo(() => {
    let activeWorkplaces = workplaces;
    if (currentBranchId) {
      activeWorkplaces = workplaces.filter((w) => w.branch === currentBranchId);
    }

    if (!activeWorkplaces) {
      activeWorkplaces = [];
    }

    const todayApts = appointments.filter((a) => isDateInPeriod(a.start_time, 'today'));

    return activeWorkplaces.map((chair) => {
      const bObj = branches.find((b) => b.id === (chair as any).branch);
      const branchName = (chair as any).branch_name || bObj?.name || (currentBranch?.name || 'Toshkent Markaziy');

      const match = todayApts.find(
        (a) =>
          (a as any).workplace === chair.id ||
          (a as any).chair_id === chair.id ||
          (a.chair_name && a.chair_name.toLowerCase().includes(chair.name.toLowerCase())) ||
          (a.doctor === chair.id)
      );

      if (match) {
        const isBusy = match.status === 'in_progress' || match.status === 'confirmed';
        const startTime = match.start_time?.split('T')[1]?.slice(0, 5) || '10:00';
        const endTime = match.end_time?.split('T')[1]?.slice(0, 5) || '11:00';

        return {
          id: chair.id,
          name: chair.name,
          branchName,
          doctor: localizeDoctorName(match.doctor_name || (chair as any).defaultDoc || 'Shifokor'),
          patient: match.patient_name || 'Bemor',
          procedure: match.treatment_notes || 'Muolaja jarayoni',
          time: `${startTime} - ${endTime}`,
          remaining: isBusy ? 'Muolaja davom etmoqda' : 'Navbatdagi qabul',
          status: (isBusy ? 'busy' : 'free') as 'busy' | 'free'
        };
      }

      return {
        id: chair.id,
        name: chair.name,
        branchName,
        doctor: localizeDoctorName((chair as any).defaultDoc || 'Navbatchi shifokor'),
        patient: 'Bemor yo‘q',
        procedure: 'Qabulga tayyor',
        time: 'Bo‘sh',
        remaining: 'Keyingi qabul rejalashtirilmagan',
        status: 'free' as 'busy' | 'free'
      };
    });
  }, [workplaces, branches, currentBranchId, currentBranch, appointments, isDateInPeriod, localizeDoctorName]);

  // 12. Popular Dental Services Ranking
  const popularServices = useMemo(() => {
    const categories: Record<string, { name: string; count: number; revenue: number }> = {
      implant: { name: 'Implantatsiya va jarrohlik', count: 0, revenue: 0 },
      crown: { name: 'Zirkon va keramik qoplamalar', count: 0, revenue: 0 },
      therapy: { name: 'Endodontiya va kompozit plomba', count: 0, revenue: 0 },
      veneer: { name: 'Keramik vinirlar (E.max)', count: 0, revenue: 0 },
      hygiene: { name: 'Professional GBT gigiyena', count: 0, revenue: 0 },
      ortho: { name: 'Breket tizimi va ortodontiya', count: 0, revenue: 0 }
    };

    // Analyze appointments
    periodAppointments.forEach((a) => {
      const text = (a.treatment_notes || '').toLowerCase();
      const price = Number(a.price) || 500000;

      if (text.includes('implant') || text.includes('имплант') || text.includes('ekstrak') || text.includes('экстрак')) {
        categories.implant.count += 1;
        categories.implant.revenue += price;
      } else if (text.includes('zirkon') || text.includes('циркон') || text.includes('qoplama') || text.includes('коронк') || text.includes('мост')) {
        categories.crown.count += 1;
        categories.crown.revenue += price;
      } else if (text.includes('breket') || text.includes('брекет') || text.includes('ortodont')) {
        categories.ortho.count += 1;
        categories.ortho.revenue += price;
      } else if (text.includes('vinir') || text.includes('винир')) {
        categories.veneer.count += 1;
        categories.veneer.revenue += price;
      } else if (text.includes('gigiyena') || text.includes('гигиен') || text.includes('tozalash')) {
        categories.hygiene.count += 1;
        categories.hygiene.revenue += price;
      } else {
        categories.therapy.count += 1;
        categories.therapy.revenue += price;
      }
    });

    // Also include transactions notes
    periodIncomes.forEach((tx) => {
      const text = (tx.notes || tx.category || '').toLowerCase();
      const amt = Number(tx.amount) || 0;
      if (text.includes('implant') || text.includes('имплант')) {
        categories.implant.revenue += amt;
      } else if (text.includes('zirkon') || text.includes('циркон') || text.includes('коронк')) {
        categories.crown.revenue += amt;
      }
    });

    const totalSrvRevenue = Object.values(categories).reduce((s, c) => s + (Number(c.revenue) || 0), 0) || totalRevenue || 1;

    return Object.entries(categories)
      // Faqat REAL faoliyat bo'lgan xizmatlar — qabul/tushum yo'q bo'lsa ko'rsatilmaydi (soxta ro'yxat yo'q)
      .filter(([, srv]) => (srv.count || 0) > 0 || (srv.revenue || 0) > 0)
      .map(([key, srv]) => {
        const catLabel =
          key === 'implant'
            ? 'Jarrohlik'
            : key === 'crown'
            ? 'Ortopediya'
            : key === 'therapy'
            ? 'Terapiya'
            : key === 'veneer'
            ? 'Estetika'
            : key === 'hygiene'
            ? 'Profilaktika'
            : 'Ortodontiya';

        const percent = totalSrvRevenue > 0 ? Math.round(((Number(srv.revenue) || 0) / totalSrvRevenue) * 100) : 0;
        return {
          category: catLabel,
          name: srv.name,
          count: srv.count || Math.round((Number(srv.revenue) || 0) / 1000000),
          revenue: Number(srv.revenue) || 0,
          percent: Number(percent) || 0
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [periodAppointments, periodIncomes, totalRevenue]);

  // 13. Warehouse Stock Alerts
  const stockAlerts = useMemo(() => {
    return warehouse
      .filter((item) => item.quantity <= item.min_quantity * 1.5)
      .sort((a, b) => a.quantity / a.min_quantity - b.quantity / b.min_quantity)
      .slice(0, 4)
      .map((item) => ({
        name: item.name,
        left: item.quantity,
        unit: item.unit,
        min: item.min_quantity,
        critical: item.quantity <= item.min_quantity
      }));
  }, [warehouse]);

  // 14. Dental Lab Orders Process (Branch flow: fromBranch ➔ tech ➔ toBranch)
  const labWorkOrders = useMemo(() => {
    return labOrders.slice(0, 4).map((o) => {
      const isReady = o.status === 'klinika oldi' || o.status === 'tayyor' || o.status === 'ready';
      return {
        orderId: o.order_number || `LAB-${o.id}`,
        patient: o.patient_name || 'Bemor',
        tech: o.technician_name || 'Zubnoy Texnik',
        item: `${o.tooth_numbers ? o.tooth_numbers + ' - ' : ''}${o.work_type || 'Protez'}`,
        fromBranch: o.branch_name || 'Toshkent Markaziy',
        toBranch: o.destination_branch_name || o.branch_name || 'Toshkent Markaziy',
        deadline: o.due_date || o.zdacha_date || o.received_date || 'Muddatsiz',
        status: isReady ? ('ready' as const) : ('in_work' as const)
      };
    });
  }, [labOrders]);

  // 15. Klinika Plusi (Sof Foyda / Net Profit EBITDA) Filiallar Kesimida Tahlili
  const klinikaPlusiAnalysis = useMemo(() => {
    if (branches.length === 0) {
      return {
        branches: [],
        totalRev: 0,
        totalNet: 0,
        totalMargin: 0
      };
    }

    const branchData = branches.map((br) => {
      // 1. Tushum (Incomes for this branch)
      const brIncomes = periodTransactions.filter(
        (tx) => tx.type === 'income' && ((tx as any).branch === br.id || (tx as any).branch_name === br.name)
      );
      const brRevenue = brIncomes.reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

      // 2. Shifokorlar ulushi (35% commission)
      const docShare = Math.round(brRevenue * 0.35);

      // 3. Laboratoriya xarajatlari (Lab fees)
      const brLabs = labOrders.filter((o) => (o as any).branch === br.id || (o as any).branch_name === br.name);
      const labCost = brLabs.reduce((s, o) => s + (Number((o as any).cost) || 0), 0);

      // 4. Sarf materiallari / Ombor (Consumables - 8%)
      const consumables = Math.round(brRevenue * 0.08);

      // 5. Operatsion xarajatlar (Ijara, kommunal, boshqaruv)
      const brExpenses = periodTransactions.filter(
        (tx) => tx.type === 'expense' && ((tx as any).branch === br.id || (tx as any).branch_name === br.name)
      );
      const opExpenses = brExpenses.reduce((s, tx) => s + (Number(tx.amount) || 0), 0);

      // 6. Klinika Plusi (Sof Foyda) = Tushum - Barcha xarajatlar
      const totalCost = docShare + labCost + consumables + opExpenses;
      const netProfitBr = Math.max(0, brRevenue - totalCost);
      const margin = brRevenue > 0 ? Math.round((netProfitBr / brRevenue) * 100) : 0;

      return {
        id: br.id,
        name: br.name,
        revenue: brRevenue,
        docShare,
        labCost,
        consumables,
        opExpenses,
        totalCost,
        netProfit: netProfitBr,
        margin
      };
    });

    const totalRev = branchData.reduce((s, b) => s + b.revenue, 0);
    const totalNet = branchData.reduce((s, b) => s + b.netProfit, 0);
    const totalMargin = totalRev > 0 ? Math.round((totalNet / totalRev) * 100) : 0;

    return {
      branches: branchData,
      totalRev,
      totalNet,
      totalMargin
    };
  }, [branches, periodTransactions, labOrders]);

  // Export to CSV Function
  const handleExportCSV = () => {
    const csvRows = [
      ['Director Executive Report', `Period: ${period.toUpperCase()}`, `Date: ${new Date().toLocaleDateString()}`],
      [],
      ['KPI', 'Qiymat', 'Qo‘shimcha'],
      ['Umumiy tushum', `${formatMoney(totalRevenue)} UZS`, `${periodIncomes.length} ta kirim`],
      ['Sof foyda (EBITDA)', `${formatMoney(netProfit)} UZS`, `Rentabellik: ${formatPercent(profitMargin)}%`],
      ['Jami rasxodlar', `${formatMoney(totalExpenses)} UZS`, `${periodExpenses.length} ta chiqim`],
      ['Qabullar soni', `${totalVisitsCount} ta`, `${completedVisits} yakunlandi`],
      ['O‘rtacha chek', `${formatMoney(avgCheck)} UZS`, 'Har bir qabuldan'],
      ['Bemorlar qarzdorligi', `${formatMoney(debtStats.totalDebt)} UZS`, `${debtStats.count} nafar bemor`],
      [],
      ['Shifokor', 'Mutaxassislik', 'Qabullar', 'Tushum (UZS)', 'Ortacha chek (UZS)', 'Reja %', 'Ulushi 35% (UZS)'],
      ...doctorPerformance.map((d) => [
        d.name,
        d.spec,
        d.visits.toString(),
        formatMoney(d.revenue),
        formatMoney(d.avgCheck),
        `${formatPercent(d.targetPercent)}%`,
        formatMoney(d.payout)
      ])
    ];

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + csvRows.map((e) => e.join(';')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `32desk_director_report_${period}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Top 6 High-Impact KPI Cards definition
  const kpis = [
    {
      title: l.totalRevTitle,
      value: formatMoney(totalRevenue),
      currency: 'UZS',
      change: `+${periodIncomes.length} ta kirim`,
      isPositive: true,
      sub: `${formatPercent(monthlyPlanStats.percent)}% oylik rejadan bajarildi`,
      finance: true,
      icon: DollarSign,
      iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    },
    {
      title: l.netProfitTitle,
      value: formatMoney(netProfit),
      currency: 'UZS',
      change: `${formatPercent(profitMargin)}% marja`,
      isPositive: netProfit >= 0,
      sub: `Rasxod: ${formatMoney(totalExpenses)} UZS`,
      finance: true,
      icon: TrendingUp,
      iconBg: 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
    },
    {
      title: l.todayVisitsTitle,
      value: totalVisitsCount.toString(),
      currency: 'ta',
      change: `${completedVisits} yakunlandi`,
      isPositive: true,
      sub: `${inChairVisits} stulda • ${waitingVisits} kutilmoqda`,
      finance: true,
      icon: Calendar,
      iconBg: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
    },
    {
      title: l.newPatientsTitle,
      value: newPatientsCount.toString(),
      currency: 'bemor',
      change: `Baza: ${patients.length}`,
      isPositive: true,
      sub: `Jami ro‘yxatda: ${patients.length} nafar bemor`,
      icon: Users,
      iconBg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
    },
    {
      title: l.avgCheckTitle,
      value: formatMoney(avgCheck),
      currency: 'UZS',
      change: avgCheck > 500000 ? 'Yuqori' : 'Standart',
      isPositive: true,
      sub: `Bemor boshiga tushum: ${formatMoney(avgCheck)} UZS`,
      finance: true,
      icon: CreditCard,
      iconBg: 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
    },
    {
      title: l.debtTitle,
      value: formatMoney(debtStats.totalDebt),
      currency: 'UZS',
      change: `${debtStats.count} bemor`,
      isPositive: false,
      sub: `${debtStats.count} nafar bemorda qarzdorlik bor`,
      finance: true,
      icon: AlertCircle,
      iconBg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
    }
  ];
  // Admin/kassa uchun moliyaviy KPI'lar yashiriladi (faqat operatsion ko'rsatkich qoladi).
  const visibleKpis = canSeeFinance ? kpis : kpis.filter((k) => !(k as { finance?: boolean }).finance);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-16">
      {/* 1. Header & Period Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {l.title}
            </h1>
            {currentBranch && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-sky-300 border border-blue-200 dark:border-blue-800 text-xs font-bold">
                <Building2 className="w-3.5 h-3.5" />
                {currentBranch.name}
              </span>
            )}
            {loading && (
              <span className="text-xs text-slate-400 animate-pulse ml-2">Yuklanmoqda...</span>
            )}
          </div>
          <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-300 mt-1">
            {l.subtitle}
          </p>
        </div>

        {/* Period Selector Buttons & Quick Links */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Live Refresh Button */}
          <div className="relative group">
            <button
              onClick={loadDashboardData}
              disabled={isRefreshing}
              className="p-2 sm:p-2.5 rounded-xl text-slate-700 dark:text-white bg-slate-100 dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155] hover:bg-slate-200 dark:hover:bg-slate-800 transition disabled:opacity-50 flex items-center justify-center shadow-xs"
              title={l.refresh}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-500' : ''}`} />
            </button>
            <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-150 z-30 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-medium rounded-md shadow-lg whitespace-nowrap">
              {l.refresh}
            </div>
          </div>

          {/* Period Pills */}
          <div className="flex items-center bg-slate-100 dark:bg-[#0F172A] p-1 rounded-xl border border-slate-200 dark:border-[#334155]">
            <button
              onClick={() => setPeriod('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                period === 'today'
                  ? 'bg-white dark:bg-[#1E293B] text-blue-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {l.today}
            </button>
            <button
              onClick={() => setPeriod('yesterday')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                period === 'yesterday'
                  ? 'bg-white dark:bg-[#1E293B] text-blue-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {l.yesterday}
            </button>
            <button
              onClick={() => setPeriod('week')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                period === 'week'
                  ? 'bg-white dark:bg-[#1E293B] text-blue-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {l.week}
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                period === 'month'
                  ? 'bg-white dark:bg-[#1E293B] text-blue-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {l.month}
            </button>
            <button
              onClick={() => setPeriod('year')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                period === 'year'
                  ? 'bg-white dark:bg-[#1E293B] text-blue-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {l.year}
            </button>
          </div>

          {/* Export CSV */}
          <div className="relative group">
            <button
              onClick={handleExportCSV}
              className="p-2 sm:p-2.5 rounded-xl text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition flex items-center justify-center shadow-xs"
              title={l.exportExcel}
            >
              <Download className="w-4 h-4" />
            </button>
            <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-150 z-30 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-medium rounded-md shadow-lg whitespace-nowrap">
              {l.exportExcel}
            </div>
          </div>

          {/* Staff shortcut */}
          <div className="relative group">
            <Link
              href="/staff"
              className="p-2 sm:p-2.5 rounded-xl text-blue-600 dark:text-sky-400 bg-blue-50 dark:bg-sky-950/60 border border-blue-200 dark:border-sky-800/80 hover:bg-blue-100 dark:hover:bg-sky-900/60 transition flex items-center justify-center shadow-xs"
              title={l.viewAllStaff}
            >
              <Users className="w-4 h-4" />
            </Link>
            <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-150 z-30 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-medium rounded-md shadow-lg whitespace-nowrap">
              {l.viewAllStaff}
            </div>
          </div>

          {/* Reports shortcut */}
          <div className="relative group">
            <Link
              href="/reports"
              className="p-2 sm:p-2.5 rounded-xl text-slate-700 dark:text-white bg-slate-100 dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155] hover:bg-slate-200 dark:hover:bg-slate-800 transition flex items-center justify-center shadow-xs"
              title={l.viewFullReport}
            >
              <FileSpreadsheet className="w-4 h-4" />
            </Link>
            <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-150 z-30 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-medium rounded-md shadow-lg whitespace-nowrap">
              {l.viewFullReport}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Top High-Impact Clinic KPI Cards (Dynamically Computed) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 sm:gap-4">
        {visibleKpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className="bg-white dark:bg-[#1E293B] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs flex flex-col justify-between transition-all hover:border-blue-400 dark:hover:border-sky-500 min-w-0 overflow-hidden"
            >
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300 truncate">
                    {kpi.title}
                  </span>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${kpi.iconBg}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2.5 min-w-0">
                  <div className="flex items-baseline space-x-1 min-w-0">
                    <span className="text-lg sm:text-xl font-black font-mono text-slate-900 dark:text-white tracking-tight truncate block max-w-full">
                      {kpi.value}
                    </span>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
                      {kpi.currency}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-[#334155]/60 flex items-center justify-between gap-1.5 min-w-0">
                <span
                  className={`text-[10px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                    kpi.isPositive
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {kpi.change}
                </span>
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate min-w-0 flex-1 text-right" title={kpi.sub}>
                  {kpi.sub}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3–6 bo'limlar (reja, foyda, to'lov/kreslo monitoringi, shifokor jadvali, xizmatlar) —
          FAQAT moliyaviy ruxsatli rollarga. Administrator/kassa (reception) KO'RMAYDI. */}
      {canSeeFinance && (<>
      {/* 3. Monthly Target Progress Bar (Dynamic Calculation) */}
      <div className="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {l.monthlyPlanTitle} {branches.length > 0 ? (currentBranch ? `(${currentBranch.name})` : '(Umumiy barcha filiallar)') : '(Klinika rejasi)'}
            </h3>
            {!isDeputy && (
            <button
              onClick={() => {
                setInputBranchPlans({ ...branchPlans });
                setInputSinglePlan(singleClinicPlan);
                setIsPlanModalOpen(true);
              }}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#0F172A] text-slate-400 hover:text-blue-600 dark:hover:text-sky-400 border border-transparent hover:border-slate-200 dark:hover:border-[#334155] transition flex items-center space-x-1"
              title="Oylik moliyaviy rejani sozlash"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold text-blue-600 dark:text-sky-400 sm:inline hidden">
                {monthlyPlanStats.target > 0 ? "Rejani tahrirlash" : "Rejani kiritish"}
              </span>
            </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-bold">
            {monthlyPlanStats.target > 0 ? (
              <>
                <span className="text-slate-600 dark:text-slate-300">
                  Reja: <strong className="text-slate-900 dark:text-white font-mono">{formatMoney(monthlyPlanStats.target)} UZS</strong>
                </span>
                <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">•</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {l.planCompleted}: {formatMoney(monthlyPlanStats.monthActual)} UZS ({formatPercent(monthlyPlanStats.percent)}%)
                </span>
                <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">•</span>
                <span className="text-slate-600 dark:text-slate-300">
                  {l.planRemaining}: {formatMoney(monthlyPlanStats.remaining)} UZS
                </span>
                <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 rounded-md border border-amber-200 dark:border-amber-800">
                  {monthlyPlanStats.daysLeft} {l.daysRemaining}
                </span>
              </>
            ) : isDeputy ? (
              <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Oylik moliyaviy reja hali belgilanmagan (rejani direktor kiritadi)</span>
              </span>
            ) : (
              <button
                onClick={() => {
                  setInputBranchPlans({ ...branchPlans });
                  setInputSinglePlan(singleClinicPlan);
                  setIsPlanModalOpen(true);
                }}
                className="text-amber-600 dark:text-amber-400 hover:underline font-semibold flex items-center gap-1.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Oylik moliyaviy reja belgilanmagan — «Rejani kiritish» orqali belgilang</span>
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-100 dark:bg-[#0F172A] h-3.5 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-[#334155]">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-sky-500 to-blue-600 rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, formatPercent(monthlyPlanStats.percent))}%` }}
          />
        </div>
      </div>

      {/* 3.1 Klinika Plusi (Sof Foyda EBITDA) Filiallar Kesimida Tahlili */}
      <div className="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
              <span>{l.klinikaPlusiTitle}</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-300 font-medium mt-0.5">
              {l.klinikaPlusiSub}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {currentBranchId ? `${currentBranch?.name || 'Filial'} plyusi:` : 'Jami klinika plyusi:'}
            </span>
            <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-mono font-black text-sm rounded-xl border border-emerald-200 dark:border-emerald-800">
              +{formatMoney(
                currentBranchId
                  ? (klinikaPlusiAnalysis.branches.find((b) => b.id === currentBranchId)?.netProfit || 0)
                  : klinikaPlusiAnalysis.totalNet
              )} UZS ({
                currentBranchId
                  ? (klinikaPlusiAnalysis.branches.find((b) => b.id === currentBranchId)?.margin || 0)
                  : klinikaPlusiAnalysis.totalMargin
              }% marja)
            </span>
          </div>
        </div>

        {currentBranchId && (
          <div className="mb-3 flex items-center justify-between px-3 py-2 bg-blue-50/70 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 text-xs">
            <span className="font-semibold text-blue-700 dark:text-blue-300 flex items-center space-x-1.5">
              <Building2 className="w-3.5 h-3.5" />
              <span>Filial filtri: <b>{currentBranch?.name || 'Tanlangan filial'}</b> bo‘yicha moliyaviy tahlil</span>
            </span>
            <span className="text-[11px] text-blue-600 dark:text-blue-400">Faqat ushbu filial xarajatlari va sof foydasi</span>
          </div>
        )}

        {klinikaPlusiAnalysis.branches.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-[#334155] space-y-3">
            <Building2 className="w-10 h-10 text-slate-400 mx-auto" />
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {tr('directorx.noBranchesCreatedYet')}
            </h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {tr('director.k')}
            </p>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition"
            >
              + {tr('director.k2')}
            </Link>
          </div>
        ) : (
          <div className={`grid gap-4 ${currentBranchId ? 'grid-cols-1 max-w-2xl mx-auto' : 'grid-cols-1 md:grid-cols-3'}`}>
            {klinikaPlusiAnalysis.branches
              .filter((b) => (currentBranchId ? b.id === currentBranchId : true))
              .map((b) => (
              <div
                key={b.id}
                className={`p-4 rounded-2xl border transition-all ${
                  currentBranchId === b.id
                    ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-400 dark:border-blue-600 shadow-md ring-2 ring-blue-500/20'
                    : 'bg-slate-50/70 dark:bg-[#0F172A] border-slate-200 dark:border-[#334155] hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/70 dark:border-[#334155]">
                  <div className="flex items-center space-x-2">
                    <Building2 className="w-4 h-4 text-blue-600 dark:text-sky-400" />
                    <h4 className="font-black text-sm text-slate-900 dark:text-white">{b.name}</h4>
                  </div>
                  <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                    {b.margin}% marja
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">1. Tushum (Brutto):</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {formatMoney(b.revenue)} UZS
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                    <span className="text-[11px]">↳ Shifokorlar ulushi (35%):</span>
                    <span className="font-mono font-medium text-rose-500">
                      -{formatMoney(b.docShare)} UZS
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                    <span className="text-[11px]">↳ Laboratoriya ishlari:</span>
                    <span className="font-mono font-medium text-amber-500">
                      -{formatMoney(b.labCost)} UZS
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                    <span className="text-[11px]">↳ Sarf materiallari (Ombor):</span>
                    <span className="font-mono font-medium text-amber-500">
                      -{formatMoney(b.consumables)} UZS
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                    <span className="text-[11px]">↳ Operatsion xarajatlar:</span>
                    <span className="font-mono font-medium text-slate-500">
                      -{formatMoney(b.opExpenses)} UZS
                    </span>
                  </div>
                  
                  <div className="pt-2 border-t border-slate-200 dark:border-[#334155] flex justify-between items-center">
                    <span className="font-bold text-slate-800 dark:text-slate-100">Klinika Plusi (Sof):</span>
                    <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                      +{formatMoney(b.netProfit)} UZS
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Payment Channels Breakdown & Real-Time Chairs Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Payment Methods Breakdown */}
        <div className="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <CreditCard className="w-4 h-4 text-blue-500" />
              <span>{l.paymentsTitle}</span>
            </h3>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              Jami: {formatMoney(totalRevenue)} UZS
            </span>
          </div>

          <div className="space-y-3.5">
            {paymentBreakdown.map((p, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 dark:text-slate-200">{p.label}</span>
                  <div className="flex items-center space-x-2">
                    <span className="font-extrabold font-mono text-slate-900 dark:text-white">
                      {formatMoney(p.amount)} UZS
                    </span>
                    <span className="font-bold text-slate-500 dark:text-slate-300 w-12 text-right">
                      {formatPercent(p.percent)}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 dark:bg-[#0F172A] h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${p.color} rounded-full transition-all duration-500`}
                    style={{ width: `${formatPercent(p.percent)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Real-time Chair & Operatory Monitor */}
        <div className="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Armchair className="w-4 h-4 text-indigo-500" />
              <span>{l.chairStatusTitle}</span>
            </h3>
            <span className="text-xs font-bold text-blue-600 dark:text-sky-400">
              {chairMonitor.length} ta kreslo (
              {chairMonitor.filter((c) => c.status === 'busy').length} band,{' '}
              {chairMonitor.filter((c) => c.status === 'free').length} bo‘sh)
            </span>
          </div>

          {chairMonitor.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              <Armchair className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="font-semibold">Hozircha kreslolar mavjud emas</p>
              <Link href="/settings" className="text-blue-600 dark:text-sky-400 font-bold hover:underline mt-1 inline-block">
                + Yangi kreslo qo‘shish
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {chairMonitor.map((chair) => (
                <div
                  key={chair.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-[#334155] bg-slate-50/70 dark:bg-[#0F172A] flex flex-col justify-between space-y-2 hover:border-blue-300 dark:hover:border-sky-700 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        {chair.name}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 border border-blue-200/60 dark:border-blue-800/60">
                        <MapPin className="w-2.5 h-2.5 text-blue-500" />
                        {chair.branchName}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 ${
                        chair.status === 'busy'
                          ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                          : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          chair.status === 'busy' ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
                        }`}
                      />
                      <span>{chair.status === 'busy' ? l.chairBusy : l.chairFree}</span>
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-600 dark:text-slate-300">
                    <p className="font-medium truncate">{chair.doctor}</p>
                    <p className="text-slate-500 dark:text-slate-400 truncate">{chair.patient}</p>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-[#334155]">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>{chair.time}</span>
                    </span>
                    <span className="text-blue-600 dark:text-sky-400">{chair.remaining}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5. Doctor Performance Table (Dynamic Real Staff Data) */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-[#334155] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Stethoscope className="w-4 h-4 text-emerald-500" />
              <span>{l.doctorRankingTitle}</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-300 font-medium mt-0.5">
              Shifokorlar bo‘yicha jonli qabullar, tushum, taqsimlangan reja ijrosi va 35% ish haqi hisob-kitobi
            </p>
          </div>
          <Link
            href="/staff"
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 dark:text-sky-400 hover:underline"
          >
            <span>{l.viewAllStaff}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#0F172A] border-b border-slate-200 dark:border-[#334155] text-[11px] font-bold uppercase text-slate-500 dark:text-slate-300">
              <tr>
                <th className="py-3 px-4">{l.docName}</th>
                <th className="py-3 px-4 text-center">{l.docVisits}</th>
                <th className="py-3 px-4 text-right">{l.docRevenue}</th>
                <th className="py-3 px-4 text-right">{l.docAvgCheck}</th>
                <th className="py-3 px-4 text-center">Taqsimlangan reja / Ijro</th>
                <th className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 font-black">
                  {l.docPayout}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#334155]">
              {doctorPerformance.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50/60 dark:hover:bg-[#0F172A]/50 transition">
                  <td className="py-3 px-4">
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-xs"
                        style={{ backgroundColor: doc.color }}
                      >
                        {doc.name.split(' ')[1]?.[0] || doc.name[0] || 'D'}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <p className="font-bold text-slate-900 dark:text-white">{doc.name}</p>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 border border-blue-200/60 dark:border-blue-800/60">
                            🏢 {doc.branchName}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-300">{doc.spec}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center font-bold text-slate-800 dark:text-slate-200">
                    {doc.visits}
                  </td>
                  <td className="py-3 px-4 text-right font-black font-mono text-slate-900 dark:text-white">
                    {formatMoney(doc.revenue)} UZS
                  </td>
                  <td className="py-3 px-4 text-right font-semibold font-mono text-slate-700 dark:text-slate-300">
                    {formatMoney(doc.avgCheck)} UZS
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex flex-col items-center">
                      <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                        {formatMoney(doc.docTarget)} UZS
                      </span>
                      <span
                        className={`inline-block mt-0.5 px-2 py-0.5 rounded-md font-bold text-[10px] ${
                          doc.targetPercent >= 100
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {formatPercent(doc.targetPercent)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-black font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                    {formatMoney(doc.payout)} UZS
                  </td>
                </tr>
              ))}
              {doctorPerformance.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400 font-medium">
                    {l.noData}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Popular Dental Services Ranking (Dynamic from Appointments) */}
      <div className="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-blue-500" />
              <span>{l.servicesTitle}</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-300 font-medium mt-0.5">
              {l.servicesSub}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {popularServices.map((srv, idx) => (
            <div
              key={idx}
              className="p-4 sm:p-5 rounded-2xl bg-slate-50/70 dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155] flex flex-col justify-between min-w-0 overflow-hidden shadow-xs hover:border-blue-400 transition"
            >
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 shrink-0">
                    {srv.category}
                  </span>
                  <span className="text-xs sm:text-sm font-black font-mono text-emerald-600 dark:text-emerald-400 truncate text-right">
                    {formatMoney(srv.revenue)} UZS
                  </span>
                </div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white mt-2 truncate">
                  {srv.name}
                </h4>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-[#334155] flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                <span>{srv.count} ta muolaja</span>
                <span>{formatPercent(srv.percent)}% tushumdan</span>
              </div>
            </div>
          ))}
          {popularServices.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4 col-span-full">{l.noData}</p>
          )}
        </div>
      </div>

      </>)}

      {/* 7. Warehouse Critical Alerts & Dental Lab Work Orders (Real Inventory & Lab) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Warehouse */}
        <div className="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Package className="w-4 h-4 text-rose-500" />
              <span>{l.warehouseTitle}</span>
            </h3>
            <Link
              href="/warehouse"
              className="text-xs font-bold text-blue-600 dark:text-sky-400 hover:underline"
            >
              Omborga o‘tish →
            </Link>
          </div>

          <div className="space-y-2.5">
            {stockAlerts.map((item, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-rose-50/40 dark:bg-[#0F172A] border border-rose-100 dark:border-rose-900/50 flex items-center justify-between"
              >
                <div className="flex items-center space-x-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{item.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-300">
                      Minimal chegara: {item.min} {item.unit}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black text-rose-600 dark:text-rose-400">
                    Qoldi: {item.left} {item.unit}
                  </span>
                  <p className="text-[10px] font-bold text-rose-500 dark:text-rose-400">
                    {item.critical ? l.warehouseAlert : l.warehouseNormal}
                  </p>
                </div>
              </div>
            ))}
            {stockAlerts.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">{l.noData}</p>
            )}
          </div>
        </div>

        {/* Dental Lab Orders */}
        <div className="bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <FlaskConical className="w-4 h-4 text-sky-500" />
              <span>{l.labTitle}</span>
            </h3>
            <Link
              href="/lab"
              className="text-xs font-bold text-blue-600 dark:text-sky-400 hover:underline"
            >
              Laboratoriyaga o‘tish →
            </Link>
          </div>

          <div className="space-y-2.5">
            {labWorkOrders.map((order, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-50/70 dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155] flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-xs text-blue-600 dark:text-sky-400">
                      {order.orderId}
                    </span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {order.patient}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                    {order.item}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-semibold flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-sky-300 border border-blue-200/50 dark:border-blue-800/50">
                      📍 {order.fromBranch}
                    </span>
                    <span className="text-slate-400">➔</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/50 dark:border-slate-700/50">
                      🔧 {order.tech}
                    </span>
                    <span className="text-slate-400">➔</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/50">
                      📍 {order.toBranch}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      order.status === 'ready'
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {order.status === 'ready' ? l.labReady : l.labWork}
                  </span>
                  <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                    Muddati: {order.deadline}
                  </p>
                </div>
              </div>
            ))}
            {labWorkOrders.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">{l.noData}</p>
            )}
          </div>
        </div>
      </div>

      {/* Monthly Plan Setting Modal Dialog */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#1E293B] rounded-3xl border border-slate-200 dark:border-[#334155] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-[#334155] flex items-center justify-between bg-gradient-to-r from-blue-50/50 via-transparent to-transparent dark:from-sky-950/20">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    {branches.length > 0 ? "Oylik moliyaviy reja (Filiallar bo'yicha)" : "Oylik moliyaviy reja"}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {branches.length > 0 ? "Har bir filial uchun reja belgilang va umumiy summani taqsimlang" : "Klinikangiz uchun joriy oylik tushum maqsadini belgilang"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPlanModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#0F172A] rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-start space-x-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p>
                  {branches.length > 0
                    ? "Har bir filial uchun kiritilgan reja summasi umumiy hisoblanadi va tanlangan filialda shifokorlar o'rtasida avtomatik taqsimlanadi."
                    : "Klinika oylik rejasi belgilangach, direktor dashboardida reja bajarilish foizi va qolgan kunlar dinamik ko'rsatiladi."}
                </p>
              </div>

              {branches.length === 0 ? (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155] space-y-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-emerald-500" />
                      Klinika oylik umumiy tushum rejasi
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatMoney(inputSinglePlan)} UZS
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="5000000"
                      min="0"
                      value={inputSinglePlan || ''}
                      onChange={(e) => setInputSinglePlan(Math.max(0, Number(e.target.value) || 0))}
                      placeholder="Masalan: 50000000"
                      className="w-full pl-3 pr-14 py-2.5 rounded-xl bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-[#334155] text-slate-900 dark:text-white font-mono font-bold text-base focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      UZS
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    * Keyinchalik filiallar qo‘shilgach, rejani har bir filial bo‘yicha alohida belgilashingiz mumkin.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {branches.map((b) => {
                    const val = inputBranchPlans[b.id] ?? defaultBranchTargets[b.id] ?? 0;
                    return (
                      <div key={b.id} className="p-3 rounded-2xl bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155]">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-blue-500" />
                            {b.name} filiali
                          </span>
                          <span className="text-xs font-mono font-bold text-blue-600 dark:text-sky-400">
                            {formatMoney(val)} UZS
                          </span>
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            step="10000000"
                            min="0"
                            value={val || ''}
                            onChange={(e) => {
                              const nVal = Math.max(0, Number(e.target.value) || 0);
                              setInputBranchPlans((prev) => ({ ...prev, [b.id]: nVal }));
                            }}
                            className="w-full pl-3 pr-14 py-2 rounded-xl bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-[#334155] text-slate-900 dark:text-white font-mono font-bold text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                            UZS
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Total Calculation Preview */}
              {(() => {
                const totalTarget = branches.length > 0
                  ? Object.values(inputBranchPlans).reduce((acc, v) => acc + (Number(v) || 0), 0)
                  : inputSinglePlan;
                return (
                  <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                      <span className="font-bold">Klinika umumiy oylik rejasi:</span>
                      <strong className="text-blue-600 dark:text-sky-400 font-bold font-mono text-base">
                        {formatMoney(totalTarget)} UZS
                      </strong>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-5 sm:p-6 border-t border-slate-100 dark:border-[#334155] bg-slate-50/50 dark:bg-[#0F172A]/50 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setIsPlanModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={() => handleSavePlans(inputBranchPlans, inputSinglePlan)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition flex items-center space-x-2"
              >
                <Check className="w-4 h-4" />
                <span>Rejani saqlash</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
