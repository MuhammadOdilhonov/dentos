'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarDays, Users, Grid3x3, CreditCard, ClipboardList, BarChart3, Boxes,
  FlaskConical, CheckSquare, Activity, MessageSquare, Camera, PhoneCall, Building2,
  ArrowRight, PlayCircle, BadgeCheck, Globe, Cloud, MessageCircle, ShieldCheck,
  Stethoscope, Wallet, UserCog, UserCheck, Crown, Wrench, Bot, Send, Check, Sparkles,
  Phone, Mail, MapPin, Sun, Moon
} from 'lucide-react';
import { useAuth, UserRole } from '../lib/auth';
import { useI18n, Language } from '../lib/i18n';
import { useTheme } from '../lib/theme';

// ───────────────────────────────────────────────────────────────
// TRILINGUAL CONTENT (UZ / RU / EN) — dentOS landing
// Dizayn: Stitch "dentOS" (ko'k #004ac6 palitra), to'liq kod bilan (rasmsiz)
// ───────────────────────────────────────────────────────────────
const CONTENT = {
  uz: {
    navFeatures: 'Imkoniyatlar', navModules: 'Modullar', navRoles: 'Rollar', navContact: 'Aloqa',
    navLogin: 'Kirish', navTry: 'Bepul sinab ko‘rish', navCabinet: 'Kabinetga o‘tish',
    heroBadge: 'O‘zbekistondagi №1 Stomatologiya CRM',
    heroTitle: 'Stomatologiya klinikangizni bitta tizimda boshqaring',
    heroSubtitle: 'Qabullar, bemorlar, kassa, ombor, laboratoriya va hisobotlar — hammasi bulutda, real vaqtda.',
    heroStart: 'Bepul boshlash', heroDemo: 'Demo ko‘rish',
    heroChips: ['Ko‘p filialli', 'UZ/RU/EN', 'Bulutli', 'Telegram & WhatsApp'],
    mockTitle: 'dentOS — Qabullar taqvimi (09:00 - 20:00)', mockDate: 'Bugun, 24-Oktabr', mockTime: 'Vaqt',
    trust: 'Toshkentdagi zamonaviy klinikalar tanlovi',
    featTag: 'Imkoniyatlar', featTitle: 'Klinikangiz uchun 13 ta kuchli modul',
    featSub: 'Barcha jarayonlarni avtomatlashtirib, vaqt va mablag‘ni tejang.',
    rolesTag: 'Huquqlar va rollar', rolesTitle: 'Har bir xodim uchun maxsus ishchi o‘rin',
    rolesSub: 'Ortiqcha tugmalarsiz — har kim faqat o‘z vazifasini ko‘radi.',
    branchTag: 'Ko‘p filial', branchTitle: 'Bir nechta filial? Muammo emas',
    branchSub: 'Barcha filiallarni yagona panelda boshqaring. Har bir filial bo‘yicha alohida hisobot, kassa va xodimlar.',
    branchPoints: [
      'Filiallar kesimida tushum va sof foyda tahlili',
      'Har bir filialga alohida Telegram/WhatsApp ulash',
      'Filiallararo laboratoriya buyurtmalari',
      'Yagona direktor paneli — masofadan nazorat',
    ],
    intTag: 'Integratsiyalar', intTitle: 'Mashhur xizmatlar bilan integratsiya',
    intSub: 'Bemorlar bilan aloqani avtomatlashtiring va hech bir murojaatni yo‘qotmang.',
    aiTitle: 'AI Avto-javob & Sun’iy Intellekt', aiBadge: 'YANGI',
    aiDesc: 'Sun’iy intellekt bemor xabarlarini o‘qiydi, savollarga javob beradi, klinika va shifokorlar haqida ma’lumot beradi hamda to‘g‘ridan-to‘g‘ri qabulga yozib qo‘yadi. Avto-eslatma esa javobga qarab statusni o‘zi to‘g‘rilaydi.',
    aiChat1: 'Assalomu alaykum, ertaga tozalashga yozsam bo‘ladimi?',
    aiChat2: '✅ Albatta! Ertaga soat 10:00 ga Dr. Aliyevga yozib qo‘ydim. Sizni kutamiz!',
    integrations: [
      { icon: Send, title: 'Telegram Bot', desc: 'Avto-eslatma va yozishmalar' },
      { icon: MessageCircle, title: 'WhatsApp Business', desc: 'Rasmiy API orqali xabarlar' },
      { icon: MessageSquare, title: 'SMS Gateway', desc: 'Operatorlar orqali SMS' },
      { icon: CreditCard, title: 'Click & Payme', desc: 'Onlayn to‘lovlar' },
      { icon: PhoneCall, title: 'IP Telefoniya', desc: 'Qo‘ng‘iroq yozib olish & tracking' },
    ],
    stats: [
      { num: '250+', label: 'Klinika' },
      { num: '1,200+', label: 'Shifokor' },
      { num: '500k+', label: 'Bemor' },
      { num: '99.9%', label: 'Uptime' },
    ],
    ctaTitle: 'Klinikangizni raqamlashtirishni bugun boshlang',
    ctaSub: 'dentOS bilan klinikangizni zamonaviy, tezkor va daromadli qiling.',
    ctaBtn: 'Bepul boshlash', ctaLogin: 'Tizimga kirish',
    footerText: '© 2026 dentOS SaaS. Barcha huquqlar himoyalangan.',
    footerLinks: ['Maxfiylik siyosati', 'Foydalanish shartlari', 'Qo‘llab-quvvatlash'],
    showMore: 'Yana ko‘rish', showLess: 'Yashirish', moreHint: 'Ko‘proq modullarni ko‘rmoqchimisiz?',
  },
  ru: {
    navFeatures: 'Возможности', navModules: 'Модули', navRoles: 'Роли', navContact: 'Контакты',
    navLogin: 'Войти', navTry: 'Попробовать бесплатно', navCabinet: 'Перейти в кабинет',
    heroBadge: 'Стоматологическая CRM №1 в Узбекистане',
    heroTitle: 'Управляйте стоматологией в единой системе',
    heroSubtitle: 'Записи, пациенты, касса, склад, лаборатория и отчёты — всё в облаке, в реальном времени.',
    heroStart: 'Начать бесплатно', heroDemo: 'Смотреть демо',
    heroChips: ['Мультифилиал', 'UZ/RU/EN', 'Облако', 'Telegram & WhatsApp'],
    mockTitle: 'dentOS — Расписание приёмов (09:00 - 20:00)', mockDate: 'Сегодня, 24 октября', mockTime: 'Время',
    trust: 'Выбор современных клиник Ташкента',
    featTag: 'Возможности', featTitle: '13 мощных модулей для вашей клиники',
    featSub: 'Автоматизируйте все процессы и экономьте время и деньги.',
    rolesTag: 'Права и роли', rolesTitle: 'Отдельное рабочее место для каждого сотрудника',
    rolesSub: 'Без лишних кнопок — каждый видит только свои задачи.',
    branchTag: 'Мультифилиал', branchTitle: 'Несколько филиалов? Не проблема',
    branchSub: 'Управляйте всеми филиалами в одной панели. Отдельные отчёты, касса и сотрудники по каждому.',
    branchPoints: [
      'Анализ выручки и чистой прибыли по филиалам',
      'Отдельное подключение Telegram/WhatsApp на филиал',
      'Межфилиальные лабораторные наряды',
      'Единая панель директора — удалённый контроль',
    ],
    intTag: 'Интеграции', intTitle: 'Интеграция с популярными сервисами',
    intSub: 'Автоматизируйте связь с пациентами и не теряйте ни одного обращения.',
    aiTitle: 'AI Авто-ответчик & Искусственный Интеллект', aiBadge: 'НОВОЕ',
    aiDesc: 'ИИ читает сообщения пациентов, отвечает на вопросы, рассказывает о клинике и врачах и записывает на приём напрямую. Авто-напоминания сами корректируют статус по ответу пациента.',
    aiChat1: 'Здравствуйте, можно записаться на чистку завтра?',
    aiChat2: '✅ Конечно! Записала вас на завтра в 10:00 к Dr. Алиеву. Ждём вас!',
    integrations: [
      { icon: Send, title: 'Telegram Bot', desc: 'Авто-напоминания и переписка' },
      { icon: MessageCircle, title: 'WhatsApp Business', desc: 'Сообщения через официальный API' },
      { icon: MessageSquare, title: 'SMS Gateway', desc: 'SMS через операторов' },
      { icon: CreditCard, title: 'Click & Payme', desc: 'Онлайн-оплаты' },
      { icon: PhoneCall, title: 'IP Телефония', desc: 'Запись звонков и tracking' },
    ],
    stats: [
      { num: '250+', label: 'Клиник' },
      { num: '1,200+', label: 'Врачей' },
      { num: '500k+', label: 'Пациентов' },
      { num: '99.9%', label: 'Uptime' },
    ],
    ctaTitle: 'Начните цифровизацию клиники сегодня',
    ctaSub: 'С dentOS ваша клиника станет современной, быстрой и прибыльной.',
    ctaBtn: 'Начать бесплатно', ctaLogin: 'Войти в систему',
    footerText: '© 2026 dentOS SaaS. Все права защищены.',
    footerLinks: ['Политика конфиденциальности', 'Условия использования', 'Поддержка'],
    showMore: 'Показать больше', showLess: 'Свернуть', moreHint: 'Хотите увидеть больше модулей?',
  },
  en: {
    navFeatures: 'Features', navModules: 'Modules', navRoles: 'Roles', navContact: 'Contact',
    navLogin: 'Sign In', navTry: 'Try for free', navCabinet: 'Go to Dashboard',
    heroBadge: 'The #1 Dental CRM in Uzbekistan',
    heroTitle: 'Run your dental clinic in one unified system',
    heroSubtitle: 'Appointments, patients, cashier, inventory, lab and reports — all in the cloud, in real time.',
    heroStart: 'Start free', heroDemo: 'Watch demo',
    heroChips: ['Multi-branch', 'UZ/RU/EN', 'Cloud', 'Telegram & WhatsApp'],
    mockTitle: 'dentOS — Appointment calendar (09:00 - 20:00)', mockDate: 'Today, Oct 24', mockTime: 'Time',
    trust: 'Chosen by modern clinics in Tashkent',
    featTag: 'Features', featTitle: '13 powerful modules for your clinic',
    featSub: 'Automate every process and save time and money.',
    rolesTag: 'Roles & permissions', rolesTitle: 'A dedicated workspace for every team member',
    rolesSub: 'No clutter — everyone sees only their own tasks.',
    branchTag: 'Multi-branch', branchTitle: 'Multiple branches? No problem',
    branchSub: 'Manage all branches from a single panel. Separate reports, cashier and staff per branch.',
    branchPoints: [
      'Revenue and net profit analysis per branch',
      'Separate Telegram/WhatsApp per branch',
      'Inter-branch lab work orders',
      'Unified director panel — remote oversight',
    ],
    intTag: 'Integrations', intTitle: 'Integration with popular services',
    intSub: 'Automate patient communication and never miss a request.',
    aiTitle: 'AI Auto-responder & Artificial Intelligence', aiBadge: 'NEW',
    aiDesc: 'The AI reads patient messages, answers questions, shares clinic & doctor info and books appointments directly. Auto-reminders update the status automatically based on the reply.',
    aiChat1: 'Hello, can I book a cleaning tomorrow?',
    aiChat2: '✅ Of course! Booked you for tomorrow at 10:00 with Dr. Aliyev. See you!',
    integrations: [
      { icon: Send, title: 'Telegram Bot', desc: 'Auto-reminders and chat' },
      { icon: MessageCircle, title: 'WhatsApp Business', desc: 'Messages via official API' },
      { icon: MessageSquare, title: 'SMS Gateway', desc: 'SMS via carriers' },
      { icon: CreditCard, title: 'Click & Payme', desc: 'Online payments' },
      { icon: PhoneCall, title: 'IP Telephony', desc: 'Call recording & tracking' },
    ],
    stats: [
      { num: '250+', label: 'Clinics' },
      { num: '1,200+', label: 'Doctors' },
      { num: '500k+', label: 'Patients' },
      { num: '99.9%', label: 'Uptime' },
    ],
    ctaTitle: 'Start digitizing your clinic today',
    ctaSub: 'With dentOS your clinic becomes modern, fast and profitable.',
    ctaBtn: 'Start free', ctaLogin: 'Sign in',
    footerText: '© 2026 dentOS SaaS. All rights reserved.',
    footerLinks: ['Privacy Policy', 'Terms of Use', 'Support'],
    showMore: 'Show more', showLess: 'Show less', moreHint: 'Want to see more modules?',
  },
};

