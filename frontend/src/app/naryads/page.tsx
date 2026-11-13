'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { clinicApi } from '../../lib/api';
import { ApiError } from '../../lib/http';
import { NaryadCatalogItem, DoctorNaryadAssignment, Employee, ServiceCategory } from '../../lib/types';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { useBranch } from '../../lib/branchContext';
import ServiceCategoryModal from '../../components/ServiceCategoryModal';
import ServiceProcedureModal from '../../components/ServiceProcedureModal';
import {
  FileSpreadsheet,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  X,
  Check,
  Layers,
} from 'lucide-react';

type Lang = 'uz' | 'ru' | 'en';

export default function NaryadsPage() {
  const { language, tr } = useI18n();
  const { user } = useAuth();
  const { currentBranchId } = useBranch();
  const lng = (language as Lang) || 'ru';
  const som = tr('naryadcat.som');

  const clinicId = user?.clinicId || null;

  const [catalog, setCatalog] = useState<NaryadCatalogItem[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [assignments, setAssignments] = useState<DoctorNaryadAssignment[]>([]);
  const [, setEmployees] = useState<Employee[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 'all' | 'uncat' | <categoryId>
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [catSearch, setCatSearch] = useState('');

  // Inline price quick edit
  const [quickEditingId, setQuickEditingId] = useState<string | null>(null);
  const [quickPriceValue, setQuickPriceValue] = useState<number>(0);

  // Procedure modal
  const [procModalOpen, setProcModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NaryadCatalogItem | null>(null);

  // Category modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<ServiceCategory | null>(null);

  const [importing, setImporting] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };
  const saveErrToast = () =>
    showToast(lng === 'uz' ? 'Saqlanmadi (server xatosi)' : lng === 'en' ? 'Not saved (server error)' : 'Не сохранено (ошибка сервера)');

  const loadData = async () => {
    try { setCatalog(await clinicApi.getNaryadCatalog(currentBranchId)); } catch { setCatalog([]); }
    try { setCategories(await clinicApi.getServiceCategories(currentBranchId)); } catch { setCategories([]); }
    try { setAssignments(await clinicApi.getDoctorNaryads()); } catch { setAssignments([]); }
    try { setEmployees(await clinicApi.getEmployees(currentBranchId || undefined)); } catch { setEmployees([]); }
  };

  useEffect(() => { loadData(); }, [clinicId, currentBranchId]);

  // Naryad shu kategoriyaga tegishlimi (real: category_ref; demo: nom bo'yicha)
  const itemInCategory = (item: NaryadCatalogItem, cat: ServiceCategory) =>
    (item.category_ref != null && String(item.category_ref) === cat.id) ||
    (!item.category_ref && !!item.category && item.category === cat.name);

  const countFor = (cat: ServiceCategory) => catalog.filter((i) => itemInCategory(i, cat)).length;
  const uncatCount = useMemo(
    () => catalog.filter((i) => !i.category_ref && !categories.some((c) => c.name === i.category)).length,
    [catalog, categories]
  );

  const visibleCategories = useMemo(() => {
    const q = catSearch.toLowerCase().trim();
    return q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;
  }, [categories, catSearch]);

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return catalog.filter((item) => {
      const matchSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q) ||
        (item.code || '').toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q);
      let matchCat = true;
      if (categoryFilter === 'all') matchCat = true;
      else if (categoryFilter === 'uncat') matchCat = !item.category_ref && !categories.some((c) => c.name === item.category);
      else {
        const cat = categories.find((c) => c.id === categoryFilter);
        matchCat = cat ? itemInCategory(item, cat) : true;
      }
      return matchSearch && matchCat;
    });
  }, [catalog, categories, searchQuery, categoryFilter]);

  // ---- Category handlers ----
  const openNewCat = () => { setEditingCat(null); setCatModalOpen(true); };
  const openEditCat = (cat: ServiceCategory) => { setEditingCat(cat); setCatModalOpen(true); };
  const handleCatSaved = (cat: ServiceCategory, isNew: boolean) => {
    setCategories((prev) => isNew ? [...prev, cat] : prev.map((c) => c.id === cat.id ? cat : c));
    showToast(tr('naryadcat.catSaved'));
  };
  const handleDeleteCat = async (cat: ServiceCategory) => {
    const inside = catalog.filter((i) => itemInCategory(i, cat));
    const msg = inside.length > 0
      ? tr('naryadcat.catConfirmDeleteN').replace('{n}', String(inside.length))
      : tr('naryadcat.catConfirmDelete');
    if (!confirm(msg)) return;
    try {
      await clinicApi.deleteServiceCategory(cat.id);
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      // kategoriya bilan birga ichidagi naryadlar ham o'chadi (lokal ro'yxatdan)
      const insideIds = new Set(inside.map((i) => i.id));
      setCatalog((prev) => prev.filter((i) => !insideIds.has(i.id)));
      if (categoryFilter === cat.id) setCategoryFilter('all');
      showToast(inside.length > 0
        ? tr('naryadcat.catDeletedN').replace('{n}', String(inside.length))
        : tr('naryadcat.catDeleted'));
    } catch { saveErrToast(); }
  };

  // ---- Procedure handlers ----
  const openNewProc = () => {
    if (categories.length === 0) { showToast(tr('naryadcat.catRequired')); openNewCat(); return; }
    setEditingItem(null); setProcModalOpen(true);
  };
  const openEditProc = (item: NaryadCatalogItem) => { setQuickEditingId(null); setEditingItem(item); setProcModalOpen(true); };
  const handleProcSaved = (item: NaryadCatalogItem, isNew: boolean) => {
    setCatalog((prev) => isNew ? [item, ...prev] : prev.map((c) => c.id === item.id ? item : c));
    // yangi kategoriya biriktirilgan bo'lsa item_count yangilash uchun qayta yuklash shart emas —
    // lekin yangi element qo'shilganda count o'zgaradi; soddalik uchun kategoriyalarni yangilaymiz
    clinicApi.getServiceCategories().then(setCategories).catch(() => {});
    showToast(isNew
      ? (lng === 'uz' ? 'Yangi naryad kiritildi!' : lng === 'en' ? 'New naryad added!' : 'Новый наряд добавлен!')
      : (lng === 'uz' ? 'Naryad saqlandi!' : lng === 'en' ? 'Naryad saved!' : 'Наряд сохранён!'));
  };
  const handleDeleteProc = async (id: string) => {
    if (!confirm(tr('naryadcat.confirmDelete'))) return;
    try {
      await clinicApi.deleteNaryadCatalogItem(id);
      setCatalog((prev) => prev.filter((c) => c.id !== id));
      showToast(lng === 'uz' ? 'Naryad o‘chirildi' : lng === 'en' ? 'Naryad deleted' : 'Наряд удалён');
    } catch { saveErrToast(); }
  };

  // ---- Quick price edit ----
  const startQuickPrice = (item: NaryadCatalogItem) => { setQuickEditingId(item.id); setQuickPriceValue(item.base_price); };
  const saveQuickPrice = async (id: string) => {
    if (!Number.isFinite(quickPriceValue) || quickPriceValue < 0) { setQuickEditingId(null); return; }
    try {
      const updated = await clinicApi.updateNaryadCatalogItem(id, { base_price: Number(quickPriceValue) });
      if (updated) {
        setCatalog((prev) => prev.map((c) => c.id === updated.id ? updated : c));
        showToast(lng === 'uz' ? 'Narx yangilandi!' : lng === 'en' ? 'Price updated!' : 'Цена обновлена!');
      }
    } catch { saveErrToast(); }
    setQuickEditingId(null);
  };

  // ---- Controlled import (empty catalog) ----
  const handleImport = async (source: 'local' | 'default') => {
    if (importing) return;
    setImporting(true);
    try {
      const { created, skipped } = await clinicApi.importNaryadCatalog(source);
      await loadData();
      const extra = skipped ? (lng === 'uz' ? `, ${skipped} ta mavjud` : lng === 'en' ? `, ${skipped} existing` : `, ${skipped} уже были`) : '';
      showToast(lng === 'uz' ? `${created} ta xizmat import qilindi${extra}` : lng === 'en' ? `${created} services imported${extra}` : `Импортировано услуг: ${created}${extra}`);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : (lng === 'uz' ? 'Import amalga oshmadi' : lng === 'en' ? 'Import failed' : 'Импорт не удался'));
    } finally { setImporting(false); }
  };

  const catName = (item: NaryadCatalogItem) => item.category_name || item.category || tr('naryadcat.uncategorized');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1700px] mx-auto space-y-6 pb-24 text-slate-900 dark:text-white">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[70] bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 text-sm font-bold animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-5 h-5" /><span>{toastMessage}</span>
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
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">{tr('naryadcat.subtitle')}</p>
          </div>
        </div>
        <button onClick={openNewProc} className="flex items-center space-x-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs sm:text-sm font-black transition-all shadow-md shadow-blue-500/25 whitespace-nowrap active:scale-95">
          <Plus className="w-4 h-4 stroke-[3]" /><span>{tr('naryadcat.addNaryad')}</span>
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{tr('naryadcat.kpiTotal')}</span>
          <p className="text-2xl sm:text-3xl font-black mt-2 tabular-nums">{catalog.length} <span className="text-sm font-semibold text-slate-400">{lng === 'uz' ? 'xizmat' : lng === 'en' ? 'items' : 'услуг'}</span></p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-sky-400">{tr('naryadcat.kpiCategories')}</span>
          <p className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-sky-400 mt-2 tabular-nums">{categories.length} <span className="text-sm font-semibold text-slate-400">{lng === 'uz' ? 'kategoriya' : lng === 'en' ? 'categories' : 'категорий'}</span></p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">{tr('naryadcat.kpiAvgPrice')}</span>
          <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2 tabular-nums">{(catalog.length ? Math.round(catalog.reduce((a, c) => a + c.base_price, 0) / catalog.length) : 0).toLocaleString()} <span className="text-sm font-semibold">{som}</span></p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">{tr('naryadcat.kpiAssignments')}</span>
          <p className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 mt-2 tabular-nums">{assignments.length} <span className="text-sm font-semibold text-slate-400">{lng === 'uz' ? 'tarif' : lng === 'en' ? 'rates' : 'тарифов'}</span></p>
        </div>
      </div>

      {/* Two-panel: LEFT categories CRUD | RIGHT procedures */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
        {/* LEFT — categories */}
        <aside className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={catSearch} onChange={(e) => setCatSearch(e.target.value)} placeholder={tr('naryadcat.catSearchPlaceholder')} className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={openNewCat} title={tr('naryadcat.catAdd')} className="p-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shrink-0 shadow-sm active:scale-95 transition"><Plus className="w-4 h-4 stroke-[3]" /></button>
          </div>

          <div className="p-2 space-y-1 max-h-[70vh] overflow-y-auto">
            <button onClick={() => setCategoryFilter('all')} className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${categoryFilter === 'all' ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>
              <span className="flex items-center gap-2"><Layers className="w-4 h-4" />{tr('naryadcat.catAll')}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${categoryFilter === 'all' ? 'bg-blue-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{catalog.length}</span>
            </button>

            {visibleCategories.map((cat) => {
              const active = categoryFilter === cat.id;
              return (
                <div key={cat.id} className={`group relative flex items-center rounded-xl ${active ? 'bg-blue-600' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  <button onClick={() => setCategoryFilter(cat.id)} className={`min-w-0 flex-1 flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-bold text-left ${active ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                    <span className="truncate min-w-0">{cat.name}</span>
                    {/* Soni — ong burchakka taqaladi; hover bo'lganda tahrirlash/o'chirish tugmalari o'rnini egallaydi */}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-black shrink-0 transition-opacity group-hover:opacity-0 ${active ? 'bg-blue-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{countFor(cat)}</span>
                  </button>
                  {/* Tahrirlash + o'chirish — soni ustida (ong burchak), faqat hover'da ko'rinadi */}
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
                    <button onClick={() => openEditCat(cat)} title={tr('naryadcat.catEdit')} className={`p-1.5 rounded-lg ${active ? 'text-white bg-blue-700/60 hover:bg-blue-700' : 'text-blue-600 dark:text-sky-400 bg-white/90 dark:bg-slate-900/90 hover:bg-blue-50 dark:hover:bg-blue-950/60'}`}><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDeleteCat(cat)} title={tr('common.delete')} className={`p-1.5 rounded-lg ${active ? 'text-white bg-blue-700/60 hover:bg-rose-600' : 'text-rose-500 bg-white/90 dark:bg-slate-900/90 hover:bg-rose-50 dark:hover:bg-rose-950/40'}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              );
            })}

            {uncatCount > 0 && (
              <button onClick={() => setCategoryFilter('uncat')} className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${categoryFilter === 'uncat' ? 'bg-slate-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500'}`}>
                <span>{tr('naryadcat.uncategorized')}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${categoryFilter === 'uncat' ? 'bg-slate-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{uncatCount}</span>
              </button>
            )}

            {categories.length === 0 && (
              <p className="text-xs text-slate-400 font-semibold text-center py-6 px-2">{tr('naryadcat.catEmpty')}</p>
            )}
          </div>
        </aside>

        {/* RIGHT — procedures table */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={tr('naryadcat.searchPlaceholder')} className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs" />
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 dark:bg-slate-800/60 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-4 px-4 w-24">{tr('naryadcat.colCode')}</th>
                    <th className="py-4 px-4">{tr('naryadcat.colName')}</th>
                    <th className="py-4 px-4 text-right">{tr('naryadcat.colBasePrice')}</th>
                    <th className="py-4 px-4 text-center w-32">{tr('naryadcat.colDuration')}</th>
                    <th className="py-4 px-4 text-center w-28">{tr('naryadcat.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredCatalog.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-16 text-center text-slate-400 font-semibold">
                        <p className="text-sm font-bold">{tr('naryadcat.noItemsFound')}</p>
                        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                          <button onClick={openNewProc} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-2xl text-xs font-black shadow-md shadow-blue-500/20"><Plus className="w-4 h-4 stroke-[3]" /><span>{tr('naryadcat.addNaryad')}</span></button>
                          {searchQuery.trim() === '' && categoryFilter === 'all' && (
                            <>
                              <button onClick={() => handleImport('local')} disabled={importing} className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs font-black shadow-md shadow-emerald-500/20 disabled:opacity-50">{lng === 'uz' ? 'Eski narxlarni import qilish' : lng === 'en' ? 'Import old prices' : 'Импорт старых цен'}</button>
                              <button onClick={() => handleImport('default')} disabled={importing} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-2xl text-xs font-black disabled:opacity-50">{lng === 'uz' ? 'Standart ro‘yxat (narx 0)' : lng === 'en' ? 'Standard list (price 0)' : 'Стандартный список (цена 0)'}</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredCatalog.map((item) => {
                      const isQuick = quickEditingId === item.id;
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group">
                          <td className="py-4 px-4 font-mono font-bold text-slate-400 text-[11px]">{item.code || '—'}</td>
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 dark:text-white text-sm">{item.name}</span>
                              <button onClick={() => openEditProc(item)} className="p-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition shrink-0 shadow-2xs opacity-0 group-hover:opacity-100" title={tr('naryadcat.editItem')}><Edit2 className="w-3.5 h-3.5" /></button>
                            </div>
                            <div className="text-[11px] text-blue-500/80 dark:text-sky-400/80 font-semibold mt-0.5">{catName(item)}</div>
                          </td>
                          <td className="py-4 px-4 text-right">
                            {isQuick ? (
                              <div className="inline-flex items-center gap-1.5 justify-end">
                                <input type="number" autoFocus value={quickPriceValue} onChange={(e) => setQuickPriceValue(Number(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') saveQuickPrice(item.id); if (e.key === 'Escape') setQuickEditingId(null); }} className="w-32 px-2.5 py-1.5 bg-white dark:bg-slate-900 border-2 border-blue-500 rounded-xl text-xs font-black text-right outline-none shadow-sm" />
                                <button onClick={() => saveQuickPrice(item.id)} className="p-1.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700" title={tr('common.save')}><Check className="w-4 h-4 stroke-[3]" /></button>
                                <button onClick={() => setQuickEditingId(null)} className="p-1.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl" title={tr('common.cancel')}><X className="w-4 h-4" /></button>
                              </div>
                            ) : (
                              <span onClick={() => startQuickPrice(item)} className={`font-black text-sm cursor-pointer hover:text-blue-600 transition ${item.base_price === 0 ? 'text-amber-500' : 'text-slate-900 dark:text-white'}`} title={tr('naryads.quickEditHint')}>{item.base_price.toLocaleString()} {som}</span>
                            )}
                          </td>
                          <td className="py-4 px-4 text-center text-slate-500 font-bold">{item.duration_min != null ? `${item.duration_min} ${tr('naryadcat.minShort')}` : '—'}</td>
                          <td className="py-4 px-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => openEditProc(item)} className="p-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-xl transition shadow-2xs" title={tr('naryadcat.editItem')}><Edit2 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => handleDeleteProc(item.id)} className="p-2 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500 rounded-xl transition" title={tr('common.delete')}><Trash2 className="w-4 h-4" /></button>
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
        </div>
      </div>

      <ServiceCategoryModal open={catModalOpen} editing={editingCat} onClose={() => setCatModalOpen(false)} onSaved={handleCatSaved} onError={saveErrToast} />
      <ServiceProcedureModal open={procModalOpen} editing={editingItem} categories={categories} defaultCategoryId={categoryFilter !== 'all' && categoryFilter !== 'uncat' ? categoryFilter : null} onClose={() => setProcModalOpen(false)} onSaved={handleProcSaved} onError={saveErrToast} />
    </div>
  );
}
