'use client';

import React, { useState, useEffect } from 'react';
import { Appointment, Patient, Employee } from '../lib/types';
import { useI18n } from '../lib/i18n';
import { clinicApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import NaryadModal, { NaryadCartItem } from './NaryadModal';
import {
  X,
  Plus,
  ChevronDown,
  ChevronRight,
  Phone,
  AlertCircle,
  CheckCircle2,
  FileText,
  ShoppingCart,
  UserCheck
} from 'lucide-react';

export interface CheckoutItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  doctor: string;
  duration?: string;
  expanded?: boolean;
}

interface ActiveCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: Appointment | null;
  patient?: Patient | null;
  onComplete: (data: {
    isDebt: boolean;
    finalTotal: number;
    paymentMethod: string;
    items: CheckoutItem[];
    doctorName: string;
    // Split-payment breakdown
    paidAmount: number;        // real money paid (cash/card/…)
    balanceApplied: number;    // prepayment consumed from the patient balance
    debtAmount: number;        // remaining unpaid -> becomes debt
    payments: { method: string; amount: number }[];
    closedBy: string;          // yakunlagan xodim ismi (masalan "Jasur Usmonov")
    closedByRole: string;      // yakunlagan xodim roli (director / kassa / ...)
  }) => void;
  onPreviewInvoice: (items: CheckoutItem[], total: number, paymentMethod: string, isDebt: boolean) => void;
  initialItems?: CheckoutItem[];
  // Called when a service line is removed with a reason (for the naryad journal).
  onRemoveItem?: (item: CheckoutItem, reason: string) => void;
  // Called when all items/naryad are cleared.
  onClearAll?: () => void;
  // When set, the unpaid draft + naryad log persist under this patient id.
  persistKey?: number;
}

const DEFAULT_DOCTORS = [
  'Феруза Шоанварова',
  'Сардор Мирахмедов',
  'Сервер Халилов',
  'Озод Тулкинов',
  'Мальвина Кочиева',
  'Шахноза Шаумарова',
  'Гульбахор Шукурова',
  'Абдуллох Максудов',
  'Лола Саидахмедова',
  'Мирислом Абдуллаев',
  'Анна Эм',
  'Абдулхамид Халиков',
  'Сардор Алимов',
  'Сервер Усманов',
  'Озод Расулов',
  'Мальвина Абдуллаева'
];

