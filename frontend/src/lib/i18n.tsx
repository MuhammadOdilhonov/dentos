'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { translate, translateRaw } from './locales';

export type Language = 'uz' | 'ru' | 'en';

export interface Translations {
  // Nav
  dashboard: string;
  appointments: string;
  patients: string;
  warehouse: string;
  reports: string;
  tasks: string;
  laboratory: string;
  naryads: string;
  pulse: string;
  help: string;
  settings: string;

  // Header
  searchPlaceholder: string;
  today: string;
  addPatient: string;
  notifications: string;
  logout: string;
  switchRole: string;
  themeToggle: string;

  // Auth & Roles
  loginTitle: string;
  loginSubtitle: string;
  usernameLabel: string;
  passwordLabel: string;
  loginButton: string;
  quickLoginLabel: string;
  loginError: string;
  roleDirector: string;
  roleAdmin: string;
  roleKassa: string;
  roleDoctor: string;

  // Dashboard & KPIs
  totalRevenue: string;
  todayVisits: string;
  newPatients: string;
  netProfit: string;
  patientDebts: string;
  doctorKpiTitle: string;
  popularServices: string;
  liveMonitor: string;
  stockAlerts: string;
  labPipeline: string;
  monthlyRevenue: string;
  completedVisits: string;
  monthlyTarget: string;
  paymentBreakdown: string;
  averageCheck: string;
  retentionRate: string;
  roomOccupancy: string;
  quickActions: string;
  exportExcel: string;
  overview: string;
  staffManagement: string;

  // Staff Management
  addEmployee: string;
  allStaff: string;
  doctors: string;
  nurses: string;
  admins: string;
  cashiers: string;
  fullName: string;
  specialty: string;
  role: string;
  phone: string;
  cabinetChair: string;
  salaryRate: string;
  schedule: string;
  activeStatus: string;
  vacationStatus: string;
  enterName: string;
  saveEmployee: string;

  // Calendar & Schedule
  dayView: string;
  threeDaysView: string;
  weekView: string;
  monthView: string;
  byEmployees: string;
  byChairs: string;
  time: string;
  bookSlot: string;
  appointmentDetails: string;
  newAppointment: string;
  patient: string;
  doctor: string;
  service: string;
  duration: string;
  chair: string;
  price: string;
  paid: string;
  debt: string;
  paymentMethod: string;
  cash: string;
  card: string;
  transfer: string;
  insurance: string;
  smsNotification: string;
  inRoom: string;
  waiting: string;
  print: string;
  filters: string;

  // Statuses
  statusConfirmed: string;
  statusInProgress: string;
  statusCompleted: string;
  statusDebt: string;
  statusReserved: string;
  statusCancelled: string;

  // Actions & Common
  save: string;
  cancel: string;
  edit: string;
  delete: string;
  search: string;
  date: string;
  status: string;
  sum: string;
  actions: string;
  yes: string;
  no: string;
  male: string;
  female: string;
  birthDate: string;
  gender: string;
  comments: string;
}

