'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { clinicApi } from '../../lib/api';
import { NaryadCatalogItem, DoctorNaryadAssignment, Employee } from '../../lib/types';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import {
  FileSpreadsheet,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Save,
  Users,
  Percent,
  Layers,
  Sparkles,
  ChevronRight,
  Check,
  Building2,
  DollarSign,
  Info
} from 'lucide-react';

type Lang = 'uz' | 'ru' | 'en';


export default function NaryadsPage() {
  const { language, tr } = useI18n();
  const { user } = useAuth();
  const lng = (language as Lang) || 'ru';
  const som = tr('naryadcat.som');

  const clinicId = user?.clinicId || null;

  const [catalog, setCatalog] = useState<NaryadCatalogItem[]>([]);
  const [assignments, setAssignments] = useState<DoctorNaryadAssignment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Search and filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Inline price quick edit state
  const [quickEditingId, setQuickEditingId] = useState<string | null>(null);
  const [quickPriceValue, setQuickPriceValue] = useState<number>(0);

  // Add / Edit Modal (Large screen-wide dialog)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NaryadCatalogItem | null>(null);
  const [form, setForm] = useState({
    name: '',
    category: 'Терапия',
    base_price: 350000,
    default_percent: 35,
    description: ''
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadData = async () => {
    setCatalog(clinicApi.getNaryadCatalog(clinicId));
    setAssignments(clinicApi.getDoctorNaryads());
    const emps = await clinicApi.getEmployees();
    setEmployees(emps);
  };

  useEffect(() => {
    loadData();
  }, [clinicId]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return Array.from(set);
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    return catalog.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q);
      const matchCat = categoryFilter === 'all' || item.category === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [catalog, searchQuery, categoryFilter]);

  const avgPrice = useMemo(() => {
    if (catalog.length === 0) return 0;
    return Math.round(catalog.reduce((acc, c) => acc + c.base_price, 0) / catalog.length);
  }, [catalog]);

  // Open modal for add or edit
  const handleOpenModal = (item?: NaryadCatalogItem) => {
    setQuickEditingId(null);
    if (item) {
      setEditingItem(item);
      setForm({
        name: item.name,
        category: item.category,
        base_price: item.base_price,
        default_percent: item.default_percent || 35,
        description: item.description || ''
      });
    } else {
      setEditingItem(null);
      setForm({
        name: '',
        category: categoryFilter !== 'all' ? categoryFilter : 'Терапия',
        base_price: 0,
        default_percent: 35,
        description: ''
      });
    }
    setIsModalOpen(true);
  };

  // Quick Inline price edit
  const handleStartQuickPrice = (item: NaryadCatalogItem) => {
    setQuickEditingId(item.id);
    setQuickPriceValue(item.base_price);
  };

  const handleSaveQuickPrice = (id: string) => {
    if (quickPriceValue < 0) return;
    const updated = clinicApi.updateNaryadCatalogItem(
      id,
      { base_price: Number(quickPriceValue) },
      clinicId
    );
    if (updated) {
      setCatalog((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      showToast(lng === 'uz' ? 'Narx yangilandi!' : lng === 'en' ? 'Price updated!' : 'Цена обновлена!');
    }
    setQuickEditingId(null);
  };

  // Save Naryad item
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    if (editingItem) {
      const updated = clinicApi.updateNaryadCatalogItem(
        editingItem.id,
        {
          name: form.name.trim(),
          category: form.category,
          base_price: Number(form.base_price),
          default_percent: Number(form.default_percent),
          description: form.description.trim()
        },
        clinicId
      );
      if (updated) {
        setCatalog((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        showToast(lng === 'uz' ? 'Naryad narxi saqlandi!' : lng === 'en' ? 'Naryad price saved!' : 'Наряд успешно сохранён!');
      }
    } else {
      const created = clinicApi.createNaryadCatalogItem(
        {
          name: form.name.trim(),
          category: form.category,
          base_price: Number(form.base_price),
          default_percent: Number(form.default_percent),
          description: form.description.trim()
        },
        clinicId
      );
      setCatalog((prev) => [created, ...prev]);
      showToast(lng === 'uz' ? 'Yangi naryad kiritildi!' : lng === 'en' ? 'New naryad added!' : 'Новый наряд добавлен в прейскурант!');
    }
    setIsModalOpen(false);
  };

  // Delete Naryad item
  const handleDelete = (id: string) => {
    if (confirm(tr('naryadcat.confirmDelete'))) {
      clinicApi.deleteNaryadCatalogItem(id, clinicId);
      setCatalog((prev) => prev.filter((c) => c.id !== id));
      showToast(lng === 'uz' ? 'Naryad o‘chirildi' : lng === 'en' ? 'Naryad deleted' : 'Наряд удален из прейскуранта');
    }
  };

  const calculatedDoctorShare = Math.round(form.base_price * ((form.default_percent || 0) / 100));
  const calculatedClinicShare = Math.max(0, form.base_price - calculatedDoctorShare);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1700px] mx-auto space-y-6 pb-24 text-slate-900 dark:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 text-sm font-bold animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{tr('naryadcat.title')}</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              {tr('naryadcat.subtitle')}
            </p>
          </div>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="flex items-center space-x-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs sm:text-sm font-black transition-all shadow-md shadow-blue-500/25 whitespace-nowrap active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>{tr('naryadcat.addNaryad')}</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{tr('naryadcat.kpiTotal')}</span>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-2 tabular-nums">
            {catalog.length} <span className="text-sm font-semibold text-slate-400">{lng === 'uz' ? 'xizmat' : lng === 'en' ? 'items' : 'услуг'}</span>
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-sky-400">{tr('naryadcat.kpiCategories')}</span>
          <p className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-sky-400 mt-2 tabular-nums">
            {categories.length} <span className="text-sm font-semibold text-slate-400">{lng === 'uz' ? 'yo‘nalish' : lng === 'en' ? 'categories' : 'категорий'}</span>
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{tr('naryadcat.kpiAvgPrice')}</span>
          <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2 tabular-nums">
            {avgPrice.toLocaleString()} <span className="text-sm font-semibold">{som}</span>
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">{tr('naryadcat.kpiAssignments')}</span>
          <p className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 mt-2 tabular-nums">
            {assignments.length} <span className="text-sm font-semibold text-slate-400">{lng === 'uz' ? 'tarif' : lng === 'en' ? 'rates' : 'тарифов'}</span>
          </p>
        </div>
      </div>

      {/* Quick Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 shadow-2xs ${
            categoryFilter === 'all'
              ? 'bg-blue-600 text-white shadow-blue-500/20'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <span>{tr('naryadcat.allCategories')}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${categoryFilter === 'all' ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
            {catalog.length}
          </span>
        </button>
        {categories.map((cat) => {
          const count = catalog.filter((c) => c.category === cat).length;
          const isActive = categoryFilter === cat;
          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 shadow-2xs ${
                isActive
                  ? 'bg-blue-600 text-white shadow-blue-500/20'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <span>{cat}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${isActive ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Controls Bar: Search & Select Filter */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={tr('naryadcat.searchPlaceholder')}
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
          />
        </div>

        <div className="flex items-center space-x-2.5 w-full md:w-auto justify-end">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">{tr('naryadcat.allCategories')}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat} ({catalog.filter((c) => c.category === cat).length})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Naryad Catalog Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/90 dark:bg-slate-800/60 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-4 px-4 w-20">{tr('naryadcat.colId')}</th>
                <th className="py-4 px-4">{tr('naryadcat.colName')}</th>
                <th className="py-4 px-4">{tr('naryadcat.colCategory')}</th>
                <th className="py-4 px-4 text-right">{tr('naryadcat.colBasePrice')}</th>
                <th className="py-4 px-4 text-center">{tr('naryadcat.colDoctorPercent')}</th>
                <th className="py-4 px-4 text-right">{tr('naryadcat.colDoctorNet')}</th>
                <th className="py-4 px-4 text-center">{tr('naryadcat.colAssignedDocs')}</th>
                <th className="py-4 px-4 text-center w-36">{tr('naryadcat.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filteredCatalog.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400 font-semibold">
                    <p className="text-sm font-bold">{tr('naryadcat.noItemsFound')}</p>
                    <button
                      onClick={() => handleOpenModal()}
                      className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-2xl text-xs font-black shadow-md shadow-blue-500/20"
                    >
                      <Plus className="w-4 h-4 stroke-[3]" />
                      <span>{tr('naryadcat.addNaryad')}</span>
                    </button>
                  </td>
                </tr>
              ) : (
                filteredCatalog.map((item) => {
                  const docPercent = item.default_percent || 35;
                  const docNet = Math.round(item.base_price * (docPercent / 100));
                  const itemAssignments = assignments.filter((a) => a.naryad_id === item.id);
                  const isQuickEditing = quickEditingId === item.id;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group">
                      {/* Code */}
                      <td className="py-4 px-4 font-mono font-bold text-slate-400 text-[11px]">
                        {item.id}
                      </td>

                      {/* Name + Edit Pen right next to name */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white text-sm">
                            {item.name}
                          </span>
                          <button
                            onClick={() => handleOpenModal(item)}
                            className="p-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors shrink-0 shadow-2xs"
                            title={tr('naryadcat.editItem')}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {item.description && (
                          <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">{item.description}</div>
                        )}
                      </td>

                      {/* Category */}
                      <td className="py-4 px-4">
                        <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-[11px] whitespace-nowrap">
                          {item.category}
                        </span>
                      </td>

                      {/* Base Price + Edit Pen right next to price */}
                      <td className="py-4 px-4 text-right">
                        {isQuickEditing ? (
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            <input
                              type="number"
                              autoFocus
                              value={quickPriceValue}
                              onChange={(e) => setQuickPriceValue(Number(e.target.value))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveQuickPrice(item.id);
                                if (e.key === 'Escape') setQuickEditingId(null);
                              }}
                              className="w-32 px-2.5 py-1.5 bg-white dark:bg-slate-900 border-2 border-blue-500 rounded-xl text-xs font-black text-right outline-none shadow-sm"
                            />
                            <button
                              onClick={() => handleSaveQuickPrice(item.id)}
                              className="p-1.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700"
                              title={tr('common.save')}
                            >
                              <Check className="w-4 h-4 stroke-[3]" />
                            </button>
                            <button
                              onClick={() => setQuickEditingId(null)}
                              className="p-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl"
                              title={tr('common.cancel')}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 justify-end">
                            <span
                              onClick={() => handleStartQuickPrice(item)}
                              className={`font-black text-sm cursor-pointer hover:text-blue-600 transition-colors ${
                                item.base_price === 0 ? 'text-amber-500' : 'text-slate-900 dark:text-white'
                              }`}
                              title={tr('naryads.quickEditHint')}
                            >
                              {item.base_price.toLocaleString()} {som}
                            </span>
                            <button
                              onClick={() => handleStartQuickPrice(item)}
                              className="p-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors shrink-0 shadow-2xs"
                              title={tr('naryads.editPrice')}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Doctor % */}
                      <td className="py-4 px-4 text-center">
                        <span className="px-3 py-1 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400 font-black rounded-full text-xs">
                          {docPercent}%
                        </span>
                      </td>

                      {/* Doctor Net */}
                      <td className="py-4 px-4 text-right font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {docNet.toLocaleString()} {som}
                      </td>

                      {/* Assigned to Doctors */}
                      <td className="py-4 px-4 text-center">
                        {itemAssignments.length > 0 ? (
                          <span className="px-3 py-1 bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-300 font-bold rounded-full text-[10px] whitespace-nowrap">
                            {itemAssignments.length} {lng === 'uz' ? 'ta shifokor' : lng === 'en' ? 'doctors' : 'врачей'}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px] font-semibold">{lng === 'uz' ? 'Standart' : lng === 'en' ? 'Standard' : 'Стандарт'}</span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => handleOpenModal(item)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-black rounded-xl text-xs transition shadow-2xs"
                            title={tr('naryadcat.editItem')}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>{lng === 'uz' ? 'Tahrirlash' : lng === 'en' ? 'Edit' : 'Изменить'}</span>
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-2 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500 rounded-xl transition-colors"
                            title={tr('common.delete')}
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

      {/* ══════════════════════════════════════════════════════════════════════
          LARGE SCREEN-WIDE FULL MODAL: ADD / EDIT NARYAD
          (Screen-wide w-[92vw] max-w-5xl, beautiful 2-col layout)
         ══════════════════════════════════════════════════════════════════════ */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <Edit2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                    {editingItem ? tr('naryadcat.editItem') : tr('naryadcat.addItem')}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 font-medium mt-0.5">
                    {lng === 'uz'
                      ? 'Naryad nomi, toifasi, klinika bazaviy narxi va shifokor komissiya foizini sozlash'
                      : lng === 'en'
                      ? 'Configure procedure title, category, clinic base price and doctor commission rate'
                      : 'Настройка названия процедуры, категории, базовой цены клиники и процента врача'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-6 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Column 1: Procedure Title & Category */}
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                      {tr('naryadcat.nameLabel')}
                    </label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder={
                        lng === 'uz'
                          ? 'Masalan: Tsirkon toj tayyorlash va o‘rnatish'
                          : lng === 'en'
                          ? 'e.g.: Zirconia crown preparation & placement'
                          : 'Например: Изготовление и установка коронки из диоксида циркония'
                      }
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                      {tr('naryadcat.categoryLabel')}
                    </label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition cursor-pointer"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      {!categories.includes('Диагностика') && <option value="Диагностика">Диагностика</option>}
                      {!categories.includes('Терапия') && <option value="Терапия">Терапия</option>}
                      {!categories.includes('Endodontiya') && <option value="Endodontiya">Endodontiya</option>}
                      {!categories.includes('Gigiyena') && <option value="Gigiyena">Gigiyena</option>}
                      {!categories.includes('Хирургия') && <option value="Хирургия">Хирургия</option>}
                      {!categories.includes('Implantologiya') && <option value="Implantologiya">Implantologiya</option>}
                      {!categories.includes('Ортопедия') && <option value="Ортопедия">Ортопедия</option>}
                      {!categories.includes('Ортодонтия') && <option value="Ортодонтия">Ортодонтия</option>}
                      {!categories.includes('Bolalar') && <option value="Bolalar">Bolalar</option>}
                      {!categories.includes('Parodontologiya') && <option value="Parodontologiya">Parodontologiya</option>}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                      {tr('naryadcat.descLabel')}
                    </label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      placeholder={
                        lng === 'uz'
                          ? 'Muolaja tavsifi, ishlatiladigan materiallar, kafolat muddati...'
                          : lng === 'en'
                          ? 'Procedure details, used materials, warranty period...'
                          : 'Описание услуги, используемые материалы, гарантия...'
                      }
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-2xl font-medium resize-none outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition"
                    />
                  </div>
                </div>

                {/* Column 2: Base Price, Percent, Presets & Revenue Split Card */}
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                        {tr('naryadcat.basePriceLabel')}
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        step={10000}
                        value={form.base_price}
                        onChange={(e) => setForm((prev) => ({ ...prev, base_price: Number(e.target.value) }))}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-2xl font-black text-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                        {tr('naryadcat.percentLabel')}
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        max={100}
                        value={form.default_percent}
                        onChange={(e) => setForm((prev) => ({ ...prev, default_percent: Number(e.target.value) }))}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-2xl font-black text-lg outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition"
                      />
                    </div>
                  </div>

                  {/* Quick suggestions for price */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-400">{tr('naryadcat.quickPresets')}</span>
                    <div className="flex flex-wrap gap-2">
                      {[0, 150000, 300000, 500000, 1000000, 2500000, 5000000].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, base_price: val }))}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                            form.base_price === val
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {val === 0 ? '0 so‘m' : `${(val / 1000).toLocaleString()}k`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Revenue split calculation card */}
                  <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 rounded-3xl border border-emerald-200 dark:border-emerald-900/60 space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                      {lng === 'uz' ? '1 ta muolajadan taqsimot hisob-kitobi' : lng === 'en' ? 'Revenue split per 1 procedure' : 'Распределение дохода с 1 процедуры'}
                    </h4>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {tr('naryadcat.doctorShareText')} ({form.default_percent}%):
                      </span>
                      <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {calculatedDoctorShare.toLocaleString()} {som}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm border-t border-emerald-200/80 dark:border-emerald-900/80 pt-2">
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {tr('naryadcat.clinicShareText')}:
                      </span>
                      <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                        {calculatedClinicShare.toLocaleString()} {som}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end space-x-3 pt-5 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl text-xs sm:text-sm font-bold transition"
                >
                  {tr('naryadcat.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs sm:text-sm font-black shadow-lg shadow-blue-500/25 transition active:scale-95"
                >
                  <Save className="w-4 h-4" />
                  <span>{tr('naryadcat.save')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
