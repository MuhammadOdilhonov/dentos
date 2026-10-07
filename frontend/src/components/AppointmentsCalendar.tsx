'use client';

import React, { useState, useEffect } from 'react';
import CalendarGrid from './CalendarGrid';
import AppointmentPopover, { STATUS_CONFIG } from './AppointmentPopover';
import { PaidInvoiceModal, InvoiceItem } from './PaidInvoiceModal';
import { ActiveCheckoutModal } from './ActiveCheckoutModal';
import NewAppointmentModal from './NewAppointmentModal';
import { clinicApi } from '../lib/api';
import { Employee, Patient, Appointment, AppointmentStatus, WorkplaceItem } from '../lib/types';
import { useBranch } from '../lib/branchContext';
import { useI18n } from '../lib/i18n';

export default function AppointmentsCalendar() {
  const { currentBranchId, currentBranch } = useBranch();
  const { language, tr } = useI18n();
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [dismissedOnline, setDismissedOnline] = useState<number[]>([]);

  // Telegram/online booking bannerini bir marta ko'rsatib, rad etilganini eslab qolamiz
  useEffect(() => {
    try {
      const raw = localStorage.getItem('32desk_dismissed_online_apts');
      if (raw) setDismissedOnline(JSON.parse(raw));
    } catch {}
  }, []);
  const dismissOnline = (id: number) => {
    setDismissedOnline((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      try { localStorage.setItem('32desk_dismissed_online_apts', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [workplaces, setWorkplaces] = useState<WorkplaceItem[]>([]);

  useEffect(() => {
    async function loadWorkplaces() {
      const data = await clinicApi.getWorkplaces(currentBranchId || undefined);
      setWorkplaces(data || []);
    }
    loadWorkplaces();
  }, [currentBranchId]);

  // Modals state
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [selectedCardRect, setSelectedCardRect] = useState<DOMRect | null>(null);
  const [isActiveCheckoutOpen, setIsActiveCheckoutOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceData, setInvoiceData] = useState<{
    items?: InvoiceItem[];
    paymentMethod?: string;
    isDebt?: boolean;
    totalAmount?: number;
  }>({});

  // New appointment modal state
  const [isNewAptModalOpen, setIsNewAptModalOpen] = useState(false);
  const [slotDoctorId, setSlotDoctorId] = useState<number | undefined>(undefined);
  const [slotTime, setSlotTime] = useState<string>('09:30');
  const [appointmentToEdit, setAppointmentToEdit] = useState<Appointment | null>(null);

  const dateParam = currentDate.toISOString().split('T')[0];

  const loadData = async () => {
    // Load ALL appointments so the calendar can render day / 3-day / week / month views.
    const [empData, patData, aptData] = await Promise.all([
      clinicApi.getEmployees(),
      clinicApi.getPatients(),
      clinicApi.getAppointments()
    ]);
    setEmployees(empData);
    setPatients(patData);
    setAppointments(aptData);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData();
    }, 8000);
    return () => clearInterval(interval);
  }, [dateParam]);

  // Click an appointment card on calendar grid
  const handleSelectAppointment = (apt: Appointment, rect?: DOMRect) => {
    setSelectedAppointment(apt);
    setSelectedCardRect(rect || null);
    setIsPopoverOpen(true);
  };

  // Status change handler (called from Popover or anywhere)
  const handleStatusChange = async (id: number, status: AppointmentStatus) => {
    await clinicApi.updateAppointmentStatus(id, status);
    const color = STATUS_CONFIG[status]?.color || '#3B82F6';

    const targetApt = appointments.find(a => a.id === id);
    if (status === 'completed' && targetApt && (targetApt.paid_amount < targetApt.price || targetApt.paid_amount === 0)) {
      const amountToPay = targetApt.paid_amount === 0 ? (targetApt.price || 350000) : (targetApt.price - targetApt.paid_amount);
      await clinicApi.recordPayment(id, amountToPay, 'Наличные', targetApt.doctor_name || 'Kassir', 'cash');
    }

    setAppointments((prev) =>
      prev.map((apt) => (apt.id === id ? { ...apt, status, color_code: color, paid_amount: status === 'completed' ? (apt.price || apt.paid_amount) : apt.paid_amount } : apt))
    );

    if (selectedAppointment && selectedAppointment.id === id) {
      setSelectedAppointment((prev) => (prev ? { ...prev, status, color_code: color, paid_amount: status === 'completed' ? (prev.price || prev.paid_amount) : prev.paid_amount } : null));
    }
  };

  // Opening the bill from popover
  const handleOpenBill = (apt: Appointment) => {
    setIsPopoverOpen(false);

    if (apt.status === 'completed') {
      // Completed -> Open Paid Invoice Modal directly (Screenshot 3)
      setInvoiceData({
        items: [
          {
            name: apt.procedure || apt.treatment_notes || 'Консультация врача',
            doctor: apt.doctor_name,
            quantity: 1,
            price: apt.price || 1500000,
            total: apt.price || 1500000
          }
        ],
        paymentMethod: 'По карте',
        isDebt: false,
        totalAmount: apt.price || 1500000
      });
      setIsInvoiceModalOpen(true);
    } else {
      // Not completed -> Open Active Checkout / Work Order Modal (Screenshot 4)
      // Do not auto-strike or force-create a fake naryad; only existing draft or empty
      setIsActiveCheckoutOpen(true);
    }
  };

  // When checkout modal finishes (Screenshot 4 completion)
  const handleCheckoutComplete = async (data: {
    isDebt: boolean;
    finalTotal: number;
    paymentMethod: string;
    items: Array<{ name: string; price: number; quantity: number; doctor: string }>;
    doctorName: string;
    paidAmount: number;
    balanceApplied: number;
    debtAmount: number;
    payments: { method: string; amount: number }[];
    closedBy: string;
    closedByRole: string;
  }) => {
    if (!selectedAppointment) return;

    const patientId = selectedAppointment.patient;

    // Spend the prepayment balance, record real money paid, and put any
    // remainder into debt (split-payment aware).
    if (patientId && data.balanceApplied > 0) {
      await clinicApi.updatePatientBalance(patientId, -data.balanceApplied);
    }
    if (data.paidAmount > 0) {
      await clinicApi.recordPayment(selectedAppointment.id, data.paidAmount, data.paymentMethod);
    }
    if (data.debtAmount > 0) {
      if (patientId) await clinicApi.updatePatientBalance(patientId, -data.debtAmount);
      await clinicApi.updateAppointmentStatus(selectedAppointment.id, 'debt');
    } else {
      await clinicApi.updateAppointmentStatus(selectedAppointment.id, 'completed');
    }

    // Synchronize to patient profile (Оплаты, Карзинка, Лечение)
    if (patientId) {
      const existingPayments = clinicApi.getPatientPayments(patientId);
      const newPayment = {
        id: Date.now(),
        date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
        status: data.isDebt ? 'Отменен' : 'Оплачен',
        paid: data.isDebt ? (data.paidAmount || 0) : data.finalTotal,
        total: data.finalTotal,
        method: data.paymentMethod,
        operator: data.closedBy || selectedAppointment.doctor_name || '',
        operator_role: data.closedByRole || '',
        target: data.debtAmount > 0 ? 'debt' : 'balance',
        description: data.items.map(i => `${i.name} (${i.quantity}x)`).join(', ')
      };
      clinicApi.savePatientPayments(patientId, [newPayment, ...existingPayments]);

      // Clear patient karzinka & draft
      clinicApi.clearPatientNaryads(patientId);
      clinicApi.clearCheckoutDraft(patientId);

      // Record treatment into patient treatments history
      const existingTreatments = clinicApi.getPatientTreatments(patientId);
      const newTreatments = data.items.map((it, idx) => ({
        id: Date.now() + idx,
        title: it.name,
        doctor: it.doctor || selectedAppointment.doctor_name || 'Сардор Алимов',
        price: it.price * it.quantity,
        status: data.isDebt ? 'Долг' : 'Сделано',
        date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
      }));
      clinicApi.savePatientTreatments(patientId, [...newTreatments, ...existingTreatments]);
    }

    // Refresh data
    await loadData();

    // Prepare items for paid invoice display
    const mappedItems: InvoiceItem[] = data.items.map(item => ({
      name: item.name,
      doctor: item.doctor,
      quantity: item.quantity,
      price: item.price,
      total: item.price * item.quantity
    }));

    setInvoiceData({
      items: mappedItems,
      paymentMethod: data.paymentMethod,
      isDebt: data.isDebt,
      totalAmount: data.finalTotal
    });

    setIsActiveCheckoutOpen(false);
    setIsInvoiceModalOpen(true);
  };

  // Preview invoice from ActiveCheckoutModal
  const handlePreviewInvoice = (
    items: Array<{ name: string; price: number; quantity: number; doctor: string }>,
    total: number,
    paymentMethod: string,
    isDebt: boolean
  ) => {
    const mappedItems: InvoiceItem[] = items.map(item => ({
      name: item.name,
      doctor: item.doctor,
      quantity: item.quantity,
      price: item.price,
      total: item.price * item.quantity
    }));

    setInvoiceData({
      items: mappedItems,
      paymentMethod,
      isDebt,
      totalAmount: total
    });
    setIsInvoiceModalOpen(true);
  };

  // Click on empty slot
  const handleSlotClick = (doctorId: number, timeStr: string) => {
    setAppointmentToEdit(null);
    setSlotDoctorId(doctorId);
    setSlotTime(timeStr);
    setIsNewAptModalOpen(true);
  };

  // Edit appointment from Popover
  const handleEditAppointment = (apt: Appointment) => {
    setIsPopoverOpen(false);
    setAppointmentToEdit(apt);
    setIsNewAptModalOpen(true);
  };

  // Delete appointment from Popover
  const handleDeleteAppointment = async (id: number) => {
    await clinicApi.deleteAppointment(id);
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    if (selectedAppointment && selectedAppointment.id === id) {
      setSelectedAppointment(null);
    }
    setIsPopoverOpen(false);
  };

  // Save new or updated appointment
  const handleSaveNewAppointment = async (aptData: Partial<Appointment>) => {
    if (appointmentToEdit) {
      await clinicApi.updateAppointment(appointmentToEdit.id, aptData);
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointmentToEdit.id ? { ...a, ...aptData } : a))
      );
      setAppointmentToEdit(null);
    } else {
      const branchVal = currentBranchId || (aptData.branch ?? undefined);
      const branchNameVal = currentBranch?.name || aptData.branch_name || undefined;
      const created = await clinicApi.createAppointment({
        ...aptData,
        branch: branchVal,
        branch_name: branchNameVal
      });
      setAppointments((prev) => [created, ...prev]);
    }
    setIsNewAptModalOpen(false);
  };

  // Selected patient
  const currentPatient = patients.find(p => p.id === selectedAppointment?.patient) || null;

  // Helper to extract integer branch ID
  const getBranchId = (branch: any): number | null => {
    if (!branch) return null;
    if (typeof branch === 'object' && branch.id !== undefined) return Number(branch.id);
    const n = Number(branch);
    return isNaN(n) ? null : n;
  };

  // Branch filtered view:
  const displayEmployees = currentBranchId
    ? employees.filter((e) => {
        const bId = getBranchId(e.branch);
        if (bId === Number(currentBranchId)) return true;
        return appointments.some((a) => a.doctor === e.id && getBranchId(a.branch) === Number(currentBranchId));
      })
    : employees;

  const displayAppointments = currentBranchId
    ? appointments.filter((a) => {
        const bId = getBranchId(a.branch);
        if (bId !== null) return bId === Number(currentBranchId);
        const doc = employees.find((e) => e.id === a.doctor);
        if (doc && doc.branch) return getBranchId(doc.branch) === Number(currentBranchId);
        return true;
      })
    : appointments;

  const displayWorkplaces = currentBranchId
    ? workplaces.filter((w) => getBranchId(w.branch) === Number(currentBranchId))
    : workplaces;

  // Online/Telegram bookinglar — FAQAT kelgusi (o'tib ketmagan) qabullar, eng yaqini birinchi
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const onlineAppointments = appointments.filter((a) => {
    const notes = (a.treatment_notes || '').toLowerCase();
    const isOnline = notes.includes('onlayn') || notes.includes('telegram') || notes.includes('ai');
    return isOnline && new Date(a.start_time) >= startOfToday;
  }).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  // eng yaqin kelgusi, hali rad etilmagan bookingni ko'rsatamiz
  const latestOnlineApt = onlineAppointments.find((a) => !dismissedOnline.includes(a.id)) || null;
  const isOnlineAptDifferentDate = latestOnlineApt
    ? new Date(latestOnlineApt.start_time).toDateString() !== currentDate.toDateString()
    : false;
  const bannerDateLocale = language === 'uz' ? 'uz-UZ' : language === 'en' ? 'en-US' : 'ru-RU';

  return (
    <div className="h-full flex flex-col space-y-3">
      {/* Telegram / AI Online Booking Alert Banner */}
      {latestOnlineApt && isOnlineAptDifferentDate && (
        <div className="bg-gradient-to-r from-sky-500/10 via-blue-500/10 to-indigo-500/10 border border-sky-300 dark:border-sky-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-xs transition-all">
          <div className="flex items-center space-x-2.5">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
            </span>
            <span className="text-xs font-bold text-sky-900 dark:text-sky-200">
              {tr('calbanner.newViaTelegram')}
            </span>
            <span className="text-xs text-slate-700 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-white">
                {patients.find((p) => p.id === latestOnlineApt.patient)?.full_name || latestOnlineApt.patient_name || 'Muhammad Odilxonov'}
              </strong>{' '}
              —{' '}
              <span className="font-semibold text-blue-600 dark:text-sky-400">
                {new Date(latestOnlineApt.start_time).toLocaleDateString(bannerDateLocale, { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>{' '}
              {tr('calbanner.atWord')}{' '}
              <span className="font-semibold text-blue-600 dark:text-sky-400">
                {new Date(latestOnlineApt.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>{' '}
              ({employees.find((e) => e.id === latestOnlineApt.doctor)?.full_name || latestOnlineApt.doctor_name || 'Dr. Alimov'})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setCurrentDate(new Date(latestOnlineApt.start_time)); dismissOnline(latestOnlineApt.id); }}
              className="px-3 py-1 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer flex items-center space-x-1"
            >
              <span>{tr('calbanner.goToDate')}</span>
              <span>→</span>
            </button>
            <button
              onClick={() => dismissOnline(latestOnlineApt.id)}
              title={tr('calbanner.closeTitle')}
              className="w-6 h-6 flex items-center justify-center rounded-lg text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition cursor-pointer text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Calendar Grid Container */}
      <div className="flex-1 min-h-0">
        <CalendarGrid
          currentDate={currentDate}
          onDateChange={setCurrentDate}
          employees={displayEmployees}
          appointments={displayAppointments}
          onSelectAppointment={handleSelectAppointment}
          onSlotClick={handleSlotClick}
          workplaces={displayWorkplaces}
          currentBranchId={currentBranchId}
        />
      </div>

      {/* Appointment Popover matching Screenshot 1 & 2 */}
      {isPopoverOpen && selectedAppointment && (
        <AppointmentPopover
          appointment={selectedAppointment}
          patient={currentPatient}
          anchorRect={selectedCardRect}
          onClose={() => {
            setIsPopoverOpen(false);
            setSelectedCardRect(null);
          }}
          onStatusChange={handleStatusChange}
          onOpenBill={handleOpenBill}
          onEdit={handleEditAppointment}
          onDelete={handleDeleteAppointment}
        />
      )}

      {/* Active Checkout & Work Order Modal matching Screenshot 4 */}
      {isActiveCheckoutOpen && selectedAppointment && (
        <ActiveCheckoutModal
          isOpen={isActiveCheckoutOpen}
          onClose={() => setIsActiveCheckoutOpen(false)}
          appointment={selectedAppointment}
          patient={currentPatient}
          onComplete={handleCheckoutComplete}
          onPreviewInvoice={handlePreviewInvoice}
          persistKey={selectedAppointment.patient}
          onClearAll={async () => {
            if (selectedAppointment) {
              await clinicApi.updateAppointment(selectedAppointment.id, {
                procedure: '',
                treatment_notes: '',
                price: 0
              });
              setAppointments(prev => prev.map(a => a.id === selectedAppointment.id ? { ...a, procedure: '', treatment_notes: '', price: 0 } : a));
              setSelectedAppointment(prev => prev ? { ...prev, procedure: '', treatment_notes: '', price: 0 } : null);
            }
          }}
          onRemoveItem={(item, reason) => {
            // Already logged and updated in-place by ActiveCheckoutModal
          }}
        />
      )}

      {/* Paid Invoice Modal matching Screenshot 3 */}
      {isInvoiceModalOpen && selectedAppointment && (
        <PaidInvoiceModal
          isOpen={isInvoiceModalOpen}
          onClose={() => setIsInvoiceModalOpen(false)}
          appointment={selectedAppointment}
          patient={currentPatient}
          items={invoiceData.items}
          paymentMethod={invoiceData.paymentMethod}
          isDebt={invoiceData.isDebt}
          totalAmount={invoiceData.totalAmount}
        />
      )}

      {/* New / Edit Appointment Modal */}
      <NewAppointmentModal
        isOpen={isNewAptModalOpen}
        onClose={() => {
          setIsNewAptModalOpen(false);
          setAppointmentToEdit(null);
        }}
        onSave={handleSaveNewAppointment}
        employees={displayEmployees}
        patients={patients}
        defaultDoctorId={slotDoctorId}
        defaultTime={slotTime}
        selectedDate={dateParam}
        appointmentToEdit={appointmentToEdit}
        branchId={currentBranchId || undefined}
        branchName={currentBranch?.name || undefined}
      />
    </div>
  );
}
