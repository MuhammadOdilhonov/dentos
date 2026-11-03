'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  Calendar,
  Plus,
  Trash2,
  Check,
  Lock,
  Armchair,
  Sparkles,
  ChevronDown,
  Building2,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  User
} from 'lucide-react';
import {
  Employee,
  WorkplaceItem,
  SpecialtyItem,
  EmployeeDaySchedule,
  EmployeeScheduleInterval,
  Branch,
  specialtyLabel
} from '../lib/types';
import { useI18n } from '../lib/i18n';
import { translate } from '../lib/locales';
import { useAuth } from '../lib/auth';
import PhoneInput, { parsePhone } from './PhoneInput';

const PALETTE_COLORS = [
  '#F472B6', '#C084FC', '#7DD3FC', '#A5B4FC', '#8B5CF6', '#FB923C', '#FEF08A', '#FECDD3', '#0F172A', '#475569', '#F87171',
  '#DB2777', '#FBBF24', '#BAE6FD', '#FDA4AF', '#84CC16', '#86EFAC', '#34D399', '#14B8A6', '#65A30D', '#38BDF8', '#3B82F6'
];

// Weekday → markaziy tk kaliti (tarjimalar lib/locales/ uz.ts / ru.ts / en.ts ichida)
const DAY_KEY: Record<EmployeeDaySchedule['day'], string> = {
  monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun'
};
const DEFAULT_DAYS: { day: EmployeeDaySchedule['day']; labelUz: string; labelRu: string; labelEn: string }[] =
  (Object.keys(DAY_KEY) as EmployeeDaySchedule['day'][]).map((day) => ({
    day,
    labelUz: translate('tk.' + DAY_KEY[day], 'uz'),
    labelRu: translate('tk.' + DAY_KEY[day], 'ru'),
    labelEn: translate('tk.' + DAY_KEY[day], 'en')
  }));

interface EmployeeFullModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (employeeData: Partial<Employee>) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  employeeToEdit?: Employee | null;
  workplaces: WorkplaceItem[];
  specialties: SpecialtyItem[];
  branches?: Branch[];
}

