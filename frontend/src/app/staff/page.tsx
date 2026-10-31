'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { clinicApi } from '../../lib/api';
import { Employee, WorkplaceItem, SpecialtyItem, Branch } from '../../lib/types';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { useBranch } from '../../lib/branchContext';
import EmployeeFullModal from '../../components/EmployeeFullModal';
import {
  Users,
  UserPlus,
  Search,
  Phone,
  Armchair,
  Briefcase,
  Clock,
  Edit2,
  X,
  Lock,
  Building2
} from 'lucide-react';

export default function StaffPage() {
  const { language, tr } = useI18n();
  const { user } = useAuth();
  const { currentBranchId, refreshBranches } = useBranch();

  const isDirectorOrAdmin = user?.role === 'director' || user?.role === 'superadmin' || user?.role === 'deputy_director' || user?.role === 'admin';

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [workplaces, setWorkplaces] = useState<WorkplaceItem[]>([]);
  const [specialties, setSpecialties] = useState<SpecialtyItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roleFilter, setRoleFilter] = useState<'all' | 'director' | 'deputy_director' | 'admin' | 'doctor' | 'kassa'>('all');
  const [branchFilter, setBranchFilter] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Sync with global branch selector if active
  useEffect(() => {
    if (currentBranchId) {
      setBranchFilter(currentBranchId);
    }
  }, [currentBranchId]);

  // Unified full modal state
  const [isFullModalOpen, setIsFullModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const loadStaff = async () => {
    const cid = user?.clinicId ? Number(user.clinicId) : undefined;
    const [empData, wList, sList, bList] = await Promise.all([
      clinicApi.getEmployees(branchFilter !== 'all' ? branchFilter : undefined, cid),
      clinicApi.getWorkplaces(branchFilter !== 'all' ? branchFilter : undefined, cid),
      clinicApi.getSpecialties(),
      clinicApi.getBranches(undefined, cid)
    ]);
    setEmployees(empData);
    setWorkplaces(wList);
    setSpecialties(sList);
    setBranches(bList);
  };

  useEffect(() => {
    loadStaff();
  }, [user?.clinicId, branchFilter]);

  const handleOpenAdd = () => {
    setSelectedEmployee(null);
    setIsFullModalOpen(true);
  };

  const handleOpenEdit = (emp: Employee) => {
    setSelectedEmployee(emp);
    setIsFullModalOpen(true);
  };

  const handleSaveEmployee = async (employeeData: Partial<Employee>) => {
    const payload = {
      ...employeeData,
      clinic: employeeData.clinic || user?.clinicId || undefined
    };
    if (selectedEmployee?.id) {
      await clinicApi.updateEmployee(selectedEmployee.id, payload);
    } else {
      await clinicApi.createEmployee(payload);
    }
    await loadStaff();
    await refreshBranches();
  };

  const handleDeleteEmployee = async (id: number) => {
    await clinicApi.deleteEmployee(id, user?.clinicId || undefined);
    await loadStaff();
    await refreshBranches();
  };

  // Translations
  const txt = {
    uz: {
      pageTitle: 'Klinika xodimlari va shifokorlar',
      pageSub: 'Klinika shaxsiy tarkibi, ish jadvali, kabinetlar va ish haqi stavkalarini boshqarish',
      addBtn: 'Yangi xodim qo‘shish',
      searchPlaceholder: 'Ism, telefon yoki mutaxassislik bo‘yicha qidirish...',
      all: 'Barchasi',
      doctors: 'Shifokorlar',
      admins: 'Administratorlar',
      cashiers: 'Kassirlar',
      nurses: 'Hamshiralar',
      role: 'Lavozim',
      chair: 'Biriktirilgan stul/kabinet',
      salary: 'Ish haqi stavkasi',
      schedule: 'Ish tartibi',
      status: 'Holati',
      active: 'Faol ishlamoqda',
      vacation: 'Ta‘tilda / Nofaol',
      editBtn: 'Tahrirlash',
      editTitle: 'Xodim ma‘lumotlarini tahrirlash',
      addTitle: 'Yangi xodim ro‘yxatdan o‘tkazish',
      fullName: 'To‘liq F.I.SH',
      specialty: 'Mutaxassislik',
      phone: 'Telefon raqami',
      save: 'Saqlash',
      cancel: 'Bekor qilish',
      totalStaff: 'Jami xodimlar soni',
      activeStaff: 'Ayni paytda faol',
      doctorStaff: 'Shifokorlar',
      supportStaff: 'Ma‘muriyat va yordamchilar'
    },
    ru: {
      pageTitle: 'Сотрудники клиники и врачи',
      pageSub: 'Управление штатом клиники, расписанием, креслами и ставками зарплаты',
      addBtn: 'Добавить сотрудника',
      searchPlaceholder: 'Поиск по имени, телефону или специальности...',
      all: 'Все',
      doctors: 'Врачи',
      admins: 'Администраторы',
      cashiers: 'Кассиры',
      nurses: 'Медсестры',
      role: 'Должность',
      chair: 'Кабинет / Кресло',
      salary: 'Ставка / %',
      schedule: 'График работы',
      status: 'Статус',
      active: 'Активен',
      vacation: 'В отпуске / Неактивен',
      editBtn: 'Редактировать',
      editTitle: 'Редактирование сотрудника',
      addTitle: 'Регистрация нового сотрудника',
      fullName: 'Полное Ф.И.О.',
      specialty: 'Специальность',
      phone: 'Номер телефона',
      save: 'Сохранить',
      cancel: 'Отмена',
      totalStaff: 'Всего сотрудников',
      activeStaff: 'Активно работают',
      doctorStaff: 'Врачей',
      supportStaff: 'Администрация'
    },
    en: {
      pageTitle: 'Clinic Staff & Medical Team',
      pageSub: 'Manage staff profiles, schedules, assigned operatories, and compensation rates',
      addBtn: 'Add New Employee',
      searchPlaceholder: 'Search by name, phone, or specialty...',
      all: 'All',
      doctors: 'Doctors',
      admins: 'Admins',
      cashiers: 'Cashiers',
      nurses: 'Nurses',
      role: 'Position / Role',
      chair: 'Operatory / Chair',
      salary: 'Salary / Commission Rate',
      schedule: 'Work Schedule',
      status: 'Status',
      active: 'Active',
      vacation: 'On Leave',
      editBtn: 'Edit',
      editTitle: 'Edit Employee Details',
      addTitle: 'Register New Employee',
      fullName: 'Full Name',
      specialty: 'Specialty',
      phone: 'Phone Number',
      save: 'Save Changes',
      cancel: 'Cancel',
      totalStaff: 'Total Staff',
      activeStaff: 'Currently Active',
      doctorStaff: 'Doctors',
      supportStaff: 'Administrative Staff'
    }
  };

  const l = txt[language] || txt.uz;

  // Filtered employees
  const filtered = employees.filter((e) => {
    if (roleFilter !== 'all' && e.role !== roleFilter) return false;
    if (branchFilter !== 'all' && e.branch !== branchFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        e.full_name.toLowerCase().includes(q) ||
        e.specialty.toLowerCase().includes(q) ||
        e.phone.includes(q) ||
        (e.branch_name && e.branch_name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const doctorsCount = employees.filter((e) => e.role === 'doctor').length;
  const activeCount = employees.filter((e) => e.is_active).length;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-16 text-slate-900 dark:text-white">
      {/* 1. Header & Add Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#1E293B] p-5 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-sky-950 text-blue-600 dark:text-sky-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {l.pageTitle}
              </h1>
              <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-300">
                {l.pageSub}
              </p>
            </div>
          </div>
        </div>

        {isDirectorOrAdmin && (
          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 transition active:scale-95"
          >
            <UserPlus className="w-4 h-4" />
            <span>{l.addBtn}</span>
          </button>
        )}
      </div>

      {/* 2. Top Summary KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#1E293B] p-4 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-300 uppercase">{l.totalStaff}</span>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{employees.length} nafar</p>
        </div>
        <div className="bg-white dark:bg-[#1E293B] p-4 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-300 uppercase">{l.activeStaff}</span>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{activeCount} nafar</p>
        </div>
        <div className="bg-white dark:bg-[#1E293B] p-4 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-300 uppercase">{l.doctorStaff}</span>
          <p className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1">{doctorsCount} nafar</p>
        </div>
        <div className="bg-white dark:bg-[#1E293B] p-4 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-300 uppercase">{l.supportStaff}</span>
          <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{employees.length - doctorsCount} nafar</p>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-white dark:bg-[#1E293B] p-4 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={l.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155] rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Branch Filter dropdown */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-[#0F172A] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#334155]">
          <Building2 className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0" />
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 outline-none cursor-pointer"
          >
            <option value="all" className="dark:bg-slate-800">
              {tr('staff.allBranches')} ({employees.length})
            </option>
            {branches.map((b) => {
              const bCount = employees.filter((em) => em.branch === b.id).length;
              return (
                <option key={b.id} value={b.id} className="dark:bg-slate-800">
                  🏢 {b.name} ({bCount})
                </option>
              );
            })}
          </select>
        </div>

        {/* Role Filters */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-[#0F172A] p-1 rounded-xl border border-slate-200 dark:border-[#334155]">
          {[
            { id: 'all', label: tr('staff.all'), count: employees.length },
            { id: 'director', label: tr('staff.director'), count: employees.filter(e => e.role === 'director').length },
            { id: 'deputy_director', label: tr('staff.deputyDirector'), count: employees.filter(e => e.role === 'deputy_director').length },
            { id: 'admin', label: tr('staff.administrators'), count: employees.filter(e => e.role === 'admin').length },
            { id: 'doctor', label: tr('staff.doctors'), count: employees.filter(e => e.role === 'doctor').length },
            { id: 'kassa', label: tr('staff.cashiers'), count: employees.filter(e => e.role === 'kassa').length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setRoleFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                roleFilter === tab.id
                  ? 'bg-white dark:bg-[#1E293B] text-blue-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[10px] opacity-75 font-mono">({tab.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* 4. Staff Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((emp) => (
          <div
            key={emp.id}
            className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-200 dark:border-[#334155] p-5 shadow-xs flex flex-col justify-between hover:border-blue-400 dark:hover:border-sky-500 transition-all"
          >
            <div>
              {/* Header: Avatar, Name, Status, Edit */}
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-base shadow-sm ring-2 ring-white/10"
                    style={{ backgroundColor: emp.color }}
                  >
                    {emp.full_name.split(' ')[1]?.[0] || emp.full_name[0]}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                      {emp.full_name}
                    </h3>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">
                      {emp.specialty}
                    </p>
                  </div>
                </div>
              </div>

              {/* Status and Role Badges */}
              <div className="mt-3.5 flex items-center space-x-2">
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    emp.role === 'director'
                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                      : emp.role === 'deputy_director'
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                      : emp.role === 'admin'
                      ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                      : emp.role === 'doctor'
                      ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                      : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {emp.role === 'director' ? (tr('staff.director')) :
                   emp.role === 'deputy_director' ? (tr('staff.deputyDirector')) :
                   emp.role === 'admin' ? (tr('staff.administrator')) :
                   emp.role === 'doctor' ? (tr('staff.doctor')) :
                   (tr('staff.cashier'))}
                </span>

                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 ${
                    emp.is_active
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${emp.is_active ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span>{emp.is_active ? l.active : l.vacation}</span>
                </span>
              </div>

              {/* Detail fields */}
              <div className="mt-4 space-y-2 text-xs border-t border-slate-100 dark:border-[#334155]/70 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-300 font-medium flex items-center space-x-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{l.phone}</span>
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">{emp.phone}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-300 font-medium flex items-center space-x-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-500" />
                    <span>{tr('staff.branch')}</span>
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white text-xs">
                    {emp.branch_name || branches.find((b) => b.id === emp.branch)?.name || (tr('staff.allBranches'))}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-300 font-medium flex items-center space-x-1.5">
                    <Armchair className="w-3.5 h-3.5 text-slate-400" />
                    <span>{l.chair}</span>
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white">{emp.chair}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-300 font-medium flex items-center space-x-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                    <span>{l.salary}</span>
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{emp.salary_rate}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-300 font-medium flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{l.schedule}</span>
                  </span>
                  <span className="font-medium text-slate-700 dark:text-slate-200 text-[11px]">{emp.schedule}</span>
                </div>
              </div>
            </div>

            {/* Action Footer */}
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#334155]/70 flex items-center gap-2">
              <Link
                href={`/staff/${emp.id}`}
                className="flex-1 text-center py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition"
              >
                {tr('staff.profile')}
              </Link>
              {(isDirectorOrAdmin || (user && user.username === emp.username)) && (
                <button
                  onClick={() => handleOpenEdit(emp)}
                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-[#0F172A] dark:hover:bg-[#15233c] text-blue-600 dark:text-sky-400 text-xs font-bold rounded-xl transition border border-slate-200 dark:border-[#334155]"
                >
                  {l.editBtn}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* UNIFIED EMPLOYEE FULL MODAL (Matches Screenshots 1, 2, 3) */}
      <EmployeeFullModal
        isOpen={isFullModalOpen}
        onClose={() => setIsFullModalOpen(false)}
        onSave={handleSaveEmployee}
        onDelete={handleDeleteEmployee}
        employeeToEdit={selectedEmployee}
        workplaces={workplaces}
        specialties={specialties}
        branches={branches}
      />
    </div>
  );
}
