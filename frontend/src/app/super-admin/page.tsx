'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { clinicApi } from '../../lib/api';
import { CLINIC_MODULES } from '../../lib/modules';
import { PlatformSetting, DentalTechnician, ClinicTenant, ClinicDossierData } from '../../lib/types';
import { useI18n } from '../../lib/i18n';
import PhoneInput from '../../components/PhoneInput';
import {
  ShieldCheck,
  HardDrive,
  SlidersHorizontal,
  Users,
  Wrench,
  CheckCircle2,
  Save,
  Plus,
  Trash2,
  Edit3,
  Copy,
  Eye,
  EyeOff,
  Building2,
  Stethoscope,
  Check,
  X,
  Activity,
  Search,
  ChevronRight,
  Link2,
  Unlink,
  ArrowLeft,
  Upload,
  Image as ImageIcon,
  LayoutDashboard,
  Server,
  KeyRound,
  Sparkles
} from 'lucide-react';

// ────────────────── umumiy uslub tokenlari (bitta joyda — izchillik uchun) ──────────────────
const CARD = 'bg-white dark:bg-[#0b1322] rounded-2xl border border-slate-200 dark:border-slate-800';
const INPUT =
  'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition';
const LABEL = 'text-xs font-semibold text-slate-600 dark:text-slate-300';
const BTN_PRIMARY =
  'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm shadow-blue-600/20 transition active:scale-[0.98] disabled:opacity-50';
const BTN_GHOST =
  'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition';

const PLAN_STYLE: Record<string, string> = {
  Enterprise: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  Professional: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  Standard: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
};

const uz = (n: number) => n.toLocaleString('ru-RU');

// Xotirani eng mos birlikda ko'rsatadi: TB / GB / MB / KB / B (qiymat GB da keladi)
const fmtStorage = (gb: number | string): string => {
  const v = Number(gb) || 0;
  if (v >= 1024) return `${Number((v / 1024).toFixed(2))} TB`;
  if (v >= 1) return `${Number(v.toFixed(2))} GB`;
  const mb = v * 1024;
  if (mb >= 1) return `${Number(mb.toFixed(mb < 10 ? 1 : 0))} MB`;
  const kb = mb * 1024;
  if (kb >= 1) return `${Number(kb.toFixed(kb < 10 ? 1 : 0))} KB`;
  const b = kb * 1024;
  return `${Math.round(b)} B`;
};

