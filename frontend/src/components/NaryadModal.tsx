'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useI18n } from '../lib/i18n';
import { clinicApi } from '../lib/api';
import { Employee, NaryadCatalogItem, DoctorNaryadAssignment } from '../lib/types';
import ToothIcon from './ToothIcon';
import {
  X,
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  UserCheck,
  Sparkles,
  CheckCircle2,
  FlaskConical,
  Check,
  RotateCcw,
  Activity,
  Layers,
  ArrowRight
} from 'lucide-react';

export interface NaryadCartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  teeth: string[];
  isCustomPrice?: boolean;
  standardPrice?: number;
  technician?: string;
  category?: string;
}

interface NaryadModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientName: string;
  patientPhone: string;
  patientBalance: number;
  doctorId?: number;
  doctorName?: string;
  onSave: (
    items: NaryadCartItem[],
    total: number,
    isDebt: boolean,
    note: string,
    doctorId?: number,
    doctorName?: string
  ) => void;
}

interface CatalogServiceItem {
  id?: string;
  name: string;
  category: string;
  base_price: number;
  default_percent?: number;
}

// Full dental services catalog including Dental Technician / Laboratory services
const DEFAULT_SERVICES: CatalogServiceItem[] = [
  // Терапия
  { name: 'Консультация врача (осмотр, план лечения, 3D рентген)', category: 'Терапия', base_price: 500000, default_percent: 50 },
  { name: 'Лечение кариеса + световая пломба Estelite', category: 'Терапия', base_price: 650000, default_percent: 40 },
  { name: 'Эндодонтическое лечение корневого канала (1 канал)', category: 'Терапия', base_price: 800000, default_percent: 35 },
  { name: 'Реставрация зуба фотополимером Estelite Asteria', category: 'Терапия', base_price: 900000, default_percent: 35 },
  { name: 'Композитный винир прямой метод', category: 'Терапия', base_price: 3500000, default_percent: 35 },

  // Гигиена
  { name: 'Профессиональная гигиена полости рта (GBT протокол)', category: 'Гигиена', base_price: 1500000, default_percent: 45 },
  { name: 'Фторирование эмали и реминерализация', category: 'Гигиена', base_price: 300000, default_percent: 50 },
  { name: 'Отбеливание зубов Beyond Polus Advanced', category: 'Гигиена', base_price: 2500000, default_percent: 40 },

  // Хирургия & Имплантация
  { name: 'Удаление зуба простое с анестезией', category: 'Хирургия', base_price: 450000, default_percent: 35 },
  { name: 'Удаление зуба сложное (дистопия/ретинированный 8-й зуб)', category: 'Хирургия', base_price: 900000, default_percent: 35 },
  { name: 'Установка имплантата Osstem TS-III (Корея)', category: 'Хирургия', base_price: 4200000, default_percent: 30 },
  { name: 'Установка имплантата Straumann BLX (Швейцария)', category: 'Хирургия', base_price: 7500000, default_percent: 35 },
  { name: 'Закрытый синус-лифтинг с костной пластикой', category: 'Хирургия', base_price: 3500000, default_percent: 30 },

  // Ортопедия
  { name: 'Металлокерамическая коронка Duceram', category: 'Ортопедия', base_price: 1200000, default_percent: 35 },
  { name: 'Циркониевая коронка цельноанатомическая Prettau', category: 'Ортопедия', base_price: 2400000, default_percent: 35 },
  { name: 'Керамическая коронка IPS e.max Press', category: 'Ортопедия', base_price: 3000000, default_percent: 35 },
  { name: 'Керамические виниры E.max (Premium LAB)', category: 'Ортопедия', base_price: 18000000, default_percent: 40 },
  { name: 'Рельсовый бюгельный протез на имплантатах (на балке)', category: 'Ортопедия', base_price: 25000000, default_percent: 35 },

  // Зуботехнические работы / Laboratoriya (Dental Technician)
  { name: 'Циркониевая коронка Prettau (Зуботехника)', category: 'Зуботехнические работы', base_price: 1800000, default_percent: 30 },
  { name: 'Керамическая коронка E.max (Зуботехника)', category: 'Зуботехнические работы', base_price: 2200000, default_percent: 30 },
  { name: 'Металлокерамическая коронка (Зуботехника)', category: 'Зуботехнические работы', base_price: 900000, default_percent: 30 },
  { name: 'Временная коронка PMMA (CAD/CAM фрезеровка)', category: 'Зуботехнические работы', base_price: 350000, default_percent: 25 },
  { name: 'Керамический винир E.max (LAB)', category: 'Зуботехнические работы', base_price: 2500000, default_percent: 30 },
  { name: 'Бюгельный протез с замковой фиксацией (Bredent)', category: 'Зуботехнические работы', base_price: 12000000, default_percent: 30 },
  { name: 'Индивидуальная слепочная ложка', category: 'Зуботехнические работы', base_price: 250000, default_percent: 20 },
  { name: 'Индивидуальный циркониевый абатмент', category: 'Зуботехнические работы', base_price: 1500000, default_percent: 25 },
  { name: 'Wax-up диагностическое моделирование (1 зуб)', category: 'Зуботехнические работы', base_price: 200000, default_percent: 25 }
];