const dictionaries: Record<Language, Translations> = {
  ru: {
    dashboard: 'Дашборд',
    appointments: 'Записи',
    patients: 'Пациенты',
    warehouse: 'Склад',
    reports: 'Отчеты',
    tasks: 'Задачи',
    laboratory: 'Лаборатория',
    naryads: 'Прейскурант нарядов',
    pulse: 'Пульс',
    help: 'Помощь',
    settings: 'Настройки',

    searchPlaceholder: 'Поиск по имени или телефону...',
    today: 'Сегодня',
    addPatient: 'Добавить пациента',
    notifications: 'Уведомления',
    logout: 'Выйти из аккаунта',
    switchRole: 'Переключить роль',
    themeToggle: 'Сменить тему (День / Ночь)',

    loginTitle: 'Вход в систему 32Desk',
    loginSubtitle: 'Введите логин и пароль или выберите демо-роль',
    usernameLabel: 'Логин',
    passwordLabel: 'Пароль',
    loginButton: 'Войти в систему',
    quickLoginLabel: 'Быстрый вход по ролям (Пароль: 123456):',
    loginError: 'Неверный логин или пароль. Попробуйте один из вариантов ниже.',
    roleDirector: 'Директор / Главврач',
    roleAdmin: 'Администратор',
    roleKassa: 'Кассир',
    roleDoctor: 'Врач-Стоматолог',

    totalRevenue: 'Общая выручка',
    todayVisits: 'Приемы на сегодня',
    newPatients: 'Новые пациенты',
    netProfit: 'Чистая прибыль',
    patientDebts: 'Задолженность пациентов',
    doctorKpiTitle: 'Показатели врачей',
    popularServices: 'Популярные услуги клиники',
    liveMonitor: 'Живой монитор приемов',
    stockAlerts: 'Заканчивающиеся материалы',
    labPipeline: 'Заказы в лабораторию',
    monthlyRevenue: 'Динамика выручки',
    completedVisits: 'Завершенные приемы',
    monthlyTarget: 'План на месяц',
    paymentBreakdown: 'Структура оплат',
    averageCheck: 'Средний чек',
    retentionRate: 'Возврат пациентов',
    roomOccupancy: 'Занятость кабинетов',
    quickActions: 'Быстрые действия',
    exportExcel: 'Экспорт в Excel',
    overview: 'Обзор и аналитика',
    staffManagement: 'Сотрудники клиники',

    addEmployee: 'Добавить сотрудника',
    allStaff: 'Все сотрудники',
    doctors: 'Врачи',
    nurses: 'Медсестры',
    admins: 'Администраторы',
    cashiers: 'Кассиры',
    fullName: 'Ф.И.О.',
    specialty: 'Специальность',
    role: 'Должность / Роль',
    phone: 'Телефон',
    cabinetChair: 'Кабинет / Кресло',
    salaryRate: 'Ставка / %',
    schedule: 'График работы',
    activeStatus: 'Активен',
    vacationStatus: 'В отпуске',
    enterName: 'Введите полное имя сотрудника',
    saveEmployee: 'Сохранить сотрудника',

    dayView: 'День',
    threeDaysView: '3 Дня',
    weekView: 'Неделя',
    monthView: 'Месяц',
    byEmployees: 'По сотрудникам',
    byChairs: 'По креслам',
    time: 'Время',
    bookSlot: 'Записать',
    appointmentDetails: 'Детали приема',
    newAppointment: 'Новая запись',
    patient: 'Пациент',
    doctor: 'Врач',
    service: 'Услуга',
    duration: 'Длительность',
    chair: 'Кресло',
    price: 'Стоимость',
    paid: 'Оплачено',
    debt: 'Остаток / Долг',
    paymentMethod: 'Способ оплаты',
    cash: 'Наличные',
    card: 'Карта / Терминал',
    transfer: 'Перечисление',
    insurance: 'Страховка',
    smsNotification: 'SMS-оповещение',
    inRoom: 'В кабинете',
    waiting: 'Ожидает',
    print: 'Печать',
    filters: 'Фильтры',

    statusConfirmed: 'Пришел / Подтвержден',
    statusInProgress: 'В процессе',
    statusCompleted: 'Завершен',
    statusDebt: 'Имеется задолженность',
    statusReserved: 'Забронировано',
    statusCancelled: 'Отменен',

    save: 'Сохранить',
    cancel: 'Отмена',
    edit: 'Редактировать',
    delete: 'Удалить',
    search: 'Поиск',
    date: 'Дата',
    status: 'Статус',
    sum: 'Сумма',
    actions: 'Действия',
    yes: 'Да',
    no: 'Нет',
    male: 'Мужчина',
    female: 'Женщина',
    birthDate: 'Дата рождения',
    gender: 'Пол',
    comments: 'Примечание'
  },
  uz: {
    dashboard: 'Boshqaruv paneli',
    appointments: 'Qabullar',
    patients: 'Bemorlar',
    warehouse: 'Ombor',
    reports: 'Hisobotlar',
    tasks: 'Vazifalar',
    laboratory: 'Laboratoriya',
    naryads: 'Naryadlar',
    pulse: 'Puls',
    help: 'Yordam',
    settings: 'Sozlamalar',

    searchPlaceholder: 'Ism yoki telefon orqali qidirish...',
    today: 'Bugun',
    addPatient: 'Yangi bemor qo‘shish',
    notifications: 'Bildirishnomalar',
    logout: 'Tizimdan chiqish',
    switchRole: 'Rolni almashtirish',
    themeToggle: 'Mavzuni almashtirish (Kun / Tun)',

    loginTitle: '32Desk tizimiga kirish',
    loginSubtitle: 'Login va parolni kiriting yoki demo rolni tanlang',
    usernameLabel: 'Login',
    passwordLabel: 'Parol',
    loginButton: 'Tizimga kirish',
    quickLoginLabel: '4 ta rol bo‘yicha tezkor kirish (Parol: 123456):',
    loginError: 'Login yoki parol noto‘g‘ri. Quyidagi rollardan birini tanlang.',
    roleDirector: 'Direktor / Bosh shifokor',
    roleAdmin: 'Administrator',
    roleKassa: 'Kassir',
    roleDoctor: 'Shifokor-stomatolog',

    totalRevenue: 'Umumiy tushum',
    todayVisits: 'Bugungi qabullar',
    newPatients: 'Yangi bemorlar',
    netProfit: 'Sof foyda',
    patientDebts: 'Bemorlar qarzdorligi',
    doctorKpiTitle: 'Shifokorlar samaradorligi',
    popularServices: 'Klinikaning ommabop xizmatlari',
    liveMonitor: 'Qabullarning jonli monitoringi',
    stockAlerts: 'Kam qolgan materiallar',
    labPipeline: 'Laboratoriya buyurtmalari',
    monthlyRevenue: 'Tushum dinamikasi',
    completedVisits: 'Tugatilgan qabullar',
    monthlyTarget: 'Oylik reja',
    paymentBreakdown: 'To‘lovlar tarkibi',
    averageCheck: 'O‘rtacha chek',
    retentionRate: 'Bemorlar qaytishi',
    roomOccupancy: 'Kabinetlar bandligi',
    quickActions: 'Tezkor amallar',
    exportExcel: 'Excelga yuklab olish',
    overview: 'Umumiy tahlil',
    staffManagement: 'Klinika xodimlari',

    addEmployee: 'Yangi xodim qo‘shish',
    allStaff: 'Barcha xodimlar',
    doctors: 'Shifokorlar',
    nurses: 'Hamshiralar',
    admins: 'Adminlar',
    cashiers: 'Kassirlar',
    fullName: 'F.I.SH',
    specialty: 'Mutaxassislik',
    role: 'Lavozim / Rol',
    phone: 'Telefon',
    cabinetChair: 'Kabinet / Kreslo',
    salaryRate: 'Stavka / %',
    schedule: 'Ish tartibi',
    activeStatus: 'Faol',
    vacationStatus: 'Ta‘tilda',
    enterName: 'Xodimning to‘liq ismini kiriting',
    saveEmployee: 'Xodimni saqlash',

    dayView: 'Kun',
    threeDaysView: '3 Kun',
    weekView: 'Hafta',
    monthView: 'Oy',
    byEmployees: 'Xodimlar bo‘yicha',
    byChairs: 'Kreslolar bo‘yicha',
    time: 'Vaqt',
    bookSlot: 'Qabulga yozish',
    appointmentDetails: 'Qabul tafsilotlari',
    newAppointment: 'Yangi qabul',
    patient: 'Bemor',
    doctor: 'Shifokor',
    service: 'Xizmat turi',
    duration: 'Davomiyligi',
    chair: 'Kreslo',
    price: 'Qiymati',
    paid: 'To‘landi',
    debt: 'Qoldiq / Qarz',
    paymentMethod: 'To‘lov usuli',
    cash: 'Naqd pul',
    card: 'Karta / Terminal',
    transfer: 'Hisob raqam (Perechislenie)',
    insurance: 'Sug‘urta',
    smsNotification: 'SMS xabarnoma',
    inRoom: 'Kabinetda',
    waiting: 'Kutmoqda',
    print: 'Chop etish',
    filters: 'Filtrlar',

    statusConfirmed: 'Keldi / Tasdiqlangan',
    statusInProgress: 'Jarayonda',
    statusCompleted: 'Yakunlangan',
    statusDebt: 'Qarzi bor',
    statusReserved: 'Band qilingan',
    statusCancelled: 'Bekor qilingan',

    save: 'Saqlash',
    cancel: 'Bekor qilish',
    edit: 'Tahrirlash',
    delete: 'O‘chirish',
    search: 'Qidirish',
    date: 'Sana',
    status: 'Status',
    sum: 'Summa',
    actions: 'Amallar',
    yes: 'Ha',
    no: 'Yo‘q',
    male: 'Erkak',
    female: 'Ayol',
    birthDate: 'Tug‘ilgan sana',
    gender: 'Jinsi',
    comments: 'Izoh / Eslatma'
  },
  en: {
    dashboard: 'Dashboard',
    appointments: 'Appointments',
    patients: 'Patients',
    warehouse: 'Warehouse',
    reports: 'Reports',
    tasks: 'Tasks',
    laboratory: 'Lab',
    naryads: 'Price Catalog',
    pulse: 'Pulse',
    help: 'Help',
    settings: 'Settings',

    searchPlaceholder: 'Search by patient name or phone...',
    today: 'Today',
    addPatient: 'Add Patient',
    notifications: 'Notifications',
    logout: 'Log Out',
    switchRole: 'Switch Role',
    themeToggle: 'Toggle Theme (Day / Night)',

    loginTitle: 'Log in to 32Desk',
    loginSubtitle: 'Enter credentials or select a quick demo role',
    usernameLabel: 'Username',
    passwordLabel: 'Password',
    loginButton: 'Log In',
    quickLoginLabel: 'Quick access by 4 roles (Password: 123456):',
    loginError: 'Invalid login or password. Choose one of the roles below.',
    roleDirector: 'Director / Chief Doctor',
    roleAdmin: 'Administrator',
    roleKassa: 'Cashier',
    roleDoctor: 'Dentist / Doctor',

    totalRevenue: 'Total Revenue',
    todayVisits: "Today's Visits",
    newPatients: 'New Patients',
    netProfit: 'Net Profit',
    patientDebts: 'Patient Receivables',
    doctorKpiTitle: 'Doctor Performance',
    popularServices: 'Top Clinic Procedures',
    liveMonitor: 'Live Appointment Monitor',
    stockAlerts: 'Low Stock Alerts',
    labPipeline: 'Dental Lab Pipeline',
    monthlyRevenue: 'Monthly Revenue',
    completedVisits: 'Completed Visits',
    monthlyTarget: 'Monthly Target',
    paymentBreakdown: 'Payment Breakdown',
    averageCheck: 'Average Check',
    retentionRate: 'Patient Retention',
    roomOccupancy: 'Room / Chair Occupancy',
    quickActions: 'Quick Actions',
    exportExcel: 'Export to Excel',
    overview: 'Overview & Analytics',
    staffManagement: 'Staff Management',

    addEmployee: 'Add Employee',
    allStaff: 'All Staff',
    doctors: 'Doctors',
    nurses: 'Nurses',
    admins: 'Admins',
    cashiers: 'Cashiers',
    fullName: 'Full Name',
    specialty: 'Specialty',
    role: 'Position / Role',
    phone: 'Phone',
    cabinetChair: 'Room / Chair',
    salaryRate: 'Salary / Rate',
    schedule: 'Work Schedule',
    activeStatus: 'Active',
    vacationStatus: 'On Vacation',
    enterName: 'Enter employee full name',
    saveEmployee: 'Save Employee',

    dayView: 'Day',
    threeDaysView: '3 Days',
    weekView: 'Week',
    monthView: 'Month',
    byEmployees: 'By Staff',
    byChairs: 'By Chairs',
    time: 'Time',
    bookSlot: 'Book',
    appointmentDetails: 'Appointment Details',
    newAppointment: 'New Appointment',
    patient: 'Patient',
    doctor: 'Doctor',
    service: 'Service',
    duration: 'Duration',
    chair: 'Chair',
    price: 'Price',
    paid: 'Paid',
    debt: 'Debt',
    paymentMethod: 'Payment Method',
    cash: 'Cash',
    card: 'Card / POS',
    transfer: 'Bank Transfer',
    insurance: 'Insurance',
    smsNotification: 'SMS Alert',
    inRoom: 'In Room',
    waiting: 'Waiting',
    print: 'Print',
    filters: 'Filters',

    statusConfirmed: 'Confirmed / Present',
    statusInProgress: 'In Progress',
    statusCompleted: 'Completed',
    statusDebt: 'Has Debt',
    statusReserved: 'Reserved',
    statusCancelled: 'Cancelled',

    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    search: 'Search',
    date: 'Date',
    status: 'Status',
    sum: 'Amount',
    actions: 'Actions',
    yes: 'Yes',
    no: 'No',
    male: 'Male',
    female: 'Female',
    birthDate: 'Date of Birth',
    gender: 'Gender',
    comments: 'Notes / Comments'
  }
};


