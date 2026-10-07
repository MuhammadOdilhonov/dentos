'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  ChevronLeft,
  Sun,
  Moon,
  Globe,
  MessageSquare,
  Send,
  KeyRound,
  Phone,
  ImageIcon,
  PlayCircle,
  ShieldCheck
} from 'lucide-react';
import { useAuth, UserRole } from '../../lib/auth';
import { clinicApi } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

// O'ng paneldagi karusel rasmlari — foydalanuvchi public/login/ ichiga qo'yadi (1..5.gif)
const IMG_SLIDES = [1, 2, 3, 4, 5].map((n) => `/login/${n}.gif`);

type Mode = 'password' | 'code' | 'demo';
type CodeMethod = 'sms' | 'telegram';

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isInitialized, login, loginWithBackendUser, switchRole } = useAuth();
  const { language, setLanguage, tr } = useI18n();
  const { isDark, toggleTheme } = useTheme();

  const [mode, setMode] = useState<Mode>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // Kod (OTP) oqimi
  const [codeMethod, setCodeMethod] = useState<CodeMethod>('sms');
  const [codeStep, setCodeStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('+998 ');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [info, setInfo] = useState('');

  // Rasm karusel — har bir slot uchun rasm mavjudligini oldindan tekshiramiz
  const [imgIdx, setImgIdx] = useState(0);
  const [available, setAvailable] = useState<Set<number>>(new Set());

  useEffect(() => {
    IMG_SLIDES.forEach((src, i) => {
      const im = new Image();
      im.onload = () => setAvailable((prev) => new Set(prev).add(i));
      im.src = src;
    });
  }, []);

  const getDestinationForRole = (role: UserRole): string => {
    switch (role) {
      case 'director':
      case 'deputy_director':
        return '/dashboard';
      case 'admin':
      case 'doctor':
      case 'kassa':
        return '/appointments';
      case 'technician':
        return '/technician';
      case 'superadmin':
        return '/super-admin';
      default:
        return '/dashboard';
    }
  };

  useEffect(() => {
    if (isInitialized && user) {
      const redirectParam = searchParams.get('redirect');
      if (redirectParam && redirectParam !== '/' && redirectParam !== '/login') router.replace(redirectParam);
      else router.replace(getDestinationForRole(user.role));
    }
  }, [user, isInitialized, router, searchParams]);

  useEffect(() => {
    const t = setInterval(() => setImgIdx((i) => (i + 1) % IMG_SLIDES.length), 3800);
    return () => clearInterval(t);
  }, []);

  // ── Login / parol ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return setError(tr('login.errLogin'));
    if (!password.trim()) return setError(tr('login.errPassword'));
    setError('');
    setIsLoading(true);
    try {
      const ok = await login(username, password);
      if (ok) {
        let role: UserRole = 'director';
        try { const s = localStorage.getItem('32desk_auth_user'); if (s) role = JSON.parse(s).role || 'director'; } catch {}
        router.replace(getDestinationForRole(role));
      } else setError(tr('login.errWrong'));
    } catch (err: any) {
      setError(err?.message || tr('login.errGeneric'));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Kod yuborish / tasdiqlash ──
  const openCode = (method: CodeMethod) => {
    setError(''); setInfo(''); setDevCode(null); setCode('');
    setCodeMethod(method); setCodeStep('phone'); setMode('code');
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.replace(/\D/g, '').length < 7) return setError(tr('login.errPhone'));
    setError(''); setInfo(''); setDevCode(null);
    setIsLoading(true);
    try {
      const res = await clinicApi.requestLoginCode(phone, codeMethod);
      if (res.ok) {
        setCodeStep('code');
        setInfo(codeMethod === 'telegram' ? tr('login.codeSentTg') : tr('login.codeSentSms'));
        if (res.dev_code) setDevCode(res.dev_code);
      } else setError(res.message || tr('login.errGeneric'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 4) return setError(tr('login.errCode'));
    setError('');
    setIsLoading(true);
    try {
      const u = await clinicApi.verifyLoginCode(phone, code.trim());
      if (u && !u.__error) {
        loginWithBackendUser(u);
        router.replace(getDestinationForRole((u.role as UserRole) || 'director'));
      } else {
        setError((u && u.__error) || tr('login.errWrong'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Demo (parolsiz, clinic #1) ──
  const handleQuickRoleLogin = async (role: UserRole) => {
    setError(''); setIsLoading(true);
    try {
      await switchRole(role);
      router.replace(getDestinationForRole(role));
    } catch (err: any) {
      setError(err?.message || tr('login.errRole'));
      setIsLoading(false);
    }
  };

  const demoRoles: { role: UserRole; title: string; icon: string; dest: string; color: string }[] = [
    { role: 'director', title: tr('login.r_director_t'), icon: '👑', dest: tr('login.destDashboard'), color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30' },
    { role: 'deputy_director', title: tr('login.r_deputy_t'), icon: '👔', dest: tr('login.destDashboard'), color: 'from-teal-500/20 to-emerald-500/10 border-teal-500/30' },
    { role: 'admin', title: tr('login.r_admin_t'), icon: '📋', dest: tr('login.destZapis'), color: 'from-blue-500/20 to-indigo-500/10 border-blue-500/30' },
    { role: 'doctor', title: tr('login.r_doctor_t'), icon: '🩺', dest: tr('login.destZapis'), color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30' },
    { role: 'kassa', title: tr('login.r_kassa_t'), icon: '💳', dest: tr('login.destZapis'), color: 'from-purple-500/20 to-violet-500/10 border-purple-500/30' },
    { role: 'technician', title: tr('login.r_tech_t'), icon: '🔧', dest: tr('login.destTech'), color: 'from-cyan-500/20 to-blue-500/10 border-cyan-500/30' },
    { role: 'superadmin', title: tr('login.r_super_t'), icon: '⚡', dest: tr('login.destSuper'), color: 'from-rose-500/20 to-pink-500/10 border-rose-500/30' }
  ];

  const inputCls =
    'w-full pl-10 pr-4 py-3.5 bg-slate-50 dark:bg-[#070D1E] border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition disabled:opacity-50';
  const primaryBtn =
    'w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-black uppercase tracking-wider rounded-2xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50';
  const quickBtn =
    'flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 transition active:scale-[0.98]';

  const activeImg = IMG_SLIDES[imgIdx];
  const imgReady = available.has(imgIdx);

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2 bg-white dark:bg-[#0A1020] font-sans">

      {/* ════════ CHAP: FORMA ════════ */}
      <div className="relative flex flex-col min-h-screen p-6 sm:p-10 lg:p-14">
        {/* Yuqori panel: logo (chap) + Demo + til + tema (o'ng) */}
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-md shadow-blue-500/25 text-white font-black text-sm">D</div>
            <span className="font-black text-base tracking-tight text-slate-900 dark:text-white">DentOS</span>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-blue-600/10 text-blue-600 dark:text-blue-300">v2.4 Pro</span>
          </Link>

          <div className="flex items-center gap-2">
            {/* DEMO tugmasi — eng tepada */}
            <button
              onClick={() => { setError(''); setMode(mode === 'demo' ? 'password' : 'demo'); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 ${
                mode === 'demo'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                  : 'bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-900/50 hover:bg-cyan-100 dark:hover:bg-cyan-950/50'
              }`}
            >
              <PlayCircle className="w-3.5 h-3.5" /> {tr('login.demoBtn')}
            </button>
            <button onClick={() => setLanguage(language === 'uz' ? 'ru' : language === 'ru' ? 'en' : 'uz')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition">
              <Globe className="w-3.5 h-3.5" /><span className="uppercase">{language}</span>
            </button>
            <button onClick={toggleTheme} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center transition">
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>
          </div>
        </div>

        {/* Markaz: forma */}
        <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto py-10">
          {mode !== 'demo' ? (
            <>
              <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{tr('login.title')}</h1>
              <p className="text-sm text-slate-400 mt-1.5">{tr('login.subtitle2')}</p>

              {error && (
                <div className="mt-5 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center gap-2 animate-in fade-in">
                  <span className="font-bold text-sm shrink-0">⚠️</span><span>{error}</span>
                </div>
              )}

              {/* ── LOGIN / PAROL ── */}
              {mode === 'password' && (
                <form onSubmit={handleSubmit} className="mt-7 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{tr('login.userLabel2')}</label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-4 pointer-events-none" />
                      <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={tr('login.userPh2')} disabled={isLoading} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">{tr('login.passLabel')}</label>
                      <span className="text-[11px] text-blue-600 dark:text-sky-400 hover:underline cursor-pointer font-bold">{tr('login.forgot')}</span>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-4 pointer-events-none" />
                      <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" disabled={isLoading} className={`${inputCls} pr-10 font-mono`} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-white transition">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs">
                    <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5" />
                    <span className="text-slate-500 dark:text-slate-400 font-medium">{tr('login.remember')}</span>
                  </label>
                  <button type="submit" disabled={isLoading} className={primaryBtn}>
                    {isLoading ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>{tr('login.checking')}</span></>) : (<><span>{tr('login.signIn')}</span><ArrowRight className="w-4 h-4" /></>)}
                  </button>

                  {/* yoki tezkor kirish: SMS kod / Telegram kod */}
                  <div className="pt-2 flex items-center gap-3">
                    <span className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                    <span className="text-[11px] font-semibold text-slate-400">{tr('login.orQuick')}</span>
                    <span className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => openCode('sms')} className={quickBtn}>
                      <MessageSquare className="w-4 h-4 text-blue-600" /> {tr('login.smsCode')}
                    </button>
                    <button type="button" onClick={() => openCode('telegram')} className={quickBtn}>
                      <Send className="w-4 h-4 text-sky-500" /> {tr('login.telegramBtn')}
                    </button>
                  </div>
                </form>
              )}

              {/* ── KOD BILAN KIRISH (SMS / Telegram) ── */}
              {mode === 'code' && (
                <div className="mt-7">
                  <button type="button" onClick={() => { setMode('password'); setError(''); }} className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-sky-400 hover:underline mb-4">
                    <ChevronLeft className="w-4 h-4" /> {tr('login.loginWithPass')}
                  </button>

                  <div className="flex items-center gap-2 mb-5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${codeMethod === 'telegram' ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-500' : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600'}`}>
                      {codeMethod === 'telegram' ? <Send className="w-4.5 h-4.5" /> : <MessageSquare className="w-4.5 h-4.5" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{tr('login.codeLoginTitle')}</p>
                      <p className="text-[11px] text-slate-400">{codeMethod === 'telegram' ? 'Telegram' : 'SMS'}</p>
                    </div>
                  </div>

                  {info && (
                    <div className="mb-4 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 shrink-0" /><span>{info}</span>
                    </div>
                  )}
                  {devCode && (
                    <div className="mb-4 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                      <Sparkles className="w-4 h-4 shrink-0" /><span>{tr('login.testModeCode')} <b className="font-mono tracking-widest text-base">{devCode}</b></span>
                    </div>
                  )}

                  {codeStep === 'phone' ? (
                    <form onSubmit={handleSendCode} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{tr('login.phoneLabel')}</label>
                        <div className="relative">
                          <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-4 pointer-events-none" />
                          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={tr('login.phonePh')} disabled={isLoading} className={inputCls} />
                        </div>
                      </div>
                      <button type="submit" disabled={isLoading} className={primaryBtn}>
                        {isLoading ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>{tr('login.sending')}</span></>) : (<><KeyRound className="w-4 h-4" /><span>{tr('login.sendCode')}</span></>)}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyCode} className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{tr('login.codeLabel')}</label>
                        <div className="relative">
                          <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-4 pointer-events-none" />
                          <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={tr('login.codePh')} disabled={isLoading} className={`${inputCls} font-mono tracking-[0.4em] text-center`} />
                        </div>
                      </div>
                      <button type="submit" disabled={isLoading} className={primaryBtn}>
                        {isLoading ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>{tr('login.checking')}</span></>) : (<><span>{tr('login.verifyBtn')}</span><ArrowRight className="w-4 h-4" /></>)}
                      </button>
                      <div className="flex items-center justify-between text-[11px]">
                        <button type="button" onClick={() => { setCodeStep('phone'); setCode(''); setInfo(''); setDevCode(null); }} className="font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">{tr('login.changeNumber')}</button>
                        <button type="button" onClick={handleSendCode as any} className="font-bold text-blue-600 dark:text-sky-400 hover:underline">{tr('login.resendCode')}</button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </>
          ) : (
            /* ════════ DEMO ════════ */
            <div className="animate-in fade-in slide-in-from-top-2 duration-200">
              <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">{tr('login.demoTitle')}</h1>
              <p className="text-sm text-slate-400 mt-1.5">{tr('login.demoSub')}</p>
              <div className="mt-5 p-3 rounded-2xl bg-cyan-50/70 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900/50 text-[11px] text-cyan-800 dark:text-cyan-300 flex items-start gap-2">
                <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{tr('login.demoHint')}</span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2">
                {demoRoles.map((r) => (
                  <button key={r.role} type="button" onClick={() => handleQuickRoleLogin(r.role)} disabled={isLoading}
                    className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all hover:scale-[1.01] active:scale-[0.99] bg-gradient-to-r ${r.color} disabled:opacity-50`}>
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <span className="text-base shrink-0">{r.icon}</span>
                      <p className="text-xs font-bold truncate text-slate-900 dark:text-white">{r.title}</p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-black/10 dark:bg-white/10 shrink-0 whitespace-nowrap">→ {r.dest}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pastki qator */}
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> {tr('login.copyright2')}</span>
          <Link href="/" className="flex items-center gap-1 font-semibold hover:text-slate-600 dark:hover:text-slate-200">
            <ChevronLeft className="w-3.5 h-3.5" /> {tr('login.backShort')}
          </Link>
        </div>
      </div>

      {/* ════════ O'NG: KATTA RASM KARUSEL ════════ */}
      <div className="relative hidden lg:block min-h-screen overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-700 to-slate-900">
        {/* Rasm (mavjud bo'lsa) yoki silliq placeholder */}
        {imgReady ? (
          <img key={activeImg} src={activeImg} alt="" className="absolute inset-0 w-full h-full object-cover animate-in fade-in duration-700" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/85">
            <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-black/20 rounded-full blur-3xl" />
            <div className="relative w-24 h-24 rounded-3xl bg-white/10 border border-white/25 flex items-center justify-center mb-5 shadow-xl">
              <ImageIcon className="w-11 h-11" />
            </div>
            <p className="relative text-xl font-black">{tr('login.slideHint')}</p>
            <p className="relative text-sm text-white/70 mt-1.5 font-mono">public/login/{imgIdx + 1}.gif</p>
            <p className="relative text-xs text-white/50 mt-4">{imgIdx + 1} / {IMG_SLIDES.length}</p>
          </div>
        )}

        {/* Gradient pastki soya + dots */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
        <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-2 z-10">
          {IMG_SLIDES.map((_, i) => (
            <button key={i} onClick={() => setImgIdx(i)} aria-label={`Slide ${i + 1}`}
              className={`h-2 rounded-full transition-all ${i === imgIdx ? 'w-8 bg-white' : 'w-2 bg-white/40 hover:bg-white/70'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
