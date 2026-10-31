import { Employee, Patient, Appointment, FinancialTransaction, ClinicTask, WarehouseItem, DentalLabOrder, DashboardStats, ClinicTenant, DentalTechnician, Branch } from './types';

// ──────────────────────────────────────────────────────────────────────────
// NAMUNA (DEMO) MA'LUMOT — FAQAT demo klinika (id = 1) uchun.
// Tezkor kirish (director → texnik) shu klinikani ochadi. Yangi yaratilgan
// real klinikalar BO'SH boshlanadi (api.ts da (cid === 1) sharti shuni ta'minlaydi).
// Hajm: kichik — 1 filial, har roldan 1 xodim, 5 bemor. Telegram/SMS ULANMAGAN.
// Demo ma'lumot haftada 1 marta avtomatik tozalanadi (api.ts: maybeResetDemoData).
// ──────────────────────────────────────────────────────────────────────────

const getTodayTime = (hours: number, minutes: number) => {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
};

// 1 filial
export const mockBranches: Branch[] = [
  {
    id: 1,
    clinic: 1,
    name: 'Markaziy filial',
    address: 'Toshkent sh., Amir Temur ko‘chasi 104',
    phone: '+998 71 200 00 32',
    use_global_telegram: false,
    include_location_in_sms: false,
    is_active: true,
    doctors_count: 1,
    chairs_count: 1
  }
];

// Har roldan 1 ta xodim (director / admin / kassa / doctor) — demo login akkauntlariga mos
export const mockEmployees: Employee[] = [
  {
    id: 1,
    full_name: 'Jasur Usmonov',
    username: 'director',
    role: 'director',
    specialty: 'Direktor / Bosh shifokor',
    chair: '—',
    color: '#0F766E',
    phone: '+998 90 100 32 32',
    branch: 1,
    branch_name: 'Markaziy filial',
    is_active: true
  },
  {
    id: 2,
    full_name: 'Aziza Karimova',
    username: 'admin',
    role: 'admin',
    specialty: 'Administrator',
    chair: '—',
    color: '#2563EB',
    phone: '+998 90 200 00 02',
    branch: 1,
    branch_name: 'Markaziy filial',
    is_active: true
  },
  {
    id: 3,
    full_name: 'Dilorom Saidova',
    username: 'kassa',
    role: 'kassa',
    specialty: 'Kassir',
    chair: '—',
    color: '#9333EA',
    phone: '+998 90 300 00 03',
    branch: 1,
    branch_name: 'Markaziy filial',
    is_active: true
  },
  {
    id: 4,
    full_name: 'Sardor Alimov',
    username: 'doctor',
    role: 'doctor',
    specialty: 'Stomatolog-terapevt',
    chair: 'Kreslo 1',
    color: '#0EA5E9',
    phone: '+998 90 400 00 04',
    branch: 1,
    branch_name: 'Markaziy filial',
    is_active: true
  }
];

// 5 bemor
export const mockPatients: Patient[] = [
  { id: 1, full_name: 'Dilnoza Yusupova', phone: '+998 90 111 11 11', category_status: 'VIP', gender: 'Ayol', birth_date: '1992-05-14', balance: 0, medical_history: '', notes: '', created_at: '2026-09-01' },
  { id: 2, full_name: 'Rustam Ahmedov', phone: '+998 90 222 22 22', category_status: 'Oddiy', gender: 'Erkak', birth_date: '1988-11-03', balance: -200000, medical_history: '', notes: '', created_at: '2026-09-03' },
  { id: 3, full_name: 'Kamola Tosheva', phone: '+998 90 333 33 33', category_status: 'Oddiy', gender: 'Ayol', birth_date: '1996-02-20', balance: 0, medical_history: '', notes: '', created_at: '2026-09-07' },
  { id: 4, full_name: 'Jahongir Qodirov', phone: '+998 90 444 44 44', category_status: 'Oddiy', gender: 'Erkak', birth_date: '1979-07-12', balance: 150000, medical_history: '', notes: '', created_at: '2026-09-10' },
  { id: 5, full_name: 'Nigora Islomova', phone: '+998 90 555 55 55', category_status: 'VIP', gender: 'Ayol', birth_date: '2001-01-30', balance: 0, medical_history: '', notes: '', created_at: '2026-09-15' }
];

