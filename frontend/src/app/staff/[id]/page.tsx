'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { clinicApi, isDemoClinic } from '../../../lib/api';
import {
  Employee,
  Appointment,
  Patient,
  NaryadCatalogItem,
  DoctorNaryadAssignment,
  DoctorCertificate,
  DoctorDiploma,
  WorkplaceItem,
  SpecialtyItem,
  Branch
} from '../../../lib/types';
import { useI18n } from '../../../lib/i18n';
import { useAuth } from '../../../lib/auth';
import { useBranch } from '../../../lib/branchContext';
import EmployeeFullModal from '../../../components/EmployeeFullModal';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Clock,
  Briefcase,
  CalendarCheck,
  CheckCircle2,
  Wallet,
  AlertCircle,
  Users,
  Stethoscope,
  Edit2,
  Plus,
  Trash2,
  Save,
  X,
  TrendingUp,
  Award,
  Armchair,
  GraduationCap,
  Layers,
  FileCheck2,
  Building2,
  ExternalLink,
  ChevronRight,
  Sparkles,
  DollarSign,
  Printer,
  Search,
  Check,
  Eye
} from 'lucide-react';

type Lang = 'uz' | 'ru' | 'en';



const AVAILABLE_CHAIRS = [
  'Кресло 1 (Терапия)',
  'Кресло 2 (Ортопедия)',
  'Кресло 3 (Хирургия)',
  'Кресло 4 (Детское)',
  'VIP Кабинет 1',
  'Операционная 2'
];

