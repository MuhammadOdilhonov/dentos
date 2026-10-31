'use client';

import React, { useState, useEffect } from 'react';
import { Patient } from '../lib/types';
import { clinicApi } from '../lib/api';
import { useI18n } from '../lib/i18n';
import PhoneInput from './PhoneInput';
import {
  X,
  Trash2,
  Calendar,
  Plus,
  Search,
  Check,
  Camera,
  ChevronDown
} from 'lucide-react';

interface PatientEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  onSave: (updated: Patient) => void;
  onDelete?: () => void;
}

export default function PatientEditModal({
  isOpen,
  onClose,
  patient,
  onSave,
  onDelete
}: PatientEditModalProps) {
  const { language, tk } = useI18n();

  const [activeTab, setActiveTab] = useState<'Основные' | 'Дополнительно' | 'Детали' | 'Объединение'>('Основные');

  // TAB 1: Основные
  const nameParts = (patient?.full_name || '').split(' ');
  const [lastName, setLastName] = useState(nameParts[0] || '');
  const [firstName, setFirstName] = useState(nameParts.slice(1).join(' ') || '');
  const [patronymic, setPatronymic] = useState('');
  const [phone, setPhone] = useState(patient?.phone || '');
  const [extraPhone, setExtraPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('Ташкент анкета есть');
  const [serviceLang, setServiceLang] = useState<'English' | 'Русский' | 'Узбекский'>(
    patient?.service_lang === 'uz' ? 'Узбекский' : patient?.service_lang === 'en' ? 'English' : 'Русский'
  );

  useEffect(() => {
    if (!isOpen || !patient) return;
    const parts = (patient.full_name || '').split(' ');
    setLastName(parts[0] || '');
    setFirstName(parts.slice(1).join(' ') || '');
    setPhone(patient.phone || '');
    setBirthDate(patient.birth_date || '2000-01-01');
    setGender(patient.gender === 'Женщина' || patient.gender === 'Ж' ? 'Женщина' : 'Мужчина');
    setSelectedColor(patient.avatar_color || '#0f172a');
    setServiceLang(
      patient.service_lang === 'uz' ? 'Узбекский' : patient.service_lang === 'en' ? 'English' : 'Русский'
    );
  }, [isOpen, patient]);

  const [notifySms, setNotifySms] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyTg, setNotifyTg] = useState(true);
  const [notifyWa, setNotifyWa] = useState(false);

  const [doctors, setDoctors] = useState<string[]>([]);
  const [birthDate, setBirthDate] = useState(patient.birth_date || '2009-09-23');
  const [source, setSource] = useState('');
  const [gender, setGender] = useState<'Мужчина' | 'Женщина'>(
    patient.gender === 'Женщина' || patient.gender === 'Ж' ? 'Женщина' : 'Мужчина'
  );
  const [selectedColor, setSelectedColor] = useState<string>(patient.avatar_color || '#0f172a');

  // Palette matching media_1788615652463.png
  const colorPalette = [
    '#f472b6', '#d946ef', '#38bdf8', '#818cf8', '#a855f7', '#fb923c', '#fef08a', '#fecdd3', '#0f172a', '#312e81', '#ea580c', '#e11d48',
    '#2dd4bf', '#db2777', '#eab308', '#bae6fd', '#c4b5fd', '#854d0e', '#86efac', '#10b981', '#0d9488', '#84cc16', '#0284c7', '#06b6d4'
  ];

  // TAB 2: Дополнительно
  const [discount, setDiscount] = useState('5%');
  const [tags, setTags] = useState<string[]>(['VIP']);
  const [passportNumber, setPassportNumber] = useState('');
  const [passportIssued, setPassportIssued] = useState('');
  const [referredBy, setReferredBy] = useState('');
  const [isBlacklist, setIsBlacklist] = useState(false);
  const [enableGeneralSms, setEnableGeneralSms] = useState(false);
  const [enablePromo, setEnablePromo] = useState(false);

  // TAB 3: Детали (Questionnaire)
  const [hiv, setHiv] = useState<'положительный' | 'отрицательный' | 'Не проводилось'>('Не проводилось');
  const [hepC, setHepC] = useState<'положительный' | 'отрицательный' | 'Не проводилось'>('Не проводилось');
  const [pressure, setPressure] = useState<'Да' | 'Нет'>('Нет');
  const [asthma, setAsthma] = useState<'Да' | 'Нет'>('Нет');
  const [oncology, setOncology] = useState<'Да' | 'Нет'>('Нет');
  const [bloodClot, setBloodClot] = useState<'Да' | 'Нет'>('Нет');
  const [dizziness, setDizziness] = useState<'Да' | 'Нет'>('Нет');
  const [constantMeds, setConstantMeds] = useState('');
  const [dispensary, setDispensary] = useState('');
  const [stomaAllergy, setStomaAllergy] = useState<'Да' | 'Нет'>('Нет');
  const [stomaBleeding, setStomaBleeding] = useState<'Да' | 'Нет'>('Нет');
  const [stomaOther, setStomaOther] = useState('');
  const [jawClick, setJawClick] = useState<'Да' | 'Нет'>('Нет');

  // Allergies
  const [allAnesthetic, setAllAnesthetic] = useState<'Есть' | 'Нет'>('Нет');
  const [allAntibiotics, setAllAntibiotics] = useState<'Есть' | 'Нет'>('Нет');
  const [allIodine, setAllIodine] = useState<'Есть' | 'Нет'>('Нет');
  const [allPainkillers, setAllPainkillers] = useState<'Есть' | 'Нет'>('Нет');
  const [allPollen, setAllPollen] = useState<'Есть' | 'Нет'>('Нет');
  const [allFood, setAllFood] = useState<'Есть' | 'Нет'>('Нет');
  const [allFur, setAllFur] = useState<'Есть' | 'Нет'>('Нет');
  const [allOtherMeds, setAllOtherMeds] = useState('');
  const [allOtherSubstances, setAllOtherSubstances] = useState('');
  const [allAdditional, setAllAdditional] = useState('');

  // Somatic
  const [infarct, setInfarct] = useState<'Да, инсульт' | 'Да, инфаркт' | 'Нет'>('Нет');
  const [myocardium, setMyocardium] = useState<'Стоит' | 'Нет'>('Нет');
  const [diabetes, setDiabetes] = useState<'Да' | 'Нет'>('Нет');
  const [ent, setEnt] = useState<'Да' | 'Нет'>('Нет');
  const [tuberculosis, setTuberculosis] = useState<'Да' | 'Нет'>('Нет');
  const [pacemaker, setPacemaker] = useState<'Установлен' | 'Нет'>('Нет');
  const [bloodGroup, setBloodGroup] = useState('');
  const [healthComplaints, setHealthComplaints] = useState<'Да' | 'Нет'>('Нет');
  const [healthNotes, setHealthNotes] = useState('');

  // Women's block
  const [womenDate, setWomenDate] = useState('');
  const [womenCycle, setWomenCycle] = useState<'Да' | 'Нет'>('Нет');
  const [womenContraception, setWomenContraception] = useState<'Да' | 'Нет'>('Нет');
  const [womenPregnant, setWomenPregnant] = useState<'Да' | 'Нет'>('Нет');
  const [womenFeeding, setWomenFeeding] = useState<'Да' | 'Нет'>('Нет');
  const [womenNotes, setWomenNotes] = useState('');

  // TAB 4: Объединение
  const [searchMerge, setSearchMerge] = useState('');
  const [mergeCandidates, setMergeCandidates] = useState<{ id: number; name: string; phone: string; balance: number; initials: string; color: string }[]>([]);
  const [selectedMergeId, setSelectedMergeId] = useState<number>(2);

  if (!isOpen) return null;

  const handleSave = () => {
    const fullName = `${lastName} ${firstName}`.trim();
    const svcLang: 'uz' | 'ru' | 'en' = serviceLang === 'Узбекский' ? 'uz' : serviceLang === 'English' ? 'en' : 'ru';
    onSave({
      ...patient,
      full_name: fullName || patient.full_name,
      phone: phone || patient.phone,
      gender: gender,
      birth_date: birthDate,
      notes: address,
      avatar_color: selectedColor,
      service_lang: svcLang
    });
    // Backend'ga ham yozamiz (avto-eslatma bemor tilini bilishi uchun)
    clinicApi.updatePatientLang(patient.id, svcLang);
    onClose();
  };

  const handleMergeAction = () => {
    const target = mergeCandidates.find((c) => c.id === selectedMergeId);
    if (!target) return;
    if (confirm(`Вы действительно хотите объединить карточку "${target.name}" с текущим пациентом? Это действие необратимо.`)) {
      alert(`Карточка "${target.name}" успешно объединена с текущим пациентом. Вся история перенесена.`);
      setMergeCandidates(mergeCandidates.filter((c) => c.id !== selectedMergeId));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-5xl my-auto shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 transition-colors">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850">
          <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">{tk('patient')}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs Bar */}
        <div className="flex items-center space-x-6 px-6 border-b border-slate-100 dark:border-slate-800 text-xs font-semibold bg-white dark:bg-slate-900">
          {(['Основные', 'Дополнительно', 'Детали', 'Объединение'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 transition border-b-2 ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600 dark:text-sky-400 font-bold'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
            >
              {tab === 'Основные'
                ? tk('general')
                : tab === 'Дополнительно'
                ? tk('additional')
                : tab === 'Детали'
                ? tk('details')
                : tk('merge')}
            </button>
          ))}
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: ОСНОВНЫЕ (media_1788615652463.png) */}
          {activeTab === 'Основные' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-4">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('last_name')}</label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50/50 border border-blue-400 rounded-xl outline-none focus:ring-2 focus:ring-blue-400/20"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('patronymic')}</label>
                  <input
                    type="text"
                    placeholder="Прим.: Андреевич"
                    value={patronymic}
                    onChange={(e) => setPatronymic(e.target.value)}
                    className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('additional_2')}</label>
                  <PhoneInput
                    value={extraPhone}
                    onChange={setExtraPhone}
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('address')}</label>
                  <textarea
                    rows={3}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('service_language')}</label>
                  <div className="flex items-center space-x-4 pt-1">
                    {(['English', 'Русский', 'Узбекский'] as const).map((lang) => (
                      <label key={lang} className="flex items-center space-x-1.5 cursor-pointer font-medium text-slate-700">
                        <input
                          type="radio"
                          name="serviceLang"
                          checked={serviceLang === lang}
                          onChange={() => setServiceLang(lang)}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span>{lang}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('notification_channels')}</label>
                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <label className="flex items-center space-x-1.5 cursor-pointer font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={notifySms}
                        onChange={(e) => setNotifySms(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      <span>SMS сообщения</span>
                    </label>

                    <label className="flex items-center space-x-1.5 cursor-pointer font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={notifyEmail}
                        onChange={(e) => setNotifyEmail(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      <span>Email</span>
                    </label>

                    <label className="flex items-center space-x-1.5 cursor-pointer font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={notifyTg}
                        onChange={(e) => setNotifyTg(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      <span>Telegram</span>
                    </label>

                    <label className="flex items-center space-x-1.5 cursor-pointer font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={notifyWa}
                        onChange={(e) => setNotifyWa(e.target.checked)}
                        className="rounded text-blue-600"
                      />
                      <span>Whatsapp</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('first_name')}</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('phone')}</label>
                  <PhoneInput
                    required
                    value={phone}
                    onChange={setPhone}
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800 font-semibold"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('staff_3')}</label>
                  <div className="p-2 bg-slate-50/50 border border-slate-200 rounded-xl flex flex-wrap items-center gap-1.5 min-h-[42px]">
                    {doctors.map((doc) => (
                      <span
                        key={doc}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-sky-100 text-sky-800 text-[11px] font-medium"
                      >
                        <span>{doc}</span>
                        <button
                          type="button"
                          onClick={() => setDoctors(doctors.filter((d) => d !== doc))}
                          className="hover:text-sky-950"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const newDoc = prompt('Введите имя сотрудника/врача:');
                        if (newDoc) setDoctors([...doctors, newDoc]);
                      }}
                      className="text-slate-400 hover:text-slate-600 text-xs px-1"
                    >
                      + Добавить
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('birth_date')}</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className="w-full p-2 bg-slate-50/50 border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('source')}</label>
                    <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                      <select
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        className="flex-1 p-2 bg-transparent outline-none"
                      >
                        <option value="">{tk('not_specified')}</option>
                        <option value="Instagram">Instagram</option>
                        <option value="Рекомендация">Рекомендация</option>
                        <option value="Telegram">Telegram</option>
                        <option value="Вывеска">Вывеска / Проходил мимо</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          const s = prompt('Новый источник:');
                          if (s) setSource(s);
                        }}
                        className="px-2 py-2 text-slate-400 hover:text-slate-600 border-l"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('gender')}</label>
                    <div className="flex items-center space-x-3 pt-2">
                      <label className="flex items-center space-x-1 cursor-pointer font-medium text-slate-700">
                        <input
                          type="radio"
                          name="gender"
                          checked={gender === 'Мужчина'}
                          onChange={() => setGender('Мужчина')}
                          className="text-blue-600"
                        />
                        <span>{tk('male')}</span>
                      </label>
                      <label className="flex items-center space-x-1 cursor-pointer font-medium text-slate-700">
                        <input
                          type="radio"
                          name="gender"
                          checked={gender === 'Женщина'}
                          onChange={() => setGender('Женщина')}
                          className="text-blue-600"
                        />
                        <span>{tk('female')}</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-2">{tk('patient_card_colour_logo')}</label>
                  <div className="grid grid-cols-12 gap-1.5 p-2 bg-slate-50/50 border border-slate-200 rounded-xl">
                    {colorPalette.map((clr, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedColor(clr)}
                        style={{ backgroundColor: clr }}
                        className="w-6 h-6 rounded-md transition hover:scale-110 flex items-center justify-center shadow-2xs"
                      >
                        {selectedColor === clr && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ДОПОЛНИТЕЛЬНО (media_1788615654934.png) */}
          {activeTab === 'Дополнительно' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-4">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Скидка</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none"
                    />
                    <span className="absolute right-3 top-2.5 text-slate-400 font-bold">%</span>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Тэги</label>
                  <div className="relative">
                    <select className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none">
                      <option>VIP клиент</option>
                      <option>Имплантация</option>
                      <option>Брекеты / Ортодонтия</option>
                      <option>Сложный случай</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Номер паспорта</label>
                  <input
                    type="text"
                    placeholder="AA 1234567"
                    value={passportNumber}
                    onChange={(e) => setPassportNumber(e.target.value)}
                    className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Паспорт выдан</label>
                  <input
                    type="text"
                    placeholder="Кем и когда выдан документ..."
                    value={passportIssued}
                    onChange={(e) => setPassportIssued(e.target.value)}
                    className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => alert('Загрузить фото пациента')}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl font-bold text-slate-700 flex items-center space-x-1.5 transition"
                  >
                    <Camera className="w-4 h-4 text-slate-400" />
                    <span>Указать фото</span>
                  </button>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Пришел от:</label>
                  <input
                    type="text"
                    placeholder="Прим.: Валентин"
                    value={referredBy}
                    onChange={(e) => setReferredBy(e.target.value)}
                    className="w-full p-2.5 bg-slate-50/50 border border-slate-200 rounded-xl outline-none"
                  />
                </div>

                {/* Switch 1: В черный список */}
                <div className="p-3 bg-slate-50/50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900">В черный список</h4>
                    <p className="text-[11px] text-slate-500">
                      Добавьте в черный список сомнительных или пациентов часто пропускающих процедуры
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isBlacklist}
                      onChange={(e) => setIsBlacklist(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
                  </label>
                </div>

                {/* Switch 2: Включить общие СМС уведомления */}
                <div className="p-3 bg-slate-50/50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900">Включить общие СМС уведомления</h4>
                    <p className="text-[11px] text-slate-500">Пациент будет получать уведомления о записях</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableGeneralSms}
                      onChange={(e) => setEnableGeneralSms(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Switch 3: Включить промо нотификации */}
                <div className="p-3 bg-slate-50/50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900">Включить промо нотификации</h4>
                    <p className="text-[11px] text-slate-500">
                      Пациент будет получать сообщения о промо акциях и других событиях
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enablePromo}
                      onChange={(e) => setEnablePromo(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ДЕТАЛИ (media_1788615660851.png - Medical Questionnaire) */}
          {activeTab === 'Детали' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-[11px]">
              {/* Left Column: General Medical History */}
              <div className="space-y-4">
                <h4 className="font-bold text-xs text-slate-900 pb-1 border-b">Ответьте на вопросы:</h4>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Проводилось ли исследование на ВИЧ (СПИД)?</p>
                  <div className="flex items-center space-x-3 text-slate-600">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="hiv" checked={hiv === 'положительный'} onChange={() => setHiv('положительный')} />
                      <span>Проводилось: положительный</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="hiv" checked={hiv === 'отрицательный'} onChange={() => setHiv('отрицательный')} />
                      <span>Проводилось: отрицательный</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="hiv" checked={hiv === 'Не проводилось'} onChange={() => setHiv('Не проводилось')} />
                      <span>Не проводилось</span>
                    </label>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Проводилось ли исследование на Гепатит C?</p>
                  <div className="flex items-center space-x-3 text-slate-600">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="hepC" checked={hepC === 'положительный'} onChange={() => setHepC('положительный')} />
                      <span>Проводилось: положительный</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="hepC" checked={hepC === 'отрицательный'} onChange={() => setHepC('отрицательный')} />
                      <span>Проводилось: отрицательный</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="hepC" checked={hepC === 'Не проводилось'} onChange={() => setHepC('Не проводилось')} />
                      <span>Не проводилось</span>
                    </label>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Бывает ли у Вас повышенное или пониженное артериальное давление?</p>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="pressure" checked={pressure === 'Да'} onChange={() => setPressure('Да')} />
                      <span>Да</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="pressure" checked={pressure === 'Нет'} onChange={() => setPressure('Нет')} />
                      <span>Нет</span>
                    </label>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Бронхиальная астма:</p>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="asthma" checked={asthma === 'Да'} onChange={() => setAsthma('Да')} />
                      <span>Да</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="asthma" checked={asthma === 'Нет'} onChange={() => setAsthma('Нет')} />
                      <span>Нет</span>
                    </label>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Онкология и др. заболевания нервной системы:</p>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="oncology" checked={oncology === 'Да'} onChange={() => setOncology('Да')} />
                      <span>Да</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="oncology" checked={oncology === 'Нет'} onChange={() => setOncology('Нет')} />
                      <span>Нет</span>
                    </label>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Нарушения свертываемости крови:</p>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="bloodClot" checked={bloodClot === 'Да'} onChange={() => setBloodClot('Да')} />
                      <span>Да</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="bloodClot" checked={bloodClot === 'Нет'} onChange={() => setBloodClot('Нет')} />
                      <span>Нет</span>
                    </label>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Постоянно или периодически принимаете лекарственные средства:</p>
                  <input
                    type="text"
                    placeholder="Enter field label"
                    value={constantMeds}
                    onChange={(e) => setConstantMeds(e.target.value)}
                    className="w-full p-2 bg-slate-50 border rounded-lg outline-none"
                  />
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Состоите на учете в лечебных учреждениях по поводу:</p>
                  <input
                    type="text"
                    placeholder="Enter field label"
                    value={dispensary}
                    onChange={(e) => setDispensary(e.target.value)}
                    className="w-full p-2 bg-slate-50 border rounded-lg outline-none"
                  />
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">При прохождении лечения в прошлом были аллергические реакции:</p>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="stomaAllergy" checked={stomaAllergy === 'Да'} onChange={() => setStomaAllergy('Да')} />
                      <span>Да</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="stomaAllergy" checked={stomaAllergy === 'Нет'} onChange={() => setStomaAllergy('Нет')} />
                      <span>Нет</span>
                    </label>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Наличие болей и щелканья в нижнечелюстном суставе:</p>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="jawClick" checked={jawClick === 'Да'} onChange={() => setJawClick('Да')} />
                      <span>Да</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="jawClick" checked={jawClick === 'Нет'} onChange={() => setJawClick('Нет')} />
                      <span>Нет</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Right Column: Allergies & Women */}
              <div className="space-y-4">
                <h4 className="font-bold text-xs text-slate-900 pb-1 border-b">Аллергические реакции:</h4>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Аллергические реакции на местные анестетики:</p>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="allAnesthetic" checked={allAnesthetic === 'Есть'} onChange={() => setAllAnesthetic('Есть')} />
                      <span>Есть</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="allAnesthetic" checked={allAnesthetic === 'Нет'} onChange={() => setAllAnesthetic('Нет')} />
                      <span>Нет</span>
                    </label>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Аллергические реакции на антибиотики:</p>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="allAntibiotics" checked={allAntibiotics === 'Есть'} onChange={() => setAllAntibiotics('Есть')} />
                      <span>Есть</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="allAntibiotics" checked={allAntibiotics === 'Нет'} onChange={() => setAllAntibiotics('Нет')} />
                      <span>Нет</span>
                    </label>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Аллергические реакции на препараты йода:</p>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="allIodine" checked={allIodine === 'Есть'} onChange={() => setAllIodine('Есть')} />
                      <span>Есть</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="allIodine" checked={allIodine === 'Нет'} onChange={() => setAllIodine('Нет')} />
                      <span>Нет</span>
                    </label>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Аллергические реакции на обезболивающие препараты:</p>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="allPainkillers" checked={allPainkillers === 'Есть'} onChange={() => setAllPainkillers('Есть')} />
                      <span>Есть</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="allPainkillers" checked={allPainkillers === 'Нет'} onChange={() => setAllPainkillers('Нет')} />
                      <span>Нет</span>
                    </label>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Аллергические реакции на другие лекарства (указать):</p>
                  <input
                    type="text"
                    placeholder="Enter field label"
                    value={allOtherMeds}
                    onChange={(e) => setAllOtherMeds(e.target.value)}
                    className="w-full p-2 bg-slate-50 border rounded-lg outline-none"
                  />
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Дополнительно хочу указать следующее:</p>
                  <textarea
                    rows={2}
                    placeholder="Enter field label"
                    value={allAdditional}
                    onChange={(e) => setAllAdditional(e.target.value)}
                    className="w-full p-2 bg-slate-50 border rounded-lg outline-none resize-none"
                  />
                </div>

                {/* For women block */}
                <h4 className="font-bold text-xs text-slate-900 pt-3 pb-1 border-b">Для женщин:</h4>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Дата начала (или если климактерический период):</p>
                  <input
                    type="text"
                    placeholder="Enter field label"
                    value={womenDate}
                    onChange={(e) => setWomenDate(e.target.value)}
                    className="w-full p-2 bg-slate-50 border rounded-lg outline-none"
                  />
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Беременны ли Вы:</p>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="womenPregnant" checked={womenPregnant === 'Да'} onChange={() => setWomenPregnant('Да')} />
                      <span>Да</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="womenPregnant" checked={womenPregnant === 'Нет'} onChange={() => setWomenPregnant('Нет')} />
                      <span>Нет</span>
                    </label>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-slate-700 mb-1">Кормите ли Вы грудью:</p>
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="womenFeeding" checked={womenFeeding === 'Да'} onChange={() => setWomenFeeding('Да')} />
                      <span>Да</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input type="radio" name="womenFeeding" checked={womenFeeding === 'Нет'} onChange={() => setWomenFeeding('Нет')} />
                      <span>Нет</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ОБЪЕДИНЕНИЕ (media_1788615685779.png) */}
          {activeTab === 'Объединение' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Объединение страниц пациентов является необратимым действием. На данную страницу будет скопирована вся
                информация с выбранной страницы. Выбранная страница будет перемещена во вкладку &quot;Архив&quot;.
              </p>

              {/* Search row */}
              <div className="flex items-center space-x-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Поиск пациента"
                    value={searchMerge}
                    onChange={(e) => setSearchMerge(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  />
                </div>
                <button
                  type="button"
                  className="p-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Candidates list matching screenshot */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
                {mergeCandidates
                  .filter((c) => !searchMerge || c.name.toLowerCase().includes(searchMerge.toLowerCase()) || c.phone.includes(searchMerge))
                  .map((cand) => {
                    const isSelected = selectedMergeId === cand.id;
                    return (
                      <div
                        key={cand.id}
                        onClick={() => setSelectedMergeId(cand.id)}
                        className={`p-3.5 flex items-center justify-between cursor-pointer transition ${
                          isSelected ? 'bg-blue-600 text-white' : 'hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {cand.initials}
                          </div>
                          <div>
                            <h4 className="font-bold text-xs">{cand.name}</h4>
                            <p className={`text-[10px] ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                              {cand.phone}
                            </p>
                          </div>
                        </div>

                        <div
                          className={`font-mono font-bold text-xs ${
                            isSelected
                              ? 'text-white'
                              : cand.balance < 0
                              ? 'text-rose-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {cand.balance.toLocaleString()} Сум
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleMergeAction}
                  className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl shadow-xs transition"
                >
                  Объединить
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer matching screenshots */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          {/* Delete Icon on Bottom-Left */}
          <button
            type="button"
            onClick={() => {
              if (confirm('Вы действительно хотите удалить данного пациента?')) {
                if (onDelete) onDelete();
                onClose();
              }
            }}
            className="p-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl shadow-xs transition"
            title="Удалить пациента"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Cancel and Save on Bottom-Right */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold rounded-xl transition text-xs"
            >
              {tk('cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition text-xs"
            >
              {tk('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