// 14 module definitions (icon + trilingual title/desc + 2 bullets + mock preview rows)
type Tri = [string, string, string];
type ModDef = { icon: any; t: Tri; d: Tri; b: [Tri, Tri]; mock: { a: string; c: Tri; chip: Tri; tone: string }[] };
const MODULES: ModDef[] = [
  { icon: CalendarDays, t: ['Qabullar taqvimi', 'Расписание приёмов', 'Appointment calendar'],
    d: ['Kunlik, haftalik va oylik rejalashtirish, shifokorlar bandligini rangli statuslar bilan nazorat qilish.', 'Дневное, недельное и месячное планирование и контроль занятости врачей цветными статусами.', 'Daily, weekly and monthly planning with color-coded doctor availability.'],
    b: [['Shifokorlar jadvalini oson boshqarish', 'Удобное управление графиком врачей', 'Easy doctor schedule management'], ['Vaqtni band qilish va o‘zgartirish', 'Бронирование и перенос времени', 'Book and reschedule slots']],
    mock: [{ a: 'AR', c: ['Aziz Rahimov', 'Азиз Рахимов', 'Aziz Rahimov'], chip: ['Tasdiqlangan', 'Подтверждён', 'Confirmed'], tone: 'teal' }, { a: 'MU', c: ['Malika Umarova', 'Малика Умарова', 'Malika Umarova'], chip: ['Jarayonda', 'В процессе', 'In progress'], tone: 'indigo' }] },
  { icon: Users, t: ['Bemorlar bazasi', 'База пациентов', 'Patient database'],
    d: ['Bemorning to‘liq tarixi, kontaktlar, barcha tashriflar va moliyaviy holati yagona CRM da.', 'Полная история пациента, контакты, визиты и финансовое состояние в едином CRM.', 'Full patient history, contacts, visits and finances in one CRM.'],
    b: [['Shaxsiy ma’lumotlar va qidiruv', 'Личные данные и поиск', 'Profiles and search'], ['Tashriflar tarixi va qoldiq balans', 'История визитов и баланс', 'Visit history and balance']],
    mock: [{ a: 'JN', c: ['Jamshidbek Normatov', 'Жамшид Норматов', 'Jamshid Normatov'], chip: ['Faol bemor', 'Активный', 'Active'], tone: 'blue' }, { a: 'ZK', c: ['Zilola Karimova', 'Зилола Каримова', 'Zilola Karimova'], chip: ['Kelmagan', 'Не пришёл', 'No-show'], tone: 'slate' }] },
  { icon: Grid3x3, t: ['Elektron tish kartasi', 'Зубная карта', 'Dental chart'],
    d: ['Interaktiv 32-tish formulasi: har bir tish holati, tashxis va davolash rejasi bir ko‘rinishda.', 'Интерактивная формула 32 зуба: статус, диагноз и план лечения в одном месте.', 'Interactive 32-tooth chart: status, diagnosis and plan in one view.'],
    b: [['Har bir tishni belgilash', 'Отметка каждого зуба', 'Mark every tooth'], ['Davolash rejasi va tarix', 'План лечения и история', 'Treatment plan and history']],
    mock: [{ a: '16', c: ['Karies (K02.1)', 'Кариес (K02.1)', 'Caries (K02.1)'], chip: ['Davolanmoqda', 'В лечении', 'Treating'], tone: 'amber' }, { a: '46', c: ['Implant Osstem', 'Имплант Osstem', 'Osstem implant'], chip: ['Yakunlangan', 'Завершён', 'Done'], tone: 'teal' }] },
  { icon: CreditCard, t: ['Kassa va to‘lovlar', 'Касса и оплаты', 'Cashier & payments'],
    d: ['Naqd, bank kartasi, Click va Payme orqali to‘lovlar, qarz va avans hisobi aniq yuritiladi.', 'Оплаты наличными, картой, Click и Payme, точный учёт долгов и авансов.', 'Cash, card, Click and Payme payments with precise debt/prepayment ledger.'],
    b: [['Naqd / karta / onlayn qabul', 'Наличные / карта / онлайн', 'Cash / card / online'], ['Qarz va avans nazorati', 'Контроль долга и аванса', 'Debt and prepayment control']],
    mock: [{ a: '₮', c: ['Naqd to‘lov', 'Оплата наличными', 'Cash payment'], chip: ['+1 200 000', '+1 200 000', '+1 200 000'], tone: 'teal' }, { a: '💳', c: ['Payme / Click', 'Payme / Click', 'Payme / Click'], chip: ['+850 000', '+850 000', '+850 000'], tone: 'blue' }] },
  { icon: ClipboardList, t: ['Davolash rejasi', 'План лечения', 'Treatment plan'],
    d: ['Bosqichma-bosqich smeta tuzish, bemor bilan kelishish va bajarilishini kuzatish.', 'Поэтапная смета, согласование с пациентом и контроль выполнения.', 'Staged quotes, patient approval and progress tracking.'],
    b: [['Bosqichli smeta', 'Поэтапная смета', 'Staged estimate'], ['Bemor bilan kelishish', 'Согласование с пациентом', 'Patient approval']],
    mock: [{ a: '1', c: ['Terapiya bosqichi', 'Этап терапии', 'Therapy stage'], chip: ['Rejada', 'В плане', 'Planned'], tone: 'indigo' }, { a: '2', c: ['Protez bosqichi', 'Этап протеза', 'Prosthetic stage'], chip: ['Keyin', 'Позже', 'Later'], tone: 'slate' }] },
  { icon: BarChart3, t: ['Hisobotlar', 'Отчёты', 'Reports'],
    d: ['Tushum, sof foyda, shifokor foizlari va filial kesimida chuqur analitika.', 'Выручка, чистая прибыль, проценты врачей и аналитика по филиалам.', 'Revenue, net profit, doctor commissions and per-branch analytics.'],
    b: [['Tushum va foyda tahlili', 'Анализ выручки и прибыли', 'Revenue and profit analysis'], ['Shifokor foizlari', 'Проценты врачей', 'Doctor commissions']],
    mock: [{ a: '↑', c: ['Oylik tushum', 'Месячная выручка', 'Monthly revenue'], chip: ['92 mln', '92 млн', '92M'], tone: 'teal' }, { a: '%', c: ['Sof foyda', 'Чистая прибыль', 'Net profit'], chip: ['38%', '38%', '38%'], tone: 'blue' }] },
  { icon: Boxes, t: ['Ombor', 'Склад', 'Inventory'],
    d: ['Materiallar qoldig‘i, sarf nazorati va kam qolganda avtomatik ogohlantirish.', 'Остатки материалов, контроль расхода и авто-оповещения о дефиците.', 'Material stock, usage control and low-stock alerts.'],
    b: [['Material qoldig‘i', 'Остатки материалов', 'Material stock'], ['Kam qolganda ogohlantirish', 'Оповещение о дефиците', 'Low-stock alerts']],
    mock: [{ a: '◳', c: ['Anestetik (karpula)', 'Анестетик', 'Anesthetic'], chip: ['12 dona', '12 шт', '12 pcs'], tone: 'amber' }, { a: '◳', c: ['Kompozit plomba', 'Композит', 'Composite'], chip: ['Yetarli', 'Достаточно', 'In stock'], tone: 'teal' }] },
  { icon: FlaskConical, t: ['Laboratoriya', 'Лаборатория', 'Laboratory'],
    d: ['Zubnoy texnik naryadlari, muddat va bosqich nazorati, STL fayllar almashinuvi.', 'Наряды зубного техника, контроль сроков и этапов, обмен STL-файлами.', 'Dental lab orders, deadline control and STL file exchange.'],
    b: [['Texnik naryadlari', 'Наряды техника', 'Technician orders'], ['Muddat nazorati', 'Контроль сроков', 'Deadline control']],
    mock: [{ a: '⚙', c: ['Sirkon toj (3)', 'Циркон коронка (3)', 'Zirconia crown (3)'], chip: ['Jarayonda', 'В работе', 'In work'], tone: 'indigo' }, { a: '⚙', c: ['E-max vinir (6)', 'E-max винир (6)', 'E-max veneer (6)'], chip: ['Tayyor', 'Готово', 'Ready'], tone: 'teal' }] },
  { icon: CheckSquare, t: ['Vazifalar', 'Задачи', 'Tasks'],
    d: ['Xodimlarga topshiriq berish, muddat qo‘yish va bajarilishini kuzatish.', 'Постановка задач сотрудникам, сроки и контроль выполнения.', 'Assign staff tasks, set deadlines and track completion.'],
    b: [['Xodimga topshiriq', 'Задача сотруднику', 'Assign to staff'], ['Bajarilishini kuzatish', 'Контроль выполнения', 'Track completion']],
    mock: [{ a: '✓', c: ['Bemorga qo‘ng‘iroq', 'Позвонить пациенту', 'Call patient'], chip: ['Bugun', 'Сегодня', 'Today'], tone: 'blue' }, { a: '○', c: ['Materiallar buyurtma', 'Заказ материалов', 'Order materials'], chip: ['Ertaga', 'Завтра', 'Tomorrow'], tone: 'slate' }] },
  { icon: Activity, t: ['Puls (Real-time)', 'Пульс (Real-time)', 'Pulse (Real-time)'],
    d: ['Klinikaning jonli holati: band kreslolar, kutish zali va navbatdagi bemorlar.', 'Живое состояние клиники: занятые кресла, зал ожидания и очередь.', 'Live clinic status: busy chairs, waiting room and queue.'],
    b: [['Jonli band kreslolar', 'Занятые кресла в реальном времени', 'Live busy chairs'], ['Kutish zali holati', 'Состояние зала ожидания', 'Waiting room status']],
    mock: [{ a: '●', c: ['1-kreslo band', 'Кресло 1 занято', 'Chair 1 busy'], chip: ['Muolaja', 'Процедура', 'In procedure'], tone: 'teal' }, { a: '●', c: ['Kutish zali', 'Зал ожидания', 'Waiting room'], chip: ['3 bemor', '3 пациента', '3 patients'], tone: 'amber' }] },
  { icon: MessageSquare, t: ['SMS va Xabarnomalar', 'SMS и уведомления', 'SMS & notifications'],
    d: ['3 tilli shablonli avto-xabarlar: eslatma, tasdiq va profilaktik chaqiriq.', 'Шаблонные авто-сообщения на 3 языках: напоминания, подтверждения, профилактика.', 'Templated auto-messages in 3 languages: reminders, confirmations, recalls.'],
    b: [['3 tilli shablonlar', 'Шаблоны на 3 языках', 'Templates in 3 languages'], ['Avto-eslatma', 'Авто-напоминания', 'Auto-reminders']],
    mock: [{ a: '✉', c: ['Qabul eslatmasi', 'Напоминание о приёме', 'Visit reminder'], chip: ['Yuborildi', 'Отправлено', 'Sent'], tone: 'blue' }, { a: '✉', c: ['Profilaktik ko‘rik', 'Профосмотр', 'Checkup recall'], chip: ['Rejada', 'Запланировано', 'Scheduled'], tone: 'teal' }] },
  { icon: Camera, t: ['Fotoprotokol', 'Фотопротокол', 'Photo protocol'],
    d: ['Davolashgacha va keyin rasmlari, bemorga vizual natijani ko‘rsatish.', 'Фото до и после лечения, наглядная демонстрация результата пациенту.', 'Before/after photos to show patients the visual result.'],
    b: [['Davolashgacha / keyin', 'До / после', 'Before / after'], ['Bemorga ko‘rsatish', 'Показ пациенту', 'Show to patient'] ],
    mock: [{ a: '📷', c: ['Oldin (Before)', 'До (Before)', 'Before'], chip: ['Yuklandi', 'Загружено', 'Uploaded'], tone: 'slate' }, { a: '📷', c: ['Keyin (After)', 'После (After)', 'After'], chip: ['Yuklandi', 'Загружено', 'Uploaded'], tone: 'teal' }] },
  { icon: Building2, t: ['Filiallar boshqaruvi', 'Управление филиалами', 'Branch management'],
    d: ['Barcha filiallarni yagona paneldan boshqaring: alohida kassa, xodim va hisobot.', 'Все филиалы в одной панели: отдельная касса, персонал и отчёты.', 'Manage all branches from one panel: separate cashier, staff and reports.'],
    b: [['Yagona direktor paneli', 'Единая панель директора', 'Unified director panel'], ['Filial kesimida hisobot', 'Отчёты по филиалам', 'Per-branch reports']],
    mock: [{ a: '🏢', c: ['Markaziy filial', 'Центральный филиал', 'Central branch'], chip: ['32,4 mln', '32,4 млн', '32.4M'], tone: 'teal' }, { a: '🏢', c: ['Chilonzor filial', 'Филиал Чиланзар', 'Chilonzor branch'], chip: ['18,1 mln', '18,1 млн', '18.1M'], tone: 'blue' }] },
];
const MOCK_TONES: Record<string, string> = {
  teal: 'bg-teal-50 text-teal-700', indigo: 'bg-indigo-50 text-indigo-700',
  blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700', slate: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400', amber: 'bg-amber-50 text-amber-700',
};

