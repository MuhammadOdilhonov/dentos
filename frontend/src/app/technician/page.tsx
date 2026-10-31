'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { clinicApi } from '../../lib/api';
import { DentalTechnician, DentalLabOrder, ClinicTenant, TechnicianPriceItem } from '../../lib/types';
import LabOrderFullModal, { LAB_STATUS_CHAIN, getStatusBadge } from '../../components/LabOrderFullModal';
import {
  Wrench,
  Calendar,
  Building2,
  Plus,
  Edit3,
  Trash2,
  Search,
  Check,
  CheckCheck,
  Save,
  X,
  CalendarDays,
  FileSpreadsheet,
  Tag,
  ArrowDownLeft,
  ArrowUpRight,
  Printer,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  Table as TableIcon,
  LayoutGrid,
  Stethoscope,
  User,
  ShieldCheck,
  Sparkles,
  DollarSign,
  QrCode,
  Palette,
  Boxes,
  HardDrive,
  FileArchive
} from 'lucide-react';
import dynamic from 'next/dynamic';
// Three.js/DICOM og'ir — faqat tegishli ko'ruvchi modal ochilganda yuklanadi (#5).
const Dental3DScanViewerModal = dynamic(() => import('../../components/Dental3DScanViewerModal'), { ssr: false });
const DentalRentgenViewerModal = dynamic(() => import('../../components/DentalRentgenViewerModal'), { ssr: false });

const CARD = 'bg-white dark:bg-[#0b1322] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm';
const INPUT =
  'w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition';
const LABEL = 'text-xs font-semibold text-slate-600 dark:text-slate-300';
const BTN_AMBER =
  'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold shadow-sm shadow-amber-500/20 transition active:scale-[0.98] disabled:opacity-50';
const BTN_GHOST =
  'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition';

const STANDARD_TECHNICIAN_SERVICES: TechnicianPriceItem[] = [
  { id: 'std-1', nameUz: 'Sirkoniya qoplama (Prettau Multi-layer)', nameRu: 'Диоксид циркония (Prettau Multi-layer)', nameEn: 'Zirconia crown (Prettau Multi-layer)', name: 'Sirkoniya qoplama', category: 'Цирконий', price: 350000, lead_days: 3, material: 'Zirconia Katana HT' },
  { id: 'std-2', nameUz: 'E-max Press vinir / qoplama', nameRu: 'E-max Press винир / коронка', nameEn: 'E-max Press veneer / crown', name: 'E-max Press vinir', category: 'Эстетика', price: 450000, lead_days: 4, material: 'IPS e.max Press LT' },
  { id: 'std-3', nameUz: 'Metall-keramika qoplama (Ivoclar)', nameRu: 'Металлокерамическая коронка (Ivoclar)', nameEn: 'Metal-ceramic crown (Ivoclar)', name: 'Metall-keramika qoplama', category: 'Металлокерамика', price: 250000, lead_days: 2, material: 'Ivoclar IPS Classic' },
  { id: 'std-4', nameUz: 'Implant individual abutmenti CAD/CAM', nameRu: 'Индивидуальный абатмент CAD/CAM', nameEn: 'Custom implant abutment CAD/CAM', name: 'Implant abutmenti', category: 'Имплантология', price: 350000, lead_days: 2, material: 'Titanium Grade 5' },
  { id: 'std-5', nameUz: 'PMMA vaqtinchalik qoplama', nameRu: 'Временная коронка PMMA', nameEn: 'PMMA temporary crown', name: 'PMMA vaqtinchalik', category: 'Временные', price: 120000, lead_days: 1, material: 'PMMA Multi' },
  { id: 'std-6', nameUz: 'Wax-Up diagnostik modellashtirish', nameRu: 'Диагностическое моделирование Wax-Up', nameEn: 'Diagnostic Wax-Up', name: 'Wax-Up diagnostika', category: 'Диагностика', price: 90000, lead_days: 2, material: 'Dental Wax Yeti' },
  { id: 'std-7', nameUz: 'Byugel protez (Qulflar bilan)', nameRu: 'Бюгельный протез (на замках)', nameEn: 'Clasp / attachment partial denture', name: 'Byugel protez', category: 'Съемные', price: 1500000, lead_days: 5, material: 'Bredent Cast Alloy' },
  { id: 'std-8', nameUz: 'Individual lozhka', nameRu: 'Индивидуальная ложка', nameEn: 'Custom impression tray', name: 'Individual lozhka', category: 'Вспомогательные', price: 90000, lead_days: 1, material: 'Light-cure Tray Resin' },
  { id: 'std-9', nameUz: 'Registrator prikusa (Mumli valik)', nameRu: 'Регистратор прикуса (восковой валик)', nameEn: 'Bite registration rim', name: 'Registrator prikusa', category: 'Вспомогательные', price: 80000, lead_days: 1, material: 'Wax Rim Baseplate' }
];

const uzNumber = (n: number) => (n || 0).toLocaleString('ru-RU');