// Bugungi 4 ta qabul (hammasi doctor Sardor Alimov, Kreslo 1)
export const mockAppointments: Appointment[] = [
  {
    id: 1, patient: 1, patient_name: 'Dilnoza Yusupova', patient_phone: '+998 90 111 11 11',
    doctor: 4, doctor_name: 'Sardor Alimov', doctor_color: '#0EA5E9',
    start_time: getTodayTime(9, 30), end_time: getTodayTime(10, 0),
    treatment_notes: 'Birlamchi ko‘rik', sms_sent: false, status: 'confirmed', color_code: '#10B981',
    price: 150000, paid_amount: 150000, chair_name: 'Kreslo 1', branch: 1, branch_name: 'Markaziy filial'
  },
  {
    id: 2, patient: 2, patient_name: 'Rustam Ahmedov', patient_phone: '+998 90 222 22 22',
    doctor: 4, doctor_name: 'Sardor Alimov', doctor_color: '#0EA5E9',
    start_time: getTodayTime(10, 30), end_time: getTodayTime(11, 30),
    treatment_notes: 'Karies davolash 16', sms_sent: false, status: 'in_progress', color_code: '#10B981',
    price: 450000, paid_amount: 250000, chair_name: 'Kreslo 1', branch: 1, branch_name: 'Markaziy filial'
  },
  {
    id: 3, patient: 3, patient_name: 'Kamola Tosheva', patient_phone: '+998 90 333 33 33',
    doctor: 4, doctor_name: 'Sardor Alimov', doctor_color: '#0EA5E9',
    start_time: getTodayTime(12, 0), end_time: getTodayTime(12, 30),
    treatment_notes: 'Professional gigiyena', sms_sent: false, status: 'new', color_code: '#3B82F6',
    price: 300000, paid_amount: 0, chair_name: 'Kreslo 1', branch: 1, branch_name: 'Markaziy filial'
  },
  {
    id: 4, patient: 4, patient_name: 'Jahongir Qodirov', patient_phone: '+998 90 444 44 44',
    doctor: 4, doctor_name: 'Sardor Alimov', doctor_color: '#0EA5E9',
    start_time: getTodayTime(14, 0), end_time: getTodayTime(15, 0),
    treatment_notes: 'Plomba Estelite', sms_sent: false, status: 'completed', color_code: '#0D9488',
    price: 500000, paid_amount: 500000, chair_name: 'Kreslo 1', branch: 1, branch_name: 'Markaziy filial'
  }
];

export const mockTransactions: FinancialTransaction[] = [
  { id: 1, amount: 150000, type: 'income', category: 'Qabul to‘lovi', appointment: 1, patient: 1, patient_name: 'Dilnoza Yusupova', doctor: 4, doctor_name: 'Sardor Alimov', payment_method: 'Naqd', cash_register: 'cash', operator_name: 'Dilorom Saidova', branch: 1, branch_name: 'Markaziy filial', date: getTodayTime(10, 5), notes: '' },
  { id: 2, amount: 250000, type: 'income', category: 'Qabul to‘lovi', appointment: 2, patient: 2, patient_name: 'Rustam Ahmedov', doctor: 4, doctor_name: 'Sardor Alimov', payment_method: 'Karta', cash_register: 'card', operator_name: 'Dilorom Saidova', branch: 1, branch_name: 'Markaziy filial', date: getTodayTime(11, 35), notes: '' },
  { id: 3, amount: 500000, type: 'income', category: 'Qabul to‘lovi', appointment: 4, patient: 4, patient_name: 'Jahongir Qodirov', doctor: 4, doctor_name: 'Sardor Alimov', payment_method: 'Naqd', cash_register: 'cash', operator_name: 'Dilorom Saidova', branch: 1, branch_name: 'Markaziy filial', date: getTodayTime(15, 5), notes: '' }
];