function SuperAdminPageContent() {
  const { user } = useAuth();
  const { tr } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (user && user.role !== 'superadmin') router.replace('/');
  }, [user, router]);

  const [platform, setPlatform] = useState<PlatformSetting | null>(null);
  const [clinics, setClinics] = useState<ClinicTenant[]>([]);
  const [technicians, setTechnicians] = useState<DentalTechnician[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  type Section = 'overview' | 'clinics' | 'storage' | 'modules' | 'technicians';
  const [activeSection, setActiveSection] = useState<Section>('overview');

  const [activeClinicId, setActiveClinicId] = useState<number | null>(null);
  const [clinicDossier, setClinicDossier] = useState<ClinicDossierData | null>(null);
  const [dossierTab, setDossierTab] =
    useState<'asosiy' | 'xodimlar' | 'bemorlar' | 'storage' | 'modullar' | 'texniklar'>('asosiy');

  useEffect(() => {
    const tabParam = searchParams.get('tab') as Section | null;
    const clinicParam = searchParams.get('clinic');
    if (tabParam && ['overview', 'clinics', 'storage', 'modules', 'technicians'].includes(tabParam)) {
      setActiveSection(tabParam);
    }
    if (clinicParam) handleEnterClinic(Number(clinicParam));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [clinicSearch, setClinicSearch] = useState('');

  const [isNewClinicModalOpen, setIsNewClinicModalOpen] = useState(false);
  const [isSubmittingClinic, setIsSubmittingClinic] = useState(false);
  const [createdClinicCredentials, setCreatedClinicCredentials] = useState<{
    clinic_name: string;
    director_name: string;
    email: string;
    password: string;
    clinic_id: number;
  } | null>(null);
  const [showCreatedPassword, setShowCreatedPassword] = useState(false);
  const [copiedCredentials, setCopiedCredentials] = useState(false);
  const [showNewClinicPassword, setShowNewClinicPassword] = useState(true);

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let pass = 'Dent#';
    for (let i = 0; i < 4; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  const [clinicForm, setClinicForm] = useState({
    name: '',
    logo: '',
    branch: '',
    director_name: '',
    director_email: '',
    director_password: '',
    phone: '+998 90 ',
    max_doctors: 10,
    storage_quota_gb: 50,
    plan_tier: 'Professional',
    has_auto_reminders: true,
    has_ai_agent: false
  });

  const handleOpenNewClinicModal = () => {
    const generatedPass = generateRandomPassword();
    setClinicForm({
      name: '',
      logo: '',
      branch: '',
      director_name: '',
      director_email: '',
      director_password: generatedPass,
      phone: '+998 90 ',
      max_doctors: 10,
      storage_quota_gb: 50,
      plan_tier: 'Professional',
      has_auto_reminders: true,
      has_ai_agent: false
    });
    setShowNewClinicPassword(true);
    setIsNewClinicModalOpen(true);
  };

  const [isTechModalOpen, setIsTechModalOpen] = useState(false);
  const [editingTech, setEditingTech] = useState<DentalTechnician | null>(null);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<number, boolean>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [techForm, setTechForm] = useState({
    name: '',
    lab_name: '',
    phone: '+998 90 ',
    username: '',
    password: ''
  });

  const [isLinkTechModalOpen, setIsLinkTechModalOpen] = useState(false);
  const [selectedTechIdToLink, setSelectedTechIdToLink] = useState<number | ''>('');

  // Direktor login/parolini o'zgartirish (Pasport tabidan)
  const [isCredModalOpen, setIsCredModalOpen] = useState(false);
  const [credForm, setCredForm] = useState({ director_email: '', director_password: '' });
  const [showCredPassword, setShowCredPassword] = useState(true);
  const [showDossierPassword, setShowDossierPassword] = useState(false);
  const [isSavingCreds, setIsSavingCreds] = useState(false);

  // Avval rol aniqlanadi, keyin ma'lumot yuklanadi (superadmin bo'lmasa umuman yuklamaydi).
  useEffect(() => {
    if (user?.role === 'superadmin') loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [plat, techs, clinicsList] = await Promise.all([
        clinicApi.getPlatformSettings(),
        clinicApi.getTechnicians(),
        clinicApi.getClinics()
      ]);
      setPlatform(plat);
      setTechnicians(techs);
      setClinics(clinicsList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const goSection = (s: Section) => {
    setActiveSection(s);
    router.push(`/super-admin?tab=${s}`);
  };

  // ── klinika ish maydoni ──
  const handleEnterClinic = async (clinicId: number) => {
    setActiveClinicId(clinicId);
    setDossierTab('asosiy');
    let dossier: ClinicDossierData | null = null;
    try {
      dossier = await clinicApi.getClinicDossier(clinicId);
    } catch (e) {
      console.error(e);
    }
    // Backend dossier bermasa (null) — klinika yozuvidan dossier yig'amiz,
    // shunda "Kirish" tugmasi baribir ishlaydi (soxta ma'lumotsiz, bo'sh ro'yxatlar bilan).
    if (!dossier) {
      const clinic = clinics.find(c => c.id === clinicId);
      if (clinic) {
        // Klinikaning REAL (demo uchun namuna) xodim/bemorlarini yuklaymiz
        const [emps, pats, allTechs, apts, tasks, labs] = await Promise.all([
          clinicApi.getEmployees(undefined, clinicId).catch(() => []),
          clinicApi.getPatients(undefined, clinicId).catch(() => []),
          clinicApi.getAvailableTechnicians().catch(() => technicians),
          clinicApi.getAppointments(undefined, undefined, clinicId).catch(() => []),
          clinicApi.getTasks(clinicId).catch(() => []),
          clinicApi.getLabOrders(clinicId).catch(() => [])
        ]);
        const availableTechs = (allTechs && allTechs.length) ? allTechs : technicians;
        // Klinika ma'lumotining REAL hajmini (bayt) hisoblaymiz — nech B/KB/MB ekani ko'rinadi
        const dataStr = JSON.stringify({ emps, pats, apts, tasks, labs });
        const usedBytes = typeof Blob !== 'undefined' ? new Blob([dataStr]).size : dataStr.length;
        const q = Number(clinic.storage_quota_gb) || 50;
        const u = Number(clinic.storage_used_gb) || (usedBytes / (1024 ** 3));
        dossier = {
          clinic,
          employees: emps,
          patients: pats,
          storage: {
            quota_gb: q,
            used_gb: u,
            free_gb: Math.max(0, q - u),
            usage_percent: q ? Math.min(100, Number(((u / q) * 100).toFixed(2))) : 0,
            breakdown: { dicom_kt_gb: 0, photos_gb: 0, backups_gb: 0 }
          },
          linked_technicians: availableTechs.filter(t => (clinic.linked_technicians || []).includes(t.id)),
          all_available_technicians: availableTechs
        };
      }
    }
    setClinicDossier(dossier);
  };

  const handleExitClinic = () => {
    setActiveClinicId(null);
    setClinicDossier(null);
    router.push('/super-admin?tab=clinics');
  };

  const refreshClinic = async (clinicId: number) => {
    const dossier = await clinicApi.getClinicDossier(clinicId);
    setClinicDossier(dossier);
    setClinics(await clinicApi.getClinics());
  };

  const handleSavePlatform = async () => {
    if (!platform) return;
    const updated = await clinicApi.updatePlatformSettings(platform);
    setPlatform(updated);
    showToast(tr('superadmin.toastPlatformSaved'));
  };

  const handleCreateClinic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicForm.name.trim()) return;
    setIsSubmittingClinic(true);
    try {
      const generatedPass = clinicForm.director_password.trim() || generateRandomPassword();
      const generatedEmail =
        clinicForm.director_email.trim() ||
        `director.${clinicForm.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'clinic'}@gmail.com`;

      const created = await clinicApi.createClinic({
        name: clinicForm.name.trim(),
        logo: clinicForm.logo.trim() || clinicForm.name.trim().slice(0, 2).toUpperCase(),
        branch: clinicForm.branch.trim() || 'Toshkent',
        director_name: clinicForm.director_name.trim(),
        director_email: generatedEmail,
        director_password: generatedPass,
        phone: clinicForm.phone.trim(),
        plan_tier: clinicForm.plan_tier,
        max_doctors: Number(clinicForm.max_doctors) || 10,
        storage_quota_gb: Number(clinicForm.storage_quota_gb) || 50,
        storage_used_gb: 0,
        has_auto_reminders: Boolean(clinicForm.has_auto_reminders),
        has_ai_agent: Boolean(clinicForm.has_ai_agent),
        enabled_modules: { sms: true, telegram: true, lab: true, charts_3d: true, chairs: true, commissions: false },
        linked_technicians: [],
        status: 'active'
      });
      // Yangi klinika katalogi BO'SH boshlanadi (bazada). Direktor naryadlar
      // sahifasida qo'lda qo'shadi yoki standart ro'yxatni import qiladi — serverga
      // avtomatik soxta narx yozilmaydi.
      setClinics([created, ...clinics]);
      setIsNewClinicModalOpen(false);

      const creds = created.credentials || {
        email: generatedEmail,
        password: generatedPass,
        role: 'director',
        full_name: clinicForm.director_name.trim() || clinicForm.name.trim(),
        clinic_id: created.id,
        clinic_name: created.name
      };

      setCreatedClinicCredentials({
        clinic_name: creds.clinic_name || created.name,
        director_name: creds.full_name || clinicForm.director_name.trim() || 'Direktor',
        email: creds.email,
        password: creds.password,
        clinic_id: created.id
      });

      setClinicForm({
        name: '',
        logo: '',
        branch: '',
        director_name: '',
        director_email: '',
        director_password: '',
        phone: '+998 90 ',
        max_doctors: 10,
        storage_quota_gb: 50,
        plan_tier: 'Professional',
        has_auto_reminders: true,
        has_ai_agent: false
      });
      showToast(`«${created.name}» klinikasi ochildi. Kirish ma'lumotlari yaratildi!`);
    } catch (err: any) {
      console.error(err);
      // Backend saqlamasa — superadminga ANIQ xato ko'rsatamiz (avval jimgina soxta klinika chiqarardi)
      showToast(err?.message || tr('superadmin.toastClinicFailed'));
    } finally {
      setIsSubmittingClinic(false);
    }
  };

  const handleDeleteClinic = async (id: number, name: string) => {
    if (!confirm(`«${name}» klinikasini tizimdan o‘chirasizmi?`)) return;
    await clinicApi.deleteClinic(id);
    setClinics(clinics.filter(c => c.id !== id));
    if (activeClinicId === id) handleExitClinic();
    showToast(`«${name}» o‘chirildi`);
  };

  const handleToggleLinkTech = async (techId: number, action: 'link' | 'unlink') => {
    if (!activeClinicId) return;
    const res = await clinicApi.linkTechnicianToClinic(activeClinicId, techId, action);
    if (res.ok) {
      await refreshClinic(activeClinicId);
      setTechnicians(await clinicApi.getTechnicians());
      setIsLinkTechModalOpen(false);
      setSelectedTechIdToLink('');
      showToast(action === 'link' ? 'Zubnoy texnik biriktirildi' : 'Zubnoy texnik uzildi');
    }
  };

  const handleUpdateClinicStorage = async (newQuota: number) => {
    if (!activeClinicId || !clinicDossier) return;
    await clinicApi.updateClinic(activeClinicId, { storage_quota_gb: newQuota });
    setClinicDossier({
      ...clinicDossier,
      clinic: { ...clinicDossier.clinic, storage_quota_gb: newQuota },
      storage: {
        ...clinicDossier.storage,
        quota_gb: newQuota,
        free_gb: Math.max(0, Number((newQuota - clinicDossier.storage.used_gb).toFixed(1))),
        usage_percent: Math.min(100, Number(((clinicDossier.storage.used_gb / newQuota) * 100).toFixed(1)))
      }
    });
    setClinics(clinics.map(c => (c.id === activeClinicId ? { ...c, storage_quota_gb: newQuota } : c)));
  };

  const handleUpdateClinicDetails = async (updates: Partial<ClinicTenant>) => {
    if (!activeClinicId || !clinicDossier) return;
    const updated = await clinicApi.updateClinic(activeClinicId, updates);
    setClinicDossier({ ...clinicDossier, clinic: { ...clinicDossier.clinic, ...updated } });
    setClinics(clinics.map(c => (c.id === activeClinicId ? { ...c, ...updated } : c)));
    showToast(tr('superadmin.toastClinicSaved'));
  };

  const handleOpenCredModal = () => {
    if (!clinicDossier) return;
    setCredForm({
      director_email: clinicDossier.clinic.director_email || '',
      director_password: clinicDossier.clinic.director_password || ''
    });
    setShowCredPassword(true);
    setIsCredModalOpen(true);
  };

  const handleSaveCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClinicId || !clinicDossier) return;
    if (!credForm.director_email.trim() && !credForm.director_password.trim()) return;
    setIsSavingCreds(true);
    try {
      const res = await clinicApi.setDirectorCredentials(activeClinicId, {
        director_email: credForm.director_email.trim() || undefined,
        director_password: credForm.director_password.trim() || undefined
      });
      if (res.ok) {
        setClinicDossier({
          ...clinicDossier,
          clinic: {
            ...clinicDossier.clinic,
            director_email: res.director_email || credForm.director_email,
            director_password: res.director_password || credForm.director_password
          }
        });
        setIsCredModalOpen(false);
        showToast('Direktor kirish ma’lumotlari yangilandi');
      } else {
        showToast(res.message || 'Saqlashda xatolik');
      }
    } finally {
      setIsSavingCreds(false);
    }
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>, isModal: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (isModal) setClinicForm(prev => ({ ...prev, logo: result }));
      else if (activeClinicId) handleUpdateClinicDetails({ logo: result });
    };
    reader.readAsDataURL(file);
  };

  const handleOpenCreateTech = () => {
    setEditingTech(null);
    const rand = Math.floor(100 + Math.random() * 900);
    setTechForm({ name: '', lab_name: '', phone: '+998 90 ', username: `texnik_${rand}`, password: Math.random().toString(36).slice(-6) });
    setIsTechModalOpen(true);
  };

  const handleOpenEditTech = (tech: DentalTechnician) => {
    setEditingTech(tech);
    setTechForm({ name: tech.name, lab_name: tech.lab_name, phone: tech.phone || '+998 90 ', username: tech.username, password: tech.password || '123456' });
    setIsTechModalOpen(true);
  };

  const handleSaveTech = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!techForm.name.trim() || !techForm.username.trim()) return;
    if (editingTech) {
      const updated = await clinicApi.updateTechnician(editingTech.id, {
        name: techForm.name,
        lab_name: techForm.lab_name,
        phone: techForm.phone,
        username: techForm.username,
        password: techForm.password
      });
      setTechnicians(technicians.map(t => (t.id === editingTech.id ? updated : t)));
      showToast(tr('superadmin.toastTechUpdated'));
    } else {
      const created = await clinicApi.createTechnician({
        name: techForm.name,
        lab_name: techForm.lab_name || 'Mustaqil Dental Lab',
        phone: techForm.phone,
        username: techForm.username,
        password: techForm.password,
        linked_clinics: [],
        price_list: [],
        is_active: true
      });
      setTechnicians([created, ...technicians]);
      showToast(`«${created.name}» ro‘yxatga olindi`);
    }
    setIsTechModalOpen(false);
  };

  const handleCopyCredentials = (tech: DentalTechnician) => {
    const text = `Zubnoy texnik kirishi\nSayt: ${window.location.origin}/technician\nLogin: ${tech.username}\nParol: ${tech.password || '123456'}`;
    navigator.clipboard.writeText(text);
    setCopiedId(tech.id);
    showToast(tr('superadmin.toastCredsCopied'));
    setTimeout(() => setCopiedId(null), 2200);
  };

  // ── platforma bo‘yicha jamlanma statistikalar ──
  const stats = useMemo(() => {
    const totalDoctors = clinics.reduce((s, c) => s + (c.doctors_count || 0), 0);
    const totalPatients = clinics.reduce((s, c) => s + (c.patients_count || 0), 0);
    const used = clinics.reduce((s, c) => s + (Number(c.storage_used_gb) || 0), 0);
    const quota = clinics.reduce((s, c) => s + (Number(c.storage_quota_gb) || 0), 0);
    const plans: Record<string, number> = {};
    clinics.forEach(c => (plans[c.plan_tier] = (plans[c.plan_tier] || 0) + 1));
    return {
      totalDoctors,
      totalPatients,
      used: Number(used.toFixed(1)),
      quota,
      usagePct: quota ? Math.round((used / quota) * 100) : 0,
      active: clinics.filter(c => c.status === 'active').length,
      plans
    };
  }, [clinics]);

  const filteredClinics = clinics.filter(
    c =>
      c.name.toLowerCase().includes(clinicSearch.toLowerCase()) ||
      c.branch.toLowerCase().includes(clinicSearch.toLowerCase()) ||
      c.director_name.toLowerCase().includes(clinicSearch.toLowerCase())
  );

  const ClinicLogo = ({ logo, name, size = 'md' }: { logo: string; name: string; size?: 'md' | 'lg' }) => {
    const dims = size === 'lg' ? 'w-16 h-16 text-lg rounded-2xl' : 'w-12 h-12 text-sm rounded-xl';
    const isImg = logo && (logo.startsWith('http') || logo.startsWith('data:'));
    return (
      <div className={`${dims} overflow-hidden flex-shrink-0 flex items-center justify-center font-bold bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-sm`}>
        {isImg ? <img src={logo} alt={name} className="w-full h-full object-cover" /> : <span>{logo || name.slice(0, 2).toUpperCase()}</span>}
      </div>
    );
  };

  // Rol tekshiruvi: superadmin bo'lmasa ma'lumot ko'rsatilmaydi (redirect ishlayapti).
  if (!user || user.role !== 'superadmin') {
    return <div className="p-8 text-center text-sm text-slate-400">Ruxsat tekshirilmoqda…</div>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900 dark:bg-blue-600 text-white shadow-xl shadow-slate-900/20 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-white" />
          <span className="text-sm font-semibold">{toast}</span>
        </div>
      )}

      {/* Navigatsiya faqat chap sidebardan boshqariladi — o'rtada tab yo'q. */}
      {activeClinicId && clinicDossier ? (
        <ClinicWorkspace />
      ) : loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Yuklanmoqda…</div>
      ) : (
        <>
          {activeSection === 'overview' && <OverviewSection />}
          {activeSection === 'clinics' && <ClinicsSection />}
          {activeSection === 'storage' && <StorageSection />}
          {activeSection === 'modules' && <ModulesSection />}
          {activeSection === 'technicians' && <TechniciansSection />}
        </>
      )}

      {/* ── Modals ── */}
      {isNewClinicModalOpen && NewClinicModal()}
      {createdClinicCredentials && <CreatedClinicCredentialsModal />}
      {isLinkTechModalOpen && clinicDossier && <LinkTechModal />}
      {isTechModalOpen && <TechModal />}
      {isCredModalOpen && clinicDossier && DirectorCredentialsModal()}
    </div>
  );

  // ═══════════════════════ SECTIONS ═══════════════════════

  function StatCard({ icon: Icon, tint, label, value, sub }: { icon: React.ElementType; tint: string; label: string; value: string; sub?: string }) {
    return (
      <div className={`${CARD} p-5`}>
        <div className="flex items-center justify-between">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${tint}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        <p className="mt-4 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-1.5">{sub}</p>}
      </div>
    );
  }

  function OverviewSection() {
    return (
      <div className="space-y-6 animate-in fade-in duration-150">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{tr('superadmin.overview')}</h1>
            <p className="text-sm text-slate-400">Platforma bo‘yicha umumiy ko‘rsatkichlar · {user?.clinicName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleOpenNewClinicModal} className={BTN_PRIMARY}>
              <Plus className="w-4 h-4" /> Yangi klinika
            </button>
            <button onClick={handleOpenCreateTech} className={BTN_GHOST}>
              <Wrench className="w-4 h-4" /> Yangi texnik
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Building2} tint="bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300" label={tr('superadmin.activeClinics')} value={`${stats.active} / ${clinics.length}`} sub={tr('superadmin.allBranchesOnline')} />
          <StatCard icon={Stethoscope} tint="bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300" label={tr('superadmin.doctors')} value={uz(stats.totalDoctors)} sub={tr('superadmin.allByClinic')} />
          <StatCard icon={Users} tint="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300" label={tr('superadmin.patients')} value={uz(stats.totalPatients)} sub={tr('superadmin.totalCards')} />
          <StatCard icon={Wrench} tint="bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300" label={tr('superadmin.techsCount')} value={`${technicians.length} ta`} sub={tr('superadmin.independentLabs')} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Storage panel */}
          <div className={`${CARD} p-6 lg:col-span-1`}>
            <div className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Server className="w-4 h-4 text-blue-600" />
              <h3 className="font-bold">{tr('superadmin.cloudStorage')}</h3>
            </div>
            <div className="mt-5 flex items-end gap-1.5">
              <span className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{fmtStorage(stats.used)}</span>
              <span className="text-sm text-slate-400 mb-1">/ {stats.quota} GB</span>
            </div>
            <div className="mt-3 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-500" style={{ width: `${Math.max(3, stats.usagePct)}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {stats.usagePct}% band · <span className="text-emerald-600 font-semibold">{fmtStorage(stats.quota - stats.used)}</span> bo‘sh
            </p>
            <button onClick={() => goSection('storage')} className="mt-5 w-full py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 transition">
              {tr('superadmin.manageStorage')}
            </button>
          </div>

          {/* Plan distribution */}
          <div className={`${CARD} p-6 lg:col-span-2`}>
            <div className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Activity className="w-4 h-4 text-blue-600" />
              <h3 className="font-bold">{tr('superadmin.tariffDistribution')}</h3>
            </div>
            <div className="mt-5 space-y-4">
              {['Enterprise', 'Professional', 'Standard'].map(plan => {
                const count = stats.plans[plan] || 0;
                const pct = clinics.length ? Math.round((count / clinics.length) * 100) : 0;
                return (
                  <div key={plan}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{plan}</span>
                      <span className="text-slate-400 tabular-nums">{count} ta · {pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${plan === 'Enterprise' ? 'bg-blue-600' : plan === 'Professional' ? 'bg-sky-500' : 'bg-slate-400'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recent clinics */}
        <div className={`${CARD} overflow-hidden`}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-bold text-slate-900 dark:text-white">{tr('superadmin.recentClinics')}</h3>
            <button onClick={() => goSection('clinics')} className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1">
              Barchasi <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {clinics.slice(0, 4).map(c => (
              <button key={c.id} onClick={() => handleEnterClinic(c.id)} className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition text-left">
                <ClinicLogo logo={c.logo} name={c.name} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{c.name}</p>
                  <p className="text-xs text-slate-400 truncate">{c.branch}</p>
                </div>
                <span className={`hidden sm:inline px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${PLAN_STYLE[c.plan_tier] || PLAN_STYLE.Standard}`}>{c.plan_tier}</span>
                <div className="hidden md:block text-right w-28">
                  <p className="text-xs text-slate-400">{tr('superadmin.storage')}</p>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{fmtStorage(c.storage_used_gb)} / {c.storage_quota_gb} GB</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function ClinicsSection() {
    return (
      <div className="space-y-5 animate-in fade-in duration-150">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative max-w-md w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={clinicSearch} onChange={e => setClinicSearch(e.target.value)} placeholder={tr('superadmin.searchPlaceholder')} className={`${INPUT} pl-10`} />
          </div>
          <button onClick={handleOpenNewClinicModal} className={BTN_PRIMARY}>
            <Plus className="w-4 h-4" /> Yangi klinika
          </button>
        </div>

        {filteredClinics.length === 0 ? (
          <div className={`${CARD} p-14 text-center`}>
            <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">{tr('superadmin.clinicNotFound')}</p>
            <p className="text-sm text-slate-400">{tr('superadmin.searchHint')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredClinics.map(clinic => {
              const q = Number(clinic.storage_quota_gb) || 50;
              const u = Number(clinic.storage_used_gb) || 0;
              const pct = Math.min(100, Math.round((u / q) * 100));
              return (
                <div key={clinic.id} className={`${CARD} p-5 flex flex-col hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-black/20 transition group`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <ClinicLogo logo={clinic.logo} name={clinic.name} />
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 dark:text-white truncate group-hover:text-blue-600 transition">{clinic.name}</h3>
                        <p className="text-xs text-slate-400 truncate">{clinic.branch}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border whitespace-nowrap ${PLAN_STYLE[clinic.plan_tier] || PLAN_STYLE.Standard}`}>{clinic.plan_tier}</span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 py-2.5">
                      <p className="text-base font-bold text-slate-900 dark:text-white tabular-nums">{clinic.doctors_count || 0}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{tr('superadmin.doctor')}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 py-2.5">
                      <p className="text-base font-bold text-slate-900 dark:text-white tabular-nums">{uz(clinic.patients_count || 0)}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{tr('superadmin.patient')}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 py-2.5">
                      <p className="text-base font-bold text-slate-900 dark:text-white tabular-nums">{(clinic.linked_technicians || []).length}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{tr('superadmin.technician')}</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">{tr('superadmin.storageUsage')}</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{fmtStorage(u)} / {q} GB</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-500" style={{ width: `${Math.max(3, pct)}%` }} />
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <button onClick={() => handleEnterClinic(clinic.id)} className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-1.5 shadow-sm shadow-blue-600/20 transition active:scale-[0.98]">
                      {tr('superadmin.openClinic')} <ChevronRight className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteClinic(clinic.id, clinic.name)} className="p-2.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition" title={tr('common.delete')}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function StorageSection() {
    const platQuota = Number(platform?.storage_quota_gb) || 100;
    return (
      <div className="space-y-6 animate-in fade-in duration-150">
        <div className={`${CARD} p-6 sm:p-7`}>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{tr('superadmin.platformQuota')}</h2>
              <p className="text-sm text-slate-400 mt-0.5">{tr('superadmin.storageSubtitle')}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-blue-600 tabular-nums">{fmtStorage(stats.used)}</p>
              <p className="text-xs text-slate-400">jami {stats.quota} GB ajratilgan</p>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-500">Band: {fmtStorage(stats.used)} ({stats.usagePct}%)</span>
              <span className="text-emerald-600">Bo‘sh: {fmtStorage(stats.quota - stats.used)}</span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-500" style={{ width: `${Math.max(3, stats.usagePct)}%` }} />
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <label className={LABEL}>
              Platforma umumiy kvotasi: <strong className="text-blue-600">{platQuota} GB</strong>
            </label>
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={platQuota}
              onChange={e => platform && setPlatform({ ...platform, storage_quota_gb: Number(e.target.value) })}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex justify-end">
              <button onClick={handleSavePlatform} className={BTN_PRIMARY}>
                <Save className="w-4 h-4" /> Kvotani saqlash
              </button>
            </div>
          </div>
        </div>

        {/* Per-clinic breakdown */}
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h3 className="font-bold text-slate-900 dark:text-white">{tr('superadmin.clinicsDistribution')}</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {clinics.map(c => {
              const q = Number(c.storage_quota_gb) || 50;
              const u = Number(c.storage_used_gb) || 0;
              const pct = Math.min(100, Math.round((u / q) * 100));
              return (
                <div key={c.id} className="px-6 py-4 flex items-center gap-4">
                  <ClinicLogo logo={c.logo} name={c.name} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">{c.name}</p>
                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden max-w-md">
                      <div className={`h-full rounded-full ${pct > 85 ? 'bg-red-500' : 'bg-gradient-to-r from-blue-600 to-sky-500'}`} style={{ width: `${Math.max(3, pct)}%` }} />
                    </div>
                  </div>
                  <div className="text-right w-28">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{fmtStorage(u)} / {q} GB</p>
                    <p className={`text-xs font-semibold ${pct > 85 ? 'text-red-500' : 'text-slate-400'}`}>{pct}% band</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function ModulesSection() {
    const tariffs = [
      { tier: 'Standard', price: 450000, doctors: '5 shifokorgacha', note: 'Kichik klinikalar uchun' },
      { tier: 'Professional', price: 900000, doctors: '15 shifokorgacha', note: 'Eng ko‘p tanlanadigan reja' },
      { tier: 'Enterprise', price: 1800000, doctors: 'Cheksiz', note: 'Yirik tarmoqlar uchun' }
    ];
    return (
      <div className="space-y-6 animate-in fade-in duration-150">
        {/* ── Tariflar ── */}
        <div className={`${CARD} p-6 sm:p-7 space-y-5`}>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Tariflar va reja</h2>
            <p className="text-sm text-slate-400 mt-0.5">Platforma tarif rejalari va asosiy narxlar. Har bir klinika uchun aniq tarif klinika pasportidan belgilanadi.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {tariffs.map(t => {
              const count = stats.plans[t.tier] || 0;
              return (
                <div key={t.tier} className={`rounded-2xl border p-5 ${PLAN_STYLE[t.tier] || PLAN_STYLE.Standard}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">{t.tier}</h3>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-white/60 dark:bg-black/20">{count} klinika</span>
                  </div>
                  <p className="mt-3 text-2xl font-black tabular-nums">{uz(t.price)}<span className="text-xs font-semibold"> so‘m/oy</span></p>
                  <p className="text-xs mt-1 opacity-80">{t.doctors}</p>
                  <p className="text-[11px] mt-2 opacity-70">{t.note}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Platforma standart modullari (yangi klinika uchun default) ── */}
        <div className={`${CARD} p-6 sm:p-7 space-y-5`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Platforma standart modullari</h2>
              <p className="text-sm text-slate-400 mt-0.5">Bu — yangi ochilgan klinikalar uchun standart holat. Har bir klinikada alohida yoqib/o‘chirish mumkin.</p>
            </div>
            <button onClick={handleSavePlatform} className={BTN_PRIMARY}>
              <Save className="w-4 h-4" /> Saqlash
            </button>
          </div>
          {(['core', 'comms', 'smart'] as const).map(group => (
            <div key={group}>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                {group === 'core' ? 'Asosiy modullar' : group === 'comms' ? 'Aloqa modullari' : 'Aqlli modullar (qo‘shimcha tarif)'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {CLINIC_MODULES.filter(m => m.group === group).map(m => {
                  const on = platform?.enabled_modules?.[m.key] !== false;
                  return (
                    <button
                      key={m.key}
                      onClick={() => platform && setPlatform({ ...platform, enabled_modules: { ...platform.enabled_modules, [m.key]: !on } })}
                      className={`text-left p-4 rounded-xl border transition ${on ? 'border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 opacity-70'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-sm text-slate-900 dark:text-white">{m.label}</h4>
                        <span className={`relative w-9 h-5 rounded-full transition flex-shrink-0 ${on ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">{m.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function TechniciansSection() {
    return (
      <div className="space-y-5 animate-in fade-in duration-150">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{tr('superadmin.zubTechs')}</h2>
            <p className="text-sm text-slate-400">{tr('superadmin.techAccountsDesc')}</p>
          </div>
          <button onClick={handleOpenCreateTech} className={BTN_PRIMARY}>
            <Plus className="w-4 h-4" /> Yangi texnik
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {technicians.map(tech => (
            <div key={tech.id} className={`${CARD} p-5 flex flex-col`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                    <Wrench className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-900 dark:text-white truncate">{tech.name}</h4>
                    <p className="text-xs text-slate-400 truncate">{tech.lab_name}</p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold ${tech.is_active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-100 text-slate-500'}`}>
                  {tech.is_active ? 'Faol' : 'Nofaol'}
                </span>
              </div>

              <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 divide-y divide-slate-200/70 dark:divide-slate-700/50 text-sm">
                <div className="flex items-center justify-between px-3.5 py-2.5">
                  <span className="text-xs text-slate-400">{tr('superadmin.login')}</span>
                  <code className="text-xs font-semibold text-slate-700 dark:text-slate-200">{tech.username}</code>
                </div>
                <div className="flex items-center justify-between px-3.5 py-2.5">
                  <span className="text-xs text-slate-400">{tr('superadmin.password')}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-200">{showPasswordMap[tech.id] ? tech.password || '123456' : '••••••'}</span>
                    <button onClick={() => setShowPasswordMap({ ...showPasswordMap, [tech.id]: !showPasswordMap[tech.id] })} className="text-slate-400 hover:text-slate-600">
                      {showPasswordMap[tech.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between px-3.5 py-2.5">
                  <span className="text-xs text-slate-400">{tr('superadmin.phone')}</span>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{tech.phone}</span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
                <span><strong className="text-slate-700 dark:text-slate-200">{(tech.price_list || []).length}</strong> xizmat narxi</span>
                <span><strong className="text-blue-600">{(tech.linked_clinics || []).length}</strong> klinika ulangan</span>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <button onClick={() => handleCopyCredentials(tech)} className="flex-1 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-semibold flex items-center justify-center gap-1.5 transition">
                  {copiedId === tech.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  {copiedId === tech.id ? 'Nusxalandi' : 'Kirishni nusxalash'}
                </button>
                <button onClick={() => handleOpenEditTech(tech)} className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition" title={tr('common.edit')}>
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ═══════════════════════ CLINIC WORKSPACE (dossier) ═══════════════════════
  function ClinicWorkspace() {
    if (!clinicDossier) return null;
    const d = clinicDossier;
    const TABS = [
      { id: 'asosiy', label: 'Pasport', icon: Building2 },
      { id: 'xodimlar', label: `Xodimlar · ${d.employees.length}`, icon: Stethoscope },
      { id: 'bemorlar', label: `Bemorlar · ${d.patients.length}`, icon: Users },
      { id: 'storage', label: 'Xotira', icon: HardDrive },
      { id: 'modullar', label: 'Modullar', icon: SlidersHorizontal },
      { id: 'texniklar', label: `Texniklar · ${d.linked_technicians.length}`, icon: Wrench }
    ] as const;

    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="flex items-center justify-between">
          <button onClick={handleExitClinic} className={BTN_GHOST}>
            <ArrowLeft className="w-4 h-4 text-blue-600" /> Barcha klinikalar
          </button>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${d.clinic.status === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>
              {d.clinic.status === 'active' ? '● Faol' : '● To‘xtatilgan'}
            </span>
            <button onClick={() => handleDeleteClinic(d.clinic.id, d.clinic.name)} className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition" title={tr('common.delete')}>
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hero */}
        <div className={`${CARD} p-6 flex flex-col md:flex-row md:items-center justify-between gap-6`}>
          <div className="flex items-center gap-5">
            <div className="relative group">
              <ClinicLogo logo={d.clinic.logo} name={d.clinic.name} size="lg" />
              <label className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition">
                <Upload className="w-4 h-4 text-white" />
                <input type="file" accept="image/*" className="hidden" onChange={e => handleLogoFileUpload(e, false)} />
              </label>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{d.clinic.name}</h1>
                <span className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${PLAN_STYLE[d.clinic.plan_tier] || PLAN_STYLE.Standard}`}>{d.clinic.plan_tier}</span>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">{d.clinic.branch}</p>
              <p className="text-xs text-slate-500 mt-1">Direktor: <strong className="text-slate-700 dark:text-slate-300">{d.clinic.director_name || '—'}</strong> · <span className="font-mono">{d.clinic.phone}</span></p>
            </div>
          </div>
          <div className="flex gap-3">
            {[
              { label: 'Shifokor', value: `${d.employees.length}/${d.clinic.max_doctors}` },
              { label: 'Bemor', value: uz(d.patients.length) },
              { label: 'Xotira', value: fmtStorage(d.storage.used_gb) }
            ].map(s => (
              <div key={s.label} className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-center min-w-[92px]">
                <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{s.value}</p>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {TABS.map(t => {
            const Icon = t.icon;
            const on = dossierTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setDossierTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition ${
                  on ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className={`${CARD} p-6 sm:p-7`}>
          {dossierTab === 'asosiy' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-5">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{tr('superadmin.registration')}</h4>
                <dl className="mt-4 space-y-3 text-sm">
                  {[
                    ['Nomi', d.clinic.name],
                    ['Filial', d.clinic.branch],
                    ['Direktor', d.clinic.director_name || '—'],
                    ['Telefon', d.clinic.phone],
                    ['Tarif', d.clinic.plan_tier],
                    ['Ochilgan', d.clinic.created_at ? new Date(d.clinic.created_at).toLocaleDateString('ru-RU') : '—']
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-slate-200/60 dark:border-slate-700/50 pb-2">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="font-semibold text-slate-800 dark:text-slate-100 text-right">{v}</dd>
                    </div>
                  ))}
                </dl>

                {/* Direktor kirish ma'lumotlari: Gmail + Parol (ko'rish + o'zgartirish) */}
                <div className="mt-4 p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300">
                    <KeyRound className="w-4 h-4" /> Direktor kirish ma'lumotlari
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">Gmail (Login)</span>
                    <code className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 select-all truncate">{d.clinic.director_email || '—'}</code>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">Parol</span>
                    <div className="flex items-center gap-1.5">
                      <code className="text-xs font-mono font-bold text-slate-800 dark:text-slate-100 tracking-wider">
                        {showDossierPassword ? (d.clinic.director_password || '—') : '••••••••'}
                      </code>
                      <button type="button" onClick={() => setShowDossierPassword(!showDossierPassword)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        {showDossierPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <button type="button" onClick={handleOpenCredModal} className={`${BTN_GHOST} w-full justify-center !py-2`}>
                    <KeyRound className="w-4 h-4 text-blue-600" /> Gmail / Parolni o'zgartirish
                  </button>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-5">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{tr('common.edit')}</h4>
                <div className="mt-4 space-y-3">
                  <div className="space-y-1">
                    <label className={LABEL}>{tr('superadmin.clinicName')}</label>
                    <input defaultValue={d.clinic.name} onBlur={e => handleUpdateClinicDetails({ name: e.target.value })} className={INPUT} />
                  </div>
                  <div className="space-y-1">
                    <label className={LABEL}>{tr('superadmin.branchAddress')}</label>
                    <input defaultValue={d.clinic.branch} onBlur={e => handleUpdateClinicDetails({ branch: e.target.value })} className={INPUT} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className={LABEL}>{tr('superadmin.director')}</label>
                      <input defaultValue={d.clinic.director_name} onBlur={e => handleUpdateClinicDetails({ director_name: e.target.value })} className={INPUT} />
                    </div>
                    <div className="space-y-1">
                      <label className={LABEL}>{tr('superadmin.phone')}</label>
                      <input defaultValue={d.clinic.phone} onBlur={e => handleUpdateClinicDetails({ phone: e.target.value })} className={INPUT} />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">{tr('superadmin.autoSaveHint')}</p>
                </div>
              </div>
            </div>
          )}

          {dossierTab === 'xodimlar' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {d.employees.map(doc => (
                <div key={doc.id} className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <img src={doc.avatar || ''} alt={doc.full_name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0 bg-slate-100 dark:bg-slate-800" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-semibold text-slate-900 dark:text-white truncate">{doc.full_name}</h4>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{tr('superadmin.active')}</span>
                    </div>
                    <p className="text-xs text-slate-500">{doc.specialty}</p>
                    <p className="text-[11px] font-semibold text-blue-600 mt-0.5">{doc.chair}</p>
                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-[11px] text-slate-400">
                      <span>{doc.phone}</span>
                      <span>Komissiya <strong className="text-emerald-600">{doc.commission_rate || 35}%</strong></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {dossierTab === 'bemorlar' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-400 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">{tr('superadmin.patient')}</th>
                    <th className="text-left px-4 py-3 font-semibold">{tr('superadmin.phone')}</th>
                    <th className="text-left px-4 py-3 font-semibold">{tr('superadmin.lang')}</th>
                    <th className="text-left px-4 py-3 font-semibold">{tr('superadmin.category')}</th>
                    <th className="text-right px-4 py-3 font-semibold">{tr('superadmin.balance')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {d.patients.map(p => {
                    const bal = Number(p.balance) || 0;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{p.full_name}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.phone}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">{(p.service_lang || 'uz').toUpperCase()}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{p.category_status || 'Oddiy'}</td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${bal < 0 ? 'text-red-500' : bal > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{uz(bal)} so‘m</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {dossierTab === 'storage' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{tr('superadmin.usedStorage')}</p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">{fmtStorage(d.storage.used_gb)} <span className="text-base font-medium text-slate-400">/ {d.storage.quota_gb} GB</span></p>
                </div>
                <p className="text-2xl font-bold text-emerald-600 tabular-nums">{fmtStorage(d.storage.free_gb)} <span className="text-xs font-medium text-slate-400">{tr('superadmin.free')}</span></p>
              </div>
              <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-500" style={{ width: `${Math.max(3, d.storage.usage_percent)}%` }} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  ['3D KT / DICOM', d.storage.breakdown.dicom_kt_gb, 'Rentgen va tomografiya'],
                  ['Klinik fotosuratlar', d.storage.breakdown.photos_gb, 'Davolashgacha / keyin'],
                  ['Baza zaxirasi', d.storage.breakdown.backups_gb, 'Kunlik avto-backup']
                ].map(([label, val, sub]) => (
                  <div key={label as string} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase">{label}</p>
                    <p className="text-xl font-bold text-blue-600 mt-1 tabular-nums">{fmtStorage(val as number)}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>
              <div className="pt-5 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <label className={LABEL}>Ajratilgan kvota: <strong className="text-blue-600">{d.storage.quota_gb} GB</strong></label>
                {d.clinic.id === 1 ? (
                  <p className="text-xs text-slate-400">🔒 Demo klinika — kvota 1 GB da qulflangan, oshirib bo'lmaydi.</p>
                ) : (
                  <input type="range" min={1} max={300} step={1} value={d.storage.quota_gb} onChange={e => handleUpdateClinicStorage(Number(e.target.value))} className="w-full accent-blue-600 cursor-pointer" />
                )}
              </div>
            </div>
          )}

          {dossierTab === 'modullar' && (
            <div className="space-y-5">
              {/* ── TARIF (reja) ── */}
              <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">Tarif rejasi</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className={LABEL}>Tarif darajasi</label>
                    <select
                      value={d.clinic.plan_tier}
                      onChange={e => handleUpdateClinicDetails({ plan_tier: e.target.value })}
                      className={INPUT}
                    >
                      <option>Standard</option>
                      <option>Professional</option>
                      <option>Enterprise</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={LABEL}>Shifokorlar limiti</label>
                    <select
                      value={d.clinic.max_doctors}
                      onChange={e => handleUpdateClinicDetails({ max_doctors: Number(e.target.value) })}
                      className={INPUT}
                    >
                      {[5, 10, 15, 25, 50].map(n => <option key={n} value={n}>{n} ta</option>)}
                    </select>
                  </div>
                </div>
                {(() => {
                  const base = d.clinic.plan_tier === 'Enterprise' ? 1800000 : d.clinic.plan_tier === 'Standard' ? 450000 : 900000;
                  const remAdd = d.clinic.has_auto_reminders ? 300000 : 0;
                  const aiAdd = d.clinic.has_ai_agent ? 700000 : 0;
                  const total = base + remAdd + aiAdd;
                  return (
                    <div className="flex items-center justify-between pt-1 text-sm">
                      <span className="text-slate-600 dark:text-slate-300 font-semibold">Hisoblangan oylik to‘lov</span>
                      <span className="font-black text-emerald-700 dark:text-emerald-400 tabular-nums">{uz(total)} so‘m</span>
                    </div>
                  );
                })()}
              </div>

              {/* Maxsus Tarif Modullari: Avto-eslatma & AI Konsultant */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50/60 to-purple-50/60 dark:from-blue-950/20 dark:to-purple-950/20 border border-blue-200/80 dark:border-blue-800/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      Tarif imkoniyatlari (Avto-eslatma & AI Avto-javob)
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Ushbu klinika obunasida qaysi aqlli tizimlar faol bo‘lishini belgilang
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Avto-eslatma */}
                  <div
                    onClick={() => handleUpdateClinicDetails({ has_auto_reminders: !d.clinic.has_auto_reminders })}
                    className={`cursor-pointer p-4 rounded-xl border transition ${
                      d.clinic.has_auto_reminders
                        ? 'border-blue-400 bg-white dark:bg-slate-900 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-sky-400 flex items-center justify-center font-bold">
                          🔔
                        </div>
                        <div>
                          <h5 className="font-bold text-sm text-slate-900 dark:text-white">{tr('superadmin.autoReminder')}</h5>
                          <span className="text-[10px] font-semibold text-blue-600 dark:text-sky-400">{tr('superadmin.smsReminders')}</span>
                        </div>
                      </div>
                      <span className={`relative w-9 h-5 rounded-full transition ${d.clinic.has_auto_reminders ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${d.clinic.has_auto_reminders ? 'left-[18px]' : 'left-0.5'}`} />
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5 leading-relaxed">
                      Qabuldan oldin avto-SMS/Telegram yuborish va bemor javobiga qarab («Kelaman», «Kechikaman», «Bekor») CRM qabul holatini avtomatik yangilash.
                    </p>
                  </div>

                  {/* AI Konsultant */}
                  <div
                    onClick={() => handleUpdateClinicDetails({ has_ai_agent: !d.clinic.has_ai_agent })}
                    className={`cursor-pointer p-4 rounded-xl border transition ${
                      d.clinic.has_ai_agent
                        ? 'border-purple-400 bg-white dark:bg-slate-900 shadow-xs ring-1 ring-purple-400/30'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                          🤖
                        </div>
                        <div>
                          <h5 className="font-bold text-sm text-slate-900 dark:text-white">{tr('superadmin.aiAdmin')}</h5>
                          <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">{tr('superadmin.aiAutoZapis')}</span>
                        </div>
                      </div>
                      <span className={`relative w-9 h-5 rounded-full transition ${d.clinic.has_ai_agent ? 'bg-purple-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${d.clinic.has_ai_agent ? 'left-[18px]' : 'left-0.5'}`} />
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2.5 leading-relaxed">
                      Bemor savollariga narx va shifokorlar jadvali bo‘yicha chatda javob berish va bemorni to‘g‘ridan-to‘g‘ri shifokor qabuliga (Appointment) yozish.
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Asosiy & aloqa modullari (kanonik ro'yxat) ── */}
              <div className="rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 p-3 flex items-start gap-2 text-[11px] text-amber-800 dark:text-amber-300">
                <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>O‘chirilgan modul klinika foydalanuvchilarida <b>butunlay yo‘qoladi</b> — menyudan ham, sahifa sifatida ham ko‘rinmaydi.</span>
              </div>

              {(['core', 'comms'] as const).map(group => (
                <div key={group}>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                    {group === 'core' ? 'Asosiy modullar' : 'Aloqa modullari'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {CLINIC_MODULES.filter(m => m.group === group).map(m => {
                      const on = d.clinic.enabled_modules?.[m.key] !== false;
                      return (
                        <button
                          key={m.key}
                          onClick={() => handleUpdateClinicDetails({ enabled_modules: { ...d.clinic.enabled_modules, [m.key]: !on } })}
                          className={`text-left p-4 rounded-xl border transition ${on ? 'border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 opacity-70'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h5 className="font-semibold text-sm text-slate-900 dark:text-white">{m.label}</h5>
                            <span className={`relative w-9 h-5 rounded-full transition flex-shrink-0 ${on ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-2">{m.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {dossierTab === 'texniklar' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{tr('superadmin.linkedTechs')}</h3>
                  <p className="text-sm text-slate-400">{tr('superadmin.techLabVisibility')}</p>
                </div>
                <button onClick={() => setIsLinkTechModalOpen(true)} className={BTN_PRIMARY}>
                  <Link2 className="w-4 h-4" /> Texnik ulash
                </button>
              </div>
              {d.linked_technicians.length === 0 ? (
                <div className="p-12 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  <Wrench className="w-9 h-9 text-slate-300 mx-auto" />
                  <p className="mt-3 font-semibold text-slate-700 dark:text-slate-200">{tr('superadmin.noTechLinked')}</p>
                  <p className="text-sm text-slate-400">{tr('superadmin.connectTechHint')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {d.linked_technicians.map(tech => (
                    <div key={tech.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col gap-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                            <Wrench className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900 dark:text-white">{tech.name}</h4>
                            <p className="text-xs text-slate-400">{tech.lab_name}</p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{tr('superadmin.connected')}</span>
                      </div>
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-xs text-slate-500">{(tech.price_list || []).length} ta xizmat narxi</span>
                        <button onClick={() => handleToggleLinkTech(tech.id, 'unlink')} className="text-xs font-semibold text-red-500 hover:text-red-700 flex items-center gap-1">
                          <Unlink className="w-3.5 h-3.5" /> Uzish
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════ MODALS ═══════════════════════
  function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
        <div className={`${CARD} w-full ${wide ? 'max-w-xl' : 'max-w-md'} p-6 shadow-2xl my-8 animate-in fade-in zoom-in-95 duration-150`}>
          {children}
        </div>
      </div>
    );
  }

  // MUHIM: bu modal to'g'ridan-to'g'ri {NewClinicModal()} bilan chaqiriladi (JSX <NewClinicModal/> emas)
  // va Modal wrapper inline yozilgan — aks holda har harf bosilganda input fokusdan chiqib ketadi.
  function NewClinicModal() {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
        <div className={`${CARD} w-full max-w-xl p-6 shadow-2xl my-8 animate-in fade-in zoom-in-95 duration-150`}>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center"><Building2 className="w-5 h-5" /></div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">{tr('superadmin.newClinic')}</h3>
              <p className="text-xs text-slate-400">{tr('superadmin.configBranchQuotaTariff')}</p>
            </div>
          </div>
          <button onClick={() => setIsNewClinicModalOpen(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleCreateClinic} className="mt-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
              {clinicForm.logo ? <img src={clinicForm.logo} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-slate-400" />}
            </div>
            <div className="flex-1 space-y-1.5">
              <input value={clinicForm.logo} onChange={e => setClinicForm({ ...clinicForm, logo: e.target.value })} placeholder={tr('superadmin.logoPlaceholder')} className={INPUT} />
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 cursor-pointer hover:underline">
                <Upload className="w-3.5 h-3.5" /> Kompyuterdan yuklash
                <input type="file" accept="image/*" className="hidden" onChange={e => handleLogoFileUpload(e, true)} />
              </label>
            </div>
          </div>
          <div className="space-y-1">
            <label className={LABEL}>Klinika nomi <span className="text-red-500">*</span></label>
            <input
              required
              value={clinicForm.name}
              onChange={e => {
                const val = e.target.value;
                const slug = val.toLowerCase().replace(/[^a-z0-9]/g, '');
                setClinicForm(prev => ({
                  ...prev,
                  name: val,
                  director_email: (!prev.director_email || prev.director_email.startsWith('director.'))
                    ? (slug ? `director.${slug}@gmail.com` : '')
                    : prev.director_email
                }));
              }}
              placeholder={tr('superadmin.phClinicName')}
              className={INPUT}
            />
          </div>
          <div className="space-y-1">
            <label className={LABEL}>{tr('superadmin.branchAddress')}</label>
            <input value={clinicForm.branch} onChange={e => setClinicForm({ ...clinicForm, branch: e.target.value })} placeholder="Toshkent sh., Yunusobod 4-mavze 18" className={INPUT} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={LABEL}>Direktor F.I.O</label>
              <input value={clinicForm.director_name} onChange={e => setClinicForm({ ...clinicForm, director_name: e.target.value })} placeholder="Jasur Usmonov" className={INPUT} />
            </div>
            <div className="space-y-1">
              <label className={LABEL}>{tr('superadmin.phone')}</label>
              <PhoneInput value={clinicForm.phone} onChange={v => setClinicForm({ ...clinicForm, phone: v })} className="w-full rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100" />
            </div>
          </div>

          {/* Direktor kirish ma'lumotlari: Gmail & Parol */}
          <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Direktor kirish ma'lumotlari (Login & Parol)
              </span>
              <button
                type="button"
                onClick={() => {
                  const pass = generateRandomPassword();
                  setClinicForm(prev => {
                    const slug = (prev.name || 'clinic').toLowerCase().replace(/[^a-z0-9]/g, '');
                    return {
                      ...prev,
                      director_password: pass,
                      director_email: prev.director_email || (slug ? `director.${slug}@gmail.com` : 'director.clinic@gmail.com')
                    };
                  });
                  showToast(tr('superadmin.toastPassGen'));
                }}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5" /> Parol generatsiya qilish
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={LABEL}>Kirish pochtasi (Gmail) <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  required
                  value={clinicForm.director_email}
                  onChange={e => setClinicForm({ ...clinicForm, director_email: e.target.value })}
                  placeholder={tr('superadmin.phEmail')}
                  className={INPUT}
                />
              </div>
              <div className="space-y-1">
                <label className={LABEL}>Kirish paroli <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input
                    type={showNewClinicPassword ? 'text' : 'password'}
                    required
                    value={clinicForm.director_password}
                    onChange={e => setClinicForm({ ...clinicForm, director_password: e.target.value })}
                    placeholder={tr('superadmin.phPassword')}
                    className={`${INPUT} pr-10 font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewClinicPassword(!showNewClinicPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title={showNewClinicPassword ? 'Yashirish' : 'Ko‘rsatish'}
                  >
                    {showNewClinicPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              * Ushbu Gmail va parol orqali direktor tizimga kiradi. Tizimga kirgandan so‘ng «Sozlamalar» bo‘limidan o‘zgartirib olishi mumkin.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className={LABEL}>{tr('superadmin.tariff')}</label>
              <select value={clinicForm.plan_tier} onChange={e => setClinicForm({ ...clinicForm, plan_tier: e.target.value })} className={INPUT}>
                <option>Standard</option>
                <option>Professional</option>
                <option>Enterprise</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className={LABEL}>{tr('superadmin.doctorLimit')}</label>
              <select value={clinicForm.max_doctors} onChange={e => setClinicForm({ ...clinicForm, max_doctors: Number(e.target.value) })} className={INPUT}>
                {[5, 10, 15, 25].map(n => <option key={n} value={n}>{n} ta</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className={LABEL}>{tr('superadmin.storage')}</label>
              <select value={clinicForm.storage_quota_gb} onChange={e => setClinicForm({ ...clinicForm, storage_quota_gb: Number(e.target.value) })} className={INPUT}>
                {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n} GB</option>)}
              </select>
            </div>
          </div>
          {/* Tarif imkoniyatlari: Avto-eslatma & AI Konsultant */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-3">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-600" /> Tarifga kiritiladigan aqlli funksiyalar:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 cursor-pointer hover:border-blue-400 transition">
                <input
                  type="checkbox"
                  checked={clinicForm.has_auto_reminders}
                  onChange={e => setClinicForm({ ...clinicForm, has_auto_reminders: e.target.checked })}
                  className="w-4 h-4 accent-blue-600 mt-0.5 rounded"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">{tr('superadmin.autoReminder')}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-tight">
                    SMS/Telegram eslatmalar va javobga qarab qabul statusini yangilash
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-white dark:bg-slate-900 cursor-pointer hover:border-purple-400 transition">
                <input
                  type="checkbox"
                  checked={clinicForm.has_ai_agent}
                  onChange={e => setClinicForm({ ...clinicForm, has_ai_agent: e.target.checked })}
                  className="w-4 h-4 accent-purple-600 mt-0.5 rounded"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">{tr('superadmin.aiAdmin')}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-tight">
                    Bemor bilan chatda maslahat berish va avtomatik qabulga (zapis) yozish
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Hisoblangan oylik tarif — tanlangan modullarga qarab */}
          {(() => {
            const base = clinicForm.plan_tier === 'Enterprise' ? 1800000 : clinicForm.plan_tier === 'Standard' ? 450000 : 900000;
            const remAdd = clinicForm.has_auto_reminders ? 300000 : 0;
            const aiAdd = clinicForm.has_ai_agent ? 700000 : 0;
            const total = base + remAdd + aiAdd;
            const fmt = (n: number) => n.toLocaleString('ru-RU');
            return (
              <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/20 space-y-1.5">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Hisoblangan oylik tarif
                </span>
                <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                  <span>Asosiy tarif ({clinicForm.plan_tier})</span><span className="tabular-nums">{fmt(base)} so‘m</span>
                </div>
                {clinicForm.has_auto_reminders && (
                  <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                    <span>+ Avto-eslatma moduli</span><span className="tabular-nums">{fmt(remAdd)} so‘m</span>
                  </div>
                )}
                {clinicForm.has_ai_agent && (
                  <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                    <span>+ AI Administrator moduli</span><span className="tabular-nums">{fmt(aiAdd)} so‘m</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-emerald-200 dark:border-emerald-900/60">
                  <span className="text-sm font-black text-slate-900 dark:text-white">{tr('superadmin.perMonth')}</span>
                  <span className="text-sm font-black text-emerald-700 dark:text-emerald-400 tabular-nums">{fmt(total)} so‘m</span>
                </div>
              </div>
            );
          })()}

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
            <button type="button" onClick={() => setIsNewClinicModalOpen(false)} className={BTN_GHOST}>{tr('common.cancel')}</button>
            <button type="submit" disabled={isSubmittingClinic} className={BTN_PRIMARY}>{isSubmittingClinic ? 'Ochilmoqda…' : 'Klinikani ochish'}</button>
          </div>
        </form>
        </div>
      </div>
    );
  }

  function CreatedClinicCredentialsModal() {
    if (!createdClinicCredentials) return null;
    const { clinic_name, director_name, email, password, clinic_id } = createdClinicCredentials;

    const copyFullDetails = () => {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const text = `🏥 dentOS tizimiga kirish ma'lumotlari:\n\nKlinika: ${clinic_name}\nDirektor: ${director_name}\nKirish pochtasi (Gmail): ${email}\nParol: ${password}\n\nKirish manzili: ${origin}/login\n\n* Eslatma: Tizimga kirgandan so'ng «Sozlamalar» bo'limiga o'tib, Gmail pochtangiz va parolingizni xohlagan paytda o'zgartirib olishingiz mumkin.`;
      navigator.clipboard.writeText(text);
      setCopiedCredentials(true);
      showToast(tr('superadmin.toastAllCredsCopied'));
      setTimeout(() => setCopiedCredentials(false), 2500);
    };

    const copyField = (val: string, label: string) => {
      navigator.clipboard.writeText(val);
      showToast(`${label} nusxalandi!`);
    };

    return (
      <Modal onClose={() => setCreatedClinicCredentials(null)} wide>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">{tr('superadmin.clinicCreatedCreds')}</h3>
              <p className="text-xs text-slate-400">{tr('superadmin.credsFormed')}</p>
            </div>
          </div>
          <button
            onClick={() => setCreatedClinicCredentials(null)}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
            <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
              Direktor quyidagi Gmail va parol orqali tizimga kirishi mumkin. Tizimga kirgach «Sozlamalar» bo‘limidan o‘zgartirib olishi mumkin.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Klinika:</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{clinic_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Direktor:</span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{director_name}</span>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold text-slate-500 block">Kirish pochtasi (Gmail / Login):</span>
                <span className="text-sm font-mono font-bold text-blue-600 dark:text-blue-400 select-all">{email}</span>
              </div>
              <button
                type="button"
                onClick={() => copyField(email, 'Gmail')}
                className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition"
                title={tr('superadmin.titleCopyGmail')}
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold text-slate-500 block">Kirish paroli:</span>
                <span className="text-base font-mono font-bold text-slate-900 dark:text-white tracking-wider">
                  {showCreatedPassword ? password : '••••••••'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowCreatedPassword(!showCreatedPassword)}
                  className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition"
                  title={showCreatedPassword ? 'Yashirish' : 'Ko‘rsatish'}
                >
                  {showCreatedPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => copyField(password, 'Parol')}
                  className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition"
                  title={tr('superadmin.titleCopyPass')}
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={copyFullDetails}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition shadow-sm"
          >
            {copiedCredentials ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copiedCredentials ? "Nusxa olindi! (Mijozga yuborishingiz mumkin)" : "Barcha kirish ma'lumotlarini nusxalash"}</span>
          </button>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCreatedClinicCredentials(null);
                handleEnterClinic(clinic_id);
              }}
              className={BTN_PRIMARY}
            >
              Klinika pasportiga o‘tish
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  function LinkTechModal() {
    if (!clinicDossier) return null;
    const available = technicians.filter(t => !clinicDossier.clinic.linked_technicians?.includes(t.id));
    return (
      <Modal onClose={() => setIsLinkTechModalOpen(false)}>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <h4 className="font-bold text-slate-900 dark:text-white">{tr('superadmin.connectZubTech')}</h4>
          <button onClick={() => setIsLinkTechModalOpen(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
        </div>
        <p className="mt-4 text-sm text-slate-500">«{clinicDossier.clinic.name}» klinikasiga biriktiriladigan laboratoriyani tanlang:</p>
        <select value={selectedTechIdToLink} onChange={e => setSelectedTechIdToLink(Number(e.target.value))} className={`${INPUT} mt-3`}>
          <option value="">{tr('superadmin.selectTech')}</option>
          {available.map(t => <option key={t.id} value={t.id}>{t.name} — {t.lab_name}</option>)}
        </select>
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button onClick={() => setIsLinkTechModalOpen(false)} className={BTN_GHOST}>{tr('superadmin.cancelShort')}</button>
          <button disabled={!selectedTechIdToLink} onClick={() => selectedTechIdToLink && handleToggleLinkTech(Number(selectedTechIdToLink), 'link')} className={BTN_PRIMARY}>{tr('superadmin.connect')}</button>
        </div>
      </Modal>
    );
  }

  // Direktor Gmail/parolini o'zgartirish modali — inline wrapper (input fokusdan chiqmasligi uchun)
  function DirectorCredentialsModal() {
    if (!clinicDossier) return null;
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
        <div className={`${CARD} w-full max-w-md p-6 shadow-2xl my-8 animate-in fade-in zoom-in-95 duration-150`}>
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center"><KeyRound className="w-5 h-5" /></div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Direktor kirish ma'lumotlari</h3>
                <p className="text-xs text-slate-400">«{clinicDossier.clinic.name}» direktori uchun</p>
              </div>
            </div>
            <button onClick={() => setIsCredModalOpen(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={handleSaveCreds} className="mt-5 space-y-4">
            <div className="space-y-1">
              <label className={LABEL}>Gmail (Login)</label>
              <input
                type="email"
                value={credForm.director_email}
                onChange={e => setCredForm({ ...credForm, director_email: e.target.value })}
                placeholder="director.clinic@gmail.com"
                className={INPUT}
              />
            </div>
            <div className="space-y-1">
              <label className={LABEL}>Yangi parol</label>
              <div className="relative">
                <input
                  type={showCredPassword ? 'text' : 'password'}
                  value={credForm.director_password}
                  onChange={e => setCredForm({ ...credForm, director_password: e.target.value })}
                  placeholder="Yangi parol"
                  className={`${INPUT} pr-20 font-mono`}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <button type="button" onClick={() => setCredForm({ ...credForm, director_password: generateRandomPassword() })} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40" title="Generatsiya">
                    <Sparkles className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setShowCredPassword(!showCredPassword)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    {showCredPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">Bo‘sh qoldirilgan maydon o‘zgartirilmaydi. Yangi ma'lumot bilan direktor darhol tizimga kira oladi.</p>
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button type="button" onClick={() => setIsCredModalOpen(false)} className={BTN_GHOST}>{tr('common.cancel')}</button>
              <button type="submit" disabled={isSavingCreds} className={BTN_PRIMARY}><Save className="w-4 h-4" /> {isSavingCreds ? 'Saqlanmoqda…' : 'Saqlash'}</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function TechModal() {
    return (
      <Modal onClose={() => setIsTechModalOpen(false)} wide>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center"><Wrench className="w-5 h-5" /></div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">{editingTech ? 'Texnikni tahrirlash' : 'Yangi zubnoy texnik'}</h3>
              <p className="text-xs text-slate-400">{tr('superadmin.loginAndPassword')}</p>
            </div>
          </div>
          <button onClick={() => setIsTechModalOpen(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSaveTech} className="mt-5 space-y-4">
          <div className="space-y-1">
            <label className={LABEL}>Texnik F.I.O <span className="text-red-500">*</span></label>
            <input required value={techForm.name} onChange={e => setTechForm({ ...techForm, name: e.target.value })} placeholder="Alisher Rahimov" className={INPUT} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={LABEL}>{tr('superadmin.labName')}</label>
              <input value={techForm.lab_name} onChange={e => setTechForm({ ...techForm, lab_name: e.target.value })} placeholder="Apex Dental Lab" className={INPUT} />
            </div>
            <div className="space-y-1">
              <label className={LABEL}>{tr('superadmin.phone')}</label>
              <PhoneInput value={techForm.phone} onChange={v => setTechForm({ ...techForm, phone: v })} className="w-full rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className={LABEL}>Login <span className="text-red-500">*</span></label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input required value={techForm.username} onChange={e => setTechForm({ ...techForm, username: e.target.value })} className={`${INPUT} pl-9`} />
              </div>
            </div>
            <div className="space-y-1">
              <label className={LABEL}>Parol <span className="text-red-500">*</span></label>
              <input required value={techForm.password} onChange={e => setTechForm({ ...techForm, password: e.target.value })} className={`${INPUT} font-mono`} />
            </div>
          </div>
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
            <button type="button" onClick={() => setIsTechModalOpen(false)} className={BTN_GHOST}>{tr('common.cancel')}</button>
            <button type="submit" className={BTN_PRIMARY}><Save className="w-4 h-4" /> Saqlash</button>
          </div>
        </form>
      </Modal>
    );
  }
}

export default function SuperAdminPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-400">Yuklanmoqda…</div>}>
      <SuperAdminPageContent />
    </Suspense>
  );
}
