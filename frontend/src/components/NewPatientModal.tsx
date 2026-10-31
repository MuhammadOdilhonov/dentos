'use client';

import React, { useState } from 'react';
import { Patient } from '../lib/types';
import { X, UserPlus } from 'lucide-react';
import PhoneInput from './PhoneInput';

interface NewPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (patientData: Partial<Patient>) => void;
}

export default function NewPatientModal({ isOpen, onClose, onSave }: NewPatientModalProps) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+998 ');
  const [categoryStatus, setCategoryStatus] = useState('Первичный');
  const [gender, setGender] = useState('М');
  const [birthDate, setBirthDate] = useState('1995-01-01');
  const [medicalHistory, setMedicalHistory] = useState('');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      full_name: fullName,
      phone,
      category_status: categoryStatus,
      gender,
      birth_date: birthDate,
      medical_history: medicalHistory,
      notes
    });
    // Reset
    setFullName('');
    setPhone('+998 ');
    setMedicalHistory('');
    setNotes('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <UserPlus className="w-5 h-5" />
            <div>
              <h2 className="text-base font-bold">Новый пациент</h2>
              <p className="text-xs text-blue-100">Создание амбулаторной карты</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-3.5">
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
              ФИО Пациента:
            </label>
            <input
              type="text"
              required
              placeholder="Например: Каримов Алишер Бахтиярович"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full text-xs font-semibold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Номер телефона:
              </label>
              <PhoneInput
                required
                value={phone}
                onChange={setPhone}
                className="w-full text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Категория:
              </label>
              <select
                value={categoryStatus}
                onChange={(e) => setCategoryStatus(e.target.value)}
                className="w-full text-xs font-semibold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition"
              >
                <option value="Первичный">Первичный</option>
                <option value="Постоянный">Постоянный</option>
                <option value="VIP">VIP клиент</option>
                <option value="Обычный">Обычный</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Пол:
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full text-xs font-semibold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition"
              >
                <option value="М">Мужской</option>
                <option value="Ж">Женский</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Дата рождения:
              </label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full text-xs font-semibold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
              Анамнез / Аллергии:
            </label>
            <input
              type="text"
              placeholder="Аллергия на анестезию, перенесенные заболевания..."
              value={medicalHistory}
              onChange={(e) => setMedicalHistory(e.target.value)}
              className="w-full text-xs font-medium p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
              Примечание:
            </label>
            <textarea
              rows={2}
              placeholder="Дополнительные пожелания пациента..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs font-medium p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:bg-white transition resize-none"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition"
            >
              Создать карту
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
