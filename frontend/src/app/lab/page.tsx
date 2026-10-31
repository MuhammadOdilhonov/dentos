'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { clinicApi } from '../../lib/api';
import { DentalLabOrder, Employee, Patient, DentalTechnician, Branch } from '../../lib/types';
import LabOrderFullModal, { LAB_STATUS_CHAIN, getStatusBadge } from '../../components/LabOrderFullModal';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import {
  FlaskConical,
  Plus,
  Search,
  Calendar,
  Clock,
  Printer,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Layers,
  Phone,
  User,
  Stethoscope,
  X,
  FileText,
  Building2,
  MapPin,
  CheckCircle,
  Check,
  RotateCcw,
  Camera,
  FileScan,
  Package,
  Wrench,
  Table as TableIcon,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  Boxes,
  HardDrive,
  FileArchive
} from 'lucide-react';
import dynamic from 'next/dynamic';
// Three.js/DICOM og'ir — faqat tegishli ko'ruvchi modal ochilganda yuklanadi (#5).
const Dental3DScanViewerModal = dynamic(() => import('../../components/Dental3DScanViewerModal'), { ssr: false });
const DentalRentgenViewerModal = dynamic(() => import('../../components/DentalRentgenViewerModal'), { ssr: false });

function getTechGradient(techName?: string) {
  const norm = (techName || '').toLowerCase();
  if (norm.includes('apex')) return 'from-amber-500 to-orange-600';
  if (norm.includes('master')) return 'from-blue-600 to-indigo-600';
  if (norm.includes('smile') || norm.includes('orto')) return 'from-emerald-500 to-teal-600';
  return 'from-purple-600 to-indigo-600';
}

function TechLogoPill({ name, tech }: { name: string; tech?: DentalTechnician }) {
  const initials = (name || 'TL').slice(0, 2).toUpperCase();

  if (tech?.avatar) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shrink-0">
        <img src={tech.avatar} alt={name} className="w-4 h-4 rounded object-cover shadow-2xs" />
        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 max-w-[110px] truncate">
          {name}
        </span>
      </div>
    );
  }

  const isHex = tech?.color?.startsWith('#');
  const gradient = tech?.color?.startsWith('from-') ? tech.color : getTechGradient(tech?.lab_name || name);

  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shrink-0">
      <div
        style={isHex && tech?.color ? { backgroundColor: tech.color } : undefined}
        className={`w-4 h-4 rounded text-[9px] font-black text-white flex items-center justify-center ${!isHex ? `bg-gradient-to-br ${gradient}` : ''} shadow-2xs`}
      >
        {initials}
      </div>
      <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 max-w-[110px] truncate">
        {name}
      </span>
    </div>
  );
}

