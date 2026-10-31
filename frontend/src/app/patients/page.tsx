'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clinicApi } from '../../lib/api';
import { Patient, Appointment } from '../../lib/types';
import NewPatientModal from '../../components/NewPatientModal';
import dynamic from 'next/dynamic';
// Og'ir komponent (Three.js, DICOM, STL) — faqat kerak bo'lganda yuklanadi (tez ochilish uchun).
const KeynoteDentalPhotoProtocol = dynamic(() => import('../../components/KeynoteDentalPhotoProtocol'), {
  ssr: false,
  loading: () => (
    <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm font-semibold">Fotoprotokol yuklanmoqda…</span>
    </div>
  ),
});
import { useI18n } from '../../lib/i18n';
import { PhotoProtocolFirstPage } from '../../components/PhotoProtocolStudio';
import {
  Check,
  Search,
  UserPlus,
  Phone,
  Calendar,
  FileText,
  X,
  AlertTriangle,
  Clock,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  List,
  ChevronRight,
  Camera,
  Activity,
  Box,
  Users,
  ChevronLeft,
  Sparkles,
  ExternalLink,
  Layers,
  ArrowRight
} from 'lucide-react';

type StatusFilterType = 'all' | 'debt' | 'stale_appointments' | 'incomplete_profile' | 'good';
type TabType = 'list' | 'foto' | 'rentgen' | 'skan';

const PAGE_SIZE = 12; // 10-20 oralig'ida har bir sahifa yuklanadi

function PatientsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, language, tr, tk } = useI18n();

  // Active Tab from query param
  const activeTab = (searchParams.get('tab') as TabType) || 'list';
  const patientIdParam = searchParams.get('patientId');

  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);

  // Selected patient for viewing Photo / Rentgen / Skan
  const [selectedPatientForMedia, setSelectedPatientForMedia] = useState<Patient | null>(null);

  // Infinite Scroll state: initial 12 items, loads 12 more on scroll
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Media presence (yashil ptichka) BAZADAN — re-render uchun hisoblagich
  const [mediaPresenceTick, setMediaPresenceTick] = useState(0);

  // Load data
  useEffect(() => {
    async function fetchData() {
      const [pts, apts] = await Promise.all([
        clinicApi.getPatients(),
        clinicApi.getAppointments()
      ]);
      setPatients(pts || []);
      setAppointments(apts || []);
    }
    fetchData();
  }, []);

  // Foto/rentgen/skan tabida — har bemorda media bor-yo'qligini BAZADAN olamiz
  // (brauzerga bog'liq emas, admin ham ko'radi). Kelgach yashil ptichka chiqadi.
  useEffect(() => {
    if (activeTab === 'foto' || activeTab === 'rentgen' || activeTab === 'skan') {
      clinicApi.fetchMediaPresence().then((res) => {
        if (res) setMediaPresenceTick((n) => n + 1);
      });
    }
  }, [activeTab]);

  // Sync selected patient from URL parameter
  useEffect(() => {
    if (patientIdParam && patients.length > 0) {
      const found = patients.find((p) => String(p.id) === String(patientIdParam));
      if (found) {
        setSelectedPatientForMedia(found);
      }
    } else if (!patientIdParam) {
      setSelectedPatientForMedia(null);
    }
  }, [patientIdParam, patients]);

  // Reset pagination count on search, filter, or tab change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, statusFilter, categoryFilter, activeTab]);

  const handleCreatePatient = async (patientData: Partial<Patient>) => {
    const created = await clinicApi.createPatient(patientData);
    setPatients((prev) => [created, ...prev]);
    setIsNewPatientModalOpen(false);
  };

  // Analyze each patient for debt, stale unclosed appointments (> 1 day), and incomplete data
  const patientStats = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const aptsByPatient = new Map<number, Appointment[]>();
    appointments.forEach((apt) => {
      const list = aptsByPatient.get(apt.patient) || [];
      list.push(apt);
      aptsByPatient.set(apt.patient, list);
    });

    return patients.map((p) => {
      const pApts =
        aptsByPatient.get(p.id) ||
        appointments.filter((a) => a.patient_name.toLowerCase() === p.full_name.toLowerCase());

      // 1. Check for stale unclosed appointments (> 1 day old)
      const staleApt = pApts.find((a) => {
        const isNotClosed = a.status !== 'completed' && a.status !== 'cancelled';
        const aptTime = new Date(a.start_time).getTime();
        return isNotClosed && !isNaN(aptTime) && aptTime < oneDayAgo;
      });

      // 2. Check for debt
      const hasDebt = p.balance < 0;

      // 3. Check for incomplete profile / data
      const missingFields: string[] = [];
      const hasPhone = p.phone && p.phone.trim().replace(/[^0-9]/g, '').length >= 7;
      if (!hasPhone) {
        missingFields.push(tr('patients.phone'));
      }
      const hasBirth = p.birth_date && p.birth_date !== '—' && p.birth_date.trim().length > 0;
      if (!hasBirth) {
        missingFields.push(tr('patients.birthDate'));
      }
      const hasHistory =
        (p.medical_history && p.medical_history.trim().length > 2) ||
        (p.notes && p.notes.trim().length > 2);
      if (!hasHistory) {
        missingFields.push(tr('patients.medicalHistory'));
      }
      const isIncomplete = missingFields.length > 0;

      // 4. Good / Active
      const isGood = !hasDebt && !staleApt && !isIncomplete;

      let primaryStatus: 'debt' | 'stale' | 'incomplete' | 'good' = 'good';
      if (hasDebt) primaryStatus = 'debt';
      else if (staleApt) primaryStatus = 'stale';
      else if (isIncomplete) primaryStatus = 'incomplete';

      return {
        patient: p,
        hasDebt,
        staleApt,
        isIncomplete,
        missingFields,
        isGood,
        primaryStatus,
        totalApts: pApts.length
      };
    });
  }, [patients, appointments, language]);

  // Status counts for filters
  const counts = useMemo(() => {
    return {
      all: patientStats.length,
      debt: patientStats.filter((s) => s.hasDebt).length,
      stale: patientStats.filter((s) => !!s.staleApt).length,
      incomplete: patientStats.filter((s) => s.isIncomplete).length,
      good: patientStats.filter((s) => s.isGood).length
    };
  }, [patientStats]);

  // Filtered list based on search, category and status
  const filteredList = useMemo(() => {
    return patientStats.filter(({ patient: p, hasDebt, staleApt, isIncomplete, isGood }) => {
      if (categoryFilter !== 'All' && categoryFilter !== 'Все' && p.category_status !== categoryFilter) {
        return false;
      }
      if (statusFilter === 'debt' && !hasDebt) return false;
      if (statusFilter === 'stale_appointments' && !staleApt) return false;
      if (statusFilter === 'incomplete_profile' && !isIncomplete) return false;
      if (statusFilter === 'good' && !isGood) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = p.full_name?.toLowerCase().includes(q);
        const matchPhone = p.phone?.includes(q);
        const matchId = String(p.id).includes(q);
        const matchNotes =
          (p.notes || '').toLowerCase().includes(q) ||
          (p.medical_history || '').toLowerCase().includes(q);
        return matchName || matchPhone || matchId || matchNotes;
      }
      return true;
    });
  }, [patientStats, categoryFilter, statusFilter, search]);

  // Infinite Scroll IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < filteredList.length) {
          setIsLoadingMore(true);
          setTimeout(() => {
            setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredList.length));
            setIsLoadingMore(false);
          }, 250);
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, filteredList.length, viewMode, activeTab]);

  // Handle Tab Switch
  const switchTab = (newTab: TabType) => {
    setSelectedPatientForMedia(null);
    if (newTab === 'list') {
      router.push('/patients');
    } else {
      router.push(`/patients?tab=${newTab}`);
    }
  };

  // Handle Click on Patient Card
  const handleCardClick = (p: Patient) => {
    if (activeTab === 'foto' || activeTab === 'rentgen' || activeTab === 'skan') {
      setSelectedPatientForMedia(p);
      router.push(`/patients?tab=${activeTab}&patientId=${p.id}`);
    } else {
      router.push(`/patients/${p.id}`);
    }
  };

  // If a patient is selected for viewing (Word photo / 3D CBCT / 3D STL)
  if (selectedPatientForMedia) {
    return (
      <div className="space-y-6 text-slate-900 dark:text-white transition-colors pb-12">
        <KeynoteDentalPhotoProtocol
          patient={selectedPatientForMedia}
          initialTab={activeTab === 'rentgen' ? 'rentgen' : activeTab === 'skan' ? 'skan' : 'foto'}
          allPatients={patients}
          onBack={() => {
            setSelectedPatientForMedia(null);
            router.push(activeTab === 'list' ? '/patients' : `/patients?tab=${activeTab}`);
          }}
          onPatientChange={(newId) => {
            const found = patients.find((p) => p.id === newId);
            if (found) setSelectedPatientForMedia(found);
            router.push(`/patients?tab=${activeTab}&patientId=${newId}`);
          }}
        />
      </div>
    );
  }

  // Currently visible items for infinite scroll
  const displayedPatients = filteredList.slice(0, visibleCount);

  // Infinite-scroll sentinel — ham card, ham jadval ko'rinishida ishlatiladi (bitta ref).
  const loadMoreSentinel = (
    <div ref={sentinelRef} className="py-8 flex flex-col items-center justify-center space-y-3">
      {visibleCount < filteredList.length ? (
        <div className="flex flex-col items-center space-y-2">
          <div className="flex items-center space-x-2 text-xs font-bold text-blue-600 dark:text-sky-400">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>{tk('pt_loading_more')} ({displayedPatients.length} / {filteredList.length})</span>
          </div>
          <button
            onClick={() => setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredList.length))}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
          >
            {tk('pt_show_more')}
          </button>
        </div>
      ) : (
        <div className="text-center text-xs font-medium text-slate-400 py-2">
          {tk('pt_all_loaded').replace('{n}', String(filteredList.length))}
        </div>
      )}
    </div>
  );

  // Status Filter tabs for 'list' mode
  const filterTabs = [
    {
      id: 'all' as StatusFilterType,
      labelKey: 'pt_tab_all',
      color: 'bg-slate-400',
      activeClass: 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm',
      count: counts.all
    },
    {
      id: 'debt' as StatusFilterType,
      labelKey: 'pt_tab_debt',
      color: 'bg-rose-500',
      activeClass: 'bg-rose-600 text-white shadow-sm shadow-rose-500/25',
      count: counts.debt
    },
    {
      id: 'stale_appointments' as StatusFilterType,
      labelKey: 'pt_tab_stale',
      color: 'bg-amber-500',
      activeClass: 'bg-amber-600 text-white shadow-sm shadow-amber-500/25',
      count: counts.stale
    },
    {
      id: 'incomplete_profile' as StatusFilterType,
      labelKey: 'pt_tab_incomplete',
      color: 'bg-purple-500',
      activeClass: 'bg-purple-600 text-white shadow-sm shadow-purple-500/25',
      count: counts.incomplete
    },
    {
      id: 'good' as StatusFilterType,
      labelKey: 'pt_tab_good',
      color: 'bg-emerald-500',
      activeClass: 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/25',
      count: counts.good
    }
  ];

  return (
    <div className="space-y-6 text-slate-900 dark:text-white transition-colors pb-12">
      {/* ───────────────────────────────────────────────────────── */}
      {/* 1. HEADER & ACTION CONTROLS (Title, Mode, View Toggle, + Yangi bemor) */}
      {/* ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
              {activeTab === 'foto' ? (
                <>
                  <Camera className="w-7 h-7 text-indigo-600" />
                  <span>{tk('pt_foto_title')}</span>
                </>
              ) : activeTab === 'rentgen' ? (
                <>
                  <Activity className="w-7 h-7 text-emerald-600" />
                  <span>{tk('pt_rentgen_title')}</span>
                </>
              ) : activeTab === 'skan' ? (
                <>
                  <Box className="w-7 h-7 text-violet-600" />
                  <span>{tk('pt_skan_title')}</span>
                </>
              ) : (
                <>
                  <Users className="w-7 h-7 text-blue-600" />
                  <span>{t.patients}</span>
                </>
              )}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
              {filteredList.length} {tk('pt_cnt_patients')}
            </span>
            {activeTab !== 'list' && (() => {
              const totals = clinicApi.getMediaTotals();
              const n = totals ? (activeTab === 'foto' ? totals.foto : activeTab === 'rentgen' ? totals.rentgen : totals.skan) : 0;
              return (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 inline-flex items-center gap-1" title={tk('pt_media_has')}>
                  <Check className="w-3 h-3" strokeWidth={4} />
                  {n}
                </span>
              );
            })()}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
            {activeTab === 'foto'
              ? tk('pt_foto_sub')
              : activeTab === 'rentgen'
              ? tk('pt_rentgen_sub')
              : activeTab === 'skan'
              ? tk('pt_skan_sub')
              : tk('pt_list_sub')}
          </p>
        </div>

        {/* Top Right Controls: Table/Cards toggle (in list mode) & New Patient Button */}
        <div className="flex items-center gap-2.5">
          {activeTab === 'list' && (
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title={tk('pt_view_table')}
              >
                <List className="w-4 h-4" />
                <span className="text-[11px] font-bold hidden sm:inline">{tk('pt_view_table')}</span>
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title={tk('pt_view_cards')}
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="text-[11px] font-bold hidden sm:inline">{tk('pt_view_cards')}</span>
              </button>
            </div>
          )}

          <button
            onClick={() => setIsNewPatientModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/20 active:scale-95 shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ {t.addPatient}</span>
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────── */}
      {/* 3. SEARCH BAR & FILTERS                                   */}
      {/* ───────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        {/* Search Bar Input */}
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tk('pt_search_ph')}
            className="w-full pl-11 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status Filters if in 'list' mode */}
        {activeTab === 'list' && (
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-1">
              {tk('pt_by_status')}
            </span>
            {filterTabs.map((tab) => {
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    isActive
                      ? tab.activeClass
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${tab.color}`} />
                  <span>{tk(tab.labelKey)}</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${isActive ? 'bg-black/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────── */}
      {/* 4. PATIENT CARDS GALLERY (Cards View with Infinite Scroll) */}
      {/* ───────────────────────────────────────────────────────── */}
      {viewMode === 'cards' || activeTab !== 'list' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayedPatients.map(({ patient: p, hasDebt, staleApt, isIncomplete, missingFields, primaryStatus }) => {
              const nameParts = p.full_name?.trim().split(' ').filter(Boolean) || [];
              const initials =
                nameParts.length >= 2
                  ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
                  : (nameParts[0]?.slice(0, 2) || 'BM').toUpperCase();

              // Foto/rentgen/skan tabларида: shu bemorda media bor-yo'qligi (rangli nuqta uchun)
              const media = activeTab !== 'list' ? clinicApi.getPatientMediaPresence(p.id) : null;
              const hasThisMedia = activeTab === 'foto' ? media?.foto : activeTab === 'rentgen' ? media?.rentgen : activeTab === 'skan' ? media?.skan : false;

              return (
                <div
                  key={p.id}
                  onClick={() => handleCardClick(p)}
                  className="cursor-pointer rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1E293B] p-5 shadow-xs hover:shadow-xl hover:border-blue-400 dark:hover:border-blue-500 transition-all duration-200 flex flex-col justify-between relative overflow-hidden group hover:-translate-y-1 select-none"
                >
                  {/* Top card row: Avatar, Name, Card # */}
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Foto tabида avatar KO'RSATILMAYDI — ism bir qatorda, rasm ko'proq joy oladi */}
                        {activeTab !== 'foto' && (
                        <div
                          className={`w-11 h-11 rounded-2xl font-black text-xs flex items-center justify-center shrink-0 shadow-md ${
                            activeTab === 'rentgen'
                              ? 'bg-gradient-to-tr from-emerald-600 to-teal-400 text-white'
                              : activeTab === 'skan'
                              ? 'bg-gradient-to-tr from-violet-600 to-indigo-400 text-white'
                              : primaryStatus === 'debt'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-gradient-to-tr from-blue-600 to-sky-400 text-white'
                          }`}
                        >
                          {initials}
                        </div>
                        )}
                        <div className="min-w-0">
                          {/* Ism + karta raqami — bir qatorda */}
                          <div className="flex items-center gap-1.5 min-w-0">
                            <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-sky-400 transition">
                              {p.full_name}
                            </h4>
                            <span className="text-[11px] font-mono text-slate-400 shrink-0">#{p.id}</span>
                          </div>
                        </div>
                      </div>

                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                        {p.category_status || 'Oddiy'}
                      </span>
                    </div>

                    {/* Foto tabида: foto-protokol BIRINCHI SAHIFASI (matn+rasm) — IndexedDB/localStorage'dan
                        o'zi yuklaydi va mazmun bo'lsagina ko'rsatadi (studioda kiritilgandan keyin ham ko'rinadi) */}
                    {activeTab === 'foto' && <PhotoProtocolFirstPage patientId={p.id} />}

                    {/* Middle Info: Phone & Mode-specific badge */}
                    <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                      {activeTab !== 'foto' && (
                      <div className="flex items-center space-x-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{p.phone || tk('pt_no_phone')}</span>
                      </div>
                      )}

                      {/* MODE SPECIFIC BADGES */}
                      {activeTab === 'foto' && (
                        <div className="flex items-center justify-between text-[10px]">
                          <div className="flex items-center space-x-1 text-indigo-600 dark:text-indigo-300 font-bold">
                            <Camera className="w-3 h-3 text-indigo-500 shrink-0" />
                            <span>{tk('pt_badge_foto')}</span>
                          </div>
                          <span className="flex items-center gap-1">
                            <span title={hasThisMedia ? tk('pt_media_has') : tk('pt_media_none')} className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-white dark:ring-slate-900 ${hasThisMedia ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>{hasThisMedia && <Check className="w-2 h-2 text-white" strokeWidth={4} />}</span>
                            <span className="text-[9px] text-indigo-500 font-bold">{tk('pt_open_arrow')}</span>
                          </span>
                        </div>
                      )}

                      {activeTab === 'rentgen' && (
                        <div className="p-2 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60 flex items-center justify-between text-[11px]">
                          <div className="flex items-center space-x-1.5 text-emerald-700 dark:text-emerald-300 font-semibold">
                            <Activity className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>{tk('pt_rentgen_short')}</span>
                          </div>
                          <span className="flex items-center gap-1.5">
                            <span title={hasThisMedia ? tk('pt_media_has') : tk('pt_media_none')} className={`inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0 ring-2 ring-white dark:ring-slate-900 shadow-sm ${hasThisMedia ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>{hasThisMedia && <Check className="w-2.5 h-2.5 text-white" strokeWidth={4} />}</span>
                            <span className="text-[10px] text-emerald-600 font-bold">{tk('pt_analyze_arrow')}</span>
                          </span>
                        </div>
                      )}

                      {activeTab === 'skan' && (
                        <div className="p-2 rounded-xl bg-violet-50/80 dark:bg-violet-950/40 border border-violet-100 dark:border-violet-900/60 flex items-center justify-between text-[11px]">
                          <div className="flex items-center space-x-1.5 text-violet-700 dark:text-violet-300 font-semibold">
                            <Box className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                            <span>{tk('pt_scanner')}</span>
                          </div>
                          <span className="flex items-center gap-1.5">
                            <span title={hasThisMedia ? tk('pt_media_has') : tk('pt_media_none')} className={`inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0 ring-2 ring-white dark:ring-slate-900 shadow-sm ${hasThisMedia ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>{hasThisMedia && <Check className="w-2.5 h-2.5 text-white" strokeWidth={4} />}</span>
                            <span className="text-[10px] text-violet-600 font-bold">3D →</span>
                          </span>
                        </div>
                      )}

                      {activeTab === 'list' && (
                        <div className="flex items-center justify-between text-[11px] pt-1">
                          <span className="text-slate-400">{tk('pt_balance_label')}</span>
                          <span
                            className={`font-bold font-mono ${
                              p.balance < 0
                                ? 'text-rose-600 dark:text-rose-400'
                                : p.balance > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {p.balance < 0
                              ? `-${Math.abs(p.balance).toLocaleString()} UZS`
                              : p.balance > 0
                              ? `+${p.balance.toLocaleString()} UZS`
                              : '0 UZS'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Bottom Button */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-400">
                      {activeTab === 'foto'
                        ? tk('pt_card_foto')
                        : activeTab === 'rentgen'
                        ? tk('pt_card_rentgen')
                        : activeTab === 'skan'
                        ? tk('pt_scanner')
                        : tk('pt_card_profile')}
                    </span>

                    <span className="inline-flex items-center space-x-1 font-bold text-blue-600 dark:text-sky-400 group-hover:translate-x-1 transition-transform">
                      <span>{activeTab === 'list' ? tk('pt_open_chart') : tk('pt_open')}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Infinite scroll sentinel (card ko'rinishi) */}
          {loadMoreSentinel}
        </div>
      ) : (
        /* ───────────────────────────────────────────────────────── */
        /* 6. TABLE VIEW (In 'list' mode if table is selected)       */
        /* ───────────────────────────────────────────────────────── */
        <>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 w-12 text-center">{tk('pt_col_status')}</th>
                  <th className="py-3 px-4">{tk('pt_col_patient')}</th>
                  <th className="py-3 px-4">{tk('pt_col_phone')}</th>
                  <th className="py-3 px-4">{tk('pt_col_category')}</th>
                  <th className="py-3 px-4">{tk('pt_col_visits')}</th>
                  <th className="py-3 px-4">{tk('pt_col_balance')}</th>
                  <th className="py-3 px-4">{tk('pt_col_anamnez')}</th>
                  <th className="py-3 px-4 text-right">{tk('pt_col_action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {displayedPatients.map(({ patient: p, hasDebt, staleApt, isIncomplete, missingFields, primaryStatus, totalApts }) => (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/patients/${p.id}`)}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full ${
                          primaryStatus === 'debt'
                            ? 'bg-rose-500 ring-4 ring-rose-500/20'
                            : primaryStatus === 'stale'
                            ? 'bg-amber-500 ring-4 ring-amber-500/20'
                            : primaryStatus === 'incomplete'
                            ? 'bg-purple-500 ring-4 ring-purple-500/20'
                            : 'bg-emerald-500'
                        }`}
                      />
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-sky-400 transition">
                        {p.full_name}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 block">#{p.id}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                      {p.phone || '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                        {p.category_status || 'Oddiy'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      {totalApts} {tk('pt_cnt_visits')}
                    </td>
                    <td className="py-3.5 px-4">
                      {/* Qarz/balans — rangli nuqta; ustiga kelganda (hover) summa chiqadi */}
                      {(() => {
                        const amountText = p.balance < 0
                          ? `${tk('pt_debt_label')}${Math.abs(p.balance).toLocaleString()} UZS`
                          : p.balance > 0
                          ? `+${p.balance.toLocaleString()} UZS`
                          : '0 UZS';
                        const dotCls = p.balance < 0
                          ? 'bg-rose-500 ring-4 ring-rose-500/20'
                          : p.balance > 0
                          ? 'bg-emerald-500 ring-4 ring-emerald-500/20'
                          : 'bg-slate-300 dark:bg-slate-600';
                        const txtCls = p.balance < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : p.balance > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-500';
                        return (
                          <div className="relative inline-flex items-center group/bal" title={amountText}>
                            <span className={`inline-block w-3 h-3 rounded-full ${dotCls}`} />
                            <div className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 z-20 hidden group-hover/bal:block whitespace-nowrap px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-lg border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                              <span className={txtCls}>{amountText}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 truncate max-w-xs">
                      {p.medical_history || p.notes || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/patients/${p.id}`);
                        }}
                        className="px-3 py-1 bg-slate-100 dark:bg-slate-800 group-hover:bg-blue-600 group-hover:text-white rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 transition"
                      >
                        {tk('pt_chart')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Infinite scroll sentinel (jadval ko'rinishi) */}
        {loadMoreSentinel}
        </>
      )}

      {/* New Patient Modal */}
      <NewPatientModal
        isOpen={isNewPatientModalOpen}
        onClose={() => setIsNewPatientModalOpen(false)}
        onSave={handleCreatePatient}
      />
    </div>
  );
}

export default function PatientsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Yuklanmoqda...</div>}>
      <PatientsContent />
    </Suspense>
  );
}