export const STRINGS: Record<string, [string, string, string]> = {
  prim_exam: ['Birlamchi ko‘rik', 'Первичный осмотр', 'Initial exam'],
  describe_treatment: ['Davolashni tavsiflash', 'Описать лечение', 'Describe treatment'],
  by_teeth: ['Tishlar bo‘yicha', 'По зубам', 'By teeth'],
  curator_label: ['Nazoratchi shifokor', 'Врач-куратор', 'Curator'],
  status_word: ['Holat', 'Статус', 'Status'],
  agreed_with_patient: ['Bemor bilan kelishilgan', 'Согласован с пациентом', 'Agreed with patient'],
  st_done: ['Bajarilgan', 'Выполнено', 'Done'],
  st_in_progress: ['Jarayonda', 'В процессе', 'In progress'],
  st_planned: ['Rejalashtirilgan', 'Запланировано', 'Planned'],
  opt_abutment: ['Individual titan abatment', 'Индивидуальный титановый абатмент', 'Individual titanium abutment'],
  opt_cbct: ['KLKT 3D segment tomografiyasi', 'КЛКТ 3D Томография сегмента', 'CBCT 3D segment scan'],
  opt_veneer: ['Keramik vinir E.max', 'Керамический винир E.max', 'Ceramic veneer E.max'],
  opt_bridge: ['Ko‘prikli metallokeramika protez', 'Мостовидный металлокерамический протез', 'Metal-ceramic bridge'],
  opt_opg: ['OPTG (ikki jag‘ panoram rasmi)', 'ОПТГ (Панорамный снимок обеих челюстей)', 'OPG (panoramic both jaws)'],
  opt_rvg: ['Nishonli radioviziografik rasm', 'Прицельный радиовизиографический снимок', 'Targeted radiovisiographic image'],
  opt_trg: ['TRG yon proyeksiya', 'ТРГ боковая проекция', 'Lateral cephalogram'],
  opt_zirconia: ['Sirkoniy toji Prettau', 'Циркониевая коронка Prettau', 'Zirconia crown Prettau'],
  ph_note_full: ['Bemor holati yoki assistent uchun ko‘rsatma yozing...', 'Введите заметку о состоянии пациента или указания для ассистента...', 'Enter a note about the patient or instructions...'],
  ph_msg_text: ['Xabar yoki eslatma matnini kiriting...', 'Введите текст сообщения или напоминания...', 'Enter message or reminder text...'],
  ph_bot: ['Botga xabar yoki buyruq yozing...', 'Написать сообщение или команду боту...', 'Write a message or command to the bot...'],
  ph_tooth_eg: ['Masalan: 16, 26 yoki Panorama', 'Например: 16, 26 или Панорама', 'e.g.: 16, 26 or Panorama'],
  ph_search: ['Qidirish', 'Поиск', 'Search'],
  ttl_pick_tooth: ['Tish tanlash', 'Выбрать зуб', 'Select tooth'],
  ttl_voice: ['Ovozli eslatma', 'Голосовая заметка', 'Voice note'],
  ttl_done_task: ['Vazifani yakunlash', 'Завершить задачу', 'Complete task'],
  ttl_calendar: ['Kalendar', 'Календарь', 'Calendar'],
  ttl_write_tg: ['Telegram’ga yozish', 'Написать в Telegram', 'Write on Telegram'],
  ttl_naryad: ['Naryad', 'Наряд', 'Order'],
  ttl_edit_name: ['Ismni tahrirlash', 'Редактировать имя', 'Edit name'],
  ttl_reset_filters: ['Filtrlarni tozalash', 'Сбросить фильтры', 'Reset filters'],
  ttl_xray: ['Rentgen rasmi', 'Снимок рентгена', 'X-ray image'],
  ttl_save: ['Saqlash', 'Сохранить', 'Save'],
  ttl_zoom_in: ['Kattalashtirish', 'Увеличить', 'Zoom in'],
  ttl_zoom_out: ['Kichiklashtirish', 'Уменьшить', 'Zoom out'],
  ttl_goal: ['Maqsad / Muhimlik', 'Цель / Приоритет', 'Goal / Priority'],
  txt_today: ['Bugun', 'Сегодня', 'Today'],
  deadline_label: ['Bajarish muddati', 'Срок выполнения', 'Deadline'],
  ph_add_note: ['Yangi eslatma qo‘shish...', 'Добавить новую заметку...', 'Add a new note...'],
  ph_tg_send: ['Bemor Telegram botiga xabar yuborish...', 'Отправить сообщение в Telegram бот пациента...', "Send a message to the patient's Telegram bot..."],
  txt_show_pay: ['To‘lov ma‘lumotini ko‘rish', 'Показать данные оплаты', 'Show payment details'],
  txt_lab_desc: ['Toj, ko‘prik protez, vinir va abatmentlar hisobi', 'Учет коронок, мостовидных протезов, виниров и абатментов', 'Crowns, bridges, veneers and abutments tracking'],
  txt_file_limit: ['DICOM, JPEG, PNG 25 MB gacha', 'DICOM, JPEG, PNG до 25 МБ', 'DICOM, JPEG, PNG up to 25 MB'],
  from_balance: ['Balansdan', 'С баланса', 'From balance'],
  currency_som: ['So‘m', 'Сум', 'UZS'],
  service: ['Xizmat', 'Услуга', 'Service'],
  last_week: ['O‘tgan hafta', 'Прошедшая неделя', 'Last week'],
  this_month_2: ['Shu oy', 'В этом месяце', 'This month'],
  last_month: ['O‘tgan oy', 'Прошлый месяц', 'Last month'],
  custom_period: ['Davrni ko‘rsatish', 'Указать период', 'Custom period'],
  add_payment: ['To‘lov qo‘shish', 'Добавить оплату', 'Add payment'],
  partial_paid: ['Qisman to‘langan', 'Оплачен не полностью', 'Partially paid'],
  all_comms_with: ['Barcha aloqalar:', 'Все коммуникации с', 'All communications with'],
  lab_in_work: ['Ishlanmoqda', 'В работе', 'In progress'],
  lab_ready: ['Klinikada tayyor', 'Готово в клинике', 'Ready at clinic'],
  lab_fitting: ['O‘lchovda', 'На примерке', 'Fitting'],
  k_52: ['Tishlar tanlanmagan', 'Зубы не выбраны', 'Зубы не выбраны'],
  k_53: ['Shablonlar', 'Шаблоны', 'Шаблоны'],
  k_54: ['Xizmatlar', 'Услуги', 'Услуги'],
  name_or_phone: ['Ism Familiya yoki Telefon', 'Имя Фамилия Отчество или Телефон', 'Name or Phone'],
  k_55: ['Xabar bermaslik', 'Не уведомлять', 'Не уведомлять'],
  sms: ['SMS yuboriladi', 'Уведомить (SMS)', 'Уведомить (SMS)'],
  prices_include_vat: ['Narxlar QQS hisobga olingan holda ko‘rsatilgan', 'Цены указаны с учетом НДС', 'Prices include VAT'],
  '2_gbt_ems': ['2-daraja - Ogiz boligi professional gigiyenasi, EMS apparatida GBT Shveytsariya protokoli boyicha', '2 степень - Профессиональная гигиена полости рта, удаление без выраженных зубных отложений по Швейцарскому протоколу GBT на EMS аппарате', '2 степень - Профессиональная гигиена полости рта, удаление без выраженных зубных отложений по Швейцарскому протоколу GBT на EMS аппарате'],
  '73': ['Mirzo Ulug‘bek tumani, Mirzo Ulug‘bek ko‘chasi 73-uy', 'Мирзо-Улугбекский район, ул.Мирзо Улугбека дом 73', 'Мирзо-Улугбекский район, ул.Мирзо Улугбека дом 73'],
  add_to_cart: ['Savatga qo‘shish', 'Добавить в счёт', 'Add to cart'],
  k_24: ['Tanlangan tishlar', 'Выбраны зубы', 'Выбраны зубы'],
  k_25: ['Qidiruv', 'Поиск', 'Поиск'],
  k_26: ['Hech narsa topilmadi', 'Ничего не найдено', 'Ничего не найдено'],
  k_27: ['Balans', 'Баланс', 'Баланс'],
  k_28: ['Hozircha bo‘sh', 'Пока ничего', 'Пока ничего'],
  k_29: ['Tishlar', 'Зубы', 'Зубы'],
  k_30: ['Izoh qoldiring...', 'Оставить заметку', 'Оставить заметку'],
  k_31: ['Jami', 'Всего', 'Всего'],
  k_32: ['Bekor qilish', 'Отмена', 'Отмена'],
  services_order: ['Xizmatlar va Naryad', 'Услуги и Наряд-заказ', 'Services & Order'],
  no_naryad_yet: ['Naryad urilmagan', 'Наряд не оформлен', 'No naryad yet'],
  click_to_strike_a_naryad: ['+ Naryad urish uchun bosing', '+ Нажмите, чтобы оформить наряд', '+ Click to strike a naryad'],
  type_service_name: ['Xizmat nomini yozing (o‘zbekcha ham bo‘ladi)...', 'Введите название услуги...', 'Type service name...'],
  qty: ['Miqdori', 'Количество', 'Qty'],
  price: ['Narxi', 'Цена', 'Price'],
  doctor_staff: ['Xodim / Shifokor', 'Сотрудник', 'Doctor / Staff'],
  additional_items: ['+ Qo‘shimcha xizmat qo‘shish', '+ Дополнительные пункты', '+ Additional items'],
  discount: ['Chegirma', 'Скидка', 'Discount'],
  order_total: ['Naryad summasi', 'Итого к оплате', 'Order total'],
  to_pay: ['To‘lash kerak', 'К оплате', 'To pay'],
  payment_methods: ['To‘lov usullari', 'Способы оплаты', 'Payment methods'],
  add_method: ['Usul qo‘shish', 'Добавить способ', 'Add method'],
  paid_4: ['To‘landi:', 'Оплачено:', 'Paid:'],
  goes_to_debt: ['Qarzga yoziladi', 'Остаток в долг', 'Goes to debt'],
  draft_invoice: ['Dastlabki hisob', 'Предварительный счет', 'Draft Invoice'],
  cancel_2: ['Yopish', 'Закрыть', 'Cancel'],
  finish: ['Yakunlash', 'Завершить', 'Finish'],
  k_33: ['Bemor', 'Пациент', 'Пациент'],
  k_34: ['Naqd', 'Наличные', 'Наличные'],
  k_35: ['✕ Naryadni tozalash', '✕ Очистить наряд (не оформлен)', '✕ Очистить наряд (не оформлен)'],
  k_36: ['Tish raqami / Izoh:', 'Номер зуба / Заметка:', 'Номер зуба / Заметка:'],
  k_37: ['Balans:', 'Баланс:', 'Баланс:'],
  k_38: ['Chegirma', 'Скидка', 'Скидка'],
  k_39: ['Karta (Humo/Uzcard)', 'Карта', 'Карта'],
  k_40: ['Naryadni tozalash sababi', 'Причина очистки наряда', 'Причина очистки наряда'],
  k_41: ['Nima uchun o‘chirilmoqda?', 'Почему удаляется?', 'Почему удаляется?'],
  select: ['Tanlash', 'Выбрать', 'Select'],
  doctor: ['Shifokor', 'Сотрудник', 'Doctor'],
  start: ['Boshlanish', 'Начало в', 'Start'],
  duration: ['Davomiylik', 'Длительность', 'Duration'],
  chair: ['Ish joyi (kreslo)', 'Рабочее место', 'Chair'],
  not_set: ['Belgilanmagan', 'Не указано', 'Not set'],
  services_naryad_optional: ['Xizmatlar (naryad) — ixtiyoriy', 'Услуги (наряд) — необязательно', 'Services (naryad) — optional'],
  add_a_service: ['Qo‘shimcha xizmat qo‘shish', 'Добавить услугу', 'Add a service'],
  add_a_note: ['Izoh qo‘shish', 'Добавить заметку', 'Add a note'],
  cancel_3: ['Bekor qilish', 'Отмена', 'Cancel'],
  k_42: ['Yangi bemor sifatida qo‘shish', 'Добавить как нового пациента', 'Добавить как нового пациента'],
  k_43: ['Erkak', 'Мужчина', 'Мужчина'],
  k_44: ['Ayol', 'Женщина', 'Женщина'],
  k_45: ['daqiqa', 'мин.', 'мин.'],
  k_46: ['soat', 'ч.', 'ч.'],
  k_47: ['Naryad keyin uriladi', 'Наряд оформится позже', 'Наряд оформится позже'],
  k_48: ['Yana qo‘shish', 'Добавить ещё', 'Добавить ещё'],
  k_49: ['Yangi bemor', 'Новый пациент', 'Новый пациент'],
  en_us: ['uz-UZ', 'ru-RU', 'en-US'],
  invoice_for: ['HISOB UCHUN', 'СЧЕТ ДЛЯ', 'INVOICE FOR'],
  service_products: ['XIZMAT / MAHSULOTLAR', 'УСЛУГА / ПРОДУКТЫ', 'SERVICE / PRODUCTS'],
  qty_2: ['MIQDORI', 'КОЛИЧЕСТВО', 'QTY'],
  price_2: ['NARXI', 'СТОИМОСТЬ', 'PRICE'],
  total: ['JAMI', 'ВСЕГО', 'TOTAL'],
  total_2: ['Jami', 'Всего', 'Total'],
  total_to_pay: ['TO‘LANISHI KERAK', 'ИТОГО К ОПЛАТЕ', 'TOTAL TO PAY'],
  paid_5: ['TO‘LANGAN:', 'ОПЛАЧЕНО:', 'PAID:'],
  receipt: ['Chek', 'Чек', 'Receipt'],
  print: ['Chop etish', 'Печать', 'Print'],
  k_50: ['SO‘M', 'СУМ', 'СУМ'],
  k_51: ['Qarz sifatida', 'В долг', 'В долг'],
  balance: ['Balans', 'Баланс', 'Balance'],
  consultation: ['Konsultatsiya', 'Консультация', 'Consultation'],
  show_treatment_plan: ['davolash rejasini ko‘rish', 'показать план лечения', 'show treatment plan'],
  invoice_2: ['Hisob (Счет)', 'Счет', 'Invoice'],
  no_naryads_yet: ['Hozircha naryad urilmagan yoki bekor qilinmagan', 'Пока нет оформленных или отменённых нарядов', 'No naryads struck or cancelled yet'],
  participants: ['Ishtirokchilar', 'Участники', 'Participants'],
  treating_doctor: ['Davolovchi shifokor', 'Лечащий врач', 'Treating doctor'],
  naryad_log: ['Naryad jurnali', 'Журнал нарядов', 'Naryad log'],
  cancelled_3: ['Bekor qilindi', 'Отказ (удалён)', 'Cancelled'],
  struck: ['Naryad urildi', 'Оформлен', 'Struck'],
  invoice: ['Hisob', 'Счет', 'Invoice'],
  nothing_yet: ['Hozircha bo‘sh', 'Пока пусто', 'Nothing yet'],
  done: ['Bajarildi', 'Сделано', 'Done'],
  statusDebtShort: ['Qarz', 'Долг', 'Debt'],
  close: ['Yopish', 'Закрыть', 'Close'],
  checkout: ['Yakunlashga o‘tish', 'Подтвердить', 'Checkout'],
  female_2: ['Ayol', 'Женщина', 'Female'],
  male_2: ['Erkak', 'Мужчина', 'Male'],
  english: ['O‘zbek', 'Русский', 'English'],
  regular: ['Doimiy', 'Постоянный', 'Regular'],
  new: ['Birlamchi', 'Первичный', 'New'],
  order_2: ['Xizmatlar (Naryad)', 'Наряд', 'Order'],
  top_up_pay_debt: ['Pul qo‘shish / Qarzni to‘lash', 'Пополнить / Оплатить долг', 'Top up / Pay debt'],
  k: ['Qarz', 'В долг', 'В долг'],
  k_2: ['Karzinka', 'Корзина', 'Корзина'],
  k_3: ['Hozircha shifokor biriktirilmagan', 'Врачи пока не назначены', 'Врачи пока не назначены'],
  k_4: ['Sabab', 'Причина', 'Причина'],
  k_5: ['+ Naryad urish', '+ Оформить наряд', '+ Оформить наряд'],
  k_6: ['So‘m', 'Сум', 'Сум'],
  k_7: ['Qarz', 'Долг', 'Долг'],
  k_8: ['So‘m', 'Сум', 'Сум'],
  k_9: ['O‘chirish', 'Удалить', 'Удалить'],
  k_10: ['Jami', 'Итого', 'Итого'],
  k_11: ['So‘m', 'Сум', 'Сум'],
  k_12: ['To‘lov usuli:', 'Способ оплаты:', 'Способ оплаты:'],
  k_13: ['Naqd pul', 'Наличные', 'Наличные'],
  humo_uzcard: ['Karta (Humo/Uzcard)', 'Карта (Humo/Uzcard)', 'Карта (Humo/Uzcard)'],
  k_14: ['Bank o‘tkazmasi', 'Перевод', 'Перевод'],
  k_15: ['Naryadni bekor qilish sababi', 'Причина отмены наряда', 'Причина отмены наряда'],
  k_16: ['Nima uchun tozalanmoqda?', 'Почему удаляется?', 'Почему удаляется?'],
  k_17: ['Xato qilindi', 'Ошибка (по ошибке)', 'Ошибка (по ошибке)'],
  k_18: ['Boshqa sabab', 'Другая причина', 'Другая причина'],
  k_19: ['Sababni yozing...', 'Опишите причину...', 'Опишите причину...'],
  k_20: ['Bekor', 'Отмена', 'Отмена'],
  k_21: ['Xato qilindi', 'Ошибка', 'Ошибка'],
  k_22: ['Boshqa sabab', 'Другая причина', 'Другая причина'],
  k_23: ['O‘chirish', 'Удалить', 'Удалить'],
  quick_whatsapp_message: ["WhatsApp'ga tezkor xabar", 'Быстрое сообщение в WhatsApp', 'Quick WhatsApp message'],
  by_date: ['Sana bo‘yicha ', 'По дате ', 'By date '],
  newest_first: ['Avval yangi', 'Сначала новые', 'Newest first'],
  oldest_first: ['Avval eski', 'Сначала старые', 'Oldest first'],
  type: ['Turi ', 'Тип ', 'Type '],
  all_events: ['Barcha hodisalar', 'Все события', 'All events'],
  notes: ['Eslatmalar', 'Заметки', 'Notes'],
  payments: ['To‘lovlar', 'Оплаты', 'Payments'],
  appointments: ['Qabullar', 'Записи', 'Appointments'],
  staff: ['Xodim ', 'Сотрудник ', 'Staff '],
  all_staff: ['Barcha xodimlar', 'Все сотрудники', 'All staff'],
  completed: ['YAKUNLANGAN', 'ЗАВЕРШЕН', 'COMPLETED'],
  no_show: ['KELMAGAN', 'НЕЯВОК', 'NO-SHOW'],
  cancelled: ['BEKOR QILINGAN', 'ОТМЕНЕН', 'CANCELLED'],
  late: ['KECHIKKAN', 'ОПОЗДАЛ', 'LATE'],
  past: ['O‘tgan', 'Прошедшие', 'Past'],
  all: ['Barchasi', 'Все', 'All'],
  scheduled: ['Rejalashtirilgan', 'Запланировано', 'Scheduled'],
  new_appointment: ['Yangi qabul', 'Новая запись', 'New appointment'],
  staff_2: ['Xodim ', 'Сотрудник ', 'Staff '],
  prosthodontist: ['Ortoped', 'Ортопед', 'Prosthodontist'],
  comprehensive_dental_rehabilitation_plan: ['Kompleks stomatologik reabilitatsiya rejasi', 'План комплексной стоматологической реабилитации', 'Comprehensive dental rehabilitation plan'],
  print_plan: ['Rejani chop etish', 'Печать плана', 'Print plan'],
  add_stage: ['Bosqich qo‘shish', 'Добавить этап', 'Add stage'],
  total_cost: ['Umumiy narx', 'Общая стоимость', 'Total cost'],
  patient_discount: ['Bemor chegirmasi', 'Скидка пациента', 'Patient discount'],
  paid: ['To‘langan', 'Оплачено', 'Paid'],
  remaining_to_pay: ['To‘lanadigan qoldiq', 'Остаток к оплате', 'Remaining to pay'],
  leave_a_note: ['Eslatma qoldirish', 'Оставить заметку', 'Leave a note'],
  save_note: ['Eslatmani saqlash', 'Сохранить заметку', 'Save note'],
  notes_history: ['Eslatmalar tarixi', 'История заметок', 'Notes history'],
  all_doctors: ['Barcha shifokorlar', 'Все врачи', 'All doctors'],
  new_x_ray: ['Yangi rentgen', 'Новый рентген', 'New X-ray'],
  tooth: ['TISH #', 'ЗУБ #', 'TOOTH #'],
  tooth_word: ['Tish', 'Зуб', 'Tooth'],
  x_ray: ['Rentgen', 'Рентген', 'X-ray'],
  mic_denied: ['Mikrofonga ruxsat berilmadi', 'Доступ к микрофону запрещён', 'Microphone access denied'],
  recording: ['Yozib olinmoqda', 'Идёт запись', 'Recording'],
  voice_note: ['Ovozli eslatma', 'Голосовая заметка', 'Voice note'],
  photo_note: ['Foto', 'Фото', 'Photo'],
  upload_photo: ['Foto yuklash', 'Загрузить фото', 'Upload photo'],
  lab_new_work: ['Yangi ish', 'Новая работа', 'New work'],
  lab_patient: ['Bemor', 'Пациент', 'Patient'],
  lab_search_patient: ['Bemorni qidirish', 'Поиск пациента', 'Search patient'],
  lab_search_tech: ['Texnikni qidirish', 'Поиск Техника', 'Search technician'],
  teeth_not_selected: ['Tishlar tanlanmagan', 'Зубы не выбраны', 'No teeth selected'],
  clear_selection: ['Tanlovni tozalash', 'Очистить выбор', 'Clear selection'],
  next_word: ['Keyingi', 'Далее', 'Next'],
  back_word: ['Orqaga', 'Назад', 'Back'],
  select_work: ['Ishni tanlang', 'Выберите работу', 'Select work'],
  crown_color: ['Koronka rangi', 'Цвет коронки', 'Crown color'],
  due_date_lab: ['Topshirish sanasi', 'Дата сдачи', 'Due date'],
  fittings_word: ['O‘lchovlar', 'Примерки', 'Fittings'],
  add_image: ['Rasm qo‘shish', 'Добавить изображение', 'Add image'],
  to_send_word: ['Jo‘natishga', 'К отправке', 'To send'],
  wishes_word: ['Istaklar', 'Пожелания', 'Wishes'],
  pcs_short: ['dona', 'шт.', 'pcs'],
  choose_date: ['Sanani tanlang', 'Выбрать дату', 'Choose date'],
  save_lab: ['Saqlash', 'Сохранить', 'Save'],
  price_word: ['Narx', 'Цена', 'Price'],
  new_exam: ['Yangi ko‘rik', 'Новый осмотр', 'New exam'],
  add_treatment: ['Davolash qo‘shish', 'Добавить лечение', 'Add treatment'],
  done_on: ['Bajarildi', 'Сделано', 'Done'],
  min_short: ['daq.', 'мин.', 'min.'],
  photo_word: ['Foto', 'Фото', 'Photo'],
  basic_tab: ['Asosiy', 'Основные', 'Basic'],
  other_tab: ['Boshqa', 'Другие', 'Other'],
  drag_to_upload: ['Yuklash uchun torting', 'Перетащите чтобы загрузить', 'Drag to upload'],
  or_click_find: ['... yoki kompyuterdan tanlash uchun bosing', '... или нажмите, чтобы найти на компьютере', '... or click to find on your computer'],
  or_paste_clip: ['... yoki buferdan qo‘yish uchun CTRL + V bosing', '... или нажмите CTRL + V, чтобы вставить из буфера', '... or press CTRL + V to paste from clipboard'],
  therapist_role: ['Terapevt', 'Терапевт', 'Therapist'],
  date: ['SANA', 'ДАТА', 'DATE'],
  type_2: ['TURI', 'ТИП', 'TYPE'],
  quantity: ['MIQDORI', 'КОЛИЧЕСТВО', 'QUANTITY'],
  dose: ['DOZA', 'ДОЗА', 'DOSE'],
  image: ['RASM', 'СНИМОК', 'IMAGE'],
  view: ['Ko‘rish', 'Просмотр', 'View'],
  total_income: ['UMUMIY TUSHUM', 'ОБЩЕЕ ПОСТУПЛЕНИЕ', 'TOTAL INCOME'],
  treatment_cost: ['DAVOLASH NARXI', 'СТОИМОСТЬ ЛЕЧЕНИЯ', 'TREATMENT COST'],
  total_discounts: ['CHEGIRMALAR SUMMASI', 'СУММА СКИДОК', 'TOTAL DISCOUNTS'],
  invoices: ['Hisoblar', 'Счета', 'Invoices'],
  total_account: ['Umumiy hisob', 'Общий счет', 'Total account'],
  status: ['HOLAT', 'СТАТУС', 'STATUS'],
  paid_2: ['TO‘LANGAN', 'ОПЛАЧЕНО', 'PAID'],
  amount: ['SUMMA', 'СУММА', 'AMOUNT'],
  paid_3: ['To‘langan', 'Оплачен', 'Paid'],
  cancelled_2: ['Bekor qilingan', 'Отменен', 'Cancelled'],
  status_2: ['Holat ', 'Статус ', 'Status '],
  delivered: ['Yetkazildi', 'Доставлено', 'Delivered'],
  read: ['O‘qildi', 'Прочитано', 'Read'],
  in_queue: ['Navbatda', 'В очереди', 'In queue'],
  this_week: ['Shu hafta ', 'На этой неделе ', 'This week '],
  yesterday: ['Kecha', 'Вчера', 'Yesterday'],
  this_month: ['Shu oy', 'Этот месяц', 'This month'],
  scheduled_2: ['Rejalashtirilgan ', 'Запланировано на ', 'Scheduled '],
  next_24_hours: ['Yaqin 24 soat', 'Ближайшие 24 часа', 'Next 24 hours'],
  this_week_2: ['Shu hafta', 'На этой неделе', 'This week'],
  reception_32desk: ['Resepshn 32Desk', 'Ресепшн 32Desk', 'Reception 32Desk'],
  per_page: ['Sahifaga ', 'На страницу ', 'Per page '],
  scheduled_3: ['Rejalashtirilgan', 'Запланированное', 'Scheduled'],
  recent_calls: ['So‘nggi qo‘ng‘iroqlar', 'Недавние звонки', 'Recent calls'],
  sms_messages: ['SMS xabarlar', 'SMS сообщения', 'SMS messages'],
  send_message: ['Xabar yuborish', 'Отправить сообщение', 'Send message'],
  scheduled_mailings_auto_reminders: ['Rejalashtirilgan yuborishlar va avto-eslatmalar', 'Запланированные рассылки и авто-напоминания', 'Scheduled mailings & auto-reminders'],
  automatic_notifications_before_appointment_and_after_procedures: ['Qabuldan oldin va muolajalardan keyin avtomatik bildirishnoma yuborish', 'Автоматическая отправка уведомлений перед приемом и после процедур', 'Automatic notifications before appointment and after procedures'],
  schedule: ['Rejalashtirish', 'Запланировать', 'Schedule'],
  queued_to_send: ['Yuborish navbatida', 'В очереди на отправку', 'Queued to send'],
  call_log_pbx_telephony_integration: ['Qo‘ng‘iroqlar jurnali (ATS / Telefoniya integratsiyasi)', 'Журнал звонков (Интеграция с АТС / Телефония)', 'Call log (PBX / Telephony integration)'],
  call_patient: ['Bemorga qo‘ng‘iroq', 'Позвонить пациенту', 'Call patient'],
  sms_gateway_eskiz_playmobile: ['SMS-shlyuz (Eskiz / PlayMobile)', 'SMS-шлюз (Eskiz / PlayMobile)', 'SMS gateway (Eskiz / PlayMobile)'],
  send_sms: ['SMS yuborish', 'Отправить SMS', 'Send SMS'],
  sent_sms_history: ['Yuborilgan SMS tarixi', 'История отправленных SMS', 'Sent SMS history'],
  open_in_telegram: ['Telegram da ochish', 'Открыть в Telegram', 'Open in Telegram'],
  whatsapp_business_chat: ['WhatsApp Biznes-chat', 'WhatsApp Бизнес-чат', 'WhatsApp Business chat'],
  open_in_whatsapp_web_app: ['WhatsApp Web / App da ochish', 'Открыть в WhatsApp Web / App', 'Open in WhatsApp Web / App'],
  send_open_whatsapp: ['Yuborish va WhatsApp ochish', 'Отправить и открыть WhatsApp', 'Send & open WhatsApp'],
  whatsapp_message_history: ['WhatsApp xabarlar tarixi', 'История WhatsApp сообщений', 'WhatsApp message history'],
  dental_lab_orders: ['Zubotexnika laboratoriyasiga buyurtmalar', 'Заказы в зуботехническую лабораторию', 'Dental lab orders'],
  new_lab_order: ['Laboratoriyaga yangi buyurtma', 'Новый заказ в лабораторию', 'New lab order'],
  order: ['BUYURTMA #', 'ЗАКАЗ #', 'ORDER #'],
  tooth_2: ['TISH', 'ЗУБ', 'TOOTH'],
  construction: ['KONSTRUKSIYA', 'КОНСТРУКЦИЯ', 'CONSTRUCTION'],
  shade_vita: ['RANG (VITA)', 'ЦВЕТ (VITA)', 'SHADE (VITA)'],
  tech_lab: ['TEXNIK / LABORATORIYA', 'ТЕХНИК / ЛАБОРАТОРИЯ', 'TECH / LAB'],
  due_date: ['TOPSHIRISH MUDDATI', 'СРОК СДАЧИ', 'DUE DATE'],
  cost: ['NARXI', 'СТОИМОСТЬ', 'COST'],
  tasks: ['Vazifalar', 'Задачи', 'Tasks'],
  received_service: ['Olingan xizmat:', 'Полученная услуга:', 'Received service:'],
  upcoming_service: ['Kelgusi xizmat:', 'Предстоящая услуга:', 'Upcoming service:'],
  hygienist: ['Gigiyenist', 'Гигиенист', 'Hygienist'],
  all_types: ['Barcha turlar', 'Все типы', 'All types'],
  life_history: ['Hayot anamnezi', 'Анамнез жизни', 'Life history'],
  consents: ['Rozilik', 'Согласия', 'Consents'],
  quality_control: ['Sifat nazorati', 'Контроль качества', 'Quality control'],
  send_message_to_patient: ['Bemorga xabar yuborish', 'Отправить сообщение пациенту', 'Send message to patient'],
  channel: ['Aloqa kanali:', 'Канал связи:', 'Channel:'],
  message_text: ['Xabar matni:', 'Текст сообщения:', 'Message text:'],
  accept_payment: ['To‘lov qabul qilish', 'Внести оплату', 'Accept payment'],
  current_debt: ['Joriy qarz', 'Текущий долг', 'Current debt'],
  balance_prepay: ['Balans (avans)', 'Баланс (аванс)', 'Balance (prepay)'],
  uzs: ['So‘m', 'Сум', 'UZS'],
  amount_uzs: ['Summa (So‘m):', 'Сумма (Сум):', 'Amount (UZS):'],
  payment_method: ['To‘lov usuli:', 'Способ оплаты:', 'Payment method:'],
  cash: ['Naqd pul', 'Наличные', 'Cash'],
  card: ['Karta (Humo/Uzcard)', 'Карта (Humo/Uzcard)', 'Card'],
  bank_transfer: ['Bank o‘tkazmasi', 'Перевод', 'Bank transfer'],
  apply_to: ['Yo‘naltirish:', 'Направить:', 'Apply to:'],
  pay_debt: ['Qarzni yopish', 'Погасить долг', 'Pay debt'],
  to_balance: ['Hisobga (avans)', 'На баланс (аванс)', 'To balance'],
  accepted_by: ['Qabul qiladi', 'Принимает', 'Accepted by'],
  payment: ['To‘lov', 'Оплата', 'Payment'],
  new_balance: ['Yangi balans', 'Новый баланс', 'New balance'],
  cancel: ['Bekor', 'Отмена', 'Cancel'],
  process_receipt: ['Chekni o‘tkazish', 'Провести чек', 'Process receipt'],
  upload_x_ray_image: ['Rentgen rasm yuklash', 'Загрузить рентген-снимок', 'Upload X-ray image'],
  tooth_area: ['Tish raqami / Soha:', 'Номер зуба / Область:', 'Tooth / Area:'],
  x_ray_type: ['Rentgen turi:', 'Тип рентгена:', 'X-ray type:'],
  radiation_dose: ['Nurlanish dozasi:', 'Доза облучения:', 'Radiation dose:'],
  x_ray_file_dicom_jpeg_png: ['Rentgen rasm fayli (DICOM, JPEG, PNG):', 'Файл рентген-снимка (DICOM, JPEG, PNG):', 'X-ray file (DICOM, JPEG, PNG):'],
  select_a_file_or_drag_it_here: ['Fayl tanlang yoki bu yerga tashlang', 'Выберите файл или перетащите сюда', 'Select a file or drag it here'],
  print_image: ['Rasmni chop etish', 'Печать снимка', 'Print image'],
  new_order_to_dental_lab: ['Zubotexnika laboratoriyasiga yangi buyurtma', 'Новый наряд в зуботехническую лабораторию', 'New order to dental lab'],
  tooth_number: ['Tish raqami:', 'Номер зуба:', 'Tooth number:'],
  construction_type: ['Konstruksiya turi:', 'Вид конструкции:', 'Construction type:'],
  vita_shade: ['VITA shkalasi rangi:', 'Цвет по шкале VITA:', 'VITA shade:'],
  create_treatment_task: ['Davolash bo‘yicha vazifa yaratish', 'Создать задачу по лечению', 'Create treatment task'],
  results_answers: ['Natijalar va javoblar:', 'Результаты и ответы:', 'Results & answers:'],
  patient_deleted: ['Bemor o‘chirildi', 'Пациент успешно удален', 'Patient deleted'],
  patient: ['Bemor', 'Пациент', 'Patient'],
  general: ['Asosiy', 'Основные', 'General'],
  additional: ['Qo‘shimcha', 'Дополнительно', 'Additional'],
  details: ['Tafsilotlar', 'Детали', 'Details'],
  merge: ['Birlashtirish', 'Объединение', 'Merge'],
  last_name: ['Familiya*', 'Фамилия*', 'Last name*'],
  patronymic: ['Otasining ismi', 'Отчество', 'Patronymic'],
  additional_2: ['Qo‘shimcha telefon', 'Дополнительный', 'Additional'],
  address: ['Manzil', 'Адрес', 'Address'],
  service_language: ['Xizmat tili', 'Язык обслуживания', 'Service language'],
  notification_channels: ['Bildirishnoma kanallari', 'Каналы уведомлений', 'Notification channels'],
  first_name: ['Ism*', 'Имя*', 'First name*'],
  phone: ['Telefon*', 'Телефон*', 'Phone*'],
  staff_3: ['Xodim*', 'Сотрудник*', 'Staff*'],
  birth_date: ['Tug‘ilgan sana', 'Дата рождения', 'Birth date'],
  source: ['Manba', 'Источник', 'Source'],
  not_specified: ['Ko‘rsatilmagan', 'Не указано', 'Not specified'],
  gender: ['Jinsi', 'Пол', 'Gender'],
  male: ['Erkak', 'Мужчина', 'Male'],
  female: ['Ayol', 'Женщина', 'Female'],
  patient_card_colour_logo: ['Bemor kartasi rangi (logo)', 'Цвет карточки пациента', 'Patient card colour (logo)'],
  save: ['Saqlash', 'Сохранить', 'Save'],
  task_type: ['Vazifa turi', 'Тип задачи', 'Task type'],
  reminder_treatment: ['Davolash haqida eslatma', 'Напоминание о лечении', 'Treatment reminder'],
  reminder: ['Eslatma', 'Напоминание', 'Reminder'],
  start_execution: ['Bajarish boshlanishi', 'Начало выполнения', 'Start of execution'],
  choose_member: ['Jamoa a‘zosi', 'Член команды', 'Team member'],
  choose_service: ['Xizmat', 'Услуга', 'Service'],
  notes_word: ['Qaydlar', 'Заметки', 'Notes'],
  cancel_word: ['Bekor qilish', 'Отмена', 'Cancel'],
  save_word: ['Saqlash', 'Сохранить', 'Save'],
  stage_word: ['Bosqich', 'Этап', 'Stage'],
  unpaid: ['To‘lanmagan', 'Не оплачен', 'Unpaid'],
  add_word: ['Qo‘shish', 'Добавить', 'Add'],
  naryad_catalog_title: ['Naryadlar katalogi va narxlari', 'Прейскурант нарядов и услуг', 'Naryad & Service Catalog'],
  doctor_naryads_title: ['Shifokorlar va naryadlar', 'Врачи и наряды', 'Doctors & Naryads'],
  custom_price: ['Maxsus narx', 'Индивидуальная цена', 'Custom price'],
  commission_percent: ['Shifokor foizi (%)', 'Процент врача (%)', 'Doctor commission (%)'],
  doctor_earnings: ['Shifokor daromadi', 'Заработок врача', 'Doctor earnings'],
  assign_naryad: ['Naryad biriktirish', 'Назначить наряд', 'Assign naryad'],
  assigned_naryads: ['Biriktirilgan naryadlar', 'Назначенные наряды', 'Assigned naryads'],
  add_naryad_btn: ['Yangi naryad qo‘shish', 'Добавить наряд в каталог', 'Add naryad to catalog'],
  base_price: ['Asosiy narx', 'Базовая цена', 'Base price'],
  category: ['Toifa', 'Категория', 'Category'],
  service_name: ['Xizmat / Naryad nomi', 'Название наряда / услуги', 'Service / Naryad name'],
  earned_total: ['Topgan umumiy tushumi', 'Общая выручка врача', 'Total revenue generated'],
  doctor_payout: ['Shifokor ulushi', 'Доля врача к выплате', 'Doctor payout'],
  clinic_net: ['Klinika sof ulushi', 'Доля клиники', 'Clinic net share'],
  edit_doctor: ['Shifokor ma‘lumotlarini tahrirlash', 'Редактировать данные врача', 'Edit doctor profile'],
  per_procedure_earning: ['1 ta muolajadan shifokor oladi', 'Доход врача с 1 процедуры', 'Doctor earning per procedure'],
  lab_orders: ['Laboratoriya buyurtmalari', 'Заказы в лабораторию', 'Dental lab orders'],
  lab_technician: ['Laborant / Texnik', 'Зубной техник / Лаборант', 'Dental technician'],
  work_type: ['Konstruksiya turi', 'Тип конструкции / работы', 'Work / restoration type'],
  color_shade: ['Rang (Vita)', 'Оттенок (Vita)', 'Color shade'],
  deadline: ['Tayyor bo‘lish muddati', 'Срок готовности', 'Deadline'],
  new_order_btn: ['+ Yangi laboratoriya buyurtmasi', '+ Новый заказ в лабораторию', '+ New dental lab order'],
  print_slip: ['Chop etish (Nakladnoy)', 'Печать накладной', 'Print order slip'],
  order_status_new: ['Yangi buyurtma', 'Новый заказ', 'New order'],
  order_status_in_work: ['Jarayonda', 'В работе', 'In production'],
  order_status_ready: ['Tayyor (Klinikada)', 'Готово (В клинике)', 'Ready (In clinic)'],
  order_status_delivered: ['O‘rnatildi / Bajarildi', 'Сдано / Завершено', 'Delivered / Completed'],
  order_status_rework: ['Qayta ishlash', 'На доработку', 'Rework'],
  dur_hour_short: ['soat', 'ч.', 'h'],
  dur_min_short: ['daq.', 'мин.', 'min'],
  chair_num: ['Kreslo', 'Кресло', 'Chair'],
  select_patient_first: ['-- Bemorni tanlang --', '-- Выберите пациента --', '-- Select patient --'],
  please_select_patient: ['Iltimos, avval bemorni tanlang!', 'Пожалуйста, сначала выберите пациента!', 'Please select a patient first!'],
  no_photos_yet_prompt: ['Fotosuratlarni tekshirish uchun avval bemorni tanlang', 'Сначала выберите пациента для проверки фотографий', 'Select a patient first to check photos'],
  delete_order_confirm: ['Ushbu laboratoriya buyurtmasini o‘chirishni tasdiqlaysizmi?', 'Подтверждаете удаление этого лабораторного наряда?', 'Do you confirm deleting this lab order?'],
  period_daily: ['Kunlik', 'Ежедневно', 'Daily'],
  period_3days: ['3 kunlik', '3 дня', '3 Days'],
  period_weekly: ['Haftalik', 'Неделя', 'Weekly'],
  view_board: ['Taqvim', 'Календарь', 'Calendar'],
  view_table: ['Jadval', 'Таблица', 'Table'],
  search_lab_placeholder: ['Bemor, shifokor, naryad #, ish turi yoki tish bo‘yicha qidiruv...', 'Поиск по пациенту, врачу, наряду #, виду работы или зубам...', 'Search by patient, doctor, order #, work type, or teeth...'],
  loading_text: ['Yuklanmoqda…', 'Загрузка…', 'Loading…'],
  order_struck: ['Naryad urilgan', 'Наряд оформлен', 'Order struck'],
  appointment_status_label: ['Holat', 'Статус', 'Status'],
  delete_appointment_title: ['Qabulni o‘chirish', 'Удалить запись', 'Delete appointment'],
  cancel_1day_before: ['1 kun oldin bekor qilish', 'Отмена за 1 день', 'Cancel 1 day before'],
  confirm_delete_appointment: ['Haqiqatan ham ushbu qabulni o‘chirmoqchimisiz?', 'Вы действительно хотите удалить эту запись?', 'Are you sure you want to delete this appointment?'],
  cannot_delete_today: ['Qabul kuni o‘chirib bo‘lmaydi!', 'В день приёма запись нельзя удалить!', 'Cannot delete on appointment day!'],
  mark_as_noshow_only: ['Faqat «Kelmadi» holatiga o‘tkazish mumkin', 'Только перевод в статус «Не явился»', 'Can only be marked as No Show'],
  noshow_explanation: ['Bugun qabul kuni bo‘lgani sababli, yozuvni o‘chirish taqiqlangan. Agar bemor kelmagan bo‘lsa, «Kelmadi» holatiga o‘tkazing.', 'Так как сегодня день приёма, удаление заблокировано. Если пациент не пришёл, переведите в статус «Не явился».', 'Deletion is locked on the appointment day. If patient did not arrive, mark as No Show.'],
  move_to_noshow: ['«Kelmadi» ga o‘tkazish', 'Перевести в «Не явился»', 'Mark as No Show'],
  edit_on_day_title: ['Qabul kuni tahrirlash', 'Редактирование в день приёма', 'Editing on appointment day'],
  edit_on_day_sub: ['Qabul vaqtini o‘zgartirish 1 kun oldin tavsiya etiladi', 'Перенос времени рекомендуется за 1 день', 'Rescheduling is recommended 1 day in advance'],
  edit_on_day_text: ['Bugun qabul kuni. Agar bemor kelmagan bo‘lsa «Kelmadi» ga o‘tkazing yoki zarurat bo‘lsa tafsilotlarni tahrirlang.', 'Сегодня день приёма. Если пациент не пришёл, переведите в «Не явился» или при необходимости отредактируйте детали.', 'Today is the appointment day. Mark as No Show if absent, or edit details if needed.'],
  emp_title: ['Xodim', 'Сотрудник', 'Employee'],
  tab_general: ['Asosiy', 'Основные', 'General'],
  tab_schedule: ['Ish jadvali', 'График', 'Schedule'],
  tab_access: ['Ruxsat', 'Доступ', 'Access'],
  first_name_ph: ['Prim.: Valentin', 'Прим.: Валентин', 'Ex.: Valentin'],
  last_name_ph: ['Prim.: Ivanov', 'Прим.: Иванов', 'Ex.: Ivanov'],
  phone_primary: ['Asosiy raqam', 'Основной номер', 'Primary Phone'],
  phone_extra: ['Qo‘shimcha', 'Дополнительный', 'Secondary'],
  specialty_lbl: ['Mutaxassislik', 'Специальность', 'Specialty'],
  color_lbl: ['Rang', 'Цвет', 'Color'],
  gender_lbl: ['Jins', 'Пол', 'Gender'],
  gender_male: ['Erkak', 'Мужчина', 'Male'],
  gender_female: ['Ayol', 'Женщина', 'Female'],
  allow_auth: ['Avtorizatsiyaga ruxsat berish', 'Разрешить авторизацию', 'Allow Authorization'],
  username_lbl: ['Foydalanuvchi nomi', 'Имя пользователя', 'Username'],
  role_lbl: ['Rol', 'Роль', 'Role'],
  set_new_password: ['Yangi parol belgilash', 'Задать новый пароль', 'Set New Password'],
  naryad_sync_type: ['Naryadlar: klinika bilan birga yoki shaxsiy', 'Наряды: общие с клиникой или личные', 'Naryads: shared or personal'],
  naryad_personal_toggle: ['Shaxsiy naryadlar (o‘ziniki)', 'Личные наряды врача', 'Doctor personal naryads'],
  naryad_shared_toggle: ['Klinika bilan birga', 'Общие с клиникой', 'Shared with clinic'],
  doctor_percent_lbl: ['Shifokor ulushi (%)', 'Процент врача (%)', 'Doctor Share (%)'],
  mon: ['Dushanba', 'Понедельник', 'Monday'],
  tue: ['Seshanba', 'Вторник', 'Tuesday'],
  wed: ['Chorshanba', 'Среда', 'Wednesday'],
  thu: ['Payshanba', 'Четверг', 'Thursday'],
  fri: ['Juma', 'Пятница', 'Friday'],
  sat: ['Shanba', 'Суббота', 'Saturday'],
  sun: ['Yakshanba', 'Воскресенье', 'Sunday'],
  chair_select_lbl: ['Kabinet / Kreslo', 'Кабинет / Кресло', 'Room / Chair'],
  add_interval: ['Interval qo‘shish', 'Добавить интервал', 'Add Interval'],
  del_interval: ['O‘chirish', 'Удалить', 'Delete'],
  workplaces_tab: ['Ish o‘rinlari (kreslolar)', 'Рабочие места (кресла)', 'Workplaces & Chairs'],
  specialties_tab: ['Mutaxassisliklar', 'Специальности', 'Specialties'],
  add_workplace_btn: ['+ Ish o‘rni qo‘shish', '+ Добавить рабочее место', '+ Add Workplace'],
  add_specialty_btn: ['+ Mutaxassislik qo‘shish', '+ Добавить специальность', '+ Add Specialty'],
  workplace_name: ['Kabinet / Kreslo nomi', 'Название кабинета / кресла', 'Cabinet / Chair Name'],
  specialty_name: ['Mutaxassislik nomi', 'Название специальности', 'Specialty Name']
};