export default function EmployeeFullModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  employeeToEdit,
  workplaces,
  specialties,
  branches
}: EmployeeFullModalProps) {
  const { language, tk, tr } = useI18n();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab state & Role (Role is defined in Step 1)
  const [activeTab, setActiveTab] = useState<'main' | 'schedule' | 'access'>('main');
  const [role, setRole] = useState<Employee['role']>('doctor');

  // If role is changed away from doctor, automatically skip schedule tab
  useEffect(() => {
    if (role !== 'doctor' && activeTab === 'schedule') {
      setActiveTab('access');
    }
  }, [role, activeTab]);

  // Permission check: doctor can only edit their own name and password
  const isDoctor = user?.role === 'doctor';
  const isDirectorOrAdmin = user?.role === 'director' || user?.role === 'superadmin' || user?.role === 'deputy_director' || user?.role === 'admin';
  const isRestricted = isDoctor && !isDirectorOrAdmin;

  // Tab 1: Основные
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [extraPhone, setExtraPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [specialty, setSpecialty] = useState('Терапевт');
  const [branchId, setBranchId] = useState<number | ''>('');
  const [color, setColor] = useState('#3B82F6');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [avatar, setAvatar] = useState<string>('');

  // Tab 2: График
  const [scheduleList, setScheduleList] = useState<EmployeeDaySchedule[]>([]);

  // Tab 3: Доступ
  const [canLogin, setCanLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isPersonalNaryad, setIsPersonalNaryad] = useState(false);
  const [commissionRate, setCommissionRate] = useState<number>(35);
  // Oylik (so'm) — admin / direktor o'rinbosari / kassir uchun (shifokorda odatda 0)
  const [salaryRate, setSalaryRate] = useState<number>(0);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Initialize form when opening
  useEffect(() => {
    if (!isOpen) return;

    if (employeeToEdit) {
      // Split full_name if first_name / last_name not separated
      const parts = (employeeToEdit.full_name || '').trim().split(' ');
      const fName = employeeToEdit.first_name || parts[0] || '';
      const lName = employeeToEdit.last_name || parts.slice(1).join(' ') || '';

      setFirstName(fName);
      setLastName(lName);

      // Phone (to'liq qiymat — davlat kodi PhoneInput ichida)
      setPrimaryPhone(employeeToEdit.phone || '');
      setExtraPhone(employeeToEdit.phone_extra || '');

      setEmail(employeeToEdit.email || '');
      setBirthDate(employeeToEdit.birth_date || '');
      setSpecialty(employeeToEdit.specialty || 'Терапевт');
      setBranchId(employeeToEdit.branch ? Number(employeeToEdit.branch) : '');
      setColor(employeeToEdit.color || PALETTE_COLORS[0]);
      setGender((employeeToEdit.gender as 'male' | 'female') || 'male');
      setAvatar(employeeToEdit.avatar || '');

      // Schedule
      if (employeeToEdit.schedule_details && employeeToEdit.schedule_details.length > 0) {
        setScheduleList(
          employeeToEdit.schedule_details.map((s) => {
            const hasIntervals = Boolean(s.intervals && s.intervals.length > 0);
            const isWork = Boolean(s.enabled ?? s.is_workday ?? hasIntervals);
            return {
              ...s,
              enabled: isWork,
              is_workday: isWork,
              intervals: hasIntervals
                ? s.intervals
                : [
                    {
                      id: `int-${s.day}-0`,
                      start_hour: '09',
                      start_min: '00',
                      end_hour: '18',
                      end_min: '00',
                      chair: employeeToEdit.chair || workplaces[0]?.name || 'Кресло 1'
                    }
                  ]
            };
          })
        );
      } else {
        setScheduleList(
          DEFAULT_DAYS.map((d, i) => ({
            day: d.day,
            labelUz: d.labelUz,
            labelRu: d.labelRu,
            labelEn: d.labelEn,
            enabled: i < 6, // Mon-Sat active
            is_workday: i < 6,
            intervals: [
              {
                id: `int-${d.day}-0`,
                start_hour: '09',
                start_min: '00',
                end_hour: '18',
                end_min: '00',
                chair: employeeToEdit.chair || workplaces[0]?.name || 'Кресло 1'
              }
            ]
          }))
        );
      }

      // Access
      setCanLogin(employeeToEdit.can_login ?? true);
      setUsername(employeeToEdit.username || '');
      setRole(employeeToEdit.role || 'doctor');
      setPassword(employeeToEdit.password || '123456');
      setIsPersonalNaryad(employeeToEdit.naryad_type === 'personal');
      setCommissionRate(Number(employeeToEdit.commission_rate) || 0);
      setSalaryRate(Number(employeeToEdit.salary_rate) || 0);
    } else {
      // New employee defaults
      setFirstName('');
      setLastName('');
      setPrimaryPhone('');
      setExtraPhone('');
      setEmail('');
      setBirthDate('');
      setSpecialty(specialties[0]?.name || 'Терапевт');
      setBranchId(branches && branches.length > 0 ? branches[0].id : '');
      setColor(PALETTE_COLORS[0]);
      setGender('male');
      setAvatar('');
      setRole('doctor');

      setScheduleList(
        DEFAULT_DAYS.map((d, i) => ({
          day: d.day,
          labelUz: d.labelUz,
          labelRu: d.labelRu,
          labelEn: d.labelEn,
          enabled: i < 6,
          is_workday: i < 6,
          intervals: [
            {
              id: `int-${d.day}-0`,
              start_hour: '09',
              start_min: '00',
              end_hour: '18',
              end_min: '00',
              chair: workplaces[0]?.name || 'Кресло 1'
            }
          ]
        }))
      );

      setCanLogin(true);
      setUsername('');
      setRole('doctor');
      setPassword('123456');
      setIsPersonalNaryad(false);
      setCommissionRate(35);
      setSalaryRate(0);
    }
    setActiveTab('main');
  }, [isOpen, employeeToEdit, workplaces, specialties]);

  if (!isOpen) return null;

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        if (uploadEvent.target?.result) {
          setAvatar(String(uploadEvent.target.result));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Schedule interval helpers (Pure immutable updates)
  const handleAddInterval = (dayIndex: number) => {
    setScheduleList((prev) =>
      prev.map((day, dIdx) => {
        if (dIdx !== dayIndex) return day;
        const lastInv = day.intervals && day.intervals.length > 0 ? day.intervals[day.intervals.length - 1] : null;
        let startH = '09';
        let endH = '18';
        if (lastInv) {
          startH = lastInv.end_hour || '18';
          const nextH = Math.min(23, Number(startH) + 4);
          endH = String(nextH).padStart(2, '0');
        }
        const newInterval: EmployeeScheduleInterval = {
          id: `int-${day.day}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          start_hour: startH,
          start_min: '00',
          end_hour: endH,
          end_min: '00',
          chair: lastInv?.chair || workplaces[0]?.name || 'Кресло 1'
        };
        return {
          ...day,
          enabled: true,
          is_workday: true,
          intervals: [...(day.intervals || []), newInterval]
        };
      })
    );
  };

  const handleRemoveInterval = (dayIndex: number, intervalIndex: number) => {
    setScheduleList((prev) =>
      prev.map((day, dIdx) => {
        if (dIdx !== dayIndex) return day;
        const nextIntervals = day.intervals.filter((_, iIdx) => iIdx !== intervalIndex);
        if (nextIntervals.length === 0) {
          return {
            ...day,
            enabled: false,
            is_workday: false,
            intervals: []
          };
        }
        return {
          ...day,
          enabled: true,
          is_workday: true,
          intervals: nextIntervals
        };
      })
    );
  };

  const handleUpdateInterval = (
    dayIndex: number,
    intervalIndex: number,
    field: keyof EmployeeScheduleInterval,
    value: string
  ) => {
    setScheduleList((prev) =>
      prev.map((day, dIdx) => {
        if (dIdx !== dayIndex) return day;
        const newIntervals = day.intervals.map((inv, iIdx) => {
          if (iIdx !== intervalIndex) return inv;
          return { ...inv, [field]: value };
        });
        return {
          ...day,
          intervals: newIntervals
        };
      })
    );
  };

  const handleToggleDay = (dayIndex: number) => {
    setScheduleList((prev) =>
      prev.map((day, dIdx) => {
        if (dIdx !== dayIndex) return day;
        const nextEnabled = !day.enabled;
        let intervals = day.intervals;
        if (nextEnabled && (!intervals || intervals.length === 0)) {
          intervals = [
            {
              id: `int-${day.day}-${Date.now()}`,
              start_hour: '09',
              start_min: '00',
              end_hour: '18',
              end_min: '00',
              chair: workplaces[0]?.name || 'Кресло 1'
            }
          ];
        }
        return {
          ...day,
          enabled: nextEnabled,
          is_workday: nextEnabled,
          intervals
        };
      })
    );
  };

  const handleUpdateDayBranch = (dayIndex: number, branchVal: number | null) => {
    const bObj = branches?.find((b) => b.id === branchVal);
    setScheduleList((prev) =>
      prev.map((day, dIdx) => {
        if (dIdx !== dayIndex) return day;
        // Filial o'zgarsa — shu kundagi kreslolarni o'sha filialning birinchi kreslosiga moslaymiz
        const branchChairs = workplaces.filter((w) => !branchVal || Number(w.branch) === branchVal);
        const defaultChair = branchChairs[0]?.name || workplaces[0]?.name || 'Кресло 1';
        const intervals = (day.intervals || []).map((inv) => {
          const chairOk = branchChairs.some((w) => w.name === inv.chair);
          return chairOk ? inv : { ...inv, chair: defaultChair };
        });
        return { ...day, branch: branchVal, branch_name: bObj?.name || '', intervals };
      })
    );
  };

  // Forma submit (masalan Enter bosilsa) — FAQAT keyingi bosqichga o'tadi, HECH QACHON saqlamaydi.
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'main') {
      if (!firstName.trim()) {
        alert(tr('employee.pleaseEnterFirstName'));
        return;
      }
      setActiveTab(role === 'doctor' ? 'schedule' : 'access');
    } else if (activeTab === 'schedule' && role === 'doctor') {
      setActiveTab('access');
    }
    // 'access' (oxirgi bosqich) — hech narsa qilinmaydi: saqlash FAQAT "Saqlash" tugmasi orqali
  };

  // Haqiqiy saqlash — FAQAT "Saqlash" tugmasi bosilganda chaqiriladi
  const handleFinalSave = async () => {
    if (!firstName.trim()) {
      alert(tr('employee.pleaseEnterFirstName2'));
      setActiveTab('main');
      return;
    }

    setIsSaving(true);
    try {
      const full = `${firstName.trim()} ${lastName.trim()}`.trim();
      const cleanPhone = parsePhone(primaryPhone).national ? primaryPhone.trim() : '';
      const cleanExtra = parsePhone(extraPhone).national ? extraPhone.trim() : '';

      // Clean and sanitize schedule details
      const cleanScheduleDetails = scheduleList.map((s) => {
        const isWork = Boolean(s.enabled && s.intervals && s.intervals.length > 0);
        return {
          ...s,
          enabled: isWork,
          is_workday: isWork,
          intervals: isWork ? s.intervals : []
        };
      });

      // Extract all unique chairs from all active intervals
      const assignedChairsSet = new Set<string>();
      let primaryChair = workplaces[0]?.name || 'Кресло 1';
      for (const d of cleanScheduleDetails) {
        if (d.enabled && d.intervals && d.intervals.length > 0) {
          d.intervals.forEach((inv) => {
            if (inv.chair && inv.chair.trim()) assignedChairsSet.add(inv.chair.trim());
          });
          if (d.intervals[0].chair && primaryChair === (workplaces[0]?.name || 'Кресло 1')) {
            primaryChair = d.intervals[0].chair.trim();
          }
        }
      }
      // Chairs and schedule details are strictly for doctor role
      const assignedChairsList = role === 'doctor'
        ? (assignedChairsSet.size > 0 ? Array.from(assignedChairsSet) : [primaryChair])
        : [];
      const primaryChairFinal = role === 'doctor' ? primaryChair : '';
      const scheduleDetailsFinal = role === 'doctor' ? cleanScheduleDetails : [];

      // Readable schedule string summary
      const activeDays = cleanScheduleDetails.filter((s) => s.enabled);
      const scheduleSummary = role === 'doctor'
        ? (activeDays.length > 0
            ? `${activeDays[0]?.labelRu?.slice(0, 2)}-${activeDays[activeDays.length - 1]?.labelRu?.slice(0, 2)} ${
                activeDays[0]?.intervals[0]
                  ? `${activeDays[0].intervals[0].start_hour}:${activeDays[0].intervals[0].start_min} - ${activeDays[0].intervals[0].end_hour}:${activeDays[0].intervals[0].end_min}`
                  : '09:00 - 18:00'
              }`
            : 'Выходной')
        : (tr('employee.standardSchedule'));

      const branchVal = branchId ? Number(branchId) : null;
      const branchObj = branches?.find((b) => b.id === branchVal);

      const finalUsername = username.trim() || employeeToEdit?.username || (
        role === 'doctor'
          ? `dr_${firstName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'doctor'}`
          : `${firstName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'staff'}`
      );

      const payload: Partial<Employee> = {
        clinic: employeeToEdit?.clinic || user?.clinicId || undefined,
        full_name: full,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        branch: branchVal,
        branch_name: branchObj?.name,
        phone: cleanPhone,
        phone_extra: cleanExtra,
        email: email.trim(),
        birth_date: birthDate || undefined,
        specialty: role === 'doctor' ? specialty : (
          role === 'admin' ? 'Администратор' :
          role === 'kassa' ? 'Кассир' :
          role === 'nurse' ? 'Медсестра' :
          role === 'director' ? 'Директор' :
          role === 'deputy_director' ? 'Зам. директора' :
          role === 'technician' ? 'Зубной техник' : role
        ),
        color,
        gender,
        avatar: avatar || undefined,
        chair: primaryChairFinal,
        assigned_chairs: assignedChairsList,
        schedule: scheduleSummary,
        schedule_details: scheduleDetailsFinal,
        can_login: canLogin,
        username: finalUsername,
        role,
        password: password.trim() || '123456',
        naryad_type: role === 'doctor' ? (isPersonalNaryad ? 'personal' : 'clinic') : 'clinic',
        commission_rate: commissionRate || 0,
        salary_rate: salaryRate || 0,
        is_active: employeeToEdit?.is_active ?? true
      };

      await onSave(payload);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!employeeToEdit || !onDelete) return;
    if (typeof window !== 'undefined' && !window.confirm(tk('emp_delete_confirm'))) return;
    setIsDeleting(true);
    try {
      await onDelete(employeeToEdit.id);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const getDayLabel = (d: EmployeeDaySchedule) => tk(DAY_KEY[d.day]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-1 sm:p-2 md:p-3 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#0f172a] w-[98vw] max-w-[1700px] h-[95vh] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">
        
        {/* MODAL HEADER */}
        <div className="px-6 pt-5 pb-0 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
              {tk('emp_title')}
            </h2>

            {/* TABS */}
            <div className="flex items-center space-x-6 mt-3 text-xs sm:text-sm font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('main')}
                className={`pb-3 relative transition-colors ${
                  activeTab === 'main'
                    ? 'text-blue-600 dark:text-sky-400 font-black'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {tr('employee.n1General')}
                {activeTab === 'main' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-sky-400 rounded-full" />
                )}
              </button>

              {role === 'doctor' && (
                <button
                  type="button"
                  onClick={() => {
                    if (!firstName.trim()) {
                      alert(tr('employee.pleaseEnterFirstNameFirst'));
                      return;
                    }
                    setActiveTab('schedule');
                  }}
                  className={`pb-3 relative transition-colors ${
                    activeTab === 'schedule'
                      ? 'text-blue-600 dark:text-sky-400 font-black'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  {tr('employee.n2Schedule')}
                  {activeTab === 'schedule' && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-sky-400 rounded-full" />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (!firstName.trim()) {
                    alert(tr('employee.pleaseEnterFirstNameFirst'));
                    return;
                  }
                  setActiveTab('access');
                }}
                className={`pb-3 relative transition-colors ${
                  activeTab === 'access'
                    ? 'text-blue-600 dark:text-sky-400 font-black'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {role === 'doctor'
                  ? (tr('employee.n3Access'))
                  : (tr('employee.n2Access'))}
                {activeTab === 'access' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-sky-400 rounded-full" />
                )}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* RESTRICTION NOTICE FOR DOCTOR */}
        {isRestricted && (
          <div className="bg-amber-50 dark:bg-amber-950/40 px-6 py-2 border-b border-amber-200 dark:border-amber-900/50 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 font-semibold">
            <Lock className="w-4 h-4 text-amber-600" />
            <span>
              {tr('employee.youAreLoggedInAsA')}
            </span>
          </div>
        )}

        {/* FORM BODY */}
        <form onSubmit={handleFormSubmit} className="flex-1 flex flex-col justify-between overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* ══════════════ TAB 1: ОСНОВНЫЕ ══════════════ */}
            {activeTab === 'main' && (
              <div className="space-y-5 animate-in fade-in duration-150">
                {/* 1-BOSQICHDA ROLNI BELGILASH: Shifokor yoki boshqa xodim */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-slate-50 dark:from-blue-950/40 dark:via-indigo-950/20 dark:to-slate-900/60 border border-blue-200/80 dark:border-blue-800/60 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-black uppercase tracking-wider text-blue-900 dark:text-blue-300 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-sky-400" />
                      <span>{tk('role_lbl')}*</span>
                    </label>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                      role === 'doctor'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}>
                      {role === 'doctor'
                        ? (tr('employee.doctor3StepsGeneralScheduleAccess'))
                        : (tr('employee.staff2StepsGeneralAccess'))}
                    </span>
                  </div>

                  <select
                    disabled={isRestricted}
                    value={role}
                    onChange={(e) => {
                      const newRole = e.target.value as Employee['role'];
                      setRole(newRole);
                    }}
                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition disabled:opacity-60 cursor-pointer shadow-xs"
                  >
                    {/* Direktor roli yaratilmaydi — klinikaning direktori allaqachon bitta (superadmin ochadi) */}
                    <option value="deputy_director">{tr('employee.deputyDirector')}</option>
                    <option value="admin">{tr('employee.administrator')}</option>
                    <option value="doctor">{tr('employee.doctor')}</option>
                    <option value="kassa">{tr('employee.cashier')}</option>
                  </select>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {role === 'doctor'
                      ? (tr('employee.forDoctorsChairAssignmentAndWorkin'))
                      : (tr('employee.forThisRoleDoctorChairsAnd'))}
                  </p>
                </div>

                {/* Row 1: Имя & Фамилия */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      {tk('first_name')}*
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={tk('first_name_ph')}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      {tk('last_name')}*
                    </label>
                    <input
                      type="text"
                      placeholder={tk('last_name_ph')}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                    />
                  </div>
                </div>

                {/* Row 2: Основной номер & Дополнительный */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      {tk('phone_primary')}*
                    </label>
                    <PhoneInput
                      disabled={isRestricted}
                      value={primaryPhone}
                      onChange={setPrimaryPhone}
                      className="w-full border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/60 text-sm font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      {tk('phone_extra')}
                    </label>
                    <PhoneInput
                      disabled={isRestricted}
                      value={extraPhone}
                      onChange={setExtraPhone}
                      className="w-full border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/60 text-sm font-medium"
                    />
                  </div>
                </div>

                {/* Row 3: Email & Дата рождения */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Email*
                    </label>
                    <input
                      type="email"
                      disabled={isRestricted}
                      placeholder="doctor@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      {tk('birth_date')}
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        disabled={isRestricted}
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition disabled:opacity-60"
                      />
                    </div>
                  </div>
                </div>

                {/* Row 4: Специальность (Faqat shifokor uchun) & Цвет */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {role === 'doctor' ? (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        <span>{tk('specialty_lbl')}*</span>
                      </label>
                      <select
                        disabled={isRestricted}
                        value={specialty}
                        onChange={(e) => setSpecialty(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition disabled:opacity-60 cursor-pointer"
                      >
                        {specialties.map((s) => (
                          <option key={s.id} value={s.name}>
                            {specialtyLabel(s, language)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                        <span>{tr('employee.positionCategory')}</span>
                      </label>
                      <div className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200">
                        {role === 'director' ? (tr('employee.director')) :
                         role === 'deputy_director' ? (tr('employee.deputyDirector')) :
                         role === 'admin' ? (tr('employee.administrator')) :
                         (tr('employee.cashier'))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      {tk('color_lbl')}
                    </label>
                    {/* 22 color blocks matching Screenshot 1 */}
                    <div className="grid grid-cols-11 gap-1.5 p-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl">
                      {PALETTE_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          disabled={isRestricted}
                          onClick={() => setColor(c)}
                          className={`h-7 rounded-md transition-all flex items-center justify-center ${
                            color.toLowerCase() === c.toLowerCase()
                              ? 'ring-2 ring-blue-600 ring-offset-2 dark:ring-offset-slate-900 scale-105 shadow-xs'
                              : 'hover:opacity-80'
                          }`}
                          style={{ backgroundColor: c }}
                          title={c}
                        >
                          {color.toLowerCase() === c.toLowerCase() && (
                            <Check className="w-3.5 h-3.5 text-white drop-shadow-md" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Filial (Branch) Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>{tr('employee.assignedBranch')}</span>
                  </label>
                  <select
                    disabled={isRestricted}
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition disabled:opacity-60 cursor-pointer"
                  >
                    <option value="">{tr('employee.generalAllBranches')}</option>
                    {branches?.map((b) => (
                      <option key={b.id} value={b.id}>
                        🏢 {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Oylik / Foiz — admin, direktor o'rinbosari, kassir uchun (shifokorda foiz access tabda) */}
                {role !== 'doctor' && (
                  <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50 space-y-3">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        <span>{tk('emp_comp_title')}</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{tk('emp_comp_hint')}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{tk('emp_salary_label')}</label>
                        <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/60 overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 transition">
                          <input
                            type="number"
                            min={0}
                            step={100000}
                            disabled={isRestricted}
                            value={salaryRate || ''}
                            onChange={(e) => setSalaryRate(Number(e.target.value) || 0)}
                            placeholder="0"
                            className="flex-1 px-4 py-2.5 bg-transparent text-sm font-black outline-none disabled:opacity-60"
                          />
                          <span className="px-4 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-sm">{tk('k_11')}</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{tk('emp_commission_label')}</label>
                        <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900/60 overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 transition">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            disabled={isRestricted}
                            value={commissionRate || ''}
                            onChange={(e) => setCommissionRate(Number(e.target.value) || 0)}
                            placeholder="0"
                            className="flex-1 px-4 py-2.5 bg-transparent text-sm font-black outline-none disabled:opacity-60"
                          />
                          <span className="px-4 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-sm">%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Row 5: Пол & Указать фото */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                      {tk('gender_lbl')}
                    </label>
                    <div className="flex items-center space-x-6 text-sm font-semibold">
                      <label className="inline-flex items-center space-x-2 cursor-pointer select-none">
                        <input
                          type="radio"
                          name="gender"
                          disabled={isRestricted}
                          checked={gender === 'male'}
                          onChange={() => setGender('male')}
                          className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                        />
                        <span>{tk('gender_male')}</span>
                      </label>

                      <label className="inline-flex items-center space-x-2 cursor-pointer select-none">
                        <input
                          type="radio"
                          name="gender"
                          disabled={isRestricted}
                          checked={gender === 'female'}
                          onChange={() => setGender('female')}
                          className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                        />
                        <span>{tk('gender_female')}</span>
                      </label>
                    </div>

                    {/* Avatar box + Upload button */}
                    <div className="mt-4 flex items-center space-x-4">
                      <div
                        className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-center overflow-hidden relative shadow-inner"
                        style={{ borderColor: color }}
                      >
                        {avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-sm"
                            style={{ backgroundColor: color }}
                          >
                            {firstName ? firstName[0]?.toUpperCase() : '👨‍⚕️'}
                          </div>
                        )}
                      </div>

                      <div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          disabled={isRestricted}
                          onChange={handleAvatarUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={isRestricted}
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center space-x-2 px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition shadow-xs disabled:opacity-50"
                        >
                          <Camera className="w-4 h-4 text-slate-500" />
                          <span>{tk('upload_photo')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════ TAB 2: ГРАФИК (FAQAT SHIFOKOR UCHUN) ══════════════ */}
            {activeTab === 'schedule' && role === 'doctor' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/40 p-4 rounded-2xl border border-blue-200 dark:border-blue-900/50">
                  <div className="flex items-center space-x-3">
                    <Armchair className="w-5 h-5 text-blue-600 dark:text-sky-400" />
                    <div>
                      <h4 className="text-xs sm:text-sm font-black text-blue-900 dark:text-blue-100">
                        {tr('employee.workScheduleChairRoomAssignment')}
                      </h4>
                      <p className="text-[11px] text-blue-700 dark:text-blue-300">
                        {tr('employee.assignWorkHoursAndDesignatedDental')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {scheduleList.map((dayItem, dIdx) => (
                    <div
                      key={dayItem.day}
                      className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                        dayItem.enabled
                          ? 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800 opacity-60'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        {/* Day switch and name + per-day branch (filial almashinuvi) */}
                        <div className="flex flex-col gap-1.5 min-w-[150px]">
                          <div className="flex items-center space-x-3">
                            <input
                              type="checkbox"
                              disabled={isRestricted}
                              checked={dayItem.enabled}
                              onChange={() => handleToggleDay(dIdx)}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                            />
                            <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                              {getDayLabel(dayItem)}
                            </span>
                          </div>
                          {dayItem.enabled && branches && branches.length > 1 && (
                            <select
                              disabled={isRestricted}
                              value={dayItem.branch ?? ''}
                              onChange={(e) => handleUpdateDayBranch(dIdx, e.target.value ? Number(e.target.value) : null)}
                              className="ml-7 px-2 py-1 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg text-[11px] font-bold text-blue-800 dark:text-blue-200 outline-none cursor-pointer"
                              title={tr('employee.k')}
                            >
                              <option value="">{tr('employee.pickBranch')}</option>
                              {branches.map((b) => (
                                <option key={b.id} value={b.id}>🏢 {b.name}</option>
                              ))}
                            </select>
                          )}
                        </div>

                        {/* Intervals list */}
                        {dayItem.enabled ? (
                          <div className="flex-1 space-y-2">
                            {dayItem.intervals.map((inv, iIdx) => (
                              <div
                                key={inv.id || iIdx}
                                className="flex flex-wrap items-center gap-2 text-xs"
                              >
                                {/* Start Hour : Min */}
                                <div className="flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-2 py-1.5 font-bold">
                                  <input
                                    type="text"
                                    disabled={isRestricted}
                                    maxLength={2}
                                    value={inv.start_hour}
                                    onChange={(e) =>
                                      handleUpdateInterval(dIdx, iIdx, 'start_hour', e.target.value)
                                    }
                                    className="w-6 bg-transparent text-center outline-none font-black"
                                  />
                                  <span>:</span>
                                  <input
                                    type="text"
                                    disabled={isRestricted}
                                    maxLength={2}
                                    value={inv.start_min}
                                    onChange={(e) =>
                                      handleUpdateInterval(dIdx, iIdx, 'start_min', e.target.value)
                                    }
                                    className="w-6 bg-transparent text-center outline-none font-black"
                                  />
                                </div>

                                <span className="text-slate-400 font-bold">-</span>

                                {/* End Hour : Min */}
                                <div className="flex items-center bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-2 py-1.5 font-bold">
                                  <input
                                    type="text"
                                    disabled={isRestricted}
                                    maxLength={2}
                                    value={inv.end_hour}
                                    onChange={(e) =>
                                      handleUpdateInterval(dIdx, iIdx, 'end_hour', e.target.value)
                                    }
                                    className="w-6 bg-transparent text-center outline-none font-black"
                                  />
                                  <span>:</span>
                                  <input
                                    type="text"
                                    disabled={isRestricted}
                                    maxLength={2}
                                    value={inv.end_min}
                                    onChange={(e) =>
                                      handleUpdateInterval(dIdx, iIdx, 'end_min', e.target.value)
                                    }
                                    className="w-6 bg-transparent text-center outline-none font-black"
                                  />
                                </div>

                                {/* Chair selector for interval — shu kun filialiga tegishli kreslolar */}
                                <div className="flex-1 min-w-[160px] max-w-[240px]">
                                  <select
                                    disabled={isRestricted}
                                    value={inv.chair || workplaces[0]?.name || ''}
                                    onChange={(e) =>
                                      handleUpdateInterval(dIdx, iIdx, 'chair', e.target.value)
                                    }
                                    className="w-full px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
                                  >
                                    {(workplaces.filter((w) => !dayItem.branch || Number(w.branch) === dayItem.branch).length > 0
                                      ? workplaces.filter((w) => !dayItem.branch || Number(w.branch) === dayItem.branch)
                                      : workplaces
                                    ).map((w) => (
                                      <option key={w.id} value={w.name}>
                                        💺 {w.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Plus & Delete buttons matching screenshot 2 */}
                                {!isRestricted && (
                                  <div className="flex items-center space-x-1">
                                    <button
                                      type="button"
                                      onClick={() => handleAddInterval(dIdx)}
                                      className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400 hover:bg-blue-100 flex items-center justify-center transition font-bold"
                                      title={tk('add_interval')}
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleRemoveInterval(dIdx, iIdx)}
                                      className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 hover:bg-rose-100 flex items-center justify-center transition font-bold"
                                      title={tk('del_interval')}
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-between text-slate-400 text-xs italic">
                            <span>{tr('employee.dayOff')}</span>
                            {!isRestricted && (
                              <button
                                type="button"
                                onClick={() => handleToggleDay(dIdx)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/60 transition not-italic"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                {tr('employee.addHours')}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ══════════════ TAB 3: ДОСТУП ══════════════ */}
            {activeTab === 'access' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                {/* Switch: Разрешить авторизацию */}
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    disabled={isRestricted}
                    onClick={() => setCanLogin(!canLogin)}
                    className={`w-12 h-6 rounded-full transition-colors relative p-0.5 focus:outline-none disabled:opacity-50 ${
                      canLogin ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                        canLogin ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                    {tk('allow_auth')}
                  </span>
                </div>

                {/* Row 1: Имя пользователя & Роль */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      {tk('username_lbl')}
                    </label>
                    <input
                      type="text"
                      disabled={isRestricted}
                      placeholder="dr_valentin"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      {tk('role_lbl')}
                    </label>
                    <div className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-black text-slate-800 dark:text-slate-200 flex items-center justify-between">
                      <span>
                        {role === 'director' ? (tr('employee.director')) :
                         role === 'deputy_director' ? (tr('employee.deputyDirector')) :
                         role === 'admin' ? (tr('employee.administrator')) :
                         (tr('employee.cashier'))}
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">
                        ({tr('employee.setInStep1')})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Row 2: Задать новый пароль */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      {tk('set_new_password')}
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                    />
                  </div>
                </div>

                {/* Row 3: Naryadlar (Klinika bilan birga yoki shaxsiy) & Shifokor foizi (%) - FAQAT SHIFOKOR UCHUN */}
                {role === 'doctor' && (
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700 space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {tk('naryad_sync_type')}
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Toggle: shaxsiy naryadlar yoki klinikaniki bilan birga */}
                      <div className="flex items-center space-x-3 bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          disabled={isRestricted}
                          onClick={() => setIsPersonalNaryad(!isPersonalNaryad)}
                          className={`w-12 h-6 rounded-full transition-colors relative p-0.5 focus:outline-none disabled:opacity-50 ${
                            isPersonalNaryad ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                        >
                          <span
                            className={`block w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                              isPersonalNaryad ? 'translate-x-6' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <div>
                          <span className="text-xs sm:text-sm font-bold block text-slate-900 dark:text-white">
                            {isPersonalNaryad ? tk('naryad_personal_toggle') : tk('naryad_shared_toggle')}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {isPersonalNaryad
                              ? tr('employee.doctorOperatesWithCustomIndividual')
                              : tr('employee.calculatedBasedOnStandardClinicPri')}
                          </span>
                        </div>
                      </div>

                      {/* Shifokor foizi (%) */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                          {tk('doctor_percent_lbl')}
                        </label>
                        <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/60 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            disabled={isRestricted}
                            value={commissionRate}
                            onChange={(e) => setCommissionRate(Number(e.target.value) || 0)}
                            className="flex-1 px-4 py-2.5 bg-transparent text-sm font-black outline-none disabled:opacity-60"
                          />
                          <span className="px-4 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-sm">
                            %
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* MODAL FOOTER: Step-by-step navigation (Keyingisi → Keyingisi → Oxirida Saqlash) */}
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            {/* Left: Orqaga / Bekor qilish / O'chirish */}
            <div className="flex items-center gap-2.5">
              {employeeToEdit && onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting || isSaving}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/70 text-xs sm:text-sm font-bold text-red-600 dark:text-red-400 transition disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{tk('emp_delete')}</span>
                </button>
              )}
              {activeTab === 'main' ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 transition"
                >
                  {tr('employee.cancel')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (activeTab === 'access') {
                      setActiveTab(role === 'doctor' ? 'schedule' : 'main');
                    } else if (activeTab === 'schedule') {
                      setActiveTab('main');
                    }
                  }}
                  className="flex items-center space-x-1.5 px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 transition shadow-2xs"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{tr('employee.back')}</span>
                </button>
              )}
            </div>

            {/* Right: Keyingisi → or Oxirida Saqlash */}
            <div className="flex items-center space-x-3">
              {activeTab === 'main' ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!firstName.trim()) {
                      alert(tr('employee.pleaseEnterFirstName'));
                      return;
                    }
                    if (role === 'doctor') {
                      setActiveTab('schedule');
                    } else {
                      setActiveTab('access');
                    }
                  }}
                  className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs sm:text-sm font-bold transition shadow-md shadow-blue-500/20"
                >
                  <span>{tr('employee.next')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : activeTab === 'schedule' && role === 'doctor' ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('access')}
                  className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs sm:text-sm font-bold transition shadow-md shadow-blue-500/20"
                >
                  <span>{tr('employee.next')}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                /* FINAL STEP: Saqlash — faqat shu tugma saqlaydi */
                <button
                  type="button"
                  onClick={handleFinalSave}
                  disabled={isSaving}
                  className="flex items-center space-x-2 px-7 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs sm:text-sm font-bold transition shadow-md shadow-emerald-500/20 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {isSaving
                      ? tr('employee.saving')
                      : tr('employee.save')}
                  </span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