// Har modul yonida ko'rsatiladigan haqiqiy ilova screenshotlari (MODULES tartibida — 13 ta)
const SHOTS: string[] = [
  '/screens/23-booked-appointment.png', // Qabullar taqvimi (yozilgan qabullar + holat)
  '/screens/03-patients.png',           // Bemorlar bazasi
  '/screens/16-dental-chart.png',       // Elektron tish kartasi (tish formulasi)
  '/screens/24-checkout-big.png',       // Kassa va to'lovlar (katta checkout modal)
  '/screens/17-treatment-plan.png',     // Davolash rejasi (План лечения)
  '/screens/09-reports.png',            // Hisobotlar (otchet)
  '/screens/08-warehouse.png',          // Ombor
  '/screens/10-lab.png',                // Laboratoriya
  '/screens/11-tasks.png',              // Vazifalar
  '/screens/12-pulse.png',              // Puls (Real-time)
  '/screens/19-communication.png',      // SMS va Xabarnomalar (bemor Aloqa bo'limi)
  '/screens/18-photo.png',              // Fotoprotokol (slayd redaktori)
  '/screens/22-branches.png',           // Filiallar boshqaruvi (Sozlamalar → Филиалы)
];

// 6 role definitions (SuperAdmin olib tashlandi) — Stitch uslubidagi karta:
// badge (tag) + ikona + nom + tavsif + 3 ta ruxsat punkti
type RoleDef = {
  icon: any; color: string; badge: [string, string, string];
  t: [string, string, string]; d: [string, string, string];
  perms: [Tri, Tri, Tri];
};
const ROLES: RoleDef[] = [
  { icon: Crown, color: 'text-emerald-600 bg-emerald-50',
    badge: ['Moliya va Nazorat', 'Финансы и контроль', 'Finance & Control'],
    t: ['Direktor / Bosh vrach', 'Директор / Главврач', 'Director / Chief doctor'],
    d: ['Moliyaviy hisobotlar, shifokorlar samaradorligi va klinika ko‘rsatkichlari.', 'Финансовые отчёты, продуктивность врачей и показатели клиники.', 'Financial reports, doctor performance and clinic KPIs.'],
    perms: [['Kunlik tushum va sof foyda', 'Дневная выручка и прибыль', 'Daily revenue & net profit'], ['Shifokorlar oylik maoshi', 'Зарплаты врачей', 'Doctor payroll'], ['Sifat va umumiy nazorat', 'Контроль качества', 'Quality & oversight']] },
  { icon: UserCheck, color: 'text-indigo-600 bg-indigo-50',
    badge: ['Operatsion boshqaruv', 'Операционное управление', 'Operations'],
    t: ['Direktor o‘rinbosari', 'Зам. директора', 'Deputy Director'],
    d: ['Klinikaning kundalik operatsion ishini boshqarish va nazorat qilish.', 'Управление ежедневной операционной работой клиники.', 'Managing daily clinic operations and oversight.'],
    perms: [['Xodimlar va jadval nazorati', 'Контроль персонала и графика', 'Staff & schedule control'], ['Vazifalar taqsimoti', 'Распределение задач', 'Task assignment'], ['Operatsion hisobotlar', 'Операционные отчёты', 'Operational reports']] },
  { icon: UserCog, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40',
    badge: ['Qabul & CRM', 'Приём & CRM', 'Front Desk & CRM'],
    t: ['Administrator', 'Администратор', 'Administrator'],
    d: ['Qabullar taqvimi, bemorlarni ro‘yxatga olish va dastlabki muloqot.', 'Расписание приёмов, регистрация пациентов и первичное общение.', 'Appointment scheduling, patient intake and first contact.'],
    perms: [['Qabullar taqvimi bilan ishlash', 'Работа с расписанием', 'Work with the calendar'], ['Bemorlarni bazaga kiritish', 'Внесение пациентов', 'Add patients to the base'], ['Qo‘ng‘iroq va eslatmalar', 'Звонки и напоминания', 'Calls and reminders']] },
  { icon: Wallet, color: 'text-amber-600 bg-amber-50',
    badge: ['Kassa va Cheklar', 'Касса и чеки', 'Cashier & Receipts'],
    t: ['Kassir', 'Кассир', 'Cashier'],
    d: ['To‘lovlarni qabul qilish, cheklar chiqarish va kassa smenalarini yopish.', 'Приём оплат, выдача чеков и закрытие кассовых смен.', 'Accept payments, issue receipts and close cash shifts.'],
    perms: [['Naqd va plastik to‘lovlar', 'Наличные и картой', 'Cash & card payments'], ['Kassa smenasini yopish', 'Закрытие смены', 'Close cash shift'], ['Qarz va cheklar', 'Долги и чеки', 'Debts & receipts']] },
  { icon: Stethoscope, color: 'text-teal-600 bg-teal-50',
    badge: ['Tibbiy karta', 'Мед. карта', 'Medical Chart'],
    t: ['Vrach-Stomatolog', 'Врач-Стоматолог', 'Dentist'],
    d: ['Elektron tish kartasi, davolash rejalari va naryadlar kiritish.', 'Электронная зубная карта, планы лечения и наряды.', 'Electronic dental chart, treatment plans and lab orders.'],
    perms: [['32-tish formulasini to‘ldirish', 'Заполнение формулы 32 зуба', 'Fill the 32-tooth chart'], ['Davolash rejalari', 'Планы лечения', 'Treatment plans'], ['Fotoprotokol va fayllar', 'Фотопротокол и файлы', 'Photo protocol & files']] },
  { icon: Wrench, color: 'text-purple-600 bg-purple-50',
    badge: ['Laboratoriya', 'Лаборатория', 'Laboratory'],
    t: ['Zubnoy Texnik', 'Зубной техник', 'Dental technician'],
    d: ['Laboratoriya buyurtmalarini qabul qilish va bajarish jarayonini boshqarish.', 'Приём лабораторных нарядов и управление их выполнением.', 'Receive lab orders and manage the production process.'],
    perms: [['Buyurtmalarni qabul qilish', 'Приём нарядов', 'Receive work orders'], ['Statusni yangilash', 'Обновление статуса', 'Update status'], ['Muddatlarni nazorat qilish', 'Контроль сроков', 'Deadline control']] },
];

