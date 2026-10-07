'use client';

import React from 'react';
import { BookOpen, Keyboard, PhoneCall } from 'lucide-react';
import { useI18n } from '../../lib/i18n';

export default function HelpPage() {
  const { t, tr, trRaw } = useI18n();

  const faqs: { q: string; a: string }[] = trRaw('help.faqs') || [];
  const hotkeys = [
    { label: tr('help.hk1'), key: tr('help.hk1v') },
    { label: tr('help.hk2'), key: tr('help.hk2v') },
    { label: tr('help.hk3'), key: tr('help.hk3v') },
    { label: tr('help.hk4'), key: tr('help.hk4v') },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto text-slate-900 dark:text-white transition-colors">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{t.help}</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
          {tr('help.subtitle')}
        </p>
      </div>

      {/* Hotkeys and Quick Tips Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-6">
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center space-x-2">
          <Keyboard className="w-5 h-5 text-blue-600 dark:text-sky-400" />
          <span>{tr('help.hotkeysTitle')}</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {hotkeys.map((hk, idx) => (
            <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300 font-medium">{hk.label}</span>
              <kbd className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-mono font-bold shadow-xs text-slate-800 dark:text-slate-200">
                {hk.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ Accordion List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center space-x-2">
          <BookOpen className="w-5 h-5 text-blue-600 dark:text-sky-400" />
          <span>{tr('help.faqTitle')}</span>
        </h2>

        <div className="space-y-3">
          {faqs.map((f, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 space-y-1.5"
            >
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">{f.q}</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Direct Tech Support Card */}
      <div className="bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-100 dark:border-blue-900/60 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-500/30">
            <PhoneCall className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{tr('help.supportTitle')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{tr('help.supportSub')}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <a
            href="tel:+998712000032"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            +998 (71) 200-00-32
          </a>
        </div>
      </div>
    </div>
  );
}
