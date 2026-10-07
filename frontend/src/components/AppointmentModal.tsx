'use client';

import React, { useState } from 'react';
import { Appointment } from '../lib/types';
import { useI18n } from '../lib/i18n';
import {
  X,
  User,
  Phone,
  Clock,
  DollarSign,
  Send,
  Building2
} from 'lucide-react';

interface AppointmentModalProps {
  appointment: Appointment | null;
  onClose: () => void;
  onStatusChange: (id: number, status: Appointment['status']) => void;
  onRecordPayment: (id: number, amount: number, method: string) => void;
  onToggleSms: (id: number) => void;
}

export default function AppointmentModal({
  appointment,
  onClose,
  onStatusChange,
  onRecordPayment,
  onToggleSms
}: AppointmentModalProps) {
  const { t } = useI18n();
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMethod, setPayMethod] = useState<string>('cash');
  const [showPayForm, setShowPayForm] = useState(false);

  if (!appointment) return null;

  const debt = appointment.price - appointment.paid_amount;

  const handlePaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(payAmount);
    if (!isNaN(amt) && amt > 0) {
      onRecordPayment(appointment.id, amt, payMethod);
      setPayAmount('');
      setShowPayForm(false);
    }
  };

  const statusOptions: { value: Appointment['status']; label: string; color: string }[] = [
    { value: 'confirmed', label: t.statusConfirmed, color: 'bg-emerald-600 text-white' },
    { value: 'in_progress', label: t.statusInProgress, color: 'bg-purple-600 text-white' },
    { value: 'completed', label: t.statusCompleted, color: 'bg-slate-600 text-white' },
    { value: 'debt', label: t.statusDebt, color: 'bg-amber-600 text-white' },
    { value: 'reserved', label: t.statusReserved, color: 'bg-blue-600 text-white' },
    { value: 'cancelled', label: t.statusCancelled, color: 'bg-rose-600 text-white' }
  ];

  const startTimeStr = new Date(appointment.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endTimeStr = new Date(appointment.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-slate-900 dark:text-white transition-colors">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xl">🦷</span>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{t.appointmentDetails} #{appointment.id}</h2>
              <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span>{appointment.chair_name ? `${appointment.chair_name} • ` : ''}{appointment.doctor_name}</span>
                {appointment.branch_name && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 text-[10px] font-semibold text-blue-700 dark:text-sky-300">
                    <Building2 className="w-2.5 h-2.5" />
                    {appointment.branch_name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Patient info box */}
          <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-slate-800/70 border border-blue-100 dark:border-slate-700 flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-blue-600 dark:text-sky-400" />
                <span className="font-bold text-sm text-slate-900 dark:text-white">{appointment.patient_name}</span>
              </div>
              <div className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-400">
                <Phone className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <span>{appointment.patient_phone}</span>
              </div>
              <div className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-400">
                <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <span className="font-mono font-medium">{startTimeStr} - {endTimeStr}</span>
              </div>
            </div>

            <button
              onClick={() => onToggleSms(appointment.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition ${
                appointment.sms_sent
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                  : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-blue-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'
              }`}
            >
              <Send className="w-3 h-3" />
              <span>{appointment.sms_sent ? 'SMS ✓' : t.smsNotification}</span>
            </button>
          </div>

          {/* Treatment notes */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">
              {t.service} / {t.comments}:
            </label>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200">
              {appointment.treatment_notes || 'Konsultatsiya'}
            </div>
          </div>

          {/* Status selector */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-2">
              {t.status}:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onStatusChange(appointment.id, opt.value)}
                  className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition text-center ${
                    appointment.status === opt.value
                      ? `${opt.color} shadow-xs ring-2 ring-offset-1 ring-blue-500`
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Financials & Payment */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block">{t.price}:</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{appointment.price.toLocaleString()} UZS</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block">{t.paid}:</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{appointment.paid_amount.toLocaleString()} UZS</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block">{t.debt}:</span>
                <span className={`text-sm font-bold ${debt > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                  {debt > 0 ? `${debt.toLocaleString()} UZS` : '0 UZS'}
                </span>
              </div>
            </div>

            {!showPayForm ? (
              <button
                onClick={() => {
                  setPayAmount(debt > 0 ? debt.toString() : '100000');
                  setShowPayForm(true);
                }}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-sm"
              >
                <DollarSign className="w-4 h-4" />
                <span>{t.paid} / + To‘lov qabul qilish</span>
              </button>
            ) : (
              <form onSubmit={handlePaySubmit} className="p-3 bg-slate-50 dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>{t.paymentBreakdown}</span>
                  <button
                    type="button"
                    onClick={() => setShowPayForm(false)}
                    className="text-slate-400 hover:text-slate-600 text-[10px]"
                  >
                    {t.cancel}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-0.5">{t.sum} (UZS)</label>
                    <input
                      type="number"
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="w-full text-xs font-bold p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 dark:text-slate-400 block mb-0.5">{t.paymentMethod}</label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="w-full text-xs font-medium p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                    >
                      <option value="cash">{t.cash}</option>
                      <option value="card">{t.card}</option>
                      <option value="transfer">{t.transfer}</option>
                      <option value="insurance">{t.insurance}</option>
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition"
                >
                  {t.save}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white rounded-xl text-xs font-bold transition"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