export const mockTasks: ClinicTask[] = [
  { id: 1, title: 'Rustam Ahmedovga qayta qo‘ng‘iroq (16 tish davolash)', priority: 'high', status: 'pending', assignee_name: 'Aziza Karimova', patient_name: 'Rustam Ahmedov', due_date: getTodayTime(17, 0) },
  { id: 2, title: 'Anestetik zaxirasini to‘ldirish', priority: 'medium', status: 'pending', assignee_name: 'Dilorom Saidova', due_date: getTodayTime(18, 0) }
];

export const mockWarehouse: WarehouseItem[] = [
  { id: 1, name: 'Anestetik Ubistezin Forte (50 karpul)', category: 'Anesteziya', quantity: 8, unit: 'quti', min_quantity: 3, cost: 320000 },
  { id: 2, name: 'Kompozit Filtek Ultimate A2', category: 'Plomba', quantity: 14, unit: 'shprits', min_quantity: 5, cost: 280000 },
  { id: 3, name: 'Nitril qo‘lqop (M)', category: 'Sarflov', quantity: 25, unit: 'pachka', min_quantity: 10, cost: 65000 },
  { id: 4, name: 'So‘lak so‘rg‘ich (100 dona)', category: 'Sarflov', quantity: 4, unit: 'quti', min_quantity: 5, cost: 35000 },
  { id: 5, name: 'Olmos bor Mani (to‘plam)', category: 'Asboblar', quantity: 6, unit: 'to‘plam', min_quantity: 2, cost: 150000 }
];

// Demo laboratoriya buyurtmalari bo'sh — foydalanuvchi o'zi yaratib sinaydi
export const mockLabOrders: DentalLabOrder[] = [];

export const mockStats: DashboardStats = {
  today: new Date().toISOString().split('T')[0],
  total_appointments_today: 4,
  completed_today: 1,
  in_progress_today: 1,
  income_today: 900000,
  expense_today: 0,
  cash_balance: 900000,
  total_patients: 5,
  pending_tasks: 2,
  tasks_badge_count: 2,
  doctors: [
    { id: 4, name: 'Sardor Alimov', specialty: 'Stomatolog-terapevt', chair: 'Kreslo 1', appointments_count: 4 }
  ]
};

// Platformada ko'rinadigan yagona demo klinika (1 GB, Telegram/SMS ulanmagan)
export const mockClinics: ClinicTenant[] = [
  {
    id: 1,
    name: 'Dentos Demo Klinika',
    logo: '32D',
    branch: 'Toshkent sh., Amir Temur 104',
    director_name: 'Jasur Usmonov',
    phone: '+998 90 100 32 32',
    plan_tier: 'Standard',
    max_doctors: 10,
    doctors_count: 1,
    patients_count: 5,
    storage_quota_gb: 1,
    storage_used_gb: 0,
    enabled_modules: { sms: false, telegram: false, whatsapp: false, lab: true, charts_3d: true, chairs: true, commissions: false },
    linked_technicians: [1],
    status: 'active',
    created_at: '2026-09-01T09:00:00Z'
  }
];

export const mockTechnicians: DentalTechnician[] = [
  {
    id: 1,
    name: 'Alisher Karimov',
    lab_name: 'Apex Dental Lab',
    phone: '+998 90 900 00 01',
    username: 'texnik_alisher',
    password: '123456',
    is_active: true,
    linked_clinics: ['Dentos Demo Klinika'],
    price_list: [],
    created_at: '2026-09-01T09:00:00Z'
  }
];
