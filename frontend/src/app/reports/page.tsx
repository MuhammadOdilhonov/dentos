'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { clinicApi } from '../../lib/api';
import {
  FinancialTransaction,
  Employee,
  DentalTechnician,
  DentalLabOrder,
  Patient,
  Appointment,
  Branch
} from '../../lib/types';
import { useBranch } from '../../lib/branchContext';
import {
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  CreditCard,
  Users,
  Printer,
  FileSpreadsheet,
  AlertCircle,
  Building2,
  Stethoscope,
  PieChart,
  CheckCircle2,
  Download,
  Filter,
  Plus,
  Minus,
  Search,
  Trash2,
  Tag,
  Wallet,
  Landmark,
  Smartphone,
  Banknote,
  ShieldCheck,
  Clock,
  Receipt,
  X,
  ArrowRight,
  RefreshCw
} from 'lucide-react';

export default function ReportsPage() {
  const { language, tr } = useI18n();
  const { user } = useAuth();

  // Multi-language helper

  // Main data state
  const { currentBranchId } = useBranch();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<number | 'all'>('all');

  useEffect(() => {
    if (currentBranchId) setSelectedBranchFilter(currentBranchId);
  }, [currentBranchId]);

  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [technicians, setTechnicians] = useState<DentalTechnician[]>([]);
  const [labOrders, setLabOrders] = useState<DentalLabOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters & Tabs
  const [period, setPeriod] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | 'year'>('month');
  const [activeReportTab, setActiveReportTab] = useState<'transactions' | 'doctors' | 'technicians' | 'expenses' | 'branches'>('transactions');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterRegister, setFilterRegister] = useState<string>('all');

  // Modal forms state
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  // Helper to format raw ISO timestamps into readable Date & Time
  const formatTxDate = (dateStr: string | undefined) => {
    if (!dateStr) return '—';
    try {
      const iso = dateStr.includes(' ') && !dateStr.includes('T') ? dateStr.replace(' ', 'T') : dateStr;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return dateStr;
      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const year = d.getFullYear();
      const hours = d.getHours().toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      return `${day}.${month}.${year} ${hours}:${minutes}`;
    } catch {
      return dateStr;
    }
  };

  // Quick Income Form State
  const [incomeForm, setIncomeForm] = useState({
    patientId: 0,
    patientName: '',
    doctorId: 0,
    doctorName: '',
    branchId: 1,
    amount: '',
    category: 'Оплата приема',
    paymentMethod: 'Наличные',
    cashRegister: 'cash',
    operatorName: user?.name || 'Kassir',
    notes: ''
  });

  // Quick Expense Form State
  const [expenseForm, setExpenseForm] = useState({
    expenseType: 'doctor_advance', // 'doctor_advance' | 'doctor_salary' | 'technician_payment' | 'clinic_expense'
    doctorId: 0,
    technicianId: 0,
    branchId: 1,
    category: 'Аванс врачу',
    amount: '',
    paymentMethod: 'Наличные',
    cashRegister: 'cash',
    operatorName: user?.name || 'Kassir / Rahbariyat',
    notes: ''
  });

  // Load all real data from clinicApi
  const loadAllData = async () => {
    setLoading(true);
    try {
      const [txs, emps, pats, apts, techs, labs, brs] = await Promise.all([
        clinicApi.getTransactions(),
        clinicApi.getEmployees(),
        clinicApi.getPatients(),
        clinicApi.getAppointments(),
        clinicApi.getTechnicians(),
        clinicApi.getLabOrders(),
        clinicApi.getBranches()
      ]);
      setTransactions(txs || []);
      setEmployees(emps || []);
      setPatients(pats || []);
      setAppointments(apts || []);
      setTechnicians(techs || []);
      setLabOrders(labs || []);
      setBranches(brs || []);
    } catch (err) {
      console.error('Error loading reports data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Helper to resolve transaction branch (explicit branch -> doctor branch -> appointment branch)
  const getTxBranch = (t: FinancialTransaction): number | null => {
    if (t.branch) return t.branch;
    if (t.doctor) {
      const doc = employees.find(e => e.id === t.doctor);
      if (doc?.branch) return doc.branch;
    }
    if (t.appointment) {
      const apt = appointments.find(a => a.id === t.appointment);
      if (apt?.branch) return apt.branch;
    }
    return null;
  };

  // Filter transactions by selected period ONLY (for overall branch comparison table)
  const transactionsFilteredByPeriodOnly = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Start of week (Monday)
    const dayOfWeek = (now.getDay() + 6) % 7;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    // Start of month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    // Start of year
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    return transactions.filter(t => {
      const tDate = new Date(t.date);
      const tDateStr = t.date.split(' ')[0] || t.date.split('T')[0];

      if (period === 'today') return tDateStr === todayStr;
      if (period === 'yesterday') return tDateStr === yesterdayStr;
      if (period === 'week') return tDate >= startOfWeek;
      if (period === 'month') return tDate >= startOfMonth;
      if (period === 'year') return tDate >= startOfYear;
      return true; // 'all'
    });
  }, [transactions, period]);

  // Filter transactions by period AND selected branch (for Kassa KPI cards & transactions list)
  const filteredTransactionsByPeriod = useMemo(() => {
    if (selectedBranchFilter === 'all') {
      return transactionsFilteredByPeriodOnly;
    }
    return transactionsFilteredByPeriodOnly.filter(t => {
      const bId = getTxBranch(t);
      return bId === selectedBranchFilter;
    });
  }, [transactionsFilteredByPeriodOnly, selectedBranchFilter, employees, appointments]);

  // Comprehensive Branch Financials Calculation (Compares all branches side by side for the period)
  const branchesFinancialList = useMemo(() => {
    const periodTxs = transactionsFilteredByPeriodOnly;
    const allIncome = periodTxs.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0) || 1;

    return branches.map(b => {
      const bTxs = periodTxs.filter(t => getTxBranch(t) === b.id);
      const income = bTxs.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const expense = bTxs.filter(t => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const netProfit = income - expense;
      const margin = income > 0 ? Math.round((netProfit / income) * 100) : 0;

      const bApts = appointments.filter(a => (a.branch || employees.find(e => e.id === a.doctor)?.branch) === b.id);
      const completedApts = bApts.filter(a => a.status === 'completed' || a.status === 'debt');
      const avgCheck = completedApts.length > 0 ? Math.round(income / completedApts.length) : 0;
      const doctorsCount = employees.filter(e => e.role === 'doctor' && e.branch === b.id).length;
      const percentOfTotal = Math.round((income / allIncome) * 100);

      return {
        id: b.id,
        name: b.name,
        address: b.address,
        phone: b.phone,
        doctorsCount,
        appointmentsCount: bApts.length,
        completedCount: completedApts.length,
        income,
        expense,
        netProfit,
        margin,
        avgCheck,
        percentOfTotal
      };
    });
  }, [branches, transactionsFilteredByPeriodOnly, appointments, employees]);

  // Overall Financial Calculations (Real Data)
  const financialSummary = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;

    let cashIncome = 0;
    let cashExpense = 0;

    let terminalIncome = 0;
    let terminalExpense = 0;

    let onlineIncome = 0;
    let onlineExpense = 0;

    let bankIncome = 0;
    let bankExpense = 0;

    filteredTransactionsByPeriod.forEach(t => {
      const amt = Number(t.amount) || 0;
      const reg = t.cash_register || (
        t.payment_method?.toLowerCase().includes('перевод') || t.payment_method?.toLowerCase().includes('счет') || t.payment_method?.toLowerCase().includes('bank') ? 'bank_transfer' :
        t.payment_method?.toLowerCase().includes('click') || t.payment_method?.toLowerCase().includes('payme') ? 'online' :
        t.payment_method?.toLowerCase().includes('карт') || t.payment_method?.toLowerCase().includes('терминал') || t.payment_method?.toLowerCase().includes('humo') || t.payment_method?.toLowerCase().includes('uzcard') ? 'terminal' :
        'cash'
      );

      if (t.type === 'income') {
        totalIncome += amt;
        if (reg === 'cash') cashIncome += amt;
        else if (reg === 'terminal') terminalIncome += amt;
        else if (reg === 'online') onlineIncome += amt;
        else if (reg === 'bank_transfer') bankIncome += amt;
      } else {
        totalExpense += amt;
        if (reg === 'cash') cashExpense += amt;
        else if (reg === 'terminal') terminalExpense += amt;
        else if (reg === 'online') onlineExpense += amt;
        else if (reg === 'bank_transfer') bankExpense += amt;
      }
    });

    const netProfit = totalIncome - totalExpense;
    const cashBalance = cashIncome - cashExpense;
    const terminalBalance = terminalIncome - terminalExpense;
    const onlineBalance = onlineIncome - onlineExpense;
    const bankBalance = bankIncome - bankExpense;

    // Total Patient Debts from Patients with negative balance
    const totalPatientDebt = patients.reduce((acc, p) => acc + (p.balance < 0 ? Math.abs(p.balance) : 0), 0);

    return {
      totalIncome,
      totalExpense,
      netProfit,
      cashBalance,
      terminalBalance,
      onlineBalance,
      bankBalance,
      totalPatientDebt
    };
  }, [filteredTransactionsByPeriod, patients]);

  // Doctor Financials Calculation (Gross production, 35% rate, advances/paid, due)
  const doctorsFinancialList = useMemo(() => {
    const doctors = employees.filter(e => e.role === 'doctor');

    return doctors.map(doc => {
      // Appointments completed for this doctor
      const docAppointments = appointments.filter(a =>
        // FAQAT aniq shifokor (id) — nom bo'yicha "includes" boshqa shifokorga ham tegib ketardi
        (a.doctor === doc.id || (!a.doctor && (a.doctor_name || '').toLowerCase().trim() === doc.full_name.toLowerCase().trim())) &&
        (a.status === 'completed' || a.status === 'debt')
      );

      // Gross Production (Tushum)
      const grossRevenue = docAppointments.reduce((sum, a) => sum + (Number(a.price) || 0), 0);

      // Commission Rate (default 35% or doc.commission_rate)
      const commRate = Number(doc.commission_rate ?? 0);
      const earnedSalary = Math.round((grossRevenue * commRate) / 100);

      // Payouts & Advances given to this doctor from Transactions
      const paidExpenses = transactions
        .filter(t =>
          t.type === 'expense' &&
          // FAQAT aniq shifokor (id) — bitta shifokorga bergan avans boshqasiga tegmasin
          (t.doctor === doc.id || (!t.doctor && (t.doctor_name || '').toLowerCase().trim() === doc.full_name.toLowerCase().trim()))
        )
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      // Net Balance Due (Berish kerak bo'lgan summa)
      const balanceDue = earnedSalary - paidExpenses;

      return {
        id: doc.id,
        name: doc.full_name,
        specialty: doc.specialty || 'Stomatolog',
        avatar: doc.avatar,
        color: doc.color || '#3B82F6',
        visitsCount: docAppointments.length,
        grossRevenue,
        commRate,
        earnedSalary,
        paidExpenses,
        balanceDue
      };
    });
  }, [employees, appointments, transactions]);

  // Dental Technicians Financials Calculation (Lab orders cost, paid to tech, debt)
  const techniciansFinancialList = useMemo(() => {
    return technicians.map(tech => {
      // Lab orders assigned to this technician
      const orders = labOrders.filter(o => o.technician === tech.id || o.technician_name?.toLowerCase().includes(tech.name.toLowerCase()));
      const totalOrdersCost = orders.reduce((sum, o) => sum + (Number(o.cost) || 0), 0);

      // Payouts made to this technician
      const paidToTech = transactions
        .filter(t =>
          t.type === 'expense' &&
          (t.technician === tech.id || (t.technician_name && t.technician_name.toLowerCase().includes(tech.name.toLowerCase())))
        )
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      const balanceDue = totalOrdersCost - paidToTech;

      return {
        id: tech.id,
        name: tech.name,
        labName: tech.lab_name || 'Dental Lab',
        phone: tech.phone,
        ordersCount: orders.length,
        totalOrdersCost,
        paidToTech,
        balanceDue
      };
    });
  }, [technicians, labOrders, transactions]);

  // Expenses Category Breakdown
  const expensesBreakdownList = useMemo(() => {
    const map: Record<string, { amount: number; count: number }> = {};
    const expenseTxs = filteredTransactionsByPeriod.filter(t => t.type === 'expense');

    expenseTxs.forEach(t => {
      const cat = t.category || 'Boshqa xarajatlar';
      if (!map[cat]) map[cat] = { amount: 0, count: 0 };
      map[cat].amount += Number(t.amount) || 0;
      map[cat].count += 1;
    });

    const totalExp = financialSummary.totalExpense || 1;
    return Object.entries(map).map(([category, data]) => ({
      category,
      amount: data.amount,
      count: data.count,
      percent: Math.round((data.amount / totalExp) * 100)
    })).sort((a, b) => b.amount - a.amount);
  }, [filteredTransactionsByPeriod, financialSummary.totalExpense]);

  // Filtered transactions for the Table view
  const displayTransactions = useMemo(() => {
    return filteredTransactionsByPeriod.filter(t => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNotes = (t.notes || '').toLowerCase().includes(q);
        const matchCategory = (t.category || '').toLowerCase().includes(q);
        const matchPatient = (t.patient_name || '').toLowerCase().includes(q);
        const matchDoctor = (t.doctor_name || '').toLowerCase().includes(q);
        const matchTech = (t.technician_name || '').toLowerCase().includes(q);
        const matchOperator = (t.operator_name || '').toLowerCase().includes(q);
        if (!matchNotes && !matchCategory && !matchPatient && !matchDoctor && !matchTech && !matchOperator) {
          return false;
        }
      }

      // Type filter
      if (filterType !== 'all' && t.type !== filterType) return false;

      // Register filter
      if (filterRegister !== 'all') {
        const reg = t.cash_register || 'cash';
        if (reg !== filterRegister) return false;
      }

      return true;
    });
  }, [filteredTransactionsByPeriod, searchQuery, filterType, filterRegister]);

  // Handlers for Quick Income & Expense
  const handleSaveIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(incomeForm.amount);
    if (!amountNum || amountNum <= 0) return;

    const targetBranchId = incomeForm.branchId || (selectedBranchFilter !== 'all' ? selectedBranchFilter : currentBranchId) || 1;
    const targetBranchObj = branches.find(b => b.id === targetBranchId);

    await clinicApi.createTransaction({
      patient: incomeForm.patientId || undefined,
      patient_name: incomeForm.patientName || 'Bemor',
      doctor: incomeForm.doctorId || undefined,
      doctor_name: incomeForm.doctorName || 'Shifokor',
      branch: targetBranchId,
      branch_name: targetBranchObj?.name || 'Toshkent Markaziy',
      amount: amountNum,
      type: 'income',
      category: incomeForm.category,
      payment_method: incomeForm.paymentMethod,
      cash_register: incomeForm.cashRegister,
      operator_name: incomeForm.operatorName,
      date: new Date().toISOString().replace('T', ' ').substring(0, 16),
      notes: incomeForm.notes || tr('reports.cashIncome')
    });

    setIsIncomeModalOpen(false);
    setIncomeForm({
      patientId: 0,
      patientName: '',
      doctorId: 0,
      doctorName: '',
      branchId: Number((selectedBranchFilter !== 'all' ? selectedBranchFilter : currentBranchId) || 1),
      amount: '',
      category: 'Оплата приема',
      paymentMethod: 'Наличные',
      cashRegister: 'cash',
      operatorName: user?.name || 'Kassir',
      notes: ''
    });
    await loadAllData();
  };

  const handleOpenDoctorAdvanceModal = (doc: Employee) => {
    const defaultBranch = (selectedBranchFilter !== 'all' ? selectedBranchFilter : doc.branch) || currentBranchId || 1;
    setExpenseForm({
      expenseType: 'doctor_advance',
      doctorId: doc.id,
      technicianId: 0,
      branchId: Number(defaultBranch),
      category: 'Аванс врачу',
      amount: '',
      paymentMethod: 'Наличные',
      cashRegister: 'cash',
      operatorName: user?.name || 'Kassir / Rahbariyat',
      notes: `${doc.full_name} ga avans`
    });
    setIsExpenseModalOpen(true);
  };

  const handleOpenTechnicianPayoutModal = (tech: DentalTechnician) => {
    const defaultBranch = (selectedBranchFilter !== 'all' ? selectedBranchFilter : currentBranchId) || 1;
    setExpenseForm({
      expenseType: 'technician_payment',
      doctorId: 0,
      technicianId: tech.id,
      branchId: Number(defaultBranch),
      category: 'Оплата технику',
      amount: '',
      paymentMethod: 'Перечисление (Расчетный счет)',
      cashRegister: 'bank_transfer',
      operatorName: user?.name || 'Buxgalteriya',
      notes: `${tech.name} (${tech.lab_name}) laboratoriyasiga to‘lov`
    });
    setIsExpenseModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(expenseForm.amount);
    if (!amountNum || amountNum <= 0) return;

    let docName = '';
    let techName = '';

    if (expenseForm.doctorId) {
      const doc = employees.find(e => e.id === expenseForm.doctorId);
      docName = doc ? doc.full_name : '';
    }

    if (expenseForm.technicianId) {
      const tech = technicians.find(t => t.id === expenseForm.technicianId);
      techName = tech ? tech.name : '';
    }

    const targetBranchId = expenseForm.branchId || (selectedBranchFilter !== 'all' ? selectedBranchFilter : currentBranchId) || 1;
    const targetBranchObj = branches.find(b => b.id === targetBranchId);

    await clinicApi.createTransaction({
      doctor: expenseForm.doctorId || undefined,
      doctor_name: docName || undefined,
      technician: expenseForm.technicianId || undefined,
      technician_name: techName || undefined,
      branch: targetBranchId,
      branch_name: targetBranchObj?.name || 'Toshkent Markaziy',
      amount: amountNum,
      type: 'expense',
      category: expenseForm.category,
      payment_method: expenseForm.paymentMethod,
      cash_register: expenseForm.cashRegister,
      operator_name: expenseForm.operatorName,
      date: new Date().toISOString().replace('T', ' ').substring(0, 16),
      notes: expenseForm.notes || tr('reports.expenseOutflow')
    });

    setIsExpenseModalOpen(false);
    setExpenseForm({
      expenseType: 'clinic_expense',
      doctorId: 0,
      technicianId: 0,
      branchId: Number((selectedBranchFilter !== 'all' ? selectedBranchFilter : currentBranchId) || 1),
      category: 'Расходные материалы',
      amount: '',
      paymentMethod: 'Наличные',
      cashRegister: 'cash',
      operatorName: user?.name || 'Kassir',
      notes: ''
    });
    await loadAllData();
  };

  const handleDeleteTx = async (id: number) => {
    if (confirm(tr('reports.deleteThisTransaction'))) {
      await clinicApi.deleteTransaction(id);
      await loadAllData();
    }
  };

  const exportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'ID;Sana;Turi;Summa;Kategoriya;Toluv_usuli;Kassa;Shifokor_Bemor;Izoh\\n';
    displayTransactions.forEach(t => {
      csvContent += `${t.id};${t.date};${t.type};${t.amount};${t.category};${t.payment_method};${t.cash_register};${t.doctor_name || t.patient_name || t.technician_name || '-'};${t.notes || '-'}\\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `kassa_hisoboti_${period}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150 select-none pb-12">
      {/* ── 1. HEADER & ACTION CONTROLS ── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white dark:bg-[#0F172A] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-sky-400 flex items-center justify-center font-black">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {tr('reports.cashFinancialManagement')}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {tr('reports.realCashInflowOutflowDoctorPayroll')}
              </p>
            </div>
          </div>
        </div>

        {/* Period Selector & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Branch filter dropdown */}
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
            <Building2 className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0" />
            <select
              value={selectedBranchFilter}
              onChange={e => setSelectedBranchFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 outline-none cursor-pointer"
            >
              <option value="all" className="dark:bg-slate-900">
                {tr('reports.allBranches')}
              </option>
              {branches.map(b => (
                <option key={b.id} value={b.id} className="dark:bg-slate-900">
                  🏢 {b.name}
                </option>
              ))}
            </select>
          </div>
          {/* Period selector */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl text-xs font-bold">
            {(['today', 'yesterday', 'week', 'month', 'year', 'all'] as const).map(pKey => {
              const labelMap = {
                today: tr('reports.today'),
                yesterday: tr('reports.yesterday'),
                week: tr('reports.week'),
                month: tr('reports.month'),
                year: tr('reports.year'),
                all: tr('reports.all')
              };
              return (
                <button
                  key={pKey}
                  type="button"
                  onClick={() => setPeriod(pKey)}
                  className={`px-3 py-1.5 rounded-xl transition ${
                    period === pKey
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-sky-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {labelMap[pKey]}
                </button>
              );
            })}
          </div>

          {/* Action buttons */}
          <button
            type="button"
            onClick={() => setIsIncomeModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black shadow-md shadow-emerald-500/20 transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{tr('reports.addIncome')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setExpenseForm({
                expenseType: 'clinic_expense',
                doctorId: 0,
                technicianId: 0,
                branchId: 0,
                category: 'Стоматологические материалы',
                amount: '',
                paymentMethod: 'Наличные',
                cashRegister: 'cash',
                operatorName: user?.name || 'Kassir',
                notes: ''
              });
              setIsExpenseModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black shadow-md shadow-rose-500/20 transition active:scale-95 cursor-pointer"
          >
            <Minus className="w-4 h-4" />
            <span>{tr('reports.addExpense')}</span>
          </button>

          <button
            type="button"
            onClick={exportCSV}
            className="p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            title={tr('reports.exportToExcel')}
          >
            <FileSpreadsheet className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            title={tr('reports.print')}
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── 2. REAL CASH REGISTERS & KPI SUMMARY CARDS (Kassa Qoldiqlari) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Naqd pul kassasi */}
        <div className="bg-white dark:bg-[#0F172A] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs min-h-[145px] flex flex-col justify-between transition hover:border-slate-300 dark:hover:border-slate-700">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
                <Banknote className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{tr('reports.cashDrawer')}</span>
              </span>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 border border-emerald-200 dark:border-emerald-800 shrink-0">
                Kassa #1
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white tracking-tight truncate">
              {financialSummary.cashBalance.toLocaleString()} <span className="text-xs font-bold text-slate-400">UZS</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
            <span>{tr('reports.in')}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono">
              +{financialSummary.cashBalance >= 0 ? financialSummary.cashBalance.toLocaleString() : 0}
            </span>
          </div>
        </div>

        {/* 2. Terminal (Uzcard / Humo) */}
        <div className="bg-white dark:bg-[#0F172A] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs min-h-[145px] flex flex-col justify-between transition hover:border-slate-300 dark:hover:border-slate-700">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
                <CreditCard className="w-4 h-4 text-sky-600 shrink-0" />
                <span>{tr('reports.cardTerminal')}</span>
              </span>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/60 text-sky-600 border border-sky-200 dark:border-sky-800 shrink-0">
                Uzcard / Humo
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white tracking-tight truncate">
              {financialSummary.terminalBalance.toLocaleString()} <span className="text-xs font-bold text-slate-400">UZS</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
            <span>{tr('reports.in')}</span>
            <span className="text-sky-600 dark:text-sky-400 font-bold font-mono">
              +{financialSummary.terminalBalance.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 3. Onlayn kassa (Click / Payme) */}
        <div className="bg-white dark:bg-[#0F172A] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs min-h-[145px] flex flex-col justify-between transition hover:border-slate-300 dark:hover:border-slate-700">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
                <Smartphone className="w-4 h-4 text-purple-600 shrink-0" />
                <span>{tr('reports.onlinePayments')}</span>
              </span>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-600 border border-purple-200 dark:border-purple-800 shrink-0">
                Click / Payme
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white tracking-tight truncate">
              {financialSummary.onlineBalance.toLocaleString()} <span className="text-xs font-bold text-slate-400">UZS</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
            <span>{tr('reports.in')}</span>
            <span className="text-purple-600 dark:text-purple-400 font-bold font-mono">
              +{financialSummary.onlineBalance.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 4. Bank Hisob raqami (Perechisleniye) */}
        <div className="bg-white dark:bg-[#0F172A] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs min-h-[145px] flex flex-col justify-between transition hover:border-slate-300 dark:hover:border-slate-700">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
                <Landmark className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{tr('reports.bankAccount')}</span>
              </span>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-600 border border-amber-200 dark:border-amber-800 shrink-0">
                Bank
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white tracking-tight truncate">
              {financialSummary.bankBalance.toLocaleString()} <span className="text-xs font-bold text-slate-400">UZS</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800">
            <span>{tr('reports.in')}</span>
            <span className="text-amber-600 dark:text-amber-400 font-bold font-mono">
              +{financialSummary.bankBalance.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 5. Jami Kassa Balansi (EBITDA / Net Cash) */}
        <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-indigo-700 p-5 sm:p-6 rounded-2xl shadow-lg shadow-blue-600/20 text-white min-h-[145px] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-black tracking-wide text-blue-100 flex items-center gap-1.5 truncate">
                <Wallet className="w-4 h-4 text-amber-300 shrink-0" />
                <span>{tr('reports.netCashBalance')}</span>
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-white tracking-tight truncate">
              {financialSummary.netProfit.toLocaleString()} <span className="text-xs font-bold text-blue-200">UZS</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs font-semibold text-blue-100 pt-3 border-t border-white/20">
            <span>{tr('reports.totalRevenue')}</span>
            <span className="font-bold font-mono text-amber-300">
              +{financialSummary.totalIncome.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. NAVIGATION TABS (Kassa, Shifokorlar, Texniklar, Rasxodlar) ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveReportTab('transactions')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition cursor-pointer ${
            activeReportTab === 'transactions'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>{tr('reports.cashTransactionLog')}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/20">
            {displayTransactions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveReportTab('doctors')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition cursor-pointer ${
            activeReportTab === 'doctors'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Stethoscope className="w-4 h-4" />
          <span>{tr('reports.doctorProductionAdvances')}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/20">
            {doctorsFinancialList.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveReportTab('technicians')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition cursor-pointer ${
            activeReportTab === 'technicians'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>{tr('reports.dentalTechniciansSettlement')}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/20">
            {techniciansFinancialList.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveReportTab('expenses')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition cursor-pointer ${
            activeReportTab === 'expenses'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <PieChart className="w-4 h-4" />
          <span>{tr('reports.clinicOperationalExpenses')}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/20">
            {expensesBreakdownList.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveReportTab('branches')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black transition cursor-pointer ${
            activeReportTab === 'branches'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>{tr('reports.branchFinancialAnalysis')}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/20">
            {branches.length}
          </span>
        </button>
      </div>

      {/* ── 4. TAB 1: KASSA & TRANZAKSIYALAR JURNALI ── */}
      {activeReportTab === 'transactions' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#0F172A] p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={tr('reports.searchByPatientDoctorNotes')}
                  className="w-full pl-10 pr-4 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 font-medium"
                />
              </div>

              {/* Type filter */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1.5 rounded-xl transition ${filterType === 'all' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-sky-400 shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  {tr('reports.all')}
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('income')}
                  className={`px-3 py-1.5 rounded-xl transition ${filterType === 'income' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  {tr('reports.income')}
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('expense')}
                  className={`px-3 py-1.5 rounded-xl transition ${filterType === 'expense' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  {tr('reports.expenses')}
                </button>
              </div>

              {/* Register filter */}
              <select
                value={filterRegister}
                onChange={e => setFilterRegister(e.target.value)}
                className="px-3.5 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none"
              >
                <option value="all">{tr('reports.allRegisters')}</option>
                <option value="cash">{tr('reports.cash')}</option>
                <option value="terminal">{tr('reports.terminal')}</option>
                <option value="online">{tr('reports.online')}</option>
                <option value="bank_transfer">{tr('reports.bankTransfer')}</option>
              </select>
            </div>

            <span className="text-xs font-bold text-slate-400">
              {displayTransactions.length} {tr('reports.operations')}
            </span>
          </div>

          {/* Table Container */}
          <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="p-3.5 pl-5">{tr('reports.dateTime')}</th>
                    <th className="p-3.5">{tr('reports.type')}</th>
                    <th className="p-3.5">{tr('reports.amount')}</th>
                    <th className="p-3.5">{tr('reports.categoryNotes')}</th>
                    <th className="p-3.5">{tr('reports.patientDoctorTech')}</th>
                    <th className="p-3.5">{tr('reports.methodRegister')}</th>
                    <th className="p-3.5">{tr('reports.cashier')}</th>
                    <th className="p-3.5 pr-5 text-right">{tr('reports.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {displayTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 font-semibold text-xs">
                        {tr('reports.noTransactionsFoundForThisPeriod')}
                      </td>
                    </tr>
                  ) : (
                    displayTransactions.map(tx => {
                      const isInc = tx.type === 'income';
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                          <td className="p-3.5 pl-5 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap text-xs">
                            <Clock className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />
                            {formatTxDate(tx.date)}
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            {isInc ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-black text-[11px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                                {tr('reports.income2')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-black text-[11px] bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                <ArrowUpRight className="w-3 h-3 text-rose-600" />
                                {tr('reports.expense')}
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 font-mono font-black text-sm whitespace-nowrap">
                            <span className={isInc ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                              {isInc ? '+' : '-'}{Number(tx.amount).toLocaleString()} so‘m
                            </span>
                          </td>
                          <td className="p-3.5 max-w-[220px]">
                            <p className="font-bold text-slate-900 dark:text-white truncate">{tx.category}</p>
                            <p className="text-[11px] text-slate-400 truncate">{tx.notes || '—'}</p>
                          </td>
                          <td className="p-3.5">
                            {tx.patient_name && (
                              <p className="font-bold text-blue-600 dark:text-sky-400">
                                👤 {tx.patient_name}
                              </p>
                            )}
                            {tx.doctor_name && (
                              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                👨‍⚕️ {tx.doctor_name}
                              </p>
                            )}
                            {tx.technician_name && (
                              <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                🏢 {tx.technician_name}
                              </p>
                            )}
                            {!tx.patient_name && !tx.doctor_name && !tx.technician_name && (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            <span className="font-semibold text-slate-700 dark:text-slate-200 block">
                              {tx.payment_method}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {tx.cash_register === 'cash' ? '💵 Naqd kassa' :
                               tx.cash_register === 'terminal' ? '💳 Terminal' :
                               tx.cash_register === 'online' ? '📱 Onlayn Click' : '🏦 Hisob raqam'}
                            </span>
                          </td>
                          <td className="p-3.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            <ShieldCheck className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                            {tx.operator_name || 'Kassir'}
                          </td>
                          <td className="p-3.5 pr-5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleDeleteTx(tx.id)}
                              className="p-1.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-500 transition"
                              title={tr('reports.deleteTransaction')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. TAB 2: SHIFOKORLAR HISOBI (AVANS & OYLIK) ── */}
      {activeReportTab === 'doctors' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-[#0F172A] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div>
              <h3 className="font-black text-base text-slate-900 dark:text-white">
                {tr('reports.doctorProductionAdvancesPayroll')}
              </h3>
              <p className="text-xs text-slate-400">
                {tr('reports.grossProductionEarnedCommissionAdv')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (employees.length > 0) {
                  handleOpenDoctorAdvanceModal(employees.find(e => e.role === 'doctor') || employees[0]);
                }
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black shadow-md shadow-blue-500/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('reports.disburseDoctorAdvance')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {doctorsFinancialList.map(doc => (
              <div key={doc.id} className="bg-white dark:bg-[#0F172A] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-xs" style={{ backgroundColor: doc.color }}>
                        {doc.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-slate-900 dark:text-white leading-tight">{doc.name}</h4>
                        <p className="text-[11px] text-slate-400">{doc.specialty}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 font-mono">
                      {doc.commRate}% stavka
                    </span>
                  </div>

                  <div className="space-y-2 pt-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{tr('reports.visits')}</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{doc.visitsCount} ta</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{tr('reports.production')}</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{doc.grossRevenue.toLocaleString()} so‘m</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{tr('reports.earned')}</span>
                      <span className="font-mono font-bold text-blue-600 dark:text-sky-400">+{doc.earnedSalary.toLocaleString()} so‘m</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{tr('reports.paidAdvances')}</span>
                      {/* Avans/to'lov — shifokorga BERILGAN (qarz emas). Shuning uchun amber, qizil emas. */}
                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{doc.paidExpenses.toLocaleString()} so‘m</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      {doc.balanceDue >= 0 ? tr('reports.netDue') : 'Avans (ortiqcha berilgan)'}
                    </span>
                    <span className={`text-base font-black font-mono ${doc.balanceDue >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {Math.abs(doc.balanceDue).toLocaleString()} UZS
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const emp = employees.find(e => e.id === doc.id);
                      if (emp) handleOpenDoctorAdvanceModal(emp);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{tr('reports.advance')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 6. TAB 3: TISH TEXNIKLARI HISOBI (LABORATORIYA) ── */}
      {activeReportTab === 'technicians' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-[#0F172A] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div>
              <h3 className="font-black text-base text-slate-900 dark:text-white">
                {tr('reports.dentalTechnicianLabInvoicesSettlem')}
              </h3>
              <p className="text-xs text-slate-400">
                {tr('reports.ordersValuePaymentsMadeAndRemainin')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (technicians.length > 0) handleOpenTechnicianPayoutModal(technicians[0]);
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black shadow-md shadow-blue-500/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('reports.payTechnician')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {techniciansFinancialList.map(tech => (
              <div key={tech.id} className="bg-white dark:bg-[#0F172A] p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-black text-sm">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-black text-sm text-slate-900 dark:text-white leading-tight">{tech.name}</h4>
                        <p className="text-[11px] text-slate-400">{tech.labName} • {tech.phone || '—'}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 font-mono">
                      {tech.ordersCount} naryad
                    </span>
                  </div>

                  <div className="space-y-2 pt-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{tr('reports.totalOrdersCost')}</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{tech.totalOrdersCost.toLocaleString()} so‘m</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">{tr('reports.paidByClinic')}</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">-{tech.paidToTech.toLocaleString()} so‘m</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">{tr('reports.debtDueToLab')}</span>
                    <span className={`text-base font-black font-mono ${tech.balanceDue > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'}`}>
                      {tech.balanceDue.toLocaleString()} UZS
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const tObj = technicians.find(t => t.id === tech.id);
                      if (tObj) handleOpenTechnicianPayoutModal(tObj);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>{tr('reports.pay')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 7. TAB 4: KLINIKA RASXODLARI (OPERATIONAL EXPENSES P&L) ── */}
      {activeReportTab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-[#0F172A] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div>
              <h3 className="font-black text-base text-slate-900 dark:text-white">
                {tr('reports.clinicOperationalExpensesPL')}
              </h3>
              <p className="text-xs text-slate-400">
                {tr('reports.expenseBreakdownByCategoryAndTotal')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setExpenseForm({
                  expenseType: 'clinic_expense',
                  doctorId: 0,
                  technicianId: 0,
                  branchId: 0,
                  category: 'Стоматологические материалы',
                  amount: '',
                  paymentMethod: 'Наличные',
                  cashRegister: 'cash',
                  operatorName: user?.name || 'Kassir',
                  notes: ''
                });
                setIsExpenseModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black shadow-md shadow-rose-500/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('reports.addExpense2')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {expensesBreakdownList.map((item, idx) => (
              <div key={idx} className="bg-white dark:bg-[#0F172A] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-sm text-slate-900 dark:text-white">
                    {item.category}
                  </span>
                  <span className="text-xs font-bold text-rose-600 dark:text-rose-400 font-mono">
                    {item.amount.toLocaleString()} so‘m ({item.percent}%)
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-rose-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(item.percent, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                  <span>{item.count} ta to‘lov operatsiyasi</span>
                  <span>{tr('reports.shareOfExpenses')}: {item.percent}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 7.5. TAB 5: FILIALLAR HISOBOTI & TAHLILI (BRANCH COMPARATIVE ANALYSIS) ── */}
      {activeReportTab === 'branches' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#0F172A] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div>
              <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <span>{tr('reports.branchFinancialOperationalAnalysis')}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {tr('reports.revenueExpensesNetProfitProfitabil')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-sky-300 font-bold text-xs border border-blue-200 dark:border-blue-800">
                {branches.length} {tr('reports.branches')}
              </span>
            </div>
          </div>

          {/* Branch Comparison Table */}
          <div className="bg-white dark:bg-[#0F172A] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-4 px-5">{tr('reports.branch')}</th>
                    <th className="py-4 px-4 text-center">{tr('reports.doctors')}</th>
                    <th className="py-4 px-4 text-center">{tr('reports.appointments')}</th>
                    <th className="py-4 px-4 text-right">{tr('reports.revenueUzs')}</th>
                    <th className="py-4 px-4 text-right">{tr('reports.expensesUzs')}</th>
                    <th className="py-4 px-4 text-right">{tr('reports.netProfit')}</th>
                    <th className="py-4 px-4 text-center">{tr('reports.margin')}</th>
                    <th className="py-4 px-4 text-right">{tr('reports.avgCheck')}</th>
                    <th className="py-4 px-5 text-right">{tr('reports.share')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {branchesFinancialList.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400 flex items-center justify-center font-bold">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-sm text-slate-900 dark:text-white block">{b.name}</span>
                            <span className="text-[11px] text-slate-400">{b.address || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center font-bold text-slate-700 dark:text-slate-300">
                        {b.doctorsCount} nafar
                      </td>
                      <td className="py-4 px-4 text-center font-bold text-slate-700 dark:text-slate-300">
                        {b.completedCount} / {b.appointmentsCount}
                      </td>
                      <td className="py-4 px-4 text-right font-black font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                        {b.income.toLocaleString()}
                      </td>
                      <td className="py-4 px-4 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                        {b.expense.toLocaleString()}
                      </td>
                      <td className="py-4 px-4 text-right font-black font-mono text-sm">
                        <span className={b.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}>
                          {b.netProfit.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${b.margin >= 30 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
                          {b.margin}%
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                        {b.avgCheck.toLocaleString()}
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div className="bg-blue-600 h-full rounded-full" style={{ width: `${Math.min(b.percentOfTotal, 100)}%` }} />
                          </div>
                          <span className="font-bold font-mono text-xs">{b.percentOfTotal}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards for each branch */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {branchesFinancialList.map((b) => (
              <div
                key={b.id}
                className="bg-white dark:bg-[#0F172A] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4 hover:border-blue-400 transition"
              >
                <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400 flex items-center justify-center font-black">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-black text-sm text-slate-900 dark:text-white">{b.name}</h4>
                      <p className="text-[11px] text-slate-400">{b.phone || '—'}</p>
                    </div>
                  </div>
                  <span className="text-xs font-black font-mono px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-sky-300">
                    {b.percentOfTotal}% {tr('reports.share2')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                    <span className="text-[10px] text-slate-400 block font-bold">{tr('reports.revenue')}</span>
                    <span className="font-black font-mono text-emerald-600 text-sm">{b.income.toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                    <span className="text-[10px] text-slate-400 block font-bold">{tr('reports.expense2')}</span>
                    <span className="font-black font-mono text-rose-600 text-sm">{b.expense.toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                    <span className="text-[10px] text-slate-400 block font-bold">{tr('reports.netProfit')}</span>
                    <span className="font-black font-mono text-slate-900 dark:text-white text-sm">{b.netProfit.toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                    <span className="text-[10px] text-slate-400 block font-bold">{tr('reports.avgTicket')}</span>
                    <span className="font-black font-mono text-blue-600 text-sm">{b.avgCheck.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 8. MODAL 1: + KIRIM QILISH (QUICK INCOME) ── */}
      {isIncomeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-emerald-600">
                <ArrowDownLeft className="w-5 h-5" />
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {tr('reports.addCashIncome')}
                </h3>
              </div>
              <button onClick={() => setIsIncomeModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveIncome} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {tr('reports.patient')}
                </label>
                <select
                  value={incomeForm.patientId}
                  onChange={e => {
                    const pid = Number(e.target.value);
                    const pat = patients.find(p => p.id === pid);
                    setIncomeForm({
                      ...incomeForm,
                      patientId: pid,
                      patientName: pat ? pat.full_name : ''
                    });
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white outline-none"
                >
                  <option value={0}>{tr('reports.selectPatient')}</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name} ({p.phone})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {tr('reports.doctor')}
                </label>
                <select
                  value={incomeForm.doctorId}
                  onChange={e => {
                    const did = Number(e.target.value);
                    const doc = employees.find(d => d.id === did);
                    setIncomeForm({
                      ...incomeForm,
                      doctorId: did,
                      doctorName: doc ? doc.full_name : ''
                    });
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white outline-none"
                >
                  <option value={0}>{tr('reports.selectDoctor')}</option>
                  {employees.filter(e => e.role === 'doctor').map(d => (
                    <option key={d.id} value={d.id}>{d.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {tr('reports.incomeAmountUzs')}
                </label>
                <input
                  type="number"
                  required
                  step="10000"
                  min="1000"
                  placeholder="masalan: 500000"
                  value={incomeForm.amount}
                  onChange={e => setIncomeForm({ ...incomeForm, amount: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-black font-mono text-emerald-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {tr('reports.paymentMethod')}
                  </label>
                  <select
                    value={incomeForm.paymentMethod}
                    onChange={e => {
                      const pm = e.target.value;
                      let cr = 'cash';
                      if (pm.includes('Карта')) cr = 'terminal';
                      else if (pm.includes('Click') || pm.includes('Payme')) cr = 'online';
                      else if (pm.includes('Перечисление')) cr = 'bank_transfer';
                      setIncomeForm({ ...incomeForm, paymentMethod: pm, cashRegister: cr });
                    }}
                    className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold outline-none"
                  >
                    <option value="Наличные">{tr('reports.cash2')}</option>
                    <option value="Карта / Терминал">{tr('reports.cardTerminal2')}</option>
                    <option value="Click / Payme">{tr('reports.clickPayme')}</option>
                    <option value="Перечисление (Расчетный счет)">{tr('reports.bankTransfer2')}</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {tr('reports.category')}
                  </label>
                  <select
                    value={incomeForm.category}
                    onChange={e => setIncomeForm({ ...incomeForm, category: e.target.value })}
                    className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold outline-none"
                  >
                    <option value="Оплата приема">{tr('reports.appointmentPayment')}</option>
                    <option value="Предоплата">{tr('reports.prepayment')}</option>
                    <option value="Погашение долга">{tr('reports.debtSettlement')}</option>
                    <option value="Прочие доходы">{tr('reports.otherIncome')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {tr('reports.notes')}
                </label>
                <input
                  type="text"
                  placeholder="masalan: Qabul to‘lovi yoki kassa kirimi"
                  value={incomeForm.notes}
                  onChange={e => setIncomeForm({ ...incomeForm, notes: e.target.value })}
                  className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setIsIncomeModalOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 text-xs font-bold">
                  {tr('reports.cancel')}
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm">
                  {tr('reports.saveIncome')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 9. MODAL 2: - CHIQIM QILISH (AVANS, TEXNIK TO‘LOVI, RASXOD) ── */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-rose-600">
                <ArrowUpRight className="w-5 h-5" />
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {expenseForm.expenseType === 'doctor_advance'
                    ? tr('reports.disburseDoctorAdvance2')
                    : expenseForm.expenseType === 'technician_payment'
                    ? tr('reports.payDentalTechnician')
                    : tr('reports.addClinicExpense')}
                </h3>
              </div>
              <button onClick={() => setIsExpenseModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-3">
              {/* Type Switcher */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {tr('reports.expenseType')}
                </label>
                <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl font-bold text-[10px]">
                  <button
                    type="button"
                    onClick={() => setExpenseForm({ ...expenseForm, expenseType: 'doctor_advance', category: 'Аванс врачу' })}
                    className={`py-1.5 rounded-lg transition ${expenseForm.expenseType === 'doctor_advance' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-xs' : 'text-slate-500'}`}
                  >
                    👨‍⚕️ {tr('reports.doctor2')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpenseForm({ ...expenseForm, expenseType: 'technician_payment', category: 'Оплата технику' })}
                    className={`py-1.5 rounded-lg transition ${expenseForm.expenseType === 'technician_payment' ? 'bg-white dark:bg-slate-700 text-amber-600 shadow-xs' : 'text-slate-500'}`}
                  >
                    🏢 {tr('reports.technician')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpenseForm({ ...expenseForm, expenseType: 'clinic_expense', category: 'Стоматологические материалы' })}
                    className={`py-1.5 rounded-lg transition ${expenseForm.expenseType === 'clinic_expense' ? 'bg-white dark:bg-slate-700 text-rose-600 shadow-xs' : 'text-slate-500'}`}
                  >
                    📉 {tr('reports.expense3')}
                  </button>
                </div>
              </div>

              {/* Conditional: Doctor select */}
              {expenseForm.expenseType === 'doctor_advance' && (
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {tr('reports.doctorRecipient')}
                  </label>
                  <select
                    value={expenseForm.doctorId}
                    required
                    onChange={e => setExpenseForm({ ...expenseForm, doctorId: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white outline-none"
                  >
                    <option value={0}>{tr('reports.selectDoctor2')}</option>
                    {employees.filter(e => e.role === 'doctor').map(d => (
                      <option key={d.id} value={d.id}>{d.full_name} ({d.specialty})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Conditional: Technician select */}
              {expenseForm.expenseType === 'technician_payment' && (
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {tr('reports.technicianLab')}
                  </label>
                  <select
                    value={expenseForm.technicianId}
                    required
                    onChange={e => setExpenseForm({ ...expenseForm, technicianId: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white outline-none"
                  >
                    <option value={0}>{tr('reports.selectTechnician')}</option>
                    {technicians.map(tech => (
                      <option key={tech.id} value={tech.id}>{tech.name} ({tech.lab_name})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Conditional: Clinic Expense Category */}
              {expenseForm.expenseType === 'clinic_expense' && (
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {tr('reports.expenseCategory')}
                  </label>
                  <select
                    value={expenseForm.category}
                    onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold outline-none"
                  >
                    <option value="Стоматологические материалы">{tr('reports.dentalMaterials')}</option>
                    <option value="Аренда помещений и коммунальные">{tr('reports.facilityRentUtilities')}</option>
                    <option value="Маркетинг, реклама и CRM">{tr('reports.marketingAds')}</option>
                    <option value="Зарплатный фонд персонала">{tr('reports.staffPayroll')}</option>
                    <option value="Хозяйственные расходы">{tr('reports.officeHousehold')}</option>
                    <option value="Прочие расходы">{tr('reports.otherExpenses')}</option>
                  </select>
                </div>
              )}

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {tr('reports.expenseAmountUzs')}
                </label>
                <input
                  type="number"
                  required
                  step="10000"
                  min="1000"
                  placeholder="masalan: 1000000"
                  value={expenseForm.amount}
                  onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-black font-mono text-rose-600 outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {tr('reports.fromWhichCashRegister')}
                </label>
                <select
                  value={expenseForm.cashRegister}
                  onChange={e => {
                    const cr = e.target.value;
                    let pm = 'Наличные';
                    if (cr === 'terminal') pm = 'Карта / Терминал';
                    else if (cr === 'bank_transfer') pm = 'Перечисление (Расчетный счет)';
                    else if (cr === 'online') pm = 'Click / Payme';
                    setExpenseForm({ ...expenseForm, cashRegister: cr, paymentMethod: pm });
                  }}
                  className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold outline-none"
                >
                  <option value="cash">{tr('reports.cashRegisterOption').replace('{bal}', financialSummary.cashBalance.toLocaleString())}</option>
                  <option value="bank_transfer">{tr('reports.bankTransfer')}</option>
                  <option value="terminal">{tr('reports.terminal2')}</option>
                  <option value="online">{tr('reports.online2')}</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {tr('reports.notesPurpose')}
                </label>
                <input
                  type="text"
                  placeholder="masalan: 1-yarm oylik avansi yoki hisob to‘lovi"
                  value={expenseForm.notes}
                  onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                  className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setIsExpenseModalOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 text-xs font-bold">
                  {tr('reports.cancel')}
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-sm">
                  {tr('reports.confirmExpense')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