export default function LandingHomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { language, setLanguage } = useI18n();
  const { isDark, toggleTheme } = useTheme();
  const [showAll, setShowAll] = useState(false);
  const lang = (['uz', 'ru', 'en'].includes(language) ? language : 'uz') as 'uz' | 'ru' | 'en';
  const c = CONTENT[lang];
  const li = lang === 'uz' ? 0 : lang === 'ru' ? 1 : 2;

  const getDestinationForRole = (role: UserRole): string => {
    switch (role) {
      case 'director': case 'deputy_director': return '/dashboard';
      case 'admin': case 'doctor': case 'kassa': return '/appointments';
      case 'technician': return '/technician';
      case 'superadmin': return '/super-admin';
      default: return '/dashboard';
    }
  };
  const handleAction = () => router.push(user ? getDestinationForRole(user.role) : '/login');

  const DentalLogo = () => (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-700 to-blue-500 flex items-center justify-center shadow-md shadow-blue-700/25">
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
          <path d="M12 2C8.8 2 7 3.5 5.6 3.5c-1 0-2.1-.6-2.6-.3-.6.4-.5 1.7-.3 3.4.2 1.4.7 2.3.9 4.2.3 2.8 1 6.7 2 8.9.5 1.1 1 1.8 1.7 1.8.8 0 1-.9 1.2-2.2.2-1.3.5-2.8 1.5-2.8s1.3 1.5 1.5 2.8c.2 1.3.4 2.2 1.2 2.2.7 0 1.2-.7 1.7-1.8 1-2.2 1.7-6.1 2-8.9.2-1.9.7-2.8.9-4.2.2-1.7.3-3-.3-3.4-.5-.3-1.6.3-2.6.3C17 3.5 15.2 2 12 2z"/>
        </svg>
      </div>
      <span className="text-xl font-black tracking-tight text-slate-900 dark:text-white">dentOS</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#faf8ff] dark:bg-slate-950 text-slate-900 dark:text-white font-sans antialiased selection:bg-blue-700 selection:text-white">
      {/* ─── HEADER ─── */}
      <header className="fixed top-0 w-full z-50 bg-[#faf8ff]/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800">
        <div className="h-20 max-w-7xl mx-auto px-5 lg:px-10 flex items-center justify-between">
          <Link href="/"><DentalLogo /></Link>
          <nav className="hidden lg:flex items-center gap-1 text-sm font-semibold text-slate-600 dark:text-slate-400">
            <a href="#features" className="px-3 py-2 rounded-lg hover:text-blue-700 hover:bg-blue-50 transition">{c.navFeatures}</a>
            <a href="#modules" className="px-3 py-2 rounded-lg hover:text-blue-700 hover:bg-blue-50 transition">{c.navModules}</a>
            <a href="#roles" className="px-3 py-2 rounded-lg hover:text-blue-700 hover:bg-blue-50 transition">{c.navRoles}</a>
            <a href="#contact" className="px-3 py-2 rounded-lg hover:text-blue-700 hover:bg-blue-50 transition">{c.navContact}</a>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} title="Kun / Tun"
              className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 dark:text-amber-300 hover:text-blue-700 dark:hover:text-amber-200 flex items-center justify-center transition">
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <div className="flex items-center text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
              {(['uz', 'ru', 'en'] as Language[]).map((lg) => (
                <button key={lg} onClick={() => setLanguage(lg)}
                  className={`px-2 py-1 rounded-md uppercase transition ${language === lg ? 'bg-white dark:bg-slate-900 dark:bg-slate-700 text-blue-700 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
                  {lg}
                </button>
              ))}
            </div>
            <Link href="/login" className="hidden sm:block text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-700 px-3 py-2 transition">{c.navLogin}</Link>
            <button onClick={handleAction}
              className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm shadow-md shadow-blue-700/20 transition active:scale-[0.98] flex items-center gap-2">
              <span>{user ? c.navCabinet : c.navTry}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="pt-20">
        {/* ─── 1. HERO ─── */}
        <section className="relative px-5 lg:px-10 pt-12 pb-24 overflow-hidden bg-gradient-to-br from-[#faf8ff] via-[#f2f3ff] to-white dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute top-1/2 -right-24 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
            <div className="lg:col-span-6 flex flex-col items-start gap-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-xs font-semibold">
                <BadgeCheck className="w-4 h-4" />{c.heroBadge}
              </div>
              <h1 className="text-3xl lg:text-5xl font-black tracking-tight leading-tight text-slate-900 dark:text-white">{c.heroTitle}</h1>
              <p className="text-base lg:text-lg text-slate-600 dark:text-slate-400 max-w-xl">{c.heroSubtitle}</p>
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <button onClick={handleAction} className="w-full sm:w-auto px-7 py-3.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold shadow-lg shadow-blue-700/25 transition active:scale-[0.98] text-center">{c.heroStart}</button>
                <a href="#features" className="w-full sm:w-auto px-7 py-3.5 bg-white dark:bg-slate-900 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl font-bold transition flex items-center justify-center gap-2">
                  <PlayCircle className="w-5 h-5 text-blue-700" />{c.heroDemo}
                </a>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-slate-200/70 dark:border-slate-800 w-full">
                {[Building2, Globe, Cloud, MessageCircle].map((Icon, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Icon className="w-5 h-5 text-blue-700" />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{c.heroChips[i]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Calendar mockup */}
            <div className="lg:col-span-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-blue-700/10 overflow-hidden border border-slate-200 dark:border-slate-700">
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-3 h-3 rounded-full bg-rose-400" />
                    <span className="w-3 h-3 rounded-full bg-teal-400" />
                    <span className="w-3 h-3 rounded-full bg-blue-400" />
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 ml-2 truncate">{c.mockTitle}</span>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                    <CalendarDays className="w-3.5 h-3.5" />{c.mockDate}
                  </div>
                </div>
                <div className="p-4 overflow-x-auto">
                  <div className="min-w-[520px]">
                    <div className="grid grid-cols-4 gap-3 pb-3 border-b border-slate-200 dark:border-slate-700 text-center">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 self-center">{c.mockTime}</div>
                      {[['Dr. Aliyev', 'Terapevt'], ['Dr. Karimov', 'Ortodont'], ['Dr. Saidova', 'Xirurg']].map((d, i) => (
                        <div key={i} className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{d[0]}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{d[1]}</p>
                        </div>
                      ))}
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-1">
                      <div className="grid grid-cols-4 gap-3 py-2.5 items-center">
                        <span className="text-[11px] font-medium text-slate-400 text-center">09:00</span>
                        <div className="p-2 rounded-lg bg-teal-50 border-l-4 border-teal-500"><p className="text-[11px] font-bold text-teal-900">Aziz Rahimov</p><p className="text-[10px] text-teal-700">Karies (Tasdiqlangan)</p></div>
                        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border-l-4 border-blue-600"><p className="text-[11px] font-bold text-blue-900">Malika Umarova</p><p className="text-[10px] text-blue-700">Breket (Band)</p></div>
                        <div />
                      </div>
                      <div className="grid grid-cols-4 gap-3 py-2.5 items-center">
                        <span className="text-[11px] font-medium text-slate-400 text-center">10:30</span>
                        <div />
                        <div className="p-2 rounded-lg bg-indigo-50 border-l-4 border-indigo-500"><p className="text-[11px] font-bold text-indigo-900">Jasur Toshmatov</p><p className="text-[10px] text-indigo-700">Konsultatsiya (Jarayonda)</p></div>
                        <div className="p-2 rounded-lg bg-rose-50 border-l-4 border-rose-500"><p className="text-[11px] font-bold text-rose-900">Nodira Karimova</p><p className="text-[10px] text-rose-700">Implant (Qarzdorlik)</p></div>
                      </div>
                      <div className="grid grid-cols-4 gap-3 py-2.5 items-center">
                        <span className="text-[11px] font-medium text-slate-400 text-center">12:00</span>
                        <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 border-l-4 border-slate-400"><p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Timur Akbarov</p><p className="text-[10px] text-slate-500 dark:text-slate-400">Gigiyena (Yakunlangan)</p></div>
                        <div />
                        <div className="p-2 rounded-lg bg-teal-50 border-l-4 border-teal-500"><p className="text-[11px] font-bold text-teal-900">Zilola Nazarova</p><p className="text-[10px] text-teal-700">Olib tashlash (Tasdiqlangan)</p></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── 2. TRUST STRIP ─── */}
        <section className="py-12 bg-[#f2f3ff] dark:bg-slate-900">
          <div className="max-w-7xl mx-auto px-5 lg:px-10 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-8">{c.trust}</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-5 items-center">
              {['StomoMed Lux', 'Dental Prof', 'Smile Studio', 'Implant Clinic', 'Ortho Center'].map((n, i) => (
                <div key={i} className={`flex items-center justify-center p-4 bg-white dark:bg-slate-900 rounded-xl shadow-sm ${i === 4 ? 'col-span-2 md:col-span-1' : ''}`}>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 3. 14 MODULES (zig-zag) ─── */}
        <section id="features" className="py-24 px-5 lg:px-10 max-w-7xl mx-auto scroll-mt-20">
          <div id="modules" className="text-center max-w-2xl mx-auto mb-16 scroll-mt-24">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-700 block mb-2">{c.featTag}</span>
            <h2 className="text-2xl lg:text-4xl font-black text-slate-900 dark:text-white">{c.featTitle}</h2>
            <p className="text-base text-slate-600 dark:text-slate-400 mt-3">{c.featSub}</p>
          </div>
          <div className="space-y-16 lg:space-y-20">
            {(showAll ? MODULES : MODULES.slice(0, 5)).map((m, i) => {
              const Icon = m.icon;
              const reversed = i % 2 === 1;
              const textCol = (
                <div className={`lg:col-span-5 space-y-5 ${reversed ? 'order-1 lg:order-2' : ''}`}>
                  <div className="w-12 h-12 rounded-xl bg-blue-700 text-white flex items-center justify-center shadow-md shadow-blue-700/20">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl lg:text-2xl font-black text-slate-900 dark:text-white">{m.t[li]}</h3>
                  <p className="text-base text-slate-600 dark:text-slate-400">{m.d[li]}</p>
                  <ul className="space-y-2.5">
                    {m.b.map((bl, bi) => (
                      <li key={bi} className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                        <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 flex items-center justify-center shrink-0"><Check className="w-3.5 h-3.5" /></span>
                        {bl[li]}
                      </li>
                    ))}
                  </ul>
                </div>
              );
              const shot = SHOTS[i];
              // markazga qarab egilish: o'ngdagi rasm chapga, chapdagi rasm o'ngga qaraydi; hover'da tekislanadi
              const tiltClass = reversed
                ? '[transform:perspective(1800px)_rotateY(7deg)]'
                : '[transform:perspective(1800px)_rotateY(-7deg)]';
              const mockCol = (
                <div className={`lg:col-span-7 ${tiltClass} hover:[transform:perspective(1800px)_rotateY(0deg)] transition-transform duration-500 ${reversed ? 'order-2 lg:order-1' : ''}`}>
                  {shot ? (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl shadow-blue-900/20 overflow-hidden">
                      {/* brauzer uslubidagi ustki panel */}
                      <div className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-400"></span>
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                        <span className="w-2.5 h-2.5 rounded-full bg-green-400"></span>
                        <span className="ml-3 text-[11px] font-semibold text-slate-400 truncate">dentOS · {m.t[li]}</span>
                      </div>
                      <img src={shot} alt={m.t[li]} loading="lazy" className="w-full h-auto block" />
                    </div>
                  ) : (
                    <div className="bg-[#eaedff] dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl shadow-blue-700/5 space-y-3">
                      {m.mock.map((row, ri) => (
                        <div key={ri} className="p-3.5 bg-white dark:bg-slate-900 rounded-xl flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-blue-700 text-white flex items-center justify-center font-bold text-xs shrink-0">{row.a}</div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 dark:text-slate-200 truncate">{row.c[li]}</p>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${MOCK_TONES[row.tone]}`}>{row.chip[li]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
              return (
                <div key={i} className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-center">
                  {textCol}{mockCol}
                </div>
              );
            })}
          </div>

          {/* Yana ko'rish / Yashirish tugmasi */}
          <div className="mt-16 flex flex-col items-center gap-4">
            {!showAll && (
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{c.moreHint}</p>
            )}
            <button
              onClick={() => setShowAll(v => !v)}
              className="px-7 py-3.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-sm shadow-lg shadow-blue-700/25 transition active:scale-[0.98] flex items-center gap-2">
              <span>{showAll ? c.showLess : c.showMore}</span>
              <ArrowRight className={`w-4 h-4 transition-transform ${showAll ? '-rotate-90' : 'rotate-90'}`} />
            </button>
          </div>
        </section>

        {/* ─── 4. ROLES ─── */}
        <section id="roles" className="py-24 px-5 lg:px-10 scroll-mt-20">
          <div className="max-w-7xl mx-auto bg-[#f2f3ff] dark:bg-slate-900 rounded-3xl px-6 lg:px-12 py-16">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="text-xs font-bold uppercase tracking-widest text-blue-700 block mb-2">{c.rolesTag}</span>
              <h2 className="text-2xl lg:text-4xl font-black text-slate-900 dark:text-white">{c.rolesTitle}</h2>
              <p className="text-base text-slate-600 dark:text-slate-400 mt-3">{c.rolesSub}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {ROLES.map((r, i) => {
                const Icon = r.icon;
                return (
                  <div key={i} className="p-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg shadow-blue-700/5 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                      <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${r.color}`}>{r.badge[li]}</span>
                      <Icon className={`w-7 h-7 ${r.color.split(' ')[0]}`} />
                    </div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white mb-1.5">{r.t[li]}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">{r.d[li]}</p>
                    <ul className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4 mt-auto">
                      {r.perms.map((pm, pi) => (
                        <li key={pi} className="flex items-center gap-2 text-[13px] font-medium text-slate-700 dark:text-slate-200">
                          <Check className={`w-4 h-4 shrink-0 ${r.color.split(' ')[0]}`} />
                          {pm[li]}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── 5. MULTI-BRANCH ─── */}
        <section className="py-24 px-5 lg:px-10 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 space-y-6">
              <span className="text-xs font-bold uppercase tracking-widest text-blue-700 block">{c.branchTag}</span>
              <h2 className="text-2xl lg:text-4xl font-black text-slate-900 dark:text-white">{c.branchTitle}</h2>
              <p className="text-base text-slate-600 dark:text-slate-400">{c.branchSub}</p>
              <ul className="space-y-3">
                {c.branchPoints.map((p, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 flex items-center justify-center shrink-0 mt-0.5"><Check className="w-4 h-4" /></span>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="lg:col-span-6">
              <div className="grid grid-cols-2 gap-4">
                {([['Markaziy', '32,4 mln', 'text-emerald-600'], ['Chilonzor', '18,1 mln', 'text-blue-600'], ['Yunusobod', '21,7 mln', 'text-teal-600'], ['Sergeli', '14,9 mln', 'text-indigo-600']] as const).map((b, i) => (
                  <div key={i} className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase"><Building2 className="w-4 h-4" />{b[0]}</div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">{b[1]}</div>
                    <div className={`text-[11px] font-semibold mt-1 ${b[2]}`}>Oylik tushum ↑</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── 6. INTEGRATIONS + AI ─── */}
        <section id="contact" className="py-24 px-5 lg:px-10 scroll-mt-20">
          <div className="max-w-7xl mx-auto bg-[#f2f3ff] dark:bg-slate-900 rounded-3xl px-6 lg:px-12 py-16">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="text-xs font-bold uppercase tracking-widest text-blue-700 block mb-2">{c.intTag}</span>
              <h2 className="text-2xl lg:text-4xl font-black text-slate-900 dark:text-white">{c.intTitle}</h2>
              <p className="text-base text-slate-600 dark:text-slate-400 mt-3">{c.intSub}</p>
            </div>

            {/* AI prominent card */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="p-7 rounded-2xl bg-gradient-to-br from-blue-700 to-blue-900 text-white shadow-xl shadow-blue-700/20">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center"><Bot className="w-6 h-6" /></div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-lg">{c.aiTitle}</h3>
                      <span className="px-2 py-0.5 rounded-full bg-teal-400 text-teal-950 text-[10px] font-black">{c.aiBadge}</span>
                    </div>
                    <div className="flex items-center gap-1 text-blue-200 text-xs"><Sparkles className="w-3.5 h-3.5" /> AI-powered</div>
                  </div>
                </div>
                <p className="text-sm text-blue-100 leading-relaxed">{c.aiDesc}</p>
              </div>
              <div className="p-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-center gap-3">
                <div className="self-start max-w-[80%] px-4 py-2.5 rounded-2xl rounded-bl-sm bg-slate-100 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">{c.aiChat1}</div>
                <div className="self-end max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-blue-700 text-white text-sm">{c.aiChat2}</div>
                <div className="self-end flex items-center gap-1.5 text-[11px] text-slate-400"><Bot className="w-3.5 h-3.5 text-blue-700" /> dentOS AI</div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {c.integrations.map((it, i) => {
                const Icon = it.icon;
                return (
                  <div key={i} className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm text-center">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 flex items-center justify-center mx-auto mb-3"><Icon className="w-6 h-6" /></div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">{it.title}</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{it.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── 7. STATS ─── */}
        <section className="py-20 bg-blue-700 text-white">
          <div className="max-w-7xl mx-auto px-5 lg:px-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {c.stats.map((s, i) => (
              <div key={i}>
                <div className="text-3xl lg:text-5xl font-black tracking-tight">{s.num}</div>
                <div className="text-sm text-blue-200 font-medium mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── 8. FINAL CTA ─── */}
        <section className="py-20 px-5 lg:px-10 max-w-7xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white px-6 py-14 text-center">
            <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
            <div className="max-w-2xl mx-auto relative z-10 space-y-6">
              <h2 className="text-2xl lg:text-4xl font-black">{c.ctaTitle}</h2>
              <p className="text-base text-emerald-50">{c.ctaSub}</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button onClick={handleAction} className="w-full sm:w-auto px-8 py-4 bg-white dark:bg-slate-900 text-emerald-700 rounded-xl font-black shadow-lg transition active:scale-[0.98]">{c.ctaBtn}</button>
                <Link href="/login" className="w-full sm:w-auto px-8 py-4 bg-emerald-800/40 hover:bg-emerald-800/60 border border-white/20 text-white rounded-xl font-bold transition">{c.ctaLogin}</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ─── FOOTER ─── */}
      <footer className="bg-[#f2f3ff] dark:bg-slate-900 py-12 border-t border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-5 lg:px-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-3">
            <DentalLogo />
            <span className="text-xs text-slate-500 dark:text-slate-400">{c.footerText}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5 text-sm text-slate-500 dark:text-slate-400">
            {c.footerLinks.map((l, i) => (<a key={i} href="#" className="hover:text-blue-700 transition">{l}</a>))}
          </div>
          <div className="flex flex-col gap-1.5 text-sm text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-2"><Phone className="w-4 h-4 text-blue-700" /> +998 (71) 200-00-32</span>
            <span className="flex items-center gap-2"><Mail className="w-4 h-4 text-blue-700" /> support@dentos.uz</span>
            <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-700" /> Toshkent, O‘zbekiston</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