function TechnicianPortalPageContent() {
  const { user } = useAuth();
  const { language, tr, tk } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Multi-language helper: strict zero Russian when language is uz or en

  const DAYS_OF_WEEK = [
    { key: 'dush', index: 1, nameUz: 'Dushanba', nameRu: 'Понедельник', nameEn: 'Monday', shortUz: 'Dush', shortRu: 'Пн', shortEn: 'Mon' },
    { key: 'sesh', index: 2, nameUz: 'Seshanba', nameRu: 'Вторник', nameEn: 'Tuesday', shortUz: 'Sesh', shortRu: 'Вт', shortEn: 'Tue' },
    { key: 'chorsh', index: 3, nameUz: 'Chorshanba', nameRu: 'Среда', nameEn: 'Wednesday', shortUz: 'Chor', shortRu: 'Ср', shortEn: 'Wed' },
    { key: 'pash', index: 4, nameUz: 'Payshanba', nameRu: 'Четверг', nameEn: 'Thursday', shortUz: 'Pash', shortRu: 'Чт', shortEn: 'Thu' },
    { key: 'juma', index: 5, nameUz: 'Juma', nameRu: 'Пятница', nameEn: 'Friday', shortUz: 'Juma', shortRu: 'Пт', shortEn: 'Fri' },
    { key: 'shanba', index: 6, nameUz: 'Shanba', nameRu: 'Суббота', nameEn: 'Saturday', shortUz: 'Shan', shortRu: 'Сб', shortEn: 'Sat' },
    { key: 'yaksh', index: 0, nameUz: 'Yakshanba', nameRu: 'Воскресенье', nameEn: 'Sunday', shortUz: 'Yak', shortRu: 'Вс', shortEn: 'Sun' }
  ];

  const [currentTech, setCurrentTech] = useState<DentalTechnician | null>(null);
  const [labOrders, setLabOrders] = useState<DentalLabOrder[]>([]);
  const [clinics, setClinics] = useState<ClinicTenant[]>([]);
  const [loading, setLoading] = useState(true);

  // Tabs: calendar (haftalik taqvim) | orders (barcha naryadlar) | prices | clinics
  const [activeTab, setActiveTab] = useState<'calendar' | 'orders' | 'prices' | 'clinics'>('calendar');

  useEffect(() => {
    const tabParam = searchParams.get('tab') as typeof activeTab | null;
    if (tabParam && ['calendar', 'orders', 'prices', 'clinics'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Auto-open order scanned via QR code or URL link (?order=LAB-8492)
  useEffect(() => {
    const orderParam = searchParams.get('order');
    if (orderParam && labOrders.length) {
      const cleanParam = decodeURIComponent(orderParam).trim().toLowerCase();
      const match = labOrders.find(
        o => (o.order_number && o.order_number.toLowerCase() === cleanParam) ||
             String(o.id) === cleanParam ||
             `lab-${o.id}`.toLowerCase() === cleanParam
      );
      if (match) {
        setSelectedOrder(match);
        setIsFullModalOpen(true);
      }
    }
  }, [searchParams, labOrders]);

  // Calendar & Filter states:
  const [scheduleMode, setScheduleMode] = useState<'keladi' | 'ketadi' | 'biriktirilgan' | 'barchasi'>('keladi');
  const [periodFilter, setPeriodFilter] = useState<'day' | '3days' | 'week'>('week');
  const [calendarViewMode, setCalendarViewMode] = useState<'week' | 'table'>('week');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClinicFilter, setSelectedClinicFilter] = useState('all');

  // Technician role & switching states
  const [allTechs, setAllTechs] = useState<DentalTechnician[]>([]);
  const [selectedTechFilter, setSelectedTechFilter] = useState<'all' | number | string>('all');

  // Brand Customization Modal
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [brandColor, setBrandColor] = useState('from-amber-500 to-orange-600');
  const [brandAvatar, setBrandAvatar] = useState('');

  // 3D Scan & Rentgen view modal states
  const [is3DScanViewerOpen, setIs3DScanViewerOpen] = useState(false);
  const [selectedScanOrder, setSelectedScanOrder] = useState<DentalLabOrder | null>(null);
  const [isRentgenViewerOpen, setIsRentgenViewerOpen] = useState(false);
  const [selectedRentgenOrder, setSelectedRentgenOrder] = useState<DentalLabOrder | null>(null);

  // Modal states
  const [selectedOrder, setSelectedOrder] = useState<DentalLabOrder | null>(null);
  const [isFullModalOpen, setIsFullModalOpen] = useState(false);

  // Price list edit state: 3 LANGUAGES
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceForm, setPriceForm] = useState({
    nameUz: '',
    nameRu: '',
    nameEn: '',
    name: '',
    category: 'Цирконий',
    price: 350000,
    lead_days: 3,
    material: 'Zirconia Katana HT'
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [techs, orders, clns] = await Promise.all([
        clinicApi.getTechnicians(),
        clinicApi.getLabOrders(),
        clinicApi.getClinics()
      ]);

      setClinics(clns);
      setLabOrders(orders);
      setAllTechs(techs);

      // Find tech matching current user or technician role
      let matched = techs.find(t => t.username === user?.username || t.name === user?.name);
      if (!matched && techs.length > 0) matched = techs[0];
      if (matched) {
        if (!matched.price_list || matched.price_list.length === 0) {
          matched.price_list = STANDARD_TECHNICIAN_SERVICES;
        }
        setCurrentTech(matched);
        setBrandColor(matched.color || 'from-amber-500 to-orange-600');
        setBrandAvatar(matched.avatar || '');
      }
    } catch (e) {
      console.error('Yuklashda xatolik:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Timezone-safe local date formatter YYYY-MM-DD
  const formatLocalDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Start of current week (Monday)
  const weekDates = useMemo(() => {
    const curr = new Date(currentDate);
    const day = curr.getDay(); // 0 is Sun, 1 is Mon
    const diffToMon = (day === 0 ? -6 : 1) - day;
    const monday = new Date(curr);
    monday.setDate(curr.getDate() + diffToMon);

    const todayStr = formatLocalDate(new Date());

    return DAYS_OF_WEEK.map((dDef, idx) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + idx);
      const dateStr = formatLocalDate(date);
      const isToday = dateStr === todayStr;
      const short = language === 'ru' ? dDef.shortRu : language === 'en' ? dDef.shortEn : dDef.shortUz;
      return {
        ...dDef,
        date,
        dateStr,
        isToday,
        short,
        formatted: date.toLocaleDateString(language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ', { day: 'numeric', month: 'short' })
      };
    });
  }, [currentDate, language]);

  const shiftWeek = (deltaWeeks: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + deltaWeeks * 7);
    setCurrentDate(d);
  };

  // Helper date for an order based on mode:
  // Keladi: primerka / arrival date
  // Ketadi: statusga qaramaydi, topshirish vaqtiga (zdacha_date / due_date) qaraydi!
  const getRelevantOrderDate = (o: DentalLabOrder, mode: 'keladi' | 'ketadi' | 'biriktirilgan' | 'barchasi') => {
    if (mode === 'ketadi') {
      return o.zdacha_date || o.due_date || (o.created_at ? o.created_at.split('T')[0] : '');
    }
    if (mode === 'keladi') {
      return o.primerka_date || o.received_date || (o.created_at ? o.created_at.split('T')[0] : '');
    }
    return o.zdacha_date || o.due_date || o.primerka_date || o.received_date || (o.created_at ? o.created_at.split('T')[0] : '');
  };

  // Date range calculator for Kunlik / 3 kunlik / Haftalik
  const periodDateRange = useMemo(() => {
    const start = new Date(currentDate);
    const startStr = formatLocalDate(start);

    if (periodFilter === 'day') {
      return {
        startDateStr: startStr,
        endDateStr: startStr,
        isWithin: (d: string) => d === startStr
      };
    }
    if (periodFilter === '3days') {
      const end = new Date(start);
      end.setDate(start.getDate() + 2);
      const endStr = formatLocalDate(end);
      return {
        startDateStr: startStr,
        endDateStr: endStr,
        isWithin: (d: string) => d >= startStr && d <= endStr
      };
    }
    // week
    const day = start.getDay();
    const diffToMon = (day === 0 ? -6 : 1) - day;
    const monday = new Date(start);
    monday.setDate(start.getDate() + diffToMon);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const monStr = formatLocalDate(monday);
    const sunStr = formatLocalDate(sunday);
    return {
      startDateStr: monStr,
      endDateStr: sunStr,
      isWithin: (d: string) => d >= monStr && d <= sunStr
    };
  }, [currentDate, periodFilter]);

  // Three days list for 3-day view mode
  const threeDaysList = useMemo(() => {
    const res = [];
    const todayStr = formatLocalDate(new Date());
    for (let i = 0; i < 3; i++) {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + i);
      const dateStr = formatLocalDate(d);
      const isToday = dateStr === todayStr;
      const dIndex = d.getDay();
      const dDef = DAYS_OF_WEEK.find(x => x.index === dIndex) || DAYS_OF_WEEK[0];
      const short = language === 'ru' ? dDef.shortRu : language === 'en' ? dDef.shortEn : dDef.shortUz;
      res.push({
        ...dDef,
        date: d,
        dateStr,
        isToday,
        short,
        formatted: d.toLocaleDateString(language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ', { day: 'numeric', month: 'short' })
      });
    }
    return res;
  }, [currentDate, language]);

  // ════════ TECHNICIAN ISOLATION & FILTERED ORDERS ════════
  // When a technician logs in (e.g. Alisher), they ONLY see their own orders!
  // Dilshod's and Farhod's orders are never leaked to them.
  // When director or admin logs in, they can view all or switch technicians.
  const baseVisibleOrders = useMemo(() => {
    return labOrders.filter(o => {
      // 1. Role / Technician isolation:
      if (user?.role === 'technician') {
        if (currentTech) {
          const matchId = o.technician === currentTech.id;
          const matchName = o.technician_name && currentTech.name && o.technician_name.toLowerCase().includes(currentTech.name.toLowerCase());
          if (!matchId && !matchName) return false;
        }
      } else if (selectedTechFilter !== 'all') {
        const matchId = String(o.technician) === String(selectedTechFilter);
        const matchName = o.technician_name && o.technician_name.toLowerCase() === String(selectedTechFilter).toLowerCase();
        if (!matchId && !matchName) return false;
      }

      // 2. Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          (o.patient_name || '').toLowerCase().includes(q) ||
          (o.doctor_name || '').toLowerCase().includes(q) ||
          (o.work_type || '').toLowerCase().includes(q) ||
          (o.order_number && o.order_number.toLowerCase().includes(q)) ||
          (o.tooth_numbers || '').includes(q);
        if (!matches) return false;
      }

      // 3. Clinic filter
      if (selectedClinicFilter !== 'all') {
        if (o.clinic_name !== selectedClinicFilter) return false;
      }

      return true;
    });
  }, [labOrders, searchQuery, selectedClinicFilter, user, currentTech, selectedTechFilter]);

  // Keladi: biriktirildi, chiqarilvoti, texnik oldi (Dinamik davr bo'yicha hisoblangan!)
  const keladiOrders = useMemo(() => {
    return baseVisibleOrders.filter(o => {
      if (o.status !== 'biriktirildi' && o.status !== 'chiqarilvoti' && o.status !== 'texnik oldi') return false;
      const targetDate = getRelevantOrderDate(o, 'keladi');
      return periodDateRange.isWithin(targetDate);
    });
  }, [baseVisibleOrders, periodDateRange]);

  // Ketadi: topshirish vaqtiga qaraydi (zdacha_date / due_date) (Dinamik davr bo'yicha hisoblangan!)
  const ketadiOrders = useMemo(() => {
    return baseVisibleOrders.filter(o => {
      const targetDate = o.zdacha_date || o.due_date;
      if (!targetDate) return false;
      return periodDateRange.isWithin(targetDate);
    });
  }, [baseVisibleOrders, periodDateRange]);

  // Chiqarilmagan ishlar (Biriktirilgan): status === 'biriktirildi'
  const biriktirilganOrders = useMemo(() => {
    return baseVisibleOrders.filter(o => o.status === 'biriktirildi');
  }, [baseVisibleOrders]);

  const handleCardClick = (order: DentalLabOrder) => {
    setSelectedOrder(order);
    setIsFullModalOpen(true);
  };

  const handleOrderSaved = (updated: DentalLabOrder) => {
    setLabOrders(prev => {
      const idx = prev.findIndex(o => o.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [updated, ...prev];
    });
  };

  // Helper for displaying localized service name
  const getLocalizedServiceName = (item: TechnicianPriceItem) => {
    if (language === 'uz') return item.nameUz || item.name;
    if (language === 'en') return item.nameEn || item.nameUz || item.name;
    return item.nameRu || item.name;
  };

  // Price items management: 3 LANGUAGES
  const handleOpenPriceModal = (item?: TechnicianPriceItem) => {
    if (item) {
      setEditingPriceId(item.id);
      setPriceForm({
        nameUz: item.nameUz || item.name,
        nameRu: item.nameRu || item.name,
        nameEn: item.nameEn || item.name,
        name: item.name,
        category: item.category || 'Цирконий',
        price: item.price || 350000,
        lead_days: item.lead_days || 3,
        material: item.material || 'Zirconia Katana HT'
      });
    } else {
      setEditingPriceId(null);
      setPriceForm({
        nameUz: '',
        nameRu: '',
        nameEn: '',
        name: '',
        category: 'Цирконий',
        price: 350000,
        lead_days: 3,
        material: 'Zirconia Katana HT'
      });
    }
    setIsPriceModalOpen(true);
  };

  const handleSavePriceItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTech || (!priceForm.nameUz.trim() && !priceForm.nameRu.trim() && !priceForm.nameEn.trim())) return;
    
    const finalName = priceForm.nameUz.trim() || priceForm.nameRu.trim() || priceForm.nameEn.trim() || priceForm.name;
    const itemToSave: TechnicianPriceItem = {
      id: editingPriceId || `p-${Date.now()}`,
      name: finalName,
      nameUz: priceForm.nameUz.trim() || finalName,
      nameRu: priceForm.nameRu.trim() || finalName,
      nameEn: priceForm.nameEn.trim() || finalName,
      category: priceForm.category,
      price: priceForm.price,
      lead_days: priceForm.lead_days,
      material: priceForm.material
    };

    let list = [...(currentTech.price_list || [])];
    if (editingPriceId) {
      list = list.map(i => (i.id === editingPriceId ? itemToSave : i));
    } else {
      list.push(itemToSave);
    }
    const updated = await clinicApi.updateTechnicianPriceList(currentTech.id, list);
    if (updated) {
      setCurrentTech({ ...currentTech, price_list: list });
    }
    setIsPriceModalOpen(false);
  };

  const handleDeletePriceItem = async (id: string) => {
    if (!currentTech) return;
    if (!confirm(tr('technician.deleteThisPriceItem'))) return;
    const list = (currentTech.price_list || []).filter(i => i.id !== id);
    const updated = await clinicApi.updateTechnicianPriceList(currentTech.id, list);
    if (updated) {
      setCurrentTech({ ...currentTech, price_list: list });
    }
  };

  return (
    <div className="p-3 sm:p-5 lg:p-6 w-full space-y-5">
      {/* If Director/Admin: Technician Switcher */}
      {user?.role !== 'technician' && allTechs.length > 0 && (
        <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-x-auto text-xs font-bold border border-slate-200 dark:border-slate-700">
          <span className="text-[11px] text-slate-500 px-2 shrink-0">
            {tr('technician.technicians')}
          </span>
          <button
            type="button"
            onClick={() => {
              setSelectedTechFilter('all');
              if (allTechs.length > 0) setCurrentTech(allTechs[0]);
            }}
            className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
              selectedTechFilter === 'all'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-black'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {tr('technician.allTechnicians')}
          </button>
          {allTechs.map(tk => {
            const isChosen = selectedTechFilter === tk.id || (selectedTechFilter !== 'all' && currentTech?.id === tk.id);
            return (
              <button
                key={tk.id}
                type="button"
                onClick={() => {
                  setSelectedTechFilter(tk.id);
                  setCurrentTech(tk);
                  setBrandColor(tk.color || 'from-amber-500 to-orange-600');
                  setBrandAvatar(tk.avatar || '');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition shrink-0 ${
                  isChosen
                    ? 'bg-amber-500 text-white font-black shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60'
                }`}
              >
                {tk.avatar ? (
                  <img src={tk.avatar} alt={tk.name} className="w-4 h-4 rounded-full object-cover" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                )}
                <span>{tk.name}</span>
                <span className="text-[10px] opacity-75 font-mono">({tk.lab_name})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* HEADER: Technician Lab info & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {currentTech?.avatar ? (
            <img
              src={currentTech.avatar}
              alt={currentTech.name}
              className="w-12 h-12 rounded-2xl object-cover border-2 border-white/20 shadow-md shrink-0 shadow-amber-500/20"
            />
          ) : (
            <div
              style={currentTech?.color?.startsWith('#') ? { backgroundColor: currentTech.color } : undefined}
              className={`w-12 h-12 rounded-2xl ${
                currentTech?.color?.startsWith('from-')
                  ? `bg-gradient-to-br ${currentTech.color}`
                  : !currentTech?.color?.startsWith('#')
                  ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                  : ''
              } flex items-center justify-center text-white shadow-md shadow-amber-500/20 shrink-0 font-black text-sm`}
            >
              {currentTech?.name.slice(0, 2).toUpperCase() || 'TL'}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                {currentTech?.lab_name || tr('technician.dentalLabTechnicianPortal')}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
                {currentTech?.name || tr('technician.technician')}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {tr('technician.clinicLabOrdersDailyWeeklyWork')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Brand Customization Button */}
          <button
            type="button"
            onClick={() => setIsBrandModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition border border-slate-200 dark:border-slate-700 shadow-2xs"
            title={tr('technician.customizeBrandColorLogo')}
          >
            <Palette className="w-4 h-4 text-amber-500" />
            <span className="hidden sm:inline">{tr('technician.brandColor')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedOrder(null);
              setIsFullModalOpen(true);
            }}
            className={BTN_AMBER}
          >
            <Plus className="w-4 h-4" /> {tr('technician.newLabOrder')}
          </button>
        </div>
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto text-xs font-bold">
        {[
          { key: 'calendar', label: tr('technician.workScheduleWeekly'), icon: CalendarDays },
          { key: 'orders',   label: tr('technician.allOrders'), icon: FileSpreadsheet },
          { key: 'prices',   label: tr('technician.myPriceList'), icon: Tag },
          { key: 'clinics',  label: tr('technician.connectedClinics'), icon: Building2 }
        ].map(tabItem => {
          const Icon = tabItem.icon;
          const active = activeTab === tabItem.key;
          return (
            <button
              key={tabItem.key}
              type="button"
              onClick={() => setActiveTab(tabItem.key as any)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition whitespace-nowrap ${
                active
                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20 font-black'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tabItem.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-slate-400 font-semibold">{tr('technician.loading')}</div>
      ) : activeTab === 'calendar' ? (
        /* ──────── 1. TAB: HAFTALIK ISHLAR TAQVIMI ──────── */
        <div className="space-y-4 animate-in fade-in duration-150">
          
          {/* Controls Bar: 4 STATUS TABS ("doctorda chiqarilmoqda texnikda bo'lsa keldida turmasin keldida statusga qarab qo'y hammasini ko'rish ham bo'lsin") */}
          <div className={`${CARD} p-4 space-y-3`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              
              {/* 4 Ta Asosiy Filtr: Keladi, Ketadi, Chiqarilmagan ishlar, Barchasi */}
              <div className="inline-flex flex-wrap p-1 rounded-xl bg-slate-100 dark:bg-slate-800 gap-1">
                {/* 1. Keladi (biriktirildi, chiqarildi, texnik oldi) */}
                <button
                  type="button"
                  onClick={() => setScheduleMode('keladi')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition ${
                    scheduleMode === 'keladi'
                      ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                  <span>{tr('technician.incoming')}</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[11px] tabular-nums font-mono ${
                    scheduleMode === 'keladi' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 font-bold' : 'bg-slate-200 dark:bg-slate-700 text-slate-600'
                  }`}>
                    {keladiOrders.length}
                  </span>
                </button>

                {/* 2. Ketadi (statusga qaramidi, topshirish vaqtiga qaradi) */}
                <button
                  type="button"
                  onClick={() => setScheduleMode('ketadi')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition ${
                    scheduleMode === 'ketadi'
                      ? 'bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4 text-amber-600" />
                  <span>{tr('technician.delivery')}</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[11px] tabular-nums font-mono ${
                    scheduleMode === 'ketadi' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 font-bold' : 'bg-slate-200 dark:bg-slate-700 text-slate-600'
                  }`}>
                    {ketadiOrders.length}
                  </span>
                </button>

                {/* 3. Chiqarilmagan ishlar (Biriktirilgan) */}
                <button
                  type="button"
                  onClick={() => setScheduleMode('biriktirilgan')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition ${
                    scheduleMode === 'biriktirilgan'
                      ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span>{tr('technician.undispatched')}</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[11px] tabular-nums font-mono ${
                    scheduleMode === 'biriktirilgan' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 font-bold' : 'bg-slate-200 dark:bg-slate-700 text-slate-600'
                  }`}>
                    {biriktirilganOrders.length}
                  </span>
                </button>

                {/* 4. Barchasi */}
                <button
                  type="button"
                  onClick={() => setScheduleMode('barchasi')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition ${
                    scheduleMode === 'barchasi'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-slate-600" />
                  <span>{tr('technician.all')}</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[11px] tabular-nums font-mono ${
                    scheduleMode === 'barchasi' ? 'bg-slate-300 text-slate-900 dark:bg-slate-600 dark:text-white font-bold' : 'bg-slate-200 dark:bg-slate-700 text-slate-600'
                  }`}>
                    {baseVisibleOrders.length}
                  </span>
                </button>
              </div>

              {/* Period Navigator (Kunlik / 3 kunlik / Haftalik) & View Switcher */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => shiftWeek(-1)}
                    className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
                    title={tr('technician.previous')}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentDate(new Date())}
                    className="px-3 py-1 text-xs font-bold rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
                  >
                    {tr('technician.today')}
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftWeek(1)}
                    className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
                    title={tr('technician.next')}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Kunlik / 3 kunlik / Haftalik Filter */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-0.5">
                  {(['day', '3days', 'week'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPeriodFilter(p)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        periodFilter === p
                          ? 'bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-xs font-black'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {p === 'day' ? tr('technician.day') : p === '3days' ? tr('technician.n3Days') : tr('technician.week')}
                    </button>
                  ))}
                </div>

                <span className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200">
                  {periodFilter === 'day'
                    ? formatLocalDate(currentDate)
                    : periodFilter === '3days'
                    ? `${threeDaysList[0]?.formatted} – ${threeDaysList[2]?.formatted}`
                    : `${weekDates[0]?.formatted} – ${weekDates[6]?.formatted}`}
                </span>

                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setCalendarViewMode('week')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                      calendarViewMode === 'week'
                        ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" /> {tr('technician.calendar')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarViewMode('table')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                      calendarViewMode === 'table'
                        ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    <TableIcon className="w-3.5 h-3.5" /> {tr('technician.table')}
                  </button>
                </div>
              </div>
            </div>

            {/* Clinic Filter & Search */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={tr('technician.patientDoctorOrderWorkType')}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-amber-500"
                />
              </div>

              <select
                value={selectedClinicFilter}
                onChange={e => setSelectedClinicFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="all">{tr('technician.allClinics')}</option>
                {clinics.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  const code = prompt(tr('technician.enterLabOrderQrCodeOr'));
                  if (code) {
                    const cleanCode = code.trim().toLowerCase();
                    setSearchQuery(code.trim());
                    const match = labOrders.find(
                      o => (o.order_number && o.order_number.toLowerCase() === cleanCode) ||
                           String(o.id) === cleanCode ||
                           `lab-${o.id}`.toLowerCase() === cleanCode
                    );
                    if (match) {
                      setSelectedOrder(match);
                      setIsFullModalOpen(true);
                    }
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition shadow-2xs"
                title={tr('technician.quickOpenByQrOrId')}
              >
                <QrCode className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="hidden sm:inline">{tr('technician.qrScannerId')}</span>
              </button>
            </div>
          </div>

          {calendarViewMode === 'week' ? (
            /* ──────── DINAMIK TAQVIM GRID (KUNLIK / 3 KUNLIK / HAFTALIK) ──────── */
            <div className={`grid gap-3 ${
              periodFilter === 'day'
                ? 'grid-cols-1 max-w-xl mx-auto'
                : periodFilter === '3days'
                ? 'grid-cols-1 md:grid-cols-3'
                : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-7'
            }`}>
              {(periodFilter === 'day'
                ? [{
                    key: 'today',
                    short: tk('tech_selected_day'),
                    formatted: currentDate.toLocaleDateString(language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-US' : 'uz-UZ', { day: 'numeric', month: 'long', weekday: 'short' }),
                    dateStr: formatLocalDate(currentDate),
                    isToday: formatLocalDate(currentDate) === formatLocalDate(new Date())
                  }]
                : periodFilter === '3days'
                ? threeDaysList
                : weekDates
              ).map(day => {
                const dayOrders = baseVisibleOrders.filter(o => {
                  // 1. Chiqarilmagan ishlar
                  if (scheduleMode === 'biriktirilgan') {
                    return o.status === 'biriktirildi';
                  }
                  // 2. Keladi: biriktirildi, chiqarilvoti, texnik oldi
                  if (scheduleMode === 'keladi') {
                    if (o.status !== 'biriktirildi' && o.status !== 'chiqarilvoti' && o.status !== 'texnik oldi') {
                      return false;
                    }
                  }
                  // 3. Ketadi: topshirish vaqtiga qaradi
                  else if (scheduleMode === 'ketadi') {
                    if (!o.zdacha_date && !o.due_date) {
                      return false;
                    }
                  }

                  // Date match
                  const targetDate = getRelevantOrderDate(o, scheduleMode);
                  return targetDate === day.dateStr;
                });

                return (
                  <div
                    key={day.key}
                    className={`rounded-2xl border flex flex-col min-h-[480px] overflow-hidden transition-all ${
                      day.isToday
                        ? 'border-amber-400 bg-amber-50/20 dark:bg-amber-950/10 ring-1 ring-amber-400/40'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c1322]'
                    }`}
                  >
                    {/* Day Header */}
                    <div className={`p-3 border-b text-center shrink-0 ${
                      day.isToday
                        ? 'bg-amber-500 text-white font-black'
                        : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'
                    }`}>
                      <p className="text-xs uppercase font-bold tracking-wider">{day.short}</p>
                      <p className="text-sm font-black">{day.formatted}</p>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                        day.isToday ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      }`}>
                        {dayOrders.length} {tr('technician.orders')}
                      </span>
                    </div>

                    {/* Orders Cards List for this day */}
                    <div className="p-2 space-y-2.5 flex-1 overflow-y-auto max-h-[620px]">
                      {dayOrders.length === 0 ? (
                        <div className="py-12 text-center text-slate-300 dark:text-slate-700 text-xs font-medium">
                          {tr('technician.noSchedule')}
                        </div>
                      ) : (
                        dayOrders.map(order => {
                          const statusBadge = getStatusBadge(order.status, language as any);
                          const clinicLogo = order.clinic_logo || 'TM';

                          return (
                            <div
                              key={order.id}
                              onClick={() => handleCardClick(order)}
                              className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-500 shadow-xs hover:shadow-md transition cursor-pointer space-y-2 group"
                            >
                              {/* Card Top: Clinic & Status (NO NARYAD NUMBER) */}
                              <div className="flex items-center justify-between gap-1 text-[11px]">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 truncate">
                                  {order.clinic_name || clinicLogo}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${statusBadge.color}`}>
                                  {statusBadge.label}
                                </span>
                              </div>

                              {/* Branch Flow: Originating & Destination */}
                              <div className="flex items-center gap-1 text-[10px] font-bold pt-0.5">
                                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 border border-blue-200 dark:border-blue-900/60 truncate max-w-[130px]" title={tr('technician.receivingBranch')}>
                                  <Building2 className="w-3 h-3 text-blue-500 shrink-0" />
                                  <span className="truncate">{order.branch_name || 'Toshkent Markaziy'}</span>
                                </span>
                                <span className="flex items-center gap-0.5 text-[9px] text-slate-400 shrink-0">
                                  <span>➔</span>
                                  <span className="truncate text-emerald-600 dark:text-emerald-400 font-bold max-w-[100px]" title={tr('technician.dispatchBranch')}>{order.destination_branch_name || order.branch_name || 'Toshkent Markaziy'}</span>
                                </span>
                              </div>

                              {/* Patient Name */}
                              <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900 dark:text-white truncate">
                                <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span className="truncate">{order.patient_name}</span>
                              </div>

                              {/* Doctor */}
                              <div className="flex items-center gap-1 text-[11px] text-slate-500 truncate">
                                <Stethoscope className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                <span className="truncate">{order.doctor_name}</span>
                              </div>

                              {/* Work Type & Vita Shade */}
                              <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700 flex items-center justify-between gap-1">
                                <span className="truncate text-amber-600 dark:text-amber-400 font-bold">{order.work_type}</span>
                                {order.color_shade && (
                                  <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0 text-[10px] font-mono">Vita: {order.color_shade}</span>
                                )}
                              </div>

                              {/* Dates: Primerka & Zdacha */}
                              <div className="grid grid-cols-2 gap-1.5 text-[10px] font-bold pt-1 border-t border-slate-100 dark:border-slate-800">
                                <div className="text-amber-700 dark:text-amber-300 flex items-center gap-1">
                                  <span className="w-3.5 h-3.5 rounded bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center text-[8px] font-black">
                                    P
                                  </span>
                                  <span className="font-mono">{order.primerka_date ? order.primerka_date.slice(5) : '—'}</span>
                                </div>
                                <div className="text-emerald-700 dark:text-emerald-300 flex items-center justify-end gap-1">
                                  <span className="w-3.5 h-3.5 rounded bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center text-[8px] font-black">
                                    Z
                                  </span>
                                  <span className="font-mono">
                                    {(order.zdacha_date || order.due_date) ? (order.zdacha_date || order.due_date).slice(5) : '—'}
                                  </span>
                                </div>
                              </div>

                              {/* Attached Media quick buttons: 3D Skan & Rentgen */}
                              {(order.attached_items?.has_scan || order.attached_items?.has_xray) && (
                                <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px]">
                                  {order.attached_items?.has_scan && (
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        setSelectedScanOrder(order);
                                        setIs3DScanViewerOpen(true);
                                      }}
                                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-bold hover:bg-purple-100 dark:hover:bg-purple-900 transition"
                                      title={tr('technician.open3dScan')}
                                    >
                                      <Boxes className="w-3 h-3" />
                                      <span>3D Skan</span>
                                    </button>
                                  )}
                                  {order.attached_items?.has_xray && (
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        setSelectedRentgenOrder(order);
                                        setIsRentgenViewerOpen(true);
                                      }}
                                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300 font-bold hover:bg-cyan-100 dark:hover:bg-cyan-900 transition"
                                      title={tr('technician.downloadXRayCt')}
                                    >
                                      <HardDrive className="w-3 h-3" />
                                      <span>Rentgen/KT</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ──────── JADVAL REJIMI (TABLE VIEW) ──────── */
            <div className={`${CARD} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 font-bold text-slate-500 uppercase text-[10px]">
                      <th className="p-3"># {tr('technician.order')}</th>
                      <th className="p-3">{tr('technician.clinic')}</th>
                      <th className="p-3">{tr('technician.patient')}</th>
                      <th className="p-3">{tr('technician.doctor')}</th>
                      <th className="p-3">{tr('technician.workTypeTeeth')}</th>
                      <th className="p-3">{tr('technician.shadeVita')}</th>
                      <th className="p-3">{tr('technician.dueDate')}</th>
                      <th className="p-3">{tr('technician.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {baseVisibleOrders.map(order => {
                      const statusBadge = getStatusBadge(order.status, language as any);
                      return (
                        <tr
                          key={order.id}
                          onClick={() => handleCardClick(order)}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition"
                        >
                          <td className="p-3 font-mono font-bold text-blue-600 dark:text-sky-400">
                            {order.order_number || `#${order.id}`}
                          </td>
                          <td className="p-3">
                            <span className="font-bold block">{order.clinic_name || 'Clinic'}</span>
                            <span className="text-[10px] text-blue-600 dark:text-sky-400 font-semibold">{order.branch_name || 'Toshkent Markaziy'}</span>
                            {order.destination_branch_name && order.destination_branch_name !== order.branch_name && (
                              <span className="text-[9px] text-slate-400 block">➔ {order.destination_branch_name}</span>
                            )}
                          </td>
                          <td className="p-3 font-bold text-slate-900 dark:text-white">{order.patient_name}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">{order.doctor_name}</td>
                          <td className="p-3">
                            <span className="font-bold text-slate-800 dark:text-slate-200">{order.work_type}</span>
                            <span className="block font-mono text-[10px] text-slate-400">#{order.tooth_numbers}</span>
                          </td>
                          <td className="p-3 font-mono font-bold text-amber-600 dark:text-amber-400">{order.color_shade || '—'}</td>
                          <td className="p-3 font-mono">{order.zdacha_date || order.due_date || '—'}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.color}`}>
                              {statusBadge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'orders' ? (
        /* ──────── 2. TAB: BARCHA NARYADLAR RO'YXATI ──────── */
        <div className={`${CARD} p-4 space-y-4`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                {tr('technician.allOrdersArchive')}
              </h2>
              <p className="text-xs text-slate-500">
                {tr('technician.totalOrders').replace('{n}', String(baseVisibleOrders.length))}
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={tr('technician.search')}
                className={INPUT}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 font-bold text-slate-500 uppercase text-[10px]">
                  <th className="p-3"># {tr('technician.order')}</th>
                  <th className="p-3">{tr('technician.clinic')}</th>
                  <th className="p-3">{tr('technician.patient')}</th>
                  <th className="p-3">{tr('technician.doctor')}</th>
                  <th className="p-3">{tr('technician.workType')}</th>
                  <th className="p-3">{tr('technician.teeth')}</th>
                  <th className="p-3">{tr('technician.shade')}</th>
                  <th className="p-3">{tr('technician.dueDate2')}</th>
                  <th className="p-3">{tr('technician.status')}</th>
                  <th className="p-3">{tr('technician.techAmount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {baseVisibleOrders.map(order => {
                  const statusBadge = getStatusBadge(order.status, language as any);
                  return (
                    <tr
                      key={order.id}
                      onClick={() => handleCardClick(order)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition"
                    >
                      <td className="p-3 font-mono font-bold text-blue-600 dark:text-sky-400">{order.order_number || `#${order.id}`}</td>
                      <td className="p-3">
                        <span className="font-bold block">{order.clinic_name || 'Clinic'}</span>
                        <span className="text-[10px] text-blue-600 dark:text-sky-400 font-semibold">{order.branch_name || 'Toshkent Markaziy'}</span>
                        {order.destination_branch_name && order.destination_branch_name !== order.branch_name && (
                          <span className="text-[9px] text-slate-400 block">➔ {order.destination_branch_name}</span>
                        )}
                      </td>
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{order.patient_name}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-300">{order.doctor_name}</td>
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{order.work_type}</td>
                      <td className="p-3 font-mono">#{order.tooth_numbers}</td>
                      <td className="p-3 font-mono font-bold text-amber-600 dark:text-amber-400">{order.color_shade}</td>
                      <td className="p-3 font-mono">{order.zdacha_date || order.due_date || '—'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.color}`}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                        {uzNumber(order.cost || 0)} so‘m
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'prices' ? (
        /* ──────── 3. TAB: PREYSKURANT / NARXLAR (3 TILLI BOSHQARUV) ──────── */
        <div className={`${CARD} p-5 space-y-4 animate-in fade-in duration-150`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                {tr('technician.dentalLabServicesPriceList')}
              </h2>
              <p className="text-xs text-slate-500">
                {tr('technician.servicesSupport3LanguagesUzbekRuss')}
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleOpenPriceModal()}
              className={BTN_AMBER}
            >
              <Plus className="w-4 h-4" />
              <span>{tr('technician.addNewService')}</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 font-bold text-slate-500 uppercase text-[10px]">
                  <th className="p-3">{tr('technician.serviceName')}</th>
                  <th className="p-3">{tr('technician.category')}</th>
                  <th className="p-3">{tr('technician.material')}</th>
                  <th className="p-3">{tr('technician.turnaround')}</th>
                  <th className="p-3">{tr('technician.priceUzs')}</th>
                  <th className="p-3 text-right">{tr('technician.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {(currentTech?.price_list || []).map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="p-3 font-bold text-slate-900 dark:text-white">
                      <div>{getLocalizedServiceName(item)}</div>
                      <div className="text-[10px] text-slate-400 font-normal space-x-2">
                        {item.nameUz && <span>UZ: {item.nameUz}</span>}
                        {item.nameRu && <span>RU: {item.nameRu}</span>}
                        {item.nameEn && <span>EN: {item.nameEn}</span>}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                        {item.category}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">{item.material || '—'}</td>
                    <td className="p-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                      {item.lead_days || 3} {tr('technician.days')}
                    </td>
                    <td className="p-3 font-mono font-black text-amber-600 dark:text-amber-400 text-sm">
                      {uzNumber(item.price)} so‘m
                    </td>
                    <td className="p-3 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => handleOpenPriceModal(item)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-600 transition"
                        title={tr('technician.edit')}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePriceItem(item.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 transition"
                        title={tr('technician.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ──────── 4. TAB: BOG'LANGAN KLINIKALAR ──────── */
        <div className={`${CARD} p-5 space-y-4 animate-in fade-in duration-150`}>
          <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
              {tr('technician.partnerClinics')}
            </h2>
            <p className="text-xs text-slate-500">
              {tr('technician.clinicsDispatchingWorkOrdersToYour')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clinics.map(c => (
              <div key={c.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm">
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-slate-900 dark:text-white">{c.name}</h4>
                    <p className="text-[11px] text-slate-400">{c.phone || tr('technician.noPhone')}</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 flex justify-between items-center">
                  <span>{tr('technician.statusActivePartner')}</span>
                  <span className="text-emerald-600 font-bold">✓ {tr('technician.connected')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lab Order Full Modal (Technician View) */}
      <LabOrderFullModal
        isOpen={isFullModalOpen}
        onClose={() => {
          setIsFullModalOpen(false);
          setSelectedOrder(null);
        }}
        order={selectedOrder}
        onSaved={handleOrderSaved}
        isTechnicianView={true}
      />

      {/* Price Item Modal (3 Languages Input) */}
      {/* User explicitly demanded: "texnik narxlarini ham 3 ta tilda qilib qo'y kiritib qo'y yangi qo'shmoqchi bo'lsa ham 3 ta tilda kiritsin nomini" */}
      {isPriceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {editingPriceId ? tr('technician.editService3Languages') : tr('technician.addService3Languages')}
              </h3>
              <button onClick={() => setIsPriceModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePriceItem} className="space-y-3 text-xs">
              {/* 3 ta Tilda Nomi */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  🇺🇿 {tr('technician.nameInUzbek')} *
                </label>
                <input
                  type="text"
                  required
                  value={priceForm.nameUz}
                  onChange={e => setPriceForm({ ...priceForm, nameUz: e.target.value })}
                  placeholder={tr('technician.eGZirconiaCrownKatanaHt')}
                  className={INPUT}
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  🇷🇺 {tr('technician.nameInRussian')}
                </label>
                <input
                  type="text"
                  value={priceForm.nameRu}
                  onChange={e => setPriceForm({ ...priceForm, nameRu: e.target.value })}
                  placeholder={tr('technician.eGZirconiaCrownKatanaHt2')}
                  className={INPUT}
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  🇬🇧 {tr('technician.nameInEnglish')}
                </label>
                <input
                  type="text"
                  value={priceForm.nameEn}
                  onChange={e => setPriceForm({ ...priceForm, nameEn: e.target.value })}
                  placeholder={tr('technician.eGZirconiaCrownKatanaHt3')}
                  className={INPUT}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    {tr('technician.category')}
                  </label>
                  <input
                    type="text"
                    value={priceForm.category}
                    onChange={e => setPriceForm({ ...priceForm, category: e.target.value })}
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    {tr('technician.leadTimeDays')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={priceForm.lead_days}
                    onChange={e => setPriceForm({ ...priceForm, lead_days: Number(e.target.value) })}
                    className={INPUT}
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                  {tr('technician.workPriceUzs')} *
                </label>
                <input
                  type="number"
                  step="10000"
                  required
                  value={priceForm.price}
                  onChange={e => setPriceForm({ ...priceForm, price: Number(e.target.value) })}
                  className={INPUT}
                />
              </div>

              <div>
                <label className="font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                  {tr('technician.material')}
                </label>
                <input
                  type="text"
                  value={priceForm.material}
                  onChange={e => setPriceForm({ ...priceForm, material: e.target.value })}
                  placeholder={tr('technician.eGZirconiaKatanaHt')}
                  className={INPUT}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setIsPriceModalOpen(false)} className={BTN_GHOST}>
                  {tr('technician.cancel')}
                </button>
                <button type="submit" className={BTN_AMBER}>
                  {tr('technician.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ════════ BRAND & COLOR CUSTOMIZATION MODAL ════════ */}
      {isBrandModalOpen && currentTech && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-amber-500" />
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  {tr('technician.technicianBrandColor')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBrandModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live Preview */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
              {brandAvatar ? (
                <img
                  src={brandAvatar}
                  alt={currentTech.name}
                  className="w-12 h-12 rounded-2xl object-cover border-2 border-white/40 shadow-sm shrink-0"
                />
              ) : (
                <div
                  style={brandColor.startsWith('#') ? { backgroundColor: brandColor } : undefined}
                  className={`w-12 h-12 rounded-2xl ${
                    brandColor.startsWith('from-') ? `bg-gradient-to-br ${brandColor}` : !brandColor.startsWith('#') ? 'bg-gradient-to-br from-amber-500 to-orange-600' : ''
                  } flex items-center justify-center text-white shadow-md shrink-0 font-black text-sm`}
                >
                  {currentTech.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900 dark:text-white truncate">{currentTech.name}</p>
                <p className="text-xs text-slate-500 truncate">{currentTech.lab_name}</p>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold block mt-0.5">
                  {tr('technician.livePreview')}
                </span>
              </div>
            </div>

            {/* Color Presets */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                {tr('technician.brandColor2')}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { name: tr('technician.amber'), val: 'from-amber-500 to-orange-600', bg: 'bg-gradient-to-br from-amber-500 to-orange-600' },
                  { name: tr('technician.blue'), val: 'from-blue-600 to-indigo-600', bg: 'bg-gradient-to-br from-blue-600 to-indigo-600' },
                  { name: tr('technician.green'), val: 'from-emerald-500 to-teal-600', bg: 'bg-gradient-to-br from-emerald-500 to-teal-600' },
                  { name: tr('technician.purple'), val: 'from-purple-600 to-pink-600', bg: 'bg-gradient-to-br from-purple-600 to-pink-600' },
                  { name: tr('technician.rose'), val: 'from-rose-600 to-red-600', bg: 'bg-gradient-to-br from-rose-600 to-red-600' },
                  { name: tr('technician.cyan'), val: 'from-cyan-500 to-blue-600', bg: 'bg-gradient-to-br from-cyan-500 to-blue-600' },
                  { name: tr('technician.slate'), val: 'from-slate-700 to-slate-900', bg: 'bg-gradient-to-br from-slate-700 to-slate-900' },
                  { name: tr('technician.gold'), val: 'from-yellow-500 to-amber-600', bg: 'bg-gradient-to-br from-yellow-500 to-amber-600' }
                ].map(p => (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => setBrandColor(p.val)}
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition ${
                      brandColor === p.val ? 'border-amber-500 ring-2 ring-amber-500/30 scale-105' : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-lg ${p.bg} shadow-2xs block`} />
                    <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Hex Color */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{tr('technician.orCustomColor')}</span>
              <input
                type="color"
                value={brandColor.startsWith('#') ? brandColor : '#f59e0b'}
                onChange={e => setBrandColor(e.target.value)}
                className="w-7 h-7 rounded-lg cursor-pointer border border-slate-300"
              />
              <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">{brandColor}</span>
            </div>

            {/* Logo / Avatar Image Upload */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                {tr('technician.labLogoAvatar')}
              </label>
              <div className="flex items-center gap-3">
                <label className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer border border-slate-300 dark:border-slate-700 transition">
                  {tr('technician.chooseImage')}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = ev => {
                          if (ev.target?.result) setBrandAvatar(ev.target.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="hidden"
                  />
                </label>
                {brandAvatar && (
                  <button
                    type="button"
                    onClick={() => setBrandAvatar('')}
                    className="text-xs text-rose-500 font-bold hover:underline"
                  >
                    {tr('technician.removePhoto')}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsBrandModalOpen(false)}
                className={BTN_GHOST}
              >
                {tr('technician.cancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (currentTech) {
                    const updated = await clinicApi.updateTechnician(currentTech.id, {
                      color: brandColor,
                      avatar: brandAvatar
                    });
                    if (updated) {
                      setCurrentTech({ ...currentTech, color: brandColor, avatar: brandAvatar });
                      setAllTechs(prev => prev.map(t => t.id === currentTech.id ? { ...t, color: brandColor, avatar: brandAvatar } : t));
                    }
                  }
                  setIsBrandModalOpen(false);
                }}
                className={BTN_AMBER}
              >
                {tr('technician.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3D Scan Viewer Modal */}
      {is3DScanViewerOpen && (
        <Dental3DScanViewerModal
          isOpen={true}
          onClose={() => setIs3DScanViewerOpen(false)}
          patientId={selectedScanOrder?.patient}
          orderId={selectedScanOrder?.id}
          patientName={selectedScanOrder?.patient_name}
          orderNumber={selectedScanOrder?.order_number || (selectedScanOrder?.id ? `LAB-${selectedScanOrder.id}` : undefined)}
        />
      )}

      {/* Rentgen & Romexis KT Viewer Modal */}
      {isRentgenViewerOpen && (
        <DentalRentgenViewerModal
          isOpen={true}
          onClose={() => setIsRentgenViewerOpen(false)}
          patientId={selectedRentgenOrder?.patient}
          orderId={selectedRentgenOrder?.id}
          patientName={selectedRentgenOrder?.patient_name}
          orderNumber={selectedRentgenOrder?.order_number || (selectedRentgenOrder?.id ? `LAB-${selectedRentgenOrder.id}` : undefined)}
        />
      )}
    </div>
  );
}

export default function TechnicianPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Yuklanmoqda…</div>}>
      <TechnicianPortalPageContent />
    </Suspense>
  );
}
