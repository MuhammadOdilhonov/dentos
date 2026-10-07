export interface DoctorCertificate {
  id: string;
  title: string;
  issuer: string;
  year: string;
  file_url?: string;
  preview?: string;
}

export interface DoctorDiploma {
  id: string;
  degree: string;
  institution: string;
  year: string;
  specialty: string;
  file_url?: string;
}

export type UserRole = 'superadmin' | 'director' | 'deputy_director' | 'admin' | 'doctor' | 'kassa' | 'nurse' | 'technician';

export interface Branch {
  id: number;
  clinic?: number | null;
  name: string;
  address: string;
  phone: string;
  location_url?: string;
  use_global_telegram: boolean;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  telegram_phone?: string;
  whatsapp_phone?: string;
  include_location_in_sms: boolean;
  is_active: boolean;
  doctors_count?: number;
  chairs_count?: number;
  created_at?: string;
}

export interface WorkplaceItem {
  id: number | string;
  name: string;
  color: string;
  clinic?: number | null;
  branch?: number | null;
  branch_name?: string;
  defaultDoc?: string;
  is_active?: boolean;
}

export interface SpecialtyItem {
  id: number | string;
  name: string;
  clinic?: number | null;
  is_active?: boolean;
}

export interface EmployeeScheduleInterval {
  id?: string;
  start_hour: string;
  start_min: string;
  end_hour: string;
  end_min: string;
  chair?: string;
}

export interface EmployeeDaySchedule {
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  labelUz: string;
  labelRu: string;
  labelEn: string;
  enabled: boolean;
  is_workday?: boolean;
  branch?: number | null;      // shu kuni shifokor ishlaydigan filial (filial almashinuvi uchun)
  branch_name?: string;
  intervals: EmployeeScheduleInterval[];
}

export interface Employee {
  id: number;
  full_name: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  role: UserRole;
  avatar?: string;
  chair: string;
  room?: string;
  specialty: string;
  color: string;
  phone: string;
  phone_extra?: string;
  email?: string;
  gender?: 'male' | 'female';
  salary_rate?: string | number;
  commission_rate?: number;
  experience_years?: number;
  bio?: string;
  address?: string;
  birth_date?: string;
  schedule?: string;
  schedule_details?: EmployeeDaySchedule[];
  working_hours?: string;
  assigned_chairs?: string[];
  certificates?: DoctorCertificate[];
  diplomas?: DoctorDiploma[];
  is_active: boolean;
  status?: 'active' | 'on_leave' | 'inactive';
  can_login?: boolean;
  username?: string;
  password?: string;
  naryad_type?: 'clinic' | 'personal';
  clinic?: number | null;
  branch?: number | null;
  branch_name?: string;
}

export interface TechnicianPriceItem {
  id: string;
  name: string;
  nameUz?: string;
  nameRu?: string;
  nameEn?: string;
  category: string;
  price: number;
  lead_days?: number;
  turnaround_days?: number;
  material?: string;
}

export interface DentalTechnician {
  id: number;
  name: string;
  lab_name: string;
  phone: string;
  username: string;
  password?: string;
  linked_clinics: string[];
  price_list: TechnicianPriceItem[];
  color?: string; // hex color or gradient preset
  avatar?: string; // logo or photo URL / base64
  is_active: boolean;
  created_at?: string;
}

export interface PlatformSetting {
  id?: number;
  clinic_name: string;
  plan_tier: string;
  storage_quota_gb: number;
  storage_used_gb: number;
  enabled_modules: Record<string, boolean>;
  max_doctors: number;
  updated_at?: string;
}

export interface Patient {
  id: number;
  full_name: string;
  phone: string;
  category_status: string;
  gender?: string;
  birth_date?: string;
  balance: number;
  medical_history?: string;
  notes?: string;
  avatar_color?: string;
  service_lang?: 'uz' | 'ru' | 'en'; // xizmat tili — xabar shu tilda yuboriladi
  created_at: string;
  clinic?: number | null;
  photo?: string;
  attachments?: string[];
}

