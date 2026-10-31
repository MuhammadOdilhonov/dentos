'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  LayoutGrid,
  User,
  Package,
  PieChart,
  CheckCircle2,
  Tag,
  Activity,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  UserCog,
  FileSpreadsheet,
  Settings,
  ShieldAlert,
  Stethoscope,
  LogOut,
  Plus,
  CreditCard,
  CalendarPlus,
  Receipt,
  Building2,
  Sliders,
  HardDrive,
  Wrench,
  FlaskConical,
  Camera,
  ChevronDown,
  Box
} from 'lucide-react';
import { useAuth, UserRole } from '../lib/auth';
import { isNavBlocked } from '../lib/modules';
import { useI18n } from '../lib/i18n';
import { clinicApi } from '../lib/api';
import { Employee, ClinicTask } from '../lib/types';

interface NavItemDef {
  key: string;
  customTitle: string;
  href: string;
  icon: React.ElementType;
  badge?: number | string;
  isBeta?: boolean;
  allowedRoles: UserRole[];
}

interface SubNavItemDef {
  key: string;
  tabKey: string;
  customTitle: string;
  href: string;
  icon: React.ElementType;
}

const patientsSubItems: SubNavItemDef[] = [
  {
    key: 'patients_all',
    tabKey: '',
    customTitle: 'sidebarnav.allPatients',
    href: '/patients',
    icon: User
  },
  {
    key: 'patients_foto',
    tabKey: 'foto',
    customTitle: 'sidebarnav.photo',
    href: '/patients?tab=foto',
    icon: Camera
  },
  {
    key: 'patients_rentgen',
    tabKey: 'rentgen',
    customTitle: 'sidebarnav.xRay',
    href: '/patients?tab=rentgen',
    icon: Activity
  },
  {
    key: 'patients_skan',
    tabKey: 'skan',
    customTitle: 'sidebarnav.n3dScan',
    href: '/patients?tab=skan',
    icon: Box
  }
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { language, tr } = useI18n();

  // Collapsible state (ichiga kirganda / yoyilganda)
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [currentTab, setCurrentTab] = useState('');
  const [isPatientsExpanded, setIsPatientsExpanded] = useState<boolean>(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('32desk_sidebar_collapsed');
      if (stored !== null) {
        setIsCollapsed(stored === 'true');
      }
    } catch { }

    const checkTab = () => {
      if (typeof window !== 'undefined') {
        const t = new URLSearchParams(window.location.search).get('tab') || '';
        setCurrentTab(t);
      }
    };
    checkTab();
    window.addEventListener('popstate', checkTab);
    return () => window.removeEventListener('popstate', checkTab);
  }, [pathname]);

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem('32desk_sidebar_collapsed', String(next));
    } catch { }
  };

  const userRole: UserRole = user?.role || 'director';
  const isDirector = userRole === 'director';
  const isDirectorOrDeputy = userRole === 'director' || userRole === 'deputy_director';

  const [doctorStaffId, setDoctorStaffId] = useState<number>(1);
  const [pendingTaskCount, setPendingTaskCount] = useState<number>(4);

  useEffect(() => {
    clinicApi.getEmployees().then((emps: Employee[]) => {
      if (userRole === 'doctor') {
        const match = emps.find(
          (e: Employee) =>
            (user?.username && e.username && e.username.toLowerCase() === user.username.toLowerCase()) ||
            (user?.name && e.full_name && (e.full_name.toLowerCase().includes(user.name.toLowerCase()) || user.name.toLowerCase().includes(e.full_name.toLowerCase()))) ||
            (user?.id && String(e.id) === String(user.id))
        );
        if (match) {
          setDoctorStaffId(match.id);
        } else {
          const firstDoc = emps.find((e: Employee) => e.role === 'doctor');
          if (firstDoc) setDoctorStaffId(firstDoc.id);
        }
      }
    });

    clinicApi.getTasks().then((tsks: ClinicTask[]) => {
      const pCount = tsks.filter((t: ClinicTask) => t.status === 'pending').length;
      setPendingTaskCount(pCount);
    });
  }, [user, userRole]);

  // Role metadata (badges & quick actions)
  const roleMeta: Record<
    UserRole,
    {
      badge: string;
      badgeColor: string;
      actionBtn: { label: string; href: string; icon: React.ElementType };
    }
  > = {
    superadmin: {
      badge: 'sidebarnav.superadminPlatform',
      badgeColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      actionBtn: {
        label: 'sidebarnav.addTechnician',
        href: '/super-admin?tab=technicians',
        icon: Wrench
      }
    },
    director: {
      badge: 'sidebarnav.directorHead',
      badgeColor: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
      actionBtn: {
        label: 'sidebarnav.newAppointment',
        href: '/appointments',
        icon: CalendarPlus
      }
    },
    deputy_director: {
      badge: 'sidebarnav.deputyDirectorManager',
      badgeColor: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800',
      actionBtn: {
        label: 'sidebarnav.newAppointment',
        href: '/appointments',
        icon: CalendarPlus
      }
    },
    admin: {
      badge: 'sidebarnav.receptionAdmin',
      badgeColor: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800',
      actionBtn: {
        label: 'sidebarnav.bookAppointment',
        href: '/appointments',
        icon: CalendarPlus
      }
    },
    doctor: {
      badge: 'sidebarnav.doctorWorkspace',
      badgeColor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      actionBtn: {
        label: 'sidebarnav.newPatientVisit',
        href: '/appointments',
        icon: CalendarPlus
      }
    },
    kassa: {
      badge: 'sidebarnav.cashierDesk',
      badgeColor: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      actionBtn: {
        label: 'sidebarnav.acceptPayment',
        href: '/patients',
        icon: Receipt
      }
    },
    technician: {
      badge: 'sidebarnav.dentalLabPortal',
      badgeColor: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      actionBtn: {
        label: 'sidebarnav.labOrders',
        href: '/technician',
        icon: FileSpreadsheet
      }
    }
  };

  const currentRoleMeta = roleMeta[userRole];

  // Completely isolated role navigation items — NO bleed across roles:
  const allNavItems: NavItemDef[] = [
    // ──────── ⚡ SUPERADMIN EXCLUSIVE MODULES (Kotta Admin) ────────
    {
      key: 'superadmin_panel',
      customTitle: 'sidebarnav.platformOverview',
      href: '/super-admin?tab=overview',
      icon: ShieldAlert,
      allowedRoles: ['superadmin']
    },
    {
      key: 'superadmin_clinics',
      customTitle: 'sidebarnav.clinics',
      href: '/super-admin?tab=clinics',
      icon: Building2,
      allowedRoles: ['superadmin']
    },
    {
      key: 'superadmin_storage',
      customTitle: 'sidebarnav.storageGbQuota',
      href: '/super-admin?tab=storage',
      icon: HardDrive,
      allowedRoles: ['superadmin']
    },
    {
      key: 'superadmin_modules',
      customTitle: 'sidebarnav.modulesPlan',
      href: '/super-admin?tab=modules',
      icon: Sliders,
      allowedRoles: ['superadmin']
    },
    {
      key: 'superadmin_techs',
      customTitle: 'sidebarnav.dentalTechnicians',
      href: '/super-admin?tab=technicians',
      icon: Wrench,
      allowedRoles: ['superadmin']
    },

    // ──────── 🔧 TECHNICIAN EXCLUSIVE MODULES (Alohida Zubnoy Texnik) ────────
    {
      key: 'tech_calendar',
      customTitle: 'sidebarnav.scheduleCalendar',
      href: '/technician?tab=calendar',
      icon: CalendarDays,
      allowedRoles: ['technician']
    },
    {
      key: 'tech_orders',
      customTitle: 'sidebarnav.allOrders',
      href: '/technician?tab=orders',
      icon: FileSpreadsheet,
      allowedRoles: ['technician']
    },
    {
      key: 'tech_prices',
      customTitle: 'sidebarnav.myPriceList',
      href: '/technician?tab=prices',
      icon: Tag,
      allowedRoles: ['technician']
    },
    {
      key: 'tech_clinics',
      customTitle: 'sidebarnav.linkedClinics',
      href: '/technician?tab=clinics',
      icon: Building2,
      allowedRoles: ['technician']
    },

    // ──────── 👑 DIRECTOR & DEPUTY EXCLUSIVE: Executive Dashboard ────────
    {
      key: 'dashboard',
      customTitle: 'sidebarnav.dashboard',
      href: '/dashboard',
      icon: LayoutGrid,
      allowedRoles: ['director', 'deputy_director']
    },

    // ──────── CLINIC OPERATIONAL MODULES (Role-tailored titles) ────────
    // Qabullar (Direktor, Deputy, Admin, Doctor, Kassa)
    {
      key: 'appointments',
      customTitle:
        userRole === 'doctor'
          ? 'sidebarnav.myAppointments'
          : userRole === 'kassa'
            ? 'sidebarnav.billingVisits'
            : userRole === 'admin'
              ? 'sidebarnav.appointments'
              : 'sidebarnav.appointments2',
      href: '/appointments',
      icon: CalendarDays,
      allowedRoles: ['director', 'deputy_director', 'admin', 'doctor', 'kassa']
    },

    // Laboratoriya (Mening qabullarim tegida — Doktor, Direktor, Deputy, Admin)
    {
      key: 'lab',
      customTitle: 'sidebarnav.dentalLab',
      href: '/lab',
      icon: FlaskConical,
      allowedRoles: ['director', 'deputy_director', 'admin', 'doctor']
    },

    // Bemorlar (Direktor, Deputy, Admin, Doctor, Kassa)
    {
      key: 'patients',
      customTitle:
        userRole === 'doctor'
          ? 'sidebarnav.myPatients'
          : userRole === 'kassa'
            ? 'sidebarnav.patientBalances'
            : userRole === 'admin'
              ? 'sidebarnav.patients'
              : 'sidebarnav.patients2',
      href: '/patients',
      icon: User,
      allowedRoles: ['director', 'deputy_director', 'admin', 'doctor', 'kassa']
    },

    // Shifokor Shaxsiy Profili (Faqat Doctor)
    {
      key: 'doctorProfile',
      customTitle: 'sidebarnav.myProfile',
      href: `/staff/${doctorStaffId}`,
      icon: Stethoscope,
      allowedRoles: ['doctor']
    },

    // Klinika xodimlari (Direktor va Deputy)
    {
      key: 'staff',
      customTitle: 'sidebarnav.staff',
      href: '/staff',
      icon: UserCog,
      allowedRoles: ['director', 'deputy_director']
    },

    // Naryadlar (Direktor va Deputy)
    {
      key: 'naryads',
      customTitle: 'sidebarnav.labOrders2',
      href: '/naryads',
      icon: FileSpreadsheet,
      allowedRoles: ['director', 'deputy_director']
    },

    // Omborxona (Direktor, Deputy, Admin, Kassa)
    {
      key: 'warehouse',
      customTitle:
        userRole === 'kassa'
          ? 'sidebarnav.warehouseSales'
          : 'sidebarnav.warehouse',
      href: '/warehouse',
      icon: Package,
      allowedRoles: ['director', 'deputy_director', 'kassa']
    },

    // Hisobotlar (Direktor, Deputy va Kassa)
    {
      key: 'reports',
      customTitle:
        userRole === 'kassa'
          ? 'sidebarnav.cashierReports'
          : 'sidebarnav.reportsFinance',
      href: '/reports',
      icon: PieChart,
      allowedRoles: ['director', 'deputy_director', 'kassa']
    },

    // Vazifalar (Direktor, Deputy, Admin, Doctor)
    {
      key: 'tasks',
      customTitle:
        userRole === 'doctor'
          ? 'sidebarnav.myTasks'
          : 'sidebarnav.tasks',
      href: '/tasks',
      icon: CheckCircle2,
      badge: pendingTaskCount,
      allowedRoles: ['director', 'deputy_director', 'admin', 'doctor']
    },

    // Klinika Pulsi (Direktor va Deputy)
    {
      key: 'pulse',
      customTitle: 'sidebarnav.clinicPulse',
      href: '/pulse',
      icon: Activity,
      isBeta: true,
      allowedRoles: ['director', 'deputy_director']
    },

    // Sozlamalar (Direktor va Deputy)
    {
      key: 'settings',
      customTitle: 'sidebarnav.clinicSettings',
      href: '/settings',
      icon: Settings,
      allowedRoles: ['director', 'deputy_director']
    }
  ];

  // Bottom pinned item: Help ("Yordam")
  const helpItem: NavItemDef = {
    key: 'help',
    customTitle: 'sidebarnav.help',
    href: '/help',
    icon: HelpCircle,
    allowedRoles: ['director', 'admin', 'doctor', 'kassa', 'superadmin', 'technician']
  };

  // Rol + modul-gate: superadmin o'chirgan modul klinika useridan butunlay yo'qoladi.
  const visibleNavItems = allNavItems.filter(
    (item) => item.allowedRoles.includes(userRole) && !isNavBlocked(user, item.key)
  );
  // Bemor kichik bo'limlari (Foto/Rentgen/Skan) ham modul bo'yicha filtrlanadi.
  const visiblePatientsSubItems = patientsSubItems.filter((sub) => !isNavBlocked(user, sub.key));
  const showHelp = helpItem.allowedRoles.includes(userRole);

  const getTitle = (key: string) => tr(key);

  const renderItem = (item: NavItemDef) => {
    let isActive = false;
    if (item.href.includes('?tab=')) {
      const [baseHref, query] = item.href.split('?');
      const targetTab = new URLSearchParams(query).get('tab');
      const isBaseMatch = pathname === baseHref;
      if (isBaseMatch) {
        if (!currentTab) {
          isActive = (baseHref === '/super-admin' && targetTab === 'overview') ||
            (baseHref === '/technician' && targetTab === 'calendar');
        } else {
          isActive = currentTab === targetTab;
        }
      }
    } else if (item.href === '/dashboard') {
      isActive = pathname === '/dashboard';
    } else if (item.href === '/appointments') {
      isActive = pathname === '/appointments';
    } else {
      isActive = pathname.startsWith(item.href);
    }

    const Icon = item.icon;
    const title = getTitle(item.customTitle);

    const handleItemClick = () => {
      if (item.href.includes('?tab=')) {
        const t = new URLSearchParams(item.href.split('?')[1]).get('tab');
        if (t) setCurrentTab(t);
      }
    };

    if (isCollapsed) {
      // COLLAPSED MODE (ichiga kirganda):
      return (
        <Link
          key={item.key}
          href={item.href}
          onClick={handleItemClick}
          title={title}
          className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all group relative ${isActive
              ? 'text-blue-600 dark:text-sky-400 bg-blue-50/80 dark:bg-slate-800/80 font-bold shadow-xs'
              : 'text-[#4A6585] dark:text-slate-400 hover:text-blue-600 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
            }`}
        >
          <div className="relative inline-flex items-center justify-center">
            <Icon
              className={`w-6 h-6 stroke-[1.7] flex-shrink-0 transition-transform group-hover:scale-105 ${isActive
                  ? 'text-blue-600 dark:text-sky-400'
                  : 'text-[#4A6585] dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-white'
                }`}
            />

            {item.badge !== undefined && (
              <span className="absolute -top-1 -right-3.5 translate-x-1/4 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-[#D7E5F9] text-[#2B5FA8] dark:bg-blue-950 dark:text-blue-200 border border-blue-200/70 dark:border-blue-800 shadow-xs whitespace-nowrap leading-tight pointer-events-none">
                {item.badge}
              </span>
            )}
          </div>

          <span
            className={`text-[10px] leading-tight font-medium mt-1 text-center truncate max-w-[74px] tracking-tight ${isActive ? 'text-blue-600 dark:text-sky-400 font-bold' : 'text-[#4A6585] dark:text-slate-300'
              }`}
          >
            {title}
          </span>
        </Link>
      );
    }

    // EXPANDED MODE (uzunchoq bo'lganda):
    // SPECIAL ACCORDION MENU FOR BEMORLAR (Bemorlar ro'yxati, Foto, Rentgen, Skan)
    if (item.key === 'patients') {
      const isPatientsActive = pathname.startsWith('/patients');
      return (
        <div key="patients-group" className="space-y-1">
          <div
            className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all group relative ${
              isPatientsActive && (!currentTab || currentTab === 'list')
                ? 'text-blue-600 dark:text-sky-400 bg-blue-50 dark:bg-slate-800/80 font-bold shadow-xs border border-blue-100 dark:border-slate-700/60'
                : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
            }`}
          >
            <Link
              href="/patients"
              onClick={() => {
                setCurrentTab('');
                setIsPatientsExpanded(true);
              }}
              className="flex items-center space-x-3 min-w-0 flex-1"
            >
              <Icon
                className={`w-5 h-5 stroke-[1.8] flex-shrink-0 transition-transform group-hover:scale-105 ${
                  isPatientsActive
                    ? 'text-blue-600 dark:text-sky-400'
                    : 'text-[#4A6585] dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-white'
                }`}
              />
              <span className="truncate">{title}</span>
            </Link>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsPatientsExpanded(!isPatientsExpanded);
              }}
              className="p-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
              title="Bo‘limlarni ochish / yopish"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  isPatientsExpanded ? 'rotate-180 text-blue-600 dark:text-sky-400' : ''
                }`}
              />
            </button>
          </div>

          {/* Sub-items: Bemorlar ro'yxati, Foto, Rentgen, Skan */}
          {isPatientsExpanded && (
            <div className="ml-3 pl-2.5 border-l-2 border-slate-200 dark:border-slate-700/80 space-y-1 py-0.5">
              {visiblePatientsSubItems.map((sub) => {
                const SubIcon = sub.icon;
                const isSubActive =
                  pathname === '/patients' &&
                  ((!sub.tabKey && (!currentTab || currentTab === 'list')) ||
                    (sub.tabKey && currentTab === sub.tabKey));

                const subTitle =
                  tr(sub.customTitle);

                return (
                  <Link
                    key={sub.key}
                    href={sub.href}
                    onClick={() => {
                      setCurrentTab(sub.tabKey);
                    }}
                    className={`flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                      isSubActive
                        ? 'text-blue-600 dark:text-sky-400 bg-blue-50/90 dark:bg-slate-800 font-bold shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <SubIcon className={`w-3.5 h-3.5 ${isSubActive ? 'text-blue-600 dark:text-sky-400' : 'text-slate-400'}`} />
                    <span className="truncate">{subTitle}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link
        key={item.key}
        href={item.href}
        onClick={handleItemClick}
        className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all group relative ${isActive
            ? 'text-blue-600 dark:text-sky-400 bg-blue-50 dark:bg-slate-800/80 font-bold shadow-xs border border-blue-100 dark:border-slate-700/60'
            : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
          }`}
      >
        <div className="flex items-center space-x-3 min-w-0">
          <Icon
            className={`w-5 h-5 stroke-[1.8] flex-shrink-0 transition-transform group-hover:scale-105 ${isActive
                ? 'text-blue-600 dark:text-sky-400'
                : 'text-[#4A6585] dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-white'
              }`}
          />
          <span className="truncate">{title}</span>
        </div>

        {item.badge !== undefined && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#D7E5F9] text-[#2B5FA8] dark:bg-blue-950 dark:text-blue-200">
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  const ActionIcon = currentRoleMeta?.actionBtn.icon || Plus;

  return (
    <aside
      className={`bg-white dark:bg-[#0b1322] text-[#4A6585] dark:text-slate-300 flex flex-col h-full select-none border-r border-slate-200 dark:border-slate-800 shadow-xs flex-shrink-0 z-30 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-60'
        }`}
    >
      {/* 1. Header / Logo Section */}
      {isCollapsed ? (
        <div className="pt-3.5 pb-2 px-1 flex flex-col items-center justify-center">
          <button
            onClick={toggleCollapse}
            title={tr('sidebarx.expandSidebar')}
            className="group relative flex flex-col items-center justify-center focus:outline-none"
          >
            <div className="w-10 h-10 flex items-center justify-center transition-transform group-hover:scale-105">
              <img src="/logo.png" alt="DentOS" className="w-10 h-10 object-contain" />
            </div>

            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center shadow-xs group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <ChevronRight className="w-2.5 h-2.5" />
            </span>
          </button>

          {/* Collapsed Role Quick Action Button */}
          {currentRoleMeta && (
            <Link
              href={currentRoleMeta.actionBtn.href}
              title={getTitle(currentRoleMeta.actionBtn.label)}
              className="mt-2.5 w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-md shadow-blue-500/25 transition-transform hover:scale-105"
            >
              <ActionIcon className="w-4 h-4" />
            </Link>
          )}

          <div className="w-10 h-px bg-slate-200 dark:bg-slate-800 mt-3 mb-1" />
        </div>
      ) : (
        <div className="border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-[#070d17]">
          <div className="h-16 flex items-center justify-between px-3.5">
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                <img src="/logo.png" alt="DentOS" className="w-10 h-10 object-contain" />
              </div>

              <div className="min-w-0">
                <span className="font-black text-sm text-slate-900 dark:text-white tracking-tight block">
                  dentOS
                </span>
                <p className="text-[10px] text-blue-600 dark:text-sky-400 font-semibold truncate">
                  {user?.clinicName || 'Dental CRM platformasi'}
                </p>
              </div>
            </div>

            <button
              onClick={toggleCollapse}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title={tr('sidebarx.collapseSidebar')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Role Badge Indicator */}
          {currentRoleMeta && (
            <div className="px-3 pb-3 space-y-2">
              <div
                className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold tracking-tight text-center truncate ${currentRoleMeta.badgeColor}`}
              >
                {getTitle(currentRoleMeta.badge)}
              </div>

              {/* Dynamic Role Primary Action Button */}
              <Link
                href={currentRoleMeta.actionBtn.href}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all active:scale-95"
              >
                <ActionIcon className="w-4 h-4" />
                <span>{getTitle(currentRoleMeta.actionBtn.label)}</span>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* 2. Main Navigation List */}
      <div className={`flex-1 overflow-y-auto ${isCollapsed ? 'px-1.5 py-1 space-y-1' : 'px-2 py-3 space-y-1'}`}>
        {visibleNavItems.map(renderItem)}
      </div>

      {/* 3. Bottom Section: Help ("Yordam") */}
      {showHelp && (
        <div className={`border-t border-slate-100 dark:border-slate-800/80 ${isCollapsed ? 'p-1.5' : 'p-2'}`}>
          {renderItem(helpItem)}
        </div>
      )}

      {/* 4. Current user info & Tizimdan chiqish (Logout) button directly in Sidebar */}
      {user && (
        <div className="p-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-[#070d17]/90 text-xs">
          {isCollapsed ? (
            <div className="flex flex-col items-center py-1">
              {/* User avatar */}
              <div
                className="w-9 h-9 rounded-full bg-emerald-500 text-white font-bold flex items-center justify-center text-xs shadow-xs ring-2 ring-emerald-400/30"
                title={`${user.name} (${user.roleLabel})`}
              >
                {user.initials}
              </div>

              {/* Collapsed Logout button */}
              <button
                onClick={logout}
                title={tr('sidebarx.logOut')}
                className="mt-2 w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-200/60 dark:border-rose-900/50 transition shadow-2xs group"
              >
                <LogOut className="w-4 h-4 transition-transform group-hover:scale-110" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* User badge card */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 shadow-2xs">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white font-bold flex items-center justify-center text-xs shadow-xs ring-2 ring-emerald-400/30 flex-shrink-0">
                    {user.initials}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 dark:text-slate-200 truncate text-[11px] leading-snug">
                      {user.name}
                    </p>
                    <p className="text-[9px] text-blue-600 dark:text-cyan-400 font-bold uppercase tracking-tight truncate">
                      {user.roleLabel}
                    </p>
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></span>
              </div>

              {/* Dedicated "Tizimdan chiqish" (Logout) button */}
              <button
                onClick={logout}
                title={tr('sidebarx.logOut')}
                className="w-full py-1.5 px-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100/80 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 font-bold text-[11px] flex items-center justify-center gap-1.5 border border-rose-200/60 dark:border-rose-900/50 transition active:scale-95 shadow-2xs group"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-500 transition-transform group-hover:-translate-x-0.5" />
                <span>
                  {tr('sidebarx.logOut')}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

