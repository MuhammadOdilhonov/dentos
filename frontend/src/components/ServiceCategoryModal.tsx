'use client';

import React, { useEffect, useState } from 'react';
import { X, Save, Layers, Building2 } from 'lucide-react';
import { clinicApi } from '../lib/api';
import { ServiceCategory } from '../lib/types';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useBranch } from '../lib/branchContext';

interface Props {
  open: boolean;
  editing: ServiceCategory | null;
  onClose: () => void;
  onSaved: (cat: ServiceCategory, isNew: boolean) => void;
  onError?: () => void;
}

export default function ServiceCategoryModal({ open, editing, onClose, onSaved, onError }: Props) {
  const { tr } = useI18n();
  const { user } = useAuth();
  const { branches, currentBranchId } = useBranch();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showInCalendar, setShowInCalendar] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Biriktirilgan direktor o'rinbosari — filial qulflanadi (faqat o'z filialiga yaratadi)
  const isDeputyAssigned = user?.role === 'deputy_director' && Boolean(user?.branchId);

  useEffect(() => {
    if (open) {
      setName(editing?.name || '');
      setDescription(editing?.description || '');
      setShowInCalendar(!!editing?.show_in_calendar);
      const initBranch = editing
        ? (editing.branch ?? null)
        : (isDeputyAssigned ? (user?.branchId ?? null) : (currentBranchId ?? null));
      setSelectedBranchId(initBranch != null ? Number(initBranch) : null);
      setSaving(false);
    }
  }, [open, editing, isDeputyAssigned, user?.branchId, currentBranchId]);

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const branchVal = isDeputyAssigned ? (user?.branchId ?? null) : selectedBranchId;
      const payload = {
        name: name.trim(),
        description: description.trim(),
        show_in_calendar: showInCalendar,
        branch: branchVal
      };
      if (editing) {
        const updated = await clinicApi.updateServiceCategory(editing.id, payload);
        if (updated) onSaved(updated, false);
      } else {
        const created = await clinicApi.createServiceCategory(payload);
        onSaved(created, true);
      }
      onClose();
    } catch {
      onError?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              {editing ? tr('naryadcat.catEdit') : tr('naryadcat.catNew')}
            </h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5 text-sm">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
              {tr('naryadcat.catNameLabel')} *
            </label>
            <input
              type="text" required autoFocus value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr('naryadcat.catNamePlaceholder')}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition"
            />
          </div>

          {/* Filial — kategoriya qaysi filialga tegishli (bo'sh = barcha filiallar / umumiy) */}
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
              <span>{tr('staff.branch')}</span>
            </label>
            <select
              value={selectedBranchId ?? ''}
              disabled={isDeputyAssigned}
              onChange={(e) => setSelectedBranchId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition disabled:opacity-60 cursor-pointer"
            >
              <option value="">{tr('staff.allBranches')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>🏢 {b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
              {tr('naryadcat.catDescLabel')}
            </label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder={tr('naryadcat.catDescPlaceholder')}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-2xl font-medium resize-none outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white transition"
            />
          </div>

          <button
            type="button" onClick={() => setShowInCalendar((v) => !v)}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <span>
              <span className="block font-bold text-slate-800 dark:text-slate-200">{tr('naryadcat.catShowCalendar')}</span>
              <span className="block text-xs text-slate-400 mt-0.5">{tr('naryadcat.catShowCalendarHint')}</span>
            </span>
            <span className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${showInCalendar ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
              <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${showInCalendar ? 'translate-x-5' : ''}`} />
            </span>
          </button>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={onClose} className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl text-sm font-bold transition">
              {tr('naryadcat.cancel')}
            </button>
            <button type="submit" disabled={saving || !name.trim()} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl text-sm font-black shadow-lg shadow-blue-500/25 transition active:scale-95">
              <Save className="w-4 h-4" />
              <span>{tr('naryadcat.save')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