export type AppointmentStatus =
  | 'new'
  | 'confirmed'
  | 'unconfirmed'
  | 'late'
  | 'arrived'
  | 'in_progress'
  | 'waiting_bill'
  | 'cancelled'
  | 'no_show'
  | 'completed'
  | 'debt'
  | 'reserved';

export interface Appointment {
  id: number;
  clinic?: number | null;
  patient: number;
  patient_name: string;
  patient_phone: string;
  patient_service_lang?: 'uz' | 'ru' | 'en';
  doctor: number;
  doctor_name: string;
  doctor_color?: string;
  start_time: string; // ISO string
  end_time: string;   // ISO string
  treatment_notes: string;
  procedure?: string;
  sms_sent: boolean;
  status: AppointmentStatus;
  color_code: string;
  price: number;
  paid_amount: number;
  chair_name: string;
  branch?: number | null;
  branch_name?: string;
  branch_address?: string;
  branch_phone?: string;
  branch_location_url?: string;
  created_at?: string;
}

// A single struck service line kept in the persisted checkout draft (per patient).
export interface NaryadDraftItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  doctor: string;
  duration?: string;
}

// Activity log entry (who / when / why) for a naryad added or removed.
export interface NaryadLogEntry {
  id: number;
  naryad_id?: string | number;
  patient_id?: number;
  patient_name?: string;
  action: 'added' | 'removed';
  status?: 'active' | 'cancelled';
  title: string;
  author: string;
  date: string;
  price: number;
  isDebt?: boolean;
  doctor?: string;
  cancelled_by?: string;
  cancelled_date?: string;
  reason?: string;
}

export interface TreatmentProcedureItem {
  id: string | number;
  title: string;
  teeth?: string;
  quantity: number;
  price: number;
  doctor?: string;
}

export interface TreatmentPlanStage {
  id: number;
  title: string;
  description: string;
  cost: number;
  status: 'Выполнено' | 'В процессе' | 'Запланировано' | 'Отменено';
  doctor: string;
  procedures: TreatmentProcedureItem[];
}


// Service / Naryad catalog item managed by the Director
export interface NaryadCatalogItem {
  id: string;
  name: string;
  category: string;
  base_price: number;
  default_percent?: number;
  description?: string;
  created_at?: string;
}

// Doctor-specific naryad assignment with custom price and commission percentage
export interface DoctorNaryadAssignment {
  id: string;
  doctor_id: number;
  naryad_id: string;
  name: string;
  category: string;
  custom_price: number;
  commission_percent: number;
  is_custom_price?: boolean; // false = standard catalog price, true = doctor-specific custom price
  notes?: string;
}

export interface FinancialTransaction {
  id: number;
  clinic?: number | null;
  appointment?: number;
  patient?: number;
  patient_name?: string;
  doctor?: number;
  doctor_name?: string;
  technician?: number;
  technician_name?: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  is_prepayment?: boolean;
  payment_method: string;
  cash_register?: 'cash' | 'terminal' | 'online' | 'bank_transfer' | string;
  operator_name?: string;
  branch?: number | null;
  branch_name?: string;
  date: string;
  notes?: string;
}

export interface ClinicTask {
  id: number;
  clinic?: number | null;
  title: string;
  description?: string;
  assignee?: number;
  assignee_name?: string;
  creator?: number;
  creator_name?: string;
  creator_role?: string;
  completed_by?: number | string;
  completed_by_name?: string;
  completed_at?: string;
  stage?: 'new' | 'in_progress' | 'review' | 'completed';
  patient?: number;
  patient_name?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed';
  due_date?: string;
  start_date?: string;
  task_type?: 'treatment' | 'reminder' | 'call' | 'general';
  service?: string;
  branch?: number | null;
  branch_name?: string;
  created_at?: string;
}

export interface WarehouseItem {
  id: number;
  clinic?: number | null;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  min_quantity: number;
  cost: number;
  updated_at?: string;
}

