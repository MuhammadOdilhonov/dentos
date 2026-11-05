'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Save, Plus, Trash2, Package, Activity, Stethoscope, Bell, FileText } from 'lucide-react';
import { clinicApi } from '../lib/api';
import { NaryadCatalogItem, ServiceCategory, NaryadPackageItem } from '../lib/types';
import { useI18n } from '../lib/i18n';

type TabKey = 'main' | 'package' | 'diagnosis' | 'manipulations' | 'reminder';

interface Props {
  open: boolean;
  editing: NaryadCatalogItem | null;
  categories: ServiceCategory[];
  defaultCategoryId: string | null;
  onClose: () => void;
  onSaved: (item: NaryadCatalogItem, isNew: boolean) => void;
  onError?: () => void;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export default function ServiceProcedureModal({ open, editing, categories, defaultCategoryId, onClose, onSaved, onError }: Props) {
  const { tr } = useI18n();
  const som = tr('naryadcat.som');
  const [tab, setTab] = useState<TabKey>('main');
  const [saving, setSaving] = useState(false);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [categoryRef, setCategoryRef] = useState<string>('');
  const [basePrice, setBasePrice] = useState<number>(0);
  const [durationMin, setDurationMin] = useState<string>('');
  const [bufferMin, setBufferMin] = useState<string>('');
  const [priceFixed, setPriceFixed] = useState(true);
  const [durationFixed, setDurationFixed] = useState(true);
  const [showInCalendar, setShowInCalendar] = useState(false);
  const [description, setDescription] = useState('');
  const [pkgItems, setPkgItems] = useState<NaryadPackageItem[]>([]);
  const [diagnoses, setDiagnoses] = useState<{ code?: string; name: string }[]>([]);
  const [manipulations, setManipulations] = useState<{ name: string; note?: string }[]>([]);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDays, setReminderDays] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setTab('main');
    setSaving(false);
    setCode(editing?.code || '');
    setName(editing?.name || '');
    setCategoryRef(editing?.category_ref || defaultCategoryId || '');
    setBasePrice(num(editing?.base_price));
    setDurationMin(editing?.duration_min != null ? String(editing.duration_min) : '');
    setBufferMin(editing?.buffer_min != null ? String(editing.buffer_min) : '');
    setPriceFixed(editing?.price_fixed ?? true);
    setDurationFixed(editing?.duration_fixed ?? true);
    setShowInCalendar(editing?.show_in_calendar ?? false);
    setDescription(editing?.description || '');
    setPkgItems(Array.isArray(editing?.package_items) ? editing!.package_items! : []);
    setDiagnoses(Array.isArray(editing?.diagnoses) ? editing!.diagnoses! : []);
    setManipulations(Array.isArray(editing?.manipulations) ? editing!.manipulations! : []);
    setReminderEnabled(editing?.reminder_enabled ?? false);
    setReminderDays(editing?.reminder_days != null ? String(editing.reminder_days) : '');
  }, [open, editing, defaultCategoryId]);

  const pkgTotal = useMemo(
    () => pkgItems.reduce((acc, it) => acc + num(it.qty) * num(it.price), 0),
    [pkgItems]
  );

  if (!open) return null;

  const canSave = name.trim().length > 0 && Number.isFinite(basePrice) && basePrice >= 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    const payload: Partial<NaryadCatalogItem> = {
      name: name.trim(),
      code: code.trim(),
      category_ref: categoryRef || null,
      base_price: num(basePrice),
      description: description.trim(),
      duration_min: durationMin === '' ? null : Math.max(0, Math.round(num(durationMin))),
      buffer_min: bufferMin === '' ? null : Math.max(0, Math.round(num(bufferMin))),
      price_fixed: priceFixed,
      duration_fixed: durationFixed,
      show_in_calendar: showInCalendar,
      package_items: pkgItems.filter((p) => (p.name || '').trim()).map((p) => ({
        name: p.name.trim(), qty: Math.max(1, Math.round(num(p.qty) || 1)), price: num(p.price), service_id: p.service_id,
      })),
      diagnoses: diagnoses.filter((d) => (d.name || '').trim()).map((d) => ({ code: (d.code || '').trim(), name: d.name.trim() })),
      manipulations: manipulations.filter((m) => (m.name || '').trim()).map((m) => ({ name: m.name.trim(), note: (m.note || '').trim() })),
      reminder_enabled: reminderEnabled,
      reminder_days: reminderEnabled && reminderDays !== '' ? Math.max(0, Math.round(num(reminderDays))) : null,
    };
    try {
      if (editing) {
        const updated = await clinicApi.updateNaryadCatalogItem(editing.id, payload);
        if (updated) onSaved(updated, false);
      } else {
        const created = await clinicApi.createNaryadCatalogItem(payload as Omit<NaryadCatalogItem, 'id'>);
        onSaved(created, true);
      }
      onClose();
    } catch {
      onError?.();
    } finally {
      setSaving(false);
    }
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'main', label: tr('naryadcat.tabMain'), icon: <FileText className="w-4 h-4" /> },
    { key: 'package', label: tr('naryadcat.tabPackage'), icon: <Package className="w-4 h-4" /> },
    { key: 'diagnosis', label: tr('naryadcat.tabDiagnosis'), icon: <Stethoscope className="w-4 h-4" /> },
    { key: 'manipulations', label: tr('naryadcat.tabManipulations'), icon: <Activity className="w-4 h-4" /> },
    { key: 'reminder', label: tr('naryadcat.tabReminder'), icon: <Bell className="w-4 h-4" /> },
  ];

  const inputCls = 'w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-2xl font-semibold outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition';
  const labelCls = 'block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2';

  const Toggle = ({ on, onClick, title, hint }: { on: boolean; onClick: () => void; title: string; hint?: string }) => (
    <button type="button" onClick={onClick} className="flex items-center justify-between gap-3 w-full text-left">
      <span>
        <span className="block font-bold text-slate-800 dark:text-slate-200 text-sm">{title}</span>
        {hint && <span className="block text-xs text-slate-400 mt-0.5">{hint}</span>}
      </span>
      <span className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${on ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
        <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${on ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 p-5 sm:p-6">
          <h3 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white">
            {editing ? tr('naryadcat.editItem') : tr('naryadcat.addItem')}
          </h3>
          <button onClick={onClose} className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto px-4 sm:px-6 pt-4 scrollbar-none border-b border-slate-100 dark:border-slate-800">
          {tabs.map((t) => (
            <button
              key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-600 text-blue-600 dark:text-sky-400'
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 sm:p-7 text-sm">
          {tab === 'main' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className={labelCls}>{tr('naryadcat.codeLabel')}</label>
                  <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder={tr('naryadcat.codePlaceholder')} className={inputCls} />
                </div>
                <div className="md:col-span-2">
                  <label className={labelCls}>{tr('naryadcat.procNameLabel')} *</label>
                  <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoFocus />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className={labelCls}>{tr('naryadcat.serviceLabel')} *</label>
                  <select value={categoryRef} onChange={(e) => setCategoryRef(e.target.value)} className={`${inputCls} cursor-pointer`}>
                    <option value="">{tr('naryadcat.uncategorized')}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{tr('naryadcat.basePriceLabel')}</label>
                  <input type="number" min={0} step={10000} value={basePrice} onChange={(e) => setBasePrice(Number(e.target.value))} className={`${inputCls} font-black`} />
                </div>
                <div>
                  <label className={labelCls}>{tr('naryadcat.durationLabel')}</label>
                  <input type="number" min={0} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder={tr('naryadcat.durationPlaceholder')} className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className={labelCls}>{tr('naryadcat.bufferLabel')}</label>
                  <input type="number" min={0} value={bufferMin} onChange={(e) => setBufferMin(e.target.value)} placeholder={tr('naryadcat.bufferPlaceholder')} className={inputCls} />
                </div>
                <div className="flex items-end pb-1"><Toggle on={priceFixed} onClick={() => setPriceFixed((v) => !v)} title={tr('naryadcat.priceFixed')} /></div>
                <div className="flex items-end pb-1"><Toggle on={durationFixed} onClick={() => setDurationFixed((v) => !v)} title={tr('naryadcat.durationFixed')} /></div>
              </div>

              <div>
                <label className={labelCls}>{tr('naryadcat.descLabel')}</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${inputCls} resize-none font-medium`} />
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                <Toggle on={showInCalendar} onClick={() => setShowInCalendar((v) => !v)} title={tr('naryadcat.showInCalendar')} hint={tr('naryadcat.showInCalendarHint')} />
              </div>

              <p className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950 text-sm text-blue-800 dark:text-blue-200">
                {tr('naryadcat.doctorShareText')} — {tr('naryadcat.zeroPriceNote')}
              </p>
            </div>
          )}

          {tab === 'package' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setPkgItems((p) => [...p, { name: '', qty: 1, price: 0 }])} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 rounded-2xl text-sm font-bold hover:bg-blue-100 dark:hover:bg-blue-900/60 transition">
                  <Plus className="w-4 h-4 stroke-[3]" /><span>{tr('naryadcat.pkgAddItem')}</span>
                </button>
                <span className="text-sm font-black text-slate-900 dark:text-white">{tr('naryadcat.pkgTotal')}: {pkgTotal.toLocaleString()} {som}</span>
              </div>
              {pkgItems.length === 0 ? (
                <p className="text-center text-slate-400 font-semibold py-10">{tr('naryadcat.pkgEmpty')}</p>
              ) : (
                <div className="space-y-2">
                  {pkgItems.map((it, i) => (
                    <div key={i} className="grid grid-cols-[1fr_80px_130px_40px] gap-2 items-center">
                      <input type="text" value={it.name} placeholder={tr('naryadcat.pkgName')} onChange={(e) => setPkgItems((p) => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className={inputCls} />
                      <input type="number" min={1} value={it.qty} title={tr('naryadcat.pkgQty')} onChange={(e) => setPkgItems((p) => p.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} className={`${inputCls} px-2 text-center`} />
                      <input type="number" min={0} step={10000} value={it.price} title={tr('naryadcat.pkgPrice')} onChange={(e) => setPkgItems((p) => p.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))} className={`${inputCls} px-2`} />
                      <button type="button" onClick={() => setPkgItems((p) => p.filter((_, j) => j !== i))} className="p-2.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'diagnosis' && (
            <div className="space-y-4">
              <button type="button" onClick={() => setDiagnoses((d) => [...d, { code: '', name: '' }])} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 rounded-2xl text-sm font-bold hover:bg-blue-100 dark:hover:bg-blue-900/60 transition">
                <Stethoscope className="w-4 h-4" /><span>{tr('naryadcat.diagSelect')}</span>
              </button>
              {diagnoses.length === 0 ? (
                <p className="text-center text-slate-400 font-semibold py-10">{tr('naryadcat.diagEmpty')}</p>
              ) : (
                <div className="space-y-2">
                  {diagnoses.map((d, i) => (
                    <div key={i} className="grid grid-cols-[120px_1fr_40px] gap-2 items-center">
                      <input type="text" value={d.code || ''} placeholder={tr('naryadcat.diagCode')} onChange={(e) => setDiagnoses((p) => p.map((x, j) => j === i ? { ...x, code: e.target.value } : x))} className={inputCls} />
                      <input type="text" value={d.name} placeholder={tr('naryadcat.diagName')} onChange={(e) => setDiagnoses((p) => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className={inputCls} />
                      <button type="button" onClick={() => setDiagnoses((p) => p.filter((_, j) => j !== i))} className="p-2.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'manipulations' && (
            <div className="space-y-4">
              <button type="button" onClick={() => setManipulations((m) => [...m, { name: '', note: '' }])} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 rounded-2xl text-sm font-bold hover:bg-blue-100 dark:hover:bg-blue-900/60 transition">
                <Plus className="w-4 h-4 stroke-[3]" /><span>{tr('naryadcat.manipAdd')}</span>
              </button>
              {manipulations.length === 0 ? (
                <p className="text-center text-slate-400 font-semibold py-10">{tr('naryadcat.manipEmpty')}</p>
              ) : (
                <div className="space-y-2">
                  {manipulations.map((m, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_40px] gap-2 items-center">
                      <input type="text" value={m.name} placeholder={tr('naryadcat.manipName')} onChange={(e) => setManipulations((p) => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className={inputCls} />
                      <input type="text" value={m.note || ''} placeholder={tr('naryadcat.manipNote')} onChange={(e) => setManipulations((p) => p.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} className={inputCls} />
                      <button type="button" onClick={() => setManipulations((p) => p.filter((_, j) => j !== i))} className="p-2.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'reminder' && (
            <div className="space-y-5 max-w-lg">
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                <Toggle on={reminderEnabled} onClick={() => setReminderEnabled((v) => !v)} title={tr('naryadcat.reminderToggle')} />
              </div>
              {reminderEnabled && (
                <div>
                  <label className={labelCls}>{tr('naryadcat.reminderDays')}</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} className={`${inputCls} max-w-[160px]`} />
                    <span className="text-sm font-bold text-slate-500">{tr('naryadcat.reminderDaysUnit')}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer (inside form so submit works from any tab) */}
          <div className="flex items-center justify-end gap-3 pt-6 mt-6 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={onClose} className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl text-sm font-bold transition">
              {tr('naryadcat.cancel')}
            </button>
            <button type="submit" disabled={!canSave || saving} className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl text-sm font-black shadow-lg shadow-blue-500/25 transition active:scale-95">
              <Save className="w-4 h-4" /><span>{tr('naryadcat.save')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