const UPPER_TEETH = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'];
const LOWER_TEETH = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'];
const UPPER_TEETH_CHILD = ['55', '54', '53', '52', '51', '61', '62', '63', '64', '65'];
const LOWER_TEETH_CHILD = ['85', '84', '83', '82', '81', '71', '72', '73', '74', '75'];

const LAB_TECHNICIANS = ['Smiledent', 'MasterLab', 'DentalArt', 'PrimeLab', 'EliteDental'];

export default function NaryadModal({
  isOpen,
  onClose,
  patientName,
  patientPhone,
  patientBalance,
  doctorId,
  doctorName,
  onSave
}: NaryadModalProps) {
  const { language, tk, tr } = useI18n();
  const som = tk('k_11') || 'So‘m';

  const [isChildChart, setIsChildChart] = useState(false);
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('Barchasi');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<NaryadCartItem[]>([]);
  const [note, setNote] = useState('');

  // Dental technician selection in naryad
  const [selectedTechnician, setSelectedTechnician] = useState('Smiledent');
  const [techNote, setTechNote] = useState('');

  // Doctor state
  const [doctorsList, setDoctorsList] = useState<Employee[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<number>(doctorId || 1);
  const [catalogItems, setCatalogItems] = useState<CatalogServiceItem[]>([]);
  const [doctorAssignments, setDoctorAssignments] = useState<DoctorNaryadAssignment[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    // Load doctors
    clinicApi.getEmployees().then((emps) => {
      const docs = emps.filter((e) => e.role === 'doctor');
      setDoctorsList(docs);
      if (doctorId) {
        setSelectedDoctorId(doctorId);
      } else if (doctorName) {
        const found = docs.find((d) => d.full_name.toLowerCase().includes(doctorName.toLowerCase()));
        if (found) setSelectedDoctorId(found.id);
        else if (docs[0]) setSelectedDoctorId(docs[0].id);
      } else if (docs[0]) {
        setSelectedDoctorId(docs[0].id);
      }
    });

    // Load catalog items
    const cat = clinicApi.getNaryadCatalog();
    if (cat && cat.length > 0) {
      // Merge with dental technician category if missing
      const hasTech = cat.some((c) => c.category === 'Зуботехнические работы');
      if (!hasTech) {
        const techItems = DEFAULT_SERVICES.filter((s) => s.category === 'Зуботехнические работы');
        setCatalogItems([...cat, ...techItems]);
      } else {
        setCatalogItems(cat);
      }
    } else {
      setCatalogItems(DEFAULT_SERVICES);
    }

    setDoctorAssignments(clinicApi.getDoctorNaryads());

    // Reset view
    setIsChildChart(false);
    setSelectedTeeth([]);
    setActiveCategory('Barchasi');
    setSearchQuery('');
    setCart([]);
    setNote('');
    setTechNote('');
  }, [isOpen, doctorId, doctorName]);

  const upperRow = isChildChart ? UPPER_TEETH_CHILD : UPPER_TEETH;
  const lowerRow = isChildChart ? LOWER_TEETH_CHILD : LOWER_TEETH;

  const toggleTooth = (tooth: string) => {
    setSelectedTeeth((prev) =>
      prev.includes(tooth) ? prev.filter((t) => t !== tooth) : [...prev, tooth]
    );
  };

  const selectAllUpper = () => {
    const allUpperSelected = upperRow.every((t) => selectedTeeth.includes(t));
    if (allUpperSelected) {
      setSelectedTeeth((prev) => prev.filter((t) => !upperRow.includes(t)));
    } else {
      setSelectedTeeth((prev) => Array.from(new Set([...prev, ...upperRow])));
    }
  };

  const selectAllLower = () => {
    const allLowerSelected = lowerRow.every((t) => selectedTeeth.includes(t));
    if (allLowerSelected) {
      setSelectedTeeth((prev) => prev.filter((t) => !lowerRow.includes(t)));
    } else {
      setSelectedTeeth((prev) => Array.from(new Set([...prev, ...lowerRow])));
    }
  };

  const clearTeeth = () => setSelectedTeeth([]);

  const currentDoctor = useMemo(
    () => doctorsList.find((d) => d.id === selectedDoctorId),
    [doctorsList, selectedDoctorId]
  );

  const customAssignmentsForCurrentDoctor = useMemo(() => {
    if (!selectedDoctorId) return new Map<string, number>();
    const map = new Map<string, number>();
    doctorAssignments
      .filter((a) => a.doctor_id === selectedDoctorId)
      .forEach((a) => {
        map.set(a.naryad_id, a.custom_price);
      });
    return map;
  }, [doctorAssignments, selectedDoctorId]);

  const resolveItemPricing = (item: CatalogServiceItem) => {
    if (item.id && customAssignmentsForCurrentDoctor.has(item.id)) {
      const customPrice = customAssignmentsForCurrentDoctor.get(item.id)!;
      return { price: customPrice, isCustom: true, standardPrice: item.base_price };
    }
    return { price: item.base_price, isCustom: false, standardPrice: item.base_price };
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    set.add('Barchasi');
    set.add('Зуботехнические работы');
    catalogItems.forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return Array.from(set);
  }, [catalogItems]);

  const filteredItems = useMemo(() => {
    return catalogItems.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      const matchCat =
        activeCategory === 'Barchasi' || item.category === activeCategory;
      return matchSearch && matchCat;
    });
  }, [catalogItems, searchQuery, activeCategory]);

  const addToCart = (item: CatalogServiceItem) => {
    const pricing = resolveItemPricing(item);
    const qty = selectedTeeth.length > 0 ? selectedTeeth.length : 1;
    const isTechService = item.category === 'Зуботехнические работы';

    const cartName = isTechService && selectedTechnician
      ? `${item.name} [${selectedTechnician}]`
      : item.name;

    setCart((prev) => [
      ...prev,
      {
        id: `${item.name}-${Date.now()}-${Math.random()}`,
        name: cartName,
        price: pricing.price,
        quantity: qty,
        teeth: [...selectedTeeth],
        isCustomPrice: pricing.isCustom,
        standardPrice: pricing.standardPrice,
        technician: isTechService ? selectedTechnician : undefined,
        category: item.category
      }
    ]);
    setSelectedTeeth([]);
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
      )
    );
  };

  // Naryad item uchun QO'LDA narx kiritish (o'zini narxini qo'yish)
  const updatePrice = (id: string, newPrice: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, price: Math.max(0, newPrice), isCustomPrice: newPrice !== item.standardPrice }
          : item
      )
    );
  };

  const removeItem = (id: string) => setCart((prev) => prev.filter((item) => item.id !== id));

  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  const handleFinish = () => {
    if (cart.length === 0) return;
    const finalNote = [
      note.trim(),
      techNote.trim() ? `Texnikka (${selectedTechnician}): ${techNote.trim()}` : ''
    ].filter(Boolean).join(' | ');

    onSave(cart, total, false, finalNote, selectedDoctorId, currentDoctor?.full_name || doctorName);
    onClose();
  };

  if (!isOpen) return null;

  const customCount = customAssignmentsForCurrentDoctor.size;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex flex-col w-screen h-screen overflow-hidden animate-in fade-in duration-150 text-slate-900 dark:text-white">
      <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
        {/* ================= 1. FULLSCREEN TOP HEADER ================= */}
        <header className="px-6 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-xs">
          {/* Left: Patient and title */}
          <div className="flex items-center space-x-4">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <ToothIcon className="w-6 h-6" filled />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  {tr('naryadmodal.k')}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-sky-300">
                  {patientName}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {patientPhone} • {tr('naryadmodal.k2')}:{' '}
                <span className={patientBalance < 0 ? 'text-rose-600 font-bold' : 'text-slate-700 dark:text-slate-300 font-bold'}>
                  {patientBalance.toLocaleString()} {som}
                </span>
              </p>
            </div>
          </div>

          {/* Middle: Doctor and Custom Pricing Badge */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs">
              <UserCheck className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0" />
              <span className="font-semibold text-slate-600 dark:text-slate-300">{tr('naryadmodal.k3')}</span>
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(Number(e.target.value))}
                className="font-bold bg-transparent border-none outline-none cursor-pointer text-slate-900 dark:text-white"
              >
                {doctorsList.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.full_name} ({doc.specialty || 'Shifokor'})
                  </option>
                ))}
              </select>
            </div>

            {customCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>{customCount} {tr('naryadmodal.k4')}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>{tr('naryadmodal.k5')}</span>
              </span>
            )}
          </div>

          {/* Right: Close button */}
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition"
            title={tr('naryadmodal.k6')}
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* ================= 2. PROCESS STATUS TIMELINE ================= */}
        <div className="px-6 py-2.5 bg-slate-100/90 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center justify-between max-w-5xl mx-auto text-xs font-bold text-slate-500">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">1</span>
              <span>{tr('naryadmodal.k7')}</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700" />
            <div className="flex items-center gap-2 text-blue-600 dark:text-sky-400">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">2</span>
              <span>{tr('naryadmodal.k8')}</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700" />
            <div className="flex items-center gap-2 text-slate-400">
              <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 flex items-center justify-center text-[10px]">3</span>
              <span>{tr('naryadmodal.k9')}</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700" />
            <div className="flex items-center gap-2 text-slate-400">
              <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 flex items-center justify-center text-[10px]">4</span>
              <span>{tr('naryadmodal.k10')}</span>
            </div>
          </div>
        </div>

        {/* ================= 3. FULL-HEIGHT WORKSPACE ================= */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 overflow-hidden">
          {/* LEFT: Odontogram & Services Catalog (8 cols) */}
          <div className="lg:col-span-8 flex flex-col space-y-4 overflow-hidden">
            {/* --- Anatomical Dental Chart Card --- */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs shrink-0">
              {/* Odontogram Header Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center space-x-2">
                  <div className="px-3 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-sky-300 font-bold text-xs">
                    {selectedTeeth.length > 0
                      ? `${tr('naryadmodal.k11')}: ${selectedTeeth.join(', ')}`
                      : (tr('naryadmodal.k12'))}
                  </div>
                  {selectedTeeth.length > 0 && (
                    <button
                      type="button"
                      onClick={clearTeeth}
                      className="text-xs text-rose-500 hover:underline flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{tr('naryadmodal.k13')}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={selectAllUpper}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg text-slate-700 dark:text-slate-300 transition"
                  >
                    {tr('naryadmodal.k14')}
                  </button>
                  <button
                    type="button"
                    onClick={selectAllLower}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg text-slate-700 dark:text-slate-300 transition"
                  >
                    {tr('naryadmodal.k15')}
                  </button>
                  <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => { setIsChildChart(false); setSelectedTeeth([]); }}
                      className={`px-3 py-1 rounded-lg transition ${!isChildChart ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs font-bold' : 'text-slate-400'}`}
                    >
                      {tr('naryadmodal.k16')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsChildChart(true); setSelectedTeeth([]); }}
                      className={`px-3 py-1 rounded-lg transition ${isChildChart ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs font-bold' : 'text-slate-400'}`}
                    >
                      {tr('naryadmodal.k17')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Upper & Lower Jaws Odontogram with Enhanced Anatomical ToothIcon */}
              <div className="space-y-2">
                {/* Upper Jaw */}
                <div className="flex justify-center gap-1 sm:gap-1.5 flex-wrap">
                  {upperRow.map((tooth) => {
                    const selected = selectedTeeth.includes(tooth);
                    return (
                      <button
                        key={tooth}
                        type="button"
                        onClick={() => toggleTooth(tooth)}
                        className={`flex flex-col items-center w-8 sm:w-9 py-1 rounded-xl transition border ${
                          selected
                            ? 'bg-blue-50 dark:bg-blue-950/80 border-blue-500 text-blue-600 dark:text-sky-400 ring-2 ring-blue-400/30'
                            : 'bg-slate-50/70 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 hover:border-blue-300 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <span className="text-[10px] font-black font-mono">{tooth}</span>
                        <ToothIcon className="w-5 h-6 mt-0.5" selected={selected} />
                      </button>
                    );
                  })}
                </div>

                {/* Lower Jaw */}
                <div className="flex justify-center gap-1 sm:gap-1.5 flex-wrap pt-1 border-t border-slate-100 dark:border-slate-800">
                  {lowerRow.map((tooth) => {
                    const selected = selectedTeeth.includes(tooth);
                    return (
                      <button
                        key={tooth}
                        type="button"
                        onClick={() => toggleTooth(tooth)}
                        className={`flex flex-col-reverse items-center w-8 sm:w-9 py-1 rounded-xl transition border ${
                          selected
                            ? 'bg-blue-50 dark:bg-blue-950/80 border-blue-500 text-blue-600 dark:text-sky-400 ring-2 ring-blue-400/30'
                            : 'bg-slate-50/70 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 hover:border-blue-300 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <span className="text-[10px] font-black font-mono">{tooth}</span>
                        <ToothIcon className="w-5 h-6 mb-0.5" selected={selected} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* --- Catalog Card (Search + Categories + Services List) --- */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex-1 flex flex-col overflow-hidden shadow-2xs">
              {/* Search Bar */}
              <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={tr('naryadmodal.k18')}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-blue-500 font-medium"
                  />
                </div>
              </div>

              {/* Categories Navigation & Service Cards */}
              <div className="flex-1 grid grid-cols-12 overflow-hidden">
                {/* Categories Left Panel */}
                <div className="col-span-4 border-r border-slate-200 dark:border-slate-800 overflow-y-auto p-2 space-y-1">
                  {categories.map((cat) => {
                    const isActive = activeCategory === cat;
                    const count = cat === 'Barchasi'
                      ? catalogItems.length
                      : catalogItems.filter((i) => i.category === cat).length;
                    const isTech = cat === 'Зуботехнические работы';
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => { setActiveCategory(cat); setSearchQuery(''); }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between ${
                          isActive
                            ? isTech
                              ? 'bg-amber-500 text-white shadow-xs'
                              : 'bg-blue-600 text-white shadow-xs'
                            : isTech
                            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 border border-amber-200/80 dark:border-amber-800'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {isTech && <FlaskConical className="w-3.5 h-3.5 shrink-0" />}
                          <span className="truncate">{cat}</span>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${isActive ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Services List Panel */}
                <div className="col-span-8 overflow-y-auto p-3 space-y-2">
                  {filteredItems.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      {tr('naryadmodal.k19')}
                    </div>
                  ) : (
                    filteredItems.map((item, idx) => {
                      const pricing = resolveItemPricing(item);
                      const isTech = item.category === 'Зуботехнические работы';
                      return (
                        <div
                          key={idx}
                          className="p-3 bg-slate-50/70 dark:bg-slate-800/50 hover:bg-blue-50/50 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 rounded-xl transition flex items-center justify-between gap-3 group"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition">
                                {item.name}
                              </h4>
                              {isTech && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                  Laboratoriya
                                </span>
                              )}
                              {pricing.isCustom && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  Shifokor tarifi
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 block mt-0.5">
                              {item.category}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs font-bold font-mono text-slate-900 dark:text-white">
                              {pricing.price.toLocaleString()} {som}
                            </span>
                            <button
                              type="button"
                              onClick={() => addToCart(item)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1 active:scale-95"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>{tr('naryadmodal.k20')}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Dental Technician Details & Naryad Cart (4 cols) */}
          <div className="lg:col-span-4 flex flex-col space-y-4 overflow-hidden">
            {/* Zubotexnik / Laboratoriya Box */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs space-y-2.5 shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-300">
                <FlaskConical className="w-4 h-4 text-amber-500" />
                <span>{tr('naryadmodal.k21')}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">
                    {tr('naryadmodal.k22')}
                  </label>
                  <select
                    value={selectedTechnician}
                    onChange={(e) => setSelectedTechnician(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none"
                  >
                    {LAB_TECHNICIANS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1">
                    {tr('naryadmodal.k23')}
                  </label>
                  <input
                    type="text"
                    value={techNote}
                    onChange={(e) => setTechNote(e.target.value)}
                    placeholder={tr('naryadmodal.k24')}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Shopping Cart List */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex-1 flex flex-col overflow-hidden shadow-2xs">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    {tr('naryadmodal.k25')} ({cart.length})
                  </h3>
                </div>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    className="text-[11px] text-rose-500 hover:underline font-bold"
                  >
                    {tr('naryadmodal.k26')}
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
                    <ShoppingCart className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                    <p className="text-xs font-semibold">
                      {tr('naryadmodal.k27')}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {tr('naryadmodal.k28')}
                    </p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                            {item.name}
                          </h4>
                          {item.teeth.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-sky-400 font-mono font-black mt-1">
                              <ToothIcon className="w-3 h-3" />
                              <span>#{item.teeth.join(', ')}</span>
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="text-slate-400 hover:text-rose-500 transition p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                        {/* Stepper */}
                        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5">
                          <button
                            type="button"
                            onClick={() => updateQty(item.id, -1)}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold font-mono w-4 text-center">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQty(item.id, 1)}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Narxni QO'LDA tahrirlash (o'zini narxini qo'yish) */}
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            step={10000}
                            value={item.price}
                            onChange={(e) => updatePrice(item.id, Number(e.target.value) || 0)}
                            className={`w-24 text-right text-xs font-bold font-mono bg-transparent border rounded-lg px-1.5 py-1 outline-none focus:border-blue-500 ${item.isCustomPrice ? 'border-amber-400 text-amber-700 dark:text-amber-300' : 'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white'}`}
                            title={tr('naryadmodal.k29')}
                          />
                          <span className="text-[10px] text-slate-400">{som}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Total & Action Footer */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {tr('naryadmodal.k30')}
                  </span>
                  <span className="text-xl font-black font-mono text-slate-900 dark:text-white">
                    {total.toLocaleString()} {som}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition"
                  >
                    {tr('naryadmodal.k31')}
                  </button>
                  <button
                    type="button"
                    onClick={handleFinish}
                    disabled={cart.length === 0}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <Check className="w-4 h-4" />
                    <span>{tr('naryadmodal.k32')}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
