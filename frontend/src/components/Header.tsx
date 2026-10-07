'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  Calendar,
  UserPlus,
  Globe,
  Bell,
  CheckCircle2,
  ChevronDown,
  LogOut,
  Phone,
  Sun,
  Moon,
  Shield,
  User,
  Building2,
  MapPin,
  Check
} from 'lucide-react';
import { clinicApi } from '../lib/api';
import { Patient, Appointment } from '../lib/types';
import { useAuth, UserRole } from '../lib/auth';
import { useI18n, Language } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { useBranch } from '../lib/branchContext';

interface HeaderProps {
  onOpenNewPatient?: () => void;
  onSelectToday?: () => void;
  currentDateText?: string;
}

export default function Header({ onOpenNewPatient, onSelectToday }: HeaderProps) {
  const { user, logout, switchRole } = useAuth();
  const { language, setLanguage, t, tr } = useI18n();
  const { theme, toggleTheme, isDark } = useTheme();
  const { branches, currentBranch, currentBranchId, selectBranch, canChangeBranch } = useBranch();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ patients: Patient[]; appointments: Appointment[] }>({
    patients: [],
    appointments: []
  });
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showBranchDropdown, setShowBranchDropdown] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const branchRef = useRef<HTMLDivElement>(null);

  // Live search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults({ patients: [], appointments: [] });
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const res = await clinicApi.globalSearch(searchQuery);
      setSearchResults(res);
      setIsSearching(false);
      setShowSearchDropdown(true);
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setShowLangMenu(false);
      }
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) {
        setShowBranchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const languagesList: { code: Language; label: string; flag: string }[] = [
    { code: 'uz', label: 'O‘zbek', flag: '🇺🇿' },
    { code: 'ru', label: 'Русский', flag: '🇷🇺' },
    { code: 'en', label: 'English', flag: '🇬🇧' }
  ];

  return (
    <header className="h-14 bg-white dark:bg-[#0F172A] border-b border-slate-200 dark:border-slate-800 px-4 sm:px-5 flex items-center justify-between shadow-xs z-20 relative select-none transition-colors duration-200">
      <div className="flex items-center gap-3 sm:gap-4">
        {/* 1. Global Search (Поиск) */}
        <div className="relative w-56 sm:w-72" ref={searchRef}>
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchQuery.trim()) setShowSearchDropdown(true);
              }}
              placeholder={t.searchPlaceholder}
              className="w-full bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100/80 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-800 text-xs pl-9 pr-7 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-100 outline-none transition text-slate-900 dark:text-white placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {showSearchDropdown && (
            <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-50 animate-in fade-in">
              <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50">
                <span className="font-semibold">{t.search}</span>
                {isSearching && <span className="text-[10px] text-blue-600 dark:text-sky-400 animate-pulse">...</span>}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {/* Patients list */}
                {searchResults.patients.length > 0 && (
                  <div className="p-2">
                    <div className="text-[10px] font-bold uppercase text-slate-400 px-2 py-1">{t.patients}</div>
                    {searchResults.patients.map((p) => (
                      <a
                        key={p.id}
                        href={`/patients/${p.id}`}
                        className="px-3 py-2 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition flex items-center justify-between group"
                      >
                        <div className="flex items-center space-x-2.5">
                          <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold flex items-center justify-center text-xs">
                            {p.full_name[0]}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-sky-400">
                              {p.full_name}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center space-x-1">
                              <Phone className="w-3 h-3 text-slate-400 inline" />
                              <span>{p.phone}</span>
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {p.category_status}
                        </span>
                      </a>
                    ))}
                  </div>
                )}

                {/* Appointments list */}
                {searchResults.appointments.length > 0 && (
                  <div className="p-2">
                    <div className="text-[10px] font-bold uppercase text-slate-400 px-2 py-1">{t.appointments}</div>
                    {searchResults.appointments.map((a) => (
                      <div
                        key={a.id}
                        className="px-3 py-2 hover:bg-emerald-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition flex items-center justify-between"
                      >
                        <div>
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{a.patient_name}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">{a.treatment_notes} • {a.doctor_name}</p>
                        </div>
                        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md">
                          {new Date(a.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {searchResults.patients.length === 0 && searchResults.appointments.length === 0 && !isSearching && (
                  <div className="p-6 text-center text-xs text-slate-400">
                    {tr('headerx.noResultsFound')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 🏢 Branch Selector (Filial tanlash filtri) */}
        <div className="relative" ref={branchRef}>
          <button
            onClick={() => canChangeBranch && setShowBranchDropdown(!showBranchDropdown)}
            className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
              currentBranch
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-sky-300'
                : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            } ${canChangeBranch ? 'hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shadow-2xs' : 'cursor-default'}`}
            title={canChangeBranch ? (tr('header.k')) : (tr('header.k2'))}
          >
            <Building2 className={`w-3.5 h-3.5 ${currentBranch ? 'text-blue-600 dark:text-sky-400' : 'text-slate-400'}`} />
            <span className="max-w-[120px] sm:max-w-[190px] truncate">
              {currentBranch ? currentBranch.name : (tr('header.allBranches'))}
            </span>
            {canChangeBranch && (
              <ChevronDown className="w-3 h-3 text-slate-400" />
            )}
          </button>

          {showBranchDropdown && canChangeBranch && (
            <div className="absolute left-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-50 animate-in fade-in py-1">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {tr('header.selectBranch')}
              </div>

              {/* Barcha filiallar (All branches) */}
              <button
                onClick={() => { selectBranch(null); setShowBranchDropdown(false); }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition ${
                  currentBranchId === null ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-sky-400 font-bold' : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/60 flex items-center justify-center text-blue-600 dark:text-sky-400">
                    <Building2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="font-semibold">{tr('header.allBranches')}</p>
                    <p className="text-[10px] text-slate-400">{tr('header.k3')}</p>
                  </div>
                </div>
                {currentBranchId === null && <Check className="w-4 h-4 text-blue-600 dark:text-sky-400" />}
              </button>

              <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

              {/* Individual branches */}
              {branches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => { selectBranch(b.id); setShowBranchDropdown(false); }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition ${
                    currentBranchId === b.id ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-sky-400 font-bold' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <div className="truncate max-w-[190px]">
                      <p className="font-semibold truncate">{b.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{b.address || b.phone}</p>
                    </div>
                  </div>
                  {currentBranchId === b.id && <Check className="w-4 h-4 text-blue-600 dark:text-sky-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>


      {/* Right utilities: Calendar, UserPlus, Day/Night Theme, Language, Notifications, User Avatar */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Calendar Today Icon */}
        <button
          onClick={onSelectToday}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg transition"
          title={t.today}
        >
          <Calendar className="w-4 h-4" />
        </button>

        {/* Add Patient Icon */}
        <button
          onClick={onOpenNewPatient}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg transition"
          title={t.addPatient}
        >
          <UserPlus className="w-4 h-4" />
        </button>

        {/* Day / Night Theme Toggle (Kun / Tun) */}
        <button
          onClick={toggleTheme}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg transition"
          title={t.themeToggle}
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400 transition-transform rotate-0 hover:rotate-45" />
          ) : (
            <Moon className="w-4 h-4 text-sky-600 transition-transform rotate-0 hover:-rotate-12" />
          )}
        </button>

        {/* Language Switcher Dropdown (UZ / RU / EN) */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg transition text-xs font-bold border border-slate-200 dark:border-slate-700"
            title={tr('headerx.changeLanguage')}
          >
            <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
            <span className="uppercase">{language}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showLangMenu && (
            <div className="absolute right-0 mt-2 w-32 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 py-1.5 z-50 text-xs animate-in fade-in">
              {languagesList.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    setLanguage(l.code);
                    setShowLangMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition ${
                    language === l.code
                      ? 'text-blue-600 dark:text-sky-400 font-bold bg-blue-50/50 dark:bg-slate-800/60'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className="flex items-center space-x-1.5">
                    <span>{l.flag}</span>
                    <span>{l.label}</span>
                  </span>
                  {language === l.code && <span>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bell Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg transition relative"
            title={t.notifications}
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white dark:ring-slate-900"></span>
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-3 z-50 animate-in fade-in text-xs">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="font-bold text-slate-800 dark:text-white">{t.notifications}</span>
                <span className="text-[10px] text-blue-600 dark:text-sky-400 font-semibold cursor-pointer">
                  {tr('headerx.clear')}
                </span>
              </div>
              <div className="space-y-2">
                <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-100 dark:border-emerald-900 flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      {tr('headerx.smsConfirmation')}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">
                      {tr('headerx.patientLilyaGafarovaConfirmedAppoi')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Green Circle Avatar (MO) Matching Screenshot */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center space-x-1 pl-1 pr-1.5 py-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <div className="w-8 h-8 rounded-full bg-[#10B981] text-white font-bold flex items-center justify-center text-xs shadow-sm ring-2 ring-emerald-300/40">
              {user?.initials || 'MO'}
            </div>
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50 animate-in fade-in text-xs">
              {/* Profile Details */}
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                <p className="font-bold text-slate-800 dark:text-white">{user?.name || 'Музаффар Олимов'}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full inline-block">
                    {user?.roleLabel || 'Директор'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">@{user?.username || 'director'}</span>
                </div>
              </div>

              {/* Role-specific portal shortcuts */}
              {(user?.role === 'superadmin' || user?.role === 'technician') && (
                <div className="py-1.5 border-b border-slate-100 dark:border-slate-800 space-y-0.5">
                  {user?.role === 'superadmin' && (
                    <Link
                      href="/super-admin"
                      onClick={() => setShowProfileMenu(false)}
                      className="w-full text-left px-3 py-1.5 rounded-lg flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 font-bold transition text-[11px]"
                    >
                      <span>⚡ SuperAdmin Paneli</span>
                    </Link>
                  )}
                  {user?.role === 'technician' && (
                    <Link
                      href="/technician"
                      onClick={() => setShowProfileMenu(false)}
                      className="w-full text-left px-3 py-1.5 rounded-lg flex items-center gap-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 font-bold transition text-[11px]"
                    >
                      <span>🔧 Zubnoy Texnik Portali</span>
                    </Link>
                  )}
                </div>
              )}

              <div className="pt-1">
                <button
                  onClick={() => {
                    logout();
                    setShowProfileMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg flex items-center space-x-2 font-semibold"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  <span>{t.logout}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
