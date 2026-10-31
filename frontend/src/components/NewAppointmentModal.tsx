'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Employee, Patient, Appointment } from '../lib/types';
import { clinicApi } from '../lib/api';
import { useI18n } from '../lib/i18n';
import NaryadModal, { NaryadCartItem } from './NaryadModal';
import PhoneInput from './PhoneInput';
import {
  X,
  User,
  Plus,
  Calendar,
  Clock,
  BellOff,
  Bell,
  FileText,
  Calculator,
  ChevronDown,
  Check,
  Armchair,
  Stethoscope,
  Building2
} from 'lucide-react';

interface NewAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (appointmentData: Partial<Appointment>) => void;
  employees: Employee[];
  patients: Patient[];
  defaultDoctorId?: number;
  defaultTime?: string;
  selectedDate?: string;
  // When opened from a patient page, the patient is pre-selected (like 32desk).
  presetPatient?: Patient | null;
  appointmentToEdit?: Appointment | null;
  branchId?: number;
  branchName?: string;
}

export default function NewAppointmentModal({
  isOpen,
  onClose,
  onSave,
  employees,
  patients,
  defaultDoctorId,
  defaultTime = '09:30',
  selectedDate,
  presetPatient,
  appointmentToEdit,
  branchId,
  branchName
}: NewAppointmentModalProps) {
  const { t, language, tk, tr } = useI18n();

  // Patient search & selection
  const [searchPatientText, setSearchPatientText] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Inline new patient fields (shown if search doesn't match or user creates new)
  const [inlinePhone, setInlinePhone] = useState('+998 ');
  const [inlineBirthDate, setInlineBirthDate] = useState('');
  const [inlineGender, setInlineGender] = useState<'Мужчина' | 'Женщина'>('Мужчина');

  // Appointment details
  const [selectedDoctorId, setSelectedDoctorId] = useState<number>(defaultDoctorId || employees[0]?.id || 1);
  const [serviceName, setServiceName] = useState('');
  const [servicePrice, setServicePrice] = useState<number>(0);
  const [startTime, setStartTime] = useState(defaultTime);
  const [duration, setDuration] = useState('1ч.');
  const [workplace, setWorkplace] = useState('Кресло 1');
  const [dontNotify, setDontNotify] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [treatmentNote, setTreatmentNote] = useState('');
  const [serviceLang, setServiceLang] = useState<'uz' | 'ru' | 'en'>('uz');

  // Optional services (naryad) — booking does NOT strike a naryad; these are just planned.
  // The actual naryad is struck later from the patient card. Adding services opens the big NaryadModal.
  const [showServiceNaryad, setShowServiceNaryad] = useState(false);
  const [addedServices, setAddedServices] = useState<NaryadCartItem[]>([]);

  // Update default doctor and time when props change
  useEffect(() => {
    if (defaultDoctorId) setSelectedDoctorId(defaultDoctorId);
    if (defaultTime) setStartTime(defaultTime);
  }, [defaultDoctorId, defaultTime]);

  useEffect(() => {
    if (!isOpen) return;

    if (appointmentToEdit) {
      setSearchPatientText(appointmentToEdit.patient_name || '');
      const pat = patients.find(p => p.id === appointmentToEdit.patient);
      setSelectedPatient(pat || null);
      setServiceLang(appointmentToEdit.patient_service_lang || pat?.service_lang || 'uz');
      setInlinePhone(appointmentToEdit.patient_phone || '+998 ');
      setInlineBirthDate('');
      setInlineGender('Мужчина');
      setSelectedDoctorId(appointmentToEdit.doctor || employees[0]?.id || 1);
      setServiceName(appointmentToEdit.procedure || '');
      setServicePrice(appointmentToEdit.price || 0);
      try {
        const d = new Date(appointmentToEdit.start_time);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        setStartTime(`${hh}:${mm}`);
        const durMinutes = Math.max(30, Math.round((new Date(appointmentToEdit.end_time).getTime() - d.getTime()) / 60000));
        if (durMinutes <= 30) setDuration('30мин.');
        else if (durMinutes <= 60) setDuration('1ч.');
        else if (durMinutes <= 90) setDuration('1.5ч.');
        else setDuration('2ч.');
      } catch {
        setStartTime(defaultTime || '09:30');
      }
      setWorkplace(appointmentToEdit.chair_name || '');
      setDontNotify(!appointmentToEdit.sms_sent);
      setShowNoteInput(Boolean(appointmentToEdit.treatment_notes));
      setTreatmentNote(appointmentToEdit.treatment_notes || '');
      setAddedServices([]);
      setShowServiceNaryad(false);
      return;
    }

    setSearchPatientText(presetPatient ? presetPatient.full_name : '');
    setSelectedPatient(presetPatient || null);
    setServiceLang(presetPatient?.service_lang || 'uz');
    setInlinePhone('+998 ');
    setInlineBirthDate('');
    setInlineGender('Мужчина');
    setSelectedDoctorId(defaultDoctorId || employees[0]?.id || 1);
    setServiceName(''); // service is optional — doctor/admin adds the naryad later
    setServicePrice(0);
    setStartTime(defaultTime || '09:30');
    setDuration('1ч.');
    setWorkplace(''); // chair is optional at booking time
    setDontNotify(false);
    setShowNoteInput(false);
    setTreatmentNote('');
    setAddedServices([]);
    setShowServiceNaryad(false);
  }, [isOpen, appointmentToEdit]);

  // Autocomplete search results from patients list
  const searchResults = useMemo(() => {
    if (!searchPatientText.trim() || selectedPatient) return [];
    const query = searchPatientText.toLowerCase();
    return patients.filter(
      (p) => p.full_name.toLowerCase().includes(query) || p.phone.includes(query)
    );
  }, [searchPatientText, patients, selectedPatient]);

  const isPatientNotFound = searchPatientText.trim().length > 2 && searchResults.length === 0 && !selectedPatient;

  if (!isOpen) return null;

  // Selected date formatted
  const activeDate = selectedDate ? new Date(selectedDate) : new Date();
  const localeMap = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-US' };
  const dateFormatted = activeDate.toLocaleDateString(localeMap[language] || 'ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'long'
  });

  // Calculate end time
  const calculateEndTime = () => {
    const [h, m] = startTime.split(':').map(Number);
    let durMinutes = 60;
    if (duration === '30мин.') durMinutes = 30;
    if (duration === '1ч.') durMinutes = 60;
    if (duration === '1.5ч.') durMinutes = 90;
    if (duration === '2ч.') durMinutes = 120;

    const totalMinutes = h * 60 + m + durMinutes;
    const endH = Math.floor(totalMinutes / 60) % 24;
    const endM = totalMinutes % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  };

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setSearchPatientText(patient.full_name);
    if (patient.service_lang) {
      setServiceLang(patient.service_lang);
    }
  };

  const handleClearPatient = () => {
    setSelectedPatient(null);
    setSearchPatientText('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const patientName = selectedPatient ? selectedPatient.full_name : searchPatientText.trim();
    if (!patientName) return;

    const patientPhone = selectedPatient ? selectedPatient.phone : inlinePhone;
    const doctor = employees.find((emp) => emp.id === selectedDoctorId);
    const endTimeStr = calculateEndTime();

    const baseDateStr = selectedDate || new Date().toISOString().split('T')[0];
    const startISO = `${baseDateStr}T${startTime}:00`;
    const endISO = `${baseDateStr}T${endTimeStr}:00`;

    // Planned services (from the naryad modal) — no naryad is struck here unless user selected services
    const servicesTotal = addedServices.reduce((s, it) => s + it.price * it.quantity, 0);
    const plannedName = addedServices.length
      ? addedServices.map((s) => s.name).join(', ')
      : serviceName.trim();
    const finalPrice = addedServices.length ? servicesTotal : servicePrice;

    const patientId = selectedPatient?.id || Date.now();
    if (addedServices.length > 0) {
      const draftItems = addedServices.map((s, idx) => ({
        id: `apt-srv-${Date.now()}-${idx}`,
        name: s.name,
        price: s.price,
        quantity: s.quantity,
        doctor: doctor?.full_name || ''
      }));
      clinicApi.saveCheckoutDraft(patientId, draftItems);
      const patientItems = addedServices.map((s, idx) => ({
        id: Date.now() + idx,
        title: s.name,
        name: s.name,
        unitPrice: s.price,
        teeth: s.teeth || [],
        doctor: doctor?.full_name || '',
        date: 'Bugun',
        price: s.price * s.quantity,
        isDebt: false,
        quantity: s.quantity
      }));
      clinicApi.savePatientNaryads(patientId, patientItems);
    }

    onSave({
      ...(appointmentToEdit ? { id: appointmentToEdit.id } : {}),
      patient: patientId,
      patient_name: patientName,
      patient_phone: patientPhone,
      patient_service_lang: serviceLang,
      doctor: selectedDoctorId,
      doctor_name: doctor?.full_name || '',
      doctor_color: doctor?.color || '#0EA5E9',
      branch: branchId || doctor?.branch || appointmentToEdit?.branch || undefined,
      branch_name: branchName || doctor?.branch_name || appointmentToEdit?.branch_name || undefined,
      start_time: startISO,
      end_time: endISO,
      treatment_notes: treatmentNote ? (plannedName ? `${plannedName} • ${treatmentNote}` : treatmentNote) : (plannedName || 'Konsultatsiya'),
      procedure: plannedName || '',
      sms_sent: !dontNotify,
      status: appointmentToEdit ? appointmentToEdit.status : 'unconfirmed',
      color_code: doctor?.color || '#F59E0B',
      price: finalPrice,
      paid_amount: appointmentToEdit ? appointmentToEdit.paid_amount : 0,
      chair_name: workplace
    });

    // Bemorning tanlangan xizmat tilini darhol saqlab qo'yamiz
    if (patientId) {
      clinicApi.updatePatientLang(patientId, serviceLang);
    }
  };

  const doctors = employees.filter(e => e.role === 'doctor');

  return (
    <>
    <div className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 my-auto text-slate-900 dark:text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold">
              {appointmentToEdit
                ? (tr('newapptx.editAppointment'))
                : tk('new_appointment')}
            </h2>
            {branchName && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 border border-blue-200 dark:border-blue-800">
                <Building2 className="w-3.5 h-3.5" />
                {branchName}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Пациент */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
              <User className="w-4 h-4" />
              {tk('patient')}
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={searchPatientText}
                onChange={(e) => {
                  setSearchPatientText(e.target.value);
                  if (selectedPatient) setSelectedPatient(null);
                }}
                placeholder={
                  tk('name_or_phone')
                }
                className="w-full text-sm p-3.5 bg-white dark:bg-slate-800 border-2 border-blue-400 focus:border-blue-600 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/10 text-slate-900 dark:text-white transition"
              />
              {searchPatientText && (
                <button
                  type="button"
                  onClick={handleClearPatient}
                  className="absolute right-3.5 top-4 text-slate-400 hover:text-slate-600 text-sm font-bold"
                >
                  ✕
                </button>
              )}

              {searchResults.length > 0 && !selectedPatient && (
                <div className="absolute left-0 right-0 top-16 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-56 overflow-y-auto p-1.5 space-y-1">
                  {searchResults.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleSelectPatient(p)}
                      className="p-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-between text-xs transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-bold flex items-center justify-center text-[10px]">
                          {p.full_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{p.full_name}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">{p.phone}</p>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-blue-600 dark:text-sky-400">
                        {tk('select')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedPatient && (
              <div className="mt-2 p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="font-bold text-blue-900 dark:text-blue-200">{selectedPatient.full_name}</span>
                  <span className="text-slate-500 dark:text-slate-400">({selectedPatient.phone})</span>
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {tk('k_27')}: {selectedPatient.balance.toLocaleString()} UZS
                </span>
              </div>
            )}

            {isPatientNotFound && (
              <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2 animate-in fade-in">
                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-sky-400">
                  <Plus className="w-3.5 h-3.5" />
                  {tk('k_42')}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <PhoneInput
                    value={inlinePhone}
                    onChange={setInlinePhone}
                    className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                  <select
                    value={inlineGender}
                    onChange={(e) => setInlineGender(e.target.value as 'Мужчина' | 'Женщина')}
                    className="text-xs p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none"
                  >
                    <option value="Мужчина">{tr('newappt.male')}</option>
                    <option value="Женщина">{tr('newappt.female')}</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Date + time bar */}
          <div className="flex items-center gap-2 p-3.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="font-medium capitalize">{dateFormatted}</span>
            <span className="text-slate-400">—</span>
            <span className="font-mono font-semibold">{startTime}</span>
          </div>

          {/* Doctor / Start / Duration (service is added separately as a naryad below) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                {tk('doctor')}
              </label>
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(Number(e.target.value))}
                className="w-full text-sm p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 text-slate-900 dark:text-white"
              >
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                {tk('start')}
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full text-sm p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-mono text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                {tk('duration')}
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full text-sm p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 text-slate-900 dark:text-white"
              >
                <option value="30мин.">30 {tk('dur_min_short')}</option>
                <option value="1ч.">1 {tk('dur_hour_short')}</option>
                <option value="1.5ч.">1.5 {tk('dur_hour_short')}</option>
                <option value="2ч.">2 {tk('dur_hour_short')}</option>
              </select>
            </div>
          </div>

          {/* Chair */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              {tk('chair')}
            </label>
            <select
              value={workplace}
              onChange={(e) => setWorkplace(e.target.value)}
              className="w-full text-sm p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 text-slate-900 dark:text-white"
            >
              <option value="">{tk('not_set')}</option>
              {[1, 2, 3, 4].map((num) => (
                <option key={num} value={`Кресло ${num}`}>
                  {`${tk('chair_num')} ${num}`}
                </option>
              ))}
            </select>
          </div>

          {/* Services (naryad) — booking does NOT strike a naryad; it's optional/planned */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              {tk('services_naryad_optional')}
            </label>
            {addedServices.length === 0 ? (
              <button
                type="button"
                onClick={() => setShowServiceNaryad(true)}
                className="w-full py-6 rounded-2xl border-2 border-dashed border-blue-300 dark:border-blue-800 text-blue-600 dark:text-sky-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 font-bold text-sm flex flex-col items-center justify-center gap-1.5 transition"
              >
                <Plus className="w-6 h-6" />
                <span>{tk('add_a_service')}</span>
                <span className="text-[11px] font-medium text-slate-400">
                  {tk('k_47')}
                </span>
              </button>
            ) : (
              <div className="space-y-2 rounded-2xl border border-slate-200 dark:border-slate-700 p-3">
                {addedServices.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-slate-700 dark:text-slate-200">
                      {s.name}{s.teeth.length ? ` (${s.teeth.join(', ')})` : ''} × {s.quantity}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold font-mono">{(s.price * s.quantity).toLocaleString()}</span>
                      <button
                        type="button"
                        onClick={() => setAddedServices((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-sm font-bold">
                  <span>{tk('k_10')}</span>
                  <span className="font-mono">
                    {addedServices.reduce((a, s) => a + s.price * s.quantity, 0).toLocaleString()} UZS
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowServiceNaryad(true)}
                  className="w-full mt-1 py-2 rounded-xl border border-dashed border-blue-300 dark:border-blue-800 text-blue-600 dark:text-sky-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-xs font-bold transition"
                >
                  + {tk('k_48')}
                </button>
              </div>
            )}
          </div>

          {/* Notify toggle + Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDontNotify(!dontNotify)}
              className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition ${
                dontNotify
                  ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 text-amber-800 dark:text-amber-200'
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {dontNotify ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
              <span>
                {dontNotify
                  ? tk('k_55')
                  : tk('sms')}
              </span>
            </button>
            <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={treatmentNote}
                onChange={(e) => setTreatmentNote(e.target.value)}
                placeholder={tk('add_a_note')}
                className="flex-1 text-sm bg-transparent outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Service Language (Xizmat tili — xabarlar shu tilda yuboriladi) */}
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-base">🌐</span>
              <div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                  {tr('newappt.serviceLanguageRemindersAreSentIn')}
                </span>
                <span className="text-[11px] text-slate-400">
                  {tr('newappt.canBeChangedAtAnyTime')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <button
                type="button"
                onClick={() => setServiceLang('uz')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  serviceLang === 'uz'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                🇺🇿 O‘zbek
              </button>
              <button
                type="button"
                onClick={() => setServiceLang('ru')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  serviceLang === 'ru'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                🇷🇺 Русский
              </button>
              <button
                type="button"
                onClick={() => setServiceLang('en')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  serviceLang === 'en'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                🇬🇧 English
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition"
            >
              {tk('cancel_3')}
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/25 transition active:scale-95"
            >
              {tk('save')}
            </button>
          </div>
        </form>
      </div>
    </div>

    {/* Big naryad modal for adding services (booking does not strike the naryad) */}
    <NaryadModal
      isOpen={showServiceNaryad}
      onClose={() => setShowServiceNaryad(false)}
      patientName={selectedPatient?.full_name || searchPatientText || (tk('k_49'))}
      patientPhone={selectedPatient?.phone || inlinePhone}
      patientBalance={selectedPatient?.balance || 0}
      doctorId={selectedDoctorId}
      doctorName={employees.find(e => e.id === selectedDoctorId)?.full_name}
      onSave={(items) => {
        setAddedServices((prev) => [...prev, ...items]);
        setShowServiceNaryad(false);
      }}
    />
    </>
  );
}