export default function DentalLabPage() {
    const { language, tr, tk } = useI18n();

  // Multi-language helper: guarantees clean single-language output
  const { user } = useAuth();

  const [labOrders, setLabOrders] = useState<DentalLabOrder[]>([]);
  const [technicians, setTechnicians] = useState<DentalTechnician[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  // View & Filter state
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board');
  const [scheduleMode, setScheduleMode] = useState<'keladi' | 'ketadi' | 'biriktirilgan' | 'barchasi'>('barchasi');
  const [periodFilter, setPeriodFilter] = useState<'day' | '3days' | 'week'>('day');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('all');
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  // 3D Scan & Rentgen view modal states
  const [is3DScanViewerOpen, setIs3DScanViewerOpen] = useState(false);
  const [selectedScanOrder, setSelectedScanOrder] = useState<DentalLabOrder | null>(null);
  const [isRentgenViewerOpen, setIsRentgenViewerOpen] = useState(false);
  const [selectedRentgenOrder, setSelectedRentgenOrder] = useState<DentalLabOrder | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DentalLabOrder | null>(null);
  const [preselectedTechId, setPreselectedTechId] = useState<number | undefined>(undefined);
  const [preselectedDate, setPreselectedDate] = useState<string | undefined>(undefined);

  // Connect Dental Lab Modal state
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [availableTechs, setAvailableTechs] = useState<DentalTechnician[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [linkingTechId, setLinkingTechId] = useState<number | null>(null);

  const handleOpenConnectModal = async () => {
    setIsConnectModalOpen(true);
    setLoadingAvailable(true);
    try {
      const data = await clinicApi.getAvailableTechnicians();
      setAvailableTechs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAvailable(false);
    }
  };

  const handleLinkTech = async (techId: number) => {
    setLinkingTechId(techId);
    try {
      await clinicApi.toggleTechnicianLink(techId, 'link');
      await loadData();
      setIsConnectModalOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLinkingTechId(null);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const cid = user?.clinicId || undefined;
      const [ordersData, techsData, empsData, patsData, branchesData] = await Promise.all([
        clinicApi.getLabOrders(cid),
        clinicApi.getTechnicians(cid),
        clinicApi.getEmployees(undefined, cid),
        clinicApi.getPatients(undefined, cid),
        clinicApi.getBranches(undefined, cid)
      ]);
      setLabOrders(ordersData);
      setTechnicians(techsData);
      setEmployees(empsData.filter(e => e.role === 'doctor'));
      setPatients(patsData);
      setBranches(branchesData);
    } catch (e) {
      console.error('Laboratoriya ma’lumotlarini yuklashda xatolik:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.clinicId]);

  const formatLocalDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const selectedDateStr = formatLocalDate(currentDate);
  const dateTitle = currentDate.toLocaleDateString(
    language === 'uz' ? 'uz-UZ' : language === 'en' ? 'en-US' : 'ru-RU',
    { day: 'numeric', month: 'long', weekday: 'long' }
  );

  const shiftDay = (delta: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + delta);
    setCurrentDate(d);
  };

  // Helper to extract clean YYYY-MM-DD
  const cleanDateStr = (raw: string | undefined): string => {
    if (!raw) return '';
    return raw.includes('T') ? raw.split('T')[0] : raw.includes(' ') ? raw.split(' ')[0] : raw;
  };

  // Date range calculator for Kunlik (1 day) / 3 kunlik (3 days) / Haftalik (7 days)
  const periodDateRange = useMemo(() => {
    const start = new Date(currentDate);
    const startStr = formatLocalDate(start);

    if (periodFilter === 'day') {
      return {
        startDateStr: startStr,
        endDateStr: startStr,
        isWithin: (d: string | undefined) => {
          const cd = cleanDateStr(d);
          return cd === startStr;
        }
      };
    }
    if (periodFilter === '3days') {
      const end = new Date(start);
      end.setDate(start.getDate() + 2);
      const endStr = formatLocalDate(end);
      return {
        startDateStr: startStr,
        endDateStr: endStr,
        isWithin: (d: string | undefined) => {
          const cd = cleanDateStr(d);
          return cd >= startStr && cd <= endStr;
        }
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
      isWithin: (d: string | undefined) => {
        const cd = cleanDateStr(d);
        return cd >= monStr && cd <= sunStr;
      }
    };
  }, [currentDate, periodFilter]);

  // Helper date for an order based on mode
  const getOrderRelevantDate = (o: DentalLabOrder) => {
    const raw = scheduleMode === 'keladi'
      ? (o.zdacha_date || o.received_date || o.due_date || (o.created_at ? o.created_at.split('T')[0] : ''))
      : (o.primerka_date || o.due_date || (o.created_at ? o.created_at.split('T')[0] : ''));
    return cleanDateStr(raw);
  };

  // Base filtered orders by branch, search, doctor, status
  const baseFilteredOrders = useMemo(() => {
    return labOrders.filter(order => {
      // Branch filter
      if (selectedBranchFilter !== 'all') {
        const matchBranch =
          String(order.branch) === selectedBranchFilter ||
          order.branch_name === selectedBranchFilter ||
          String(order.destination_branch) === selectedBranchFilter ||
          order.destination_branch_name === selectedBranchFilter;
        if (!matchBranch) return false;
      }

      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          order.patient_name.toLowerCase().includes(q) ||
          order.doctor_name.toLowerCase().includes(q) ||
          order.technician_name.toLowerCase().includes(q) ||
          (order.order_number && order.order_number.toLowerCase().includes(q)) ||
          order.work_type.toLowerCase().includes(q) ||
          order.tooth_numbers.includes(q) ||
          (order.branch_name && order.branch_name.toLowerCase().includes(q)) ||
          (order.destination_branch_name && order.destination_branch_name.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // Doctor filter
      if (selectedDoctorFilter !== 'all') {
        if (String(order.doctor) !== selectedDoctorFilter && order.doctor_name !== selectedDoctorFilter) {
          return false;
        }
      }

      // Status filter
      if (selectedStatusFilter !== 'all') {
        if (order.status !== selectedStatusFilter) return false;
      }

      return true;
    });
  }, [labOrders, selectedBranchFilter, searchQuery, selectedDoctorFilter, selectedStatusFilter]);

  // Dynamic counts according to active period (kunlik / 3 kunlik / haftalik)
  // Keladi: biriktirildi, chiqarilvoti, texnik oldi
  const keladiOrders = useMemo(() => {
    return baseFilteredOrders.filter(o => {
      if (o.status !== 'biriktirildi' && o.status !== 'chiqarilvoti' && o.status !== 'texnik oldi') return false;
      const targetDate = o.zdacha_date || o.received_date || o.due_date || (o.created_at ? o.created_at.split('T')[0] : '');
      return periodDateRange.isWithin(targetDate);
    });
  }, [baseFilteredOrders, periodDateRange]);

  // Ketadi: statusga qaramaydi, topshirish vaqtiga (zdacha_date / due_date) qaraydi
  const ketadiOrders = useMemo(() => {
    return baseFilteredOrders.filter(o => {
      const targetDate = o.zdacha_date || o.due_date;
      if (!targetDate) return false;
      return periodDateRange.isWithin(targetDate);
    });
  }, [baseFilteredOrders, periodDateRange]);

  // Chiqarilmagan ishlar: status === 'biriktirildi'
  const biriktirilganOrders = useMemo(() => {
    return baseFilteredOrders.filter(o => o.status === 'biriktirildi');
  }, [baseFilteredOrders]);

  // Filtered orders matching the active tab/schedule mode
  const filteredOrders = useMemo(() => {
    if (scheduleMode === 'biriktirilgan') {
      return biriktirilganOrders;
    }
    if (scheduleMode === 'keladi') {
      return keladiOrders;
    }
    if (scheduleMode === 'ketadi') {
      return ketadiOrders;
    }
    return baseFilteredOrders;
  }, [scheduleMode, biriktirilganOrders, keladiOrders, ketadiOrders, baseFilteredOrders]);

  // Open modal to create
  const handleOpenCreate = (techId?: number, dateStr?: string) => {
    if (activeTechnicians.length === 0) {
      handleOpenConnectModal();
      return;
    }
    setSelectedOrder(null);
    setPreselectedTechId(techId);
    setPreselectedDate(dateStr || selectedDateStr);
    setIsModalOpen(true);
  };

  // Open modal to view/edit
  const handleOpenEdit = (order: DentalLabOrder) => {
    setSelectedOrder(order);
    setPreselectedTechId(order.technician);
    setPreselectedDate(undefined);
    setIsModalOpen(true);
  };

  const handleOrderSaved = (saved: DentalLabOrder) => {
    setLabOrders(prev => {
      const idx = prev.findIndex(o => o.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
  };

  const handleDeleteOrder = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(tr('lab.doYouConfirmDeletingThisLab'))) return;
    await clinicApi.deleteLabOrder(id);
    setLabOrders(prev => prev.filter(o => o.id !== id));
  };

  // Technicians list for Day view — faqat REAL texniklar (soxta namuna yo'q)
  const activeTechnicians = useMemo(() => technicians, [technicians]);

  // 7 Days of the week for Week view
  const weekDays = useMemo(() => {
    const curr = new Date(currentDate);
    const dayOfWeek = (curr.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(curr);
    monday.setDate(curr.getDate() - dayOfWeek);

    const days = [];
    const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(k => tk(k));

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({
        date: d,
        dateStr,
        dayName: dayNames[i],
        shortDate: d.toLocaleDateString(language === 'uz' ? 'uz-UZ' : 'ru-RU', { day: 'numeric', month: 'short' }),
        isToday: dateStr === new Date().toISOString().split('T')[0]
      });
    }
    return days;
  }, [currentDate, language]);

  // 3 Days for 3-Day view
  const threeDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(currentDate);
      d.setDate(currentDate.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString(language === 'uz' ? 'uz-UZ' : 'ru-RU', { weekday: 'long' });
      days.push({
        date: d,
        dateStr,
        dayName,
        shortDate: d.toLocaleDateString(language === 'uz' ? 'uz-UZ' : 'ru-RU', { day: 'numeric', month: 'short' }),
        isToday: dateStr === new Date().toISOString().split('T')[0]
      });
    }
    return days;
  }, [currentDate, language]);

  // Reusable Order Card (No price, no color, clean numbers, time, P, Z, and technician logo)
  const renderOrderCard = (order: DentalLabOrder) => {
    const statusBadge = getStatusBadge(order.status, language as any);
    const hasScan = order.attached_items?.has_scan;
    const hasPhoto = order.attached_items?.has_photo;
    const hasXray = order.attached_items?.has_xray;
    const hasLozhka = Boolean(order.attached_items?.lozhka);
    const hasTransfer = Boolean(order.attached_items?.transfer_count);
    const hasAnalog = Boolean(order.attached_items?.analog_count);

    const tech = technicians.find(t => t.id === order.technician || t.name === order.technician_name);

    return (
      <div
        key={order.id}
        onClick={() => handleOpenEdit(order)}
        className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500 shadow-2xs hover:shadow-md transition cursor-pointer space-y-2 group"
      >
        {/* Top: Doctor & Patient + Status */}
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-400 flex items-center gap-1 truncate">
              <Stethoscope className="w-3 h-3 text-emerald-500 shrink-0" />
              <span>{order.doctor_name}</span>
            </p>
            <h4 className="text-xs font-black text-slate-900 dark:text-white truncate">
              {order.patient_name}
            </h4>
          </div>

          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${statusBadge.color}`}>
            {statusBadge.label}
          </span>
        </div>

        {/* Branch Flow Indicator */}
        <div className="flex items-center gap-1 text-[10px] font-bold pt-0.5">
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 border border-blue-200 dark:border-blue-900/60 truncate max-w-[140px]">
            <Building2 className="w-3 h-3 text-blue-500 shrink-0" />
            <span className="truncate">{order.branch_name || 'Toshkent Markaziy'}</span>
          </span>
          {order.destination_branch_name && order.destination_branch_name !== order.branch_name && (
            <span className="flex items-center gap-0.5 text-[9px] text-slate-400 shrink-0">
              <span>➔</span>
              <span className="truncate text-emerald-600 dark:text-emerald-400 font-bold max-w-[100px]">{order.destination_branch_name}</span>
            </span>
          )}
        </div>

        {/* Technician Logo Badge & Vita Color Shade (NO NARYAD NUMBER) */}
        <div className="flex items-center justify-between gap-1.5 pt-0.5">
          <TechLogoPill name={order.technician_name} tech={tech} />
          {order.color_shade && (
            <span className="font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400">
              Vita: {order.color_shade}
            </span>
          )}
        </div>

        {/* Work type (NO TOOTH NUMBERS) */}
        <div className="flex items-center justify-between text-xs font-bold pt-0.5">
          <span className="truncate text-slate-800 dark:text-slate-200">{order.work_type}</span>
        </div>

        {/* Dates & Numbers: P (Primerka) & Z (Zdacha) */}
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

        {/* Attached Items Indicators: Scan, Foto, Rentgen, Lozhka, Tr, An */}
        <div className="flex flex-wrap items-center gap-1 pt-0.5 text-[9px] font-bold">
          {hasScan && (
            <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
              STL Scan
            </span>
          )}
          {hasPhoto && (
            <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              Foto
            </span>
          )}
          {hasXray && (
            <span className="px-1.5 py-0.2 rounded bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
              Rentgen
            </span>
          )}
          {hasLozhka && (
            <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              Lozhka
            </span>
          )}
          {hasTransfer && (
            <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              Tr: {order.attached_items?.transfer_count}
            </span>
          )}
          {hasAnalog && (
            <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              An: {order.attached_items?.analog_count}
            </span>
          )}
        </div>

        {/* Quick Action Buttons: 3D Skan and Rentgen / KT */}
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
                title={tr('lab.open3dScan')}
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
                title={tr('lab.downloadXRayCt')}
              >
                <HardDrive className="w-3 h-3" />
                <span>Rentgen/KT</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070d17] p-3 sm:p-5 lg:p-6 space-y-4">
      
      {/* 1. TOP HEADER & MAIN CONTROLS */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Title & Stats */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black shadow-sm">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  {tr('lab.dentalLabOrders')}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {filteredOrders.length} {tr('lab.orders')}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tr('lab.technicianWorkflowIntakeAndDispatc')}
              </p>
            </div>
          </div>

          {/* Quick Action: New Order & Connect Lab */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenConnectModal}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition"
            >
              <FlaskConical className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
              <span>{tr('lab.connectLab')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenCreate()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('lab.newLabOrder')}</span>
            </button>
          </div>
        </div>

        {/* 2. SECONDARY CONTROLS BAR */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          
          {/* Keladi / Ketadi / Chiqarilmagan ishlar / Barchasi Toggle */}
          <div className="flex flex-wrap items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-1">
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
              <span>{tr('labx2.incoming')}</span>
              <span className={`px-1.5 py-0.2 rounded-md text-[11px] tabular-nums font-mono ${
                scheduleMode === 'keladi' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 font-bold' : 'bg-slate-200 dark:bg-slate-700 text-slate-600'
              }`}>
                {keladiOrders.length}
              </span>
            </button>

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
              <span>{tr('labx2.delivery')}</span>
              <span className={`px-1.5 py-0.2 rounded-md text-[11px] tabular-nums font-mono ${
                scheduleMode === 'ketadi' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 font-bold' : 'bg-slate-200 dark:bg-slate-700 text-slate-600'
              }`}>
                {ketadiOrders.length}
              </span>
            </button>

            {/* Chiqarilmagan ishlar (Biriktirilgan) */}
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
              <span>{tr('lab.undispatched')}</span>
              <span className={`px-1.5 py-0.2 rounded-md text-[11px] tabular-nums font-mono ${
                scheduleMode === 'biriktirilgan' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 font-bold' : 'bg-slate-200 dark:bg-slate-700 text-slate-600'
              }`}>
                {biriktirilganOrders.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setScheduleMode('barchasi')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition ${
                scheduleMode === 'barchasi'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-slate-600" />
              <span>{tr('labx2.all')}</span>
              <span className={`px-1.5 py-0.2 rounded-md text-[11px] tabular-nums font-mono ${
                scheduleMode === 'barchasi' ? 'bg-slate-300 text-slate-900 dark:bg-slate-600 dark:text-white font-bold' : 'bg-slate-200 dark:bg-slate-700 text-slate-600'
              }`}>
                {labOrders.length}
              </span>
            </button>
          </div>

          {/* Date Navigator */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => shiftDay(-1)}
                className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
                title={tr('lab.previousDay')}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1 text-xs font-bold rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition"
              >
                {tr('lab.today')}
              </button>
              <button
                type="button"
                onClick={() => shiftDay(1)}
                className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
                title={tr('lab.nextDay')}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <span className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 capitalize">
              {dateTitle}
            </span>

            {/* Kunlik / 3 kunlik / Haftalik Filter */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              {(['day', '3days', 'week'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriodFilter(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                    periodFilter === p
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {p === 'day' ? tr('lab.day') : p === '3days' ? tr('lab.3Days') : tr('lab.week')}
                </button>
              ))}
            </div>

            {/* View Mode: Taqvim (Board) vs Jadval (Table) */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setViewMode('board')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                  viewMode === 'board'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-sky-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
                title={tr('lab.calendarView')}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> {tr('lab.calendar')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-sky-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
                title={tr('lab.tableView')}
              >
                <TableIcon className="w-3.5 h-3.5" /> {tr('lab.table')}
              </button>
            </div>
          </div>
        </div>

        {/* 3. SEARCH & DOCTOR/STATUS FILTERS */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={tr('lab.searchByPatientDoctorOrderWork')}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Branch Filter */}
            <select
              value={selectedBranchFilter}
              onChange={e => setSelectedBranchFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
            >
              <option value="all">{tr('lab.allBranches')}</option>
              {branches.map(b => (
                <option key={b.id} value={b.name}>{b.name}</option>
              ))}
            </select>

            <select
              value={selectedDoctorFilter}
              onChange={e => setSelectedDoctorFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
            >
              <option value="all">{tr('lab.allDoctors')}</option>
              {employees.map(d => (
                <option key={d.id} value={d.full_name}>{d.full_name}</option>
              ))}
            </select>

            <select
              value={selectedStatusFilter}
              onChange={e => setSelectedStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
            >
              <option value="all">{tr('lab.allStatuses')}</option>
              {LAB_STATUS_CHAIN.map(s => (
                <option key={s.key} value={s.key}>
                  {getStatusBadge(s.key, language as any).label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 4. CONTENT AREA */}
      {loading ? (
        <div className="py-20 text-center text-sm text-slate-400 font-semibold">{tr('lab.loading')}</div>
      ) : viewMode === 'board' ? (
        /* ──────── BOARD VIEW ──────── */
        <div>
          {/* CASE 1: WEEK VIEW (Haftalik) — 7 days columns (Dushanbadan Yakshanbagacha) */}
          {periodFilter === 'week' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
              {weekDays.map(wd => {
                const dayOrders = filteredOrders.filter(o => {
                  const targetDate = getOrderRelevantDate(o);
                  return targetDate === wd.dateStr;
                });

                return (
                  <div
                    key={wd.dateStr}
                    className={`rounded-2xl border flex flex-col min-h-[550px] overflow-hidden ${
                      wd.isToday
                        ? 'border-blue-500/80 bg-blue-50/20 dark:bg-blue-950/10'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0b1322]'
                    }`}
                  >
                    {/* Week Column Header */}
                    <div className="p-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 z-10">
                      <div>
                        <h3 className={`text-xs font-black capitalize ${wd.isToday ? 'text-blue-600 dark:text-sky-400' : 'text-slate-900 dark:text-white'}`}>
                          {wd.dayName}
                        </h3>
                        <p className="text-[10px] text-slate-500 font-mono font-semibold">
                          {wd.shortDate}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {dayOrders.length}
                      </span>
                    </div>

                    {/* Cards Container */}
                    <div className="p-2.5 space-y-2.5 flex-1 overflow-y-auto max-h-[700px]">
                      {/* Top Action: Yangi buyurtma berish cardi */}
                      <button
                        type="button"
                        onClick={() => handleOpenCreate(undefined, wd.dateStr)}
                        className="w-full p-2 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-800 bg-blue-50/50 hover:bg-blue-100/70 dark:bg-blue-950/20 text-blue-700 dark:text-sky-300 flex items-center justify-center gap-1.5 text-xs font-bold transition shadow-2xs group"
                        title={tr('lab.newOrderForThisDay')}
                      >
                        <Plus className="w-3.5 h-3.5 group-hover:scale-110 transition" />
                        <span>{tr('lab.newOrder')}</span>
                      </button>

                      {dayOrders.length === 0 ? (
                        <div className="py-8 text-center text-[11px] text-slate-400">
                          {tr('lab.noOrders')}
                        </div>
                      ) : (
                        dayOrders.map(o => renderOrderCard(o))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* CASE 2: 3-DAYS VIEW (3 kunlik) — 3 columns */}
          {periodFilter === '3days' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {threeDays.map(td => {
                const dayOrders = filteredOrders.filter(o => {
                  const targetDate = getOrderRelevantDate(o);
                  return targetDate === td.dateStr;
                });

                return (
                  <div
                    key={td.dateStr}
                    className={`rounded-2xl border flex flex-col min-h-[550px] overflow-hidden ${
                      td.isToday
                        ? 'border-blue-500/80 bg-blue-50/20 dark:bg-blue-950/10'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0b1322]'
                    }`}
                  >
                    <div className="p-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 z-10">
                      <div>
                        <h3 className={`text-sm font-black capitalize ${td.isToday ? 'text-blue-600 dark:text-sky-400' : 'text-slate-900 dark:text-white'}`}>
                          {td.dayName}
                        </h3>
                        <p className="text-xs text-slate-500 font-mono font-semibold">
                          {td.shortDate}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {dayOrders.length} {tr('lab.orders2')}
                      </span>
                    </div>

                    <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[700px]">
                      {/* Top Action: Yangi buyurtma berish cardi */}
                      <button
                        type="button"
                        onClick={() => handleOpenCreate(undefined, td.dateStr)}
                        className="w-full p-2.5 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-800 bg-blue-50/50 hover:bg-blue-100/70 dark:bg-blue-950/20 text-blue-700 dark:text-sky-300 flex items-center justify-center gap-1.5 text-xs font-bold transition shadow-2xs group"
                      >
                        <Plus className="w-4 h-4 group-hover:scale-110 transition" />
                        <span>{tr('lab.newOrder2')}</span>
                      </button>

                      {dayOrders.length === 0 ? (
                        <div className="py-12 text-center text-xs text-slate-400">
                          {tr('lab.noOrders')}
                        </div>
                      ) : (
                        dayOrders.map(o => renderOrderCard(o))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* CASE 3: DAY VIEW (Kunlik) — Technicians columns (Image 2) */}
          {periodFilter === 'day' && (
            activeTechnicians.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-xs">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <FlaskConical className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {tr('lab.noLaboratoryConnected')}
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-5">
                  {tr('lab.noDentalLabConnectedToYour')}
                </p>
                <button
                  type="button"
                  onClick={handleOpenConnectModal}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>{tr('lab.connectLaboratory')}</span>
                </button>
              </div>
            ) : (
            <div className={`grid gap-4 mx-auto ${
              activeTechnicians.length === 1
                ? 'grid-cols-1 max-w-md'
                : activeTechnicians.length === 2
                ? 'grid-cols-1 md:grid-cols-2 max-w-3xl'
                : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
            }`}>
              {activeTechnicians.map(tech => {
                const techOrders = filteredOrders.filter(
                  o => o.technician === tech.id || o.technician_name === tech.name || o.technician_name.includes(tech.name.split(' ')[0])
                );

                return (
                  <div
                    key={tech.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0b1322] overflow-hidden flex flex-col min-h-[520px]"
                  >
                    {/* Column Header (Technician details & avatar) */}
                    <div className="p-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 z-10">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {tech.avatar ? (
                          <img src={tech.avatar} alt={tech.name} className="w-9 h-9 rounded-xl object-cover shadow-xs border border-slate-200/50 shrink-0" />
                        ) : (
                          <div
                            style={tech.color?.startsWith('#') ? { backgroundColor: tech.color } : undefined}
                            className={`w-9 h-9 rounded-xl ${
                              tech.color?.startsWith('from-')
                                ? `bg-gradient-to-br ${tech.color}`
                                : !tech.color?.startsWith('#')
                                ? `bg-gradient-to-br ${getTechGradient(tech.lab_name || tech.name)}`
                                : ''
                            } text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs`}
                          >
                            {tech.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {tech.name}
                          </h3>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {tech.lab_name}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {techOrders.length} {tr('lab.orders2')}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenCreate(tech.id)}
                          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"
                          title={tr('lab.newOrderToThisTech')}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Orders Cards List under this Technician */}
                    <div className="p-3 space-y-3 flex-1 overflow-y-auto max-h-[640px]">
                      {/* Top Action: Yangi buyurtma berish cardi */}
                      <button
                        type="button"
                        onClick={() => handleOpenCreate(tech.id)}
                        className="w-full p-2.5 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-800 bg-blue-50/50 hover:bg-blue-100/70 dark:bg-blue-950/20 text-blue-700 dark:text-sky-300 flex items-center justify-center gap-1.5 text-xs font-bold transition shadow-2xs group"
                      >
                        <Plus className="w-4 h-4 group-hover:scale-110 transition" />
                        <span>{tr('lab.newOrder2')}</span>
                      </button>

                      {techOrders.length === 0 ? (
                        <div className="py-12 text-center text-xs text-slate-400">
                          {tr('lab.noOrders')}
                        </div>
                      ) : (
                        techOrders.map(order => renderOrderCard(order))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            )
          )}
        </div>
      ) : (
        /* ──────── TABLE VIEW ──────── */
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold">
                  <th className="p-3.5"># {tr('lab.order')}</th>
                  <th className="p-3.5">{tr('lab.patient')}</th>
                  <th className="p-3.5">{tr('lab.doctor')}</th>
                  <th className="p-3.5">{tr('lab.branch')}</th>
                  <th className="p-3.5">{tr('lab.dentalTechnician')}</th>
                  <th className="p-3.5">{tr('lab.workTypeTeeth')}</th>
                  <th className="p-3.5">{tr('lab.pFitting')}</th>
                  <th className="p-3.5">{tr('lab.zDelivery')}</th>
                  <th className="p-3.5">{tr('lab.status')}</th>
                  <th className="p-3.5 text-right">{tr('lab.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-semibold text-slate-800 dark:text-slate-200">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400">
                      {tr('lab.noDentalLabOrdersFound')}
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map(ord => {
                    const statusBadge = getStatusBadge(ord.status, language as any);
                    const tech = technicians.find(t => t.id === ord.technician || t.name === ord.technician_name);

                    return (
                      <tr
                        key={ord.id}
                        onClick={() => handleOpenEdit(ord)}
                        className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition cursor-pointer"
                      >
                        <td className="p-3.5 font-mono font-bold text-blue-600 dark:text-sky-400">
                          {ord.order_number || `#L-${ord.id}`}
                        </td>
                        <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                          {ord.patient_name}
                        </td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-300">
                          {ord.doctor_name}
                        </td>
                        <td className="p-3.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 font-bold text-[11px] border border-blue-200 dark:border-blue-900/60">
                            <Building2 className="w-3 h-3 text-blue-500" />
                            <span>{ord.branch_name || 'Toshkent Markaziy'}</span>
                            {ord.destination_branch_name && ord.destination_branch_name !== ord.branch_name && (
                              <span className="text-[10px] text-slate-500"> ➔ {ord.destination_branch_name}</span>
                            )}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <TechLogoPill name={ord.technician_name} tech={tech} />
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold">{ord.work_type}</div>
                          <div className="font-mono text-[11px] text-blue-600">#{ord.tooth_numbers}</div>
                        </td>
                        <td className="p-3.5 font-mono font-bold text-amber-700 dark:text-amber-400">
                          {ord.primerka_date || '—'}
                        </td>
                        <td className="p-3.5 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          {ord.zdacha_date || ord.due_date || '—'}
                        </td>
                        <td className="p-3.5">
                          <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${statusBadge.color}`}>
                            {statusBadge.label}
                          </span>
                        </td>
                        <td className="p-3.5 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {ord.attached_items?.has_scan && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedScanOrder(ord);
                                  setIs3DScanViewerOpen(true);
                                }}
                                className="p-1.5 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/50 rounded-lg transition"
                                title={tr('lab.open3dScan')}
                              >
                                <Boxes className="w-4 h-4" />
                              </button>
                            )}
                            {ord.attached_items?.has_xray && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRentgenOrder(ord);
                                  setIsRentgenViewerOpen(true);
                                }}
                                className="p-1.5 text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950/50 rounded-lg transition"
                                title={tr('lab.downloadXRayCt')}
                              >
                                <HardDrive className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(ord)}
                              className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition"
                              title={tr('lab.openOrder')}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteOrder(ord.id, e)}
                              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition"
                              title={tr('lab.delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. FULLSCREEN EDGE-TO-EDGE 2-PAGE DIGITAL NARYAD MODAL */}
      <LabOrderFullModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        order={selectedOrder}
        onSaved={handleOrderSaved}
        initialTechnicianId={preselectedTechId}
        initialDate={preselectedDate}
      />

      {/* 6. 3D SCAN VIEWER MODAL */}
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

      {/* 7. RENTGEN & PLANMECA ROMEXIS KT VIEWER MODAL */}
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

      {/* 8. CONNECT DENTAL LAB MODAL */}
      {isConnectModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in"
          onClick={() => setIsConnectModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white my-8 overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 flex items-center justify-center">
                  <FlaskConical className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {tr('lab.connectDentalLab')}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {tr('lab.availableDentalLaboratories')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsConnectModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
              {loadingAvailable ? (
                <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span>{tr('lab.loadingLabs')}</span>
                </div>
              ) : availableTechs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  {tr('lab.noLaboratoriesAvailable')}
                </div>
              ) : (
                availableTechs.map((tech) => {
                  const isLinked = technicians.some(t => t.id === tech.id);
                  return (
                    <div
                      key={tech.id}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between gap-3 hover:border-blue-300 dark:hover:border-blue-700 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                          {tech.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-slate-900 dark:text-white truncate">
                            {tech.name}
                          </p>
                          <p className="text-[11px] text-blue-600 dark:text-sky-400 font-semibold truncate">
                            {tech.lab_name}
                          </p>
                          {tech.phone && (
                            <p className="text-[10px] text-slate-400 mt-0.5">{tech.phone}</p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleLinkTech(tech.id)}
                        disabled={linkingTechId === tech.id || isLinked}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                          isLinked
                            ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 cursor-default'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                        }`}
                      >
                        {isLinked ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>{tr('lab.connected')}</span>
                          </>
                        ) : linkingTechId === tech.id ? (
                          <span>{tr('lab.connecting')}</span>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>{tr('lab.connect')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setIsConnectModalOpen(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition"
              >
                {tr('lab.close')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
