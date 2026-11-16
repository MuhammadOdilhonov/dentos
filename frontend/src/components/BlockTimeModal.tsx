'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Employee, Appointment } from '../lib/types';
import { useI18n } from '../lib/i18n';
import { Calendar as CalendarIcon, X, Plus, ChevronDown, Trash2 } from 'lucide-react';

interface BlockTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    doctorId: number;
    doctorName?: string;
    date: string; // YYYY-MM-DD
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    durationMinutes: number;
    isAllDay: boolean;
    notes: string;
  }) => Promise<void> | void;
  onDelete?: (id: number) => Promise<void> | void;
  employees: Employee[];
  defaultDoctorId?: number;
  defaultDate?: string; // YYYY-MM-DD
  defaultStartTime?: string; // HH:mm
  defaultEndTime?: string; // HH:mm
  defaultDurationMinutes?: number;
  existingAppointment?: Appointment | null;
}

export default function BlockTimeModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  employees,
  defaultDoctorId,
  defaultDate,
  defaultStartTime = '10:00',
  defaultEndTime = '13:00',
  defaultDurationMinutes = 180,
  existingAppointment
}: BlockTimeModalProps) {
  const { language, tr } = useI18n();

  // Doctors list only
  const doctors = useMemo(() => {
    return employees.filter(e => e.role === 'doctor' || !e.role || e.is_active !== false);
  }, [employees]);

  const [selectedDoctorId, setSelectedDoctorId] = useState<number>(() => {
    if (existingAppointment?.doctor) return existingAppointment.doctor;
    if (defaultDoctorId) return defaultDoctorId;
    return doctors[0]?.id || 0;
  });

  const [dateStr, setDateStr] = useState<string>(() => {
    if (existingAppointment?.start_time) {
      return existingAppointment.start_time.split('T')[0];
    }
    return defaultDate || new Date().toISOString().split('T')[0];
  });

  const [startTime, setStartTime] = useState<string>(() => {
    if (existingAppointment?.start_time) {
      const d = new Date(existingAppointment.start_time);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return defaultStartTime;
  });

  const [durationMinutes, setDurationMinutes] = useState<number>(() => {
    if (existingAppointment?.start_time && existingAppointment?.end_time) {
      const s = new Date(existingAppointment.start_time).getTime();
      const e = new Date(existingAppointment.end_time).getTime();
      const diff = Math.round((e - s) / 60000);
      return diff > 0 ? diff : defaultDurationMinutes;
    }
    return defaultDurationMinutes;
  });

  const [isAllDay, setIsAllDay] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>(() => {
    return existingAppointment?.treatment_notes || '';
  });
  const [saving, setSaving] = useState(false);
  const [isDoctorDropdownOpen, setIsDoctorDropdownOpen] = useState(false);

  // Sync state when props change
  useEffect(() => {
    if (!isOpen) return;
    if (existingAppointment) {
      setSelectedDoctorId(existingAppointment.doctor);
      const d = new Date(existingAppointment.start_time);
      setDateStr(existingAppointment.start_time.split('T')[0]);
      setStartTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      const s = new Date(existingAppointment.start_time).getTime();
      const e = new Date(existingAppointment.end_time).getTime();
      const diff = Math.round((e - s) / 60000);
      setDurationMinutes(diff > 0 ? diff : 180);
      setNotes(existingAppointment.treatment_notes || '');
      setIsAllDay(diff >= 600);
    } else {
      if (defaultDoctorId) setSelectedDoctorId(defaultDoctorId);
      if (defaultDate) setDateStr(defaultDate);
      if (defaultStartTime) setStartTime(defaultStartTime);
      if (defaultDurationMinutes) setDurationMinutes(defaultDurationMinutes);
      setNotes('');
      setIsAllDay(false);
    }
  }, [isOpen, existingAppointment, defaultDoctorId, defaultDate, defaultStartTime, defaultDurationMinutes]);

  if (!isOpen) return null;

  // Selected doctor object
  const currentDoctor = doctors.find(d => d.id === selectedDoctorId) || doctors[0];

  // Calculate End Time from startTime + durationMinutes
  const calculateEndTime = (start: string, duration: number): string => {
    if (isAllDay) return '21:00';
    const [h, m] = start.split(':').map(Number);
    const totalMin = (h || 0) * 60 + (m || 0) + duration;
    const endH = Math.min(23, Math.floor(totalMin / 60));
    const endM = totalMin % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  };

  const effectiveStartTime = isAllDay ? '08:00' : startTime;
  const effectiveEndTime = calculateEndTime(effectiveStartTime, durationMinutes);

  // Format header date string matching screenshot (e.g., "понедельник, 16-го ноября  10:00 утра - 1:00 дня")
  const formatDateRangeDisplay = () => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const d = new Date(year, (month || 1) - 1, day || 1);
      
      const locale = language === 'uz' ? 'uz-UZ' : language === 'en' ? 'en-US' : 'ru-RU';
      const weekday = d.toLocaleDateString(locale, { weekday: 'long' });
      const dayNum = d.getDate();
      const monthName = d.toLocaleDateString(locale, { month: 'long' });

      // Format time
      const formatTimeAmPm = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        if (language === 'ru') {
          if (h === 0) return '12:00 ночи';
          if (h < 12) return `${h}:${String(m).padStart(2, '0')} утра`;
          if (h === 12) return `12:${String(m).padStart(2, '0')} дня`;
          if (h < 18) return `${h - 12 || 12}:${String(m).padStart(2, '0')} дня`;
          return `${h - 12 || 12}:${String(m).padStart(2, '0')} вечера`;
        }
        return timeStr;
      };

      if (isAllDay) {
        return `${weekday}, ${dayNum}-${language === 'ru' ? 'го ' : ' '}${monthName} (Весь день)`;
      }

      return `${weekday}, ${dayNum}-${language === 'ru' ? 'го ' : ' '}${monthName}    ${formatTimeAmPm(effectiveStartTime)} - ${formatTimeAmPm(effectiveEndTime)}`;
    } catch {
      return `${dateStr}  ${effectiveStartTime} - ${effectiveEndTime}`;
    }
  };

  // Duration label formatter
  const formatDurationLabel = (mins: number) => {
    if (mins < 60) return `${mins} мин.`;
    const h = mins / 60;
    if (Number.isInteger(h)) return `${h}ч.`;
    return `${h.toFixed(1)}ч.`;
  };

  const handleSave = async () => {
    if (!currentDoctor) return;
    setSaving(true);
    try {
      await onSave({
        doctorId: currentDoctor.id,
        doctorName: currentDoctor.full_name,
        date: dateStr,
        startTime: effectiveStartTime,
        endTime: effectiveEndTime,
        durationMinutes: isAllDay ? 780 : durationMinutes,
        isAllDay,
        notes: notes.trim()
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
        onClick={(e) => {
          // Close doctor dropdown if clicked outside
          if (isDoctorDropdownOpen) setIsDoctorDropdownOpen(false);
        }}
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
            {language === 'ru' ? 'Блокировать время' : language === 'uz' ? 'Vaqtni bloklash' : 'Block time'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="p-6 space-y-5">
          {/* 1. Date & Time Range Banner with '+' button (matches screenshot row 1) */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
            <div className="flex items-center space-x-3 text-slate-800 dark:text-slate-200 text-sm font-medium">
              <CalendarIcon className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="capitalize">{formatDateRangeDisplay()}</span>
            </div>
            <button
              type="button"
              title="Qo'shimcha interval qo'shish"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* 2. "Весь день" toggle (matches screenshot row 2) */}
          <div className="flex items-center space-x-3 pt-1">
            <button
              type="button"
              role="switch"
              aria-checked={isAllDay}
              onClick={() => setIsAllDay(!isAllDay)}
              className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors ${
                isAllDay ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  isAllDay ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {language === 'ru' ? 'Весь день' : language === 'uz' ? 'Kun bo‘yi' : 'All day'}
            </span>
          </div>

          {/* 3. Row with Сотрудник (Doctor pill) + Начало в + Длительность (matches screenshot row 3) */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
            {/* Сотрудник */}
            <div className="sm:col-span-6 relative">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {language === 'ru' ? 'Сотрудник' : language === 'uz' ? 'Xodim (Shifokor)' : 'Employee'}
              </label>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDoctorDropdownOpen(!isDoctorDropdownOpen);
                }}
                className="w-full min-h-[42px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between cursor-pointer hover:border-slate-300 transition"
              >
                {/* Selected Doctor Tag (blue pill like screenshot) */}
                {currentDoctor ? (
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-sky-100 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 text-xs font-semibold">
                    <span className="truncate max-w-[180px]">{currentDoctor.full_name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Reset or open dropdown
                        setIsDoctorDropdownOpen(true);
                      }}
                      className="hover:text-sky-900 dark:hover:text-sky-100"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">Tanlang...</span>
                )}

                <div className="flex items-center space-x-1 text-slate-400 ml-2 shrink-0">
                  <X 
                    className="w-3.5 h-3.5 cursor-pointer hover:text-slate-600" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDoctorDropdownOpen(true);
                    }}
                  />
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>

              {/* Doctors Dropdown Menu */}
              {isDoctorDropdownOpen && (
                <div 
                  className="absolute left-0 right-0 top-full mt-1 z-30 max-h-56 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {doctors.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => {
                        setSelectedDoctorId(doc.id);
                        setIsDoctorDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700 transition ${
                        doc.id === selectedDoctorId ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 font-bold' : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span>{doc.full_name}</span>
                      {doc.specialty && <span className="text-[10px] text-slate-400 font-normal">{doc.specialty}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Начало в */}
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {language === 'ru' ? 'Начало в' : language === 'uz' ? 'Boshlanish vaqti' : 'Starts at'}
              </label>
              <div className="relative">
                <input
                  type="time"
                  disabled={isAllDay}
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50 transition"
                />
              </div>
            </div>

            {/* Длительность */}
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {language === 'ru' ? 'Длительность' : language === 'uz' ? 'Davomiyligi' : 'Duration'}
              </label>
              <div className="relative">
                <select
                  disabled={isAllDay}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full h-[42px] px-3 appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50 transition pr-8"
                >
                  <option value={30}>30 мин.</option>
                  <option value={45}>45 мин.</option>
                  <option value={60}>1ч.</option>
                  <option value={90}>1.5ч.</option>
                  <option value={120}>2ч.</option>
                  <option value={180}>3ч.</option>
                  <option value={240}>4ч.</option>
                  <option value={300}>5ч.</option>
                  <option value={360}>6ч.</option>
                  <option value={480}>8ч.</option>
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* 4. Заметки (matches screenshot row 4) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {language === 'ru' ? 'Заметки' : language === 'uz' ? 'Izohlar (sabab)' : 'Notes'}
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={language === 'ru' ? 'Причина блокировки (например: обед, конференция, обучение...)' : language === 'uz' ? 'Bloklash sababi (masalan: tushlik, konferensiya, shaxsiy vaqt...)' : 'Reason for block...'}
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition resize-none"
            />
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
          <div>
            {existingAppointment && onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(language === 'ru' ? 'Блокировку удалить?' : 'Bloklashni o‘chirmoqchimisiz?')) {
                    onDelete(existingAppointment.id);
                    onClose();
                  }
                }}
                className="px-3.5 py-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold transition flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{language === 'ru' ? 'Удалить блокировку' : 'Blokdan chiqarish'}</span>
              </button>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700 text-xs font-bold transition"
            >
              {language === 'ru' ? 'Отмена' : language === 'uz' ? 'Bekor qilish' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !currentDoctor}
              className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition disabled:opacity-50"
            >
              {saving ? '...' : (language === 'ru' ? 'Сохранить' : language === 'uz' ? 'Saqlash' : 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