const LANG_INDEX: Record<Language, number> = { uz: 0, ru: 1, en: 2 };

// Central UI-string lookup. Add new strings to STRINGS above (single place),
// then use tk('key') in any component: const { tk } = useI18n();
export function tkey(key: string, language: Language): string {
  const entry = STRINGS[key];
  return entry ? entry[LANG_INDEX[language]] : key;
}

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
  tk: (key: string) => string;
  // Yangi markaziy tarjima: tr('warehouse.title') — lib/locales/ dagi uz/ru/en dan oladi
  tr: (key: string) => string;
  trRaw: (key: string) => any;  // massiv / obyekt qaytarish uchun (FAQ va h.k.)
}

const I18nContext = createContext<I18nContextType>({
  language: 'ru',
  setLanguage: () => {},
  t: dictionaries.ru,
  tk: (k) => tkey(k, 'ru'),
  tr: (k) => translate(k, 'ru'),
  trRaw: (k) => translateRaw(k, 'ru')
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ru');

  useEffect(() => {
    const handleSync = () => {
      try {
        const stored = localStorage.getItem('32desk_lang') as Language;
        if (stored && ['uz', 'ru', 'en'].includes(stored)) {
          setLanguageState(stored);
        }
      } catch {}
    };

    handleSync();
    window.addEventListener('storage', handleSync);
    window.addEventListener('32desk_lang_changed', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('32desk_lang_changed', handleSync);
    };
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('32desk_lang', lang);
      window.dispatchEvent(new Event('32desk_lang_changed'));
    } catch {}
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t: dictionaries[language], tk: (k: string) => tkey(k, language), tr: (k: string) => translate(k, language), trRaw: (k: string) => translateRaw(k, language) }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
