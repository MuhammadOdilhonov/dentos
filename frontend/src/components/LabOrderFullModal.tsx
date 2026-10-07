import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DentalLabOrder, Employee, Patient, DentalTechnician, TechnicianPriceItem, Branch } from '../lib/types';
import { clinicApi } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import LabOrderReceiptModal from './LabOrderReceiptModal';
import { filterImplantSystems, ImplantSystemItem, DEDUPED_IMPLANT_SYSTEMS } from '../lib/implantSystems';
import {
  X,
  Printer,
  Save,
  CheckCircle2,
  Clock,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Phone,
  User,
  Stethoscope,
  Wrench,
  Camera,
  FileScan,
  AlertCircle,
  Package,
  Calendar,
  CheckSquare,
  Square,
  ShieldCheck,
  Building2,
  Check,
  FileText,
  Eye,
  Edit3,
  Plus,
  RotateCcw,
  Boxes,
  Truck,
  Inbox,
  Lock,
  Upload,
  Image as ImageIcon,
  DollarSign,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  QrCode,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Trash2,
  Download,
  HardDrive,
  MapPin
} from 'lucide-react';
import Dental3DScanViewerModal from './Dental3DScanViewerModal';
import DentalRentgenViewerModal from './DentalRentgenViewerModal';
import { dentalMediaStore } from '../lib/dentalMediaStore';

interface LabOrderFullModalProps {
  isOpen: boolean;
  onClose: () => void;
  order?: DentalLabOrder | null;
  onSaved?: (order: DentalLabOrder) => void;
  initialPatientId?: number;
  initialDoctorId?: number;
  initialTechnicianId?: number;
  initialDate?: string;
  mode?: 'view' | 'edit' | 'create';
  isTechnicianView?: boolean;
}

export const WORK_TYPES = [
  'Sirkoniya qoplama',
  'Metall-keramika',
  'E-max vinir',
  'Implant abutmenti',
  'PMMA vaqtinchalik',
  'Wax-Up diagnostika',
  'Byugel protez'
];

export const VITA_SHADES = [
  { code: 'BL1', hex: '#FAF9F5', text: 'text-slate-800', name: 'Bleach 1' },
  { code: 'BL2', hex: '#F6F4ED', text: 'text-slate-800', name: 'Bleach 2' },
  { code: 'BL3', hex: '#F2EDE0', text: 'text-slate-800', name: 'Bleach 3' },
  { code: 'BL4', hex: '#ECE5D4', text: 'text-slate-800', name: 'Bleach 4' },
  { code: 'A1',  hex: '#F4EFE3', text: 'text-slate-800', name: 'A1' },
  { code: 'A2',  hex: '#EAD7BA', text: 'text-slate-800', name: 'A2' },
  { code: 'A3',  hex: '#DFC699', text: 'text-slate-900', name: 'A3' },
  { code: 'A3.5',hex: '#D5B682', text: 'text-slate-900', name: 'A3.5' },
  { code: 'A4',  hex: '#C39E67', text: 'text-white',     name: 'A4' },
  { code: 'B1',  hex: '#F3ECDA', text: 'text-slate-800', name: 'B1' },
  { code: 'B2',  hex: '#E8D7AF', text: 'text-slate-800', name: 'B2' },
  { code: 'B3',  hex: '#DBC38E', text: 'text-slate-900', name: 'B3' },
  { code: 'B4',  hex: '#CDAF72', text: 'text-white',     name: 'B4' },
  { code: 'C1',  hex: '#E8E1CE', text: 'text-slate-800', name: 'C1' },
  { code: 'C2',  hex: '#DCD1B7', text: 'text-slate-800', name: 'C2' },
  { code: 'C3',  hex: '#CABA9B', text: 'text-slate-900', name: 'C3' },
  { code: 'C4',  hex: '#B7A381', text: 'text-white',     name: 'C4' },
  { code: 'D2',  hex: '#E6DCC6', text: 'text-slate-800', name: 'D2' },
  { code: 'D3',  hex: '#D6C3A3', text: 'text-slate-900', name: 'D3' },
  { code: 'D4',  hex: '#C4AE8B', text: 'text-white',     name: 'D4' }
];

export interface DiagnosisOption {
  key: string;
  labelUz: string;
  labelRu: string;
  labelEn: string;
  color: string;
  bg: string;
}

