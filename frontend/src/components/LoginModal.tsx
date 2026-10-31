'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, UserRole } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { Lock, User, Sun, Moon, Globe, AlertCircle } from 'lucide-react';

export default function LoginModal() {
  const router = useRouter();
  const { user, isInitialized, login, switchRole } = useAuth();
  const { language, setLanguage, t, tr } = useI18n();
  const { theme, toggleTheme, isDark } = useTheme();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showLangMenu, setShowLangMenu] = useState(false);

  // If already authenticated or still reading localStorage, don't show login modal
  if (!isInitialized) return null;
  if (user) return null;

  const [isLoading, setIsLoading] = useState(false);

  const routeFor = (u: string) => {
    const k = u.toLowerCase().trim();
    if (k === 'superadmin') return '/super-admin';
    if (k === 'technician' || k.startsWith('texnik')) return '/technician';
    if (k === 'director' || k === 'deputy_director') return '/dashboard';
    return '/appointments';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const success = await login(username, password);
    setIsLoading(false);
    if (!success) {
      setError(t.loginError || 'Login yoki parol noto‘g‘ri');
    } else {
      router.push(routeFor(username));
    }
  };

  const handleRoleSelect = async (role: UserRole) => {
    setError('');
    setIsLoading(true);
    await switchRole(role);
    setIsLoading(false);
    if (role === 'superadmin') router.push('/super-admin');
    else if (role === 'technician') router.push('/technician');
    else if (role === 'director' || role === 'deputy_director') router.push('/dashboard');
    else router.push('/appointments');
  };

  // Demo — direktordan texnikgacha barcha rollar (haqiqiy backend akkaunti orqali).
  // SuperAdmin ISTISNO: u faqat haqiqiy login talab qiladi.
  const roles: { role: UserRole; title: string; label: string; desc: string; icon: string }[] = [
    {
      role: 'director',
      title: 'Director',
      label: 'Klinika Rahbari / Direktor',
      desc: 'To‘liq moliyaviy tahlil va nazorat',
      icon: '👑'
    },
    {
      role: 'deputy_director',
      title: 'Boshqaruvchi',
      label: 'Direktor o‘rinbosari (Upravlyayushiy)',
      desc: 'Naryadlar, xodimlar, vazifalar va nazorat',
      icon: '👔'
    },
    {
      role: 'admin',
      title: 'Admin',
      label: 'Qabulxona Administratori',
      desc: 'Qabullar, bemorlar, vazifalar',
      icon: '📋'
    },
    {
      role: 'doctor',
      title: 'Doctor',
      label: 'Vrach-Stomatolog',
      desc: 'Mening qabullarim, bemorlar, profil',
      icon: '🩺'
    },
    {
      role: 'kassa',
      title: 'Kassa',
      label: 'Kassir / Hisobchi',
      desc: 'To‘lovlar, cheklar, kassa hisoboti',
      icon: '💳'
    },
    {
      role: 'technician',
      title: 'Zubnoy Texnik',
      label: 'Laboratoriya Portali (demo klinikaga ulangan)',
      desc: 'Naryad buyurtmalari, narxlar',
      icon: '🔧'
    }
  ];

  return (
    <div className="fixed inset-0 z-[999] bg-slate-100 dark:bg-[#0B1329] flex flex-col items-center justify-center p-4 select-none overflow-y-auto transition-colors">
      {/* Top Utilities: Language Switcher & Day/Night Theme */}
      <div className="absolute top-5 right-5 flex items-center space-x-3 z-50">
        {/* Language dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-xs"
          >
            <Globe className="w-3.5 h-3.5 text-sky-500" />
            <span className="uppercase">{language}</span>
          </button>

          {showLangMenu && (
            <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 text-xs z-50">
              <button
                onClick={() => {
                  setLanguage('uz');
                  setShowLangMenu(false);
                }}
                className={`w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center space-x-2 ${
                  tr('loginmodal.textSlate700DarkTextSlate')
                }`}
              >
                <span>🇺🇿 O‘zbek</span>
              </button>
              <button
                onClick={() => {
                  setLanguage('ru');
                  setShowLangMenu(false);
                }}
                className={`w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center space-x-2 ${
                  language === 'ru' ? 'text-blue-600 dark:text-sky-400 font-bold' : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                <span>🇷🇺 Русский</span>
              </button>
              <button
                onClick={() => {
                  setLanguage('en');
                  setShowLangMenu(false);
                }}
                className={`w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center space-x-2 ${
                  language === 'en' ? 'text-blue-600 dark:text-sky-400 font-bold' : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                <span>🇬🇧 English</span>
              </button>
            </div>
          )}
        </div>

        {/* Day / Night toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-xs"
          title={t.themeToggle}
        >
          {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-600" />}
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200 text-slate-900 dark:text-white transition-colors">
        {/* Header */}
        <div className="p-7 bg-slate-900 text-white text-center relative overflow-hidden">
          <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-br from-blue-600 to-sky-500 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-600/30">
            <span className="font-black text-lg text-white tracking-tight">De</span>
          </div>
          <h2 className="text-xl font-black tracking-tight">dentOS</h2>
          <p className="text-xs text-slate-400 mt-1">{t.loginSubtitle}</p>
        </div>

        {/* Form */}
        <div className="p-6 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                {t.usernameLabel}:
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  placeholder="superadmin, director, admin, doctor, kassa, technician"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full font-semibold pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                {t.passwordLabel}:
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  placeholder="123456"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full font-semibold pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {error && (
              <div className="text-xs text-rose-600 dark:text-rose-400 font-medium bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-blue-500/25 active:scale-95"
            >
              {isLoading ? 'Kirilmoqda…' : t.loginButton}
            </button>
          </form>

          {/* Quick 1-click Role Login */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center mb-2.5">
              {t.quickLoginLabel}
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {roles.map((r) => (
                <button
                  key={r.role}
                  type="button"
                  onClick={() => handleRoleSelect(r.role)}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-slate-800 hover:border-blue-300 text-left transition group"
                >
                  <div className="flex items-center space-x-1.5">
                    <span className="text-base">{r.icon}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-sky-400">
                      {r.title}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{r.label}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