export interface DentalLabOrder {
  id: number;
  clinic?: number | null;
  order_number?: string;
  patient: number;
  patient_name: string;
  patient_phone?: string;
  doctor: number;
  doctor_name: string;
  technician?: number;
  technician_name: string;
  tooth_numbers: string;
  work_type: string;
  implant_system?: string;
  fixation_type?: string;
  status: string; // biriktirildi | chiqarilvoti | texnik oldi | texnik chiqarvorvoti | klinika oldi
  color_shade: string;
  shade_details?: {
    cervical?: string;
    body?: string;
    incisal?: string;
    notes?: string;
    primary?: string;
    per_tooth?: Record<string, string>;
  };
  teeth_diagnoses?: Record<string, string>;
  attached_items?: {
    slepki?: string;
    lozhka?: string;
    registrator_prikusa?: string;
    transfer_system?: string;
    transfer_count?: number;
    has_analog?: boolean;
    analog_count?: number;
    has_photo?: boolean;
    has_xray?: boolean;
    has_scan?: boolean;
    scan_zip_url?: string;
    scan_files?: Array<{ name: string; size: number }>;
    xray_zip_url?: string;
    xray_files?: Array<{ name: string; size: number }>;
  };
  tech_received_items?: {
    slepki_ok?: boolean;
    lozhka_ok?: boolean;
    registrator_ok?: boolean;
    transfer_ok?: boolean;
    analog_ok?: boolean;
    notes?: string;
    received_at?: string;
  };
  return_items?: {
    work_ready?: boolean;
    lozhka_returned?: boolean;
    transfer_returned?: boolean;
    analog_returned?: boolean;
    notes?: string;
    dispatched_at?: string;
  };
  clinic_received_items?: {
    work_ok?: boolean;
    lozhka_ok?: boolean;
    transfer_ok?: boolean;
    analog_ok?: boolean;
    received_at?: string;
    received_by?: string;
  };
  received_date?: string; // Kelgan sana (Keladi)
  due_date: string; // Ketadigan sana (Ketadi)
  primerka_date?: string;
  zdacha_date?: string;
  dispatch_status?: string; // in_lab, ready_for_dispatch, dispatched
  clinic_name?: string;
  clinic_logo?: string;
  branch?: number | null;
  branch_name?: string;
  destination_branch?: number | null;
  destination_branch_name?: string;
  doctor_branch_id?: number | null;
  doctor_branch_name?: string;
  sent_date?: string;
  completed_date?: string;
  cost: number; // Texnik belgilagan narx
  clinic_price?: number; // Klinikadagi narx
  orthopedist_wishes?: string;
  patient_wishes?: string;
  notes?: string;
  created_at?: string;
}

export interface ClinicTenant {
  id: number;
  name: string;
  logo: string;
  branch: string;
  director_name: string;
  phone: string;
  plan_tier: string;
  max_doctors: number;
  doctors_count?: number;
  patients_count?: number;
  storage_quota_gb: number;
  storage_used_gb: number;
  enabled_modules: {
    sms?: boolean;
    telegram?: boolean;
    whatsapp?: boolean;
    lab?: boolean;
    charts_3d?: boolean;
    chairs?: boolean;
    commissions?: boolean;
    [key: string]: boolean | undefined;
  };
  linked_technicians: number[];
  has_auto_reminders?: boolean;
  has_ai_agent?: boolean;
  ai_agent_settings?: any;
  status: 'active' | 'paused';
  director_email?: string;
  director_password?: string;
  credentials?: {
    email: string;
    password: string;
    role: string;
    full_name: string;
    clinic_id: number;
    clinic_name: string;
  };
  created_at?: string;
}

export interface ClinicDossierData {
  clinic: ClinicTenant;
  employees: Employee[];
  patients: Patient[];
  storage: {
    quota_gb: number;
    used_gb: number;
    free_gb: number;
    usage_percent: number;
    breakdown: {
      dicom_kt_gb: number;
      photos_gb: number;
      backups_gb: number;
    };
  };
  linked_technicians: DentalTechnician[];
  all_available_technicians: DentalTechnician[];
}

export interface DashboardStats {
  today: string;
  total_appointments_today: number;
  completed_today: number;
  in_progress_today: number;
  income_today: number;
  expense_today: number;
  cash_balance: number;
  total_patients: number;
  pending_tasks: number;
  tasks_badge_count: number;
  doctors: {
    id: number;
    name: string;
    specialty: string;
    avatar?: string;
    chair: string;
    appointments_count: number;
  }[];
}