export const TOOTH_DIAGNOSES: DiagnosisOption[] = [
  { key: 'crown',   labelUz: 'Qoplama (Koronka)', labelRu: 'Коронка',             labelEn: 'Crown',   color: '#F59E0B', bg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300' },
  { key: 'implant', labelUz: 'Implantat',         labelRu: 'Имплантат',           labelEn: 'Implant', color: '#8B5CF6', bg: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300' },
  { key: 'veneer',  labelUz: 'Vinir',             labelRu: 'Винир',               labelEn: 'Veneer',  color: '#06B6D4', bg: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-300' },
  { key: 'filling', labelUz: 'Plomba',            labelRu: 'Пломба',              labelEn: 'Filling', color: '#0EA5E9', bg: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-300' },
  { key: 'caries',  labelUz: 'Karies',            labelRu: 'Кариес',              labelEn: 'Caries',  color: '#F43F5E', bg: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300' },
  { key: 'missing', labelUz: 'Yo‘q',              labelRu: 'Отсутствует',         labelEn: 'Missing', color: '#94A3B8', bg: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-400' },
  { key: 'healthy', labelUz: 'Sog‘lom',           labelRu: 'Здоровый',            labelEn: 'Healthy', color: '#10B981', bg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300' }
];

export const UPPER_TEETH = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'];
export const LOWER_TEETH = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'];

export const LAB_STATUS_CHAIN = [
  { key: 'biriktirildi', label: '1. Biriktirildi', labelUz: '1. Biriktirildi', labelRu: '1. Прикреплен', labelEn: '1. Assigned', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300' },
  { key: 'chiqarilvoti', label: '2. Chiqarilmoqda', labelUz: '2. Chiqarilmoqda', labelRu: '2. Отправляется', labelEn: '2. In Transit', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300' },
  { key: 'texnik oldi', label: '3. Texnik oldi', labelUz: '3. Texnik oldi', labelRu: '3. Принят техником', labelEn: '3. Received by Tech', color: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300' },
  { key: 'texnik chiqarvorvoti', label: '4. Texnik yubordi', labelUz: '4. Texnik yubordi', labelRu: '4. Отправлен техником', labelEn: '4. Dispatched by Tech', color: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border-orange-300' },
  { key: 'klinika oldi', label: '5. Qabul qilindi', labelUz: '5. Qabul qilindi', labelRu: '5. Завершён', labelEn: '5. Completed', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300' }
];

export function getStatusBadge(statusKey: string, lang: 'uz' | 'ru' | 'en' = 'uz') {
  const map: Record<string, { labelUz: string; labelRu: string; labelEn: string; color: string }> = {
    biriktirildi: {
      labelUz: '1. Biriktirildi',
      labelRu: '1. Прикреплен',
      labelEn: '1. Assigned',
      color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300'
    },
    chiqarilvoti: {
      labelUz: '2. Chiqarilmoqda',
      labelRu: '2. Отправляется',
      labelEn: '2. In Transit',
      color: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300'
    },
    'texnik oldi': {
      labelUz: '3. Texnik oldi',
      labelRu: '3. Принят техником',
      labelEn: '3. Received by Tech',
      color: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300'
    },
    'texnik chiqarvorvoti': {
      labelUz: '4. Texnik yubordi',
      labelRu: '4. Отправлен техником',
      labelEn: '4. Dispatched by Tech',
      color: 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border-orange-300'
    },
    'klinika oldi': {
      labelUz: '5. Qabul qilindi',
      labelRu: '5. Завершен / Принят',
      labelEn: '5. Completed / Delivered',
      color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300'
    }
  };

  const item = map[statusKey] || {
    labelUz: statusKey || 'Noma‘lum',
    labelRu: statusKey || 'Неизвестно',
    labelEn: statusKey || 'Unknown',
    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300'
  };

  return {
    label: lang === 'ru' ? item.labelRu : lang === 'en' ? item.labelEn : item.labelUz,
    color: item.color
  };
}

function ToothGlyph({ color, missing, flip, sizeClass = 'w-6 h-7' }: { color: string; missing?: boolean; flip?: boolean; sizeClass?: string }) {
  if (missing) {
    return (
      <div className={`${sizeClass} flex items-center justify-center font-bold text-slate-400 text-xs`}>
        ✕
      </div>
    );
  }
  return (
    <svg
      viewBox="0 0 24 28"
      className={`${sizeClass} transition-transform ${flip ? 'rotate-180' : ''}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 3C4 5 3 9 3 14C3 20 5 26 8 26C10 26 10 20 12 20C14 20 14 26 16 26C19 26 21 20 21 14C21 9 20 5 18 3C16 1 14 1 12 2C10 1 8 1 6 3Z"
        fill={color}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="text-slate-400 dark:text-slate-500"
      />
      <path
        d="M9 7C9.5 8.5 10.5 9.5 12 9.5C13.5 9.5 14.5 8.5 15 7"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        className="text-white/60 dark:text-black/30"
      />
    </svg>
  );
}

export default function LabOrderFullModal({
  isOpen,
  onClose,
  order,
  onSaved,
  initialPatientId,
  initialDoctorId,
  initialTechnicianId,
  initialDate,
  mode = 'edit',
  isTechnicianView = false
}: LabOrderFullModalProps) {
  const { language, tr } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const isTechReadOnly = Boolean(isTechnicianView || user?.role === 'technician');

  // Multi-language helper: guarantees ZERO Russian when language is uz or en!

  // State
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [technicians, setTechnicians] = useState<DentalTechnician[]>([]);
  const [loadingMeta, setLoadingMeta] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Sub-modals
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [orderForReceipt, setOrderForReceipt] = useState<DentalLabOrder | null>(null);
  const [statusExchangeModalOpen, setStatusExchangeModalOpen] = useState(false);
  const [targetStatusToConfirm, setTargetStatusToConfirm] = useState<string>('chiqarilvoti');

  // Tooth selection & centered modal
  const [centeredToothModalOpen, setCenteredToothModalOpen] = useState(false);
  const [toothSelectionMode, setToothSelectionMode] = useState<'all' | 'individual'>('all');
  const [activeTooth, setActiveTooth] = useState<string>('16');
  const [batchSelectedTeeth, setBatchSelectedTeeth] = useState<string[]>([]);
  const multiDebounceTimerRef = useRef<any>(null);

  // Full-window cascading vertical photo viewer
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);

  // 3D Scan & Rentgen view modal states
  const [isScanViewerModalOpen, setIsScanViewerModalOpen] = useState(false);
  const [isRentgenViewerModalOpen, setIsRentgenViewerModalOpen] = useState(false);

  // Form Fields
  const [orderNumber, setOrderNumber] = useState<string>(order?.order_number || `LAB-${Math.floor(1000 + Math.random() * 9000)}`);
  const [selectedPatientId, setSelectedPatientId] = useState<number>(order?.patient || initialPatientId || 0);
  const [patientName, setPatientName] = useState<string>(order?.patient_name || '');
  const [patientPhone, setPatientPhone] = useState<string>(order?.patient_phone || '');
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<number>(order?.doctor || initialDoctorId || 0);
  const [doctorName, setDoctorName] = useState<string>(order?.doctor_name || '');
  const [selectedTechId, setSelectedTechId] = useState<number>(order?.technician || initialTechnicianId || 0);
  const [technicianName, setTechnicianName] = useState<string>(order?.technician_name || '');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number>(order?.branch || 1);
  const [selectedBranchName, setSelectedBranchName] = useState<string>(order?.branch_name || 'Toshkent Markaziy');
  const [selectedDestBranchId, setSelectedDestBranchId] = useState<number>(order?.destination_branch || order?.branch || 1);
  const [selectedDestBranchName, setSelectedDestBranchName] = useState<string>(order?.destination_branch_name || order?.branch_name || 'Toshkent Markaziy');

  const [workTypes, setWorkTypes] = useState<string[]>(
    order?.work_type ? order.work_type.split(',').map(s => s.trim()) : ['Sirkoniya qoplama']
  );
  const [implantSystem, setImplantSystem] = useState<string>(order?.implant_system || '');
  const [fixationType, setFixationType] = useState<string>(order?.fixation_type || 'Vintli');
  const [implantSearchQuery, setImplantSearchQuery] = useState<string>(order?.implant_system || '');
  const [isImplantDropdownOpen, setIsImplantDropdownOpen] = useState<boolean>(false);
  const implantContainerRef = useRef<HTMLDivElement>(null);

  // Teeth: INITIAL IS EMPTY FOR NEW ORDERS (as explicitly requested: "birinchi yaratvokanda tish bergilagnan bo'lmasin")
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>(
    order?.tooth_numbers ? order.tooth_numbers.split(',').map(s => s.trim()).filter(Boolean) : []
  );
  const [primaryShade, setPrimaryShade] = useState<string>(order?.color_shade || 'A2');
  const [toothShades, setToothShades] = useState<Record<string, string>>(order?.shade_details?.per_tooth || {});
  const [toothDiagnoses, setToothDiagnoses] = useState<Record<string, string>>(order?.teeth_diagnoses || {});

  // Modal active diagnosis / shade staging (prevents premature overwriting)
  const [modalStagingDiag, setModalStagingDiag] = useState<string>('crown');
  const [modalStagingShade, setModalStagingShade] = useState<string>('A2');

  // Attached items (Image 2: Slepok, Lozhka, Registrator, Transfer, Analog)
  const [slepkiChoices, setSlepkiChoices] = useState<string[]>(() => {
    const raw = order?.attached_items?.slepki || 'C-silikon';
    const arr: string[] = [];
    if (raw.toLowerCase().includes('a-silikon') || raw.toLowerCase().includes('а-силикон')) arr.push('A-silikon');
    if (raw.toLowerCase().includes('c-silikon') || raw.toLowerCase().includes('с-силикон')) arr.push('C-silikon');
    return arr.length ? arr : ['C-silikon'];
  });

  const [lozhkaType, setLozhkaType] = useState<'metal' | 'plastik' | 'none'>(() => {
    const raw = (order?.attached_items?.lozhka || '').toLowerCase();
    if (raw.includes('metal') || raw.includes('метал')) return 'metal';
    if (raw.includes('plast') || raw.includes('пласт')) return 'plastik';
    if (raw.includes('yo‘q') || raw.includes('нет') || raw.includes('none')) return 'none';
    return 'metal';
  });
  const [lozhkaCount, setLozhkaCount] = useState<number>(() => {
    const raw = order?.attached_items?.lozhka || '';
    const match = raw.match(/(\d+)/);
    return match ? Number(match[1]) : 1;
  });

  const [hasRegistrator, setHasRegistrator] = useState<boolean>(() => {
    const raw = (order?.attached_items?.registrator_prikusa || '').toLowerCase();
    if (raw.includes('yo‘q') || raw.includes('нет') || raw.includes('false') || raw === 'no') return false;
    return true;
  });

  const [transferSystem, setTransferSystem] = useState<string>(() => {
    return (order?.attached_items as any)?.transfer_system || order?.implant_system || 'AnyOne';
  });
  const [transferCount, setTransferCount] = useState<number>(order?.attached_items?.transfer_count ?? 1);

  const [hasAnalog, setHasAnalog] = useState<boolean>(() => {
    const c = order?.attached_items?.analog_count;
    return c !== undefined ? c > 0 : true;
  });
  const [analogCount, setAnalogCount] = useState<number>(order?.attached_items?.analog_count ?? 1);

  // Tech received confirmation
  const [techSlepkiOk, setTechSlepkiOk] = useState<boolean>(order?.tech_received_items?.slepki_ok ?? true);
  const [techLozhkaOk, setTechLozhkaOk] = useState<boolean>(order?.tech_received_items?.lozhka_ok ?? true);
  const [techRegistratorOk, setTechRegistratorOk] = useState<boolean>(order?.tech_received_items?.registrator_ok ?? true);
  const [techTransferOk, setTechTransferOk] = useState<boolean>(order?.tech_received_items?.transfer_ok ?? true);
  const [techAnalogOk, setTechAnalogOk] = useState<boolean>(order?.tech_received_items?.analog_ok ?? true);

  // Return items
  const [returnLozhka, setReturnLozhka] = useState<boolean>(order?.return_items?.lozhka_returned ?? true);
  const [returnTransfer, setReturnTransfer] = useState<boolean>(order?.return_items?.transfer_returned ?? true);
  const [returnAnalog, setReturnAnalog] = useState<boolean>(order?.return_items?.analog_returned ?? true);
  const [returnReady, setReturnReady] = useState<boolean>(order?.return_items?.work_ready ?? true);
  const [returnNotes, setReturnNotes] = useState<string>(order?.return_items?.notes ?? '');

  // Clinic received verification
  const [clinicLozhkaOk, setClinicLozhkaOk] = useState<boolean>(order?.clinic_received_items?.lozhka_ok ?? true);
  const [clinicTransferOk, setClinicTransferOk] = useState<boolean>(order?.clinic_received_items?.transfer_ok ?? true);
  const [clinicAnalogOk, setClinicAnalogOk] = useState<boolean>(order?.clinic_received_items?.analog_ok ?? true);
  const [clinicWorkOk, setClinicWorkOk] = useState<boolean>(order?.clinic_received_items?.work_ok ?? true);

  // Media flags & attachments
  const [hasPhoto, setHasPhoto] = useState<boolean>(order?.attached_items?.has_photo ?? true);
  const [hasXray, setHasXray] = useState<boolean>(order?.attached_items?.has_xray ?? true);
  const [hasScan, setHasScan] = useState<boolean>(order?.attached_items?.has_scan ?? false);
  const [allowXrayToTech, setAllowXrayToTech] = useState<boolean>(true);
  const [allowScanToTech, setAllowScanToTech] = useState<boolean>(true);
  const [patientScanMeta, setPatientScanMeta] = useState<{ fileName?: string; sizeMb?: string } | null>(null);
  const [patientRentgenMeta, setPatientRentgenMeta] = useState<{ fileName?: string; sizeMb?: string; isZip?: boolean } | null>(null);

  // Dates
  const [primerkaDate, setPrimerkaDate] = useState<string>(order?.primerka_date || '');
  const [zdachaDate, setZdachaDate] = useState<string>(order?.zdacha_date || initialDate || '');
  const [receivedDate, setReceivedDate] = useState<string>(order?.received_date || '');
  const [dueDate, setDueDate] = useState<string>(order?.due_date || '');

  // Pricing & Wishes
  const [techCost, setTechCost] = useState<number>(order?.cost || 350000);
  const [clinicPrice, setClinicPrice] = useState<number>(order?.clinic_price || 1200000);
  const [showDoctorPrivateCost, setShowDoctorPrivateCost] = useState<boolean>(false);
  const [selectedTechServiceIds, setSelectedTechServiceIds] = useState<string[]>([]);

  const [orthopedistWishes, setOrthopedistWishes] = useState<string>(order?.orthopedist_wishes || '');
  const [patientWishes, setPatientWishes] = useState<string>(order?.patient_wishes || '');
  const [status, setStatus] = useState<string>(order?.status || 'biriktirildi');

  // Load Meta
  useEffect(() => {
    async function loadMeta() {
      setLoadingMeta(true);
      try {
        const [docs, pats, techs, brs] = await Promise.all([
          clinicApi.getEmployees(),
          clinicApi.getPatients(),
          clinicApi.getTechnicians(),
          clinicApi.getBranches()
        ]);
        setEmployees(docs);
        setPatients(pats);
        setTechnicians(techs);
        setBranches(brs);

        if (order) {
          setSelectedPatientId(order.patient ?? 0);
          setPatientName(order.patient_name || '');
          setPatientPhone(order.patient_phone || '');
          setSelectedDoctorId(order.doctor);
          setDoctorName(order.doctor_name || '');
          setSelectedTechId(order.technician || 0);
          setTechnicianName(order.technician_name || '');
          if (order.branch) setSelectedBranchId(order.branch);
          if (order.branch_name) setSelectedBranchName(order.branch_name);
          if (order.destination_branch) setSelectedDestBranchId(order.destination_branch);
          if (order.destination_branch_name) setSelectedDestBranchName(order.destination_branch_name);
          setOrderNumber(order.order_number || `LAB-${order.id}`);
          if (order.work_type) setWorkTypes(order.work_type.split(',').map(s => s.trim()));
          if (order.tooth_numbers) {
            setSelectedTeeth(order.tooth_numbers.split(',').map(s => s.trim()).filter(Boolean));
          }
          if (order.color_shade) setPrimaryShade(order.color_shade);
          if (order.shade_details?.per_tooth) setToothShades(order.shade_details.per_tooth);
          if (order.teeth_diagnoses) setToothDiagnoses(order.teeth_diagnoses);
          setImplantSystem(order.implant_system || '');
          setFixationType(order.fixation_type || 'Vintli');
          setPrimerkaDate(order.primerka_date || '');
          setZdachaDate(order.zdacha_date || '');
          setReceivedDate(order.received_date || '');
          setDueDate(order.due_date || '');
          setTechCost(Number(order.cost) || 0);
          setClinicPrice(Number(order.clinic_price) || 0);
          setStatus(order.status || 'biriktirildi');
          setOrthopedistWishes(order.orthopedist_wishes || '');
          setPatientWishes(order.patient_wishes || '');
        } else {
          if (initialPatientId) {
            const p = pats.find(x => x.id === initialPatientId);
            if (p) {
              setSelectedPatientId(p.id);
              setPatientName(p.full_name);
              setPatientPhone(p.phone);
            }
          } else {
            setSelectedPatientId(0);
            setPatientName('');
            setPatientPhone('');
          }

          let activeDoc = null;
          if (initialDoctorId) {
            const d = docs.find(x => x.id === initialDoctorId);
            if (d) {
              setSelectedDoctorId(d.id);
              setDoctorName(d.full_name);
              activeDoc = d;
            }
          } else if (docs.length > 0) {
            setSelectedDoctorId(docs[0].id);
            setDoctorName(docs[0].full_name);
            activeDoc = docs[0];
          }

          // Auto-select doctor's branch
          if (activeDoc?.branch) {
            setSelectedBranchId(activeDoc.branch);
            const b = brs.find(x => x.id === activeDoc?.branch);
            if (b) {
              setSelectedBranchName(b.name);
              setSelectedDestBranchId(b.id);
              setSelectedDestBranchName(b.name);
            }
          } else if (brs.length > 0) {
            setSelectedBranchId(brs[0].id);
            setSelectedBranchName(brs[0].name);
            setSelectedDestBranchId(brs[0].id);
            setSelectedDestBranchName(brs[0].name);
          }

          if (initialTechnicianId) {
            const t = techs.find(x => x.id === initialTechnicianId);
            if (t) {
              setSelectedTechId(t.id);
              setTechnicianName(t.name);
            }
          } else if (techs.length > 0) {
            setSelectedTechId(techs[0].id);
            setTechnicianName(techs[0].name);
          }

          if (initialDate) {
            setZdachaDate(initialDate);
            setDueDate(initialDate);
          }
        }
      } catch (err) {
        console.error('Meta loading error:', err);
      } finally {
        setLoadingMeta(false);
      }
    }

    if (isOpen) {
      loadMeta();
    }
  }, [isOpen, order, initialPatientId, initialDoctorId, initialTechnicianId, initialDate]);

  // Click outside to close implant dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (implantContainerRef.current && !implantContainerRef.current.contains(e.target as Node)) {
        setIsImplantDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check real binary media in IndexedDB for patient and order
  useEffect(() => {
    async function checkMedia() {
      const pid = selectedPatientId || order?.patient;
      const oid = order?.id;
      if (pid || oid) {
        let scan = null;
        let xray = null;
        if (oid) {
          scan = await dentalMediaStore.getScan(`order_${oid}`);
          xray = await dentalMediaStore.getRentgen(`order_${oid}`);
        }
        if (!scan && pid) {
          scan = await dentalMediaStore.getScan(pid);
        }
        if (!xray && pid) {
          xray = await dentalMediaStore.getRentgen(pid);
        }

        if (scan) {
          setHasScan(true);
          setPatientScanMeta({
            fileName: scan.fileName,
            sizeMb: (scan.fileSize / (1024 * 1024)).toFixed(1)
          });
        } else {
          setPatientScanMeta(null);
        }

        if (xray) {
          setHasXray(true);
          setPatientRentgenMeta({
            fileName: xray.fileName,
            sizeMb: (xray.fileSize / (1024 * 1024)).toFixed(1),
            isZip: xray.isZip
          });
        } else {
          setPatientRentgenMeta(null);
        }
      } else {
        setPatientScanMeta(null);
        setPatientRentgenMeta(null);
      }
    }
    if (isOpen) {
      checkMedia();
    }
  }, [isOpen, selectedPatientId, order?.patient, order?.id]);

  // Filtered implant systems by search query and active language
  const filteredImplants = useMemo(() => {
    return filterImplantSystems(implantSearchQuery || implantSystem, language as any);
  }, [implantSearchQuery, implantSystem, language]);

  // Automatically check 3D scan when selected patient changes
  useEffect(() => {
    if (selectedPatientId && selectedPatientId > 0) {
      const scanData = clinicApi.getPatient3DScan(selectedPatientId);
      if (scanData && scanData.hasScan) {
        setHasScan(true);
      }
    }
  }, [selectedPatientId]);

  // Find active technician's price catalog
  const activeTechObj = useMemo(() => {
    return technicians.find(t => t.id === selectedTechId) || technicians[0] || null;
  }, [technicians, selectedTechId]);

  const currentTechPriceList: TechnicianPriceItem[] = useMemo(() => {
    if (activeTechObj && activeTechObj.price_list && activeTechObj.price_list.length > 0) {
      return activeTechObj.price_list;
    }
    return [
      { id: 'p-1', nameUz: 'Sirkoniya qoplama (Prettau Multi-layer)', nameRu: 'Диоксид циркония (Prettau Multi-layer)', nameEn: 'Zirconia crown (Prettau Multi-layer)', name: 'Sirkoniya qoplama', category: 'Цирконий', price: 350000, lead_days: 3 },
      { id: 'p-2', nameUz: 'E-max Press vinir / qoplama', nameRu: 'E-max Press винир / коронка', nameEn: 'E-max Press veneer / crown', name: 'E-max Press vinir', category: 'Эстетика', price: 450000, lead_days: 4 },
      { id: 'p-3', nameUz: 'Metall-keramika qoplama (Ivoclar)', nameRu: 'Металлокерамическая коронка (Ivoclar)', nameEn: 'Metal-ceramic crown (Ivoclar)', name: 'Metall-keramika qoplama', category: 'Металлокерамика', price: 250000, lead_days: 2 },
      { id: 'p-4', nameUz: 'Implant individual abutmenti CAD/CAM', nameRu: 'Индивидуальный абатмент CAD/CAM', nameEn: 'Custom implant abutment CAD/CAM', name: 'Implant abutmenti', category: 'Имплантология', price: 350000, lead_days: 2 },
      { id: 'p-5', nameUz: 'PMMA vaqtinchalik qoplama', nameRu: 'Временная коронка PMMA', nameEn: 'PMMA temporary crown', name: 'PMMA vaqtinchalik', category: 'Временные', price: 120000, lead_days: 1 },
      { id: 'p-6', nameUz: 'Wax-Up diagnostik modellashtirish', nameRu: 'Диагностическое моделирование Wax-Up', nameEn: 'Diagnostic Wax-Up', name: 'Wax-Up diagnostika', category: 'Диагностика', price: 90000, lead_days: 2 },
      { id: 'p-7', nameUz: 'Byugel protez (Qulflar bilan)', nameRu: 'Бюгельный протез (на замках)', nameEn: 'Clasp / attachment partial denture', name: 'Byugel protez', category: 'Съемные', price: 1500000, lead_days: 5 },
      { id: 'p-8', nameUz: 'Individual lozhka', nameRu: 'Индивидуальная ложка', nameEn: 'Custom impression tray', name: 'Individual lozhka', category: 'Вспомогательные', price: 90000, lead_days: 1 },
      { id: 'p-9', nameUz: 'Registrator prikusa (Mumli valik)', nameRu: 'Регистратор прикуса (восковой валик)', nameEn: 'Bite registration rim', name: 'Registrator prikusa', category: 'Вспомогательные', price: 80000, lead_days: 1 }
    ];
  }, [activeTechObj]);

  // Helper for localized service name
  const getServiceName = (item: TechnicianPriceItem): string => {
    if (language === 'uz') return item.nameUz || item.name;
    if (language === 'en') return item.nameEn || item.nameUz || item.name;
    return item.nameRu || item.name;
  };

  // Comprehensive photo resolver for patient (reads profile photo, attachments, Word photo doc, and x-rays)
  const patientPhotos = useMemo(() => {
    const photos: string[] = [];
    const pid = selectedPatientId || order?.patient || 0;
    if (!pid) return photos;

    const currentPatient: any = patients.find(p => p.id === pid);

    // 1. Check patient model fields (photo, attachments)
    if (currentPatient) {
      if (currentPatient.photo && typeof currentPatient.photo === 'string' && currentPatient.photo.trim()) {
        photos.push(currentPatient.photo.trim());
      }
      if (Array.isArray(currentPatient.attachments)) {
        currentPatient.attachments.forEach((att: any) => {
          if (att && typeof att === 'string' && att.trim() && !photos.includes(att.trim())) {
            photos.push(att.trim());
          }
        });
      }
    }

    // 2. Check Photo Document blocks from localStorage ('Foto' tab in patient profile)
    try {
      const photoDoc = clinicApi.getPatientPhotoDoc(pid);
      if (Array.isArray(photoDoc)) {
        photoDoc.forEach((block: any) => {
          if (block && block.kind === 'image' && block.url && typeof block.url === 'string' && !photos.includes(block.url)) {
            photos.push(block.url);
          }
        });
      }
    } catch (err) {
      console.error('Error fetching patient photo doc:', err);
    }

    // 3. Check X-Ray images from localStorage ('Rentgen' tab in patient profile)
    try {
      const xrays = clinicApi.getPatientXrays(pid);
      if (Array.isArray(xrays)) {
        xrays.forEach((xray: any) => {
          if (xray && xray.imageUrl && typeof xray.imageUrl === 'string' && !photos.includes(xray.imageUrl)) {
            photos.push(xray.imageUrl);
          }
        });
      }
    } catch (err) {
      console.error('Error fetching patient xrays:', err);
    }

    // 4. Check direct patient photos key if stored
    if (typeof window !== 'undefined') {
      try {
        const directPhotos = localStorage.getItem(`32desk_patient_${pid}_photos`);
        if (directPhotos) {
          const parsed = JSON.parse(directPhotos);
          if (Array.isArray(parsed)) {
            parsed.forEach((p: string) => {
              if (p && typeof p === 'string' && !photos.includes(p)) {
                photos.push(p);
              }
            });
          }
        }
      } catch {}
    }

    // 5. Check order photos if already attached
    if ((order as any)?.photos && Array.isArray((order as any).photos)) {
      (order as any).photos.forEach((ph: any) => {
        if (ph && typeof ph === 'string' && !photos.includes(ph)) {
          photos.push(ph);
        }
      });
    }

    // 6. Check recently uploaded photos in this session
    uploadedPhotos.forEach(p => {
      if (p && typeof p === 'string' && !photos.includes(p)) {
        photos.push(p);
      }
    });

    return photos;
  }, [patients, selectedPatientId, order, uploadedPhotos]);

  // Handle direct photo upload inside the lab order modal
  const handleQuickPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPatientId) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        try {
          const key = `32desk_patient_${selectedPatientId}_photos`;
          const existing = JSON.parse(localStorage.getItem(key) || '[]');
          existing.push(dataUrl);
          localStorage.setItem(key, JSON.stringify(existing));
          setUploadedPhotos(prev => [...prev, dataUrl]);
          setHasPhoto(true);
        } catch (err) {
          console.error('Error saving uploaded photo:', err);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // Automatically update hasPhoto whenever photos are found for the selected patient
  useEffect(() => {
    if (patientPhotos.length > 0) {
      setHasPhoto(true);
    }
  }, [patientPhotos]);

  // Masked phone for technician privacy
  const maskedPhone = useMemo(() => {
    if (!patientPhone) return tr('labfull.notSpecified');
    if (!isTechReadOnly) return patientPhone;
    // Mask technician view: e.g. +998 90 *** ** 45
    const clean = patientPhone.replace(/\s+/g, '');
    if (clean.length >= 7) {
      return `${clean.slice(0, 7)} *** ** ${clean.slice(-2)}`;
    }
    return '*** ** **';
  }, [patientPhone, isTechReadOnly]);

  // Service toggle logic (Prices hidden on buttons in front of patient!)
  const handleToggleTechService = (serviceId: string) => {
    if (isTechReadOnly) return;
    let updatedIds: string[];
    if (selectedTechServiceIds.includes(serviceId)) {
      updatedIds = selectedTechServiceIds.filter(id => id !== serviceId);
    } else {
      updatedIds = [...selectedTechServiceIds, serviceId];
    }
    setSelectedTechServiceIds(updatedIds);

    // Update workTypes names
    const chosenServices = currentTechPriceList.filter(s => updatedIds.includes(s.id));
    const chosenNames = chosenServices.map(s => getServiceName(s));
    setWorkTypes(chosenNames.length ? chosenNames : ['Sirkoniya qoplama']);

    // Calculate total cost: sum of prices * teeth count
    const toothCount = selectedTeeth.length || 1;
    const sumUnitPrice = chosenServices.reduce((acc, curr) => acc + (curr.price || 0), 0);
    setTechCost(sumUnitPrice * toothCount);
  };

  // ════════ TOOTH CLICK LOGIC (SINGLE vs MULTI BATCH) ════════
  const handleToothClick = (num: string) => {
    if (isTechReadOnly) {
      setActiveTooth(num);
      setModalStagingDiag(toothDiagnoses[num] || 'crown');
      setModalStagingShade(toothShades[num] || primaryShade);
      setCenteredToothModalOpen(true);
      return;
    }

    if (toothSelectionMode === 'individual') {
      // Bittadan tanlash: bir zumda markaziy modal ochiladi
      setActiveTooth(num);
      setModalStagingDiag(toothDiagnoses[num] || 'crown');
      setModalStagingShade(toothShades[num] || primaryShade);
      setCenteredToothModalOpen(true);
    } else {
      // Barchasiga bir xil: tishlar tanlanadi, 3 soniyadan keyin modal ochiladi
      setActiveTooth(num);
      setBatchSelectedTeeth(prev => {
        const exists = prev.includes(num);
        const updated = exists ? prev.filter(t => t !== num) : [...prev, num];

        if (multiDebounceTimerRef.current) {
          clearTimeout(multiDebounceTimerRef.current);
        }

        if (updated.length > 0) {
          multiDebounceTimerRef.current = setTimeout(() => {
            setModalStagingShade(primaryShade);
            setCenteredToothModalOpen(true);
          }, 3000);
        }

        return updated;
      });
    }
  };

  // Open modal immediately for current batch without waiting 1 second
  const handleOpenBatchModalNow = () => {
    if (batchSelectedTeeth.length === 0) return;
    if (multiDebounceTimerRef.current) {
      clearTimeout(multiDebounceTimerRef.current);
    }
    setModalStagingDiag('crown');
    setModalStagingShade(primaryShade);
    setCenteredToothModalOpen(true);
  };

  // ════════ CRITICAL: PRESERVE PREVIOUS TEETH ON SAVE ════════
  const handleSaveToothModal = () => {
    if (isTechReadOnly) {
      setCenteredToothModalOpen(false);
      return;
    }

    const targetTeeth = toothSelectionMode === 'all'
      ? (batchSelectedTeeth.length > 0 ? batchSelectedTeeth : [activeTooth])
      : [activeTooth];

    // 1. Merge into selectedTeeth without erasing previous teeth!
    setSelectedTeeth(prev => Array.from(new Set([...prev, ...targetTeeth])));

    // 2. Apply diagnoses ONLY to targetTeeth, keep all previous teeth intact!
    setToothDiagnoses(prev => {
      const updated = { ...prev };
      targetTeeth.forEach(tNum => {
        updated[tNum] = modalStagingDiag;
      });
      return updated;
    });

    // 3. Apply shades ONLY to targetTeeth, keep all previous teeth intact!
    setToothShades(prev => {
      const updated = { ...prev };
      targetTeeth.forEach(tNum => {
        updated[tNum] = modalStagingShade;
      });
      return updated;
    });

    // Clear active batch
    setBatchSelectedTeeth([]);
    setCenteredToothModalOpen(false);
  };

  // Remove a tooth from order
  const handleRemoveToothFromOrder = (tNum: string) => {
    setSelectedTeeth(prev => prev.filter(t => t !== tNum));
    setBatchSelectedTeeth(prev => prev.filter(t => t !== tNum));
    setToothDiagnoses(prev => {
      const copy = { ...prev };
      delete copy[tNum];
      return copy;
    });
    setToothShades(prev => {
      const copy = { ...prev };
      delete copy[tNum];
      return copy;
    });
    setCenteredToothModalOpen(false);
  };

  // ════════ STATUS API SYNCHRONIZATION ════════
  const handleDirectStatusChange = async (newStatus: string) => {
    if (isTechReadOnly) {
      if (newStatus !== 'texnik oldi' && newStatus !== 'texnik chiqarvorvoti') {
        alert(tr('labfull.technicianCanOnlySelectReceivedBy'));
        return;
      }
    }
    setStatus(newStatus);

    if (order && order.id) {
      try {
        const updated = await clinicApi.updateLabOrderStatus(order.id, newStatus);
        if (updated && onSaved) {
          onSaved(updated);
        }
      } catch (err) {
        console.error('Error updating status in DB:', err);
      }
    }
  };

  const handleStatusClick = (newStatusKey: string) => {
    if (isTechReadOnly) {
      if (newStatusKey !== 'texnik oldi' && newStatusKey !== 'texnik chiqarvorvoti') {
        alert(tr('labfull.technicianCanOnlySelectReceivedBy'));
        return;
      }
    }
    setTargetStatusToConfirm(newStatusKey);
    setStatusExchangeModalOpen(true);
  };

  const confirmStatusChange = async () => {
    setStatus(targetStatusToConfirm);
    setStatusExchangeModalOpen(false);

    if (order && order.id) {
      try {
        const updated = await clinicApi.updateLabOrderStatus(order.id, targetStatusToConfirm);
        if (updated && onSaved) {
          onSaved(updated);
        }
        // User requested: "statistika o'zgartirsa ham saqlashni bosganda modal yopilsin shuni ham qilib ber"
        onClose();
      } catch (err) {
        console.error('Error persisting status change:', err);
      }
    }
  };

  // ════════ MAIN SAVE (DOCTOR CREATING OR UPDATING) ════════
  const handleSave = async () => {
    if (!selectedPatientId || selectedPatientId === 0) {
      alert(tr('labfull.pleaseSelectAPatientFirst'));
      return;
    }

    const photoAvailable = hasPhoto || patientPhotos.length > 0;
    if (!photoAvailable) {
      alert(tr('labfull.attentionPatientPhotoIsRequiredBef'));
      return;
    }

    setSaving(true);
    try {
      const currentStatus = (status && status !== 'qoralama') ? status : 'biriktirildi';
      setStatus(currentStatus);

      const payload: Partial<DentalLabOrder> = {
        order_number: orderNumber,
        patient: selectedPatientId,
        patient_name: patientName,
        patient_phone: patientPhone,
        doctor: selectedDoctorId,
        doctor_name: doctorName,
        branch: selectedBranchId || 1,
        branch_name: selectedBranchName || 'Toshkent Markaziy',
        destination_branch: selectedDestBranchId || selectedBranchId || 1,
        destination_branch_name: selectedDestBranchName || selectedBranchName || 'Toshkent Markaziy',
        technician: selectedTechId,
        technician_name: technicianName,
        work_type: workTypes.join(', '),
        tooth_numbers: selectedTeeth.join(', '),
        color_shade: primaryShade,
        shade_details: {
          primary: primaryShade,
          per_tooth: toothShades
        },
        teeth_diagnoses: toothDiagnoses,
        implant_system: implantSystem,
        fixation_type: fixationType,
        status: currentStatus,
        attached_items: {
          slepki: slepkiChoices.length ? slepkiChoices.join(', ') : 'Yo‘q',
          lozhka: lozhkaType === 'none' ? 'Yo‘q' : `${lozhkaType === 'metal' ? 'Metall' : 'Plastmassa'} (${lozhkaCount} dona)`,
          registrator_prikusa: hasRegistrator ? 'Mavjud' : 'Yo‘q',
          transfer_system: transferSystem,
          transfer_count: transferCount,
          has_analog: hasAnalog,
          analog_count: hasAnalog ? analogCount : 0,
          has_photo: Boolean(hasPhoto || patientPhotos.length > 0),
          has_xray: hasXray,
          has_scan: hasScan
        },
        primerka_date: primerkaDate,
        zdacha_date: zdachaDate,
        received_date: receivedDate,
        due_date: zdachaDate || dueDate,
        cost: techCost,
        clinic_price: clinicPrice,
        orthopedist_wishes: orthopedistWishes,
        patient_wishes: patientWishes
      };

      let saved: DentalLabOrder | null = null;
      if (order && order.id) {
        saved = await clinicApi.updateLabOrder(order.id, payload);
      } else {
        saved = await clinicApi.createLabOrder(payload as any);
      }

      const finalSavedOrder = saved || (payload as DentalLabOrder);
      if (onSaved) onSaved(finalSavedOrder);

      // User requested: "saqlashni bosngada modal yopilib qr-code chiqsin bo'ldi , anu oyna ochiq turvurmasin"
      setOrderForReceipt(finalSavedOrder);
      setReceiptModalOpen(true);
    } catch (err) {
      console.error('Error saving lab order:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const statusBadge = getStatusBadge(status, language as any);

  // Active tooth diagnosis object
  const activeDiagKey = modalStagingDiag;
  const activeDiagObj = TOOTH_DIAGNOSES.find(d => d.key === activeDiagKey) || TOOTH_DIAGNOSES[0];
  const activeShade = modalStagingShade;

  // Odontogram Tooth Card Renderer
  const renderOdontogramTooth = (tNum: string, flip: boolean) => {
    const isSelected = selectedTeeth.includes(tNum);
    const isBatchPending = batchSelectedTeeth.includes(tNum);
    const isActive = activeTooth === tNum;
    const shade = toothShades[tNum] || primaryShade;
    const shadeObj = VITA_SHADES.find(s => s.code === shade);

    const toothColor = isSelected ? (shadeObj?.hex || '#F59E0B') : '#CBD5E1';

    return (
      <button
        key={tNum}
        type="button"
        onClick={() => handleToothClick(tNum)}
        style={{
          backgroundColor: isSelected && shadeObj ? `${shadeObj.hex}80` : undefined
        }}
        // CRITICAL Z-INDEX FIX: Never give tooth button high z-index that pierces the modal backdrop!
        className={`relative p-1 rounded-xl border transition flex flex-col items-center justify-between min-h-[66px] w-[46px] group ${
          isBatchPending
            ? 'border-blue-600 ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/60 scale-105'
            : isActive && !centeredToothModalOpen
            ? 'border-blue-600 ring-2 ring-blue-500/50 shadow-md scale-105 bg-white dark:bg-slate-800'
            : isSelected
            ? 'border-blue-500 dark:border-blue-400 shadow-xs ring-1 ring-blue-400/40'
            : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-blue-300'
        }`}
        title={`#${tNum} - Vita: ${shade}`}
      >
        <span className="text-[10px] font-black text-slate-700 dark:text-slate-200">{tNum}</span>

        <ToothGlyph
          color={toothColor}
          flip={flip}
          sizeClass="w-5 h-6"
        />

        {isSelected ? (
          <span className="text-[9px] font-black px-1.5 rounded bg-slate-900 text-white font-mono leading-none py-0.5 mt-0.5 shadow-2xs">
            {shade}
          </span>
        ) : isBatchPending ? (
          <span className="text-[8px] font-bold px-1 rounded bg-blue-600 text-white leading-none py-0.5 mt-0.5">
            ✓
          </span>
        ) : (
          <span className="text-[8px] text-slate-400 font-medium leading-none truncate max-w-[40px]">
            —
          </span>
        )}
      </button>
    );
  };

  // If receipt modal is open after save: hide the full order form completely as requested!
  if (receiptModalOpen && orderForReceipt) {
    return (
      <LabOrderReceiptModal
        isOpen={true}
        onClose={() => {
          setReceiptModalOpen(false);
          onClose(); // Cleanly closes both!
        }}
        order={orderForReceipt}
        onDispatchNext={() => {
          setReceiptModalOpen(false);
          setTargetStatusToConfirm('chiqarilvoti');
          setStatusExchangeModalOpen(true);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 w-screen h-screen bg-slate-100 dark:bg-slate-950 flex flex-col p-0 m-0 overflow-hidden select-none animate-in fade-in duration-150">

      {/* ──────────────── 1. HEADER (COMPACT, LOGO, ORDER NUMBER, STATUS) ──────────────── */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-2.5 flex items-center justify-between shadow-xs shrink-0 z-20 gap-3">
        {/* Left: Logo & Order Number */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-sm shrink-0">
              dO
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm tracking-tight text-slate-900 dark:text-white">
                  dentOS
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {tr('labfull.labOrder')}
                </span>
              </div>
              <span className="font-mono text-xs font-black text-blue-600 dark:text-sky-400 block leading-tight">
                {orderNumber}
              </span>
            </div>
          </div>

          {/* Quick Doctor & Patient preview */}
          <div className="hidden lg:flex items-center gap-2 text-xs pl-2 border-l border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1 text-slate-700 dark:text-slate-200 font-bold max-w-[130px] truncate">
              <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>{patientName || tr('labfull.patient')}</span>
            </div>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400 max-w-[120px] truncate">
              <Stethoscope className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>{doctorName || tr('labfull.doctor')}</span>
            </div>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400 max-w-[120px] truncate">
              <Wrench className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>{technicianName || tr('labfull.technician')}</span>
            </div>
          </div>
        </div>

        {/* Center: Stage Progress Pipeline */}
        <div className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-bold">
          {[
            { key: 'biriktirildi',        label: tr('labfull.n1Assigned') },
            { key: 'chiqarilvoti',        label: tr('labfull.n2InTransit') },
            { key: 'texnik oldi',         label: tr('labfull.n3Received') },
            { key: 'texnik chiqarvorvoti',label: tr('labfull.n4Dispatched') },
            { key: 'klinika oldi',        label: tr('labfull.n5Completed') }
          ].map((st, idx, arr) => {
            const isCurrent = status === st.key;
            return (
              <React.Fragment key={st.key}>
                <button
                  type="button"
                  onClick={() => handleStatusClick(st.key)}
                  className={`px-2.5 py-1 rounded-lg transition text-center whitespace-nowrap ${
                    isCurrent
                      ? 'bg-blue-600 text-white shadow-xs font-black'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {st.label}
                </button>
                {idx < arr.length - 1 && (
                  <span className="text-slate-300 dark:text-slate-600">→</span>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Right: Actions (QR Code, Save, Close) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setOrderForReceipt(order || {
                id: 0,
                order_number: orderNumber,
                patient: selectedPatientId,
                patient_name: patientName,
                patient_phone: patientPhone,
                doctor: selectedDoctorId,
                doctor_name: doctorName,
                technician: selectedTechId,
                technician_name: technicianName,
                work_type: workTypes.join(', '),
                tooth_numbers: selectedTeeth.join(', '),
                color_shade: primaryShade,
                implant_system: implantSystem,
                fixation_type: fixationType,
                status: status,
                due_date: zdachaDate || dueDate || '',
                cost: techCost || 0,
                attached_items: {
                  slepki: slepkiChoices.length ? slepkiChoices.join(', ') : 'Yo‘q',
                  lozhka: lozhkaType === 'none' ? 'Yo‘q' : `${lozhkaType === 'metal' ? 'Metall' : 'Plastmassa'} (${lozhkaCount} dona)`,
                  registrator_prikusa: hasRegistrator ? 'Mavjud' : 'Yo‘q',
                  transfer_system: transferSystem,
                  transfer_count: transferCount,
                  has_analog: hasAnalog,
                  analog_count: hasAnalog ? analogCount : 0,
                  has_photo: Boolean(hasPhoto || patientPhotos.length > 0),
                  has_xray: hasXray,
                  has_scan: hasScan
                }
              } as DentalLabOrder);
              setReceiptModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 text-xs font-bold transition shadow-2xs"
            title={tr('labfull.printQrReceipt')}
          >
            <QrCode className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="hidden sm:inline">{tr('labfull.receiptQr')}</span>
          </button>

          {!isTechReadOnly && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? tr('labfull.saving') : tr('labfull.save')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
            title={tr('labfull.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ──────────────── 2. BODY (2-VAROQ DUAL COLUMN DESK WORKFLOW) ──────────────── */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6 grid grid-cols-1 xl:grid-cols-2 gap-5 min-h-0">

        {/* ═══════════════════════════════════════════════════════════════
            VAROQ 1 (Rekvizitlar, ish turi, tish formulasi va muddatlar)
        ═══════════════════════════════════════════════════════════════ */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            
            {/* Varoq 1 Header + STATUS SELECT DROPDOWN */}
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  {tr('labfull.sheet1')}
                </span>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  {tr('labfull.dentalLabWorkOrder')}
                </h2>
              </div>

              {/* Status Select Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400">Status:</span>
                <select
                  value={status}
                  disabled={isTechReadOnly}
                  onChange={e => handleDirectStatusChange(e.target.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black border outline-none cursor-pointer transition shadow-2xs ${statusBadge.color}`}
                >
                  <option value="biriktirildi">{tr('labfull.n1Assigned')}</option>
                  <option value="chiqarilvoti">{tr('labfull.n2InTransit')}</option>
                  <option value="texnik oldi">{tr('labfull.n3ReceivedByTech')}</option>
                  <option value="texnik chiqarvorvoti">{tr('labfull.n4DispatchedByTech')}</option>
                  <option value="klinika oldi">{tr('labfull.n5Completed')}</option>
                </select>
              </div>
            </div>

            {/* Rekvizitlar (Vrach, Bemor, Texnik) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  {tr('labfull.orthopedicDoctor')}
                </span>
                <select
                  value={selectedDoctorId}
                  disabled={isTechReadOnly}
                  onChange={e => {
                    const did = Number(e.target.value);
                    setSelectedDoctorId(did);
                    const d = employees.find(x => x.id === did);
                    if (d) {
                      setDoctorName(d.full_name);
                      if (d.branch) {
                        setSelectedBranchId(d.branch);
                        const b = branches.find(x => x.id === d.branch);
                        if (b) {
                          setSelectedBranchName(b.name);
                          if (!selectedDestBranchId || selectedDestBranchId === selectedBranchId) {
                            setSelectedDestBranchId(b.id);
                            setSelectedDestBranchName(b.name);
                          }
                        }
                      }
                    }
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-900 dark:text-white outline-none disabled:opacity-60"
                >
                  {employees.map(d => (
                    <option key={d.id} value={d.id}>{d.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  {tr('labfull.patient')}
                </span>
                {isTechReadOnly ? (
                  <div className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-900 dark:text-white">
                    {patientName}
                    <span className="block text-[11px] text-slate-400 font-normal">{maskedPhone}</span>
                  </div>
                ) : (
                  <select
                    value={selectedPatientId}
                    onChange={e => {
                      const pid = Number(e.target.value);
                      setSelectedPatientId(pid);
                      if (pid === 0) {
                        setPatientName('');
                        setPatientPhone('');
                      } else {
                        const p = patients.find(x => x.id === pid);
                        if (p) {
                          setPatientName(p.full_name);
                          setPatientPhone(p.phone);
                        }
                      }
                    }}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-900 dark:text-white outline-none"
                  >
                    <option value={0}>{tr('labfull.selectPatient')}</option>
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name} ({p.phone})</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  {tr('labfull.dentalTechnician')}
                </span>
                <select
                  value={selectedTechId}
                  disabled={isTechReadOnly || technicians.length === 0}
                  onChange={e => {
                    const tid = Number(e.target.value);
                    setSelectedTechId(tid);
                    const tech = technicians.find(x => x.id === tid);
                    if (tech) setTechnicianName(tech.name);
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-900 dark:text-white outline-none disabled:opacity-60"
                >
                  {technicians.length === 0 ? (
                    <option value={0}>{tr('labfull.noLabConnected')}</option>
                  ) : (
                    technicians.map(tech => (
                      <option key={tech.id} value={tech.id}>{tech.name} ({tech.lab_name})</option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* Filiallar yo'nalishi (Yaratuvchi / Yuboruvchi filial va Qabul qiluvchi filial) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                  <Building2 className="w-3.5 h-3.5 text-blue-500" />
                  {tr('labfull.originatingBranch')}
                </span>
                <select
                  value={selectedBranchId}
                  disabled={isTechReadOnly}
                  onChange={e => {
                    const bid = Number(e.target.value);
                    setSelectedBranchId(bid);
                    const b = branches.find(x => x.id === bid);
                    if (b) setSelectedBranchName(b.name);
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-900 dark:text-white outline-none"
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                  <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                  {tr('labfull.destinationBranch')}
                </span>
                <select
                  value={selectedDestBranchId}
                  disabled={isTechReadOnly}
                  onChange={e => {
                    const bid = Number(e.target.value);
                    setSelectedDestBranchId(bid);
                    const b = branches.find(x => x.id === bid);
                    if (b) setSelectedDestBranchName(b.name);
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-900 dark:text-white outline-none"
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ════════ TEXNIK XIZMATLARI (MULTI-SELECT & PRICES HIDDEN ON BUTTONS) ════════ */}
            <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-blue-950 dark:text-blue-200 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-blue-600" />
                  {tr('labfull.technicianServicesMultiSelect')}
                </span>
                <span className="text-[10px] text-slate-500 font-semibold">
                  {tr('labfull.pricesHiddenFromPatient')}
                </span>
              </div>

              {/* Service chip buttons - NO PRICES on buttons! */}
              <div className="flex flex-wrap gap-2">
                {currentTechPriceList.map(item => {
                  const isSelected = selectedTechServiceIds.includes(item.id) || workTypes.includes(getServiceName(item));
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={isTechReadOnly}
                      onClick={() => handleToggleTechService(item.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs font-black'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-blue-300'
                      }`}
                    >
                      {isSelected ? <Check className="w-3.5 h-3.5 text-white" /> : <Plus className="w-3 h-3 text-slate-400" />}
                      <span>{getServiceName(item)}</span>
                    </button>
                  );
                })}
              </div>

              {/* Expandable Doctor Private Cost Accordion */}
              {!isTechReadOnly && !isAdmin && (
                <div className="pt-2 border-t border-blue-200/60 dark:border-blue-900/60">
                  <button
                    type="button"
                    onClick={() => setShowDoctorPrivateCost(!showDoctorPrivateCost)}
                    className="text-xs font-bold text-blue-700 dark:text-sky-300 hover:underline flex items-center gap-1"
                  >
                    {showDoctorPrivateCost ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    <span>{tr('labfull.costCalculationDoctorViewOnly')}</span>
                  </button>

                  {showDoctorPrivateCost && (
                    <div className="mt-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 text-xs flex items-center justify-between animate-in fade-in duration-100">
                      <div>
                        <span className="text-slate-500 block">{tr('labfull.selectedTeethCount')} <strong>{selectedTeeth.length || 1} ta</strong></span>
                        <span className="text-slate-500 block">{tr('labfull.totalTechCost')}</span>
                      </div>
                      <span className="text-sm font-black font-mono text-blue-600 dark:text-sky-400">
                        {(techCost || 0).toLocaleString('ru-RU')} so‘m
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Implant va Fiksatsiya (1-rasm Autocomplete) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="relative" ref={implantContainerRef}>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  {tr('labfull.implantSystem')}
                </span>
                <div className="relative">
                  <input
                    type="text"
                    disabled={isTechReadOnly}
                    value={implantSystem}
                    onFocus={() => setIsImplantDropdownOpen(true)}
                    onClick={() => setIsImplantDropdownOpen(true)}
                    onChange={e => {
                      setImplantSystem(e.target.value);
                      setImplantSearchQuery(e.target.value);
                      setIsImplantDropdownOpen(true);
                    }}
                    placeholder={tr('labfull.searchStraumannOsstem')}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 pr-8"
                  />
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
                </div>

                {/* Searchable Autocomplete Dropdown List */}
                {isImplantDropdownOpen && !isTechReadOnly && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-h-60 overflow-y-auto z-50 p-1.5 space-y-1 animate-in fade-in duration-100">
                    {filteredImplants.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400">
                        {tr('labfull.noMatchFoundCustomEntryKept')}
                      </div>
                    ) : (
                      filteredImplants.map(item => {
                        const isChosen = implantSystem.toLowerCase() === item.name.toLowerCase();
                        const localizedSub = language === 'ru' ? item.nameRu : language === 'en' ? item.nameEn : item.nameUz;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setImplantSystem(item.name);
                              setImplantSearchQuery(item.name);
                              setTransferSystem(item.name);
                              setIsImplantDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition ${
                              isChosen
                                ? 'bg-blue-600 text-white font-black'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            <span className="font-bold">{item.name}</span>
                            <span className={`text-[10px] ${isChosen ? 'text-blue-100' : 'text-slate-400'}`}>
                              {localizedSub}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  {tr('labfull.fixationType')}
                </span>
                <select
                  value={fixationType}
                  disabled={isTechReadOnly}
                  onChange={e => setFixationType(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white outline-none disabled:opacity-60"
                >
                  <option value="Vintli">{tr('labfull.screwRetained')}</option>
                  <option value="Tsementli">{tr('labfull.cementRetained')}</option>
                  <option value="Teleskopik">{tr('labfull.telescopic')}</option>
                </select>
              </div>
            </div>

            {/* ════════ ODONTOGRAMMA & 2 TA REJIM TUGMASI ════════ */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  {tr('labfull.toothFormula')}
                </span>

                {/* 2 TA ANIQ REJIM TUGMASI */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold">
                  <button
                    type="button"
                    disabled={isTechReadOnly}
                    onClick={() => {
                      setToothSelectionMode('all');
                      setBatchSelectedTeeth([]);
                    }}
                    className={`px-3 py-1 rounded-lg transition ${
                      toothSelectionMode === 'all'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    👥 {tr('labfull.batchSelection')}
                  </button>
                  <button
                    type="button"
                    disabled={isTechReadOnly}
                    onClick={() => {
                      setToothSelectionMode('individual');
                      setBatchSelectedTeeth([]);
                    }}
                    className={`px-3 py-1 rounded-lg transition ${
                      toothSelectionMode === 'individual'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                    }`}
                  >
                    🦷 {tr('labfull.individualTooth')}
                  </button>
                </div>
              </div>

              {/* Tanlangan tishlar indikatori */}
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-slate-500 font-medium">
                  {toothSelectionMode === 'all'
                    ? tr('labfull.clickTeethModalOpensIn3s')
                    : tr('labfull.clickAnyToothOpensInstantly')}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-blue-600 dark:text-sky-400">
                    {selectedTeeth.length ? `#${selectedTeeth.join(', ')}` : tr('labfull.noneSelected')}
                  </span>
                  {toothSelectionMode === 'all' && batchSelectedTeeth.length > 0 && (
                    <button
                      type="button"
                      onClick={handleOpenBatchModalNow}
                      className="px-2 py-0.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold shadow-xs hover:bg-blue-700 transition"
                    >
                      {tr('labfull.open')} ({batchSelectedTeeth.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Odontogram Teeth Arc Container */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
                {/* Yuqori jag' */}
                <div>
                  <div className="text-[10px] font-black text-slate-400 uppercase text-center mb-1 tracking-wider">
                    {tr('labfull.upperJaw1828')}
                  </div>
                  <div className="flex flex-wrap justify-center gap-1 overflow-x-auto py-1">
                    {UPPER_TEETH.map(tNum => renderOdontogramTooth(tNum, false))}
                  </div>
                </div>

                <div className="border-t border-dashed border-slate-300 dark:border-slate-700 my-1" />

                {/* Pastki jag' */}
                <div>
                  <div className="flex flex-wrap justify-center gap-1 overflow-x-auto py-1">
                    {LOWER_TEETH.map(tNum => renderOdontogramTooth(tNum, true))}
                  </div>
                  <div className="text-[10px] font-black text-slate-400 uppercase text-center mt-1 tracking-wider">
                    {tr('labfull.lowerJaw4838')}
                  </div>
                </div>
              </div>

              {/* Vita emal ranglari ko‘rsatkichi */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] text-slate-500">
                <span className="font-bold text-slate-700 dark:text-slate-300 mr-1">
                  {tr('labfull.vitaShades')}
                </span>
                {['BL1', 'A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'D2'].map(code => {
                  const s = VITA_SHADES.find(x => x.code === code);
                  return (
                    <span
                      key={code}
                      style={{ backgroundColor: s?.hex }}
                      className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-[9px] font-mono font-black text-slate-800 shadow-2xs"
                    >
                      {code}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Muddatlar (Primerka, Zdacha) */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  {tr('labfull.fittingDate')}
                </span>
                <input
                  type="date"
                  disabled={isTechReadOnly}
                  value={primerkaDate}
                  onChange={e => setPrimerkaDate(e.target.value)}
                  className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white outline-none"
                />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  {tr('labfull.deliveryDate')}
                </span>
                <input
                  type="date"
                  disabled={isTechReadOnly}
                  value={zdachaDate}
                  onChange={e => {
                    setZdachaDate(e.target.value);
                    setDueDate(e.target.value);
                  }}
                  className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white outline-none"
                />
              </div>
            </div>

          </div>
        </section>


        {/* ═══════════════════════════════════════════════════════════════
            VAROQ 2 (Media nazorati, Fizik materiallar, Tilaklar)
        ═══════════════════════════════════════════════════════════════ */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            
            {/* Varoq 2 Header */}
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  {tr('labfull.sheet2')}
                </span>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  {tr('labfull.mediaPhysicalMaterials')}
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono text-xs">
                {orderNumber}
              </span>
            </div>

            {/* ════════ BEMOR FOTOSURATLARI (NO THUMBNAILS ON SHEET! ONLY STATUS & FULL VIEWER BUTTON) ════════ */}
            {/* User explicitly demanded: "yengi ish bervokanda bemorni tanlashi bilan kegin rasim filter qilsin bor yo'qligini ungacha ko'rsatmasin" */}
            {!selectedPatientId ? (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2.5">
                <Camera className="w-5 h-5 text-slate-400 shrink-0" />
                <span className="font-semibold">
                  {tr('labfull.selectAPatientFirstToCheck')}
                </span>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-blue-600" />
                    {tr('labfull.patientPhotosXRay3dClinical')}
                  </span>
                  
                  {/* Status Badge: Bor / Yo'q */}
                  {patientPhotos.length > 0 ? (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      {tr('labfull.availableCount').replace('{n}', String(patientPhotos.length))}
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border border-rose-300 dark:border-rose-800 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-rose-600" />
                      {tr('labfull.notAvailable')}
                    </span>
                  )}
                </div>

                {/* Photos action button - opens cascading vertical view! */}
                {patientPhotos.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPhotoViewerOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-sm transition"
                    >
                      <Eye className="w-4 h-4" />
                      <span>{tr('labfull.viewAllPhotos').replace('{n}', String(patientPhotos.length))}</span>
                    </button>

                    {!isTechReadOnly && (
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 text-xs font-semibold transition">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{tr('labfull.addMorePhotos')}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleQuickPhotoUpload}
                          />
                        </label>
                        <a
                          href={`/patients/${selectedPatientId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-xs font-semibold flex items-center gap-1"
                        >
                          <span>{tr('labfull.goToPatientProfile')}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-xs space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span className="font-bold text-rose-900 dark:text-rose-200">
                        {tr('labfull.noPhotosInPatientProfilePhotos')}
                      </span>
                    </div>
                    {!isTechReadOnly && (
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs">
                          <Upload className="w-3.5 h-3.5" />
                          <span>{tr('labfull.uploadPhoto')}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleQuickPhotoUpload}
                          />
                        </label>
                        <a
                          href={`/patients/${selectedPatientId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 dark:text-rose-300 hover:underline"
                        >
                          <span>{tr('labfull.goToProfile')}</span>
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* RENTGEN VA 3D SKAN (IXTIYORIY) + PERMISSION TOGGLES */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <FileScan className="w-4 h-4 text-blue-500" /> Rentgen / KT
                      </span>
                      {patientRentgenMeta ? (
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {patientRentgenMeta.sizeMb} MB
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">{tr('labfull.notAttached')}</span>
                      )}
                    </div>

                    {patientRentgenMeta && (
                      <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                        📄 {patientRentgenMeta.fileName}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-700 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setIsRentgenViewerModalOpen(true)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold hover:bg-blue-100 dark:hover:bg-blue-900 transition text-[10px]"
                      >
                        <HardDrive className="w-3.5 h-3.5" />
                        <span>
                          {patientRentgenMeta
                            ? tr('labfull.viewDownload')
                            : tr('labfull.uploadXRayZip')}
                        </span>
                      </button>

                      {!isTechReadOnly && (
                        <label className="flex items-center gap-1.5 cursor-pointer font-bold text-blue-600 dark:text-sky-400">
                          <input
                            type="checkbox"
                            checked={allowXrayToTech}
                            onChange={e => setAllowXrayToTech(e.target.checked)}
                            className="rounded text-blue-600"
                          />
                          <span>{tr('labfull.allowTech')}</span>
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Boxes className="w-4 h-4 text-purple-500" /> 3D Skan (STL)
                      </span>
                      {patientScanMeta ? (
                        <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {patientScanMeta.sizeMb} MB
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">{tr('labfull.notAttached')}</span>
                      )}
                    </div>

                    {patientScanMeta && (
                      <div className="text-[11px] font-mono text-purple-800 dark:text-purple-300 truncate bg-purple-50/50 dark:bg-purple-950/30 p-1.5 rounded-lg border border-purple-100 dark:border-purple-900/50">
                        📦 {patientScanMeta.fileName}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-700 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setIsScanViewerModalOpen(true)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-bold hover:bg-purple-100 dark:hover:bg-purple-900 transition text-[10px]"
                      >
                        <Boxes className="w-3.5 h-3.5" />
                        <span>
                          {patientScanMeta
                            ? tr('labfull.open3dScan')
                            : tr('labfull.upload3dScanZip')}
                        </span>
                      </button>

                      {!isTechReadOnly && (
                        <label className="flex items-center gap-1.5 cursor-pointer font-bold text-purple-600 dark:text-purple-400">
                          <input
                            type="checkbox"
                            checked={allowScanToTech}
                            onChange={e => setAllowScanToTech(e.target.checked)}
                            className="rounded text-purple-600"
                          />
                          <span>{tr('labfull.allowTech')}</span>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ════════ FIZIK MATERIALLAR NAZORATI (2-RASM) ════════ */}
            <div className="p-4 rounded-3xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-950 dark:text-amber-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-amber-600" />
                  {tr('labfull.attachedPhysicalMaterials')}
                </span>
                <span className="text-[10px] text-amber-700 dark:text-amber-300 font-bold bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800">
                  {tr('labfull.physicalMaterials')}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* 1. SLEPKI: A-silikon, C-silikon (Multi-choice) */}
                <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-amber-200/80 dark:border-amber-900/50 space-y-2">
                  <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 block">
                    1. {tr('labfull.impressions')}:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {['A-silikon', 'C-silikon'].map(sName => {
                      const isSel = slepkiChoices.includes(sName);
                      return (
                        <button
                          key={sName}
                          type="button"
                          disabled={isTechReadOnly}
                          onClick={() => {
                            setSlepkiChoices(prev =>
                              prev.includes(sName)
                                ? prev.filter(x => x !== sName)
                                : [...prev, sName]
                            );
                          }}
                          className={`px-3 py-1.5 rounded-xl font-black text-xs transition flex items-center gap-1.5 border ${
                            isSel
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${isSel ? 'bg-white' : 'bg-slate-400'}`} />
                          <span>{sName}</span>
                          {isSel && <Check className="w-3.5 h-3.5 text-white" />}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[10px] text-slate-400 block italic">
                    {tr('labfull.selectOneOrBoth')}
                  </span>
                </div>

                {/* 2. LOZHKA: Metal, Plastmassa, Yo'q + Soni */}
                <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-amber-200/80 dark:border-amber-900/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-300">
                      2. {tr('labfull.impressionTray')}:
                    </span>
                    {lozhkaType !== 'none' && (
                      <div className="flex items-center gap-1 text-[11px]">
                        <span className="text-slate-500 font-bold">{tr('labfull.qty')}</span>
                        <select
                          value={lozhkaCount}
                          disabled={isTechReadOnly}
                          onChange={e => setLozhkaCount(Number(e.target.value))}
                          className="px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold font-mono text-xs"
                        >
                          {[1, 2, 3, 4, 5, 6].map(n => (
                            <option key={n} value={n}>{n} {tr('labfull.pcs')}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      disabled={isTechReadOnly}
                      onClick={() => setLozhkaType('metal')}
                      className={`py-1.5 px-2.5 rounded-xl font-bold text-xs transition border flex items-center justify-center gap-1 ${
                        lozhkaType === 'metal'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <span>{tr('labfull.metal')}</span>
                      {lozhkaType === 'metal' && <Check className="w-3 h-3 text-white" />}
                    </button>

                    <button
                      type="button"
                      disabled={isTechReadOnly}
                      onClick={() => setLozhkaType('plastik')}
                      className={`py-1.5 px-2.5 rounded-xl font-bold text-xs transition border flex items-center justify-center gap-1 ${
                        lozhkaType === 'plastik'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <span>{tr('labfull.plastic')}</span>
                      {lozhkaType === 'plastik' && <Check className="w-3 h-3 text-white" />}
                    </button>
                  </div>
                </div>

                {/* 3. REGISTRATOR PRIKUSA: Ha / Yo'q */}
                <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-amber-200/80 dark:border-amber-900/50 space-y-2">
                  <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 block">
                    3. {tr('labfull.biteRegistration')}:
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isTechReadOnly}
                      onClick={() => setHasRegistrator(true)}
                      className={`py-1.5 px-3 rounded-xl font-black text-xs transition border flex items-center justify-center gap-1.5 ${
                        hasRegistrator
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{tr('labfull.yes')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isTechReadOnly}
                      onClick={() => setHasRegistrator(false)}
                      className={`py-1.5 px-3 rounded-xl font-black text-xs transition border flex items-center justify-center gap-1.5 ${
                        !hasRegistrator
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{tr('labfull.no')}</span>
                    </button>
                  </div>
                </div>

                {/* 4. TRANSFER & SHTUK (1..20) */}
                <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-amber-200/80 dark:border-amber-900/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-300">
                      4. {tr('labfull.transfer')}:
                    </span>
                    <div className="flex items-center gap-1 text-[11px]">
                      <span className="text-slate-500 font-bold">{tr('labfull.qty')}</span>
                      <select
                        value={transferCount}
                        disabled={isTechReadOnly}
                        onChange={e => setTransferCount(Number(e.target.value))}
                        className="px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold font-mono text-xs"
                      >
                        {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>{n} {tr('labfull.pcs')}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <select
                    value={transferSystem}
                    disabled={isTechReadOnly}
                    onChange={e => setTransferSystem(e.target.value)}
                    className="w-full p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-xs text-slate-800 dark:text-slate-200 outline-none"
                  >
                    <option value="AnyOne">AnyOne</option>
                    <option value="AnyRidge">AnyRidge</option>
                    <option value="Neodent">Neodent</option>
                    <option value="Osstem">Osstem</option>
                    <option value="Straumann">Straumann</option>
                    <option value="Dentium">Dentium</option>
                    <option value="MegaGen">MegaGen</option>
                    <option value="BioHorizons">BioHorizons</option>
                    <option value="MIS">MIS</option>
                    <option value="Alpha-Bio">Alpha-Bio</option>
                    <option value="Zimmer">Zimmer</option>
                    {implantSystem && !['AnyOne', 'AnyRidge', 'Neodent', 'Osstem', 'Straumann', 'Dentium', 'MegaGen', 'BioHorizons', 'MIS', 'Alpha-Bio', 'Zimmer'].includes(implantSystem) && (
                      <option value={implantSystem}>{implantSystem}</option>
                    )}
                  </select>
                </div>

                {/* 5. ANALOG: Ha / Yo'q */}
                <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-amber-200/80 dark:border-amber-900/50 space-y-2 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-300">
                      5. {tr('labfull.analog')}:
                    </span>
                    {hasAnalog && (
                      <div className="flex items-center gap-1 text-[11px]">
                        <span className="text-slate-500 font-bold">{tr('labfull.qty')}</span>
                        <select
                          value={analogCount}
                          disabled={isTechReadOnly}
                          onChange={e => setAnalogCount(Number(e.target.value))}
                          className="px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold font-mono text-xs"
                        >
                          {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
                            <option key={n} value={n}>{n} {tr('labfull.pcs')}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isTechReadOnly}
                      onClick={() => setHasAnalog(true)}
                      className={`py-1.5 px-3 rounded-xl font-black text-xs transition border flex items-center justify-center gap-1.5 ${
                        hasAnalog
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{tr('labfull.yes')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isTechReadOnly}
                      onClick={() => setHasAnalog(false)}
                      className={`py-1.5 px-3 rounded-xl font-black text-xs transition border flex items-center justify-center gap-1.5 ${
                        !hasAnalog
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{tr('labfull.no')}</span>
                    </button>
                  </div>
                </div>

              </div>
            </div>

            {/* Shifokor va Bemor Tilaklari */}
            <div className="space-y-3">
              <div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {tr('labfull.doctorNotesInstructions')}
                </span>
                <textarea
                  rows={2}
                  disabled={isTechReadOnly}
                  value={orthopedistWishes}
                  onChange={e => setOrthopedistWishes(e.target.value)}
                  placeholder={tr('labfull.smileLineTranslucencyOcclusion')}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {tr('labfull.patientWishes')}
                </span>
                <textarea
                  rows={2}
                  disabled={isTechReadOnly}
                  value={patientWishes}
                  onChange={e => setPatientWishes(e.target.value)}
                  placeholder={tr('labfull.whiterShadeNaturalAnatomy')}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white outline-none"
                />
              </div>
            </div>

          </div>
        </section>

      </main>


      {/* ════════ 3. CENTERED TOOTH MODAL (WITH BLURRED/DARK BACKDROP & BOTTOM SAVE BUTTON) ════════ */}
      {/* User explicitly demanded:
          1. "modal ochilganda modaldan tashqariga z-index bo'lib modal ochilsa ham ko'rinib turibti unaqa bo'lmasin tishda" -> z-[100] guaranteed above all
          2. "barchasiga o'tkazib tish tanlab modal ochilbi yopadiku o'sha tanalganlari bo'lsin qoganlariga o'zgartirib qo'yma" -> only target teeth modified
          3. "va shu bo'ycha kiritib saqlash tugmasi bo'lsin tayor tugmasi pasida bo'lsin . tepada burchega qo'ygansan chunib bo'midi to'g'irlab ber" -> prominent bottom button! */}
      {centeredToothModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="relative z-[101] w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden space-y-4 p-6">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div
                  className="p-2.5 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-sm flex items-center justify-center transition-colors"
                  style={{ backgroundColor: VITA_SHADES.find(s => s.code === modalStagingShade)?.hex || '#F4EFE3' }}
                >
                  <ToothGlyph
                    color="#334155"
                    sizeClass="w-8 h-9"
                  />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {toothSelectionMode === 'all'
                      ? tr('labfull.selectedTeeth').replace('{teeth}', String(batchSelectedTeeth.join(', ') || activeTooth)).replace('{count}', String(batchSelectedTeeth.length || 1))
                      : tr('labfull.vitaShade').replace('{tooth}', String(activeTooth))}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-mono font-black text-blue-700 dark:text-sky-300 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800">
                      Vita: {modalStagingShade}
                    </span>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      {VITA_SHADES.find(s => s.code === modalStagingShade)?.name || modalStagingShade}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCenteredToothModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Vita Shades Selection (Tashxis tanlang qismi olib tashlandi!) */}
            <div className="space-y-2 py-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                {tr('labfull.selectVitaShadeEnamelShade')}
              </span>
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                {VITA_SHADES.map(s => {
                  const isSelected = modalStagingShade === s.code;

                  return (
                    <button
                      key={s.code}
                      type="button"
                      disabled={isTechReadOnly}
                      onClick={() => {
                        setModalStagingShade(s.code);
                        setPrimaryShade(s.code);
                      }}
                      style={{ backgroundColor: s.hex }}
                      className={`p-1.5 rounded-xl border transition flex items-center justify-between px-1.5 shadow-2xs ${
                        isSelected
                          ? 'border-blue-600 ring-2 ring-blue-500 font-black scale-105'
                          : 'border-slate-300 hover:border-slate-400'
                      }`}
                    >
                      <span className={`text-xs font-black ${s.text}`}>{s.code}</span>
                      {isSelected && <Check className="w-3 h-3 text-blue-600 stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ════════ MODAL FOOTER: LARGE BOTTOM SAVE / TAYYOR BUTTON ════════ */}
            {/* User demanded: "va shu bo'ycha kiritib saqlash tugmasi bo'lsin tayor tugmasi pasida bo'lsin . tepada burchega qo'ygansan chunib bo'midi to'g'irlab ber" */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
              {toothSelectionMode === 'individual' && selectedTeeth.includes(activeTooth) && !isTechReadOnly && (
                <button
                  type="button"
                  onClick={() => handleRemoveToothFromOrder(activeTooth)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{tr('labfull.remove')}</span>
                </button>
              )}

              <div className="flex items-center gap-2 ml-auto w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setCenteredToothModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  {tr('labfull.cancel')}
                </button>

                <button
                  type="button"
                  onClick={handleSaveToothModal}
                  className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md transition flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{tr('labfull.save2')}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}


      {/* ════════ 4. FULL-WINDOW CASCADING VERTICAL PHOTO VIEWER ════════ */}
      {/* User explicitly demanded: "rasimni ko'rishni bosganda alohida oyna ochilib rasim pasga ketma ketilida kotta bo'lib tushsin texnikda" */}
      {photoViewerOpen && patientPhotos.length > 0 && (
        <div className="fixed inset-0 z-[110] bg-slate-950/95 backdrop-blur-md flex flex-col p-4 sm:p-6 overflow-hidden animate-in fade-in duration-150">
          
          {/* Top Bar */}
          <div className="flex items-center justify-between text-white pb-3 border-b border-white/10 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-400" />
                <h3 className="font-black text-base">
                  {patientName} — {tr('labfull.patientClinicalPhotosXRays')}
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {tr('labfull.totalPhotos').replace('{n}', String(patientPhotos.length))}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setPhotoViewerOpen(false)}
              className="p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition flex items-center gap-1.5 text-xs font-bold"
            >
              <X className="w-5 h-5" />
              <span className="hidden sm:inline">{tr('labfull.close')}</span>
            </button>
          </div>

          {/* Main Content: Vertical Cascading Large Photos */}
          <div className="flex-1 overflow-y-auto py-6 space-y-8 max-w-4xl mx-auto w-full px-2">
            {patientPhotos.map((photoUrl, idx) => (
              <div
                key={idx}
                className="bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden p-4 space-y-3"
              >
                <div className="flex items-center justify-between text-xs text-slate-300 px-1">
                  <span className="font-bold flex items-center gap-1.5">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-mono font-black text-xs">
                      {idx + 1}
                    </span>
                    <span>{tr('labfull.photoNum').replace('{n}', String(idx + 1))}</span>
                  </span>

                  <a
                    href={photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{tr('labfull.openFullOriginal')}</span>
                  </a>
                </div>

                <div className="flex items-center justify-center bg-black/60 rounded-2xl p-2 min-h-[300px]">
                  <img
                    src={photoUrl}
                    alt={`Patient Photo ${idx + 1}`}
                    className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-lg"
                    loading="lazy"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Bottom quick close */}
          <div className="pt-3 border-t border-white/10 text-center shrink-0">
            <button
              type="button"
              onClick={() => setPhotoViewerOpen(false)}
              className="px-6 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition"
            >
              {tr('labfull.closeViewer')}
            </button>
          </div>
        </div>
      )}


      {/* ──────────────── 5. MATERIAL EXCHANGE & STATUS CONFIRMATION MODAL ──────────────── */}
      {statusExchangeModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  {tr('labfull.materialExchangeStatus')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setStatusExchangeModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target status banner */}
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300 font-semibold">
                {tr('labfull.changingStatusTo')}
              </span>
              <span className="font-black text-blue-700 dark:text-sky-300 capitalize">
                {getStatusBadge(targetStatusToConfirm, language as any).label}
              </span>
            </div>

            {/* STAGE 1: Chiqarilmoqda (Klinika yuborayotganda) */}
            {targetStatusToConfirm === 'chiqarilvoti' && (
              <div className="space-y-3 text-xs">
                <p className="font-bold text-slate-700 dark:text-slate-200">
                  {tr('labfull.confirmDispatchOfPhysicalMaterials')}
                </p>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 space-y-2 font-medium">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                    <span>{tr('labfull.impressions2')}: {slepkiChoices.join(', ') || tr('labfull.none')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                    <span>{tr('labfull.customTray')}: {lozhkaType === 'none' ? tr('labfull.none') : `${lozhkaType === 'metal' ? tr('labfull.metal') : tr('labfull.plastic')} (${lozhkaCount} ${tr('labfull.pcs')})`}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                    <span>{tr('labfull.biteRegistrationRim')}: {hasRegistrator ? tr('labfull.available') : tr('labfull.none2')}</span>
                  </div>
                </div>
              </div>
            )}

            {/* STAGE 2: Texnik oldi */}
            {targetStatusToConfirm === 'texnik oldi' && (
              <div className="space-y-3 text-xs">
                <p className="font-bold text-slate-700 dark:text-slate-200">
                  {tr('labfull.confirmMaterialsReceivedByTechnici')}
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={techSlepkiOk}
                      onChange={e => setTechSlepkiOk(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span>{tr('labfull.impressionsReceived')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={techLozhkaOk}
                      onChange={e => setTechLozhkaOk(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span>{tr('labfull.customTrayReceived')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={techTransferOk}
                      onChange={e => setTechTransferOk(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span>{tr('labfull.transfersReceived')}</span>
                  </label>
                </div>
              </div>
            )}

            {/* STAGE 3: Texnik yubordi */}
            {targetStatusToConfirm === 'texnik chiqarvorvoti' && (
              <div className="space-y-3 text-xs">
                <p className="font-bold text-slate-700 dark:text-slate-200">
                  {tr('labfull.materialsReturnedToClinic')}
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={returnReady}
                      onChange={e => setReturnReady(e.target.checked)}
                      className="rounded text-orange-600"
                    />
                    <span>{tr('labfull.workCompletedAndDispatched')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={returnTransfer}
                      onChange={e => setReturnTransfer(e.target.checked)}
                      className="rounded text-orange-600"
                    />
                    <span>{tr('labfull.transfersReturned')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={returnAnalog}
                      onChange={e => setReturnAnalog(e.target.checked)}
                      className="rounded text-orange-600"
                    />
                    <span>{tr('labfull.analogsReturned')}</span>
                  </label>
                </div>
              </div>
            )}

            {/* STAGE 4: Klinika oldi */}
            {targetStatusToConfirm === 'klinika oldi' && (
              <div className="space-y-3 text-xs">
                <p className="font-bold text-slate-700 dark:text-slate-200">
                  {tr('labfull.confirmFinalAcceptanceByClinic')}
                </p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={clinicWorkOk}
                      onChange={e => setClinicWorkOk(e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    <span>{tr('labfull.finalProsthesisReceived')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={clinicTransferOk}
                      onChange={e => setClinicTransferOk(e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    <span>{tr('labfull.transfersReturned2')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={clinicAnalogOk}
                      onChange={e => setClinicAnalogOk(e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    <span>{tr('labfull.analogsReturned2')}</span>
                  </label>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setStatusExchangeModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {tr('labfull.cancel')}
              </button>
              <button
                type="button"
                onClick={confirmStatusChange}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs"
              >
                {tr('labfull.confirmUpdateStatus')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3D Scan Viewer Modal */}
      {isScanViewerModalOpen && (
        <Dental3DScanViewerModal
          isOpen={true}
          onClose={() => setIsScanViewerModalOpen(false)}
          patientId={selectedPatientId || order?.patient}
          orderId={order?.id}
          patientName={patientName}
          orderNumber={orderNumber}
          initialFileName={patientScanMeta?.fileName}
          onSaveScan={(data) => {
            if (data.hasScan) {
              setHasScan(true);
              setPatientScanMeta({
                fileName: data.fileName,
                sizeMb: data.fileSize ? (data.fileSize / (1024 * 1024)).toFixed(1) : undefined
              });
            }
          }}
        />
      )}

      {/* Rentgen / Romexis KT Viewer Modal */}
      {isRentgenViewerModalOpen && (
        <DentalRentgenViewerModal
          isOpen={true}
          onClose={() => setIsRentgenViewerModalOpen(false)}
          patientId={selectedPatientId || order?.patient}
          orderId={order?.id}
          patientName={patientName}
          orderNumber={orderNumber}
          initialFileName={patientRentgenMeta?.fileName}
          onSaveRentgen={(data) => {
            if (data.hasXray) {
              setHasXray(true);
              setPatientRentgenMeta({
                fileName: data.fileName,
                sizeMb: data.fileSize ? (data.fileSize / (1024 * 1024)).toFixed(1) : undefined,
                isZip: data.isCTPackage
              });
            }
          }}
        />
      )}

    </div>
  );
}