export default function DoctorDetailPage() {
  const { language, tr, tk } = useI18n();
  const som = tr('staffdict.som');

  const params = useParams();
  const empId = params?.id ? Number(params.id) : 0;

  const { user } = useAuth();
  const { refreshBranches } = useBranch();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [catalog, setCatalog] = useState<NaryadCatalogItem[]>([]);
  const [assignments, setAssignments] = useState<DoctorNaryadAssignment[]>([]);
  const [workplaces, setWorkplaces] = useState<WorkplaceItem[]>([]);
  const [specialties, setSpecialties] = useState<SpecialtyItem[]>([]);
  const [isFullModalOpen, setIsFullModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Active Top-Level Navigation Tab (Like /patients/[id])
  const [activeTab, setActiveTab] = useState<string>('Asosiy');

  // Appointments filter in Qabullar tab
  const [aptStatusFilter, setAptStatusFilter] = useState<'all' | 'completed' | 'pending' | 'debt' | 'cancelled'>('all');
  const [aptSearch, setAptSearch] = useState('');

  // Patients search in Bemorlari tab
  const [patSearch, setPatSearch] = useState('');

  // Payroll (oylik) — davr bo'yicha to'langan/to'lanmagan holati (localStorage)
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const [payrollPaid, setPayrollPaid] = useState<Record<string, boolean>>({});
  const [salaryPeriod, setSalaryPeriod] = useState<string>(monthKey(new Date()));
  const payrollPeriods = useMemo(() => {
    const locale = language === 'uz' ? 'uz-UZ' : language === 'en' ? 'en-US' : 'ru-RU';
    const arr: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      arr.push({ key: monthKey(dt), label: dt.toLocaleDateString(locale, { month: 'long', year: 'numeric' }) });
    }
    return arr;
  }, [language]);
  useEffect(() => {
    if (!employee || typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(`32desk_payroll_${employee.id}`);
      setPayrollPaid(raw ? JSON.parse(raw) : {});
    } catch {}
  }, [employee?.id]);
  const togglePayroll = (period: string) => {
    if (!employee) return;
    setPayrollPaid((prev) => {
      const next = { ...prev, [period]: !prev[period] };
      try { localStorage.setItem(`32desk_payroll_${employee.id}`, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Permission checks:
  // Director / Superadmin can edit any employee.
  // Doctor can only edit their own profile (and only name & password inside modal).
  const isDirectorOrAdmin = user?.role === 'director' || user?.role === 'superadmin' || user?.role === 'deputy_director' || user?.role === 'admin';
  const isDoctor = user?.role === 'doctor';
  const isSelf = Boolean(
    employee &&
    (String(user?.id) === String(employee.id) ||
      (user?.username && employee.username && user.username === employee.username) ||
      (user?.name && (employee.full_name === user.name || employee.name === user.name)))
  );
  const canEdit = isDirectorOrAdmin || (isDoctor && isSelf);

  // Assign Naryad Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<DoctorNaryadAssignment | null>(null);
  const [naryadCatFilter, setNaryadCatFilter] = useState<string>('all');
  const [naryadSearch, setNaryadSearch] = useState<string>('');

  const doctorPercent = Number(employee?.commission_rate) || 35;

  const handleInlinePriceChange = async (assignmentId: string, newPrice: number) => {
    const prevAssignments = assignments;
    setAssignments((prev) =>
      prev.map((a) => (a.id === assignmentId ? { ...a, custom_price: newPrice, commission_percent: doctorPercent, is_custom_price: true } : a))
    );
    try {
      await clinicApi.updateDoctorNaryad(assignmentId, {
        custom_price: newPrice,
        commission_percent: doctorPercent,
        is_custom_price: true
      });
    } catch {
      // Server saqlamadi — optimistik o'zgarishni qaytaramiz (soxta muvaffaqiyat yo'q).
      setAssignments(prevAssignments);
    }
  };

  const populateBySpecialty = async (targetCategory?: string) => {
    let itemsToAssign = catalog;
    if (targetCategory && targetCategory !== 'all') {
      itemsToAssign = catalog.filter((c) =>
        c.category.toLowerCase().includes(targetCategory.toLowerCase())
      );
    }
    const currentNaryadIds = new Set(assignments.map((a) => a.naryad_id));
    try {
      for (const item of itemsToAssign) {
        if (!currentNaryadIds.has(item.id)) {
          await clinicApi.assignDoctorNaryad({
            doctor_id: empId,
            naryad_id: item.id,
            name: item.name,
            category: item.category,
            custom_price: item.base_price,
            commission_percent: doctorPercent,
            is_custom_price: false
          });
        }
      }
      setAssignments(await clinicApi.getDoctorNaryads(empId));
    } catch {
      setAssignments(await clinicApi.getDoctorNaryads(empId).catch(() => assignments));
    }
  };

  const [assignForm, setAssignForm] = useState<{
    naryad_id: string;
    price_type: 'standard' | 'custom';
    custom_price: number;
    commission_percent: number;
    notes: string;
  }>({
    naryad_id: '',
    price_type: 'standard',
    custom_price: 350000,
    commission_percent: 35,
    notes: ''
  });

  // Certificate Modal
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [certForm, setCertForm] = useState({
    title: '',
    issuer: '',
    year: new Date().getFullYear().toString(),
    file_url: ''
  });

  // Diploma Modal
  const [isDipModalOpen, setIsDipModalOpen] = useState(false);
  const [dipForm, setDipForm] = useState({
    degree: 'Врач-стоматолог общей практики',
    institution: 'Ташкентский Государственный Стоматологический Институт',
    specialty: 'Стоматология',
    year: '2019',
    file_url: ''
  });

  // Preview Modal (for Certificate or Diploma image)
  const [previewDoc, setPreviewDoc] = useState<{ title: string; url?: string; type: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [emps, apts, pats, wplaces, specs, bList] = await Promise.all([
        clinicApi.getEmployees(),
        clinicApi.getAppointments(),
        clinicApi.getPatients(),
        clinicApi.getWorkplaces(),
        clinicApi.getSpecialties(),
        clinicApi.getBranches()
      ]);
      const emp = emps.find((e) => e.id === empId) || null;
      setEmployee(emp);
      setAppointments(apts.filter((a) => a.doctor === empId));
      setPatients(pats);
      const catList = await clinicApi.getNaryadCatalog();
      setCatalog(catList);
      const existingAssigns = await clinicApi.getDoctorNaryads(empId);
      if (existingAssigns.length === 0 && emp && !isDemoClinic()) {
        // Automatically pre-populate matching this employee's specialty / direction
        const specStr = `${emp.specialty || ''} ${emp.role || ''}`.toLowerCase();
        let catFilter = '';
        if (specStr.includes('terap') || specStr.includes('davolash')) catFilter = 'Терапия';
        else if (specStr.includes('ortoped') || specStr.includes('protez')) catFilter = 'Ортопедия';
        else if (specStr.includes('xirurg') || specStr.includes('jarroh')) catFilter = 'Хирургия';
        else if (specStr.includes('implant')) catFilter = 'Implantologiya';
        else if (specStr.includes('ortodont')) catFilter = 'Ортодонтия';
        else if (specStr.includes('bolalar')) catFilter = 'Детская стоматология';

        const defaultItems = catFilter
          ? catList.filter((c) => c.category.toLowerCase().includes(catFilter.toLowerCase()))
          : catList.slice(0, 16);

        try {
          for (const item of defaultItems) {
            await clinicApi.assignDoctorNaryad({
              doctor_id: empId,
              naryad_id: item.id,
              name: item.name,
              category: item.category,
              custom_price: item.base_price,
              commission_percent: doctorPercent,
              is_custom_price: false
            });
          }
          setAssignments(await clinicApi.getDoctorNaryads(empId));
        } catch {
          setAssignments(existingAssigns);
        }
      } else {
        setAssignments(existingAssigns);
      }
      setWorkplaces(wplaces);
      setSpecialties(specs);
      setBranches(bList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [empId]);

  // Derived Financials & Stats
  const stats = useMemo(() => {
    let revenue = 0;
    let debt = 0;
    let completed = 0;
    const perPatient: Record<number, { name: string; phone: string; visits: number; paid: number; debt: number; lastDate: string }> = {};

    appointments.forEach((a) => {
      const price = Number(a.price) || 450000;
      const paidAmt = Number(a.paid_amount) || price;
      const d = Math.max(0, price - paidAmt);
      revenue += paidAmt;
      debt += d;
      if (a.status === 'completed') completed += 1;

      const pid = a.patient || 0;
      if (!perPatient[pid]) {
        const foundP = patients.find((p) => p.id === pid);
        perPatient[pid] = {
          name: a.patient_name || foundP?.full_name || `Bemor #${pid}`,
          phone: foundP?.phone || '+998 90 000 00 00',
          visits: 0,
          paid: 0,
          debt: 0,
          lastDate: a.start_time ? a.start_time.split('T')[0] : '2026-09-15'
        };
      }
      perPatient[pid].visits += 1;
      perPatient[pid].paid += paidAmt;
      perPatient[pid].debt += d;
      if (a.start_time && a.start_time.split('T')[0] > perPatient[pid].lastDate) {
        perPatient[pid].lastDate = a.start_time.split('T')[0];
      }
    });

    if (revenue === 0) {
      revenue = 24800000; // Baseline realistic demonstration figure
      debt = 1400000;
      completed = 18;
    }

    const doctorRate = employee?.commission_rate || 35;
    const doctorEarned = Math.round(revenue * (doctorRate / 100));
    const clinicEarned = revenue - doctorEarned;

    const patientList = Object.entries(perPatient)
      .map(([pid, v]) => ({ id: Number(pid), ...v }))
      .sort((a, b) => b.paid - a.paid);

    return {
      revenue,
      debt,
      completed,
      doctorEarned,
      clinicEarned,
      total: appointments.length || 22,
      patientList
    };
  }, [appointments, patients, employee]);

  // Derived Unique Assigned Chairs across schedule intervals and profile
  const assignedChairs = useMemo(() => {
    if (!employee) return [];
    const set = new Set<string>();
    if (employee.assigned_chairs && Array.isArray(employee.assigned_chairs)) {
      employee.assigned_chairs.forEach((c) => {
        if (c && typeof c === 'string' && c.trim()) set.add(c.trim());
      });
    }
    if (employee.schedule_details && Array.isArray(employee.schedule_details)) {
      employee.schedule_details.forEach((s) => {
        const isWork = Boolean(s.is_workday ?? s.enabled ?? (s.intervals && s.intervals.length > 0));
        if (isWork && s.intervals && Array.isArray(s.intervals)) {
          s.intervals.forEach((inv) => {
            if (inv.chair && inv.chair.trim()) set.add(inv.chair.trim());
          });
        }
      });
    }
    if (employee.chair && employee.chair.trim()) {
      set.add(employee.chair.trim());
    }
    return Array.from(set);
  }, [employee]);

  if (loading && !employee) {
    return (
      <div className="p-12 text-center text-slate-400">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs font-bold uppercase tracking-wider">{tr('staffd.loading')}</p>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-8 text-sm text-slate-400">
        <Link href="/staff" className="text-blue-600 hover:underline">← {tr('staffdict.back')}</Link>
        <p className="mt-4 font-bold text-slate-600">Xodim topilmadi (ID: {empId})</p>
      </div>
    );
  }

  const initials = (employee.full_name || employee.name || 'D')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const color = employee.color || '#3B82F6';

  // Open Edit Profile Modal (Director or doctor self-edit)
  const handleOpenEdit = () => {
    if (!canEdit) return;
    setIsFullModalOpen(true);
  };

  const handleSaveFullModal = async (updatedData: Partial<Employee>) => {
    if (!employee) return;
    const updated = await clinicApi.updateEmployee(employee.id, updatedData);
    if (updated) {
      setEmployee(updated);
      await loadData();
      await refreshBranches();
    }
    setIsFullModalOpen(false);
  };

  const handleDeleteFullModal = async (id: number) => {
    await clinicApi.deleteEmployee(id);
    setIsFullModalOpen(false);
    if (typeof window !== 'undefined') window.location.href = '/staff';
  };

  // Handle Assigned Naryad Modal Save
  const handleSaveAssign = async () => {
    if (!assignForm.naryad_id) return;
    const item = catalog.find((c) => c.id === assignForm.naryad_id);
    if (!item) return;

    const isCustom = assignForm.price_type === 'custom';
    const effectivePrice = isCustom ? Number(assignForm.custom_price) : item.base_price;
    const effectivePercent = isCustom ? Number(assignForm.commission_percent) : (item.default_percent || 30);

    try {
      if (editingAssignment) {
        const updated = await clinicApi.updateDoctorNaryad(editingAssignment.id, {
          custom_price: effectivePrice,
          commission_percent: effectivePercent,
          is_custom_price: isCustom,
          notes: assignForm.notes
        });
        if (updated) {
          setAssignments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        }
      } else {
        const created = await clinicApi.assignDoctorNaryad({
          doctor_id: employee.id,
          naryad_id: item.id,
          name: item.name,
          category: item.category,
          custom_price: effectivePrice,
          commission_percent: effectivePercent,
          is_custom_price: isCustom,
          notes: assignForm.notes
        });
        if (created) {
          setAssignments((prev) => [...prev.filter((a) => a.id !== created.id), created]);
        }
      }
      setIsAssignModalOpen(false);
    } catch {
      // Server saqlamadi — modalni ochiq qoldiramiz, soxta muvaffaqiyat ko'rsatmaymiz.
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('dentos-save-state', { detail: { error: 'Narx saqlanmadi (server xatosi).' } }));
    }
  };

  // Handle Delete Assigned Naryad
  const handleDeleteAssignment = async (id: string) => {
    if (confirm(tr('staffdict.confirmDelete'))) {
      const prevAssignments = assignments;
      setAssignments((prev) => prev.filter((a) => a.id !== id));
      try {
        await clinicApi.removeDoctorNaryad(id);
      } catch {
        setAssignments(prevAssignments);
      }
    }
  };

  // Add Certificate
  const handleSaveCertificate = async () => {
    if (!certForm.title.trim() || !certForm.issuer.trim()) return;
    const newCert = await clinicApi.addDoctorCertificate(employee.id, {
      title: certForm.title.trim(),
      issuer: certForm.issuer.trim(),
      year: certForm.year.trim(),
      file_url: certForm.file_url.trim(),
      preview: certForm.file_url.trim()
    });
    setEmployee((prev) => prev ? { ...prev, certificates: [...(prev.certificates || []), newCert] } : null);
    setIsCertModalOpen(false);
    setCertForm({ title: '', issuer: '', year: new Date().getFullYear().toString(), file_url: '' });
  };

  // Delete Certificate
  const handleDeleteCertificate = async (certId: string) => {
    if (confirm(tr('staffdict.confirmDelete'))) {
      await clinicApi.deleteDoctorCertificate(employee.id, certId);
      setEmployee((prev) => prev ? { ...prev, certificates: (prev.certificates || []).filter((c) => c.id !== certId) } : null);
    }
  };

  // Add Diploma
  const handleSaveDiploma = async () => {
    if (!dipForm.degree.trim() || !dipForm.institution.trim()) return;
    const newDip = await clinicApi.addDoctorDiploma(employee.id, {
      degree: dipForm.degree.trim(),
      institution: dipForm.institution.trim(),
      specialty: dipForm.specialty.trim(),
      year: dipForm.year.trim(),
      file_url: dipForm.file_url.trim()
    });
    setEmployee((prev) => prev ? { ...prev, diplomas: [...(prev.diplomas || []), newDip] } : null);
    setIsDipModalOpen(false);
    setDipForm({ degree: 'Врач-стоматолог общей практики', institution: 'Ташкентский Государственный Стоматологический Институт', specialty: 'Стоматология', year: '2019', file_url: '' });
  };

  // Delete Diploma
  const handleDeleteDiploma = async (dipId: string) => {
    if (confirm(tr('staffdict.confirmDelete'))) {
      await clinicApi.deleteDoctorDiploma(employee.id, dipId);
      setEmployee((prev) => prev ? { ...prev, diplomas: (prev.diplomas || []).filter((d) => d.id !== dipId) } : null);
    }
  };

  // Tabs matching patient profile style
  // Rolga qarab qaysi bo'limlar ko'rinadi:
  //  - doctor: hammasi (qabul, bemor, naryad narxi, sertifikat, kreslo/jadval, moliya)
  //  - director: faqat kuzatuv (qabul/bemor) + sertifikat (asosiy) + moliya — kreslo/naryad narxi yo'q
  //  - deputy_director (boshqaruvchi): kuzatuv (qabul/bemor) + moliya — sertifikat/kreslo/naryad narxi yo'q
  //  - admin / kassir / hamshira: faqat Asosiy + Moliya (oylik)
  const ROLE_TABS: Record<string, string[]> = {
    doctor: ['Asosiy', 'Qabullar', 'Bemorlari', 'Naryadlar', 'Sertifikatlar', 'Kreslo', 'Moliya'],
    director: ['Asosiy', 'Qabullar', 'Bemorlari', 'Sertifikatlar', 'Moliya'],
    deputy_director: ['Asosiy', 'Qabullar', 'Bemorlari', 'Moliya'],
    admin: ['Asosiy', 'Moliya'],
    kassa: ['Asosiy', 'Moliya'],
    nurse: ['Asosiy', 'Moliya']
  };
  const allowedTabIds = ROLE_TABS[employee.role] || ['Asosiy', 'Moliya'];
  const tabDefinitions = [
    { id: 'Asosiy', labelKey: 'sid_tab_general', icon: Users },
    { id: 'Qabullar', labelKey: 'sid_tab_appointments', count: appointments.length, icon: Calendar },
    { id: 'Bemorlari', labelKey: 'sid_tab_patients', count: stats.patientList.length, icon: Stethoscope },
    { id: 'Naryadlar', labelKey: 'sid_tab_naryads', count: assignments.length, icon: FileCheck2 },
    { id: 'Sertifikatlar', labelKey: 'sid_tab_certs', count: (employee.certificates?.length || 0) + (employee.diplomas?.length || 0), icon: Award },
    { id: 'Kreslo', labelKey: 'sid_tab_schedule', icon: Armchair },
    { id: 'Moliya', labelKey: 'sid_tab_finance', icon: Wallet }
  ].filter((t) => allowedTabIds.includes(t.id));

  // Filtered Appointments
  const filteredAppointments = appointments.filter((a) => {
    if (aptStatusFilter === 'completed' && a.status !== 'completed') return false;
    if (aptStatusFilter === 'pending' && a.status !== 'confirmed' && a.status !== 'unconfirmed' && a.status !== 'new') return false;
    if (aptStatusFilter === 'debt' && a.status !== 'debt') return false;
    if (aptStatusFilter === 'cancelled' && a.status !== 'cancelled' && a.status !== 'no_show') return false;
    if (aptSearch) {
      const q = aptSearch.toLowerCase();
      const pName = (a.patient_name || '').toLowerCase();
      const proc = (a.procedure || a.treatment_notes || '').toLowerCase();
      if (!pName.includes(q) && !proc.includes(q)) return false;
    }
    return true;
  });

  // Filtered Patients
  const filteredPatients = stats.patientList.filter((p) => {
    if (!patSearch) return true;
    const q = patSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.phone.includes(q);
  });

  return (
    <div className="space-y-6 pb-20 text-slate-900 dark:text-white max-w-[1440px] mx-auto animate-in fade-in duration-200">
      {/* 1. TOP BAR: Back Link & Breadcrumbs */}
      <div className="flex items-center justify-between">
        <Link
          href="/staff"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition bg-white dark:bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" /> {tr('staffdict.back')}
        </Link>
        <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold">
          <span>{tr('staffd.staff')}</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-slate-700 dark:text-slate-200 font-bold">{employee.full_name || employee.name}</span>
        </div>
      </div>

      {/* 2. DOCTOR HERO HEADER (Matching /patients/[id] rich style) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 shadow-xs relative overflow-hidden">
        {/* Subtle decorative background gradient */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-blue-500/10 via-indigo-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start sm:items-center gap-5 sm:gap-6">
            {employee.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={employee.avatar}
                alt={employee.full_name}
                className="w-22 h-22 sm:w-24 sm:h-24 rounded-2xl sm:rounded-3xl object-cover shadow-md ring-4 ring-slate-100 dark:ring-slate-800 shrink-0"
              />
            ) : (
              <div
                className="w-22 h-22 sm:w-24 sm:h-24 rounded-2xl sm:rounded-3xl flex items-center justify-center text-white font-black text-3xl shadow-lg ring-4 ring-slate-100 dark:ring-slate-800 shrink-0"
                style={{ backgroundColor: color }}
              >
                {initials}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{employee.full_name || employee.name}</h1>
                <span
                  className="px-3 py-1 rounded-full text-xs font-black text-white shadow-xs"
                  style={{ backgroundColor: color }}
                >
                  {employee.role === 'doctor' ? 'Shifokor-Stomatolog' : employee.role.toUpperCase()}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-sky-300 border border-blue-200 dark:border-blue-800 shadow-2xs inline-flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
                  <span>
                    {employee.branch_name || branches.find((b) => b.id === employee.branch)?.name || tk('sid_all_branches')}
                  </span>
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 ${
                    employee.is_active ?? true
                      ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${employee.is_active ?? true ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  {employee.is_active ?? true ? tr('staffdict.active') : tr('staffdict.inactive')}
                </span>
              </div>

              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 font-bold flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-blue-600" />
                {employee.specialty || 'Stomatolog-Terapevt / Implantolog'}
              </p>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs text-slate-500 dark:text-slate-400 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-blue-600" /> {employee.phone || '+998 90 000 00 00'}
                </span>
                {employee.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-indigo-600" /> {employee.email}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Armchair className="w-3.5 h-3.5 text-amber-600" />
                  {employee.assigned_chairs && employee.assigned_chairs.length > 0
                    ? employee.assigned_chairs.join(', ')
                    : employee.chair || 'Кресло 1'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  {employee.schedule || 'Dush-Juma: 09:00 - 18:00'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  Staj: {employee.experience_years ?? 8} yil
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-2 lg:pt-0">
            <button
              onClick={() => window.print()}
              className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-200 transition shadow-2xs"
              title={tr('staffd.titlePrint')}
            >
              <Printer className="w-4 h-4" />
            </button>
            {canEdit && (
              <button
                onClick={handleOpenEdit}
                className="flex items-center space-x-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black transition-all shadow-md shadow-blue-500/20 active:scale-95"
              >
                <Edit2 className="w-4 h-4" />
                <span>{tr('staffdict.editProfile')}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. NAVIGATION TABS (Identos to /patients/[id] Tab Bar) */}
      <div className="flex items-center space-x-2 sm:space-x-4 overflow-x-auto border-b border-slate-200 dark:border-slate-800 pb-1 scrollbar-none">
        {tabDefinitions.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          const label = tk(tab.labelKey);
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all rounded-xl ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{label}</span>
              {tab.count !== undefined && (
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 4. DYNAMIC TAB CONTENT */}

      {/* TAB 1: ASOSIY (Dossier, Contact Details, Quick KPIs, Highlights) */}
      {activeTab === 'Asosiy' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* 4 Key Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center mb-3">
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-black tracking-tight">{stats.revenue.toLocaleString()} {som}</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">{tr('staffdict.revenue')}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mb-3">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-black tracking-tight text-emerald-600">{stats.doctorEarned.toLocaleString()} {som}</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">{tr('staffdict.doctorShare')} ({employee.commission_rate || 35}%)</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center mb-3">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-black tracking-tight">{stats.clinicEarned.toLocaleString()} {som}</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">{tr('staffdict.clinicShare')}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center mb-3">
                <CalendarCheck className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-black tracking-tight">{stats.total} ta</p>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">{stats.completed} ta muvaffaqiyatli qabul</p>
              </div>
            </div>
          </div>

          {/* Dossier Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Col: Complete Employee Dossier Card */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 shadow-xs space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-black tracking-tight">{tr('staffd.dossier')}</h2>
                </div>
                {canEdit && (
                  <button
                    onClick={handleOpenEdit}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-950/50 px-3 py-1.5 rounded-xl transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Tahrirlash
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr('staffd.fullName')}</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100 mt-1">{employee.full_name || employee.name}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr('staffd.assignedBranch')}</p>
                  <p className="font-bold text-blue-600 dark:text-sky-400 mt-1 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4" />
                    {employee.branch_name || branches.find((b) => b.id === employee.branch)?.name || tk('sid_all_branches')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr('staffd.specialty')}</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100 mt-1">{employee.specialty || 'Stomatolog-Terapevt'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr('staffd.phoneNumber')}</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100 mt-1">{employee.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr('staffd.email')}</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100 mt-1">{employee.email || 'shifokor@32desk.uz'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr('staffd.birthDate')}</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100 mt-1">{employee.birth_date || '1989-05-14'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr('staffd.experience')}</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100 mt-1">{employee.experience_years ?? 8} yil amaliy tajriba</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr('staffd.homeAddress')}</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100 mt-1">{employee.address || 'Toshkent shahar, Yunusobod tumani'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr('staffd.assignedChairsRoom')}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(employee.assigned_chairs && employee.assigned_chairs.length > 0
                      ? employee.assigned_chairs
                      : [employee.chair || 'Кресло 1 (Терапия)']
                    ).map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900 text-xs font-bold"
                      >
                        <Armchair className="w-3.5 h-3.5 text-amber-600" /> {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr('staffd.schedule')}</p>
                  <p className="font-bold text-slate-800 dark:text-slate-100 mt-1 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    {employee.schedule || 'Dushanba - Juma: 09:00 - 18:00 (Shanba: 09:00 - 14:00)'}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr('staffd.shortBio')}</p>
                  <p className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                    {employee.bio || 'Klinikada stomatologiya va zamonaviy ortopediya sohasida faoliyat yuritadi. Murakkab protezlash, mikroskop ostida kanallarni davolash va estetik restavratsiya bo‘yicha ko‘p yillik tajribaga ega.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Right Col: Quick Widgets (Recent certificates & quick stats) */}
            <div className="space-y-6">
              {/* Financial Rate Card */}
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-3xl p-6 shadow-md space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-bold tracking-wider opacity-80">{tr('staffd.salaryRate')}</span>
                  <Wallet className="w-5 h-5 opacity-80" />
                </div>
                <div>
                  <p className="text-2xl font-black">{Number(employee.salary_rate || 0).toLocaleString()} {som}</p>
                  <p className="text-xs opacity-80 mt-0.5">{tr('staffd.monthlyGuaranteedRate')}</p>
                </div>
                <div className="pt-3 border-t border-white/20 flex items-center justify-between text-xs">
                  <span>Muolajadan shifokor ulushi:</span>
                  <span className="font-black text-sm">{employee.commission_rate || 35}%</span>
                </div>
              </div>

              {/* Certificates Quick Card */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-sm flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500" />
                    Sertifikatlar ({employee.certificates?.length || 0})
                  </h3>
                  <button
                    onClick={() => setActiveTab('Sertifikatlar')}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    Barchasi →
                  </button>
                </div>

                {employee.certificates && employee.certificates.length > 0 ? (
                  <div className="space-y-2.5">
                    {employee.certificates.slice(0, 3).map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
                      >
                        <div className="truncate mr-2">
                          <p className="text-xs font-bold truncate">{c.title}</p>
                          <p className="text-[11px] text-slate-400">{c.issuer} ({c.year})</p>
                        </div>
                        <Award className="w-4 h-4 text-amber-500 shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-center text-xs text-slate-400">
                    Sertifikatlar kiritilmagan.
                    <button
                      onClick={() => {
                        setActiveTab('Sertifikatlar');
                        setIsCertModalOpen(true);
                      }}
                      className="block mx-auto mt-2 text-blue-600 font-bold hover:underline"
                    >
                      + Qo‘shish
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: QABULLAR (Appointments Table & Filter) */}
      {activeTab === 'Qabullar' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 shadow-xs space-y-5 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
            <div>
              <h2 className="text-lg font-black">Shifokor qabullari tarixi ({filteredAppointments.length})</h2>
              <p className="text-xs text-slate-400 mt-0.5">{tr('staffd.doctorVisits')}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={tr('staffd.phPatientProcSearch')}
                  value={aptSearch}
                  onChange={(e) => setAptSearch(e.target.value)}
                  className="pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20 w-60"
                />
              </div>

              <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setAptStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition ${aptStatusFilter === 'all' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs' : 'text-slate-500'}`}
                >
                  Barchasi
                </button>
                <button
                  onClick={() => setAptStatusFilter('completed')}
                  className={`px-3 py-1.5 rounded-lg transition ${aptStatusFilter === 'completed' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-2xs' : 'text-slate-500'}`}
                >
                  Yakunlangan
                </button>
                <button
                  onClick={() => setAptStatusFilter('pending')}
                  className={`px-3 py-1.5 rounded-lg transition ${aptStatusFilter === 'pending' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-2xs' : 'text-slate-500'}`}
                >
                  Kutilmoqda
                </button>
                <button
                  onClick={() => setAptStatusFilter('debt')}
                  className={`px-3 py-1.5 rounded-lg transition ${aptStatusFilter === 'debt' ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-2xs' : 'text-slate-500'}`}
                >
                  Qarzdor
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-3">{tr('staffd.dateTime')}</th>
                  <th className="py-3 px-3">{tr('staffd.patientName')}</th>
                  <th className="py-3 px-3">{tr('staffd.procedureNote')}</th>
                  <th className="py-3 px-3 text-right">{tr('staffd.amount')}</th>
                  <th className="py-3 px-3 text-right">{tr('staffd.paid')}</th>
                  <th className="py-3 px-3 text-center">{tr('staffd.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {filteredAppointments.length > 0 ? (
                  filteredAppointments.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-3 font-semibold text-slate-600 dark:text-slate-300">
                        {a.start_time ? a.start_time.replace('T', ' ').slice(0, 16) : 'Bugun 10:00'}
                      </td>
                      <td className="py-3.5 px-3 font-bold text-slate-900 dark:text-white">
                        {a.patient ? (
                          <Link href={`/patients/${a.patient}`} className="hover:text-blue-600 hover:underline">
                            {a.patient_name || `Bemor #${a.patient}`}
                          </Link>
                        ) : (
                          a.patient_name || 'Bemor'
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-slate-600 dark:text-slate-300">
                        {a.procedure || a.treatment_notes || 'Stomatologik ko‘rik va konsultatsiya'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold">
                        {Number(a.price || 450000).toLocaleString()} {som}
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold text-emerald-600">
                        {Number(a.paid_amount || a.price || 450000).toLocaleString()} {som}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black ${
                            a.status === 'completed'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : a.status === 'debt'
                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                              : a.status === 'cancelled'
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                              : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                          }`}
                        >
                          {a.status === 'completed'
                            ? 'Yakunlangan'
                            : a.status === 'debt'
                            ? 'Qarz'
                            : a.status === 'cancelled'
                            ? 'Bekor qilingan'
                            : 'Kutilmoqda'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Qabullar topilmadi.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: BEMORLARI (Patients treated by this doctor) */}
      {activeTab === 'Bemorlari' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 shadow-xs space-y-5 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
            <div>
              <h2 className="text-lg font-black">Shifokorning bemorlari ({filteredPatients.length})</h2>
              <p className="text-xs text-slate-400 mt-0.5">{tr('staffd.treatedPatientsList')}</p>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={tr('staffd.phPatientSearch')}
                value={patSearch}
                onChange={(e) => setPatSearch(e.target.value)}
                className="pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500/20 w-64"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-3">{tr('staffd.patientName')}</th>
                  <th className="py-3 px-3">{tr('staffd.phone')}</th>
                  <th className="py-3 px-3 text-center">{tr('staffd.visitsCount')}</th>
                  <th className="py-3 px-3 text-right">{tr('staffd.paidAmount')}</th>
                  <th className="py-3 px-3 text-right">{tr('staffd.debt')}</th>
                  <th className="py-3 px-3">{tr('staffd.lastVisit')}</th>
                  <th className="py-3 px-3 text-center">{tr('staffd.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {filteredPatients.length > 0 ? (
                  filteredPatients.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-3 font-bold text-slate-900 dark:text-white">
                        <Link href={`/patients/${p.id}`} className="hover:text-blue-600 hover:underline">
                          {p.name}
                        </Link>
                      </td>
                      <td className="py-3.5 px-3 text-slate-500">{p.phone}</td>
                      <td className="py-3.5 px-3 text-center font-bold">
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800">
                          {p.visits} ta
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold text-emerald-600">
                        {p.paid.toLocaleString()} {som}
                      </td>
                      <td className="py-3.5 px-3 text-right font-bold">
                        {p.debt > 0 ? (
                          <span className="text-rose-600">{p.debt.toLocaleString()} {som}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-slate-500">{p.lastDate}</td>
                      <td className="py-3.5 px-3 text-center">
                        <Link
                          href={`/patients/${p.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-600 font-bold transition"
                        >
                          Kartasi <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Bemorlar ro‘yxati bo‘sh.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: NARYADLAR VA NARXLAR (Assigned Naryads & Custom Pricing) */}
      {activeTab === 'Naryadlar' && (() => {
        const categories = [
          { id: 'all', labelKey: 'sid_cat_all' },
          { id: 'Терапия', labelKey: 'sid_cat_therapy' },
          { id: 'Хирургия', labelKey: 'sid_cat_surgery' },
          { id: 'Implantologiya', labelKey: 'sid_cat_implant' },
          { id: 'Ортопедия', labelKey: 'sid_cat_ortho' },
          { id: 'Ортодонтия', labelKey: 'sid_cat_ortodont' },
          { id: 'Детская стоматология', labelKey: 'sid_cat_pediatric' }
        ];

        const filteredAssignments = assignments.filter((a) => {
          const matchCat = naryadCatFilter === 'all' || a.category.toLowerCase().includes(naryadCatFilter.toLowerCase());
          const matchSearch = !naryadSearch || a.name.toLowerCase().includes(naryadSearch.toLowerCase()) || a.category.toLowerCase().includes(naryadSearch.toLowerCase());
          return matchCat && matchSearch;
        });

        return (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 shadow-xs space-y-6 animate-in fade-in duration-150">
            {/* Header: Title + Batch Preset Loading + Add Button */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-lg font-black text-slate-900 dark:text-white">
                    {tr('staffdict.assignedNaryads')}
                  </h2>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-bold">
                    {assignments.length} ta xizmat
                  </span>
                  <span className="text-xs px-3 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-black border border-emerald-200 dark:border-emerald-800">
                    {tk('sid_uniform_rate').replace('{p}', String(doctorPercent))}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {tk('sid_uniform_rate_desc').replace('{p}', String(doctorPercent))}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Specialty Template Loader */}
                <div className="relative group">
                  <button
                    type="button"
                    className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30 transition shadow-2xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>{tk('sid_load_template')}</span>
                  </button>
                  <div className="absolute right-0 top-full mt-1.5 w-64 p-2 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 hidden group-hover:block z-30 space-y-1">
                    <p className="text-[10px] font-black uppercase text-slate-400 px-2 py-1">{tk('sid_select_specialty')}</p>
                    <button
                      onClick={() => populateBySpecialty('Терапия')}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700 flex items-center justify-between"
                    >
                      <span>🦷 Terapiya (12 ta)</span>
                      <span className="text-[10px] text-blue-600">+ Qo‘shish</span>
                    </button>
                    <button
                      onClick={() => populateBySpecialty('Хирургия')}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700 flex items-center justify-between"
                    >
                      <span>🔪 Xirurgiya (10 ta)</span>
                      <span className="text-[10px] text-blue-600">+ Qo‘shish</span>
                    </button>
                    <button
                      onClick={() => populateBySpecialty('Implantologiya')}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700 flex items-center justify-between"
                    >
                      <span>🔩 Implantologiya (10 ta)</span>
                      <span className="text-[10px] text-blue-600">+ Qo‘shish</span>
                    </button>
                    <button
                      onClick={() => populateBySpecialty('Ортопедия')}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700 flex items-center justify-between"
                    >
                      <span>👑 Ortopediya (16 ta)</span>
                      <span className="text-[10px] text-blue-600">+ Qo‘shish</span>
                    </button>
                    <button
                      onClick={() => populateBySpecialty('Ортодонтия')}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700 flex items-center justify-between"
                    >
                      <span>📐 Ortodontiya (8 ta)</span>
                      <span className="text-[10px] text-blue-600">+ Qo‘shish</span>
                    </button>
                    <button
                      onClick={() => populateBySpecialty('Детская')}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700 flex items-center justify-between"
                    >
                      <span>👶 Bolalar stomatologiyasi</span>
                      <span className="text-[10px] text-blue-600">+ Qo‘shish</span>
                    </button>
                    <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                    <button
                      onClick={() => populateBySpecialty('all')}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-black text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center justify-between"
                    >
                      <span>{tr('staffd.loadAllNaryads')}</span>
                      <span className="text-[10px]">{tr('staffd.allF')}</span>
                    </button>
                  </div>
                </div>

                {/* Add Custom / Single Naryad Button */}
                <button
                  onClick={() => {
                    setEditingAssignment(null);
                    const first = catalog[0];
                    setAssignForm({
                      naryad_id: first ? first.id : '',
                      price_type: 'standard',
                      custom_price: first ? first.base_price : 450000,
                      commission_percent: first ? (first.default_percent || 35) : 35,
                      notes: ''
                    });
                    setIsAssignModalOpen(true);
                  }}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-blue-500/20 active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>{tr('staffdict.assignNaryadBtn')}</span>
                </button>
              </div>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {categories.map((cat) => {
                  const isActive = naryadCatFilter === cat.id;
                  const catCount = cat.id === 'all'
                    ? assignments.length
                    : assignments.filter((a) => a.category.toLowerCase().includes(cat.id.toLowerCase())).length;

                  return (
                    <button
                      key={cat.id}
                      onClick={() => setNaryadCatFilter(cat.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span>{tk(cat.labelKey)}</span>
                      <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'}`}>
                        {catCount}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search input */}
              <div className="relative min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={naryadSearch}
                  onChange={(e) => setNaryadSearch(e.target.value)}
                  placeholder={tk('sid_search_naryad')}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Table with Fast Inline Price Editing */}
            <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="py-3 px-3.5">{tr('staffdict.naryadName')}</th>
                    <th className="py-3 px-3">{tr('staffdict.category')}</th>
                    <th className="py-3 px-3 text-right">{tk('sid_col_price')}</th>
                    <th className="py-3 px-3 text-right">{tk('sid_col_doctor_share').replace('{p}', String(doctorPercent))}</th>
                    <th className="py-3 px-3 text-right">{tr('staffdict.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {filteredAssignments.length > 0 ? (
                    filteredAssignments.map((a) => {
                      const price = a.custom_price || 0;
                      const percent = a.commission_percent || 0;
                      const net = Math.round(price * (percent / 100));

                      return (
                        <tr key={a.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                          <td className="py-3.5 px-3.5 font-bold text-slate-900 dark:text-white max-w-sm">
                            <p>{a.name}</p>
                            {a.notes && <p className="text-[11px] font-normal text-slate-400 mt-0.5">{a.notes}</p>}
                          </td>
                          <td className="py-3.5 px-3 text-slate-500">
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800">
                              {a.category}
                            </span>
                          </td>
                          {/* Fast Inline Price Input */}
                          <td className="py-3.5 px-3 text-right">
                            <div className="inline-flex items-center justify-end space-x-1.5">
                              <input
                                type="number"
                                defaultValue={price}
                                key={`price_${a.id}_${price}`}
                                onBlur={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  if (val !== price) {
                                    handleInlinePriceChange(a.id, val);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                                className="w-32 text-right font-black font-mono text-xs px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-2xs"
                              />
                              <span className="text-[10px] text-slate-400 font-bold">UZS</span>
                            </div>
                          </td>
                          {/* Doctor Net calculated using uniform doctorPercent */}
                          <td className="py-3.5 px-3 text-right font-black text-emerald-600 dark:text-emerald-400 font-mono">
                            +{Math.round(price * (doctorPercent / 100)).toLocaleString()} {som}
                          </td>
                          <td className="py-3.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingAssignment(a);
                                  setAssignForm({
                                    naryad_id: a.naryad_id,
                                    price_type: a.is_custom_price ? 'custom' : 'standard',
                                    custom_price: a.custom_price,
                                    commission_percent: a.commission_percent,
                                    notes: a.notes || ''
                                  });
                                  setIsAssignModalOpen(true);
                                }}
                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-blue-600 rounded-lg transition"
                                title={tr('common.edit')}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteAssignment(a.id)}
                                className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 rounded-lg transition"
                                title={tr('common.delete')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-12 text-center space-y-3">
                        <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-500">
                          <Layers className="w-6 h-6" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                          Ushbu filtr bo‘yicha naryadlar topilmadi
                        </h4>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto">
                          Shifokorga biriktirilgan stomatologik xizmatlar ro‘yxati bo‘sh. Yuqoridagi shablon tugmasi orqali yo‘nalish bo‘yicha barcha naryadlarni avtomatik yuklang.
                        </p>
                        <div className="pt-1">
                          <button
                            onClick={() => populateBySpecialty(naryadCatFilter === 'all' ? undefined : naryadCatFilter)}
                            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>{tr('staffd.autoLoadDefaultNaryads')}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* TAB 5: SERTIFIKAT VA DIPLOMLLAR (Upload & View) */}
      {activeTab === 'Sertifikatlar' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Diplomas Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black">{tr('staffd.higherEduDiplomas')}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{tr('staffd.doctorDiplomas')}</p>
                </div>
              </div>
              <button
                onClick={() => setIsDipModalOpen(true)}
                className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-indigo-500/20 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>{tr('staffdict.addDipBtn')}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {employee.diplomas && employee.diplomas.length > 0 ? (
                employee.diplomas.map((d) => (
                  <div
                    key={d.id}
                    className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between space-y-4 hover:shadow-sm transition"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                          {d.year} yil
                        </span>
                        <div className="flex items-center gap-1">
                          {d.file_url && (
                            <button
                              onClick={() => setPreviewDoc({ title: d.degree, url: d.file_url, type: 'Diplom' })}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 rounded-lg"
                              title={tr('staffd.titleView')}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteDiploma(d.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                            title={tr('common.delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white mt-2">{d.degree}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">{d.institution}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 font-bold mt-2">
                        Mutaxassislik: <span className="text-indigo-600">{d.specialty}</span>
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="md:col-span-2 p-8 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Diplomlar hali biriktirilmagan.
                </div>
              )}
            </div>
          </div>

          {/* Certificates Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black">{tr('staffd.certsIntl')}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{tr('staffd.masterclasses')}</p>
                </div>
              </div>
              <button
                onClick={() => setIsCertModalOpen(true)}
                className="flex items-center space-x-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-amber-500/20 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>{tr('staffdict.addCertBtn')}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {employee.certificates && employee.certificates.length > 0 ? (
                employee.certificates.map((c) => (
                  <div
                    key={c.id}
                    className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col justify-between space-y-4 hover:shadow-sm transition"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                          {c.year} yil
                        </span>
                        <div className="flex items-center gap-1">
                          {c.file_url && (
                            <button
                              onClick={() => setPreviewDoc({ title: c.title, url: c.file_url, type: 'Sertifikat' })}
                              className="p-1.5 text-slate-500 hover:text-amber-600 rounded-lg"
                              title={tr('staffd.titleView')}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteCertificate(c.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                            title={tr('common.delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white mt-2">{c.title}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">{c.issuer}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="md:col-span-3 p-8 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  <Award className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Sertifikatlar hali biriktirilmagan.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: ISH JADVALI VA KRESLO (Chairs & Schedule Management) */}
      {activeTab === 'Kreslo' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Col: Assigned Chairs */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
                    <Armchair className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black">{tr('staffd.assignedDentalChairs')}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{tr('staffd.doctorRooms')}</p>
                  </div>
                </div>
                {canEdit && (
                  <button
                    onClick={handleOpenEdit}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    O‘zgartirish
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {assignedChairs.length > 0 ? (
                  assignedChairs.map((chairName, idx) => (
                    <div
                      key={chairName}
                      className="p-5 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/70 dark:from-slate-800/70 dark:to-slate-800/30 border border-slate-200 dark:border-slate-700 flex items-start justify-between"
                    >
                      <div className="space-y-1.5">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                          {idx === 0 ? 'Asosiy kreslo' : 'Qo‘shimcha'}
                        </span>
                        <h3 className="font-black text-slate-900 dark:text-white text-base mt-1">{chairName}</h3>
                        <p className="text-xs text-slate-400 font-medium">{tr('staffd.statusActive')}</p>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                        <Armchair className="w-5 h-5" />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="sm:col-span-2 p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
                    <p className="text-xs text-slate-400 font-medium">{tr('staffd.noChairFound')}</p>
                    {canEdit && (
                      <button
                        onClick={handleOpenEdit}
                        className="text-xs font-bold text-blue-600 hover:underline"
                      >
                        + Kreslo biriktirish
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Col: Weekly Schedule Table */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  Haftalik ish vaqtlari va kreslolar
                </h3>
                {canEdit && (
                  <button onClick={handleOpenEdit} className="text-xs font-bold text-blue-600 hover:underline">
                    Sozlash
                  </button>
                )}
              </div>
              <div className="space-y-2 text-xs">
                {employee.schedule_details && employee.schedule_details.length > 0 ? (
                  employee.schedule_details.map((s) => {
                    const dayLabels: Record<string, string> = {
                      monday: 'Dushanba',
                      tuesday: 'Seshanba',
                      wednesday: 'Chorshanba',
                      thursday: 'Payshanba',
                      friday: 'Juma',
                      saturday: 'Shanba',
                      sunday: 'Yakshanba'
                    };
                    const isWork = Boolean(
                      s.is_workday ?? s.enabled ?? (s.intervals && s.intervals.length > 0)
                    );
                    return (
                      <div
                        key={s.day}
                        className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {dayLabels[s.day] || s.day}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isWork
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                            }`}
                          >
                            {isWork ? 'Ish kuni' : 'Dam olish'}
                          </span>
                        </div>
                        {isWork && s.intervals && s.intervals.length > 0 ? (
                          <div className="space-y-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                            {s.intervals.map((inv, idx) => (
                              <div key={idx} className="flex items-center justify-between font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                <span>{inv.start_hour}:{inv.start_min} - {inv.end_hour}:{inv.end_min}</span>
                                <span className="inline-flex items-center gap-1 font-sans text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-900">
                                  💺 {inv.chair || 'Kreslo'}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  [
                    { day: 'Dushanba', hours: '09:00 - 18:00', active: true },
                    { day: 'Seshanba', hours: '09:00 - 18:00', active: true },
                    { day: 'Chorshanba', hours: '09:00 - 18:00', active: true },
                    { day: 'Payshanba', hours: '09:00 - 18:00', active: true },
                    { day: 'Juma', hours: '09:00 - 18:00', active: true },
                    { day: 'Shanba', hours: '09:00 - 14:00', active: true },
                    { day: 'Yakshanba', hours: 'Dam olish kuni', active: false }
                  ].map((s) => (
                    <div
                      key={s.day}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800"
                    >
                      <span className="font-bold text-slate-700 dark:text-slate-300">{s.day}</span>
                      <span
                        className={`font-mono text-[11px] font-bold ${
                          s.active ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      >
                        {s.hours}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: MOLIYA VA MAOSH (Finance & Commission Analytics) */}
      {activeTab === 'Moliya' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr('staffd.monthlySalary')}</span>
              <p className="text-2xl font-black">{Number(employee.salary_rate || 0).toLocaleString()} {som}</p>
              <p className="text-xs text-slate-500">{tr('staffd.guaranteedMonthly')}</p>
            </div>
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr('staffd.doctorCommission')}</span>
              <p className="text-2xl font-black text-emerald-600">{stats.doctorEarned.toLocaleString()} {som}</p>
              <p className="text-xs text-slate-500">Muolajalardan hisoblangan ulush ({employee.commission_rate || 35}%)</p>
            </div>
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr('staffd.clinicNetIncome')}</span>
              <p className="text-2xl font-black text-purple-600">{stats.clinicEarned.toLocaleString()} {som}</p>
              <p className="text-xs text-slate-500">{tr('staffd.clinicRemainder')}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-black text-base">{tr('staffd.salaryHistory')}</h3>
              <select
                value={salaryPeriod}
                onChange={(e) => setSalaryPeriod(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="all">{tk('all')}</option>
                {payrollPeriods.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider">
                    <th className="py-3 px-3">{tr('staffd.period')}</th>
                    <th className="py-3 px-3">{tr('staffd.paymentType')}</th>
                    <th className="py-3 px-3 text-right">{tr('staffd.amount')}</th>
                    <th className="py-3 px-3 text-center">{tr('staffd.status')}</th>
                    <th className="py-3 px-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {payrollPeriods
                    .filter((p) => salaryPeriod === 'all' || p.key === salaryPeriod)
                    .map((p) => {
                      const salary = Number(employee.salary_rate) || 0;
                      const paid = !!payrollPaid[p.key];
                      return (
                        <tr key={p.key} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="py-3.5 px-3 font-bold text-slate-900 dark:text-white capitalize">{p.label}</td>
                          <td className="py-3.5 px-3 text-slate-600 dark:text-slate-300">{tr('staffd.monthlySalary')}</td>
                          <td className="py-3.5 px-3 text-right font-black text-emerald-600">{salary.toLocaleString()} {som}</td>
                          <td className="py-3.5 px-3 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${paid
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'}`}>
                              {paid ? tk('emp_paid') : tk('emp_unpaid')}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => togglePayroll(p.key)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition ${paid
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                            >
                              {paid ? tk('emp_mark_unpaid') : tk('emp_mark_paid')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: FULL EMPLOYEE PROFILE (matching Screenshots 1, 2, 3) */}
      {isFullModalOpen && (
        <EmployeeFullModal
          isOpen={isFullModalOpen}
          onClose={() => setIsFullModalOpen(false)}
          onSave={handleSaveFullModal}
          onDelete={handleDeleteFullModal}
          employeeToEdit={employee}
          workplaces={workplaces}
          specialties={specialties}
          branches={branches}
        />
      )}

      {/* 6. MODAL: ASSIGN NARYAD & CUSTOM PRICE */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 className="text-lg font-black">
                {editingAssignment ? 'Naryad narxini o‘zgartirish' : 'Yangi naryad biriktirish'}
              </h3>
              <button onClick={() => setIsAssignModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-slate-500 font-bold uppercase text-[11px]">{tr('staffdict.naryadName')} *</label>
                <select
                  value={assignForm.naryad_id}
                  disabled={!!editingAssignment}
                  onChange={(e) => {
                    const selId = e.target.value;
                    const item = catalog.find((c) => c.id === selId);
                    setAssignForm((prev) => ({
                      ...prev,
                      naryad_id: selId,
                      custom_price: item ? item.base_price : prev.custom_price,
                      commission_percent: item ? (item.default_percent || 35) : prev.commission_percent
                    }));
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                >
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.category}] {c.name} — {c.base_price.toLocaleString()} {som}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold uppercase text-[11px]">Shaxsiy narx (UZS) *</label>
                <input
                  type="number"
                  step="10000"
                  value={assignForm.custom_price}
                  onChange={(e) => setAssignForm((prev) => ({ ...prev, custom_price: Number(e.target.value) }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-bold">Shifokor yagona foizi:</span>
                <span className="font-black text-blue-600 dark:text-sky-400 font-mono text-sm">{doctorPercent}%</span>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950/50 rounded-xl text-blue-900 dark:text-blue-200 flex items-center justify-between">
                <span>1 muolajadan sof shifokor tushumi:</span>
                <span className="font-black text-sm text-blue-600 dark:text-blue-400">
                  {Math.round(assignForm.custom_price * (assignForm.commission_percent / 100)).toLocaleString()} {som}
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold uppercase text-[11px]">{tr('staffd.extraNote')}</label>
                <input
                  type="text"
                  placeholder={tr('staffd.phComplexOnly')}
                  value={assignForm.notes}
                  onChange={(e) => setAssignForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
              >
                {tr('staffdict.cancel')}
              </button>
              <button
                onClick={handleSaveAssign}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md"
              >
                {tr('staffdict.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL: ADD CERTIFICATE */}
      {isCertModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 className="text-lg font-black">{tr('staffd.addCertificate')}</h3>
              <button onClick={() => setIsCertModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-slate-500 font-bold uppercase text-[11px]">{tr('staffdict.certTitle')} *</label>
                <input
                  type="text"
                  placeholder={tr('staffd.phCertTitle')}
                  value={certForm.title}
                  onChange={(e) => setCertForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold uppercase text-[11px]">{tr('staffdict.issuer')} *</label>
                <input
                  type="text"
                  placeholder={tr('staffd.phCertIssuer')}
                  value={certForm.issuer}
                  onChange={(e) => setCertForm((prev) => ({ ...prev, issuer: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold uppercase text-[11px]">{tr('staffdict.year')} *</label>
                <input
                  type="text"
                  placeholder="2025"
                  value={certForm.year}
                  onChange={(e) => setCertForm((prev) => ({ ...prev, year: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold uppercase text-[11px]">Sertifikat fayl / Rasm URL</label>
                <input
                  type="url"
                  placeholder="https://... yoki rasm manzili"
                  value={certForm.file_url}
                  onChange={(e) => setCertForm((prev) => ({ ...prev, file_url: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsCertModalOpen(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
              >
                {tr('staffdict.cancel')}
              </button>
              <button
                onClick={handleSaveCertificate}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-md"
              >
                {tr('staffdict.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL: ADD DIPLOMA */}
      {isDipModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 className="text-lg font-black">{tr('staffd.addDiploma')}</h3>
              <button onClick={() => setIsDipModalOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-slate-500 font-bold uppercase text-[11px]">{tr('staffdict.dipDegree')} *</label>
                <input
                  type="text"
                  placeholder={tr('staffd.phDegree')}
                  value={dipForm.degree}
                  onChange={(e) => setDipForm((prev) => ({ ...prev, degree: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold uppercase text-[11px]">{tr('staffdict.dipInstitution')} *</label>
                <input
                  type="text"
                  placeholder={tr('staffd.phInstitution')}
                  value={dipForm.institution}
                  onChange={(e) => setDipForm((prev) => ({ ...prev, institution: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold uppercase text-[11px]">{tr('staffd.directionSpecialty')}</label>
                <input
                  type="text"
                  placeholder={tr('staffd.phSpecialtyExample')}
                  value={dipForm.specialty}
                  onChange={(e) => setDipForm((prev) => ({ ...prev, specialty: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold uppercase text-[11px]">{tr('staffdict.year')}</label>
                <input
                  type="text"
                  placeholder="2019"
                  value={dipForm.year}
                  onChange={(e) => setDipForm((prev) => ({ ...prev, year: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 font-bold uppercase text-[11px]">Diplom nusxasi / Fayl URL</label>
                <input
                  type="url"
                  placeholder="https://... yoki rasm manzili"
                  value={dipForm.file_url}
                  onChange={(e) => setDipForm((prev) => ({ ...prev, file_url: e.target.value }))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsDipModalOpen(false)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold"
              >
                {tr('staffdict.cancel')}
              </button>
              <button
                onClick={handleSaveDiploma}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md"
              >
                {tr('staffdict.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. MODAL: DOCUMENT PREVIEW */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-2xl w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{previewDoc.type}</span>
                <h3 className="font-black text-slate-900 dark:text-white text-base">{previewDoc.title}</h3>
              </div>
              <button onClick={() => setPreviewDoc(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 max-h-[60vh] flex items-center justify-center">
              {previewDoc.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewDoc.url} alt={previewDoc.title} className="max-h-[60vh] w-auto object-contain" />
              ) : (
                <div className="p-12 text-slate-400">{tr('staffd.noDocSample')}</div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-white rounded-xl text-xs font-bold transition"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
