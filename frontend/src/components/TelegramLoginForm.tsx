'use client';
import { apiFetch } from '../lib/http';
import { useState } from 'react';
import { Send, ArrowLeft, ExternalLink } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useRouter } from 'next/navigation';
import PhoneInput from './PhoneInput';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';
const BOT = 'https://t.me/dentosccbot?start=login';

export default function TelegramLoginForm({ purpose, onBack }: { purpose: 'login' | 'reset'; onBack: () => void }) {
  const { loginWithBackendUser } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('+998 ');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const field = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50';
  const button = 'w-full py-3.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm disabled:opacity-50';

  async function send() {
    if (!/^[1-9]\d{6,14}$/.test(phone.replace(/\D/g, ''))) {
      setError('Telefon raqamini xalqaro formatda kiriting.');
      return;
    }
    setBusy(true); setError('');
    try {
      const response = await apiFetch(`${API}/auth/telegram/request/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, purpose }) });
      const data = await response.json();
      if (!response.ok || !data.sent) { setError(data.message || 'Kod yuborilmadi.'); return; }
      setChallenge(data.challenge_id); setCode('');
    } catch { setError('Serverga ulanib bo‘lmadi. Qayta urinib ko‘ring.'); }
    finally { setBusy(false); }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const response = await apiFetch(`${API}/auth/telegram/verify/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code, challenge_id: challenge, ...(purpose === 'reset' ? { new_password: password } : {}) }) });
      const data = await response.json();
      if (!response.ok || !data.ok) { setError(data.message || 'Kod noto‘g‘ri.'); return; }
      loginWithBackendUser(data.user);
      const role = data.user.role;
      router.replace(role === 'superadmin' ? '/super-admin' : role === 'technician' ? '/technician' : ['director', 'deputy_director'].includes(role) ? '/dashboard' : '/appointments');
    } catch { setError('Serverga ulanib bo‘lmadi. Qayta urinib ko‘ring.'); }
    finally { setBusy(false); }
  }

  return <div className="mt-6 space-y-5">
    <button type="button" disabled={busy} onClick={onBack} className="flex items-center gap-1 text-xs font-semibold text-sky-700 dark:text-sky-300"><ArrowLeft size={14} />Login va parol orqali kirish</button>
    <div className="rounded-2xl border border-sky-100 dark:border-sky-900 bg-sky-50/70 dark:bg-sky-950/20 p-4">
      <div className="flex items-center gap-2 font-bold text-sm text-sky-900 dark:text-sky-200"><Send size={18} />{purpose === 'reset' ? 'Parolni tiklash' : 'Telegram orqali kirish'}</div>
      <p className="text-xs leading-6 text-slate-600 dark:text-slate-300 mt-2">Botni oching, Start bosing va o‘zingizning telefon raqamingizni yuboring. Keyin quyida shu raqamga kod so‘rang.</p>
      <a href={BOT} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-sky-600 text-white py-3 text-xs font-bold hover:bg-sky-700">Telegram botni ochish<ExternalLink size={14} /></a>
    </div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs leading-5 p-3">{error}</p>}
    {!challenge ? <form onSubmit={e => { e.preventDefault(); void send(); }} className="space-y-4">
      <label htmlFor="tg-phone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300"><span className="block mb-2">Telefon raqamingiz</span><PhoneInput id="tg-phone" required disabled={busy} value={phone} onChange={setPhone} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white" /></label>
      <button type="submit" disabled={busy} className={button}>{busy ? 'Yuborilmoqda…' : 'Telegramga kod yuborish'}</button>
    </form> : <form onSubmit={verify} className="space-y-4">
      <p role="status" className="text-xs leading-6 text-emerald-700 dark:text-emerald-300">Kod Telegram botga yuborildi. Botdagi 6 xonali kodni kiriting.</p>
      <label htmlFor="tg-code" className="block text-xs font-semibold text-slate-700 dark:text-slate-300"><span className="block mb-2">Bir martalik kod</span><input id="tg-code" autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required disabled={busy} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} className={`${field} tracking-[.5em] text-center font-mono text-lg`} placeholder="000000" /></label>
      {purpose === 'reset' && <label htmlFor="tg-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300"><span className="block mb-2">Yangi parol</span><input id="tg-password" type="password" autoComplete="new-password" minLength={8} required disabled={busy} value={password} onChange={e => setPassword(e.target.value)} className={field} /><span className="block text-slate-500 text-[11px] mt-2">Kamida 8 belgi. Oson topiladigan parol ishlatmang.</span></label>}
      <button type="submit" disabled={busy} className={button}>{busy ? 'Tekshirilmoqda…' : purpose === 'reset' ? 'Parolni yangilash va kirish' : 'Tasdiqlash va kirish'}</button>
      <div className="flex justify-between gap-3 text-xs text-sky-700 dark:text-sky-300"><button type="button" disabled={busy} onClick={() => { setChallenge(''); setCode(''); setError(''); }}>Raqamni o‘zgartirish</button><button type="button" disabled={busy} onClick={() => void send()}>Kodni qayta yuborish</button></div>
    </form>}
  </div>;
}
