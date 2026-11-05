'use client';

import { useEffect, useState } from 'react';
import { apiFetch, API_BASE_URL } from '../lib/http';
import { NaryadLogEntry } from '../lib/types';
import { useI18n } from '../lib/i18n';

export default function EmployeeNaryadJournal({ employeeId }: { employeeId: number }) {
  const { language } = useI18n();
  const t = (uz: string, ru: string, en: string) => language === 'uz' ? uz : language === 'en' ? en : ru;
  const [rows, setRows] = useState<NaryadLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setRows([]); setError(''); setLoading(true);
    apiFetch(`${API_BASE_URL}/employees/${employeeId}/naryad-journal/`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then(data => { if (!controller.signal.aborted) setRows(data); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [employeeId, revision]);
  const filtered = rows.filter(row => `${row.title} ${row.patient_name} ${row.note || ''}`.toLowerCase().includes(query.toLowerCase()));
  const money = (value?: number) => value == null ? '—' : Number(value).toLocaleString();
  return <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4">
    <div className="flex flex-wrap justify-between gap-3">
      <div><h2 className="text-lg font-bold">{t('Naryad jurnali', 'Журнал нарядов', 'Work order journal')}</h2>
        <p className="text-sm text-slate-500">{t('Faqat ko‘rish. Narx va foiz naryad yozilgan paytdagi holatda saqlanadi.', 'Только просмотр. Цена и процент сохраняются на момент записи.', 'Read only. Prices and rates are preserved at the time of entry.')}</p></div>
      <button type="button" onClick={() => setRevision(value => value + 1)} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600">{t('Yangilash', 'Обновить', 'Refresh')}</button>
    </div>
    <input aria-label={t('Jurnaldan qidirish', 'Поиск в журнале', 'Search journal')} placeholder={t('Xizmat yoki bemor bo‘yicha qidirish', 'Поиск по услуге или пациенту', 'Search service or patient')} value={query} onChange={event => setQuery(event.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent p-3" />
    {loading ? <p role="status">{t('Yuklanmoqda…', 'Загрузка…', 'Loading…')}</p> : error ? <p role="alert" className="text-red-600">{error}</p> : filtered.length === 0 ? <p>{t('Naryadlar topilmadi.', 'Наряды не найдены.', 'No work orders found.')}</p> : <div className="overflow-x-auto">
      <table className="w-full text-sm text-left"><thead><tr className="border-b border-slate-200 dark:border-slate-700">
        {[t('Sana / bemor', 'Дата / пациент', 'Date / patient'), t('Xizmat', 'Услуга', 'Service'), t('Narx × son', 'Цена × кол-во', 'Price × qty'), t('Jami', 'Итого', 'Total'), '%', t('Shifokor ulushi', 'Доля врача', 'Doctor share'), t('Klinika ulushi', 'Доля клиники', 'Clinic share')].map((label, index) => <th key={index} className="p-3 whitespace-nowrap">{label}</th>)}
      </tr></thead><tbody>{filtered.map((row, index) => <tr key={`${row.patient_id}-${row.id}-${index}`} className="border-b border-slate-100 dark:border-slate-800 align-top">
        <td className="p-3">{row.patient_name}<div className="text-xs text-slate-500">{row.created_at ? new Date(row.created_at).toLocaleString() : row.date}</div><div className="text-xs">{row.author}</div></td>
        <td className="p-3 min-w-56"><strong>{row.title}</strong><div>{row.teeth?.join(', ')}</div><div className="text-xs text-slate-500 whitespace-pre-wrap">{row.note}</div>{(row.action === 'removed' || row.status === 'cancelled') && <div className="text-red-600">{t('Bekor qilingan', 'Отменён', 'Cancelled')}: {row.reason}</div>}</td>
        <td className="p-3 whitespace-nowrap">{money(row.unitPrice)} × {row.quantity ?? '—'}</td><td className="p-3">{money(row.price)}</td><td className="p-3">{row.percent ?? '—'}</td><td className="p-3">{money(row.doctor_share)}</td><td className="p-3">{money(row.clinic_share)}</td>
      </tr>)}</tbody></table>
      <p className="mt-3 text-xs text-slate-500">{t('— : eski yozuvda ushbu ma’lumot saqlanmagan.', '— : в старой записи эти данные отсутствуют.', '— : this information was not stored in the old record.')}</p>
    </div>}
  </section>;
}
