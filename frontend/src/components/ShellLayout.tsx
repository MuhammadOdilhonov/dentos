'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import Header from './Header';
import NewPatientModal from './NewPatientModal';
import LoginModal from './LoginModal';
import { AuthProvider, useAuth } from '../lib/auth';
import { isRouteBlocked } from '../lib/modules';
import { I18nProvider } from '../lib/i18n';
import { ThemeProvider } from '../lib/theme';
import { clinicApi } from '../lib/api';
import { Patient } from '../lib/types';
import { BranchProvider } from '../lib/branchContext';

function ShellContent({ children }: { children: React.ReactNode }) {
  const { user, isInitialized } = useAuth();
  const [isNewPatientOpen, setIsNewPatientOpen] = useState(false);
  const pathname = usePathname();

  // Strict auth gate: If NOT logged in, redirect directly to /login
  React.useEffect(() => {
    if (isInitialized && !user && pathname !== '/' && pathname !== '/login') {
      window.location.href = '/login';
    }
  }, [isInitialized, user, pathname]);

  // Modul-gate: superadmin o'chirgan modul sahifasiga URL bilan kirsa ham — bosh sahifaga qaytaramiz.
  React.useEffect(() => {
    if (isInitialized && user && isRouteBlocked(user, pathname)) {
      const home =
        user.role === 'director' || user.role === 'deputy_director' ? '/dashboard' : '/appointments';
      window.location.href = home;
    }
  }, [isInitialized, user, pathname]);

  // 1. PUBLIC ROUTES: Bosh sahifa ('/') va Login sahifasi ('/login')
  // Sidebar va Header'siz, to'liq ekran sifatida render qilinadi.
  if (pathname === '/' || pathname === '/login') {
    return <>{children}</>;
  }

  // 2. Loading splash while auth initializes
  if (!isInitialized) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#070D1E] text-white">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 mx-auto bg-gradient-to-br from-blue-600 to-sky-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-600/30 animate-pulse">
            <span className="font-black text-xl text-white tracking-tight">D</span>
          </div>
          <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">dentOS Dental System</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#070D1E] text-white">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 mx-auto border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400">Kirish sahifasiga yo‘naltirilmoqda…</p>
        </div>
      </div>
    );
  }

  const handleSavePatient = async (patientData: Partial<Patient>) => {
    await clinicApi.createPatient(patientData);
    setIsNewPatientOpen(false);
  };

  // 4. Authenticated shell with dark mode support
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100/70 dark:bg-[#080d19] font-sans antialiased text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Sidebar (Chap panel) */}
      <Sidebar />

      {/* Main Column */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header (Yuqori panel) */}
        <Header
          onOpenNewPatient={() => setIsNewPatientOpen(true)}
          currentDateText="5 сен"
        />

        {/* Asosiy ishchi hudud (Main Content) */}
        <main className="flex-1 overflow-y-auto p-3 md:p-5 bg-[#F1F5F9]/70 dark:bg-[#0B132B] transition-colors duration-200">
          {children}
        </main>
      </div>

      {/* Global New Patient Modal */}
      <NewPatientModal
        isOpen={isNewPatientOpen}
        onClose={() => setIsNewPatientOpen(false)}
        onSave={handleSavePatient}
      />
    </div>
  );
}

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <BranchProvider>
            <ShellContent>{children}</ShellContent>
          </BranchProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
