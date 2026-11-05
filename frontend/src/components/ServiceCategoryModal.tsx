'use client';

import React, { useEffect, useState } from 'react';
import { X, Save, Layers } from 'lucide-react';
import { clinicApi } from '../lib/api';
import { ServiceCategory } from '../lib/types';
import { useI18n } from '../lib/i18n';

interface Props {
  open: boolean;
  editing: ServiceCategory | null;
  onClose: () => void;
  onSaved: (cat: ServiceCategory, isNew: boolean) => void;
  onError?: () => void;
}

export default function ServiceCategoryModal({ open, editing, onClose, onSaved, onError }: Props) {
  const { tr } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showInCalendar, setShowInCalendar] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name || '');
      setDescription(editing?.description || '');
      setShowInCalendar(!!editing?.show_in_calendar);
      setSaving(false);
    }
  }, [open, editing]);

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      if (editing) {
        const updated = await clinicApi.updateServiceCategory(editing.id, {
          name: name.trim(), description: description.trim(), show_in_calendar: showInCalendar,
        });
        if (updated) onSaved(updated, false);
      } else {
        const created = await clinicApi.createServiceCategory({
          name: name.trim(), description: description.trim(), show_in_calendar: showInCalendar,
        });
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
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 space-y-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
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
