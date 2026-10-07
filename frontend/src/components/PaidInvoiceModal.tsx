'use client';

import React, { useRef } from 'react';
import { Appointment, Patient } from '../lib/types';
import { useI18n } from '../lib/i18n';
import { MapPin, Phone, Printer, Receipt, X } from 'lucide-react';

export interface InvoiceItem {
  name: string;
  doctor?: string;
  quantity: number;
  price: number;
  total: number;
}

interface PaidInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: Appointment | null;
  patient?: Patient | null;
  invoiceNumber?: string;
  items?: InvoiceItem[];
  paymentMethod?: string;
  isDebt?: boolean;
  totalAmount?: number;
}

export const PaidInvoiceModal: React.FC<PaidInvoiceModalProps> = ({
  isOpen,
  onClose,
  appointment,
  patient,
  invoiceNumber,
  items,
  paymentMethod = 'По карте',
  isDebt = false,
  totalAmount,
}) => {
  const { language, tk } = useI18n();
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !appointment) return null;

  // Invoice numbering & date formatting
  const currentInvoiceNum = invoiceNumber || `${18200 + (appointment.id % 900)}`;
  const today = new Date();
  const dateStr = today.toLocaleDateString(
    tk('en_us'),
    { day: '2-digit', month: 'long', year: 'numeric' }
  );

  // SOXTA emas: items berilsa AYNAN o'shalar; bo'lmasa qabulning REAL narxi va shifokori
  // (soxta ism/narx ishlatmaymiz).
  const invoiceItems: InvoiceItem[] =
    items && items.length > 0
      ? items
      : (appointment.procedure || appointment.treatment_notes || appointment.price)
      ? [
          {
            name: appointment.procedure || appointment.treatment_notes || (tk('appointment_service') || 'Qabul va muolaja'),
            doctor: appointment.doctor_name || '',
            quantity: 1,
            price: appointment.price || 0,
            total: appointment.price || 0,
          },
        ]
      : [];

  const calcTotal =
    totalAmount !== undefined
      ? totalAmount
      : invoiceItems.reduce((acc, curr) => acc + curr.total, 0);

  const patientName = patient?.full_name || appointment.patient_name || (tk('k_33'));
  const patientPhone = patient?.phone || appointment.patient_phone || '+998 99 795 95 95';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4 overflow-y-auto">
      <div
        ref={printRef}
        className="relative w-full max-w-6xl min-h-[85vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8 md:p-12 my-6 text-slate-800 dark:text-slate-100 print:m-0 print:p-6 print:border-none print:shadow-none print:w-full print:max-w-none flex flex-col justify-between"
      >
        {/* Close Button top right (hidden in print) */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors print:hidden"
          title="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Header matching Screenshot 3 */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-200 dark:border-slate-800 gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="bg-black text-white px-3 py-2 rounded flex items-center gap-2">
              <svg
                className="w-7 h-7 text-amber-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              <div className="leading-tight">
                <span className="font-extrabold tracking-wider text-sm block">DENTAL</span>
                <span className="text-[9px] tracking-widest text-slate-300 block">ACADEMY CLINIC</span>
              </div>
            </div>
          </div>

          {/* Clinic Contact Info */}
          <div className="text-right text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <h2 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              Dental Academy Clinic
            </h2>
            <div className="flex items-center justify-end gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {tk('73')}
              </span>
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-medium">+998 98 142 99 99</span>
            </div>
          </div>
        </div>

        {/* Invoice ID & Patient Info Row */}
        <div className="flex flex-col sm:flex-row justify-between items-start pt-6 pb-4 gap-4">
          <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {tk('invoice')} #{currentInvoiceNum} / {dateStr}
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold mb-0.5">
              {tk('invoice_for')}
            </div>
            <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              {patientName}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {patientPhone}
            </div>
          </div>
        </div>

        {/* Services Table */}
        <div className="mt-4 border-t border-slate-200 dark:border-slate-800">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-400 text-[11px] font-medium uppercase">
                <th className="py-2.5 px-3 text-left">
                  {tk('service_products')}
                </th>
                <th className="py-2.5 px-3 text-center w-24">
                  {tk('qty_2')}
                </th>
                <th className="py-2.5 px-3 text-right w-36">
                  {tk('price_2')}
                </th>
                <th className="py-2.5 px-3 text-right w-36">
                  {tk('total')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {invoiceItems.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-3 text-left">
                    <div className="font-medium text-slate-800 dark:text-slate-200 leading-snug">
                      {item.name}
                    </div>
                    {item.doctor && (
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        {item.doctor}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center text-slate-600 dark:text-slate-300">
                    {item.quantity}
                  </td>
                  <td className="py-3 px-3 text-right font-medium text-slate-700 dark:text-slate-300">
                    {item.price.toLocaleString()} {tk('k_11')}
                  </td>
                  <td className="py-3 px-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                    {item.total.toLocaleString()} {tk('k_11')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Subtotal & Grand Total Rows */}
        <div className="border-t border-slate-200 dark:border-slate-800 mt-2">
          <div className="flex justify-between items-center py-2 px-3 text-xs sm:text-sm">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {tk('total_2')}
            </span>
            <span className="font-bold text-slate-900 dark:text-slate-100">
              {calcTotal.toLocaleString()} {tk('k_11')}
            </span>
          </div>

          <div className="flex justify-between items-center py-2.5 px-3 bg-slate-50/80 dark:bg-slate-800/60 rounded-md font-bold text-xs sm:text-sm">
            <span className="text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px]">
              {tk('total_to_pay')}
            </span>
            <span className="text-slate-900 dark:text-white text-base">
              {calcTotal.toLocaleString()} {tk('k_50')}
            </span>
          </div>
        </div>

        {/* VAT Notice */}
        <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 px-3">
          {tk('prices_include_vat')}
        </div>

        {/* Payment confirmation block */}
        <div className="mt-8 flex justify-end">
          <div className="w-full sm:w-72 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">
              {tk('paid_5')}
            </div>
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className={isDebt ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-700 dark:text-slate-300'}>
                {isDebt
                  ? (tk('k_51'))
                  : paymentMethod}
              </span>
              <span className="text-slate-900 dark:text-slate-100 font-bold">
                {calcTotal.toLocaleString()} {tk('k_11')}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons matching bottom right of Screenshot 3 (print:hidden) */}
        <div className="mt-10 flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Receipt className="w-3.5 h-3.5 text-slate-500" />
            {tk('receipt')}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            {tk('print')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            {tk('close')}
          </button>
        </div>
      </div>
    </div>
  );
};