export const ActiveCheckoutModal: React.FC<ActiveCheckoutModalProps> = ({
  isOpen,
  onClose,
  appointment,
  patient,
  onComplete,
  onPreviewInvoice,
  initialItems,
  onRemoveItem,
  onClearAll,
  persistKey
}) => {
  const { language, tk, tr } = useI18n();
  const { user } = useAuth();
  // Hisobni (schetni) FAQAT kassir, direktor va direktor o'rinbosari yakunlay oladi.
  // Administrator va shifokor yakunlay OLMAYDI.
  const canFinish = ['kassa', 'director', 'deputy_director', 'superadmin'].includes(user?.role || '');
  const isAdmin = !canFinish;  // eski nom saqlanadi (quyidagi joylarda ishlatiladi) — endi "yakunlay olmaydi" ma'nosida
  const som = tk('k_11');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [doctorList, setDoctorList] = useState<string[]>(DEFAULT_DOCTORS);
  const [items, setItems] = useState<CheckoutItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [openDoctorDropdownId, setOpenDoctorDropdownId] = useState<string | null>(null);
  // Naryad window (tooth chart + catalog) opened from "+ Дополнительные пункты"
  const [showNaryad, setShowNaryad] = useState<boolean>(false);
  // Delete-with-reason prompt. Target is a single item, or 'ALL' to clear the whole naryad.
  const [removeTarget, setRemoveTarget] = useState<CheckoutItem | 'ALL' | null>(null);
  const [removeReason, setRemoveReason] = useState<'mistake' | 'other'>('mistake');
  const [removeComment, setRemoveComment] = useState<string>('');
  // Split payment rows + whether to spend the patient's prepayment balance.
  const [payments, setPayments] = useState<{ method: string; amount: number }[]>([{ method: 'Наличные', amount: 0 }]);
  const [useBalance, setUseBalance] = useState<boolean>(true);
  // Guards the draft-save effect so we don't overwrite the store before load.
  const [draftLoaded, setDraftLoaded] = useState<boolean>(false);

  // Load doctors and initialize items
  useEffect(() => {
    if (!isOpen || !appointment) return;

    clinicApi.getEmployees().then(emps => {
      setEmployees(emps);
      const docNames = emps.filter(e => e.role === 'doctor').map(e => e.full_name);
      const merged = Array.from(new Set([...DEFAULT_DOCTORS, ...docNames]));
      setDoctorList(merged);
    });

    // Prefer explicit karzinka items; otherwise load the persisted draft; else empty.
    const loaded: CheckoutItem[] =
      initialItems && initialItems.length > 0
        ? initialItems
        : persistKey != null
        ? clinicApi.getCheckoutDraft(persistKey).map(d => ({ ...d, expanded: false }))
        : [];
    setItems(loaded);
    setDiscountPercent(0);
    setShowNaryad(false);
    setRemoveTarget(null);
    setOpenDoctorDropdownId(null);
    setUseBalance(true);

    // Seed a single payment row with the amount still payable after the balance.
    const st = loaded.reduce((a, c) => a + c.price * c.quantity, 0);
    const bal = Math.max(0, patient?.balance ?? 0);
    setPayments([{ method: 'Наличные', amount: Math.max(0, st - Math.min(bal, st)) }]);
    setDraftLoaded(true);
  }, [isOpen, appointment]);

  // Persist the unpaid draft whenever it changes (appointments flow).
  useEffect(() => {
    if (!draftLoaded || persistKey == null) return;
    const draftItems = items.map(it => ({ id: it.id, name: it.name, price: it.price, quantity: it.quantity, doctor: it.doctor, duration: it.duration }));
    clinicApi.saveCheckoutDraft(persistKey, draftItems);

    // Also sync with patient naryads (Karzinka)
    const patientItems = items.map((it, idx) => ({
      id: Number(it.id) || (Date.now() + idx),
      title: it.name,
      name: it.name,
      unitPrice: it.price,
      teeth: [],
      doctor: it.doctor || appointment?.doctor_name || 'Сардор Алимов',
      date: 'Bugun',
      price: it.price * it.quantity,
      isDebt: false,
      quantity: it.quantity
    }));
    clinicApi.savePatientNaryads(persistKey, patientItems);
  }, [items, draftLoaded, persistKey]);

  if (!isOpen || !appointment) return null;

  // Patient calculations
  const patientName = patient?.full_name || appointment.patient_name || (tk('k_33'));
  const patientPhone = patient?.phone || appointment.patient_phone || '+998 97 455 83 30';
  const patientBalance = patient?.balance ?? 0;

  // Initials for avatar
  const initials = patientName
    .split(' ')
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase() || 'ФМ';

  // Math calculations
  const subtotal = items.reduce((acc, curr) => acc + (curr.price * curr.quantity), 0);
  const discountAmount = Math.round(subtotal * (discountPercent / 100));
  const finalTotal = Math.max(0, subtotal - discountAmount);

  // Split-payment math: prepayment balance first, then the payment rows, and any
  // remainder becomes debt.
  const balanceAvailable = Math.max(0, patientBalance);
  const balanceApplied = useBalance ? Math.min(balanceAvailable, finalTotal) : 0;
  const payable = Math.max(0, finalTotal - balanceApplied);
  const paidByMethods = payments.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const debtAmount = Math.max(0, payable - paidByMethods);
  const isDebt = debtAmount > 0;

  const setPaymentAmount = (idx: number, amount: number) =>
    setPayments(prev => prev.map((p, i) => (i === idx ? { ...p, amount: Math.max(0, amount) } : p)));
  const setPaymentMethodAt = (idx: number, method: string) =>
    setPayments(prev => prev.map((p, i) => (i === idx ? { ...p, method } : p)));
  const addPaymentRow = () =>
    setPayments(prev => [...prev, { method: 'Карта', amount: Math.max(0, payable - paidByMethods) }]);
  const removePaymentRow = (idx: number) =>
    setPayments(prev => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  // Handlers for items
  const updateItem = (id: string, updates: Partial<CheckoutItem>) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  // Add naryad lines coming back from the NaryadModal (tooth chart + catalog).
  const handleAddNaryad = (cart: NaryadCartItem[]) => {
    const defaultDoctor = items[0]?.doctor || appointment?.doctor_name || DEFAULT_DOCTORS[0];
    const newItems: CheckoutItem[] = cart.map((c, idx) => ({
      id: `${Date.now()}-${idx}`,
      name: c.teeth.length ? `${c.name} (${c.teeth.join(', ')})` : c.name,
      price: c.price,
      quantity: c.quantity,
      doctor: defaultDoctor,
      duration: '',
      expanded: false
    }));
    const nextItems = [...items, ...newItems];
    setItems(nextItems);
    const nextSubtotal = nextItems.reduce((a, c) => a + c.price * c.quantity, 0);
    const nextPayable = Math.max(0, nextSubtotal - (useBalance ? Math.min(Math.max(0, patient?.balance ?? 0), nextSubtotal) : 0));
    setPayments([{ method: payments[0]?.method || 'Наличные', amount: nextPayable }]);
    setShowNaryad(false);
    // Record each struck naryad in the persisted log.
    if (persistKey != null) {
      const label = 'Сегодня, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      newItems.forEach(n =>
        clinicApi.appendNaryadLog(persistKey, {
          id: Date.now() + Math.floor(Math.random() * 1000),
          patient_id: persistKey,
          patient_name: patientName,
          doctor: n.doctor,
          action: 'added',
          title: n.name,
          author: 'Мухаммад Одилхонов',
          date: label,
          price: n.price * n.quantity
        })
      );
    }
  };

  // Confirm the delete-with-reason prompt: remove one item or clear all, and
  // report each removal (with the reason) so the parent can log it. The removal
  // is also written to the persisted naryad log so it survives reloads.
  const confirmRemove = () => {
    const reasonText =
      removeReason === 'mistake'
        ? (tk('k_21'))
        : (removeComment.trim() || (tk('k_22')));
    const logRemoval = (it: CheckoutItem) => {
      onRemoveItem?.(it, reasonText);
      if (persistKey != null) {
        clinicApi.appendNaryadLog(persistKey, {
          id: Date.now() + Math.floor(Math.random() * 1000),
          patient_id: persistKey,
          patient_name: patientName,
          doctor: it.doctor,
          action: 'removed',
          title: it.name,
          author: 'Мухаммад Одилхонов',
          date: 'Bugun, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          price: it.price * it.quantity,
          reason: reasonText
        });
      }
    };
    if (removeTarget === 'ALL') {
      items.forEach(logRemoval);
      setItems([]);
      if (persistKey != null) {
        clinicApi.clearCheckoutDraft(persistKey);
        clinicApi.clearPatientNaryads(persistKey);
      }
      onClearAll?.();
    } else if (removeTarget) {
      logRemoval(removeTarget);
      const remaining = items.filter(it => it.id !== removeTarget.id);
      setItems(remaining);
      if (remaining.length === 0) {
        if (persistKey != null) {
          clinicApi.clearCheckoutDraft(persistKey);
          clinicApi.clearPatientNaryads(persistKey);
        }
        onClearAll?.();
      }
    }
    setRemoveTarget(null);
    setRemoveReason('mistake');
    setRemoveComment('');
  };

  const handleFinish = () => {
    if (isAdmin) return;
    const methodSummary =
      debtAmount > 0 && paidByMethods === 0
        ? (tk('k'))
        : payments.filter(p => p.amount > 0).map(p => p.method).join(' + ') || (tk('k_34'));
    onComplete({
      isDebt,
      finalTotal,
      paymentMethod: methodSummary,
      items,
      doctorName: items[0]?.doctor || appointment.doctor_name || DEFAULT_DOCTORS[0],
      paidAmount: paidByMethods,
      balanceApplied,
      debtAmount,
      payments: payments.filter(p => p.amount > 0),
      closedBy: user?.name || (tk('k_34')),
      closedByRole: user?.role || ''
    });
    // Paid off -> clear the persisted draft for this patient.
    if (persistKey != null) clinicApi.clearCheckoutDraft(persistKey);
  };

  return (
    <>
    <div className="fixed inset-0 z-50 bg-white dark:bg-slate-900 overflow-y-auto">
      <div className="relative w-full min-h-screen bg-white dark:bg-slate-900 p-6 sm:p-8 md:p-10 flex flex-col justify-between text-slate-800 dark:text-slate-100">
        {/* Top Close */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT SIDE: Services / Work order (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between pb-1">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                {tk('services_order')}
              </h3>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setRemoveTarget('ALL'); setRemoveReason('mistake'); setRemoveComment(''); }}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 hover:underline transition-colors"
                >
                  {tk('k_35')}
                </button>
              )}
            </div>

            {/* List of services or Empty State ("strike a naryad") */}
            <div className="space-y-4">
              {items.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setShowNaryad(true)}
                  className="w-full p-10 border-2 border-dashed border-sky-300 dark:border-sky-800 rounded-2xl text-center space-y-3 bg-sky-50/40 dark:bg-sky-950/20 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors"
                >
                  <div className="w-14 h-14 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-500 mx-auto flex items-center justify-center">
                    <ShoppingCart className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                      {tk('no_naryad_yet')}
                    </h4>
                    <p className="text-xs text-sky-600 dark:text-sky-400 font-semibold mt-1">
                      {tk('click_to_strike_a_naryad')}
                    </p>
                  </div>
                </button>
              ) : (
                items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-sky-300 dark:border-sky-800 bg-sky-50/20 dark:bg-sky-950/20 p-4 transition-all relative"
                  >
                    {/* Service Header Row */}
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-sky-100 dark:border-sky-900/40">
                      <textarea
                        rows={1}
                        value={item.name}
                        onChange={e => updateItem(item.id, { name: e.target.value })}
                        placeholder={tk('type_service_name')}
                        className="flex-1 min-h-[2.25rem] text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 rounded-lg px-2 py-1.5 outline-none resize-none transition-colors placeholder:text-slate-400"
                      />
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                            {(item.price * item.quantity).toLocaleString()} {tk('k_11')}
                          </div>
                          {item.duration && (
                            <div className="text-[11px] text-slate-400 dark:text-slate-500">
                              {item.duration}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => { setRemoveTarget(item); setRemoveReason('mistake'); setRemoveComment(''); }}
                          className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                          title="Удалить пункт"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                  {/* Fields: Количество, Цена, Сотрудник */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-3 items-center">
                    {/* Количество */}
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                        {tk('qty')}
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => updateItem(item.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-full h-9 px-3 text-xs sm:text-sm font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>

                    {/* Цена */}
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                        {tk('price')}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="10000"
                          value={item.price}
                          onChange={e => updateItem(item.id, { price: parseInt(e.target.value) || 0 })}
                          className="w-full h-9 px-3 pr-12 text-xs sm:text-sm font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        <span className="absolute right-2.5 top-2 text-[11px] text-slate-400 font-medium">
                          {tk('k_11')}
                        </span>
                      </div>
                    </div>

                    {/* Сотрудник (Doctor selector) */}
                    <div className="sm:col-span-5 relative">
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                        {tk('doctor_staff')}
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenDoctorDropdownId(openDoctorDropdownId === item.id ? null : item.id)}
                          className="w-full h-9 px-3 text-xs sm:text-sm font-medium text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                          <span className="truncate">{item.doctor}</span>
                          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
                        </button>

                        {/* Doctor Dropdown Menu matching screenshot 4 */}
                        {openDoctorDropdownId === item.id && (
                          <div className="absolute left-0 right-0 top-10 z-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-56 overflow-y-auto py-1">
                            {doctorList.map(docName => {
                              const isSelected = item.doctor === docName;
                              return (
                                <button
                                  key={docName}
                                  type="button"
                                  onClick={() => {
                                    updateItem(item.id, { doctor: docName });
                                    setOpenDoctorDropdownId(null);
                                  }}
                                  className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                                    isSelected
                                      ? 'bg-sky-600 text-white font-medium'
                                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                                  }`}
                                >
                                  <span>{docName}</span>
                                  {isSelected && <UserCheck className="w-3.5 h-3.5 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Collapsible: > Дополнительно */}
                  <div className="mt-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => updateItem(item.id, { expanded: !item.expanded })}
                      className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1 font-medium transition-colors"
                    >
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform ${item.expanded ? 'rotate-90' : ''}`} />
                      <span>{tk('additional')}</span>
                    </button>
                    {item.expanded && (
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 bg-white/70 dark:bg-slate-900/20 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
                        <span className="block mb-1 font-semibold text-[11px] text-slate-600 dark:text-slate-300">
                          {tk('k_36')}
                        </span>
                        <input
                          type="text"
                          placeholder="masalan: 16, 17, 26 (tishlar)..."
                          className="w-full text-xs px-2.5 py-1.5 bg-transparent border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )))}
            </div>

            {/* + Дополнительные пункты — opens the naryad window (tooth chart + catalog) */}
            {items.length > 0 && !isAdmin && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowNaryad(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-700 border border-dashed border-sky-300 dark:border-sky-700 rounded-lg px-4 py-2 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {tk('additional_items')}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* RIGHT SIDE: Patient Info & Billing (5 cols) */}
          <div className="lg:col-span-5 space-y-5 bg-slate-50/60 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800">
            {/* Patient Header Box */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                  {initials}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {patientName}
                  </h4>
                  <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span>{patientPhone}</span>
                  </div>
                </div>
              </div>

              {/* Patient Balance */}
              <div className="text-right">
                <div className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                  {tk('k_37')}
                </div>
                <div
                  className={`text-xs font-bold ${
                    patientBalance < 0
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {patientBalance.toLocaleString()} {tk('k_11')}
                </div>
              </div>
            </div>

            {/* Discount row */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400 font-medium">
                  {tk('discount')}
                </span>
                <div className="flex items-center gap-1 w-28">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={discountPercent}
                    onChange={e => setDiscountPercent(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-full h-8 text-center text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">%</span>
                </div>
              </div>

              {/* Calculated discount label */}
              <div className="flex justify-between text-[11px] text-slate-400 dark:text-slate-500">
                <span>
                  {tk('k_38')} {discountPercent}%
                </span>
                <span>
                  {discountAmount.toLocaleString()} {tk('k_11')}
                </span>
              </div>
            </div>

            {/* Total to Pay */}
            <div className="flex justify-between items-center py-3 border-t border-slate-200 dark:border-slate-800">
              <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                {tk('order_total')}
              </span>
              <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                {finalTotal.toLocaleString()} {som}
              </span>
            </div>

            {/* Prepayment balance — spend it first if the patient has one */}
            {balanceAvailable > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useBalance}
                    onChange={e => setUseBalance(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800"
                  />
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    {tk('from_balance')} ({balanceAvailable.toLocaleString()})
                  </span>
                </label>
                <span className="text-xs font-black text-emerald-700 dark:text-emerald-300">
                  − {balanceApplied.toLocaleString()} {som}
                </span>
              </div>
            )}

            {/* Payable after the balance */}
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                {tk('to_pay')}
              </span>
              <span className="font-bold text-slate-900 dark:text-white">
                {payable.toLocaleString()} {som}
              </span>
            </div>

            {/* Split payment rows: pay part cash, part card, remainder = debt */}
            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {tk('payment_methods')}
                </span>
                <button
                  type="button"
                  onClick={addPaymentRow}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:text-sky-700 border border-dashed border-sky-300 dark:border-sky-700 rounded-lg px-2 py-1 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  {tk('add_method')}
                </button>
              </div>

              {/* Quick Payment Mode Shortcuts */}
              <div className="flex items-center gap-2 pt-1 pb-1">
                <button
                  type="button"
                  onClick={() => setPayments([{ method: 'Наличные', amount: payable }])}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${
                    payments.length === 1 && payments[0].method === 'Наличные' && payments[0].amount === payable && payable > 0
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100'
                  }`}
                >
                  💵 Naqd to'liq
                </button>
                <button
                  type="button"
                  onClick={() => setPayments([{ method: 'Карта', amount: payable }])}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${
                    payments.length === 1 && payments[0].method === 'Карта' && payments[0].amount === payable && payable > 0
                      ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                      : 'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60 hover:bg-sky-100'
                  }`}
                >
                  💳 Karta to'liq
                </button>
                <button
                  type="button"
                  onClick={() => setPayments([{ method: 'Наличные', amount: 0 }])}
                  className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all border ${
                    debtAmount === payable && payable > 0
                      ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                      : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 hover:bg-amber-100'
                  }`}
                  title="Hammasini qarzga yozish"
                >
                  ⚠️ Qarz
                </button>
              </div>

              {payments.map((p, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <select
                      value={p.method}
                      onChange={e => setPaymentMethodAt(idx, e.target.value)}
                      className="w-full h-9 px-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="Наличные">{tk('k_13')}</option>
                      <option value="Карта">{tk('k_39')}</option>
                      <option value="Перевод">{tk('k_14')}</option>
                      <option value="Payme / Click">Payme / Click</option>
                    </select>
                  </div>
                  <div className="col-span-6">
                    <input
                      type="number"
                      min="0"
                      step="10000"
                      value={p.amount || ''}
                      onChange={e => setPaymentAmount(idx, parseInt(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full h-9 px-3 text-xs font-bold text-right bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {payments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePaymentRow(idx)}
                        className="text-slate-400 hover:text-rose-500 p-1"
                        title={tk('k_23')}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Paid so far */}
              <div className="flex justify-between items-center text-xs font-bold pt-1">
                <span className="text-slate-500 dark:text-slate-400">
                  {tk('paid_4')}
                </span>
                <span className="text-slate-900 dark:text-slate-100">
                  {paidByMethods.toLocaleString()} {som}
                </span>
              </div>

              {/* Remainder -> debt */}
              {debtAmount > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 flex items-center justify-between">
                    <span className="font-bold">
                      {tk('goes_to_debt')}
                    </span>
                    <span className="font-black">{debtAmount.toLocaleString()} {som}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-6 mt-6 border-t border-slate-200 dark:border-slate-800">
          {/* Bottom Left: Draft preview */}
          <button
            type="button"
            onClick={() => onPreviewInvoice(items, finalTotal, payments[0]?.method || 'Наличные', isDebt)}
            className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>
              {tk('draft_invoice')}
            </span>
          </button>

          {/* Bottom Right: Закрыть & Завершить */}
          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              {tk('cancel_2')}
            </button>
            {isAdmin ? (
              <div className="px-4 py-2 text-xs font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center gap-1.5 border border-slate-200 dark:border-slate-700">
                <span>🔒</span>
                <span>{tr('checkout.onlyCashierOrDirectorCanClose')}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 rounded-lg transition-colors shadow-md flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-white" />
                <span>
                  {tk('finish')}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>

      {/* NARYAD WINDOW — tooth chart + catalog, opened from "+ Дополнительные пункты" */}
      <NaryadModal
        isOpen={showNaryad}
        onClose={() => setShowNaryad(false)}
        patientName={patientName}
        patientPhone={patientPhone}
        patientBalance={patientBalance}
        doctorId={appointment?.doctor}
        doctorName={appointment?.doctor_name}
        onSave={(cart) => handleAddNaryad(cart)}
      />

      {/* DELETE-WITH-REASON prompt (mistake / other + comment) */}
      {removeTarget !== null && (
        <div className="fixed inset-0 z-[60] bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-800 p-5 text-slate-900 dark:text-white">
            <h4 className="text-sm font-bold mb-1">
              {removeTarget === 'ALL'
                ? (tk('k_40'))
                : (tk('k_15'))}
            </h4>
            <p className="text-[11px] text-slate-400 mb-3">
              {tk('k_41')}
            </p>
            <div className="space-y-2">
              <label className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${removeReason === 'mistake' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40' : 'border-slate-200 dark:border-slate-700'}`}>
                <input type="radio" checked={removeReason === 'mistake'} onChange={() => setRemoveReason('mistake')} className="text-blue-600" />
                <span className="text-xs font-semibold">{tk('k_17')}</span>
              </label>
              <label className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${removeReason === 'other' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40' : 'border-slate-200 dark:border-slate-700'}`}>
                <input type="radio" checked={removeReason === 'other'} onChange={() => setRemoveReason('other')} className="text-blue-600" />
                <span className="text-xs font-semibold">{tk('k_22')}</span>
              </label>
              {removeReason === 'other' && (
                <textarea
                  rows={2}
                  value={removeComment}
                  onChange={e => setRemoveComment(e.target.value)}
                  placeholder={tk('k_19')}
                  className="w-full text-xs p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 resize-none mt-1 text-slate-900 dark:text-white"
                />
              )}
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setRemoveTarget(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition"
              >
                {tk('k_20')}
              </button>
              <button
                onClick={confirmRemove}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition"
              >
                {tk('k_23')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
