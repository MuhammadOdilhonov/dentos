'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { clinicApi } from '../../../lib/api';
import { Patient, Employee, Appointment, ClinicTask, NaryadLogEntry, TreatmentProcedureItem, TreatmentPlanStage, NaryadCatalogItem, DentalLabOrder } from '../../../lib/types';
import { PaidInvoiceModal, InvoiceItem } from '../../../components/PaidInvoiceModal';
import { ActiveCheckoutModal, CheckoutItem } from '../../../components/ActiveCheckoutModal';
import DentalChart from '../../../components/DentalChart';
import PatientEditModal from '../../../components/PatientEditModal';
import NaryadModal, { NaryadCartItem } from '../../../components/NaryadModal';
import LabOrderFullModal from '../../../components/LabOrderFullModal';
import NewAppointmentModal from '../../../components/NewAppointmentModal';
import AppointmentModal from '../../../components/AppointmentModal';
import VoiceAudioPlayer from '../../../components/VoiceAudioPlayer';
import ToothIcon from '../../../components/ToothIcon';
import Dental3DScanViewerModal from '../../../components/Dental3DScanViewerModal';
import DentalRentgenViewerModal from '../../../components/DentalRentgenViewerModal';
import KeynoteDentalPhotoProtocol from '../../../components/KeynoteDentalPhotoProtocol';
import { dentalMediaStore } from '../../../lib/dentalMediaStore';
import { useI18n } from '../../../lib/i18n';
import { useAuth } from '../../../lib/auth';
import { useBranch } from '../../../lib/branchContext';
import {
  Printer,
  Calendar,
  BarChart3,
  ShoppingCart,
  Plus,
  Edit2,
  Phone,
  Send,
  CalendarDays,
  X,
  User,
  Paperclip,
  Camera,
  Mic,
  CheckCircle2,
  FileText,
  Clock,
  EyeOff,
  XCircle,
  Watch,
  Trash2,
  Search,
  Upload,
  Image as ImageIcon,
  DollarSign,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Target,
  Check,
  PhoneCall,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Sun,
  Contrast,
  Sliders,
  Download,
  ExternalLink,
  Bot,
  Play,
  Square,
  Radio,
  CheckCheck,
  Building2,
  Sparkles,
  Share2,
  Smile,
  ShieldCheck,
  ClipboardList,
  Copy,
  Activity,
  UserPlus,
  Layers,
  Type,
  Maximize2,
  Lock,
  Boxes,
  Eye,
  HardDrive
} from 'lucide-react';

interface NoteItem {
  id: number;
  text: string;
  author: string;
  avatarText: string;
  date: string;
  time: string;
  kind?: 'text' | 'voice' | 'photo';
  imageUrl?: string;   // for single photo / backwards compatibility
  images?: string[];   // up to 5 photos!
  audioUrl?: string;   // for voice notes
  audioDur?: number;   // voice length in seconds
}

interface XrayItem {
  id: number;
  toothNumber: string;
  date: string;
  type: string;
  quantity: number;
  dose: string;
  imageUrl: string;
  doctor: string;
  fileName?: string;
  fileSize?: number;
  isZipPackage?: boolean;
}

interface TreatmentItem {
  id: number;
  code: string;
  title: string;
  duration: string;
  price: number;
  status: 'Сделано' | 'В плане';
  doctor: string;
  date: string;
}

interface PaymentInvoice {
  id: number;
  date: string;
  status: 'Оплачен' | 'Отменен';
  paid: number;
  total: number;
  method?: string;
  operator?: string;
  operator_role?: string; // yakunlagan xodim roli (director / kassa) — "director yopdi" ko'rsatish uchun
  target?: 'debt' | 'balance';
  description?: string;
  discount?: number; // berilgan chegirma (so'm) — direktor/kassa ko'radi
  items?: InvoiceItem[]; // urilgan naryad qatorlari — schetda aynan shular ko'rsatiladi
  branch_id?: number | null;
  branch_name?: string | null;
}

interface CommunicationLog {
  id: number;
  type: 'sms' | 'telegram' | 'whatsapp' | 'call' | 'bot';
  title: string;
  message: string;
  date: string;
  status: 'Доставлено' | 'Прочитано' | 'Отправлено' | 'Завершено';
  duration?: string;
  isIncoming?: boolean;
}


interface LabOrder {
  id: string;
  tooth: string;
  type: string;
  material: string;
  colorShade: string;
  technician: string;
  labName: string;
  sentDate: string;
  dueDate: string;
  status: 'В работе' | 'Готово в клинике' | 'На примерке';
  price: number;
  createdBy?: string;   // kim yaratdi
  createdAt?: string;   // qachon yaratildi
  deleted?: boolean;    // o'chirilgan (hra) — ro'yxatdan yo'qolmaydi
  deletedBy?: string;   // kim o'chirdi
  deletedAt?: string;   // qachon o'chirildi
}

interface SurveyItem {
  id: number;
  title: string;
  category: string;
  date: string;
  status: 'Заполнено' | 'Ожидает заполнения';
  score?: string;
  summary: string;
  questionsCount: number;
}

// The operator (admin/reception) currently acting — shown in the naryad activity log
const CURRENT_OPERATOR = 'Мухаммад Одилхонов';

export default function PatientDetailPage() {
  const { t, language, tk, tr } = useI18n();
  const { user } = useAuth();
  const { currentBranch, currentBranchId, branches } = useBranch();
  const isAdmin = user?.role === 'admin';
  const isDirector = user?.role === 'director' || user?.role === 'superadmin' || user?.role === 'deputy_director';
  const params = useParams();
  const patientId = params?.id ? Number(params.id) : 1;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [newTreatmentBranchId, setNewTreatmentBranchId] = useState<number | null>(null);
  const [newPaymentBranchId, setNewPaymentBranchId] = useState<number | null>(null);
  // Doctors involved with this patient (derived from their appointments)
  const [participants, setParticipants] = useState<Employee[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [isNewAptOpen, setIsNewAptOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('Основные');
  const [subTab, setSubTab] = useState<'Заметки' | 'Telegram'>('Заметки');

  // Tab: Записи — real appointments belonging to this patient (from the store)
  const [appointmentFilter, setAppointmentFilter] = useState<'Все' | 'Прошедшие' | 'Запланировано'>('Все');
  const [patientAppointments, setPatientAppointments] = useState<Appointment[]>([]);
  const [aptSearch, setAptSearch] = useState('');
  const [aptDoctor, setAptDoctor] = useState('');

  // Tab: Заметки — per-patient, starts empty; notes/voice/photo added via composer.
  const [noteInputText, setNoteInputText] = useState('');
  const [notesList, setNotesList] = useState<NoteItem[]>([]);
  const [pendingNotePhotos, setPendingNotePhotos] = useState<string[]>([]);
  const [fullscreenImagePreview, setFullscreenImagePreview] = useState<string | null>(null);

  // Voice recording state (Ovozli eslatma)
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [voicePreview, setVoicePreview] = useState<{ url: string; dur: number } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecondsRef = useRef(0);
  const notePhotoInputRef = useRef<HTMLInputElement | null>(null);

  // Real-time microphone audio visualizer state
  const [micWaveBars, setMicWaveBars] = useState<number[]>([
    15, 25, 40, 20, 35, 55, 30, 65, 45, 75, 50, 35, 60, 45, 70, 50, 30, 65, 40, 25, 20, 20, 25, 30, 20, 35, 45, 25, 20, 15, 20, 25
  ]);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnimFrameRef = useRef<number | null>(null);

  // Tab: Лечение (Davolash)
  const [patientTreatments, setPatientTreatments] = useState<any[]>([]);
  const [isAddTreatmentModalOpen, setIsAddTreatmentModalOpen] = useState(false);
  const [newTreatmentTooth, setNewTreatmentTooth] = useState('16');
  const [newTreatmentTitle, setNewTreatmentTitle] = useState('Кариес дентина (световая пломба Estelite)');
  const [newTreatmentPrice, setNewTreatmentPrice] = useState(450000);
  const [newTreatmentDoctor, setNewTreatmentDoctor] = useState('Сардор Алимов');
  const [newTreatmentStatus, setNewTreatmentStatus] = useState<'Сделано' | 'В процессе'>('Сделано');
  const [newTreatmentCategory, setNewTreatmentCategory] = useState('Терапия');

  const [treatmentFilter, setTreatmentFilter] = useState<'date' | 'teeth'>('teeth');
  const [treatments] = useState<TreatmentItem[]>([
    {
      id: 1,
      code: '00001',
      title: 'Рельсовый бюгельный протез на имплантатах (на балке)',
      duration: '180 мин.',
      price: 25000000,
      status: 'Сделано',
      doctor: 'Сардор Мирахмедов',
      date: 'сентябрь 5-го 2026'
    },
    {
      id: 2,
      code: '0001292',
      title: 'Placement of a healing abutment',
      duration: '45 мин.',
      price: 700000,
      status: 'Сделано',
      doctor: 'Сардор Мирахмедов',
      date: 'сентябрь 5-го 2026'
    },
    {
      id: 3,
      code: '0001292',
      title: 'Placement of a healing abutment',
      duration: '45 мин.',
      price: 700000,
      status: 'Сделано',
      doctor: 'Сардор Мирахмедов',
      date: 'сентябрь 5-го 2026'
    }
  ]);

  // Tab: Рентген (Screenshot 5)
  const [xrays, setXrays] = useState<XrayItem[]>([]); // per-patient — added via 'Новый рентген', localStorage'da saqlanadi
  const [xraySearch, setXraySearch] = useState('');
  const [isNewXrayOpen, setIsNewXrayOpen] = useState(false);
  // 2 tugma = rejim almashtirgich: "Рентген" ma'lumotlari yoki "Фото" (Word-uslubidagi hujjat)
  const [xrayViewMode, setXrayViewMode] = useState<'rentgen' | 'foto'>('rentgen');

  // ── 3D Skan (per-patient) ──
  const [patient3DScan, setPatient3DScan] = useState<{ hasScan: boolean; scanDate?: string; notes?: string; fileName?: string }>({ hasScan: false });
  const [is3DScanModalOpen, setIs3DScanModalOpen] = useState(false);
  const [is3DScanViewerOpen, setIs3DScanViewerOpen] = useState(false);
  const [isRentgenViewerOpen, setIsRentgenViewerOpen] = useState(false);
  const [selectedRentgenItem, setSelectedRentgenItem] = useState<any>(null);
  const [newXrayFile, setNewXrayFile] = useState<File | null>(null);
  const scanFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleToggle3DScan = (has: boolean) => {
    if (!patient?.id) return;
    const updated = { ...patient3DScan, hasScan: has, scanDate: new Date().toISOString().split('T')[0] };
    setPatient3DScan(updated);
    clinicApi.savePatient3DScan(patient.id, updated);
  };

  const handle3DScanFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !patient?.id) return;
    const file = files[0];
    
    // Store real binary file into IndexedDB
    await dentalMediaStore.saveScan(patient.id, file, file.name);

    const updated = {
      hasScan: true,
      scanDate: new Date().toISOString().split('T')[0],
      fileName: file.name,
      notes: `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`
    };
    setPatient3DScan(updated);
    clinicApi.savePatient3DScan(patient.id, updated);
    setIs3DScanViewerOpen(true);
  };

  // ── Foto: Word-uslubidagi hujjat bloklari (matn + rasm), per-patient, base64 saqlanadi ──
  type DocBlock =
    | { id: number; kind: 'text'; text: string; align: 'left' | 'center' | 'right'; heading: boolean }
    | { id: number; kind: 'image'; url: string; caption: string; width: 'sm' | 'md' | 'lg' | 'full'; align: 'left' | 'center' | 'right' };
  const [photoDoc, setPhotoDoc] = useState<DocBlock[]>([]);
  const dataLoadedRef = useRef(false); // load tugagachgina saqlash effektlari ishlaydi (bo'sh bilan ustiga yozib yubormasin)
  const xrayPhotoInputRef = useRef<HTMLInputElement | null>(null);
  // Rasm fayllarni base64 (dataURL) ga o'girib bloklar sifatida qo'shadi — reload'dan keyin ham saqlanadi
  const handleXrayPhotos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((f, i) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const url = evt.target?.result as string;
        if (!url) return;
        setPhotoDoc((prev) => [...prev, {
          id: Date.now() + Math.random() + i,
          kind: 'image' as const,
          url,
          caption: '',
          width: 'md' as const,
          align: 'center' as const
        }]);
      };
      reader.readAsDataURL(f);
    });
  };
  const updateDocBlock = (id: number, updates: Partial<DocBlock>) =>
    setPhotoDoc((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } as DocBlock : b)));
  const removeDocBlock = (id: number) => setPhotoDoc((prev) => prev.filter((b) => b.id !== id));
  const moveDocBlock = (id: number, dir: -1 | 1) => setPhotoDoc((prev) => {
    const idx = prev.findIndex((b) => b.id === id);
    if (idx < 0) return prev;
    const j = idx + dir;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  });
  const addTextBlock = () => setPhotoDoc((prev) => [...prev, { id: Date.now() + Math.random(), kind: 'text', text: '', align: 'left', heading: false }]);
  const [newXrayTooth, setNewXrayTooth] = useState('16');
  const [newXrayType, setNewXrayType] = useState('Прицельный радиовизиографический снимок');
  const [newXrayDose, setNewXrayDose] = useState('0.002 мЗв');
  const [newXrayCustomUrl, setNewXrayCustomUrl] = useState('');
  const [selectedXrayView, setSelectedXrayView] = useState<XrayItem | null>(null);
  const [xrayZoom, setXrayZoom] = useState(100);
  const [xrayInverted, setXrayInverted] = useState(false);
  const [xrayBrightness, setXrayBrightness] = useState(100);
  const [xrayContrast, setXrayContrast] = useState(100);

  // Tab: Оплаты (Screenshot 1)
  const [paymentSubTab, setPaymentSubTab] = useState<'Все' | 'Счета' | 'Оплаты' | 'Общий счет'>('Все');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [selectedDatePeriod, setSelectedDatePeriod] = useState('Сегодня'); // default: bugun
  // "Указать период" (davrni tanlash) → dan/gacha kun filtri
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Date range filter for patient records ("Sanadan - Sanagacha", defaults to today "Bugun")
  const getTodayStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };


  // Cancelled / X-marked treatment records that must NEVER appear in Davolash (Лечение)
  const [cancelledTreatmentIds, setCancelledTreatmentIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(`32desk_cancelled_treatments_${patientId}`);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const handleCancelTreatment = (id: string | number) => {
    const idStr = String(id);
    const next = Array.from(new Set([...cancelledTreatmentIds, idStr]));
    setCancelledTreatmentIds(next);
    if (typeof window !== 'undefined' && patient) {
      try {
        localStorage.setItem(`32desk_cancelled_treatments_${patient.id}`, JSON.stringify(next));
      } catch (e) {}
    }

    // If it's an appointment (starts with 'apt-'), update its status to 'cancelled'
    if (idStr.startsWith('apt-')) {
      const aptId = Number(idStr.replace('apt-', ''));
      if (aptId) {
        clinicApi.updateAppointmentStatus(aptId, 'cancelled').catch(() => {});
        setPatientAppointments((prev) => prev.map((a) => (a.id === aptId ? { ...a, status: 'cancelled' } : a)));
      }
    }
    // If it's a treatment (starts with 't-'), remove it from patientTreatments
    if (idStr.startsWith('t-')) {
      const tId = Number(idStr.replace('t-', ''));
      setPatientTreatments((prev) => {
        const updated = prev.filter((t) => t.id !== tId);
        if (patient) clinicApi.savePatientTreatments(patient.id, updated);
        return updated;
      });
    }
    // If it's a naryad (starts with 'nar-'), remove it from patientNaryads
    if (idStr.startsWith('nar-')) {
      const nId = Number(idStr.replace('nar-', ''));
      setPatientNaryads((prev) => {
        const updated = prev.filter((n) => n.id !== nId);
        if (patient) clinicApi.savePatientNaryads(patient.id, updated);
        return updated;
      });
    }
  };

  // Payment receipts (balance top-ups / checkout payments) — per patient, start empty.
  const [invoices, setInvoices] = useState<PaymentInvoice[]>([]);
  const [isAddPaymentModalOpen, setIsAddPaymentModalOpen] = useState(false);
  // Selected appointment modal when clicking on any appointment in the list
  const [selectedAptModal, setSelectedAptModal] = useState<Appointment | null>(null);
  // Treatment (Лечение) detail modal — the completed record clicked open.
  const [treatmentModalApt, setTreatmentModalApt] = useState<Appointment | null>(null);
  const [newPaymentAmount, setNewPaymentAmount] = useState('500000');
  const [newPaymentMethod, setNewPaymentMethod] = useState('Наличные');
  const [newPaymentDiscount, setNewPaymentDiscount] = useState('0'); // chegirma (so'm)
  const [newPaymentTarget, setNewPaymentTarget] = useState<'debt' | 'balance'>('debt');

  // Tab: Связь (Screenshot 2: SMS, Telegram, WhatsApp, Bot, Calls)
  const [commsFilter, setCommsFilter] = useState<'all' | 'scheduled' | 'calls' | 'sms' | 'telegram' | 'whatsapp'>('all');
  const [commsMessages, setCommsMessages] = useState<CommunicationLog[]>([]); // per-patient

  // SMS Center state
  const [smsDraft, setSmsDraft] = useState('Уважаемый пациент! Напоминаем о записи на прием в 32Desk.');
  const [smsSentSuccess, setSmsSentSuccess] = useState(false);

  // Telegram & Bot state
  const [tgDraft, setTgDraft] = useState('');
  const [tgBotStatus, setTgBotStatus] = useState('Online');
  const [tgMessagesList, setTgMessagesList] = useState<{ sender: 'bot' | 'patient'; text: string; time: string }[]>([]); // per-patient
  // REAL Telegram chat (ulangan akkaunt orqali bemor raqami bo'yicha)
  const [tgChatState, setTgChatState] = useState<'idle' | 'loading' | 'not_connected' | 'not_found' | 'no_history' | 'ready' | 'error'>('idle');
  const [tgRealMessages, setTgRealMessages] = useState<{ id: number; text: string; out: boolean; date: string; media_type?: string | null; media_url?: string | null }[]>([]);
  const [tgChatUser, setTgChatUser] = useState<{ first_name?: string; last_name?: string; username?: string; phone?: string } | null>(null);
  const [tgChatError, setTgChatError] = useState('');
  const [tgSending, setTgSending] = useState(false);
  // REAL WhatsApp (Cloud API) chat
  const [waChatState, setWaChatState] = useState<'idle' | 'loading' | 'not_connected' | 'ready'>('idle');
  const [waMessages, setWaMessages] = useState<{ id: string; text: string; out: boolean; date: string }[]>([]);
  const [waDraftReal, setWaDraftReal] = useState('');
  const [waSending, setWaSending] = useState(false);
  // Telegram Sozlamalarда ulanganmi (ulanmagan bo'lsa chat o'rniga "ulang" ko'rsatamiz)
  const [socialTgConnected, setSocialTgConnected] = useState(true);
  // Xabar shablonlari (Sozlamalarда yaratiladi) — Aloqada tanlab qo'yiladi
  const [msgTemplates, setMsgTemplates] = useState<{ id: number; title: string; uz: string; ru: string; en: string }[]>([]);
  const [showTplPicker, setShowTplPicker] = useState(false);
  const [showSvcLangMenu, setShowSvcLangMenu] = useState(false);
  const handleQuickChangeLang = async (newLang: 'uz' | 'ru' | 'en') => {
    if (!patient) return;
    setPatient((prev) => prev ? { ...prev, service_lang: newLang } : prev);
    await clinicApi.updatePatientLang(patient.id, newLang);
    setShowSvcLangMenu(false);
  };
  const renderTemplate = (tpl: { uz: string; ru: string; en: string }) => {
    const pLang = patient?.service_lang || 'uz';
    const txt = (pLang === 'uz' ? tpl.uz : pLang === 'en' ? tpl.en : tpl.ru) || tpl.uz || tpl.ru || tpl.en || '';
    const now = new Date();
    return txt
      .replace(/\{name\}/g, patient?.full_name || '')
      .replace(/\{phone\}/g, patient?.phone || '')
      .replace(/\{clinic\}/g, 'Dent Academy')
      .replace(/\{date\}/g, now.toLocaleDateString(pLang === 'uz' ? 'uz-UZ' : pLang === 'en' ? 'en-US' : 'ru-RU'))
      .replace(/\{time\}/g, now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      .replace(/\{doctor\}/g, participants[0]?.full_name || '');
  };

  useEffect(() => {
    if (!patient) return;
    const pLang = patient.service_lang || 'uz';
    if (pLang === 'uz') {
      setSmsDraft(`Assalomu alaykum, ${patient.full_name || 'Hurmatli bemor'}! Sizni 32Desk klinikasidagi qabulingiz haqida eslatib o'tamiz.`);
      setWaDraft(`Assalomu alaykum, ${patient.full_name || ''}! 32Desk stomatologiya klinikasidan bezovta qilyapmiz.`);
    } else if (pLang === 'en') {
      setSmsDraft(`Hello, ${patient.full_name || 'Dear patient'}! Reminding you of your upcoming appointment at 32Desk.`);
      setWaDraft(`Hello, ${patient.full_name || ''}! We are contacting you from 32Desk dental clinic.`);
    } else {
      setSmsDraft(`Здравствуйте, ${patient.full_name || 'Уважаемый пациент'}! Напоминаем о записи на прием в 32Desk.`);
      setWaDraft(`Здравствуйте, ${patient.full_name || ''}! Беспокоим из стоматологической клиники 32Desk.`);
    }
  }, [patient?.id, patient?.service_lang, patient?.full_name]);

  // WhatsApp state
  const [waDraft, setWaDraft] = useState('Здравствуйте! Беспокоим из стоматологической клиники 32Desk.');

  // Calling simulation state
  const [isCallingModalOpen, setIsCallingModalOpen] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  // Tab: Задачи (Screenshot 3)
  const [taskExpanded, setTaskExpanded] = useState(true);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<number, boolean>>({ 1: true });
  const toggleTaskExpanded = (id: number) => setExpandedTaskIds((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [taskServiceReceived, setTaskServiceReceived] = useState(
    '2 степень - Профессиональная гигиена полости рта, удаление без выраженных зубных отложений по Швейцарскому протоколу GBT на EMS аппарате'
  );
  const [taskServiceUpcoming, setTaskServiceUpcoming] = useState(
    '2 степень - Профессиональная гигиена полости рта, удаление без выраженных зубных отложений по Швейцарскому протоколу GBT на EMS аппарате'
  );
  // Real per-patient tasks (32desk-style add form: type, dates, member, service, note)
  const [patientTasks, setPatientTasks] = useState<Array<{
    id: number;
    type: 'treatment' | 'reminder';
    start: string;
    due: string;
    member: string;
    assignee?: number;
    creator?: number;
    creator_name?: string;
    creator_role?: string;
    completed_by?: number | string;
    completed_by_name?: string;
    completed_at?: string;
    stage?: 'new' | 'in_progress' | 'review' | 'completed';
    service: string;
    note: string;
    done: boolean;
  }>>([]);
  const [taskType, setTaskType] = useState<'treatment' | 'reminder'>('treatment');
  const [taskStart, setTaskStart] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskMember, setTaskMember] = useState('');
  const [taskServiceName, setTaskServiceName] = useState('');
  const [taskNote, setTaskNote] = useState('');
  const [taskStage, setTaskStage] = useState<'new' | 'in_progress' | 'review' | 'completed'>('new');
  const [editingPatientTask, setEditingPatientTask] = useState<any | null>(null);

  // Determine if a task belongs to the current logged in doctor/user
  const isPatientTaskOwner = (task: { assignee?: number; member?: string; creator?: number; creator_name?: string }) => {
    if (!user) return false;
    const currentUserId = String(user.id);
    const currentUserName = user.name?.toLowerCase().trim() || '';
    const currentUsername = user.username?.toLowerCase().trim() || '';

    // Direct ID match
    if (task.assignee !== undefined && String(task.assignee) === currentUserId) return true;
    if (task.creator !== undefined && String(task.creator) === currentUserId) return true;

    // Match by employee list
    const myEmp = allEmployees.find(
      (e) =>
        (e.username && e.username.toLowerCase() === currentUsername) ||
        (e.full_name && currentUserName && (
          e.full_name.toLowerCase().includes(currentUserName) ||
          currentUserName.includes(e.full_name.toLowerCase())
        )) ||
        String(e.id) === currentUserId
    );

    if (myEmp) {
      if (task.assignee !== undefined && (task.assignee === myEmp.id || String(task.assignee) === String(myEmp.id))) return true;
      if (task.creator !== undefined && (task.creator === myEmp.id || String(task.creator) === String(myEmp.id))) return true;
      if (task.member && myEmp.full_name && (
        task.member.toLowerCase().includes(myEmp.full_name.toLowerCase()) ||
        myEmp.full_name.toLowerCase().includes(task.member.toLowerCase())
      )) return true;
    }

    // Name match
    if (task.member && currentUserName && (
      task.member.toLowerCase().includes(currentUserName) ||
      currentUserName.includes(task.member.toLowerCase())
    )) return true;

    if (task.creator_name && currentUserName && (
      task.creator_name.toLowerCase().includes(currentUserName) ||
      currentUserName.includes(task.creator_name.toLowerCase())
    )) return true;

    return false;
  };

  // Director can modify ANY task; Doctors can modify only tasks assigned to them / owned by them
  const canModifyPatientTask = (task: { assignee?: number; member?: string; creator?: number; creator_name?: string }) => {
    if (!user) return false;
    if (isDirector) return true;
    return isPatientTaskOwner(task);
  };

  const loadPatientTasks = async (pId: number) => {
    try {
      const allTasks = await clinicApi.getTasks();
      const pTasks = allTasks.filter((t) => t.patient === pId);
      if (pTasks.length > 0) {
        setPatientTasks(
          pTasks.map((t) => ({
            id: t.id,
            type: t.task_type === 'reminder' ? 'reminder' : 'treatment',
            start: t.start_date || t.created_at?.split('T')[0] || 'Bugun',
            due: t.due_date || '',
            member: t.assignee_name || 'Shifokor',
            assignee: t.assignee,
            creator: t.creator,
            creator_name: t.creator_name,
            creator_role: t.creator_role,
            completed_by: t.completed_by,
            completed_by_name: t.completed_by_name,
            completed_at: t.completed_at,
            stage: t.stage || (t.status === 'completed' ? 'completed' : 'in_progress'),
            service: t.service || t.title,
            note: t.description || '',
            done: t.status === 'completed'
          }))
        );
      } else {
        const creatorDisplayName = user?.name
          ? `${user.name}${isDirector ? ' (Direktor)' : ''}`
          : isDirector ? 'Direktorat' : 'Sardor Alimov';

        const defaultSample = await clinicApi.createTask({
          title: '2 daraja - Og‘iz bo‘shlig‘i gigiyenasi va tozalash',
          description: 'Bemor tashrifdan 1 kun oldin eslatishni so‘radi.',
          patient: pId,
          patient_name: patient?.full_name || 'Bemor',
          assignee_name: 'Sardor Alimov',
          assignee: user?.id ? Number(user.id) : undefined,
          creator: user?.id ? Number(user.id) : undefined,
          creator_name: creatorDisplayName,
          creator_role: user?.role || (isDirector ? 'director' : 'doctor'),
          priority: 'medium',
          status: 'pending',
          stage: 'new',
          start_date: new Date().toISOString().split('T')[0],
          due_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          task_type: 'treatment',
          service: '2 daraja - Og‘iz bo‘shlig‘i gigiyenasi va tozalash'
        });
        setPatientTasks([
          {
            id: defaultSample.id,
            type: 'treatment',
            start: defaultSample.start_date || 'Bugun',
            due: defaultSample.due_date || '',
            member: defaultSample.assignee_name || 'Sardor Alimov',
            assignee: defaultSample.assignee,
            creator: defaultSample.creator,
            creator_name: defaultSample.creator_name,
            creator_role: defaultSample.creator_role,
            completed_by: undefined,
            completed_by_name: undefined,
            completed_at: undefined,
            stage: 'new',
            service: defaultSample.service || defaultSample.title,
            note: defaultSample.description || '',
            done: false
          }
        ]);
      }
    } catch (e) {
      console.error('Error loading patient tasks:', e);
    }
  };

  const handleTogglePatientTask = async (taskId: number, currentDone: boolean, taskItem?: any) => {
    if (taskItem && !canModifyPatientTask(taskItem)) {
      alert("Ushbu vazifa boshqa xodimga biriktirilgan. Siz faqat o'zingizning vazifalaringiz statusini o'zgartira olasiz!");
      return;
    }
    const nextDone = !currentDone;
    const nowFormatted = new Date().toLocaleString('uz-UZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const patch: Partial<ClinicTask> = {
      status: nextDone ? 'completed' : 'pending',
      stage: nextDone ? 'completed' : 'in_progress',
      completed_by: nextDone ? user?.id : undefined,
      completed_by_name: nextDone ? (user?.name || (isDirector ? 'Direktor' : 'Shifokor')) : undefined,
      completed_at: nextDone ? nowFormatted : undefined
    };

    setPatientTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, done: nextDone, ...patch } : t))
    );
    await clinicApi.updateTask(taskId, patch);
  };

  const handleUpdatePatientTaskStage = async (taskId: number, newStage: 'new' | 'in_progress' | 'review' | 'completed', taskItem?: any) => {
    if (taskItem && !canModifyPatientTask(taskItem)) {
      alert("Ushbu vazifani faqat direktor yoki mas'ul xodim o'zgartirishi mumkin!");
      return;
    }
    const isDone = newStage === 'completed';
    const nowFormatted = new Date().toLocaleString('uz-UZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const patch: Partial<ClinicTask> = {
      stage: newStage,
      status: isDone ? 'completed' : 'pending',
      completed_by: isDone ? user?.id : undefined,
      completed_by_name: isDone ? (user?.name || (isDirector ? 'Direktor' : 'Shifokor')) : undefined,
      completed_at: isDone ? nowFormatted : undefined
    };

    setPatientTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, done: isDone, ...patch } : t))
    );
    await clinicApi.updateTask(taskId, patch);
  };

  const handleDeletePatientTask = async (taskId: number, taskItem?: any) => {
    if (taskItem && !canModifyPatientTask(taskItem)) {
      alert("Siz faqat o'zingizning vazifalaringizni o'chira olasiz!");
      return;
    }
    setPatientTasks((prev) => prev.filter((t) => t.id !== taskId));
    await clinicApi.deleteTask(taskId);
  };

  const handleSaveEditPatientTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPatientTask) return;

    const chosenEmp = allEmployees.find(
      (emp) => emp.id.toString() === String(editingPatientTask.assignee) || emp.full_name === editingPatientTask.member
    );
    const memberName = chosenEmp ? chosenEmp.full_name : (editingPatientTask.member || 'Shifokor');
    const isDone = editingPatientTask.stage === 'completed' || editingPatientTask.done;

    const nowFormatted = new Date().toLocaleString('uz-UZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const patch: Partial<ClinicTask> = {
      title: editingPatientTask.service || editingPatientTask.title,
      service: editingPatientTask.service || editingPatientTask.title,
      description: editingPatientTask.note,
      assignee: chosenEmp ? chosenEmp.id : editingPatientTask.assignee,
      assignee_name: memberName,
      stage: editingPatientTask.stage,
      status: isDone ? 'completed' : 'pending',
      due_date: editingPatientTask.due,
      start_date: editingPatientTask.start,
      completed_by: isDone ? (editingPatientTask.completed_by || user?.id) : undefined,
      completed_by_name: isDone ? (editingPatientTask.completed_by_name || user?.name || (isDirector ? 'Direktor' : 'Shifokor')) : undefined,
      completed_at: isDone ? (editingPatientTask.completed_at || nowFormatted) : undefined
    };

    setPatientTasks((prev) =>
      prev.map((t) =>
        t.id === editingPatientTask.id
          ? {
              ...t,
              ...patch,
              member: memberName,
              service: patch.service || t.service,
              note: patch.description || '',
              done: isDone
            }
          : t
      )
    );

    await clinicApi.updateTask(editingPatientTask.id, patch);
    setEditingPatientTask(null);
  };

  const handleCreatePatientTask = async () => {
    if (!patient) return;
    const chosenEmp = allEmployees.find(
      (e) =>
        e.full_name === taskMember ||
        String(e.id) === taskMember ||
        (taskMember && e.full_name.toLowerCase().includes(taskMember.toLowerCase()))
    );

    const chosenMemberName = chosenEmp ? chosenEmp.full_name : (taskMember || user?.name || 'Shifokor');
    const chosenAssigneeId = chosenEmp ? chosenEmp.id : (user?.id ? Number(user.id) : undefined);
    const creatorId = user?.id ? Number(user.id) : undefined;
    const creatorDisplayName = user?.name
      ? `${user.name}${isDirector ? ' (Direktor)' : ''}`
      : isDirector ? 'Direktorat' : 'Shifokor';

    const newTask = await clinicApi.createTask({
      title: taskServiceName || (taskType === 'treatment' ? 'Muolaja rejasi' : 'Eslatma / Qayta qo‘ng‘iroq'),
      description: taskNote,
      patient: patient.id,
      patient_name: patient.full_name,
      assignee: chosenAssigneeId,
      assignee_name: chosenMemberName,
      creator: creatorId,
      creator_name: creatorDisplayName,
      creator_role: user?.role || (isDirector ? 'director' : 'doctor'),
      priority: 'medium',
      status: taskStage === 'completed' ? 'completed' : 'pending',
      stage: taskStage,
      start_date: taskStart || new Date().toISOString().split('T')[0],
      due_date: taskDue || new Date().toISOString().split('T')[0],
      task_type: taskType,
      service: taskServiceName || (taskType === 'treatment' ? 'Stomatologik muolaja' : 'Eslatma')
    });

    setPatientTasks((prev) => [
      {
        id: newTask.id,
        type: taskType,
        start: taskStart || new Date().toISOString().split('T')[0],
        due: taskDue || new Date().toISOString().split('T')[0],
        member: chosenMemberName,
        assignee: chosenAssigneeId,
        creator: creatorId,
        creator_name: creatorDisplayName,
        creator_role: newTask.creator_role,
        completed_by: taskStage === 'completed' ? user?.id : undefined,
        completed_by_name: taskStage === 'completed' ? (user?.name || (isDirector ? 'Direktor' : 'Shifokor')) : undefined,
        completed_at: taskStage === 'completed' ? new Date().toLocaleDateString('uz-UZ') : undefined,
        stage: taskStage,
        service: taskServiceName || newTask.title,
        note: taskNote,
        done: taskStage === 'completed'
      },
      ...prev
    ]);
    setTaskStart(''); setTaskDue(''); setTaskMember(''); setTaskServiceName(''); setTaskNote(''); setTaskStage('new');
    setIsAddTaskModalOpen(false);
  };

  // Tab: План лечения state
  const [treatmentPlans, setTreatmentPlans] = useState<TreatmentPlanStage[]>([]);
  const [planDiscountPercent, setPlanDiscountPercent] = useState<number>(0);
  const [planPaidAmount, setPlanPaidAmount] = useState<number>(0);
  const [addingProcStageId, setAddingProcStageId] = useState<number | null>(null);
  const [procCatalogSearch, setProcCatalogSearch] = useState('');
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<NaryadCatalogItem | null>(null);
  const [procCustomTitle, setProcCustomTitle] = useState('');
  const [procTeeth, setProcTeeth] = useState('');
  const [procQty, setProcQty] = useState(1);
  const [procPrice, setProcPrice] = useState(0);

  // Tab: Наряды (Naryad journal) filters
  const [naryadLogFilter, setNaryadLogFilter] = useState<'all' | 'added' | 'removed'>('all');
  const [naryadLogSearch, setNaryadLogSearch] = useState('');

  // ── Yangi bosqich (Этап) qo'shish uchun KATTA modal (32desk uslubi) ──
  const [showStageModal, setShowStageModal] = useState(false);
  const [stageTitle, setStageTitle] = useState('');
  const [stageDesc, setStageDesc] = useState('');
  const [stageDoctor, setStageDoctor] = useState('');
  const [stageStatus, setStageStatus] = useState<TreatmentPlanStage['status']>('Запланировано');
  const [stageProcs, setStageProcs] = useState<TreatmentProcedureItem[]>([]);
  // modal ichida bitta muolaja qo'shish formasi
  const [spTeeth, setSpTeeth] = useState('');
  const [spTitle, setSpTitle] = useState('');
  const [spQty, setSpQty] = useState(1);
  const [spPrice, setSpPrice] = useState(0);

  // Rentgen ro'yxati o'zgarsa → saqlash
  useEffect(() => {
    if (!patient || !dataLoadedRef.current) return;
    clinicApi.savePatientXrays(patient.id, xrays);
  }, [xrays, patient]);

  // Foto hujjat bloklari o'zgarsa → saqlash
  useEffect(() => {
    if (!patient || !dataLoadedRef.current) return;
    clinicApi.savePatientPhotoDoc(patient.id, photoDoc);
  }, [photoDoc, patient]);

  // Aloqa xabarlari o'zgarsa → saqlash (malumot yig'ilib turadi)
  useEffect(() => {
    if (!patient || !dataLoadedRef.current) return;
    clinicApi.savePatientComms(patient.id, commsMessages);
  }, [commsMessages, patient]);

  // Telegram chat tarixi o'zgarsa → saqlash
  useEffect(() => {
    if (!patient || !dataLoadedRef.current) return;
    clinicApi.savePatientTgChat(patient.id, tgMessagesList);
  }, [tgMessagesList, patient]);

  // Telegram sub-view ochilganda bemor bilan REAL yozishmani avtomatik qidiradi
  useEffect(() => {
    if (activeTab === 'Связь' && commsFilter === 'telegram' && patient) {
      loadTgChat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, commsFilter, patient?.id, patient?.phone]);

  // REAL-TIME: Telegram sub-view ochiq turganda har 3.5s da jim yangilab turadi (yangi xabarlar avtomatik chiqadi)
  useEffect(() => {
    if (activeTab !== 'Связь' || commsFilter !== 'telegram' || !patient) return;
    const iv = setInterval(() => {
      // faqat brauzer ko'rinib turganda so'rov yuboramiz
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadTgChat(true);
      }
    }, 3500);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, commsFilter, patient?.id, patient?.phone]);

  // Aloqa tab ochilganda Telegram ulanish holatini + shablonlarni o'qiymiz va backend bilan sinxronlaymiz
  useEffect(() => {
    if (activeTab === 'Связь') {
      setSocialTgConnected(!!clinicApi.getSocialConnections().telegram.connected);
      clinicApi.telegramStatus().then((st) => {
        if (st && typeof st.connected === 'boolean') {
          setSocialTgConnected(st.connected);
        }
      });
      setMsgTemplates(clinicApi.getMessageTemplates());
    }
  }, [activeTab, commsFilter]);

  // WhatsApp sub-view ochilganda yuklash + real-time poll (4s)
  useEffect(() => {
    if (activeTab !== 'Связь' || commsFilter !== 'whatsapp' || !patient) return;
    loadWaChat();
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') loadWaChat(true);
    }, 4000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, commsFilter, patient?.id, patient?.phone]);

  // Yangi xabar kelganda chatni pastga suradi (real-time his)
  const tgScrollRef = useRef<HTMLDivElement | null>(null);
  const tgInflightRef = useRef(false); // poll so'rovlari ustma-ust tushmasligi uchun
  const shouldScrollBottomRef = useRef(true); // eski xabar yuklaganda pastga surmaymiz
  const [tgLoadingOlder, setTgLoadingOlder] = useState(false);
  const [tgHasMoreOlder, setTgHasMoreOlder] = useState(true);
  useEffect(() => {
    if (tgScrollRef.current && shouldScrollBottomRef.current) {
      tgScrollRef.current.scrollTop = tgScrollRef.current.scrollHeight;
    }
  }, [tgRealMessages]);

  const handleAddStage = () => {
    if (!patient) return;
    // Inline qo'shish o'rniga — KATTA modalni ochamiz
    setStageTitle(`${tr('patientd.k')} ${treatmentPlans.length + 1}`);
    setStageDesc('');
    setStageDoctor(patientAppointments[0]?.doctor_name || participants[0]?.full_name || 'Сардор Алимов');
    setStageStatus('Запланировано');
    setStageProcs([]);
    setSpTeeth(''); setSpTitle(''); setSpQty(1); setSpPrice(0);
    setShowStageModal(true);
  };

  const handleAddProcToStageDraft = () => {
    const title = spTitle.trim();
    if (!title) return;
    setStageProcs((prev) => [...prev, {
      id: `proc-${Date.now()}`,
      title,
      teeth: spTeeth.trim(),
      quantity: Math.max(1, spQty),
      price: spPrice || 0,
      doctor: stageDoctor
    }]);
    setSpTeeth(''); setSpTitle(''); setSpQty(1); setSpPrice(0);
  };

  const handleSaveStageModal = () => {
    if (!patient) return;
    const newStage: TreatmentPlanStage = {
      id: Date.now(),
      title: stageTitle.trim() || `${tr('patientd.k')} ${treatmentPlans.length + 1}`,
      description: stageDesc.trim(),
      cost: 0,
      status: stageStatus,
      doctor: stageDoctor || 'Сардор Алимов',
      procedures: stageProcs
    };
    const next = [...treatmentPlans, newStage];
    setTreatmentPlans(next);
    clinicApi.saveTreatmentPlans(patient.id, next);
    setShowStageModal(false);
  };

  const handleRemoveStage = (stageId: number) => {
    if (!patient) return;
    const next = treatmentPlans.filter(s => s.id !== stageId);
    setTreatmentPlans(next);
    clinicApi.saveTreatmentPlans(patient.id, next);
  };

  const handleUpdateStage = (stageId: number, updates: Partial<TreatmentPlanStage>) => {
    if (!patient) return;
    const next = treatmentPlans.map(s => s.id === stageId ? { ...s, ...updates } : s);
    setTreatmentPlans(next);
    clinicApi.saveTreatmentPlans(patient.id, next);
  };

  const handleOpenAddProcedure = (stageId: number) => {
    setAddingProcStageId(stageId);
    setProcCatalogSearch('');
    setSelectedCatalogItem(null);
    setProcCustomTitle('');
    setProcTeeth('');
    setProcQty(1);
    setProcPrice(0);
  };

  const handleSaveProcedureToStage = () => {
    if (!patient || addingProcStageId == null) return;
    const title = selectedCatalogItem ? selectedCatalogItem.name : procCustomTitle.trim();
    if (!title) return;
    const newProc: TreatmentProcedureItem = {
      id: `proc-${Date.now()}`,
      title,
      teeth: procTeeth.trim(),
      quantity: Math.max(1, procQty),
      price: procPrice || selectedCatalogItem?.base_price || 0,
      doctor: treatmentPlans.find(s => s.id === addingProcStageId)?.doctor || 'Сардор Алимов'
    };

    const next = treatmentPlans.map(s => {
      if (s.id !== addingProcStageId) return s;
      const procs = [...(s.procedures || []), newProc];
      const cost = procs.reduce((sum, p: any) => sum + ((p.price || 0) * (p.quantity || 1)), 0);
      return { ...s, procedures: procs, cost };
    });
    setTreatmentPlans(next);
    clinicApi.saveTreatmentPlans(patient.id, next);
    setAddingProcStageId(null);
  };

  const handleRemoveProcedureFromStage = (stageId: number, procId: string | number) => {
    if (!patient) return;
    const next = treatmentPlans.map(s => {
      if (s.id !== stageId) return s;
      const procs = (s.procedures || []).filter((p: any) => (p.id || p) !== procId);
      const cost = procs.reduce((sum, p: any) => sum + ((p.price || 0) * (p.quantity || 1)), 0);
      return { ...s, procedures: procs, cost };
    });
    setTreatmentPlans(next);
    clinicApi.saveTreatmentPlans(patient.id, next);
  };

  const [planStatus, setPlanStatus] = useState<string>('Согласован с пациентом');

  const handleExecuteProcedureToTreatment = (stageId: number, proc: TreatmentProcedureItem) => {
    if (!patient) return;
    const newTr = {
      id: Date.now(),
      title: proc.teeth ? `${proc.title} (Зуб ${proc.teeth})` : proc.title,
      doctor: proc.doctor || 'Сардор Алимов',
      price: (proc.price || 0) * (proc.quantity || 1),
      status: 'Сделано',
      teeth: proc.teeth ? [proc.teeth] : [],
      category: 'Терапия',
      date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
      dateIso: getTodayStr()
    };
    const nextTrs = [newTr, ...patientTreatments];
    setPatientTreatments(nextTrs);
    clinicApi.savePatientTreatments(patient.id, nextTrs);
    alert(tr('patientd.procMovedToTreatment').replace('{title}', proc.title));
  };


  // Tab: Лаборатория
  // Loaded per-patient from the store (getLabOrders filtered by patient id).
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [selectedPatientLabOrder, setSelectedPatientLabOrder] = useState<DentalLabOrder | null>(null);
  const [isPatientLabFullModalOpen, setIsPatientLabFullModalOpen] = useState(false);
  const [isNewLabOrderOpen, setIsNewLabOrderOpen] = useState(false);
  const [newLabTooth, setNewLabTooth] = useState('16');
  const [newLabType, setNewLabType] = useState('Циркониевая коронка');
  const [newLabShade, setNewLabShade] = useState('A2');
  // Rich "new lab work" modal (mirrors 32desk 2-step "Новая работа")
  const [labStep, setLabStep] = useState<1 | 2>(1);
  const [labTab, setLabTab] = useState<'main' | 'extra'>('main');
  const [labTech, setLabTech] = useState('');
  const [labTeeth, setLabTeeth] = useState<string[]>([]);
  const [labWork, setLabWork] = useState('');
  const [labDueDate, setLabDueDate] = useState('');
  const [labFittings, setLabFittings] = useState<string[]>([]);
  const [labWishes, setLabWishes] = useState('');
  const [labLines, setLabLines] = useState<{ name: string; qty: number; price: number }[]>([]);
  // Demo dental laboratories / technicians the clinic works with
  const LAB_TECHNICIANS = [
    { name: 'Smiledent', phone: '+998 90 123 45 67' },
    { name: 'Azimjon Xakimov', phone: '+998 90 966 37 37' },
    { name: 'Farhod Alimov', phone: '+998 90 777 25 25' },
    { name: 'DentalArt Lab', phone: '+998 90 555 10 10' }
  ];
  const LAB_WORK_TYPES = ['Циркониевая коронка', 'Керамический винир E.max', 'Мостовидный металлокерамический протез', 'Индивидуальный титановый абатмент', 'Съёмный пластиночный протез', 'Бюгельный протез'];
  const VITA_SHADES = ['A1', 'A2', 'A3', 'A3.5', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4'];
  // Ish turi nomlari katalogda ruscha saqlanadi — ko'rsatishda tanlangan tilga o'giriladi (uz/ru/en)
  const LAB_WORK_LABELS: Record<string, [string, string, string]> = {
    'Циркониевая коронка': ['Sirkoniy koronka', 'Циркониевая коронка', 'Zirconia crown'],
    'Керамический винир E.max': ['Keramik vinir E.max', 'Керамический винир E.max', 'Ceramic veneer E.max'],
    'Мостовидный металлокерамический протез': ['Metallokeramik ko‘prik protez', 'Мостовидный металлокерамический протез', 'Metal-ceramic bridge'],
    'Индивидуальный титановый абатмент': ['Individual titan abatment', 'Индивидуальный титановый абатмент', 'Custom titanium abutment'],
    'Съёмный пластиночный протез': ['Yechiladigan plastinka protez', 'Съёмный пластиночный протез', 'Removable plate denture'],
    'Бюгельный протез': ['Byugel protez', 'Бюгельный протез', 'Clasp denture']
  };
  const labWorkLabel = (name: string) => {
    const t = LAB_WORK_LABELS[name];
    if (!t) return name;
    return language === 'uz' ? t[0] : language === 'en' ? t[2] : t[1];
  };

  // Tab: Опросы (Screenshot 4)
  const [surveys, setSurveys] = useState<SurveyItem[]>([]); // per-patient
  const [selectedSurveyView, setSelectedSurveyView] = useState<SurveyItem | null>(null);

  // General modals
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('Тест Тест');
  const [editPhone, setEditPhone] = useState('+998 90 394 84 34');
  const [showNaryadModal, setShowNaryadModal] = useState(false);
  const [showKarzinkaModal, setShowKarzinkaModal] = useState(false);
  const [karzinkaPayMethod, setKarzinkaPayMethod] = useState('Наличные');
  // Activity log of struck / removed naryads (who + when)
  const [naryadLog, setNaryadLog] = useState<NaryadLogEntry[]>([]);
  // Reason prompt when deleting (x) a naryad in the Счет
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);
  const [removeReason, setRemoveReason] = useState<'mistake' | 'other'>('mistake');
  const [removeComment, setRemoveComment] = useState('');
  // Checkout (yakunlash) opened from the Счет "Подтвердить"; receipt shows after payment
  const [showCheckout, setShowCheckout] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [receiptItems, setReceiptItems] = useState<InvoiceItem[]>([]);
  const [receiptTotal, setReceiptTotal] = useState(0);
  const [receiptMethod, setReceiptMethod] = useState('Наличные');
  // Naryad count starts at 0 — nothing is "struck" until the user actually adds it
  const [naryadCount, setNaryadCount] = useState(0);

  // Karzinka / Naryad items state — starts EMPTY (a freshly created patient has no naryads)
  const [patientNaryads, setPatientNaryads] = useState<Array<{
    id: number;
    title: string;
    name: string;
    unitPrice: number;
    teeth: string[];
    doctor: string;
    date: string;
    price: number;
    isDebt: boolean;
    quantity: number;
  }>>([]);
  const [newNaryadTitle, setNewNaryadTitle] = useState('Консультация врача и 3D рентген');
  const [newNaryadPrice, setNewNaryadPrice] = useState<number>(500000);
  const [newNaryadDoctor, setNewNaryadDoctor] = useState('Феруза Шоанварова');
  const [newNaryadIsDebt, setNewNaryadIsDebt] = useState<boolean>(true);

  // Direct send message modal
  const [isSendMsgOpen, setIsSendMsgOpen] = useState(false);
  const [sendChannel, setSendChannel] = useState<'sms' | 'telegram' | 'whatsapp'>('telegram');
  const [msgBody, setMsgBody] = useState('');

  useEffect(() => {
    async function loadPatient() {
      const allPatients = await clinicApi.getPatients();
      const p = allPatients.find((pt) => pt.id === patientId) || allPatients[0] || {
        id: 1,
        full_name: 'Тест Тест',
        phone: '+998 90 394 84 34',
        category_status: 'VIP',
        gender: 'Женщина',
        balance: 1000,
        notes: '',
        created_at: new Date().toISOString()
      };
      const cleanPatient = { ...p, balance: Math.round(Number(p.balance) || 0) };
      setPatient(cleanPatient);
      setEditName(p.full_name);
      setEditPhone(p.phone);

      // Derive the doctors that worked with this patient (from appointments)
      const [emps, apts, labs] = await Promise.all([
        clinicApi.getEmployees(),
        clinicApi.getAppointments(),
        clinicApi.getLabOrders()
      ]);
      // This patient's real lab orders (Лаборатория tab) + o'chirish overlay'i (Удалён holati saqlanadi)
      const labDeletions = clinicApi.getLabDeletions();
      setLabOrders(
        labs
          .filter((l) => l.patient === p.id)
          .map((l) => {
            const oid = l.order_number || `L-${l.id}`;
            const del = labDeletions[oid];
            return {
              id: oid,
              tooth: l.tooth_numbers,
              type: l.work_type,
              material: l.notes || '',
              colorShade: l.color_shade,
              technician: l.technician_name,
              labName: (l as { lab_name?: string }).lab_name || '',
              sentDate: l.sent_date || '',
              dueDate: l.due_date,
              status: (l.status || 'В работе') as LabOrder['status'],
              price: Number(l.clinic_price ?? l.cost) || 0,
              createdBy: (l as { created_by?: string }).created_by || l.doctor_name || CURRENT_OPERATOR,
              createdAt: l.sent_date || (l as { created_at?: string }).created_at || '',
              deleted: !!del,
              deletedBy: del?.deletedBy,
              deletedAt: del?.deletedAt
            };
          })
      );
      // Only this patient's appointments — shown in the Записи & Лечение tabs
      const mine = apts.filter((a) => a.patient === p.id);
      setPatientAppointments(mine);
      const doctorIds = Array.from(new Set(mine.map((a) => a.doctor)));
      const involved = emps.filter((e) => doctorIds.includes(e.id));
      // Fallback to any doctors if this patient has no appointments yet
      setParticipants(involved.length ? involved : emps.filter((e) => e.role === 'doctor').slice(0, 1));
      setAllEmployees(emps);

      // Restore persisted per-patient notes & payments (survive reload)
      setNotesList(clinicApi.getPatientNotes(p.id) as NoteItem[]);
      setInvoices(clinicApi.getPatientPayments(p.id) as PaymentInvoice[]);

      // Restore persisted rentgen ro'yxati + foto hujjat bloklari (reload'dan keyin ham saqlanadi)
      setXrays(clinicApi.getPatientXrays(p.id) as XrayItem[]);
      setPhotoDoc(clinicApi.getPatientPhotoDoc(p.id) as DocBlock[]);
      setPatient3DScan(clinicApi.getPatient3DScan(p.id));
      // Restore qo'lda kiritilgan / rejadan o'tkazilgan davolashlar (Лечение tab) — avval tiklanmasdi
      setPatientTreatments(clinicApi.getPatientTreatments(p.id));
      // Restore Aloqa xabarlari jurnali + Telegram chat tarixi (per-patient)
      setCommsMessages(clinicApi.getPatientComms(p.id) as CommunicationLog[]);
      setTgMessagesList(clinicApi.getPatientTgChat(p.id) as { sender: 'bot' | 'patient'; text: string; time: string }[]);
      dataLoadedRef.current = true;

      // Restore persisted per-patient naryads (Karzinka)
      const loadedNaryads = clinicApi.getPatientNaryads(p.id);
      setPatientNaryads(loadedNaryads);
      setNaryadCount(loadedNaryads.length);

      // Restore persisted naryad log (struck and removed naryads)
      const loadedLogs = clinicApi.getNaryadLog(p.id);
      setNaryadLog(loadedLogs);

      // Restore persisted treatment plans (32desk format)
      const loadedPlans = clinicApi.getTreatmentPlans(p.id);
      if (loadedPlans && loadedPlans.length > 0) {
        setTreatmentPlans(loadedPlans);
      } else {
        const initialPlan: TreatmentPlanStage[] = [
          {
            id: 1,
            title: 'Этап 1: Профессиональная гигиена и санация',
            description: 'Ультразвуковой скейлинг, удаление пигментированного налета Air-Flow, глубокое фторирование эмали.',
            cost: 600000,
            status: 'Выполнено',
            doctor: emps.find((e) => e.role === 'doctor')?.full_name || 'Мирислом Абдуллаев',
            procedures: [
              {
                id: 'proc-101',
                title: 'Комплексная гигиена полости рта (Air-Flow + УЗ скейлинг)',
                teeth: 'Все',
                quantity: 1,
                price: 600000,
                doctor: 'Мирислом Абдуллаев'
              }
            ]
          },
          {
            id: 2,
            title: 'Этап 2: Терапевтическое лечение',
            description: 'Лечение кариеса дентина, фотополимерная реставрация, эндодонтическое лечение корневых каналов.',
            cost: 1200000,
            status: 'В процессе',
            doctor: emps.find((e) => e.role === 'doctor')?.full_name || 'Сардор Алимов',
            procedures: [
              {
                id: 'proc-102',
                title: 'Кариес дентина, световая реставрация Estelite Asteria',
                teeth: '16',
                quantity: 1,
                price: 450000,
                doctor: 'Сардор Алимов'
              },
              {
                id: 'proc-103',
                title: 'Эндодонтическая обработка и 3D обтурация корневых каналов',
                teeth: '25',
                quantity: 1,
                price: 750000,
                doctor: 'Сардор Алимов'
              }
            ]
          },
          {
            id: 3,
            title: 'Этап 3: Ортопедия и протезирование',
            description: 'Изготовление и фиксация анатомических циркониевых коронок Prettau.',
            cost: 3600000,
            status: 'Запланировано',
            doctor: emps.find((e) => e.role === 'doctor')?.full_name || 'Сардор Мирахмедов',
            procedures: [
              {
                id: 'proc-104',
                title: 'Анатомическая коронка на диоксиде циркония Prettau',
                teeth: '15, 16',
                quantity: 2,
                price: 1800000,
                doctor: 'Сардор Мирахмедов'
              }
            ]
          }
        ];
        setTreatmentPlans(initialPlan);
        clinicApi.saveTreatmentPlans(p.id, initialPlan);
      }
      loadPatientTasks(p.id);
    }
    loadPatient();
  }, [patientId]);

  // --- Записи tab: real appointment stats + filtered list -----------------
  const nowTs = Date.now();
  const aptStats = {
    completed: patientAppointments.filter((a) => a.status === 'completed').length,
    noShow: patientAppointments.filter((a) => a.status === 'no_show').length,
    cancelled: patientAppointments.filter((a) => a.status === 'cancelled').length,
    late: patientAppointments.filter((a) => a.status === 'late').length
  };
  const pastApts = patientAppointments.filter(
    (a) => new Date(a.start_time).getTime() < nowTs || a.status === 'completed' || a.status === 'debt'
  );
  const futureApts = patientAppointments.filter(
    (a) => new Date(a.start_time).getTime() >= nowTs && a.status !== 'completed' && a.status !== 'debt'
  );

  // Status badge styling helper
  const aptStatusBadge = (s: string) =>
    s === 'completed'
      ? 'bg-emerald-500 text-white'
      : s === 'debt'
      ? 'bg-amber-500 text-white'
      : 'bg-blue-600 text-white';

  const fmtAptTime = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(language === 'uz' ? 'uz-UZ' : language === 'en' ? 'en-US' : 'ru-RU', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });
  };

  // Лечение tab: aggregated real treatment records (patient treatments, appointments with procedures, struck naryads)
  // Strictly EXCLUDES any cancelled / deleted (x) / no-show records!
  const treatmentRecords = useMemo(() => {
    const list: any[] = [];

    // 1. Manually registered treatments
    patientTreatments.forEach((t) => {
      if (t.status === 'cancelled' || t.status === 'Отменен' || t.status === 'removed') return;
      if (cancelledTreatmentIds.includes(`t-${t.id}`)) return;
      const dateIso = t.dateIso || getTodayStr();
      list.push({
        id: `t-${t.id}`,
        procedure: t.title,
        doctor_name: t.doctor,
        price: Number(t.price) || 0,
        status: t.status === 'Долг' ? 'debt' : 'completed',
        start_time: t.date || tk('txt_today'),
        dateIso,
        teeth: t.teeth || (t.tooth ? [t.tooth] : []),
        category: t.category || 'Терапия',
        branch_name: t.branch_name || (t.branch_id ? branches.find((b) => b.id === t.branch_id)?.name : '') || ''
      });
    });

    // 2. Patient appointments that have procedures or treatments
    patientAppointments.forEach((a) => {
      // EXCLUDE CANCELLED, NO_SHOW, AND EXPLICITLY X-MARKED APPOINTMENTS!
      if (a.status === 'cancelled' || a.status === 'no_show' || (a.status as string) === 'Отменен') return;
      if (cancelledTreatmentIds.includes(`apt-${a.id}`)) return;

      const aptDay = a.start_time ? a.start_time.split('T')[0] : '';

      if (a.procedure || a.treatment_notes || a.status === 'completed' || a.status === 'debt' || a.status === 'waiting_bill') {
        list.push({
          id: `apt-${a.id}`,
          procedure: a.procedure || a.treatment_notes || 'Стоматологический прием',
          doctor_name: a.doctor_name || 'Врач клиники',
          price: Number(a.price) || 0,
          status: a.status,
          start_time: fmtAptTime(a.start_time),
          dateIso: aptDay,
          chair_name: a.chair_name,
          branch_name: a.branch_name || branches.find((b) => b.id === a.branch)?.name || '',
          teeth: []
        });
      }
    });

    // 3. Struck naryads from karzinka
    patientNaryads.forEach((n) => {
      if (cancelledTreatmentIds.includes(`nar-${n.id}`)) return;
      const narDay = getTodayStr();
      list.push({
        id: `nar-${n.id}`,
        procedure: n.title || n.name,
        doctor_name: n.doctor || 'Сардор Алимов',
        price: Number(n.price) || Number(n.unitPrice) || 0,
        status: n.isDebt ? 'debt' : 'completed',
        start_time: n.date || tk('txt_today'),
        dateIso: narDay,
        teeth: n.teeth || [],
        branch_name: (n as any).branch_name || ((n as any).branch_id ? branches.find((b) => b.id === (n as any).branch_id)?.name : '') || ''
      });
    });

    // 4. Fallback default realistic treatments ONLY if list is empty and NOT dismissed with X
    if (list.length === 0 && !cancelledTreatmentIds.includes('init-1') && !cancelledTreatmentIds.includes('init-2')) {
      const today = getTodayStr();
      if (true) {
        list.push(
          {
            id: 'init-1',
            procedure: 'Кариес дентина, фотополимерная реставрация (световая пломба)',
            doctor_name: 'Сардор Алимов',
            price: 450000,
            status: 'completed',
            start_time: 'Сегодня, 11:30',
            dateIso: today,
            teeth: ['16'],
            chair_name: 'Кабинет №1',
            branch_name: branches[0]?.name || ''
          },
          {
            id: 'init-2',
            procedure: 'Профессиональная ультразвуковая чистка + Air Flow + фторирование',
            doctor_name: 'Мирислом Абдуллаев',
            price: 600000,
            status: 'completed',
            start_time: 'Сегодня, 14:00',
            dateIso: today,
            teeth: [],
            chair_name: 'Кабинет №2',
            branch_name: branches[0]?.name || ''
          }
        );
      }
    }

    return list;
  }, [patientTreatments, patientAppointments, patientNaryads, cancelledTreatmentIds, branches]);

  const filteredApts = patientAppointments
    .filter((a) => {
      if (appointmentFilter !== 'Все') {
        const t = new Date(a.start_time).getTime();
        if (appointmentFilter === 'Прошедшие' ? t >= nowTs : t < nowTs) return false;
      }
      if (aptDoctor && a.doctor_name !== aptDoctor) return false;
      if (aptSearch.trim()) {
        const q = aptSearch.toLowerCase();
        const hay = `${a.procedure || ''} ${a.treatment_notes || ''} ${a.doctor_name} ${a.chair_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  // Doctors that actually appear in this patient's appointments (for the filter).
  const aptDoctorNames = Array.from(new Set(patientAppointments.map((a) => a.doctor_name))).filter(Boolean);
  const aptStatusColor = (s: string) =>
    s === 'completed' ? 'bg-emerald-500 text-white'
    : s === 'cancelled' || s === 'no_show' ? 'bg-rose-500 text-white'
    : s === 'debt' ? 'bg-amber-500 text-white'
    : 'bg-blue-600 text-white';

  // Stage & Treatment Plan dynamic translations
  const STAGE_NAME_MAP: Record<string, Record<string, string>> = {
    'Профессиональная гигиена и санация': {
      uz: 'Professional gigiyena va sanatsiya',
      ru: 'Профессиональная гигиена и санация',
      en: 'Professional hygiene and sanitation'
    },
    'Терапевтическое лечение': {
      uz: 'Terapevtik davolash',
      ru: 'Терапевтическое лечение',
      en: 'Therapeutic treatment'
    },
    'Ортопедия и протезирование': {
      uz: 'Ortopediya va protezlash',
      ru: 'Ортопедия и протезирование',
      en: 'Orthopedics and prosthetics'
    },
    'Дополнительная терапия': {
      uz: 'Qo‘shimcha terapiya',
      ru: 'Дополнительная терапия',
      en: 'Additional therapy'
    }
  };

  const localizeStageTitle = (title: string) => {
    const match = title.match(/^Этап\s*(\d+)(?::\s*(.*))?$/i);
    if (match) {
      const num = match[1];
      const rest = match[2]?.trim();
      const stageWord = tk('stage_word');
      if (rest) {
        const transRest = STAGE_NAME_MAP[rest]?.[language] || rest;
        return language === 'uz' ? `${num}-${stageWord}: ${transRest}` : `${stageWord} ${num}: ${transRest}`;
      }
      return language === 'uz' ? `${num}-${stageWord}` : `${stageWord} ${num}`;
    }
    return title;
  };

  const STAGE_DESC_MAP: Record<string, Record<string, string>> = {
    'Швейцарский протокол GBT, снятие зубных отложений, полировка, обучение гигиене.': {
      uz: 'Shveysariya GBT protokoli, tish toshlarini tozalash, silliqlash, gigiyenaga o‘rgatish.',
      ru: 'Швейцарский протокол GBT, снятие зубных отложений, полировка, обучение гигиене.',
      en: 'Swiss GBT protocol, plaque removal, polishing, hygiene education.'
    },
    'Лечение кариеса и пульпита зубов 16, 26 с применением коффердама и оптики.': {
      uz: '16, 26-tishlar karies va pulpitini kofferdam va optika yordamida davolash.',
      ru: 'Лечение кариеса и пульпита зубов 16, 26 с применением коффердама и оптики.',
      en: 'Treatment of caries and pulpitis of teeth 16, 26 using cofferdam and optics.'
    },
    'Установка циркониевых коронок Prettau с винтовой фиксацией.': {
      uz: 'Vintli fiksatsiyali Prettau sirkoniy qoplamalarini o‘rnatish.',
      ru: 'Установка циркониевых коронок Prettau с винтовой фиксацией.',
      en: 'Installation of Prettau zirconia crowns with screw fixation.'
    },
    'Диагностика и профилактика.': {
      uz: 'Tashxis va profilaktika.',
      ru: 'Диагностика и профилактика.',
      en: 'Diagnostics and prevention.'
    }
  };

  const localizeStageDesc = (desc: string) => STAGE_DESC_MAP[desc]?.[language] || desc;

  const PROC_MAP: Record<string, Record<string, string>> = {
    'Проф. гигиена полости рта EMS': {
      uz: 'EMS og‘iz bo‘shlig‘i professional gigiyenasi',
      ru: 'Проф. гигиена полости рта EMS',
      en: 'EMS professional oral hygiene'
    },
    'Фторирование эмали': {
      uz: 'Emalni ftorlash',
      ru: 'Фторирование эмали',
      en: 'Enamel fluoridation'
    },
    'Эндодонтическое лечение зуба 26': {
      uz: '26-tishni endodontik davolash',
      ru: 'Эндодонтическое лечение зуба 26',
      en: 'Endodontic treatment of tooth 26'
    },
    'Фотополимерная реставрация зуба 16': {
      uz: '16-tish fotopolimer restavratsiyasi',
      ru: 'Фотополимерная реставрация зуба 16',
      en: 'Photopolymer restoration of tooth 16'
    },
    'Снятие цифрового слепка 3Shape': {
      uz: '3Shape raqamli qolip olish',
      ru: 'Снятие цифрового слепка 3Shape',
      en: '3Shape digital impression taking'
    },
    'Установка 2 циркониевых коронок': {
      uz: '2 ta sirkoniy qoplamalarini o‘rnatish',
      ru: 'Установка 2 циркониевых коронок',
      en: 'Installation of 2 zirconia crowns'
    },
    'Контрольный осмотр через 6 месяцев': {
      uz: '6 oydan keyin nazorat ko‘rigi',
      ru: 'Контрольный осмотр через 6 месяцев',
      en: 'Follow-up check after 6 months'
    }
  };

  const localizeProc = (p: string | TreatmentProcedureItem) => {
    const title = typeof p === 'string' ? p : p?.title || '';
    return PROC_MAP[title]?.[language] || title;
  };

  const localizeDate = (d: string) => {
    if (language === 'ru') return d;
    return d
      .replace(/сентября/i, tr('patientd.september'))
      .replace(/октября/i, tr('patientd.october'))
      .replace(/ноября/i, tr('patientd.november'))
      .replace(/декабря/i, tr('patientd.december'))
      .replace(/января/i, tr('patientd.january'))
      .replace(/февраля/i, tr('patientd.february'))
      .replace(/марта/i, tr('patientd.march'))
      .replace(/апреля/i, tr('patientd.april'))
      .replace(/мая/i, tr('patientd.may'))
      .replace(/июня/i, tr('patientd.june'))
      .replace(/июля/i, tr('patientd.july'))
      .replace(/августа/i, tr('patientd.august'))
      .replace(/Сегодня/i, tk('txt_today'))
      .replace(/Вчера/i, tk('yesterday'));
  };

  // Оплаты tab: unified rows = appointment bills (kind 'bill') + manual payment receipts (kind 'payment').
  type PayRow = {
    id: number; ts: number; date: string; total: number; paid: number;
    st: 'paid' | 'partial' | 'unpaid' | 'cancelled'; kind: 'bill' | 'payment';
    method?: string; operator?: string; operator_role?: string;
    target?: 'debt' | 'balance'; description?: string; discount?: number;
    items?: InvoiceItem[];
    branch_id?: number | null;
    branch_name?: string | null;
  };
  const billRows: PayRow[] = patientAppointments
    .filter((a) => Number(a.price) > 0)
    .map((a) => {
      const total = Number(a.price) || 0;
      const paid = Number(a.paid_amount) || 0;
      const st: 'paid' | 'partial' | 'unpaid' | 'cancelled' =
        a.status === 'cancelled' || a.status === 'no_show' ? 'cancelled'
        : paid >= total ? 'paid'
        : paid > 0 ? 'partial' : 'unpaid';
      return {
        id: a.id,
        ts: new Date(a.start_time).getTime() || 0,
        date: fmtAptTime(a.start_time),
        total,
        paid,
        st,
        kind: 'bill' as const,
        operator: a.doctor_name,
        method: paid > 0 ? 'Наличные' : undefined,
        description: a.procedure || a.treatment_notes || (tr('patientd.k2')),
        branch_id: a.branch,
        branch_name: a.branch_name || (a.branch ? branches.find((b) => b.id === a.branch)?.name : '') || null
      };
    });
  const paymentRows: PayRow[] = invoices.map((inv) => ({
    id: inv.id,
    ts: inv.id, // id is the creation timestamp for manual payments
    date: inv.date,
    total: inv.total,
    paid: inv.paid,
    st: (inv.status === 'Отменен' ? 'cancelled' : 'paid') as PayRow['st'],
    kind: 'payment' as const,
    method: inv.method || 'Наличные',
    operator: inv.operator || CURRENT_OPERATOR,
    operator_role: inv.operator_role,
    items: inv.items,
    target: inv.target,
    discount: inv.discount,
    branch_id: inv.branch_id,
    branch_name: inv.branch_name,
    description: inv.description || (inv.target === 'debt' ? (tr('patientd.ga')) : (tr('patientd.k3')))
  }));
  const allPayRows: PayRow[] = [...billRows, ...paymentRows].sort((x, y) => y.ts - x.ts);
  // Date-period filter → [from, to] timestamps (null = no bound).
  const dateRange = (() => {
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = startOfDay(now);
    const day = 86400000;
    switch (selectedDatePeriod) {
      case 'Сегодня': return [today, today + day];
      case 'Вчера': return [today - day, today];
      case 'На этой неделе': { const dow = (now.getDay() + 6) % 7; return [today - dow * day, today + day]; }
      case 'Прошедшая неделя': { const dow = (now.getDay() + 6) % 7; return [today - (dow + 7) * day, today - dow * day]; }
      case 'В этом месяце': return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()];
      case 'Прошлый месяц': return [new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), new Date(now.getFullYear(), now.getMonth(), 1).getTime()];
      case 'Указать период': {
        const from = customFrom ? startOfDay(new Date(customFrom)) : null;
        const to = customTo ? startOfDay(new Date(customTo)) + day : null; // gacha = shu kun oxirigacha
        return [from, to];
      }
      default: return [null, null]; // По дате → all
    }
  })() as [number | null, number | null];
  const filteredInvoices = allPayRows.filter((inv) => {
    // sub-tab filter
    if (paymentSubTab === 'Оплаты' && inv.kind !== 'payment') return false;
    if (paymentSubTab === 'Счета' && inv.kind !== 'bill') return false;
    // date filter (only selectedDatePeriod from To'lovlar tab dropdown)
    if (dateRange[0] !== null && inv.ts && inv.ts < dateRange[0]) return false;
    if (dateRange[1] !== null && inv.ts && inv.ts >= dateRange[1]) return false;
    return true;
  });
  const payKpi = {
    income: allPayRows.reduce((s, i) => s + i.paid, 0),
    cost: billRows.filter((i) => i.st !== 'cancelled').reduce((s, i) => s + i.total, 0),
    discounts: invoices.reduce((s, i) => s + (Number(i.discount) || 0), 0)
  };
  // Translate a date-period value for the Оплаты date dropdown.
  const datePeriodLabel = (p: string) => {
    const m: Record<string, string> = {
      'По дате': tk('by_date'), 'Сегодня': tk('txt_today'), 'Вчера': tk('yesterday'),
      'На этой неделе': tk('this_week'), 'Прошедшая неделя': tk('last_week'),
      'В этом месяце': tk('this_month_2'), 'Прошлый месяц': tk('last_month'),
      'Указать период': tk('custom_period')
    };
    return m[p] || p;
  };

  const initials =
    patient?.full_name
      ? patient.full_name
          .split(' ')
          .filter(Boolean)
          .map((w) => w[0])
          .slice(0, 2)
          .join('')
          .toUpperCase() || 'TT'
      : 'TT';

  const allTabDefinitions = [
    { id: 'Основные', labelUz: 'Asosiy', labelRu: 'Основные', labelEn: 'General' },
    { id: 'Записи', labelUz: 'Qabullar', labelRu: 'Записи', labelEn: 'Appointments' },
    { id: 'Лечение', labelUz: 'Davolash', labelRu: 'Лечение', labelEn: 'Treatment' },
    { id: 'План лечения', labelUz: 'Davolash rejasi', labelRu: 'План лечения', labelEn: 'Treatment Plan' },
    { id: 'Заметки', labelUz: 'Eslatmalar', labelRu: 'Заметки', labelEn: 'Notes' },
    { id: 'Фотопротокол', labelUz: 'Foto protokol', labelRu: 'Фотопротокол', labelEn: 'Photo Protocol' },
    { id: 'Оплаты', labelUz: 'To‘lovlar', labelRu: 'Оплаты', labelEn: 'Billing' },
    { id: 'Связь', labelUz: 'Aloqa', labelRu: 'Связь', labelEn: 'Communication' },
    { id: 'Лаборатория', labelUz: 'Laboratoriya', labelRu: 'Лаборатория', labelEn: 'Laboratory' },
    { id: 'Задачи', labelUz: 'Vazifalar', labelRu: 'Задачи', labelEn: 'Tasks' },
    { id: 'Опросы', labelUz: 'So‘rovnomalar', labelRu: 'Опросы', labelEn: 'Surveys' },
    { id: 'Наряды', labelUz: 'Naryad jurnali', labelRu: 'Журнал нарядов', labelEn: 'Naryad log' }
  ];

  const adminAllowedTabs = new Set([
    'Основные',
    'Записи',
    'Лечение',
    'Заметки',
    'Фотопротокол',
    'Оплаты',
    'Связь',
    'Лаборатория',
    'Задачи',
    'Опросы'
  ]);

  const tabDefinitions = isAdmin
    ? allTabDefinitions.filter(tab => adminAllowedTabs.has(tab.id))
    : allTabDefinitions;

  useEffect(() => {
    if (isAdmin && !adminAllowedTabs.has(activeTab)) {
      setActiveTab('Основные');
    }
  }, [isAdmin, activeTab]);

  const nowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const nowDateLong = () => new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const baseNote = () => ({ id: Date.now(), author: 'Мухаммад', avatarText: 'MO', date: nowDateLong(), time: nowTime() });
  const blobToDataURL = (blob: Blob): Promise<string> =>
    new Promise((resolve) => { const r = new FileReader(); r.onloadend = () => resolve(String(r.result)); r.readAsDataURL(blob); });

  // Add a note to the feed AND persist it per patient (survives reload).
  const addNote = (item: NoteItem) => {
    const targetPatientId = patient?.id ?? (params?.id ? Number(params.id) : 1);
    setNotesList((prev) => {
      const next = [item, ...prev];
      clinicApi.savePatientNotes(targetPatientId, next);
      return next;
    });
  };
  const removeNote = (id: number) => {
    const targetPatientId = patient?.id ?? (params?.id ? Number(params.id) : 1);
    setNotesList((prev) => {
      const next = prev.filter((n) => n.id !== id);
      clinicApi.savePatientNotes(targetPatientId, next);
      return next;
    });
  };

  const handleSaveNote = () => {
    if (!noteInputText.trim() && pendingNotePhotos.length === 0) return;
    if (pendingNotePhotos.length > 0) {
      addNote({
        ...baseNote(),
        kind: 'photo',
        text: noteInputText.trim(),
        imageUrl: pendingNotePhotos[0],
        images: pendingNotePhotos
      });
    } else {
      addNote({
        ...baseNote(),
        kind: 'text',
        text: noteInputText.trim()
      });
    }
    setNoteInputText('');
    setPendingNotePhotos([]);
  };

  // Photo note — attach up to 5 image previews (stored as base64 data URLs so they persist)
  const handlePhotoNote = async (files?: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const remainingSlots = 5 - pendingNotePhotos.length;
    if (remainingSlots <= 0) {
      alert(tr('patientd.n5'));
      return;
    }
    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    const dataUrls: string[] = [];
    for (const f of filesToUpload) {
      const url = await blobToDataURL(f);
      dataUrls.push(url);
    }
    setPendingNotePhotos((prev) => [...prev, ...dataUrls]);
  };

  const removePendingPhoto = (idx: number) => {
    setPendingNotePhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  // Voice note — record with live audio frequency analyser reacting to speech (pulsing outward from center)
  const startVoiceNote = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Connect Web Audio API to analyze mic volume in real time
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.35;
          const source = ctx.createMediaStreamSource(stream);
          source.connect(analyser);

          micAudioCtxRef.current = ctx;
          micAnalyserRef.current = analyser;

          const updateBars = () => {
            if (!micAnalyserRef.current) return;
            const dataArray = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
            micAnalyserRef.current.getByteFrequencyData(dataArray);

            let sum = 0;
            for (let j = 0; j < dataArray.length; j++) sum += dataArray[j];
            const avgVol = sum / (dataArray.length || 1);

            // Centered frequency & volume distribution: tallest in middle, radiates outward left and right
            const bars = Array.from({ length: 32 }).map((_, i) => {
              const distFromCenter = Math.abs(i - 15.5); // 0.5 at center, 15.5 at edges
              const bin = Math.min(Math.floor((distFromCenter / 16) * (dataArray.length * 0.75)), dataArray.length - 1);
              const val = dataArray[bin] || 0;
              const centerWeight = Math.max(0.25, 1 - (distFromCenter / 16) * 0.65);

              if (avgVol > 4 || val > 8) {
                const dynamicVal = Math.min(100, Math.max(14, Math.round(((val / 200) * 85 + (avgVol / 180) * 45) * centerWeight + Math.sin(Date.now() / 120 - distFromCenter * 0.4) * 8)));
                return dynamicVal;
              }
              return Math.max(8, Math.round((14 - distFromCenter * 0.5) + Math.sin(Date.now() / 300 - distFromCenter * 0.3) * 4));
            });
            setMicWaveBars(bars);
            micAnimFrameRef.current = requestAnimationFrame(updateBars);
          };
          micAnimFrameRef.current = requestAnimationFrame(updateBars);
        }
      } catch (err) {
        console.warn('Live mic visualizer fallback', err);
      }

      const rec = new MediaRecorder(stream);
      recordChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        if (micAnimFrameRef.current) cancelAnimationFrame(micAnimFrameRef.current);
        if (micAudioCtxRef.current) micAudioCtxRef.current.close().catch(() => {});
        const blob = new Blob(recordChunksRef.current, { type: 'audio/webm' });
        const dataUrl = await blobToDataURL(blob);
        setVoicePreview({ url: dataUrl, dur: recordSecondsRef.current });
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = rec;
      rec.start();
      recordSecondsRef.current = 0;
      setRecordSeconds(0);
      setIsRecording(true);
      recordTimerRef.current = setInterval(() => { recordSecondsRef.current += 1; setRecordSeconds((s) => s + 1); }, 1000);
    } catch {
      alert(tk('mic_denied'));
    }
  };

  const stopVoiceNote = () => {
    mediaRecorderRef.current?.stop();
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (micAnimFrameRef.current) cancelAnimationFrame(micAnimFrameRef.current);
    setIsRecording(false);
  };

  const cancelVoiceNote = () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (micAnimFrameRef.current) cancelAnimationFrame(micAnimFrameRef.current);
      setIsRecording(false);
    }
    setVoicePreview(null);
  };

  const sendVoiceNote = () => {
    if (!voicePreview) return;
    addNote({
      ...baseNote(),
      kind: 'voice',
      text: noteInputText.trim(),
      imageUrl: pendingNotePhotos[0] || undefined,
      images: pendingNotePhotos.length > 0 ? pendingNotePhotos : undefined,
      audioUrl: voicePreview.url,
      audioDur: voicePreview.dur
    });
    setVoicePreview(null);
    setNoteInputText('');
    setPendingNotePhotos([]);
  };

  const handleSaveNewTreatment = () => {
    if (!patient || !newTreatmentTitle.trim()) return;
    const branchObj = branches.find((b) => b.id === (newTreatmentBranchId || currentBranchId));
    const newTr = {
      id: Date.now(),
      title: newTreatmentTooth ? `${newTreatmentTitle} (Зуб ${newTreatmentTooth})` : newTreatmentTitle,
      doctor: newTreatmentDoctor,
      price: newTreatmentPrice,
      status: newTreatmentStatus,
      teeth: newTreatmentTooth ? [newTreatmentTooth] : [],
      category: newTreatmentCategory,
      branch_id: branchObj?.id || currentBranchId || null,
      branch_name: branchObj?.name || currentBranch?.name || '',
      date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    };
    const nextList = [newTr, ...patientTreatments];
    setPatientTreatments(nextList);
    clinicApi.savePatientTreatments(patient.id, nextList);
    setIsAddTreatmentModalOpen(false);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgBody.trim() || !patient) return;
    const text = msgBody.trim();
    if (sendChannel === 'telegram' && patient.phone) {
      clinicApi.telegramSend(patient.phone, text, patient.full_name).catch(() => {});
    } else if (sendChannel === 'whatsapp' && patient.phone) {
      clinicApi.whatsappSend(patient.phone, text).catch(() => {});
    }
    const item: CommunicationLog = {
      id: Date.now(),
      type: sendChannel,
      title:
        sendChannel === 'whatsapp'
          ? 'WhatsApp'
          : sendChannel === 'telegram'
          ? 'Telegram'
          : 'SMS 32Desk',
      message: text,
      date: 'Сегодня, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'Отправлено'
    };
    setCommsMessages([item, ...commsMessages]);
    setMsgBody('');
    setIsSendMsgOpen(false);
  };

  const handleSendDirectSms = () => {
    if (!smsDraft.trim()) return;
    const item: CommunicationLog = {
      id: Date.now(),
      type: 'sms',
      title: 'SMS Шлюз 32Desk',
      message: smsDraft.trim(),
      date: 'Сегодня, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'Доставлено'
    };
    setCommsMessages([item, ...commsMessages]);
    setSmsSentSuccess(true);
    setTimeout(() => setSmsSentSuccess(false), 3000);
  };

  const handleSendTgMessage = () => {
    if (!tgDraft.trim()) return;
    const newMsg = {
      sender: 'bot' as const,
      text: tgDraft.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setTgMessagesList([...tgMessagesList, newMsg]);

    const item: CommunicationLog = {
      id: Date.now(),
      type: 'telegram',
      title: 'Telegram Бот (Dent32DeskBot)',
      message: tgDraft.trim(),
      date: 'Сегодня, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'Прочитано'
    };
    setCommsMessages([item, ...commsMessages]);
    setTgDraft('');
  };

  // REAL Telegram: bemor raqami bo'yicha yozishmani qidirish (bo'lsa tarix, bo'lmasa "hali gaplashmagan")
  // silent=true → real-time poll (spinner ko'rsatmaydi, faqat yangi xabarlarni qo'shadi)
  const loadTgChat = async (silent = false) => {
    if (!patient) return;
    if (tgInflightRef.current) return; // oldingi so'rov tugamaguncha yangisini yubormaymiz
    tgInflightRef.current = true;
    if (!silent) { setTgChatState('loading'); setTgChatError(''); }
    try {
    // faqat OXIRGI 10 ta xabar (tez keladi)
    const res = await clinicApi.telegramChat(patient.phone, 10, patient.full_name, 0);
    if (!res.ok) {
      if (silent) return; // poll paytida xatoni jim o'tkazamiz
      if (res.error === 'not_connected') {
        setTgChatState('not_connected');
        setSocialTgConnected(false);
      } else {
        setTgChatState('error');
        setTgChatError(res.message || '');
      }
      return;
    }
    setSocialTgConnected(true);
    if (!res.found) {
      if (silent) return;
      setTgChatState('not_found'); setTgChatUser(null); setTgRealMessages([]); return;
    }
    setTgChatUser(res.user || null);
    const next = res.messages || [];
    shouldScrollBottomRef.current = true;
    if (!silent) {
      // Dastlabki yuklash / qo'lda yangilash → oxirgi 10 taga qaytamiz
      setTgRealMessages(next);
      setTgHasMoreOlder(!!res.has_more);
    } else {
      // Real-time poll → faqat YANGI (keyingi) xabarlarni qo'shamiz (eskilari joyida qoladi)
      setTgRealMessages((prev) => {
        if (prev.length === 0) return next;
        const existing = new Set(prev.map((m) => m.id));
        const lastId = prev[prev.length - 1].id;
        const newer = next.filter((m: { id: number }) => !existing.has(m.id) && m.id > lastId);
        return newer.length ? [...prev, ...newer] : prev;
      });
    }
    setTgChatState(res.has_history ? 'ready' : 'no_history');
    } finally {
      tgInflightRef.current = false;
    }
  };

  // Tepaga scroll qilinganda ESKI xabarlarni yuklaydi (10 tadan), scroll pozitsiyasini saqlaydi
  const loadOlderTgChat = async () => {
    if (!patient || tgLoadingOlder || !tgHasMoreOlder || tgRealMessages.length === 0) return;
    const el = tgScrollRef.current;
    const prevH = el ? el.scrollHeight : 0;
    setTgLoadingOlder(true);
    try {
      const oldestId = tgRealMessages[0].id;
      const res = await clinicApi.telegramChat(patient.phone, 10, patient.full_name, oldestId);
      if (res.ok && res.found) {
        const older = res.messages || [];
        setTgHasMoreOlder(!!res.has_more && older.length > 0);
        if (older.length) {
          shouldScrollBottomRef.current = false; // pastga surmaymiz
          setTgRealMessages((prev) => {
            const existing = new Set(prev.map((m) => m.id));
            const add = older.filter((m: { id: number }) => !existing.has(m.id));
            return [...add, ...prev];
          });
          // DOM yangilangach — ko'rish joyini o'sha xabarda ushlab turamiz
          requestAnimationFrame(() => {
            if (el) el.scrollTop = el.scrollHeight - prevH;
          });
        }
      }
    } finally {
      setTgLoadingOlder(false);
    }
  };

  const handleTgScroll = () => {
    const el = tgScrollRef.current;
    if (el && el.scrollTop < 40 && tgHasMoreOlder && !tgLoadingOlder) {
      loadOlderTgChat();
    }
  };

  // REAL WhatsApp (Cloud API): saqlangan yozishmani yuklaydi
  const loadWaChat = async (silent = false) => {
    if (!patient) return;
    if (!silent) setWaChatState('loading');
    const res = await clinicApi.whatsappChat(patient.phone);
    if (!res.ok) {
      if (silent) return;
      setWaChatState(res.error === 'not_connected' ? 'not_connected' : 'ready');
      if (res.error === 'not_connected') setWaMessages([]);
      return;
    }
    const next = res.messages || [];
    setWaMessages((prev) => (prev.length === next.length && prev.length > 0 && prev[prev.length - 1]?.id === next[next.length - 1]?.id ? prev : next));
    setWaChatState('ready');
  };

  const handleSendWaReal = async () => {
    if (!patient || !waDraftReal.trim()) return;
    const text = waDraftReal.trim();
    setWaSending(true);
    const res = await clinicApi.whatsappSend(patient.phone, text);
    setWaSending(false);
    if (res.ok && res.message) {
      setWaMessages((prev) => [...prev, res.message]);
      setCommsMessages([{
        id: Date.now(), type: 'whatsapp', title: 'WhatsApp',
        message: text, date: 'Сегодня, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'Отправлено'
      }, ...commsMessages]);
      setWaDraftReal('');
    } else if (res.error === 'not_connected') {
      setWaChatState('not_connected');
    } else {
      alert(res.message || (tr('patientd.k4')));
    }
  };

  // REAL Telegram: bemorga xabar yuborish
  const handleSendTgReal = async () => {
    if (!patient || !tgDraft.trim()) return;
    const text = tgDraft.trim();
    setTgSending(true);
    const res = await clinicApi.telegramSend(patient.phone, text, patient.full_name);
    setTgSending(false);
    if (res.ok && res.found && res.message) {
      setTgRealMessages((prev) => [...prev, res.message]);
      setTgChatState('ready');
      setCommsMessages([{
        id: Date.now(), type: 'telegram', title: 'Telegram',
        message: text, date: 'Сегодня, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'Отправлено'
      }, ...commsMessages]);
      setTgDraft('');
    } else if (res.ok && !res.found) {
      setTgChatState('not_found');
    } else if (res.error === 'not_connected') {
      setTgChatState('not_connected');
    } else {
      alert(res.message || (tr('patientd.k4')));
    }
  };

  // "Ishlab chiqilmoqda" (hira) paneli — WhatsApp / SMS / So'nggi qo'ng'iroqlar uchun
  const underDev = (title: string) => (
    <div className="py-16 text-center space-y-3 opacity-90">
      <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center mx-auto text-2xl">🚧</div>
      <div>
        <p className="text-sm font-black text-slate-700 dark:text-slate-200">{title}</p>
        <p className="text-xs text-slate-400 mt-1">
          {tr('patientd.thisSectionIsUnderDevelopmentComin')}
        </p>
      </div>
      <span className="inline-block px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 text-[11px] font-bold border border-amber-200 dark:border-amber-900">
        {tr('patientd.inDevelopment')}
      </span>
    </div>
  );

  const handleOpenWhatsApp = () => {
    if (!patient) return;
    const cleanNumber = (patient.phone || '').replace(/[^0-9]/g, '');
    const encodedText = encodeURIComponent(waDraft.trim());
    window.open(`https://wa.me/${cleanNumber}?text=${encodedText}`, '_blank');

    const item: CommunicationLog = {
      id: Date.now(),
      type: 'whatsapp',
      title: 'WhatsApp Чат с пациентом',
      message: waDraft.trim(),
      date: 'Сегодня, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'Прочитано'
    };
    setCommsMessages([item, ...commsMessages]);
  };

  // Aloqa jurnalidagi sarlavha/holatni tilga moslab ko'rsatish (saqlangan qiymatni o'zgartirmasdan)
  const commTitleFor = (type: string) => {
    switch (type) {
      case 'telegram': return 'Telegram bot';
      case 'whatsapp': return tr('patientd.whatsappMessage');
      case 'sms': return tr('patientd.smsGateway');
      case 'call': return tr('patientd.call');
      case 'bot': return 'Bot';
      default: return type;
    }
  };
  const commStatusLabel = (s: string) => {
    const m: Record<string, [string, string, string]> = {
      'Отправлено': ['Yuborildi', 'Отправлено', 'Sent'],
      'Доставлено': ['Yetkazildi', 'Доставлено', 'Delivered'],
      'Прочитано': ['O‘qildi', 'Прочитано', 'Read'],
      'Завершено': ['Yakunlandi', 'Завершено', 'Completed'],
      'В очереди': ['Navbatda', 'В очереди', 'Queued']
    };
    const t = m[s];
    return t ? (language === 'uz' ? t[0] : language === 'en' ? t[2] : t[1]) : s;
  };
  const commDateLabel = (d: string) => d ? d.replace('Сегодня,', tk('txt_today') + ',') : d;

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;
    const amount = Math.max(0, Math.round(Number(newPaymentAmount) || 0));
    if (amount <= 0) {
      alert(tr('patientd.k5'));
      return;
    }
    const discount = Math.max(0, Math.round(Number(newPaymentDiscount) || 0));
    const now = new Date();
    const targetPatientId = patient.id;
    // Chegirma ham qarzni kamaytiradi (kechiriladi) → balansga amount + discount qo'shiladi
    const balanceDelta = amount + discount;
    let desc =
      newPaymentTarget === 'debt'
        ? (tr('patientd.k6'))
        : (tr('patientd.k7'));
    if (discount > 0) {
      desc += tr('patientd.discountSuffix').replace('{amount}', discount.toLocaleString('ru-RU'));
    }

    const branchObj = branches.find((b) => b.id === (newPaymentBranchId || currentBranchId));
    const newInv: PaymentInvoice = {
      id: now.getTime(),
      date: now.toLocaleDateString(language === 'uz' ? 'uz-UZ' : language === 'en' ? 'en-US' : 'ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      status: 'Оплачен',
      paid: amount,
      total: amount,
      method: newPaymentMethod,
      operator: CURRENT_OPERATOR,
      target: newPaymentTarget,
      description: desc,
      discount: discount || undefined,
      branch_id: branchObj?.id || currentBranchId || null,
      branch_name: branchObj?.name || currentBranch?.name || null
    };
    const nextInvoices = [newInv, ...invoices];
    setInvoices(nextInvoices);
    clinicApi.savePatientPayments(targetPatientId, nextInvoices);
    await clinicApi.updatePatientBalance(targetPatientId, balanceDelta);
    setPatient((prev) => (prev ? { ...prev, balance: Math.round(Number(prev.balance) || 0) + balanceDelta } : null));
    setNewPaymentDiscount('0');
    setPaymentSubTab('Все');
    setIsAddPaymentModalOpen(false);
  };

  // Save handler for the full 32desk-style NaryadModal (cart of services)
  const handleNaryadSave = async (
    items: NaryadCartItem[],
    total: number,
    isDebt: boolean,
    note: string,
    docId?: number,
    docName?: string
  ) => {
    if (!patient || items.length === 0) return;
    const doctor = docName || (participants[0]?.full_name) || newNaryadDoctor || 'Феруза Шоанварова';
    const nowLabel = 'Сегодня, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newNaryadItems = items.map((it) => ({
      id: Date.now() + Math.floor(Math.random() * 1000),
      title: it.teeth.length ? `${it.name} (${it.teeth.join(', ')})` : it.name,
      name: it.name,
      unitPrice: it.price,
      teeth: it.teeth,
      doctor,
      date: nowLabel,
      price: it.price * it.quantity,
      isDebt,
      quantity: it.quantity
    }));
    const updatedNaryads = [...newNaryadItems, ...patientNaryads];
    setPatientNaryads(updatedNaryads);
    clinicApi.savePatientNaryads(patient.id, updatedNaryads);
    setNaryadCount(updatedNaryads.length);

    // Log each struck naryad (who + when)
    newNaryadItems.forEach((n) => {
      const entry: NaryadLogEntry = {
        id: n.id,
        patient_id: patient.id,
        patient_name: patient.full_name,
        doctor: n.doctor,
        action: 'added' as const,
        title: n.title,
        author: CURRENT_OPERATOR,
        date: nowLabel,
        isDebt: n.isDebt,
        price: n.price
      };
      clinicApi.appendNaryadLog(patient.id, entry);
      setNaryadLog((prev) => [entry, ...prev]);
    });

    if (isDebt) {
      await clinicApi.updatePatientBalance(patient.id, -total);
      setPatient((prev) => (prev ? { ...prev, balance: prev.balance - total } : null));
      setInvoices((prev) => [
        { id: Date.now(), date: '08 сентября', status: 'Отменен', paid: 0, total },
        ...prev
      ]);
    } else {
      setInvoices((prev) => [
        { id: Date.now(), date: '08 сентября', status: 'Оплачен', paid: total, total },
        ...prev
      ]);
    }
    setShowNaryadModal(false);
  };

  // Remove (x) a struck naryad from the karzinka — reverses debt and logs who/when/why
  const handleRemoveNaryad = async (id: number, reason: string) => {
    const item = patientNaryads.find((n) => n.id === id);
    if (!item || !patient) return;
    const remaining = patientNaryads.filter((n) => n.id !== id);
    setPatientNaryads(remaining);
    clinicApi.savePatientNaryads(patient.id, remaining);
    setNaryadCount(remaining.length);
    if (item.isDebt) {
      // striking a debt naryad had subtracted from balance — give it back
      await clinicApi.updatePatientBalance(patient.id, item.price);
      setPatient((prev) => (prev ? { ...prev, balance: prev.balance + item.price } : null));
    }
    const logEntry: NaryadLogEntry = {
      id: Date.now(),
      patient_id: patient.id,
      patient_name: patient.full_name,
      doctor: item.doctor,
      action: 'removed',
      title: item.title,
      author: CURRENT_OPERATOR,
      date: 'Bugun, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isDebt: item.isDebt,
      price: item.price,
      reason
    };
    clinicApi.appendNaryadLog(patient.id, logEntry);
    setNaryadLog((prev) => [logEntry, ...prev]);
  };

  // Pay off all outstanding debt in the karzinka using the chosen payment method
  const handlePayKarzinkaDebt = async () => {
    if (!patient) return;
    const debtItems = patientNaryads.filter((n) => n.isDebt);
    const totalDebt = debtItems.reduce((s, n) => s + n.price, 0);
    if (totalDebt <= 0) return;
    await clinicApi.updatePatientBalance(patient.id, totalDebt);
    setPatient((prev) => (prev ? { ...prev, balance: prev.balance + totalDebt } : null));
    const paidList = patientNaryads.map((n) => (n.isDebt ? { ...n, isDebt: false } : n));
    setPatientNaryads(paidList);
    clinicApi.savePatientNaryads(patient.id, paidList);
    setInvoices((prev) => [
      { id: Date.now(), date: '08 сентября', status: 'Оплачен', paid: totalDebt, total: totalDebt },
      ...prev
    ]);
  };

  // Checkout finished (from the ActiveCheckoutModal) — record payment into Оплаты,
  // close active appointment in Zapis, add to treatments, clear the karzinka, then show the printed receipt.
  const handleCheckoutComplete = (data: {
    isDebt: boolean;
    finalTotal: number;
    paymentMethod: string;
    items: CheckoutItem[];
    doctorName: string;
    paidAmount?: number;
    balanceApplied?: number;
    debtAmount?: number;
    payments?: { method: string; amount: number }[];
    closedBy?: string;
    closedByRole?: string;
  }) => {
    const paymentDate = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    const newInvoice: PaymentInvoice = {
      id: Date.now(),
      date: paymentDate,
      status: data.isDebt ? 'Отменен' : 'Оплачен',
      paid: data.isDebt ? 0 : data.finalTotal,
      total: data.finalTotal,
      method: data.paymentMethod,
      operator: data.closedBy || data.doctorName || '',
      operator_role: data.closedByRole || '',
      target: data.isDebt ? 'debt' : 'balance',
      description: data.items.map((i) => `${i.name} (${i.quantity}x)`).join(', '),
      // Urilgan naryad qatorlarini saqlaymiz — keyin schetda AYNAN shular ko'rsatiladi (soxta emas)
      items: data.items.map((it) => ({ name: it.name, doctor: it.doctor, quantity: it.quantity, price: it.price, total: it.price * it.quantity }))
    };

    setInvoices((prev) => {
      const next = [newInvoice, ...prev];
      if (patient) clinicApi.savePatientPayments(patient.id, next);
      return next;
    });

    if (patient) {
      // 1. Close active appointment for this patient in Zapis/Calendar
      const activeApt = patientAppointments.find((a) => a.status !== 'completed' && a.status !== 'cancelled');
      if (activeApt) {
        clinicApi.updateAppointmentStatus(activeApt.id, data.isDebt ? 'debt' : 'completed').catch(() => {});
        setPatientAppointments((prev) =>
          prev.map((a) => (a.id === activeApt.id ? { ...a, status: data.isDebt ? 'debt' : 'completed' } : a))
        );
      }

      // 2. Add procedures to patient treatments (Лечение)
      const newTreatments = data.items.map((it, idx) => ({
        id: Date.now() + idx,
        title: it.name,
        doctor: it.doctor || data.doctorName || 'Сардор Алимов',
        price: it.price * it.quantity,
        status: data.isDebt ? 'Долг' : 'Сделано',
        date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
      }));
      setPatientTreatments((prev) => {
        const next = [...newTreatments, ...prev];
        clinicApi.savePatientTreatments(patient.id, next);
        return next;
      });

      // 3. Clear patient karzinka & checkout draft
      clinicApi.clearPatientNaryads(patient.id);
      clinicApi.clearCheckoutDraft(patient.id);
    }

    setReceiptItems(
      data.items.map((it) => ({
        name: it.name,
        doctor: it.doctor,
        quantity: it.quantity,
        price: it.price,
        total: it.price * it.quantity
      }))
    );
    setReceiptTotal(data.finalTotal);
    setReceiptMethod(data.isDebt ? (tk('k')) : data.paymentMethod);
    setPatientNaryads([]);
    setNaryadCount(0);
    setShowCheckout(false);
    setShowInvoiceModal(true);
  };

  const handleCreateNaryad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;
    const newItem = {
      id: Date.now(),
      title: newNaryadTitle,
      name: newNaryadTitle,
      unitPrice: newNaryadPrice,
      teeth: [] as string[],
      doctor: newNaryadDoctor,
      date: 'Сегодня, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      price: newNaryadPrice,
      isDebt: newNaryadIsDebt,
      quantity: 1
    };
    const updatedList = [newItem, ...patientNaryads];
    setPatientNaryads(updatedList);
    clinicApi.savePatientNaryads(patient.id, updatedList);
    setNaryadCount(updatedList.length);
    const logEntry: NaryadLogEntry = {
      id: newItem.id,
      patient_id: patient.id,
      patient_name: patient.full_name,
      doctor: newItem.doctor,
      action: 'added',
      title: newItem.title,
      author: CURRENT_OPERATOR,
      date: newItem.date,
      isDebt: newItem.isDebt,
      price: newItem.price
    };
    clinicApi.appendNaryadLog(patient.id, logEntry);
    setNaryadLog((prev) => [logEntry, ...prev]);

    if (newNaryadIsDebt) {
      await clinicApi.updatePatientBalance(patient.id, -newNaryadPrice);
      setPatient((prev) => (prev ? { ...prev, balance: prev.balance - newNaryadPrice } : null));
      const newInv: PaymentInvoice = {
        id: Date.now(),
        date: '08 сентября',
        status: 'Отменен',
        paid: 0,
        total: newNaryadPrice
      };
      setInvoices((prev) => [newInv, ...prev]);
    } else {
      const newInv: PaymentInvoice = {
        id: Date.now(),
        date: '08 сентября',
        status: 'Оплачен',
        paid: newNaryadPrice,
        total: newNaryadPrice
      };
      setInvoices((prev) => [newInv, ...prev]);
    }
  };


  if (!patient) return null;

  return (
    <div className="space-y-4 select-none pb-12 text-slate-900 dark:text-white transition-colors">
      {/* Hidden file input for photo notes */}
      <input ref={notePhotoInputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e) => { handlePhotoNote(e.target.files); e.target.value = ''; }} />

      {/* 1. TOP HEADER */}
      <div className="px-1 pt-1 pb-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div style={{ backgroundColor: patient.avatar_color || '#132338' }} className="w-14 h-14 rounded-full text-white font-black text-xl flex items-center justify-center shadow-md flex-shrink-0 tracking-tight">
              {initials}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{patient.full_name}</h1>
                <button onClick={() => setIsEditing(true)} className="p-1 text-slate-400 hover:text-blue-600 rounded-lg transition" title={tk('ttl_edit_name')}>
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-400 mt-1">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold">{patient.phone}</span>
                <a href={`https://t.me/${patient.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="p-1 rounded-full bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 hover:bg-sky-100 transition" title={tk('ttl_write_tg')}>
                  <Send className="w-3 h-3" />
                </a>
              </div>
              <div className="flex items-center space-x-2 mt-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                  {patient.gender === 'Ж' || patient.gender === 'Женщина' ? (tk('female_2')) : (tk('male_2'))}
                </span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowSvcLangMenu(!showSvcLangMenu)}
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition cursor-pointer flex items-center gap-1 shadow-2xs"
                    title={tr('patientd.k8')}
                  >
                    <span>🌐</span>
                    <span>
                      {patient.service_lang === 'uz'
                        ? "O'zbek"
                        : patient.service_lang === 'en'
                        ? 'English'
                        : 'Русский'}
                    </span>
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </button>

                  {showSvcLangMenu && (
                    <div className="absolute left-0 mt-1.5 w-36 bg-white dark:bg-[#1E293B] rounded-xl shadow-2xl border border-slate-200 dark:border-[#334155] py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-[#334155]">
                        {tr('patientd.k9')}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleQuickChangeLang('uz')}
                        className={`w-full px-2.5 py-1.5 text-left text-xs font-bold flex items-center justify-between transition ${
                          patient.service_lang === 'uz'
                            ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>🇺🇿 O‘zbek</span>
                        {patient.service_lang === 'uz' && <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickChangeLang('ru')}
                        className={`w-full px-2.5 py-1.5 text-left text-xs font-bold flex items-center justify-between transition ${
                          patient.service_lang === 'ru'
                            ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>🇷🇺 Русский</span>
                        {patient.service_lang === 'ru' && <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickChangeLang('en')}
                        className={`w-full px-2.5 py-1.5 text-left text-xs font-bold flex items-center justify-between transition ${
                          patient.service_lang === 'en'
                            ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>🇬🇧 English</span>
                        {patient.service_lang === 'en' && <Check className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                  {patient.category_status === 'Постоянный' || patient.category_status === 'Doimiy' ? (tk('regular')) : patient.category_status === 'Первичный' || patient.category_status === 'Birlamchi' ? (tk('new')) : patient.category_status}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => window.print()} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-200 transition" title={t.print}>
              <Printer className="w-4 h-4" />
            </button>
            <button onClick={() => setActiveTab('Записи')} className={`p-2.5 rounded-xl border transition ${activeTab === 'Записи' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-200'}`} title={t.appointments}>
              <Calendar className="w-4 h-4" />
            </button>
            <button onClick={() => setActiveTab('Оплаты')} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-200 transition" title={t.reports}>
              <BarChart3 className="w-4 h-4" />
            </button>
            {!isAdmin && (
              <button onClick={() => setShowNaryadModal(true)} className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold text-xs shadow-sm transition active:scale-95">
                <ShoppingCart className="w-4 h-4" />
                <span>{tk('order_2')}</span>
              </button>
            )}
            <button onClick={() => setShowKarzinkaModal(true)} className="relative flex items-center space-x-1 px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 transition" title={tk('k_2')}>
              <ShoppingCart className="w-3.5 h-3.5 text-slate-500 dark:text-slate-300" />
              <span>{patientNaryads.length}</span>
              {patientNaryads.some((n) => n.isDebt) && (<span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />)}
            </button>
            <div className={`px-3 py-2 rounded-xl border text-xs font-mono font-bold ${(Number(patient.balance) || 0) < 0 ? 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800' : 'bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'}`}>
              {Math.round(Number(patient.balance) || 0).toLocaleString('ru-RU')} UZS
            </div>
            {!isAdmin && (
              <button onClick={() => setIsAddPaymentModalOpen(true)} className="p-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold shadow-md shadow-sky-500/20 transition active:scale-95" title={tk('top_up_pay_debt')}>
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. NAVIGATION TABS */}
      <div className="flex items-center space-x-6 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {tabDefinitions.map((tab) => {
          const isActive = activeTab === tab.id;
          const label = language === 'uz' ? tab.labelUz : language === 'ru' ? tab.labelRu : tab.labelEn;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`relative -mb-px px-1 pb-3 pt-1 text-sm font-semibold whitespace-nowrap transition border-b-2 ${isActive ? 'border-blue-600 text-slate-900 dark:text-white' : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}>
              {label}
            </button>
          );
        })}
      </div>
      {/* 3. DYNAMIC CONTENT AREA BASED ON ACTIVE TAB */}

      {/* TAB 1: ОСНОВНЫЕ (Screenshot 1: Feed + Participants + Mini Chart) */}
      {activeTab === 'Основные' && (
        <div className="space-y-4">
          {/* Top Filter Controls */}
          <div className="flex items-center justify-end space-x-2">
            <select className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 shadow-2xs outline-none">
              <option>{tk('by_date')}</option>
              <option>{tk('newest_first')}</option>
              <option>{tk('oldest_first')}</option>
            </select>
            <select className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 shadow-2xs outline-none">
              <option>{tk('type')}</option>
              <option>{tk('all_events')}</option>
              <option>{tk('notes')}</option>
              <option>{tk('payments')}</option>
              <option>{tk('appointments')}</option>
            </select>
            <select className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 shadow-2xs outline-none">
              <option>{tk('staff')}</option>
              <option>{tk('all_staff')}</option>
              <option>Сардор Мирахмедов</option>
              <option>Мирислом Абдуллаев</option>
              <option>Феруза Шоанварова</option>
            </select>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left 2 Cols: Timeline Feed */}
            <div className="lg:col-span-2 space-y-4">
              {/* Note Creator Box matching Screenshot */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-4 space-y-3">
                <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-2 text-xs font-semibold">
                  <button
                    onClick={() => setSubTab('Заметки')}
                    className={`flex items-center space-x-1.5 pb-1 border-b-2 transition ${
                      subTab === 'Заметки'
                        ? 'border-blue-600 text-blue-600 font-bold'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{tk('notes')}</span>
                  </button>
                  <button
                    onClick={() => setSubTab('Telegram')}
                    className={`flex items-center space-x-1.5 pb-1 border-b-2 transition ${
                      subTab === 'Telegram'
                        ? 'border-sky-500 text-sky-600 font-bold'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Telegram</span>
                  </button>
                </div>

                <div className="relative">
                  {isRecording ? (
                    /* Recording animation — live undulating waveform inside the note area */
                    <div className="flex flex-col gap-2.5 py-3 px-3.5 bg-rose-50/80 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-xl animate-in fade-in">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600"></span>
                          </span>
                          <span className="font-bold text-rose-700 dark:text-rose-400 animate-pulse">
                            {tr('patientd.k10')}
                          </span>
                        </div>
                        <span className="font-mono font-black text-rose-600 dark:text-rose-400 tabular-nums text-sm">
                          {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 h-10 w-full py-1">
                        {micWaveBars.map((h, i) => (
                          <span
                            key={i}
                            className="flex-1 bg-gradient-to-t from-rose-600 to-rose-400 rounded-full transition-all duration-75 ease-out min-h-[4px]"
                            style={{ height: `${h}%` }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={cancelVoiceNote}
                          className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:text-rose-600 flex items-center gap-1 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{tr('patientd.k11')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={stopVoiceNote}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>{tr('patientd.k12')}</span>
                        </button>
                      </div>
                    </div>
                  ) : voicePreview ? (
                    /* Voice preview — listen before sending */
                    <div className="space-y-2 py-2 px-1 animate-in fade-in">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {tr('patientd.k13')}
                          </span>
                        </div>
                      </div>
                      <VoiceAudioPlayer src={voicePreview.url} duration={voicePreview.dur} />
                    </div>
                  ) : (
                    <>
                      <textarea
                        rows={3}
                        value={noteInputText}
                        onChange={(e) => setNoteInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveNote();
                          }
                        }}
                        placeholder={subTab === 'Заметки' ? (tr('patientd.ctrlEnter')) : tk('ph_tg_send')}
                        className="w-full text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 outline-none resize-none bg-transparent"
                      />

                      {/* Photo preview attached to note (up to 5 photos) */}
                      {pendingNotePhotos.length > 0 && (
                        <div className="space-y-1.5 mt-2 animate-in fade-in">
                          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-semibold px-1">
                            <span>{tr('patientd.attachedImages').replace('{n}', String(pendingNotePhotos.length))}</span>
                            {pendingNotePhotos.length < 5 && (
                              <button
                                type="button"
                                onClick={() => notePhotoInputRef.current?.click()}
                                className="text-blue-600 hover:underline"
                              >
                                {tr('patientd.k14')}
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 p-2 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                            {pendingNotePhotos.map((photoUrl, pIdx) => (
                              <div key={pIdx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600 shrink-0 shadow-xs">
                                <img src={photoUrl} alt={`Photo ${pIdx + 1}`} className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => removePendingPhoto(pIdx)}
                                  className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 hover:bg-rose-600 text-white rounded-full flex items-center justify-center transition"
                                  title="O'chirish"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center space-x-3 text-slate-400">
                    <button
                      onClick={() => setActiveTab('Лечение')}
                      className="hover:text-blue-600 transition disabled:opacity-30"
                      title={tk('ttl_pick_tooth')}
                      disabled={isRecording || !!voicePreview}
                    >
                      <Sparkles className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('Фотопротокол');
                      }}
                      className="hover:text-blue-600 transition disabled:opacity-30"
                      title={tk('ttl_xray')}
                      disabled={isRecording || !!voicePreview}
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                    {/* Photo attach → adds a photo note */}
                    <button
                      onClick={() => notePhotoInputRef.current?.click()}
                      className="hover:text-blue-600 transition disabled:opacity-30"
                      title={tk('upload_photo')}
                      disabled={isRecording || !!voicePreview}
                    >
                      <ImageIcon className="w-4 h-4" />
                    </button>
                    {/* Voice record → records, then preview appears */}
                    <button
                      onClick={isRecording ? stopVoiceNote : startVoiceNote}
                      className={`transition flex items-center gap-1 ${isRecording ? 'text-rose-500 font-bold' : 'hover:text-blue-600'} disabled:opacity-30`}
                      title={tk('ttl_voice')}
                      disabled={!!voicePreview}
                    >
                      {isRecording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
                    </button>
                    {!isAdmin && (
                      <button
                        onClick={() => setShowNaryadModal(true)}
                        className="hover:text-blue-600 transition disabled:opacity-30"
                        title={tk('ttl_naryad')}
                        disabled={isRecording || !!voicePreview}
                      >
                        <ShoppingCart className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {voicePreview ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={cancelVoiceNote}
                        className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl hover:text-rose-500 transition text-xs font-semibold flex items-center gap-1"
                        title={tk('cancel_word')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{tr('patientd.k15')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={sendVoiceNote}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                        title={tk('ttl_save')}
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{tr('patientd.k16')}</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSaveNote}
                      disabled={(!noteInputText.trim() && pendingNotePhotos.length === 0) || isRecording}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                      title={tk('ttl_save')}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{tr('patientd.k17')}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Day Section Header: Сегодня */}
              {notesList.length > 0 && (
                <div className="flex items-center justify-center my-4">
                  <span className="px-3 py-1 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold">{tk('txt_today')}</span>
                </div>
              )}

              {/* Notes feed — text / voice / photo notes added via composer */}
              {notesList.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-10 text-center text-sm text-slate-400">
                  {tk('nothing_yet')}
                </div>
              ) : (
                notesList.map((note) => (
                  <div key={note.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-4 flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 font-bold text-xs flex items-center justify-center shrink-0">
                      {note.avatarText}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900 dark:text-white">Мухаммад Одилхонов</span>
                        <span className="text-slate-400 text-[11px]">{note.time}</span>
                      </div>
                      {note.text && <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 font-medium leading-relaxed whitespace-pre-wrap">{note.text}</p>}
                      {(note.images?.length || note.imageUrl) && (
                        <div className="mt-2.5">
                          {note.images && note.images.length > 1 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                              {note.images.map((img, imgIdx) => (
                                <div
                                  key={imgIdx}
                                  onClick={() => setFullscreenImagePreview(img)}
                                  className="relative group/img cursor-pointer rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 aspect-square bg-slate-100 dark:bg-slate-800 shadow-2xs"
                                >
                                  <img src={img} alt={`Rasm ${imgIdx + 1}`} className="w-full h-full object-cover transition duration-200 group-hover/img:scale-105" />
                                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition flex items-center justify-center text-white text-[10px] font-bold">
                                    {tr('patientd.k18')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <img
                              src={note.images?.[0] || note.imageUrl}
                              alt="note"
                              onClick={() => setFullscreenImagePreview(note.images?.[0] || note.imageUrl!)}
                              className="rounded-xl max-h-52 max-w-sm object-cover border border-slate-200 dark:border-slate-700 cursor-pointer hover:opacity-95 transition"
                            />
                          )}
                        </div>
                      )}
                      {note.kind === 'voice' && note.audioUrl && (
                        <div className="mt-2.5 max-w-md">
                          <VoiceAudioPlayer src={note.audioUrl} duration={note.audioDur} authorName={note.author} />
                        </div>
                      )}
                    </div>
                    <div className="text-slate-300 shrink-0">
                      {note.kind === 'voice' ? <Mic className="w-4 h-4" /> : note.kind === 'photo' ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </div>
                    <button
                      onClick={() => removeNote(note.id)}
                      className="text-slate-300 hover:text-rose-500 shrink-0"
                      title={tk('delete_word') || 'Delete'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Right Column: Participants & Mini Odontogram */}
            <div className="space-y-4">
              {/* Card 1: Участники — all doctors involved with this patient */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {tk('participants')}
                  </h3>
                  {/* Overlapping avatar stack (hover a face to see the name) */}
                  <div className="flex -space-x-2">
                    {participants.map((doc) => {
                      const di = doc.full_name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
                      return (
                        <div key={doc.id} className="relative group">
                          {doc.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={doc.avatar}
                              alt={doc.full_name}
                              className="w-8 h-8 rounded-full object-cover ring-2 ring-white dark:ring-slate-900 cursor-pointer"
                            />
                          ) : (
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[10px] ring-2 ring-white dark:ring-slate-900 cursor-pointer"
                              style={{ backgroundColor: doc.color || '#3B82F6' }}
                            >
                              {di}
                            </div>
                          )}
                          {/* Hover tooltip with name + specialty */}
                          <div className="absolute right-0 top-9 z-30 hidden group-hover:block whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] shadow-xl">
                            <p className="font-bold">{doc.full_name}</p>
                            <p className="text-[10px] text-slate-300">{doc.specialty}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2.5">
                  {participants.length === 0 && (
                    <p className="text-[11px] text-slate-400">
                      {tk('k_3')}
                    </p>
                  )}
                  {participants.map((doc, idx) => {
                    const di = doc.full_name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
                    return (
                      <Link key={doc.id} href={`/staff/${doc.id}`} className="flex items-center space-x-3 group">
                        {doc.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={doc.avatar} alt={doc.full_name} className="w-9 h-9 rounded-full object-cover shadow-xs" />
                        ) : (
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-xs"
                            style={{ backgroundColor: doc.color || '#3B82F6' }}
                          >
                            {di}
                          </div>
                        )}
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition">{doc.full_name}</h4>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            {idx === 0
                              ? (tk('treating_doctor')) + ' · '
                              : ''}
                            {doc.specialty}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Card 2: Dental Chart */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-4">
                <DentalChart />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ЗАПИСИ (Screenshot 2: 4 KPI Cards + List) */}
      {activeTab === 'Записи' && (
        <div className="space-y-4">
          {/* Top 4 KPI Metrics matching Screenshot */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{tk('completed')}</p>
                <h3 className="text-2xl font-black text-slate-800 dark:text-white mt-1">{aptStats.completed}</h3>
              </div>
              <Calendar className="w-5 h-5 text-slate-300" />
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{tk('no_show')}</p>
                <h3 className="text-2xl font-black text-slate-800 dark:text-white mt-1">{aptStats.noShow}</h3>
              </div>
              <EyeOff className="w-5 h-5 text-slate-300" />
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{tk('cancelled')}</p>
                <h3 className="text-2xl font-black text-slate-800 dark:text-white mt-1">{aptStats.cancelled}</h3>
              </div>
              <XCircle className="w-5 h-5 text-slate-300" />
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{tk('late')}</p>
                <h3 className="text-2xl font-black text-slate-800 dark:text-white mt-1">{aptStats.late}</h3>
              </div>
              <Watch className="w-5 h-5 text-slate-300" />
            </div>
          </div>

          {/* Subheader: Filter pills + Новая запись */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center space-x-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl shadow-2xs text-xs font-semibold">
              {(['Прошедшие', 'Все', 'Запланировано'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setAppointmentFilter(filter)}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    appointmentFilter === filter
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {filter === 'Прошедшие'
                    ? tk('past')
                    : filter === 'Все'
                    ? tk('all')
                    : tk('scheduled')}
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsNewAptOpen(true)}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-bold shadow-sm transition"
            >
              {tk('new_appointment')}
            </button>
          </div>

          {/* Search bar & Doctor filter */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={aptSearch}
                onChange={(e) => setAptSearch(e.target.value)}
                placeholder={tk('ph_search')}
                className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none shadow-2xs text-slate-900 dark:text-white"
              />
            </div>

            <select
              value={aptDoctor}
              onChange={(e) => setAptDoctor(e.target.value)}
              className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 shadow-2xs outline-none"
            >
              <option value="">{tk('all_staff')}</option>
              {aptDoctorNames.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Real appointments for this patient */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs divide-y divide-slate-100 dark:divide-slate-800">
            {filteredApts.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">{tk('nothing_yet')}</div>
            ) : (
              filteredApts.map((apt) => (
                <div
                  key={apt.id}
                  onClick={() => setSelectedAptModal(apt)}
                  className="p-4 flex items-center justify-between hover:bg-blue-50/50 dark:hover:bg-slate-800/60 cursor-pointer transition rounded-xl border border-transparent hover:border-blue-100 dark:hover:border-slate-700"
                  title={tr('patientd.k19')}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs ${aptStatusColor(apt.status)}`}>
                      {apt.status === 'completed' ? '✓' : apt.status === 'cancelled' || apt.status === 'no_show' ? '✕' : '•'}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                        <span>{fmtAptTime(apt.start_time)}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">{apt.status}</span>
                        {(apt.branch_name || branches.find((b) => b.id === apt.branch)?.name) && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-sky-300 font-semibold inline-flex items-center gap-1">
                            <Building2 className="w-2.5 h-2.5" />
                            {apt.branch_name || branches.find((b) => b.id === apt.branch)?.name}
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate font-medium">{apt.procedure || apt.treatment_notes || tk('service')}</p>
                      <p className="text-[10px] text-slate-400">{apt.doctor_name}{apt.chair_name ? ' • ' + apt.chair_name : ''}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{(Number(apt.price)||0).toLocaleString()} {tk('currency_som')}</p>
                    {Number(apt.paid_amount) > 0 && (
                      <p className="text-[10px] text-emerald-600 font-semibold">{tk('paid')}: {(Number(apt.paid_amount)||0).toLocaleString()} {tk('currency_som')}</p>
                    )}
                    {((Number(apt.price)||0) - (Number(apt.paid_amount)||0)) > 0 && (
                      <p className="text-[10px] text-rose-500 font-semibold">{tr('patientd.k20')}: {((Number(apt.price)||0) - (Number(apt.paid_amount)||0)).toLocaleString()} {tk('currency_som')}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: ЛЕЧЕНИЕ (Screenshot 3: Full-width Odontogram + Procedures) */}
      {activeTab === 'Лечение' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddTreatmentModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{tr('patientd.k21')}</span>
                </button>
                {!isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowNaryadModal(true)}
                    className="px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-sky-300 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/60 transition flex items-center gap-1.5"
                  >
                    <ToothIcon className="w-3.5 h-3.5" filled />
                    <span>{tr('patientd.k22')}</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {tr('patientd.k23')} <strong className="text-slate-900 dark:text-white">{treatmentRecords.length}</strong>
                </span>
              </div>
            </div>

            {/* Full Anatomical Teeth Diagram */}
            <DentalChart />

            <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setTreatmentFilter('date')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  treatmentFilter === 'date' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                }`}
              >{tk('by_date')}</button>
              <button
                onClick={() => setTreatmentFilter('teeth')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  treatmentFilter === 'teeth' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                }`}
              >{tk('by_teeth')}</button>
            </div>
          </div>

          {/* Real treatment records = aggregated treatments, appointments & struck naryads */}
          <div className="space-y-3">
            {treatmentRecords.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-10 text-center text-sm text-slate-400">
                {tk('nothing_yet')}
              </div>
            ) : (
              treatmentRecords.map((a) => (
                <div
                  key={a.id}
                  onClick={() => setTreatmentModalApt(a)}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:border-blue-300 hover:shadow-md transition group"
                >
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{fmtAptTime(a.start_time)}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{a.doctor_name}</p>
                    {a.branch_name && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[10px] font-semibold text-blue-700 dark:text-sky-300">
                        <Building2 className="w-2.5 h-2.5" />
                        {a.branch_name}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 md:px-6">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {a.procedure || a.treatment_notes || tk('service')}
                      </h4>
                      {a.teeth && a.teeth.length > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 text-[10px] font-bold text-blue-700 dark:text-sky-300">
                          {tr('patientd.k24')}: {a.teeth.join(', ')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3 mt-1.5">
                      {a.chair_name && <span className="text-[10px] text-slate-400">{a.chair_name}</span>}
                      <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                        {(Number(a.price)||0).toLocaleString()} {tk('currency_som')}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${a.status === 'debt' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                        {a.status === 'debt' ? tk('statusDebtShort') : tk('done')}
                      </span>
                    </div>
                  </div>

                  {/* Actions: Cancel / Delete (X) button */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(tr('patientd.k25'))) {
                          handleCancelTreatment(a.id);
                        }
                      }}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition"
                      title={tr('patientd.x')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Modal: Yangi Muolaja Qo'shish (Add Treatment Modal) */}
          {isAddTreatmentModalOpen && (
            <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 text-slate-900 dark:text-white">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-sky-400 flex items-center justify-center">
                      <ToothIcon className="w-4 h-4" filled />
                    </div>
                    <h3 className="text-sm font-bold">
                      {tr('patientd.k26')}
                    </h3>
                  </div>
                  <button
                    onClick={() => setIsAddTreatmentModalOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      {tr('patientd.k27')}
                    </label>
                    <input
                      type="text"
                      value={newTreatmentTooth}
                      onChange={(e) => setNewTreatmentTooth(e.target.value)}
                      placeholder="Masalan: 16, 17, 26..."
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      {tr('patientd.k28')}
                    </label>
                    <input
                      type="text"
                      value={newTreatmentTitle}
                      onChange={(e) => setNewTreatmentTitle(e.target.value)}
                      placeholder="Muolaja nomi..."
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500"
                    />
                    {/* Quick Presets */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[
                        { name: 'Karies (Plomba)', price: 450000 },
                        { name: 'Endodontiya (Kanal)', price: 650000 },
                        { name: 'Gigiyena (Air Flow)', price: 500000 },
                        { name: 'Koronka (Sirkoniy)', price: 1800000 },
                        { name: 'Tish olish (Oddiy)', price: 350000 },
                        { name: 'Implantatsiya', price: 4200000 }
                      ].map((preset, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => {
                            setNewTreatmentTitle(preset.name);
                            setNewTreatmentPrice(preset.price);
                          }}
                          className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-sky-400 rounded-lg text-[11px] font-medium transition"
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        {tr('patientd.k29')}
                      </label>
                      <input
                        type="number"
                        step="10000"
                        value={newTreatmentPrice}
                        onChange={(e) => setNewTreatmentPrice(Number(e.target.value) || 0)}
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        {tr('patientd.k30')}
                      </label>
                      <select
                        value={newTreatmentStatus}
                        onChange={(e) => setNewTreatmentStatus(e.target.value as any)}
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-semibold"
                      >
                        <option value="Сделано">{tr('patientd.k31')}</option>
                        <option value="В процессе">{tr('patientd.k32')}</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      {tr('patientd.k33')}
                    </label>
                    <select
                      value={newTreatmentDoctor}
                      onChange={(e) => setNewTreatmentDoctor(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500"
                    >
                      {allEmployees.filter((e) => e.role === 'doctor').map((doc) => (
                        <option key={doc.id} value={doc.full_name}>
                          {doc.full_name} ({doc.specialty || 'Shifokor'})
                        </option>
                      ))}
                      <option value="Сардор Алимов">Сардор Алимов</option>
                      <option value="Мирислом Абдуллаев">Мирислом Абдуллаев</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      {tr('patientd.k34')}
                    </label>
                    <select
                      value={newTreatmentBranchId ?? currentBranchId ?? ''}
                      onChange={(e) => setNewTreatmentBranchId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.address})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddTreatmentModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition"
                  >
                    {tr('patientd.k11')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveNewTreatment}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{tr('patientd.k17')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ПЛАН ЛЕЧЕНИЯ (Comprehensive 32Desk Treatment Plan with Stages, Procedures, KPIs & Execution) */}
      {activeTab === 'План лечения' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 space-y-5 text-slate-900 dark:text-white">
            {/* Header: Title, Curator, Status & Main Actions */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-sky-400 flex items-center justify-center font-bold">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {tr('patientd.fullDentalPlan')}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 pl-11">
                  <span>
                    {tk('curator_label')}: <strong className="text-slate-700 dark:text-slate-200">{participants[0]?.full_name || 'Сардор Алимов'}</strong>
                  </span>
                  <span>•</span>
                  <div className="flex items-center gap-1.5">
                    <span>{tk('status_word')}:</span>
                    <select
                      value={planStatus}
                      onChange={(e) => setPlanStatus(e.target.value)}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-blue-600 dark:text-sky-400 outline-none"
                    >
                      <option value="Согласован с пациентом">{tr('patientd.k35')}</option>
                      <option value="На согласовании">{tr('patientd.k36')}</option>
                      <option value="В процессе">{tr('patientd.k37')}</option>
                      <option value="Завершен">{tr('patientd.k38')}</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>{tk('print_plan')}</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddStage}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{tr('patientd.addNewStage')}</span>
                </button>
              </div>
            </div>

            {/* Total Plan Summary KPIs — 100% dynamic calculation */}
            {(() => {
              const totalCost = treatmentPlans.reduce(
                (sum, s) => sum + (s.cost || s.procedures?.reduce((pSum, p: any) => pSum + ((Number(p.price) || 0) * (Number(p.quantity) || 1)), 0) || 0),
                0
              );
              const discountSum = Math.round((totalCost * (planDiscountPercent || 0)) / 100);
              const paidTotal = Math.min(totalCost, invoices.filter(i => i.status === 'Оплачен').reduce((s, i) => s + i.paid, 0));
              const remaining = Math.max(0, totalCost - discountSum - paidTotal);

              return (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{tk('total_cost')}</p>
                    <p className="text-base font-black text-slate-900 dark:text-white mt-1">
                      {totalCost.toLocaleString('ru-RU')} {tk('currency_som')}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{treatmentPlans.length} {tr('patientd.k39')}</p>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{tk('patient_discount')}</p>
                      <select
                        value={planDiscountPercent}
                        onChange={(e) => setPlanDiscountPercent(Number(e.target.value))}
                        className="text-[11px] font-bold text-emerald-600 bg-transparent outline-none cursor-pointer"
                      >
                        <option value={0}>0%</option>
                        <option value={3}>3%</option>
                        <option value={5}>5%</option>
                        <option value={10}>10%</option>
                        <option value={15}>15%</option>
                      </select>
                    </div>
                    <p className="text-base font-black text-emerald-600 mt-1">
                      {discountSum.toLocaleString('ru-RU')} {tk('currency_som')}
                    </p>
                    <p className="text-[10px] text-emerald-500 mt-0.5">{planDiscountPercent}% {tr('patientd.k40')}</p>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{tk('paid')}</p>
                    <p className="text-base font-black text-blue-600 dark:text-sky-400 mt-1">
                      {paidTotal.toLocaleString('ru-RU')} {tk('currency_som')}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{tr('patientd.k41')}</p>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{tk('remaining_to_pay')}</p>
                    <p className={`text-base font-black mt-1 ${remaining > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {remaining.toLocaleString('ru-RU')} {tk('currency_som')}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{remaining > 0 ? (tr('patientd.k42')) : (tr('patientd.k43'))}</p>
                  </div>
                </div>
              );
            })()}

            {/* Stages List (Bosqichlar va Muolajalar jadvali) */}
            <div className="space-y-4 pt-2">
              {treatmentPlans.length === 0 ? (
                <div className="p-10 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                  <p className="text-sm font-semibold">{tr('patientd.k44')}</p>
                  <button
                    type="button"
                    onClick={handleAddStage}
                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-sm"
                  >
                    + {tr('patientd.k45')}
                  </button>
                </div>
              ) : (
                treatmentPlans.map((stage, stageIdx) => {
                  const stageCost = (stage.procedures || []).reduce(
                    (s: number, p: any) => s + ((Number(p.price) || 0) * (Number(p.quantity) || 1)),
                    0
                  );

                  return (
                    <div
                      key={stage.id}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs hover:border-blue-200 dark:hover:border-blue-900 transition"
                    >
                      {/* Stage Top Bar */}
                      <div className="p-4 bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${
                            stage.status === 'Выполнено'
                              ? 'bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-950'
                              : stage.status === 'В процессе'
                              ? 'bg-amber-500 ring-4 ring-amber-100 dark:ring-amber-950'
                              : stage.status === 'Отменено'
                              ? 'bg-rose-500 ring-4 ring-rose-100 dark:ring-rose-950'
                              : 'bg-blue-500 ring-4 ring-blue-100 dark:ring-blue-950'
                          }`} />
                          <div>
                            <input
                              type="text"
                              value={stage.title}
                              onChange={(e) => handleUpdateStage(stage.id, { title: e.target.value })}
                              className="font-black text-sm bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-blue-500 outline-none text-slate-900 dark:text-white"
                            />
                            {stage.description && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stage.description}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5">
                          {/* Stage Status Selector */}
                          <select
                            value={stage.status}
                            onChange={(e) => handleUpdateStage(stage.id, { status: e.target.value as any })}
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold border outline-none ${
                              stage.status === 'Выполнено'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                : stage.status === 'В процессе'
                                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                                : stage.status === 'Отменено'
                                ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                                : 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                            }`}
                          >
                            <option value="Запланировано">{tr('patientd.k46')}</option>
                            <option value="В процессе">{tr('patientd.k32')}</option>
                            <option value="Выполнено">{tr('patientd.k47')}</option>
                            <option value="Отменено">{tr('patientd.k48')}</option>
                          </select>

                          {/* Stage Doctor Selector */}
                          <select
                            value={stage.doctor}
                            onChange={(e) => handleUpdateStage(stage.id, { doctor: e.target.value })}
                            className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none"
                          >
                            {allEmployees.filter((e) => e.role === 'doctor').map((doc) => (
                              <option key={doc.id} value={doc.full_name}>{doc.full_name}</option>
                            ))}
                            <option value="Сардор Алимов">Сардор Алимов</option>
                            <option value="Мирислом Абдуллаев">Мирислом Абдуллаев</option>
                            <option value="Сардор Мирахмедов">Сардор Мирахмедов</option>
                          </select>

                          {/* Stage Subtotal */}
                          <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white">
                            {stageCost.toLocaleString('ru-RU')} {tk('currency_som')}
                          </div>

                          {/* Add procedure button */}
                          <button
                            type="button"
                            onClick={() => handleOpenAddProcedure(stage.id)}
                            className="px-3 py-1 bg-blue-50 dark:bg-blue-950/70 hover:bg-blue-100 text-blue-600 dark:text-sky-300 rounded-xl text-xs font-bold flex items-center gap-1 border border-blue-200 dark:border-blue-800 transition"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{tr('patientd.k49')}</span>
                          </button>

                          {/* Delete Stage button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(tr('patientd.k50'))) {
                                handleRemoveStage(stage.id);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 transition"
                            title="Удалить этап"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Procedures Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 font-bold">
                              <th className="py-2.5 px-4 w-10">#</th>
                              <th className="py-2.5 px-4 w-24">{tr('patientd.k24')}</th>
                              <th className="py-2.5 px-4">{tr('patientd.k51')}</th>
                              <th className="py-2.5 px-4 w-20 text-center">{tr('patientd.k52')}</th>
                              <th className="py-2.5 px-4 w-32 text-right">{tr('patientd.k53')}</th>
                              <th className="py-2.5 px-4 w-32 text-right">{tr('patientd.k54')}</th>
                              <th className="py-2.5 px-4 w-40">{tr('patientd.k55')}</th>
                              <th className="py-2.5 px-4 w-44 text-center">{tr('patientd.k56')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {(!stage.procedures || stage.procedures.length === 0) ? (
                              <tr>
                                <td colSpan={8} className="py-6 text-center text-slate-400 text-xs">
                                  {tr('patientd.k57')}
                                </td>
                              </tr>
                            ) : (
                              stage.procedures.map((proc: any, pIdx: number) => {
                                const pCost = (Number(proc.price) || 0) * (Number(proc.quantity) || 1);
                                return (
                                  <tr key={proc.id || pIdx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                                    <td className="py-3 px-4 font-mono text-slate-400">{pIdx + 1}</td>
                                    <td className="py-3 px-4">
                                      {proc.teeth ? (
                                        <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-sky-300 font-black text-[11px] border border-blue-200 dark:border-blue-800">
                                          #{proc.teeth}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">—</span>
                                      )}
                                    </td>
                                    <td className="py-3 px-4">
                                      <span className="font-bold text-slate-800 dark:text-slate-200">{localizeProc(proc)}</span>
                                    </td>
                                    <td className="py-3 px-4 text-center font-bold">{proc.quantity || 1}</td>
                                    <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                                      {(Number(proc.price) || 0).toLocaleString('ru-RU')}
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                                      {pCost.toLocaleString('ru-RU')} {tk('currency_som')}
                                    </td>
                                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{proc.doctor || stage.doctor}</td>
                                    <td className="py-3 px-4 text-center">
                                      <div className="flex items-center justify-center gap-1.5">
                                        {/* Execute to Treatment */}
                                        <button
                                          type="button"
                                          onClick={() => handleExecuteProcedureToTreatment(stage.id, proc)}
                                          className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/70 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 rounded-lg text-[11px] font-bold border border-emerald-200 dark:border-emerald-800 transition flex items-center gap-1"
                                          title={tr('patientd.k58')}
                                        >
                                          <Check className="w-3 h-3" />
                                          <span>{tr('patientd.k59')}</span>
                                        </button>

                                        {/* Delete procedure */}
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveProcedureFromStage(stage.id, proc.id)}
                                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 transition"
                                          title="Удалить услугу"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* MODAL: ADD PROCEDURE TO STAGE */}
          {addingProcStageId !== null && (
            <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 text-slate-900 dark:text-white">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-sky-400 flex items-center justify-center">
                      <Plus className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold">
                      {tr('patientd.k60')}
                    </h3>
                  </div>
                  <button
                    onClick={() => setAddingProcStageId(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3.5 text-xs">
                  {/* Tooth number */}
                  <div>
                    <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      {tr('patientd.k27')}
                    </label>
                    <input
                      type="text"
                      value={procTeeth}
                      onChange={(e) => setProcTeeth(e.target.value)}
                      placeholder="Masalan: 16, 21, 26..."
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-bold"
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {['16', '15', '14', '11', '21', '24', '25', '26', '36', '46'].map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setProcTeeth(t)}
                          className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 text-[10px] font-bold text-slate-700 dark:text-slate-300"
                        >
                          #{t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Procedure Title */}
                  <div>
                    <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      {tr('patientd.k61')}
                    </label>
                    <input
                      type="text"
                      value={procCustomTitle}
                      onChange={(e) => setProcCustomTitle(e.target.value)}
                      placeholder="Xizmat nomini kiriting..."
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-semibold"
                    />
                    {/* Quick Presets */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[
                        { title: 'Кариес дентина (световая пломба Estelite)', price: 450000 },
                        { title: 'Лечение пульпита и пломбирование каналов', price: 750000 },
                        { title: 'Комплексная гигиена полости рта (Air-Flow)', price: 600000 },
                        { title: 'Анатомическая циркониевая коронка Prettau', price: 1800000 },
                        { title: 'Удаление зуба сложное (ретинированный)', price: 650000 },
                        { title: 'Установка имплантата Dentium SuperLine', price: 4200000 }
                      ].map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setProcCustomTitle(preset.title);
                            setProcPrice(preset.price);
                          }}
                          className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-sky-400 rounded-lg text-[11px] font-medium transition"
                        >
                          {preset.title}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quantity & Price */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        {tr('patientd.k62')}
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={procQty}
                        onChange={(e) => setProcQty(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        {tr('patientd.k29')}
                      </label>
                      <input
                        type="number"
                        step="10000"
                        value={procPrice}
                        onChange={(e) => setProcPrice(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-bold"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-100 dark:border-slate-700 flex justify-between items-center text-xs">
                    <span className="text-slate-500">{tr('patientd.k63')}</span>
                    <span className="font-black text-sm text-slate-900 dark:text-white font-mono">
                      {((procPrice || 0) * (procQty || 1)).toLocaleString('ru-RU')} {tk('currency_som')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setAddingProcStageId(null)}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition"
                  >
                    {tr('patientd.k11')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveProcedureToStage}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{tr('patientd.k64')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══ KATTA MODAL: Yangi bosqich (Этап) tuzish — 32desk uslubi ══ */}
          {showStageModal && (
            <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-6 overflow-y-auto" onClick={() => setShowStageModal(false)}>
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-slate-900 w-full sm:rounded-3xl sm:max-w-5xl sm:min-h-0 min-h-screen shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white flex flex-col sm:max-h-[92vh]"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black">{tr('patientd.k65')}</h3>
                      <p className="text-xs text-slate-400">{patient?.full_name}</p>
                    </div>
                  </div>
                  <button onClick={() => setShowStageModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {/* Bosqich sarlavhasi + izoh */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">{tr('patientd.k66')}</label>
                        <input
                          type="text"
                          value={stageTitle}
                          onChange={(e) => setStageTitle(e.target.value)}
                          placeholder={tr('patientd.k67')}
                          className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">{tr('patientd.k68')}</label>
                        <textarea
                          value={stageDesc}
                          onChange={(e) => setStageDesc(e.target.value)}
                          rows={2}
                          placeholder={tr('patientd.k69')}
                          className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 text-sm resize-none"
                        />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">{tr('patientd.k55')}</label>
                        <select
                          value={stageDoctor}
                          onChange={(e) => setStageDoctor(e.target.value)}
                          className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-semibold text-sm"
                        >
                          {allEmployees.filter((e) => e.role === 'doctor').map((doc) => (
                            <option key={doc.id} value={doc.full_name}>{doc.full_name}</option>
                          ))}
                          {allEmployees.filter((e) => e.role === 'doctor').length === 0 && (
                            <option value="Сардор Алимов">Сардор Алимов</option>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">{tr('patientd.k70')}</label>
                        <select
                          value={stageStatus}
                          onChange={(e) => setStageStatus(e.target.value as TreatmentPlanStage['status'])}
                          className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-semibold text-sm"
                        >
                          <option value="Запланировано">{tr('patientd.k46')}</option>
                          <option value="В процессе">{tr('patientd.k32')}</option>
                          <option value="Выполнено">{tr('patientd.k47')}</option>
                          <option value="Отменено">{tr('patientd.k48')}</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Muolajalar (xizmatlar) qo'shish */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-blue-600 dark:text-sky-400" />
                      <h4 className="text-sm font-bold">{tr('patientd.k71')}</h4>
                      <span className="ml-auto text-xs font-mono font-bold text-slate-500">{stageProcs.length}</span>
                    </div>

                    {/* Qo'shish formasi (bir qator) */}
                    <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-2 items-end bg-white dark:bg-slate-900">
                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">{tr('patientd.k24')}</label>
                        <input type="text" value={spTeeth} onChange={(e) => setSpTeeth(e.target.value)} placeholder="16, 21" className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 text-sm font-bold" />
                      </div>
                      <div className="md:col-span-5">
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">{tr('patientd.k72')}</label>
                        <input type="text" value={spTitle} onChange={(e) => setSpTitle(e.target.value)} placeholder={tr('patientd.k73')} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 text-sm" />
                      </div>
                      <div className="md:col-span-1">
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">{tr('patientd.k74')}</label>
                        <input type="number" min="1" value={spQty} onChange={(e) => setSpQty(Math.max(1, Number(e.target.value) || 1))} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 text-sm font-bold" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">{tr('patientd.k53')}</label>
                        <input type="number" step="10000" value={spPrice} onChange={(e) => setSpPrice(Math.max(0, Number(e.target.value) || 0))} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 text-sm font-bold" />
                      </div>
                      <div className="md:col-span-2">
                        <button type="button" onClick={handleAddProcToStageDraft} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition">
                          <Plus className="w-3.5 h-3.5" />
                          <span>{tr('patientd.k75')}</span>
                        </button>
                      </div>
                    </div>

                    {/* Tez shablonlar */}
                    <div className="px-4 pb-3 flex flex-wrap gap-1.5 bg-white dark:bg-slate-900">
                      {[
                        { title: 'Кариес дентина (световая пломба Estelite)', price: 450000 },
                        { title: 'Лечение пульпита и пломбирование каналов', price: 750000 },
                        { title: 'Комплексная гигиена (Air-Flow + УЗ)', price: 600000 },
                        { title: 'Циркониевая коронка Prettau', price: 1800000 },
                        { title: 'Удаление зуба (сложное)', price: 650000 },
                        { title: 'Имплантат Dentium SuperLine', price: 4200000 }
                      ].map((preset, idx) => (
                        <button key={idx} type="button" onClick={() => { setSpTitle(preset.title); setSpPrice(preset.price); }} className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-sky-400 rounded-lg text-[11px] font-medium transition">
                          {preset.title}
                        </button>
                      ))}
                    </div>

                    {/* Qo'shilgan muolajalar ro'yxati */}
                    <div className="border-t border-slate-100 dark:border-slate-800">
                      {stageProcs.length === 0 ? (
                        <div className="py-8 text-center text-slate-400 text-xs">{tr('patientd.k76')}</div>
                      ) : (
                        <table className="w-full text-left text-xs">
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {stageProcs.map((p, i) => (
                              <tr key={p.id}>
                                <td className="py-2.5 px-4 font-mono text-slate-400 w-8">{i + 1}</td>
                                <td className="py-2.5 px-2 w-16">{p.teeth ? <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-sky-300 font-black text-[11px] border border-blue-200 dark:border-blue-800">#{p.teeth}</span> : <span className="text-slate-400">—</span>}</td>
                                <td className="py-2.5 px-2 font-bold text-slate-800 dark:text-slate-200">{p.title}</td>
                                <td className="py-2.5 px-2 text-center font-bold w-12">×{p.quantity}</td>
                                <td className="py-2.5 px-2 text-right font-mono text-slate-600 dark:text-slate-400 w-28">{((Number(p.price) || 0) * (Number(p.quantity) || 1)).toLocaleString('ru-RU')} {tk('currency_som')}</td>
                                <td className="py-2.5 px-3 text-right w-10">
                                  <button type="button" onClick={() => setStageProcs((prev) => prev.filter((x) => x.id !== p.id))} className="p-1 text-slate-400 hover:text-rose-500 rounded transition">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                  <div className="text-sm">
                    <span className="text-slate-500">{tr('patientd.k77')} </span>
                    <span className="font-black text-base text-slate-900 dark:text-white font-mono">
                      {stageProcs.reduce((s, p) => s + (Number(p.price) || 0) * (Number(p.quantity) || 1), 0).toLocaleString('ru-RU')} {tk('currency_som')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setShowStageModal(false)} className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold transition">
                      {tr('patientd.k11')}
                    </button>
                    <button type="button" onClick={handleSaveStageModal} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{tr('patientd.k78')}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: ЗАМЕТКИ (Eslatmalar) */}
      {activeTab === 'Заметки' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">{tk('leave_a_note')}</h3>
              <button
                type="button"
                onClick={isRecording ? stopVoiceNote : startVoiceNote}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-xs ${
                  isRecording
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 hover:bg-blue-100'
                }`}
                title={isRecording ? 'To‘xtatish' : 'Ovozli eslatma yozish'}
                disabled={!!voicePreview}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>{isRecording ? `${recordSeconds}s • To‘xtatish` : (tr('patientd.k79'))}</span>
              </button>
            </div>

            {/* Recording active banner with live sound waves */}
            {isRecording && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-rose-600 font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                    <span>{tr('patientd.k80')}</span>
                  </div>
                  <span className="font-mono font-bold text-rose-600 tabular-nums">{Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}</span>
                </div>
                <div className="flex items-center gap-1 h-8 w-full py-0.5">
                  {micWaveBars.map((h, i) => (
                    <span
                      key={i}
                      className="flex-1 bg-gradient-to-t from-rose-600 to-rose-400 rounded-full transition-all duration-75 ease-out min-h-[3px]"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={cancelVoiceNote}
                    className="px-2.5 py-1 text-slate-500 hover:text-rose-600 text-xs font-semibold flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>{tr('patientd.k11')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopVoiceNote}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs flex items-center gap-1 shadow-xs"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    <span>{tr('patientd.k81')}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Voice Preview before save */}
            {voicePreview && (
              <div className="p-3 bg-blue-50/80 dark:bg-slate-800/80 border border-blue-200 dark:border-slate-700 rounded-xl space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-xs font-bold text-blue-900 dark:text-blue-200">
                  <span>{tr('patientd.k82')}</span>
                  <span className="font-mono">{Math.floor(voicePreview.dur / 60)}:{String(voicePreview.dur % 60).padStart(2, '0')}</span>
                </div>
                <VoiceAudioPlayer src={voicePreview.url} duration={voicePreview.dur} />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={cancelVoiceNote}
                    className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 font-medium"
                  >
                    {tr('patientd.k11')}
                  </button>
                  <button
                    type="button"
                    onClick={sendVoiceNote}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1"
                  >
                    <Send className="w-3 h-3" />
                    <span>{tr('patientd.k17')}</span>
                  </button>
                </div>
              </div>
            )}

            <textarea
              rows={5}
              value={noteInputText}
              onChange={(e) => setNoteInputText(e.target.value)}
              placeholder={tr('patientd.phNoteFull')}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveNote();
                }
              }}
              className="w-full text-xs p-3 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 resize-none bg-slate-50/50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
            />

            {/* Photo preview attached to note in Notes tab (up to 5 photos) */}
            {pendingNotePhotos.length > 0 && (
              <div className="space-y-1.5 animate-in fade-in">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-semibold px-1">
                  <span>{tr('patientd.attachedImages').replace('{n}', String(pendingNotePhotos.length))}</span>
                  {pendingNotePhotos.length < 5 && (
                    <button
                      type="button"
                      onClick={() => notePhotoInputRef.current?.click()}
                      className="text-blue-600 hover:underline"
                    >
                      {tr('patientd.k14')}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 p-2.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                  {pendingNotePhotos.map((photoUrl, pIdx) => (
                    <div key={pIdx} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600 shrink-0 shadow-xs">
                      <img src={photoUrl} alt={`Photo ${pIdx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePendingPhoto(pIdx)}
                        className="absolute top-1 right-1 w-4 h-4 bg-black/60 hover:bg-rose-600 text-white rounded-full flex items-center justify-center transition"
                        title="O'chirish"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => notePhotoInputRef.current?.click()}
                className="p-2 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title={tk('upload_photo')}
              >
                <ImageIcon className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleSaveNote}
                disabled={(!noteInputText.trim() && pendingNotePhotos.length === 0) || isRecording}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center space-x-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{tk('save_note')}</span>
              </button>
            </div>
          </div>

          <div className="md:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-5 space-y-3">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">{tk('notes_history')} ({notesList.length})</h3>
            {notesList.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                {tk('nothing_yet')}
              </div>
            ) : (
              notesList.map((note) => (
                <div
                  key={note.id}
                  className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-2xl flex items-start space-x-3 text-xs group"
                >
                  <div className="w-8 h-8 rounded-full bg-amber-400 text-amber-950 font-bold flex items-center justify-center flex-shrink-0 text-xs shadow-xs">
                    {note.avatarText}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200">{note.author}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] text-slate-400">
                          {note.date}, {note.time}
                        </span>
                        <button
                          onClick={() => removeNote(note.id)}
                          className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition"
                          title="O‘chirish"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {note.text && <p className="text-slate-700 dark:text-slate-300 mt-1 font-medium leading-relaxed whitespace-pre-wrap">{note.text}</p>}
                    {(note.images?.length || note.imageUrl) && (
                      <div className="mt-2.5">
                        {note.images && note.images.length > 1 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                            {note.images.map((img, imgIdx) => (
                              <div
                                key={imgIdx}
                                onClick={() => setFullscreenImagePreview(img)}
                                className="relative group/img cursor-pointer rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 aspect-square bg-slate-100 dark:bg-slate-800 shadow-2xs"
                              >
                                <img src={img} alt={`Rasm ${imgIdx + 1}`} className="w-full h-full object-cover transition duration-200 group-hover/img:scale-105" />
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition flex items-center justify-center text-white text-[10px] font-bold">
                                  {tr('patientd.k18')}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <img
                            src={note.images?.[0] || note.imageUrl}
                            alt="Note photo"
                            onClick={() => setFullscreenImagePreview(note.images?.[0] || note.imageUrl!)}
                            className="rounded-xl max-h-52 max-w-sm object-cover border border-slate-200 dark:border-slate-700 cursor-pointer hover:opacity-95 transition"
                          />
                        )}
                      </div>
                    )}
                    {note.kind === 'voice' && note.audioUrl && (
                      <div className="mt-2.5 max-w-md">
                        <VoiceAudioPlayer src={note.audioUrl} duration={note.audioDur} authorName={note.author} />
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 6: РЕНТГЕН (Screenshot 5: Table + Rengen Joylanadi + Viewer) */}
      {activeTab === 'Рентген' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 space-y-4">
          {/* Sarlavha: Рентген / Фото */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-950/70 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <ImageIcon className="w-4 h-4" />
            </div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">{tr('patientd.k83')}</h3>
          </div>

          {/* ══ 2 tugma = rejim almashtirgich (Рентген ma'lumotlari / Фото hujjati) + 3D Skan ══ */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setXrayViewMode('rentgen')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${xrayViewMode === 'rentgen' ? 'bg-sky-500 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'}`}
              >
                <Radio className="w-4 h-4" />
                <span>{tr('patientd.k84')}</span>
              </button>
              <button
                onClick={() => setXrayViewMode('foto')}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${xrayViewMode === 'foto' ? 'bg-indigo-500 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'}`}
              >
                <ImageIcon className="w-4 h-4" />
                <span>{tr('patientd.k85')}</span>
              </button>
            </div>

            {/* 3D Skan status & trigger tugmasi */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (patient3DScan.hasScan) {
                    setIs3DScanViewerOpen(true);
                  } else {
                    setIs3DScanModalOpen(true);
                  }
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition border shadow-2xs ${
                  patient3DScan.hasScan
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border-purple-300 dark:border-purple-800 hover:bg-purple-200'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                }`}
                title={tr('patientd.n3d')}
              >
                <Boxes className="w-4 h-4 text-purple-500" />
                <span>3D Skan: <strong>{patient3DScan.hasScan ? (tr('patientd.k86')) : (tr('patientd.k87'))}</strong></span>
              </button>

              {patient3DScan.hasScan && (
                <button
                  type="button"
                  onClick={() => setIs3DScanViewerOpen(true)}
                  className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition flex items-center gap-1 shadow-2xs"
                  title={tr('patientd.n3d2')}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{tr('patientd.k88')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Yashirin 3D Skan file input */}
          <input
            ref={scanFileInputRef}
            type="file"
            accept=".stl,.ply,.obj,.dcm,.zip"
            className="hidden"
            onChange={(e) => { handle3DScanFileUpload(e.target.files); e.target.value = ''; }}
          />

          {/* Yashirin file input (Фото hujjatiga rasm qo'shish uchun) */}
          <input
            ref={xrayPhotoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { handleXrayPhotos(e.target.files); e.target.value = ''; }}
          />

          {/* ═══════════ РЕНТГЕН ko'rinishi: strukturaviy ma'lumotlar jadvali ═══════════ */}
          {xrayViewMode === 'rentgen' && (
          <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={xraySearch}
                onChange={(e) => setXraySearch(e.target.value)}
                placeholder={tk('ph_search')}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none"
              />
            </div>

            <div className="flex items-center space-x-2">
              <select className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 outline-none">
                <option>{tk('by_date')}</option>
                <option>{tk('newest_first')}</option>
                <option>{tk('oldest_first')}</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setSelectedRentgenItem({
                    id: 9999,
                    toothNumber: '3D KT',
                    date: new Date().toISOString().split('T')[0],
                    type: 'Planmeca Romexis 3D / Diagnocat AI',
                    quantity: '1',
                    doctor: 'Diagnocat AI',
                    dose: '48 µSv',
                    isZipPackage: true,
                    fileName: 'Planmeca_Romexis_3D.zip'
                  });
                  setIsRentgenViewerOpen(true);
                }}
                className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-xs font-black transition shadow-md shadow-indigo-500/20 flex items-center gap-1.5 cursor-pointer"
                title="Diagnocat 3D KT Tomografiya va MPR tahlili"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Diagnocat 3D KT</span>
              </button>
              <button
                onClick={() => setIsNewXrayOpen(true)}
                className="px-4 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{tr('patientd.k89')}</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                  <th className="py-2.5 px-3">{tk('tooth')}</th>
                  <th className="py-2.5 px-3">{tk('date')}</th>
                  <th className="py-2.5 px-3">{tk('type_2')}</th>
                  <th className="py-2.5 px-3">{tk('quantity')}</th>
                  <th className="py-2.5 px-3">{tk('dose')}</th>
                  <th className="py-2.5 px-3 text-right">{tk('image')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {xrays.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-400 text-xs font-medium">{tk('nothing_yet')}</td>
                  </tr>
                ) : (
                  xrays
                    .filter(
                      (x) =>
                        !xraySearch ||
                        x.toothNumber.includes(xraySearch) ||
                        x.type.toLowerCase().includes(xraySearch.toLowerCase())
                    )
                    .map((x) => (
                      <tr
                        key={x.id}
                        onClick={() => {
                          if (x.isZipPackage || x.fileName?.toLowerCase().endsWith('.zip') || x.type?.includes('Planmeca')) {
                            setSelectedRentgenItem(x);
                            setIsRentgenViewerOpen(true);
                          } else {
                            setSelectedXrayView(x);
                          }
                        }}
                        className="hover:bg-blue-50/60 dark:hover:bg-slate-800/60 cursor-pointer transition group"
                      >
                        <td className="py-3 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {x.toothNumber.startsWith('П') ? x.toothNumber : `#${x.toothNumber}`}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{x.date}</td>
                        <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200 flex items-center space-x-2">
                          <span>{x.type}</span>
                          <span className="text-[10px] text-slate-400">({x.doctor})</span>
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{x.quantity}</td>
                        <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">{x.dose}</td>
                        <td className="py-3 px-3 text-right">
                          {x.isZipPackage || x.fileName?.toLowerCase().endsWith('.zip') || x.type?.includes('Planmeca') ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRentgenItem(x);
                                setIsRentgenViewerOpen(true);
                              }}
                              className="px-2.5 py-1 bg-cyan-100 dark:bg-cyan-950/70 text-cyan-800 dark:text-cyan-300 hover:bg-cyan-600 hover:text-white rounded-md text-[11px] font-bold transition inline-flex items-center space-x-1"
                            >
                              <HardDrive className="w-3 h-3" />
                              <span>{tr('patientd.zip')}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedXrayView(x);
                              }}
                              className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 group-hover:bg-blue-600 group-hover:text-white rounded-md text-[11px] font-bold text-slate-600 dark:text-slate-300 transition inline-flex items-center space-x-1"
                            >
                              <ImageIcon className="w-3 h-3" />
                              <span>{tk('view')}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
          </>
          )}

          {/* ═══════════ ФОТО ko'rinishi: Word-uslubidagi hujjat (matn + rasm bloklari) ═══════════ */}
          {xrayViewMode === 'foto' && (
            <div className="space-y-3">
              {/* Asboblar paneli */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={addTextBlock}
                  className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                >
                  <Type className="w-3.5 h-3.5" />
                  <span>{tr('patientd.k90')}</span>
                </button>
                <button
                  onClick={() => xrayPhotoInputRef.current?.click()}
                  className="px-3.5 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>{tr('patientd.k91')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIs3DScanModalOpen(true)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    patient3DScan.hasScan
                      ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <Boxes className="w-3.5 h-3.5" />
                  <span>3D Skan: {patient3DScan.hasScan ? (tr('patientd.k86')) : (tr('patientd.k87'))}</span>
                </button>
                <span className="text-[11px] text-slate-400 ml-1">{tr('patientd.word')}</span>
              </div>

              {/* Hujjat sahifasi */}
              <div className="bg-slate-100 dark:bg-slate-950 rounded-2xl p-4 sm:p-8 flex justify-center">
                <div className="bg-white dark:bg-slate-900 w-full max-w-3xl min-h-[60vh] rounded-lg shadow-lg border border-slate-200 dark:border-slate-800 p-6 sm:p-10 space-y-3">
                  {photoDoc.length === 0 ? (
                    <div
                      onClick={() => xrayPhotoInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl py-16 text-center cursor-pointer hover:border-indigo-300 transition"
                    >
                      <ImageIcon className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="text-sm font-bold text-slate-500 dark:text-slate-300">{tr('patientd.k92')}</p>
                      <p className="text-[11px] text-slate-400 mt-1">{tr('patientd.k93')}</p>
                    </div>
                  ) : (
                    photoDoc.map((b, bi) => {
                      // Har blok uchun umumiy boshqaruv paneli (yuqoriga/pastga/o'chirish)
                      const alignCls = b.align === 'center' ? 'text-center items-center' : b.align === 'right' ? 'text-right items-end' : 'text-left items-start';
                      const Controls = (
                        <div className="absolute -top-2 -right-2 flex items-center gap-0.5 bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 opacity-0 group-hover:opacity-100 transition z-10">
                          <button onClick={() => moveDocBlock(b.id, -1)} disabled={bi === 0} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" title="↑"><ChevronUp className="w-3.5 h-3.5" /></button>
                          <button onClick={() => moveDocBlock(b.id, 1)} disabled={bi === photoDoc.length - 1} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" title="↓"><ChevronDown className="w-3.5 h-3.5" /></button>
                          <button onClick={() => removeDocBlock(b.id)} className="p-1 text-slate-400 hover:text-rose-500" title={tk('delete_word')}><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      );
                      const AlignButtons = (
                        <div className="absolute -top-2 left-2 flex items-center bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden opacity-0 group-hover:opacity-100 transition z-10">
                          {(['left', 'center', 'right'] as const).map((al) => (
                            <button key={al} onClick={() => updateDocBlock(b.id, { align: al })} className={`px-1.5 py-1 text-[10px] font-black ${b.align === al ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                              {al === 'left' ? '⬅' : al === 'center' ? '↔' : '➡'}
                            </button>
                          ))}
                        </div>
                      );

                      if (b.kind === 'text') {
                        return (
                          <div key={b.id} className="relative group">
                            {Controls}
                            {AlignButtons}
                            <div className="absolute -top-2 left-24 flex items-center bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden opacity-0 group-hover:opacity-100 transition z-10">
                              <button onClick={() => updateDocBlock(b.id, { heading: !b.heading })} className={`px-2 py-1 text-[10px] font-black ${b.heading ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`} title={tr('patientd.k94')}>H</button>
                            </div>
                            <textarea
                              value={b.text}
                              onChange={(e) => { updateDocBlock(b.id, { text: e.target.value }); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                              placeholder={tr('patientd.k95')}
                              rows={1}
                              style={{ textAlign: b.align }}
                              className={`w-full bg-transparent outline-none resize-none text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 leading-relaxed ${b.heading ? 'text-xl font-black' : 'text-sm'}`}
                            />
                          </div>
                        );
                      }
                      // image block
                      const imgW = b.width === 'sm' ? 'w-1/3' : b.width === 'md' ? 'w-2/3' : b.width === 'lg' ? 'w-5/6' : 'w-full';
                      return (
                        <div key={b.id} className={`relative group flex flex-col ${alignCls}`}>
                          {Controls}
                          {AlignButtons}
                          {/* O'lcham tugmalari */}
                          <div className="absolute -top-2 left-24 flex items-center bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden opacity-0 group-hover:opacity-100 transition z-10">
                            {(['sm', 'md', 'lg', 'full'] as const).map((w) => (
                              <button key={w} onClick={() => updateDocBlock(b.id, { width: w })} className={`px-1.5 py-1 text-[10px] font-black ${b.width === w ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`} title={language === 'uz' ? (w === 'sm' ? 'Kichik' : w === 'md' ? 'O‘rta' : w === 'lg' ? 'Katta' : 'To‘liq') : (w === 'sm' ? 'Маленький' : w === 'md' ? 'Средний' : w === 'lg' ? 'Большой' : 'Полный')}>
                                {w === 'sm' ? 'S' : w === 'md' ? 'M' : w === 'lg' ? 'L' : 'XL'}
                              </button>
                            ))}
                          </div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={b.url} alt={b.caption || 'photo'} className={`${imgW} rounded-lg border border-slate-200 dark:border-slate-700 object-contain`} />
                          <input
                            type="text"
                            value={b.caption}
                            onChange={(e) => updateDocBlock(b.id, { caption: e.target.value })}
                            placeholder={tr('patientd.k96')}
                            style={{ textAlign: b.align }}
                            className={`${imgW} mt-1 bg-transparent outline-none text-xs italic text-slate-500 dark:text-slate-400 placeholder:text-slate-300 dark:placeholder:text-slate-600`}
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: FOTO PROTOKOL (Keynote Dental Protocol) */}
      {activeTab === 'Фотопротокол' && (
        <div className="pt-2">
          <KeynoteDentalPhotoProtocol patient={patient} />
        </div>
      )}

      {/* TAB 7: ОПЛАТЫ (Screenshot 1: KPIs + Subtabs + Table) */}
      {activeTab === 'Оплаты' && (
        <div className="space-y-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 text-slate-900 dark:text-white">
          {/* Top 3 Metric Cards matching Screenshot */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{tk('total_income')}</p>
                <h3 className="text-xl font-black text-slate-800 dark:text-white mt-1">{payKpi.income.toLocaleString()} {tk('currency_som')}</h3>
              </div>
              <DollarSign className="w-5 h-5 text-slate-300" />
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{tk('treatment_cost')}</p>
                <h3 className="text-xl font-black text-slate-800 dark:text-white mt-1">{payKpi.cost.toLocaleString()} {tk('currency_som')}</h3>
              </div>
              <DollarSign className="w-5 h-5 text-slate-300" />
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{tk('total_discounts')}</p>
                <h3 className="text-xl font-black text-slate-800 dark:text-white mt-1">{payKpi.discounts.toLocaleString()} {tk('currency_som')}</h3>
              </div>
              <DollarSign className="w-5 h-5 text-slate-300" />
            </div>
          </div>

          {/* Subheader: Tabs on left, Date dropdown and "Добавить оплату" on right */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
              {(['Все', 'Счета', 'Оплаты', 'Общий счет'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setPaymentSubTab(tab)}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    paymentSubTab === tab ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab === 'Все'
                    ? tk('all')
                    : tab === 'Счета'
                    ? tk('invoices')
                    : tab === 'Оплаты'
                    ? tk('payments')
                    : tk('total_account')}
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-2 relative">
              {/* Date Filter with Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowDateDropdown(!showDateDropdown)}
                  className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition"
                >
                  <span>{datePeriodLabel(selectedDatePeriod)}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {showDateDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-30 py-1 text-xs divide-y divide-slate-100 dark:divide-slate-700">
                    <div className="py-1">
                      {['Сегодня', 'Вчера', 'На этой неделе', 'Прошедшая неделя', 'В этом месяце', 'Прошлый месяц'].map(
                        (p) => (
                          <button
                            key={p}
                            onClick={() => {
                              setSelectedDatePeriod(p);
                              setShowDateDropdown(false);
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                          >
                            {datePeriodLabel(p)}
                          </button>
                        )
                      )}
                    </div>
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setSelectedDatePeriod('Указать период');
                          setShowDateDropdown(false);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 text-blue-600 dark:text-sky-400 font-bold"
                      >
                        {tk('custom_period')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Custom period (davrni tanlash): dan — gacha kun inputlari */}
              {selectedDatePeriod === 'Указать период' && (
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1">
                  <input
                    type="date"
                    value={customFrom}
                    max={customTo || undefined}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
                    title={tr('patientd.k97')}
                  />
                  <span className="text-slate-400 text-xs">—</span>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom || undefined}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none"
                    title={tr('patientd.k98')}
                  />
                  {(customFrom || customTo) && (
                    <button
                      onClick={() => { setCustomFrom(''); setCustomTo(''); }}
                      className="ml-0.5 p-0.5 text-slate-400 hover:text-rose-500 rounded"
                      title={tr('patientd.k99')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {/* Blue Button: Добавить оплату */}
              {!isAdmin && (
                <button
                  onClick={() => setIsAddPaymentModalOpen(true)}
                  className="px-4 py-1.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-bold shadow-xs transition"
                >
                  {tk('add_payment')}
                </button>
              )}
            </div>
          </div>

          {/* Invoices Table matching Screenshot with full details */}
          <div className="overflow-x-auto pt-2">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                  <th className="py-2.5 px-3"></th>
                  <th className="py-2.5 px-3">{tk('date')}</th>
                  <th className="py-2.5 px-3">{tr('patientd.k100')}</th>
                  <th className="py-2.5 px-3">{tr('patientd.k101')}</th>
                  <th className="py-2.5 px-3">{tr('patientd.k102')}</th>
                  <th className="py-2.5 px-3">{tk('status')}</th>
                  <th className="py-2.5 px-3 text-right">{tr('patientd.paidTh')}</th>
                  <th className="py-2.5 px-3 text-right">{tr('patientd.totalSumTh')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredInvoices.length === 0 ? (
                  <tr><td colSpan={8} className="py-10 text-center text-slate-400">{tk('nothing_yet')}</td></tr>
                ) : (
                  filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-3">
                      {inv.kind === 'payment' ? (
                        <span title={inv.method} className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 font-bold shadow-2xs">
                          <Plus className="w-4 h-4" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 font-bold shadow-2xs">
                          <FileText className="w-4 h-4" />
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{inv.date}</td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-slate-900 dark:text-white block">{inv.description || (inv.kind === 'payment' ? (tr('patientd.k103')) : (tr('patientd.k104')))}</span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-slate-400">{inv.kind === 'payment' ? (inv.target === 'debt' ? (tr('patientd.k105')) : (tr('patientd.k106'))) : (tr('patientd.k107'))}</span>
                        {(inv.branch_name || (inv.branch_id && branches.find((b) => b.id === inv.branch_id)?.name)) && (
                          <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-sky-300 font-semibold">
                            <Building2 className="w-2.5 h-2.5" />
                            {inv.branch_name || branches.find((b) => b.id === inv.branch_id)?.name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-700 dark:text-slate-300">
                      <span className="block">{inv.operator || CURRENT_OPERATOR}</span>
                      {inv.operator_role && (inv.operator_role === 'director' || inv.operator_role === 'deputy_director' || inv.operator_role === 'kassa') && (
                        <span className="text-[9px] font-bold text-blue-600 dark:text-sky-400">
                          {inv.operator_role === 'kassa'
                            ? (tr('patientd.closedByCashier'))
                            : (tr('patientd.closedByDirector'))}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold">
                        {inv.method || (inv.kind === 'payment' ? 'Наличные' : '—')}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white ${
                          inv.st === 'paid' ? 'bg-emerald-500' : inv.st === 'cancelled' ? 'bg-slate-500' : inv.st === 'partial' ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                      >
                        {inv.st === 'paid' ? tk('paid_3') : inv.st === 'cancelled' ? tk('cancelled_2') : inv.st === 'partial' ? tk('partial_paid') : tk('unpaid')}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      +{inv.paid.toLocaleString()} {tk('currency_som')}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {inv.total.toLocaleString()} {tk('currency_som')}
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 8: СВЯЗЬ (Screenshot 2: Top Search & Filters, Left Submenu [Все, Запланированное, Недавние звонки, SMS, Telegram, WhatsApp] + Right Workspaces) */}
      {activeTab === 'Связь' && (
        <div className="space-y-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 text-slate-900 dark:text-white">
          {/* Top Filter Bar matching Screenshot 2 */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder={tk('ph_search')}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg outline-none">
                <option>{tk('status_2')}</option>
                <option>{tk('delivered')}</option>
                <option>{tk('read')}</option>
                <option>{tk('in_queue')}</option>
              </select>
              <button
                onClick={() => setCommsFilter('all')}
                className="p-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                title={tk('ttl_reset_filters')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <select className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg outline-none">
                <option>{tk('this_week')}</option>
                <option>{tk('txt_today')}</option>
                <option>{tk('yesterday')}</option>
                <option>{tk('this_month')}</option>
              </select>
              <select className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg outline-none">
                <option>{tk('scheduled_2')}</option>
                <option>{tk('next_24_hours')}</option>
                <option>{tk('this_week_2')}</option>
              </select>
              <select className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg outline-none">
                <option>{tk('staff_2')}</option>
                <option>{tk('all_staff')}</option>
                <option>Сардор Мирахмедов</option>
                <option>{tk('reception_32desk')}</option>
              </select>
              <select className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg outline-none">
                <option>{tk('per_page')}</option>
                <option>10</option>
                <option>25</option>
                <option>50</option>
              </select>
            </div>
          </div>

          {/* Main Layout: Left Channels Menu + Right Dedicated Tailored Workspace */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-2">
            {/* Left Vertical Submenu matching Screenshot 2 */}
            <div className="space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800 pr-4">
              <button
                onClick={() => setCommsFilter('all')}
                className={`w-full text-left px-3 py-2 rounded-xl flex items-center space-x-2.5 transition ${
                  commsFilter === 'all'
                    ? 'border-l-4 border-l-blue-600 bg-blue-50/60 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 font-bold'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <span className="text-base font-bold leading-none">≡</span>
                <span>{tk('all')}</span>
              </button>

              <button
                onClick={() => setCommsFilter('scheduled')}
                className={`w-full text-left px-3 py-2 rounded-xl flex items-center space-x-2.5 transition ${
                  commsFilter === 'scheduled'
                    ? 'border-l-4 border-l-blue-600 bg-blue-50/60 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 font-bold'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{tk('scheduled_3')}</span>
              </button>

              <button
                onClick={() => setCommsFilter('calls')}
                className={`w-full text-left px-3 py-2 rounded-xl flex items-center space-x-2.5 transition opacity-60 ${
                  commsFilter === 'calls'
                    ? 'border-l-4 border-l-slate-400 bg-slate-50 dark:bg-slate-800'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <PhoneCall className="w-3.5 h-3.5 text-slate-400" />
                <span>{tk('recent_calls')}</span>
                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">{tr('patientd.soon')}</span>
              </button>

              <button
                onClick={() => setCommsFilter('sms')}
                className={`w-full text-left px-3 py-2 rounded-xl flex items-center space-x-2.5 transition opacity-60 ${
                  commsFilter === 'sms'
                    ? 'border-l-4 border-l-slate-400 bg-slate-50 dark:bg-slate-800'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                <span>{tk('sms_messages')}</span>
                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">{tr('patientd.soon')}</span>
              </button>

              <button
                onClick={() => setCommsFilter('telegram')}
                className={`w-full text-left px-3 py-2 rounded-xl flex items-center space-x-2.5 transition ${
                  commsFilter === 'telegram'
                    ? 'border-l-4 border-l-blue-600 bg-blue-50/60 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 font-bold'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <Send className="w-3.5 h-3.5 text-sky-500" />
                <span>Telegram</span>
                {!socialTgConnected && <span className="ml-auto w-2 h-2 rounded-full bg-rose-500" title={tr('patientd.k108')} />}
              </button>

              <button
                onClick={() => setCommsFilter('whatsapp')}
                className={`w-full text-left px-3 py-2 rounded-xl flex items-center space-x-2.5 transition opacity-60 ${
                  commsFilter === 'whatsapp'
                    ? 'border-l-4 border-l-slate-400 bg-slate-50 dark:bg-slate-800'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <Phone className="w-3.5 h-3.5 text-emerald-500" />
                <span>Whatsapp</span>
                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">{tr('patientd.soon')}</span>
              </button>
            </div>

            {/* Right Workspace: Tailored by Selected Subtab */}
            <div className="md:col-span-3 space-y-4">
              {/* SUBVIEW 1: ВСЕ (Unified Feed) */}
              {commsFilter === 'all' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {tk('all_comms_with')} {patient.full_name} ({patient.phone})
                    </span>
                    <button
                      onClick={() => setIsSendMsgOpen(true)}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{tk('send_message')}</span>
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {commsMessages.length === 0 && (
                      <div className="p-10 text-center text-sm text-slate-400">{tk('nothing_yet')}</div>
                    )}
                    {commsMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 space-y-1.5 text-xs hover:border-blue-200 dark:hover:border-blue-700 transition"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                msg.type === 'telegram'
                                  ? 'bg-sky-100 text-sky-800'
                                  : msg.type === 'whatsapp'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : msg.type === 'call'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {msg.type.toUpperCase()}
                            </span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">{commTitleFor(msg.type)}</span>
                          </div>
                          <span className="text-[10px] text-slate-400">{commDateLabel(msg.date)}</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 font-medium pl-1">{msg.message}</p>
                        <div className="flex justify-end pt-1">
                          <span className="text-[10px] font-semibold text-emerald-600">
                            ✓ {commStatusLabel(msg.status)} {msg.duration ? `(${msg.duration})` : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SUBVIEW 2: ЗАПЛАНИРОВАННОЕ (Scheduled Automatic Dispatches) */}
              {commsFilter === 'scheduled' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 dark:text-white">{tk('scheduled_mailings_auto_reminders')}</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{tk('automatic_notifications_before_appointment_and_after_procedures')}</p>
                    </div>
                    <button
                      onClick={() => alert('Создано новое автоматическое расписание напоминания')}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center space-x-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{tk('schedule')}</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
                          SMS НАПОМИНАНИЕ (ЗА 24 ЧАСА)
                        </span>
                        <span className="text-amber-600 font-bold text-[10px]">{tk('queued_to_send')}</span>
                      </div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">
                        «Уважаемый пациент! Напоминаем о визите на процедуру ортопедии завтра в 15:34. Стоматология 32Desk.»
                      </p>
                      <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400 border-t border-slate-50 dark:border-slate-700">
                        <span>Запланировано на: 06.09.2026, 09:00</span>
                        <span>Канал: Eskiz SMS Gateway</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-bold text-[10px]">
                          TELEGRAM БОТ: ОПРОСНИК ПОСЛЕ ВИЗИТА
                        </span>
                        <span className="text-amber-600 font-bold text-[10px]">{tk('queued_to_send')}</span>
                      </div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">
                        «Здравствуйте! Сегодня вы прошли лечение у доктора Сардора Мирахмедова. Оцените качество обслуживания от 1 до 10.»
                      </p>
                      <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400 border-t border-slate-50 dark:border-slate-700">
                        <span>Запланировано на: 05.09.2026, 20:00</span>
                        <span>Канал: @Dent32DeskBot</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SUBVIEW 3: НЕДАВНИЕ ЗВОНКИ — hozircha ishlab chiqilmoqda */}
              {commsFilter === 'calls' && underDev(tk('recent_calls'))}

              {/* SUBVIEW 4: SMS — hozircha ishlab chiqilmoqda */}
              {commsFilter === 'sms' && underDev(tk('sms_messages'))}

              {/* SUBVIEW 5: TELEGRAM — Sozlamalarда ulanmagan bo'lsa "ulang" ko'rsatamiz */}
              {commsFilter === 'telegram' && !socialTgConnected && (
                <div className="py-16 text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-sky-100 dark:bg-sky-950/60 text-sky-500 flex items-center justify-center mx-auto">
                    <Send className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-700 dark:text-slate-200">{tr('patientd.telegramNotConnected')}</p>
                    <p className="text-xs text-slate-400 mt-1">{tr('patientd.connectATelegramAccountToOpen')}</p>
                  </div>
                  <Link href="/settings" className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-sm font-bold shadow-sm transition">
                    <Send className="w-4 h-4" /> {tr('patientd.connectTelegram')}
                  </Link>
                </div>
              )}
              {commsFilter === 'telegram' && socialTgConnected && (
                <div className="space-y-4">
                  {/* Header: bemor + Telegram akkaunt holati */}
                  <div className="p-4 bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900 rounded-2xl flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold">
                        <Send className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <span className="font-bold text-sky-950 dark:text-sky-200 block">
                          {tgChatUser
                            ? `${tgChatUser.first_name || ''} ${tgChatUser.last_name || ''}`.trim() || (tr('patientd.telegram'))
                            : (tr('patientd.telegram2'))}
                        </span>
                        <span className="text-[11px] text-sky-700 dark:text-sky-400">
                          {patient.full_name} • {patient.phone}{tgChatUser?.username ? ` • @${tgChatUser.username}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => loadTgChat()}
                        className="p-1.5 bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-400 hover:bg-sky-100 rounded-lg border border-sky-200 dark:border-sky-700 transition"
                        title={tr('patientd.k109')}
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                      {tgChatUser?.username && (
                        <a href={`https://t.me/${tgChatUser.username}`} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-400 hover:bg-sky-100 rounded-xl text-xs font-bold border border-sky-200 dark:border-sky-700 transition flex items-center space-x-1.5">
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>{tk('open_in_telegram')}</span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Holatga qarab: yuklanmoqda / ulanmagan / topilmadi / hali gaplashilmagan / chat */}
                  {tgChatState === 'loading' && (
                    <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                      <RotateCw className="w-6 h-6 animate-spin" />
                      {tr('patientd.telegram3')}
                    </div>
                  )}

                  {tgChatState === 'not_connected' && (
                    <div className="py-12 text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto"><Radio className="w-6 h-6" /></div>
                      <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{tr('patientd.telegram4')}</p>
                      <p className="text-xs text-slate-400">{tr('patientd.k110')}</p>
                      <Link href="/settings" className="inline-block px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">{tr('patientd.k111')}</Link>
                    </div>
                  )}

                  {tgChatState === 'error' && (
                    <div className="py-12 text-center space-y-2">
                      <p className="text-sm font-bold text-rose-500">{tr('patientd.k112')}</p>
                      <p className="text-xs text-slate-400">{tgChatError}</p>
                      <button onClick={() => loadTgChat()} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold">{tr('patientd.k113')}</button>
                    </div>
                  )}

                  {tgChatState === 'not_found' && (
                    <div className="py-12 text-center space-y-2">
                      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto"><User className="w-6 h-6" /></div>
                      <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{tr('patientd.telegram5')}</p>
                      <p className="text-xs text-slate-400">{patient.phone} — {tr('patientd.telegram6')}</p>
                    </div>
                  )}

                  {(tgChatState === 'ready' || tgChatState === 'no_history') && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50/50 dark:bg-slate-900/40 p-4 space-y-3">
                      <div ref={tgScrollRef} onScroll={handleTgScroll} className="h-72 overflow-y-auto space-y-2 p-2 flex flex-col">
                        {/* Tepada: eski xabarlarni yuklash holati */}
                        {tgChatState === 'ready' && (
                          tgLoadingOlder ? (
                            <div className="text-center py-1.5 text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
                              <RotateCw className="w-3 h-3 animate-spin" /> {tr('patientd.k114')}
                            </div>
                          ) : tgHasMoreOlder ? (
                            <button onClick={loadOlderTgChat} className="mx-auto mb-1 px-3 py-1 text-[11px] font-bold text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-lg">
                              {tr('patientd.k115')}
                            </button>
                          ) : (
                            <div className="text-center py-1 text-[10px] text-slate-300 dark:text-slate-600">{tr('patientd.k116')}</div>
                          )
                        )}
                        {tgChatState === 'no_history' ? (
                          <div className="m-auto text-center text-slate-400 text-sm">
                            <div className="w-12 h-12 rounded-full bg-sky-50 dark:bg-sky-950 text-sky-400 flex items-center justify-center mx-auto mb-2"><Send className="w-6 h-6" /></div>
                            <p className="font-bold">{tr('patientd.k117')}</p>
                            <p className="text-xs mt-1">{tr('patientd.telegram7')}</p>
                          </div>
                        ) : (
                          tgRealMessages.map((m) => (
                            <div key={m.id} className={`flex ${m.out ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-xs p-2 rounded-2xl text-xs space-y-1 ${m.out ? 'bg-sky-500 text-white rounded-br-none shadow-xs' : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-bl-none border border-slate-200 dark:border-slate-600'}`}>
                                {/* Media: rasm / video / dumaloq video / ovoz */}
                                {m.media_url ? (
                                  (m.media_type === 'sticker' && /\.(tgs|webm)$/i.test(m.media_url)) ? (
                                    // animatsion stiker (.tgs) — brauzerda ochilmaydi, belgi ko'rsatamiz
                                    <span className="text-2xl">🎯 <span className="text-[10px] italic opacity-70">{tr('patientd.k118')}</span></span>
                                  ) : m.media_type === 'photo' || m.media_type === 'sticker' || m.media_type === 'gif' ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={m.media_url} alt="media" className="rounded-xl max-w-full max-h-64 object-contain cursor-pointer" onClick={() => window.open(m.media_url as string, '_blank')} />
                                  ) : m.media_type === 'video_note' ? (
                                    <video src={m.media_url} controls className="rounded-full w-44 h-44 object-cover bg-black" />
                                  ) : m.media_type === 'video' ? (
                                    <video src={m.media_url} controls className="rounded-xl max-w-full max-h-64" />
                                  ) : m.media_type === 'voice' || m.media_type === 'audio' ? (
                                    <audio src={m.media_url} controls className="max-w-full" />
                                  ) : (
                                    <a href={m.media_url} target="_blank" rel="noreferrer" className={`flex items-center gap-1.5 underline ${m.out ? 'text-sky-100' : 'text-blue-600'}`}>
                                      <Paperclip className="w-3.5 h-3.5" /> {tr('patientd.k119')}
                                    </a>
                                  )
                                ) : m.media_type ? (
                                  // media bor lekin yuklanmadi (katta hajm)
                                  <div className={`flex items-center gap-1.5 italic ${m.out ? 'text-sky-100' : 'text-slate-400'}`}>
                                    <Paperclip className="w-3.5 h-3.5" />
                                    {m.media_type === 'video' ? (tr('patientd.k120'))
                                      : m.media_type === 'video_note' ? (tr('patientd.k121'))
                                      : m.media_type === 'document' ? (tr('patientd.k122'))
                                      : '[media]'}
                                  </div>
                                ) : null}
                                {/* Matn / izoh */}
                                {m.text && <p className="whitespace-pre-wrap break-words px-0.5">{m.text}</p>}
                                <span className={`text-[9px] block text-right px-0.5 ${m.out ? 'text-sky-100' : 'text-slate-400'}`}>
                                  {m.date ? new Date(m.date).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="flex items-center space-x-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                        {/* Shablon tanlash */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowTplPicker((v) => !v)}
                            className="px-2.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 rounded-xl transition"
                            title={tr('patientd.k123')}
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          {showTplPicker && (
                            <div className="absolute bottom-full left-0 mb-2 w-72 max-h-64 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-30 p-1.5">
                              <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-center justify-between">
                                <span>{tr('patientd.k124')}</span>
                                <Link href="/settings" className="text-blue-500 hover:underline normal-case font-semibold">{tr('patientd.k125')}</Link>
                              </div>
                              {msgTemplates.length === 0 ? (
                                <div className="px-2 py-3 text-xs text-slate-400 text-center">{tr('patientd.k126')}</div>
                              ) : (
                                msgTemplates.map((t) => (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => { setTgDraft(renderTemplate(t)); setShowTplPicker(false); }}
                                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                                  >
                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{t.title}</p>
                                    <p className="text-[10px] text-slate-400 line-clamp-1">{renderTemplate(t)}</p>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder={tr('patientd.k127')}
                          value={tgDraft}
                          onChange={(e) => setTgDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !tgSending) handleSendTgReal(); }}
                          className="flex-1 p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-sky-500 text-slate-900 dark:text-white"
                        />
                        <button
                          onClick={handleSendTgReal}
                          disabled={!tgDraft.trim() || tgSending}
                          className="px-4 py-2.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5"
                        >
                          {tgSending ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SUBVIEW 6: WHATSAPP — hozircha ishlab chiqilmoqda */}
              {commsFilter === 'whatsapp' && underDev('WhatsApp')}
            </div>
          </div>
        </div>
      )}

      {/* TAB 9: ЛАБОРАТОРИЯ (Dental Technician Lab Orders) */}
      {activeTab === 'Лаборатория' && (
        <div className="space-y-4">
          {/* Header Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{tk('dental_lab_orders')}</h3>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-sky-300 text-xs font-bold font-mono">
                  {labOrders.length}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{tk('txt_lab_desc')}</p>
            </div>

            <button
              onClick={() => {
                setSelectedPatientLabOrder(null);
                setIsPatientLabFullModalOpen(true);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{tk('new_lab_order')}</span>
            </button>
          </div>

          {/* Orders List / Cards */}
          {labOrders.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-sm text-slate-400 shadow-2xs">
              <ToothIcon className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p>{tk('nothing_yet')}</p>
              <button
                onClick={() => {
                  setSelectedPatientLabOrder(null);
                  setIsPatientLabFullModalOpen(true);
                }}
                className="mt-3 text-xs font-bold text-blue-600 hover:underline"
              >
                + {tk('new_lab_order')}
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {labOrders.map((ord) => (
                <div
                  key={ord.id}
                  className={`rounded-2xl border shadow-2xs transition ${
                    ord.deleted
                      ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60 opacity-80'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800'
                  }`}
                >
                  {/* ── Bitta qator: ikonka · nom · texnik/muddat · holat · narx · o'chirish ── */}
                  <div className="flex items-center gap-3 p-3 pr-4 flex-wrap sm:flex-nowrap">
                    {/* Tish ikonkasi */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 rounded-xl shrink-0 text-blue-700 dark:text-sky-300">
                      <ToothIcon className="w-4 h-4" />
                      <span className="text-xs font-mono font-black">#{ord.tooth}</span>
                    </div>

                    {/* Nom + Vita + texnik + muddat (bir qatorda) */}
                    <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold leading-tight ${ord.deleted ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>{labWorkLabel(ord.type)}</span>
                      <span className="px-2 py-0.5 rounded-md font-mono font-bold text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        Vita {ord.colorShade}
                      </span>
                      <span className="text-slate-300 dark:text-slate-600">•</span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{ord.technician}</span>
                      {ord.labName && ord.labName !== ord.technician && <span className="text-xs text-slate-400">({ord.labName})</span>}
                      <span className="text-slate-300 dark:text-slate-600">•</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{tr('patientd.k128')} {ord.dueDate || '—'}</span>
                    </div>

                    {/* O'ng: holat · narx · o'chirish */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      {ord.deleted ? (
                        <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                          {tr('patientd.k129')}
                        </span>
                      ) : (
                        <select
                          value={ord.status}
                          onChange={async (e) => {
                            const nextStatus = e.target.value;
                            const numericId = Number(ord.id.replace(/\D/g, '')) || 1;
                            await clinicApi.updateLabOrderStatus(numericId, nextStatus);
                            setLabOrders(prev => prev.map(o => o.id === ord.id ? { ...o, status: nextStatus as any } : o));
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold outline-none cursor-pointer border transition shadow-2xs ${
                            ord.status === 'Готово в клинике'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                              : ord.status === 'В работе'
                              ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
                              : 'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800'
                          }`}
                        >
                          <option value="В работе" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">⏳ {tk('lab_in_work')}</option>
                          <option value="Готово в клинике" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">✅ {tk('lab_ready')}</option>
                          <option value="На примерке" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">🦷 {tk('lab_fitting')}</option>
                          <option value="Завершено" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">🏁 {tr('patientd.k130')}</option>
                        </select>
                      )}

                      {!isAdmin && (
                        <span className={`text-sm font-mono font-bold whitespace-nowrap ${ord.deleted ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>
                          {ord.price.toLocaleString()} {tk('currency_som')}
                        </span>
                      )}

                      {!ord.deleted && (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              const numericId = Number(String(ord.id).replace(/\D/g, '')) || 1;
                              const allLabs = await clinicApi.getLabOrders();
                              const found = allLabs.find(l => l.id === numericId || l.order_number === String(ord.id));
                              setSelectedPatientLabOrder(found || ({
                                id: numericId,
                                order_number: String(ord.id),
                                patient: patient?.id,
                                patient_name: patient?.full_name,
                                patient_phone: patient?.phone,
                                doctor: 1,
                                doctor_name: participants[0]?.full_name || 'Сардор Алимов',
                                technician_name: ord.technician || 'Apex Dental Lab',
                                work_type: ord.type,
                                tooth_numbers: ord.tooth,
                                color_shade: ord.colorShade,
                                due_date: ord.dueDate,
                                status: ord.status,
                                cost: ord.price || 850000
                              } as any));
                              setIsPatientLabFullModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition"
                            title="Naryadni ko‘rish / tahrirlash"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (confirm(tr('patientd.k131'))) {
                                const delAt = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                                clinicApi.markLabDeleted(ord.id, CURRENT_OPERATOR, delAt);
                                setLabOrders(prev => prev.map(o => o.id === ord.id ? {
                                  ...o,
                                  deleted: true,
                                  deletedBy: CURRENT_OPERATOR,
                                  deletedAt: delAt
                                } : o));
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition"
                            title={tk('delete_word')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* ── Footer: kim yaratdi / kim o'chirdi ── */}
                  <div className="flex items-center gap-4 flex-wrap px-3.5 pb-2 -mt-1 text-[11px]">
                    <span className="flex items-center gap-1 text-slate-400">
                      <UserPlus className="w-3 h-3 text-emerald-500" />
                      {tr('patientd.k132')}
                      <span className="font-semibold text-slate-600 dark:text-slate-300">{ord.createdBy || CURRENT_OPERATOR}</span>
                      {ord.createdAt && <span className="text-slate-400">· {ord.createdAt}</span>}
                    </span>
                    {ord.deleted && (
                      <span className="flex items-center gap-1 text-rose-400">
                        <Trash2 className="w-3 h-3 text-rose-500" />
                        {tr('patientd.k133')}
                        <span className="font-semibold text-rose-600 dark:text-rose-300">{ord.deletedBy}</span>
                        {ord.deletedAt && <span className="text-rose-400">· {ord.deletedAt}</span>}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 10: ЗАДАЧИ (Screenshot 3: Task card with 04.03.2027, services, signature) */}
      {activeTab === 'Задачи' && (
        <div className="space-y-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 text-slate-900 dark:text-white">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 dark:text-white">{tk('tasks')}</h2>
            <button
              onClick={() => {
                const myEmp = allEmployees.find(
                  (e) => (user?.name && e.full_name.toLowerCase().includes(user.name.toLowerCase()))
                );
                setTaskMember(myEmp ? myEmp.full_name : (user?.name || ''));
                setTaskStart(new Date().toISOString().split('T')[0]);
                setTaskDue(new Date(Date.now() + 86400000).toISOString().split('T')[0]);
                setIsAddTaskModalOpen(true);
              }}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{tr('patientd.addTask')}</span>
            </button>
          </div>

          {patientTasks.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              {tk('nothing_yet')}
            </div>
          ) : (
            patientTasks.map((task) => {
              const isExp = expandedTaskIds[task.id] ?? true;
              const isOwner = isPatientTaskOwner(task);
              const canModify = canModifyPatientTask(task);
              const taskMemberInitials = task.member
                ? task.member.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
                : 'ФШ';

              const stageBadge = () => {
                const st = task.stage || (task.done ? 'completed' : 'in_progress');
                switch (st) {
                  case 'new':
                    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">🆕 Yangi</span>;
                  case 'in_progress':
                    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">🔄 Jarayonda</span>;
                  case 'review':
                    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">🧐 Tekshiruvda</span>;
                  case 'completed':
                    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">✅ Bajarildi</span>;
                  default:
                    return null;
                }
              };

              return (
                <div key={task.id} className="border border-slate-200 dark:border-slate-700 rounded-2xl p-5 bg-white dark:bg-slate-800 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-6 h-6 rounded-md text-white flex items-center justify-center font-bold text-xs ${
                          task.type === 'treatment' ? 'bg-blue-600' : 'bg-purple-600'
                        }`}
                      >
                        {task.type === 'treatment' ? 'O' : 'H'}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white">{task.start || '04.03.2027'}</h4>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              task.type === 'treatment'
                                ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-sky-300'
                                : 'bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300'
                            }`}
                          >
                            {task.type === 'treatment' ? tk('reminder_treatment') : tk('reminder')}
                          </span>

                          {/* Director / Owner / Lock badge */}
                          {isDirector ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              Direktor nazorati
                            </span>
                          ) : isOwner ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              Sizning vazifangiz
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center space-x-1">
                              <Lock className="w-2.5 h-2.5 inline mr-1" />
                              <span>Faqat mas'ul o'zgartira oladi</span>
                            </span>
                          )}

                          {/* Stage (Interactive for Director, Badge for Doctor) */}
                          {isDirector ? (
                            <div className="flex items-center space-x-1">
                              <span className="text-[10px] text-slate-400 font-semibold">Etap:</span>
                              <select
                                value={task.stage || (task.done ? 'completed' : 'in_progress')}
                                onChange={(e) => handleUpdatePatientTaskStage(task.id, e.target.value as any, task)}
                                className="text-[10px] font-bold px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 outline-none cursor-pointer"
                              >
                                <option value="new">🆕 Yangi</option>
                                <option value="in_progress">🔄 Jarayonda</option>
                                <option value="review">🧐 Tekshiruvda</option>
                                <option value="completed">✅ Bajarildi</option>
                              </select>
                            </div>
                          ) : (
                            stageBadge()
                          )}
                        </div>

                        {/* Topshirdi / Ijrochi / Deadline meta */}
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          <span>{tk('deadline_label')}: <strong className="text-slate-700 dark:text-slate-200">{task.due || '05.03.2027'}</strong></span>
                          <span>•</span>
                          <span>👤 <strong>Topshirdi:</strong> {task.creator_name || 'Direktorat'}</span>
                          <span>•</span>
                          <span>🎯 <strong>Ijrochi:</strong> {task.member}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {canModify ? (
                        <>
                          <button
                            onClick={() => handleTogglePatientTask(task.id, task.done, task)}
                            className={`p-1.5 border rounded-lg transition ${
                              task.done
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                            }`}
                            title={task.done ? "Qayta faollashtirish" : "Bajarildi deb belgilash"}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditingPatientTask(task)}
                            className="p-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition"
                            title="Vazifani tahrirlash"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeletePatientTask(task.id, task)}
                            className="p-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition"
                            title="Vazifani o'chirish"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <div className="relative group">
                          <button
                            type="button"
                            disabled
                            className="p-1.5 border border-slate-200 dark:border-slate-700 rounded-lg opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400"
                            title={`Faqat biriktirilgan xodim (${task.member}) o'zgartira oladi`}
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </button>
                          <div className="pointer-events-none absolute -bottom-8 right-0 opacity-0 group-hover:opacity-100 transition-all z-30 px-2 py-1 bg-slate-900 text-white text-[10px] rounded shadow-md whitespace-nowrap">
                            Faqat {task.member} yoki Direktor o'zgartira oladi
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => toggleTaskExpanded(task.id)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {isExp && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-3 text-xs">
                      {task.service && (
                        <div>
                          <p className="text-[11px] font-bold text-slate-400 mb-1">{tk('upcoming_service')}</p>
                          <p className="text-slate-800 dark:text-slate-200 font-semibold leading-relaxed">{task.service}</p>
                        </div>
                      )}

                      {task.note && (
                        <div>
                          <p className="text-[11px] font-bold text-slate-400 mb-1">{tk('notes_word')}</p>
                          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{task.note}</p>
                        </div>
                      )}

                      {/* Audit: kim yakunlagan */}
                      {task.done && (
                        <div className="flex items-center space-x-1.5 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 font-medium">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <span>
                            Yakunladi: <strong>{task.completed_by_name || task.member || 'Shifokor'}</strong>
                            {task.completed_at ? ` (${task.completed_at})` : ''}
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-700/60">
                        <div className="text-[11px] text-slate-400">
                          {task.creator_name && (
                            <span>Topshiriq beruvchi: <strong className="text-slate-600 dark:text-slate-300">{task.creator_name}</strong></span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 text-right">
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-200">
                            {taskMemberInitials}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{task.member || 'Феруза Шоанварова'}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">Ijrochi shifokor</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 11: ОПРОСЫ (Screenshot 4: Filters + Surveys List) */}
      {activeTab === 'Опросы' && (
        <div className="space-y-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 text-slate-900 dark:text-white">
          <div className="flex items-center justify-end space-x-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <select className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 outline-none">
              <option>{tk('type')}</option>
              <option>{tk('all_types')}</option>
              <option>{tk('life_history')}</option>
              <option>{tk('consents')}</option>
              <option>{tk('quality_control')}</option>
            </select>
            <select className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 outline-none">
              <option>{tk('by_date')}</option>
              <option>{tk('newest_first')}</option>
              <option>{tk('oldest_first')}</option>
            </select>
          </div>

          <div className="space-y-3">
            {surveys.length === 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-10 text-center text-sm text-slate-400">{tk('nothing_yet')}</div>
            )}
            {surveys.map((surv) => (
              <div
                key={surv.id}
                onClick={() => setSelectedSurveyView(surv)}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-200 dark:hover:border-blue-700 cursor-pointer transition space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ClipboardList className="w-4 h-4 text-blue-600 dark:text-sky-400" />
                    <span className="font-bold text-slate-900 dark:text-white">{surv.title}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-semibold">
                      {surv.category}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-slate-400">{surv.date}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                      {surv.score}
                    </span>
                  </div>
                </div>
                <p className="text-slate-600 dark:text-slate-300 pl-6">{surv.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: НАРЯДЫ — journal of struck & cancelled naryads (who + when) */}
      {/* TAB: НАРЯДЫ — journal of struck & cancelled naryads (who + when) */}
      {activeTab === 'Наряды' && (() => {
        const activeNaryadCount = naryadLog.filter(l => l.status !== 'cancelled' && l.action !== 'removed').length;
        const cancelledNaryadCount = naryadLog.filter(l => l.status === 'cancelled' || l.action === 'removed').length;
        const filteredNaryadLog = naryadLog.filter(l => {
          const isCancelled = l.status === 'cancelled' || l.action === 'removed';
          if (naryadLogFilter === 'added' && isCancelled) return false;
          if (naryadLogFilter === 'removed' && !isCancelled) return false;
          if (naryadLogSearch.trim()) {
            const q = naryadLogSearch.toLowerCase();
            return (
              (l.title && l.title.toLowerCase().includes(q)) ||
              (l.author && l.author.toLowerCase().includes(q)) ||
              (l.cancelled_by && l.cancelled_by.toLowerCase().includes(q)) ||
              (l.doctor && l.doctor.toLowerCase().includes(q)) ||
              (l.reason && l.reason.toLowerCase().includes(q))
            );
          }
          return true;
        });

        return (
          <div className="space-y-4">
            {/* Top KPI Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{tr('patientd.k134')}</p>
                <p className="text-2xl font-mono font-bold text-slate-900 dark:text-white mt-1">{naryadLog.length}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{tr('patientd.k135')}</p>
                <p className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1">{activeNaryadCount}</p>
              </div>
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{tr('patientd.k136')}</p>
                <p className="text-2xl font-mono font-bold text-rose-600 dark:text-rose-400 mt-1">{cancelledNaryadCount}</p>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setNaryadLogFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    naryadLogFilter === 'all'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:text-white'
                  }`}
                >
                  {tr('patientd.k137')} ({naryadLog.length})
                </button>
                <button
                  type="button"
                  onClick={() => setNaryadLogFilter('added')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    naryadLogFilter === 'added'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:text-white'
                  }`}
                >
                  {tr('patientd.k138')} ({activeNaryadCount})
                </button>
                <button
                  type="button"
                  onClick={() => setNaryadLogFilter('removed')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    naryadLogFilter === 'removed'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 dark:hover:text-white'
                  }`}
                >
                  {tr('patientd.k139')} ({cancelledNaryadCount})
                </button>
              </div>

              <div className="relative min-w-[240px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={naryadLogSearch}
                  onChange={(e) => setNaryadLogSearch(e.target.value)}
                  placeholder={tr('patientd.k140')}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-blue-500 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>
            </div>

            {/* List of Consolidated Cards */}
            <div className="space-y-3">
              {filteredNaryadLog.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-12 text-center text-sm text-slate-400">
                  {tk('no_naryads_yet')}
                </div>
              ) : (
                filteredNaryadLog.map((log) => {
                  const isCancelled = log.status === 'cancelled' || log.action === 'removed';
                  return (
                    <div
                      key={log.id}
                      className={`p-4.5 rounded-2xl border transition ${
                        isCancelled
                          ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-900/40'
                          : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3.5 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isCancelled
                                ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400'
                                : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {isCancelled ? <XCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{log.title}</h4>
                              {isCancelled ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                  🔴 {tr('patientd.k141')}
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                  🟢 {tr('patientd.k142')}
                                </span>
                              )}
                            </div>

                            {/* Consolidated timeline in one card */}
                            <div className="mt-2 space-y-1 text-xs">
                              <p className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 flex-wrap">
                                <span className="font-semibold text-emerald-700 dark:text-emerald-400">🟢 {tr('patientd.k143')}</span>
                                <span>{log.date}</span>
                                <span className="text-slate-400">•</span>
                                <span className="font-medium text-slate-700 dark:text-slate-200">{log.author}</span>
                                {log.doctor && (
                                  <>
                                    <span className="text-slate-400">•</span>
                                    <span className="text-slate-500 dark:text-slate-400">{tr('patientd.k144')} {log.doctor}</span>
                                  </>
                                )}
                              </p>

                              {isCancelled && (
                                <p className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400 font-medium flex-wrap">
                                  <span className="font-bold">🔴 {tr('patientd.k145')}</span>
                                  <span>{log.cancelled_date || log.date}</span>
                                  <span className="text-rose-400">•</span>
                                  <span>{log.cancelled_by || log.author}</span>
                                  {log.reason && (
                                    <>
                                      <span className="text-rose-400">|</span>
                                      <span className="italic">{tr('patientd.k146')} &quot;{log.reason}&quot;</span>
                                    </>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`text-base font-mono font-bold block ${isCancelled ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                            {log.price.toLocaleString()} {tk('currency_som')}
                          </span>
                          {isCancelled && (
                            <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">
                              {tr('patientd.k147')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })()}

      {/* MODAL 1: Отправить сообщение в Связь (SMS, Telegram, WhatsApp) */}
      {isSendMsgOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{tk('send_message_to_patient')}</h3>
              <button onClick={() => setIsSendMsgOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendMessage} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('channel')}</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSendChannel('telegram')}
                    className={`py-2 rounded-xl font-bold border transition ${
                      sendChannel === 'telegram'
                        ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-400 dark:border-sky-700 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    Telegram
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendChannel('whatsapp')}
                    className={`py-2 rounded-xl font-bold border transition ${
                      sendChannel === 'whatsapp'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-400 dark:border-emerald-700 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendChannel('sms')}
                    className={`py-2 rounded-xl font-bold border transition ${
                      sendChannel === 'sms'
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-400 dark:border-blue-700 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    SMS
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block">{tk('message_text')}</label>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                    <span>🌐</span>
                    <span>
                      {tr('patientd.k148')}{' '}
                      {patient.service_lang === 'uz' ? "O'zbek" : patient.service_lang === 'en' ? 'English' : 'Русский'}
                    </span>
                  </span>
                </div>
                {msgTemplates.length > 0 && (
                  <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase shrink-0">{tr('patientd.k149')}</span>
                    {msgTemplates.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setMsgBody(renderTemplate(tpl))}
                        className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-slate-700 dark:text-slate-200 text-[11px] font-medium shrink-0 border border-slate-200 dark:border-slate-700 transition"
                      >
                        {tpl.title}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  rows={4}
                  required
                  placeholder={tk('ph_msg_text')}
                  value={msgBody}
                  onChange={(e) => setMsgBody(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 resize-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsSendMsgOpen(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
                >
                  Отправить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Лечение detail — what was done on the clicked treatment record (mirrors 32desk "Зуб # / Пациент") */}
      {treatmentModalApt && (() => {
        const a = treatmentModalApt;
        const dur = Math.max(0, Math.round((new Date(a.end_time).getTime() - new Date(a.start_time).getTime()) / 60000)) || 0;
        const _d = new Date(a.start_time);
        const doneDate = `${String(_d.getDate()).padStart(2, '0')}.${String(_d.getMonth() + 1).padStart(2, '0')}.${_d.getFullYear()}`;
        const price = Number(a.price) || 0;
        const docInitials = (a.doctor_name || '').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
        return (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-xs flex items-start justify-center p-4 overflow-y-auto" onClick={() => setTreatmentModalApt(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-slate-900 rounded-2xl max-w-5xl w-full my-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h4 className="text-base font-bold">{tk('tooth_word')} / {patient.full_name}</h4>
              <button onClick={() => setTreatmentModalApt(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl leading-none">×</button>
            </div>

            {/* Body: left treatment column + right xray/photo column */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 p-6 overflow-y-auto">
              {/* LEFT (2/3) */}
              <div className="md:col-span-2 space-y-4">
                <button className="px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-sky-400 text-xs font-bold hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> {tk('new_exam')}
                </button>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  {/* Doctor + date + actions */}
                  <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">{docInitials}</div>
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{a.doctor_name || '—'}</p>
                        <p className="text-[11px] text-slate-400">{tk('therapist_role')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{doneDate}</span>
                      <div className="flex items-center gap-1">
                        <button className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:text-rose-500 dark:hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                        <button className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:text-blue-500 dark:hover:text-sky-400"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:text-blue-500 dark:hover:text-sky-400"><Copy className="w-3.5 h-3.5" /></button>
                        <button className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-white"><Check className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>

                  {/* Service line-items */}
                  <div className="pt-3 space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                      <div className="pr-3">
                        <p className="text-sm text-slate-700 dark:text-slate-200">{a.procedure || a.treatment_notes || tk('service')}</p>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                          <span>{dur} {tk('min_short')}</span>
                          <span className="font-mono font-semibold text-slate-500 dark:text-slate-300">{price.toLocaleString()} {tk('currency_som')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-slate-400">{tk('done_on')}: {doneDate}</span>
                        <span className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white"><Check className="w-3.5 h-3.5" /></span>
                      </div>
                    </div>
                  </div>

                  <button className="mt-3 px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-sky-400 text-xs font-bold hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center gap-1.5">
                    <Activity className="w-4 h-4" /> {tk('add_treatment')}
                  </button>
                </div>
              </div>

              {/* RIGHT (1/3) */}
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span className="font-bold text-slate-700 dark:text-slate-200">{tk('basic_tab')}</span>
                  <span className="text-slate-400">{tk('other_tab')}</span>
                </div>

                {/* Рентген */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">{tk('x_ray')}</h4>
                    <button className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center"><Plus className="w-4 h-4" /></button>
                  </div>
                  <p className="text-center text-xs text-slate-400 py-4">{tk('nothing_yet')}</p>
                </div>

                {/* Фото */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">{tk('photo_word')}</h4>
                  <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl py-10 px-4 text-center cursor-pointer hover:border-blue-300 transition">
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-300">{tk('drag_to_upload')}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{tk('or_click_find')}</p>
                    <p className="text-[11px] text-slate-400">{tk('or_paste_clip')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button onClick={() => setTreatmentModalApt(null)} className="px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700">{tk('close')}</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* MODAL 2: Добавить оплату (Счета / Оплаты) */}
      {isAddPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold">{tk('accept_payment')}</h3>
              <button onClick={() => setIsAddPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current balance / debt banner */}
            <div className={`flex items-center justify-between p-3.5 rounded-2xl ${
              (Number(patient.balance) || 0) < 0
                ? 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60'
                : 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60'
            }`}>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {(Number(patient.balance) || 0) < 0 ? tk('current_debt') : tk('balance_prepay')}
              </span>
              <span className={`text-sm font-black ${
                (Number(patient.balance) || 0) < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
              }`}>
                {Math.abs(Math.round(Number(patient.balance) || 0)).toLocaleString('ru-RU')} {tk('uzs')}
              </span>
            </div>

            <form onSubmit={handleAddPayment} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  {tk('amount_uzs')}
                </label>
                <input
                  type="number"
                  step="1000"
                  required
                  value={newPaymentAmount}
                  onChange={(e) => setNewPaymentAmount(e.target.value)}
                  className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-sky-500 font-bold text-slate-900 dark:text-white"
                />

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {[100000, 200000, 500000, 1000000, 2000000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setNewPaymentAmount(String(val))}
                      className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-sky-950 hover:text-sky-600 rounded-lg text-[11px] font-bold transition border border-slate-200 dark:border-slate-700"
                    >
                      +{val.toLocaleString('ru-RU')}
                    </button>
                  ))}
                  {(Number(patient.balance) || 0) < 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewPaymentAmount(String(Math.abs(Math.round(Number(patient.balance) || 0))));
                        setNewPaymentTarget('debt');
                      }}
                      className="px-2.5 py-1 bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 rounded-lg text-[11px] font-bold transition border border-rose-200 dark:border-rose-800"
                    >
                      {tr('patientd.k150')}: {Math.abs(Math.round(Number(patient.balance) || 0)).toLocaleString('ru-RU')} {tk('uzs')}
                    </button>
                  )}
                </div>
              </div>

              {/* Payment method — "in what form the money is accepted" */}
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('payment_method')}</label>
                <select
                  value={newPaymentMethod}
                  onChange={(e) => setNewPaymentMethod(e.target.value)}
                  className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-500 text-slate-900 dark:text-white"
                >
                  <option value="Наличные">{tk('cash')}</option>
                  <option value="Карта">{tk('card')}</option>
                  <option value="Перевод">{tk('bank_transfer')}</option>
                  <option value="Payme / Click">Payme / Click</option>
                </select>
              </div>

              {/* Branch / Filial */}
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  {tr('patientd.k151')}
                </label>
                <select
                  value={newPaymentBranchId ?? currentBranchId ?? ''}
                  onChange={(e) => setNewPaymentBranchId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-sky-500 text-slate-900 dark:text-white"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.address})
                    </option>
                  ))}
                </select>
              </div>

              {/* Chegirma (skidka) — qarzni kamaytiradi, direktor/kassa ko'radi */}
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  {tr('patientd.discountUzs')}
                </label>
                <input
                  type="number"
                  step="1000"
                  min="0"
                  value={newPaymentDiscount}
                  onChange={(e) => setNewPaymentDiscount(e.target.value)}
                  className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-emerald-500 font-bold text-slate-900 dark:text-white"
                />
                {/* Foizli tez tugmalar (to'lov summasidan hisoblanadi) */}
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {[5, 10, 15, 20].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setNewPaymentDiscount(String(Math.round((Number(newPaymentAmount) || 0) * pct / 100)))}
                      className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 rounded-lg text-[11px] font-bold transition border border-emerald-200 dark:border-emerald-800"
                    >
                      {pct}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setNewPaymentDiscount('0')}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg text-[11px] font-bold transition border border-slate-200 dark:border-slate-700"
                  >
                    {tr('patientd.none')}
                  </button>
                </div>
              </div>

              {/* Where the money goes: pay off debt OR add to balance (prepay) */}
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('apply_to')}</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNewPaymentTarget('debt')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition ${newPaymentTarget === 'debt' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                  >
                    {tk('pay_debt')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPaymentTarget('balance')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition ${newPaymentTarget === 'balance' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                  >
                    {tk('to_balance')}
                  </button>
                </div>
              </div>

              {/* Summary: who accepts, how much, new balance */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 space-y-1">
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">{tk('accepted_by')}</span><span className="font-bold">{CURRENT_OPERATOR}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">{tk('payment')}</span><span className="font-bold">{(Math.max(0, Math.round(Number(newPaymentAmount) || 0))).toLocaleString('ru-RU')} · {newPaymentMethod}</span></div>
                {Math.round(Number(newPaymentDiscount) || 0) > 0 && (
                  <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">{tr('patientd.discount')}</span><span className="font-bold text-emerald-600">−{Math.max(0, Math.round(Number(newPaymentDiscount) || 0)).toLocaleString('ru-RU')} {tk('uzs')}</span></div>
                )}
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">{tk('new_balance')}</span><span className="font-bold">{Math.round((Number(patient.balance) || 0) + Math.max(0, Math.round(Number(newPaymentAmount) || 0)) + Math.max(0, Math.round(Number(newPaymentDiscount) || 0))).toLocaleString('ru-RU')} {tk('uzs')}</span></div>
              </div>

              <div className="pt-1 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddPaymentModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
                >
                  {tk('cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-sky-500 hover:bg-sky-600 rounded-lg shadow-sm"
                >
                  {tk('process_receipt')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Новый рентген (Upload & Add Xray) */}
      {isNewXrayOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5"><Radio className="w-4 h-4 text-sky-500" />{tr('patientd.k152')}</h3>
              <button onClick={() => setIsNewXrayOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (newXrayFile && patient?.id) {
                  await dentalMediaStore.saveRentgen(patient.id, newXrayFile, newXrayFile.name);
                }
                const isZip = Boolean(newXrayFile?.name?.toLowerCase().endsWith('.zip'));
                const now = new Date();
                const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
                setXrays([
                  {
                    id: Date.now(),
                    toothNumber: newXrayTooth || (isZip ? '3D KT' : '11'),
                    date: dateStr,
                    type: newXrayType,
                    quantity: 1,
                    dose: newXrayDose || (isZip ? '0.02 mSv' : '0.01 mSv'),
                    imageUrl: newXrayCustomUrl || '',
                    fileName: newXrayFile?.name,
                    fileSize: newXrayFile?.size,
                    isZipPackage: isZip,
                    doctor: (patient as any)?.doctor || (patient as any)?.doctor_name || 'Сардор Мирахмедов'
                  },
                  ...xrays
                ]);
                setIsNewXrayOpen(false);
                setNewXrayFile(null);
                setNewXrayCustomUrl('');
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('tooth_area')}</label>
                <input
                  type="text"
                  required
                  placeholder={tk('ph_tooth_eg')}
                  value={newXrayTooth}
                  onChange={(e) => setNewXrayTooth(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('x_ray_type')}</label>
                <select
                  value={newXrayType}
                  onChange={(e) => setNewXrayType(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none text-slate-900 dark:text-white"
                >
                  <option value="Planmeca Romexis 3D KT paketi (ZIP)">Planmeca Romexis 3D KT paketi (ZIP)</option>
                  <option value="Прицельный радиовизиографический снимок">{tk('opt_rvg')}</option>
                  <option value="ОПТГ (Панорамный снимок обеих челюстей)">{tk('opt_opg')}</option>
                  <option value="КЛКТ 3D Томография сегмента">{tk('opt_cbct')}</option>
                  <option value="ТРГ боковая проекция">{tk('opt_trg')}</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('radiation_dose')}</label>
                <input
                  type="text"
                  value={newXrayDose}
                  onChange={(e) => setNewXrayDose(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  {tr('patientd.selectXrayFile')}
                </label>
                <label className="p-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl text-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 block">
                  {newXrayFile ? (
                    <div className="space-y-1">
                      <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-500 mb-1" />
                      <p className="text-slate-800 dark:text-slate-200 font-bold font-mono text-xs truncate">{newXrayFile.name}</p>
                      <span className="text-[10px] text-slate-400">({(newXrayFile.size / (1024 * 1024)).toFixed(1)} MB)</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 mx-auto text-slate-400 mb-1" />
                      <p className="text-slate-600 dark:text-slate-300 font-semibold">{tk('select_a_file_or_drag_it_here')}</p>
                      <span className="text-[10px] text-slate-400">
                        {tr('patientd.zipRomexisDicom')}
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    accept=".zip,.dcm,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setNewXrayFile(file);
                        if (file.name.toLowerCase().endsWith('.zip')) {
                          setNewXrayType('Planmeca Romexis 3D KT paketi (ZIP)');
                          if (!newXrayTooth) setNewXrayTooth('3D KT');
                        } else if (file.type.startsWith('image/')) {
                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            if (evt.target?.result) setNewXrayCustomUrl(evt.target.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }
                    }}
                  />
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewXrayOpen(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-sky-500 hover:bg-sky-600 rounded-lg shadow-sm"
                >
                  Загрузить в карту
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* MODAL 4: Просмотр рентгена (DICOM / High Contrast PACS Viewer) */}
      {selectedXrayView && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 text-white rounded-2xl max-w-3xl w-full p-5 space-y-4 shadow-2xl border border-slate-800">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold">
                  Рентген {selectedXrayView.toothNumber.startsWith('П') ? '' : 'зуба #'}
                  {selectedXrayView.toothNumber}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {selectedXrayView.type} • {selectedXrayView.date} • Врач: {selectedXrayView.doctor}
                </p>
              </div>
              <button onClick={() => setSelectedXrayView(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Diagnostic Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-800/80 rounded-xl text-xs">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setXrayInverted(!xrayInverted)}
                  className={`px-3 py-1 rounded-lg font-bold transition flex items-center space-x-1 ${
                    xrayInverted ? 'bg-amber-400 text-slate-900' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                  }`}
                >
                  <Contrast className="w-3.5 h-3.5" />
                  <span>Инверсия (Негатив)</span>
                </button>

                <button
                  onClick={() => setXrayZoom(Math.min(xrayZoom + 25, 250))}
                  className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200"
                  title={tk('ttl_zoom_in')}
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setXrayZoom(Math.max(xrayZoom - 25, 50))}
                  className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200"
                  title={tk('ttl_zoom_out')}
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setXrayZoom(100);
                    setXrayBrightness(100);
                    setXrayContrast(100);
                    setXrayInverted(false);
                  }}
                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 text-[10px]"
                >
                  Сброс ({xrayZoom}%)
                </button>
              </div>

              <div className="flex items-center space-x-3 text-[11px] text-slate-300">
                <div className="flex items-center space-x-1">
                  <Sun className="w-3 h-3 text-slate-400" />
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={xrayBrightness}
                    onChange={(e) => setXrayBrightness(Number(e.target.value))}
                    className="w-16 accent-sky-400"
                  />
                </div>
                <div className="flex items-center space-x-1">
                  <Sliders className="w-3 h-3 text-slate-400" />
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={xrayContrast}
                    onChange={(e) => setXrayContrast(Number(e.target.value))}
                    className="w-16 accent-sky-400"
                  />
                </div>
              </div>
            </div>

            {/* Diagnostic Image Canvas */}
            <div className="bg-black rounded-xl overflow-hidden flex items-center justify-center min-h-[360px] max-h-[480px]">
              <img
                src={selectedXrayView.imageUrl}
                alt={tk('ttl_xray')}
                style={{
                  transform: `scale(${xrayZoom / 100})`,
                  filter: `${xrayInverted ? 'invert(1)' : 'none'} brightness(${xrayBrightness}%) contrast(${xrayContrast}%)`,
                  transition: 'transform 0.15s ease-out'
                }}
                className="max-h-[460px] object-contain select-none"
              />
            </div>

            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>Доза облучения: {selectedXrayView.dose}</span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold flex items-center space-x-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{tk('print_image')}</span>
                </button>
                <button
                  onClick={() => setSelectedXrayView(null)}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: SIP Телефонный звонок (Calling Modal) */}
      {isCallingModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 text-white rounded-3xl max-w-xs w-full p-6 text-center space-y-4 shadow-2xl border border-slate-800">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto animate-pulse">
              <PhoneCall className="w-8 h-8" />
            </div>

            <div>
              <h4 className="font-bold text-sm text-white">{patient.full_name}</h4>
              <p className="font-mono text-xs text-slate-400 mt-1">{patient.phone}</p>
              <p className="text-[11px] text-emerald-400 mt-2">Идет соединение через IP-телефонию...</p>
            </div>

            <div className="pt-4">
              <button
                onClick={() => setIsCallingModalOpen(false)}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-lg transition"
              >
                Завершить вызов
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Новый заказ в лабораторию */}
      {isNewLabOrderOpen && (() => {
        const closeLab = () => {
          setIsNewLabOrderOpen(false); setLabStep(1); setLabTab('main');
          setLabTech(''); setLabTeeth([]); setLabWork(''); setLabDueDate('');
          setLabFittings([]); setLabWishes(''); setLabLines([]);
        };
        const toggleTooth = (t: string) => setLabTeeth((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
        const upperTeeth = ['18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28'];
        const lowerTeeth = ['48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38'];
        const canNext = !!labTech && labTeeth.length > 0;
        const saveLab = async () => {
          if (!patient) return;
          const total = labLines.reduce((s, l) => s + (l.price * l.qty), 0) || 850000;
          await clinicApi.createLabOrder({
            patient: patient.id,
            patient_name: patient.full_name,
            patient_phone: patient.phone,
            doctor: participants[0]?.id || 1,
            doctor_name: participants[0]?.full_name || 'Сардор Алимов',
            technician_name: labTech || 'Smiledent',
            tooth_numbers: labTeeth.length ? labTeeth.join(', ') : newLabTooth,
            work_type: labWork || newLabType,
            color_shade: newLabShade,
            due_date: labDueDate || new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
            sent_date: new Date().toISOString().split('T')[0],
            status: 'В работе',
            cost: total,
            notes: [
              labWishes,
              labFittings.length ? `Примерки: ${labFittings.join(', ')}` : ''
            ].filter(Boolean).join(' | ')
          });

          // Reload lab orders for this patient — o'chirish overlay'ini SAQLAB qoladi (o'chirilganlar qaytib yoqilmaydi)
          const allLabs = await clinicApi.getLabOrders();
          const labDeletions = clinicApi.getLabDeletions();
          setLabOrders(
            allLabs
              .filter((l) => l.patient === patient.id)
              .map((l) => {
                const oid = l.order_number || `L-${l.id}`;
                const del = labDeletions[oid];
                return {
                  id: oid,
                  tooth: l.tooth_numbers,
                  type: l.work_type,
                  material: l.notes || '',
                  colorShade: l.color_shade,
                  technician: l.technician_name,
                  labName: (l as any).lab_name || l.technician_name,
                  sentDate: l.sent_date || '',
                  dueDate: l.due_date,
                  status: (l.status || 'В работе') as LabOrder['status'],
                  price: Number(l.clinic_price ?? l.cost) || 0,
                  createdBy: (l as { created_by?: string }).created_by || l.doctor_name || CURRENT_OPERATOR,
                  createdAt: l.sent_date || (l as { created_at?: string }).created_at || '',
                  deleted: !!del,
                  deletedBy: del?.deletedBy,
                  deletedAt: del?.deletedAt
                };
              })
          );
          closeLab();
        };
        return (
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 overflow-hidden" onClick={closeLab}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-slate-900 w-full h-full shadow-2xl text-slate-900 dark:text-white flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-sky-400 flex items-center justify-center font-bold">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">{labStep === 1 ? tk('lab_new_work') : patient.full_name}</h3>
                  <p className="text-xs text-slate-400">{tk('lab_technician')}: {labTech || 'Smiledent'} • {tk('due_date_lab')}: {labDueDate || tk('txt_today')}</p>
                </div>
              </div>
              <button onClick={closeLab} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl leading-none px-2 py-1">×</button>
            </div>

            {/* ==================== STEP 1: patient + technician + teeth ==================== */}
            {labStep === 1 && (
              <div className="p-6 space-y-5 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Patient (preset to current patient) */}
                  <div>
                    <p className="text-xs font-bold text-slate-500 mb-2">{tk('lab_patient')}</p>
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-600 text-white">
                      <div className="w-8 h-8 rounded-full bg-white/25 flex items-center justify-center text-xs font-bold">{initials}</div>
                      <div className="flex-1">
                        <p className="text-sm font-bold">{patient.full_name}</p>
                        <p className="text-[11px] opacity-80">{patient.phone}</p>
                      </div>
                    </div>
                  </div>
                  {/* Technician / laboratory */}
                  <div>
                    <p className="text-xs font-bold text-slate-500 mb-2">{tk('lab_technician')}</p>
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-44 overflow-y-auto">
                      {LAB_TECHNICIANS.map((tech) => (
                        <button
                          key={tech.name}
                          onClick={() => setLabTech(tech.name)}
                          className={`w-full flex items-center gap-2 p-2.5 text-left transition ${labTech === tech.name ? 'bg-blue-600 text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${labTech === tech.name ? 'bg-white/25' : 'bg-slate-100 dark:bg-slate-700'}`}><ImageIcon className="w-4 h-4" /></div>
                          <div>
                            <p className="text-sm font-semibold">{tech.name}</p>
                            <p className={`text-[11px] ${labTech === tech.name ? 'opacity-80' : 'text-slate-400'}`}>{tech.phone}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Tooth chart */}
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                  <div className="grid grid-cols-8 gap-1.5 max-w-xl mx-auto">
                    {upperTeeth.map((t) => (
                      <button key={t} onClick={() => toggleTooth(t)} className={`py-1.5 rounded-lg text-xs font-bold border transition ${labTeeth.includes(t) ? 'bg-amber-400 border-amber-400 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-blue-300'}`}>{t}</button>
                    ))}
                    {lowerTeeth.map((t) => (
                      <button key={t} onClick={() => toggleTooth(t)} className={`py-1.5 rounded-lg text-xs font-bold border transition ${labTeeth.includes(t) ? 'bg-amber-400 border-amber-400 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-blue-300'}`}>{t}</button>
                    ))}
                  </div>
                  <div className="flex justify-end mt-3">
                    {labTeeth.length > 0 && (
                      <button onClick={() => setLabTeeth([])} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 flex items-center gap-1"><X className="w-3.5 h-3.5" /> {tk('clear_selection')}</button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ==================== STEP 2: work details ==================== */}
            {labStep === 2 && (
              <div className="overflow-y-auto">
                {/* Tabs */}
                <div className="flex items-center gap-5 px-6 pt-4 border-b border-slate-100 dark:border-slate-800">
                  <button onClick={() => setLabTab('main')} className={`pb-2 text-sm font-bold border-b-2 transition ${labTab === 'main' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}>{tk('basic_tab')}</button>
                  <button onClick={() => setLabTab('extra')} className={`pb-2 text-sm font-bold border-b-2 transition ${labTab === 'extra' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}>{tk('other_tab')}</button>
                </div>

                {labTab === 'main' && (
                  <div className="p-6 space-y-5">
                    {/* Выберите работу */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col items-center gap-3">
                      <select value={labWork} onChange={(e) => { setLabWork(e.target.value); if (e.target.value) setLabLines([{ name: e.target.value, qty: 1, price: 950000 }]); }} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold outline-none">
                        <option value="">{tk('select_work')}</option>
                        {LAB_WORK_TYPES.map((w) => <option key={w} value={w} className="bg-white text-slate-900">{labWorkLabel(w)}</option>)}
                      </select>
                    </div>

                    {/* Цвет коронки + teeth diagrams */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">{tk('crown_color')}</h4>
                      <div className="flex flex-wrap gap-3 items-end">
                        {(labTeeth.length ? labTeeth : [newLabTooth]).map((t) => (
                          <div key={t} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-center w-24">
                            <div className="text-2xl">🦷</div>
                            <p className="text-[11px] text-slate-400 mb-1">{tk('tooth_word')} #{t}</p>
                            <select value={newLabShade} onChange={(e) => setNewLabShade(e.target.value)} className="w-full text-xs p-1 border border-slate-200 dark:border-slate-700 rounded-lg outline-none bg-transparent">
                              {VITA_SHADES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Дата сдачи */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">{tk('due_date_lab')}</h4>
                      <input type="date" value={labDueDate} onChange={(e) => setLabDueDate(e.target.value)} className="w-full md:w-64 p-2 border border-slate-200 dark:border-slate-700 rounded-lg outline-none bg-transparent text-sm" />
                    </div>

                    {/* Примерки */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">{tk('fittings_word')}</h4>
                        <button onClick={() => setLabFittings([...labFittings, ''])} className="px-3 py-1 rounded-lg border border-blue-200 text-blue-600 text-xs font-bold flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> {tk('add_word')}</button>
                      </div>
                      {labFittings.length === 0 ? (
                        <p className="text-xs text-slate-400">{tk('nothing_yet')}</p>
                      ) : (
                        <div className="space-y-2">
                          {labFittings.map((f, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input type="date" value={f} onChange={(e) => setLabFittings(labFittings.map((x, j) => j === i ? e.target.value : x))} className="flex-1 p-2 border border-slate-200 dark:border-slate-700 rounded-lg outline-none bg-transparent text-sm" />
                              <button onClick={() => setLabFittings(labFittings.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Фото */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">{tk('photo_word')}</h4>
                      <button className="px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 text-xs font-bold flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" /> {tk('add_image')}</button>
                    </div>

                    {/* К отправке — order lines */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">{tk('to_send_word')}</h4>
                        <button onClick={() => setLabLines([...labLines, { name: '', qty: 1, price: 0 }])} className="px-3 py-1 rounded-lg border border-blue-200 text-blue-600 text-xs font-bold flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> {tk('add_word')}</button>
                      </div>
                      {labLines.length === 0 ? (
                        <p className="text-xs text-slate-400">{tk('nothing_yet')}</p>
                      ) : (
                        <div className="space-y-2">
                          {labLines.map((l, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input value={l.name} placeholder={tk('select_work')} onChange={(e) => setLabLines(labLines.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="flex-1 p-2 border border-slate-200 dark:border-slate-700 rounded-lg outline-none bg-transparent text-sm" />
                              <input type="number" value={l.qty} placeholder={tk('pcs_short')} onChange={(e) => setLabLines(labLines.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} className="w-16 p-2 border border-slate-200 dark:border-slate-700 rounded-lg outline-none bg-transparent text-sm" />
                              <input type="number" value={l.price} placeholder={tk('price_word')} onChange={(e) => setLabLines(labLines.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))} className="w-28 p-2 border border-slate-200 dark:border-slate-700 rounded-lg outline-none bg-transparent text-sm" />
                              <button onClick={() => setLabLines(labLines.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Пожелания */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">{tk('wishes_word')}</h4>
                      <textarea value={labWishes} onChange={(e) => setLabWishes(e.target.value)} rows={3} className="w-full p-2 border border-slate-200 dark:border-slate-700 rounded-lg outline-none bg-transparent text-sm resize-none" />
                    </div>
                  </div>
                )}

                {labTab === 'extra' && (
                  <div className="p-6 space-y-4 text-sm">
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
                      <h4 className="font-bold text-slate-700 dark:text-slate-200">{tr('patientd.crownsOnImplants')}</h4>
                      <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><input type="radio" name="fix" /> {tr('patientd.cemented')}</label>
                      <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><input type="radio" name="fix" /> {tr('patientd.screwRetention')}</label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
                        <input placeholder={tr('patientd.systemName')} className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg outline-none bg-transparent" />
                        <input placeholder={tr('patientd.diameter')} className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg outline-none bg-transparent" />
                        <input placeholder={tr('patientd.abutmentType')} className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg outline-none bg-transparent" />
                      </div>
                    </div>
                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
                      <h4 className="font-bold text-slate-700 dark:text-slate-200">{tr('patientd.shapeAndColor')}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input placeholder={tr('patientd.stumpColor')} className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg outline-none bg-transparent" />
                        <input placeholder={tr('patientd.mainToothColor')} className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg outline-none bg-transparent" />
                        <input placeholder={tr('patientd.gumColor')} className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg outline-none bg-transparent" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-between">
              {labStep === 1 ? (
                <>
                  <button onClick={closeLab} className="px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold">{tk('cancel_word')}</button>
                  <button disabled={!canNext} onClick={() => setLabStep(2)} className={`px-5 py-1.5 rounded-xl text-xs font-bold ${canNext ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>{tk('next_word')}</button>
                </>
              ) : (
                <>
                  <button onClick={() => setLabStep(1)} className="px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold">{tk('back_word')}</button>
                  <button onClick={saveLab} className="px-5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">{tk('save_lab')}</button>
                </>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* MODAL 7: Добавить задачу */}
      {isAddTaskModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-5 space-y-3.5 shadow-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold">{tk('tasks')}</h3>
              <button onClick={() => setIsAddTaskModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Тип задачи */}
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">{tk('task_type')}</label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={taskType === 'treatment'} onChange={() => setTaskType('treatment')} className="text-blue-600" />
                  <span>{tk('reminder_treatment')}</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={taskType === 'reminder'} onChange={() => setTaskType('reminder')} className="text-blue-600" />
                  <span>{tk('reminder')}</span>
                </label>
              </div>
            </div>

            {/* Даты */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('start_execution')}</label>
                <input type="date" value={taskStart} onChange={(e) => setTaskStart(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none text-slate-900 dark:text-white" />
              </div>
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('deadline_label')}</label>
                <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none text-slate-900 dark:text-white" />
              </div>
            </div>

            {/* Член команды + Услуга */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('choose_member')}</label>
                <select value={taskMember} onChange={(e) => setTaskMember(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none text-slate-900 dark:text-white">
                  <option value="">—</option>
                  {allEmployees.map((emp) => (
                    <option key={emp.id} value={emp.full_name}>{emp.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('choose_service')}</label>
                <input type="text" value={taskServiceName} onChange={(e) => setTaskServiceName(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none text-slate-900 dark:text-white" />
              </div>
            </div>

            {/* Заметки */}
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">{tk('notes_word')}</label>
              <textarea rows={2} value={taskNote} onChange={(e) => setTaskNote(e.target.value)}
                placeholder={tk('ph_note_full')}
                className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none resize-none text-slate-900 dark:text-white" />
            </div>

            {/* Etap (Holati) */}
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Etap (Holati)</label>
              <select
                value={taskStage}
                onChange={(e) => setTaskStage(e.target.value as any)}
                className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none text-slate-900 dark:text-white font-medium"
              >
                <option value="new">🆕 Yangi (Boshlanmadi)</option>
                <option value="in_progress">🔄 Jarayonda</option>
                <option value="review">🧐 Tekshiruvda (Nazorat)</option>
                <option value="completed">✅ Bajarildi</option>
              </select>
            </div>

            {/* Attached patient */}
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <div style={{ backgroundColor: patient.avatar_color || '#132338' }} className="w-8 h-8 rounded-full text-white font-bold flex items-center justify-center text-[11px]">{initials}</div>
              <div className="min-w-0">
                <p className="font-bold text-slate-800 dark:text-slate-200 truncate">{patient.full_name}</p>
                <p className="text-[10px] text-slate-400">{patient.phone}</p>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddTaskModalOpen(false)}
                className="px-3 py-1.5 rounded-lg font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800"
              >
                {tk('cancel_word')}
              </button>
              <button
                type="button"
                onClick={handleCreatePatientTask}
                className="px-4 py-1.5 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700"
              >
                {tk('save_word')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Tahrirlash vazifasi (Edit Task for Director/Doctor) */}
      {editingPatientTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold">Vazifani tahrirlash</h3>
                <p className="text-[10px] text-slate-400">
                  {isDirector ? "Direktor tomonidan tahrirlash va qayta biriktirish" : "Vazifa ma'lumotlarini o'zgartirish"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPatientTask(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditPatientTask} className="space-y-3">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Vazifa / Xizmat nomi</label>
                <input
                  type="text"
                  required
                  value={editingPatientTask.service || ''}
                  onChange={(e) => setEditingPatientTask({ ...editingPatientTask, service: e.target.value, title: e.target.value })}
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Mas'ul shifokor (Ijrochi)</label>
                  <select
                    value={editingPatientTask.member}
                    onChange={(e) => {
                      const emp = allEmployees.find(x => x.full_name === e.target.value);
                      setEditingPatientTask({
                        ...editingPatientTask,
                        member: e.target.value,
                        assignee: emp ? emp.id : editingPatientTask.assignee
                      });
                    }}
                    className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none text-slate-900 dark:text-white"
                  >
                    {allEmployees.map((emp) => (
                      <option key={emp.id} value={emp.full_name}>{emp.full_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Etap (Holati)</label>
                  <select
                    value={editingPatientTask.stage || (editingPatientTask.done ? 'completed' : 'in_progress')}
                    onChange={(e) => {
                      const st = e.target.value as any;
                      setEditingPatientTask({
                        ...editingPatientTask,
                        stage: st,
                        done: st === 'completed'
                      });
                    }}
                    className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none text-slate-900 dark:text-white font-semibold"
                  >
                    <option value="new">🆕 Yangi</option>
                    <option value="in_progress">🔄 Jarayonda</option>
                    <option value="review">🧐 Tekshiruvda</option>
                    <option value="completed">✅ Bajarildi</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Boshlanish sanasi</label>
                  <input
                    type="date"
                    value={editingPatientTask.start || ''}
                    onChange={(e) => setEditingPatientTask({ ...editingPatientTask, start: e.target.value })}
                    className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Muddat (Deadline)</label>
                  <input
                    type="date"
                    value={editingPatientTask.due || ''}
                    onChange={(e) => setEditingPatientTask({ ...editingPatientTask, due: e.target.value })}
                    className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Izoh / Ko'rsatma</label>
                <textarea
                  rows={2}
                  value={editingPatientTask.note || ''}
                  onChange={(e) => setEditingPatientTask({ ...editingPatientTask, note: e.target.value })}
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none resize-none text-slate-900 dark:text-white"
                />
              </div>

              {editingPatientTask.creator_name && (
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 text-[11px] text-slate-500 flex items-center justify-between">
                  <span>👤 <strong>Topshirdi:</strong> {editingPatientTask.creator_name}</span>
                  {editingPatientTask.completed_by_name && (
                    <span>✅ <strong>Yakunladi:</strong> {editingPatientTask.completed_by_name}</span>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingPatientTask(null)}
                  className="px-3 py-1.5 rounded-lg font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs"
                >
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 8: Просмотр опроса */}
      {selectedSurveyView && (
        <div className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-xs border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{selectedSurveyView.title}</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {selectedSurveyView.category} • Дата: {selectedSurveyView.date}
                </p>
              </div>
              <button onClick={() => setSelectedSurveyView(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-2 border border-slate-100 dark:border-slate-700">
              <p className="font-bold text-slate-800 dark:text-white">{tk('results_answers')}</p>
              <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{selectedSurveyView.summary}</p>
              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
                <span>Вопросов в анкете: {selectedSurveyView.questionsCount}</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">Статус: {selectedSurveyView.score}</span>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedSurveyView(null)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 9: Comprehensive 4-Tab Patient Edit Modal (matching screenshots) */}
      <PatientEditModal
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        patient={patient}
        onSave={(updated) => {
          setPatient(updated);
          setEditName(updated.full_name);
          setEditPhone(updated.phone);
          // Persist the edited patient (incl. avatar colour) to localStorage.
          if (typeof window !== 'undefined') {
            try {
              const stored = localStorage.getItem('32desk_custom_patients');
              const list: Patient[] = stored ? JSON.parse(stored) : [];
              const idx = list.findIndex((p) => p.id === updated.id);
              if (idx !== -1) list[idx] = updated;
              else list.push(updated);
              localStorage.setItem('32desk_custom_patients', JSON.stringify(list));
            } catch (e) {
              console.error(e);
            }
          }
        }}
        onDelete={() => {
          alert(tk('patient_deleted'));
          window.location.href = '/patients';
        }}
      />

      {/* MODAL 10: Karzinka (Urilgan naryadlar, qarz va to‘lovlar) */}
      {/* NARYAD / CART MODAL - full 32desk-style panel */}
      <NaryadModal
        isOpen={showNaryadModal}
        onClose={() => setShowNaryadModal(false)}
        patientName={patient.full_name}
        patientPhone={patient.phone}
        patientBalance={patient.balance}
        doctorId={participants[0]?.id}
        doctorName={participants[0]?.full_name || newNaryadDoctor}
        onSave={handleNaryadSave}
      />

      {/* NEW APPOINTMENT — opened from the "Новая запись" button, patient pre-filled */}
      <NewAppointmentModal
        isOpen={isNewAptOpen}
        onClose={() => setIsNewAptOpen(false)}
        branchId={currentBranchId ?? undefined}
        branchName={currentBranch?.name}
        onSave={async (aptData) => {
          const created = await clinicApi.createAppointment({
            ...aptData,
            branch: aptData.branch || currentBranchId,
            branch_name: aptData.branch_name || currentBranch?.name,
            patient: patient.id,
            patient_name: patient.full_name,
            patient_phone: patient.phone
          });
          // Show it immediately in the Записи tab
          setPatientAppointments((prev) => [created, ...prev]);
          setIsNewAptOpen(false);
        }}
        employees={allEmployees}
        patients={[patient]}
        presetPatient={patient}
        selectedDate={new Date().toISOString().split('T')[0]}
      />

      {/* SCHET / KARZINKA MODAL — 32desk invoice style (big, light backdrop) */}
      {showKarzinkaModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150" style={{marginTop:"0"}}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 my-auto text-slate-900 dark:text-white">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold">
                {tk('invoice')}
              </h3>
              <button
                onClick={() => setShowKarzinkaModal(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Items */}
            <div className="p-6 space-y-3 max-h-[52vh] overflow-y-auto">
              {patientNaryads.length === 0 ? (
                <div className="py-12 text-center">
                  <ShoppingCart className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {tk('nothing_yet')}
                  </p>
                  {!isAdmin && (
                    <button
                      onClick={() => {
                        setShowKarzinkaModal(false);
                        setShowNaryadModal(true);
                      }}
                      className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition"
                    >
                      {tk('k_5')}
                    </button>
                  )}
                </div>
              ) : (
                patientNaryads.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2 flex-wrap">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">
                          {item.name}
                        </p>
                        <span className="text-xs text-slate-400 whitespace-nowrap">
                          ({item.unitPrice.toLocaleString()} {tk('k_6')})
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">{item.doctor}</p>
                      {item.teeth.length > 0 && (
                        <p className="text-base font-bold text-slate-700 dark:text-slate-200 mt-0.5">
                          {item.teeth.join(', ')}
                        </p>
                      )}
                      {item.isDebt && (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-rose-500 text-white">
                          {tk('k_7')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-sm font-bold font-mono ${item.isDebt ? 'text-rose-600' : 'text-slate-800 dark:text-slate-100'}`}>
                        {item.price.toLocaleString()} {tk('k_8')}
                      </span>
                      {!isAdmin && (
                        <button
                          onClick={() => { setRemoveTarget(item.id); setRemoveReason('mistake'); setRemoveComment(''); }}
                          className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-500 hover:border-rose-300 flex items-center justify-center transition"
                          title={tk('k_9')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Total + payment method */}
            {patientNaryads.length > 0 && (
              <div className="px-6 pb-2 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {tk('k_10')}
                  </span>
                  <span className="text-lg font-black">
                    {patientNaryads.reduce((s, n) => s + n.price, 0).toLocaleString()} {tk('k_11')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {tk('k_12')}
                  </span>
                  <select
                    disabled={isAdmin}
                    value={karzinkaPayMethod}
                    onChange={(e) => setKarzinkaPayMethod(e.target.value)}
                    className="flex-1 text-sm p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:border-blue-500 disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    <option value="Наличные">{tk('k_13')}</option>
                    <option value="Карта">{tk('humo_uzcard')}</option>
                    <option value="Перевод">{tk('k_14')}</option>
                    <option value="Payme / Click">Payme / Click</option>
                  </select>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-100 dark:border-slate-800 mt-2">
              <button
                onClick={() => setShowKarzinkaModal(false)}
                className="px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 dark:hover:text-white rounded-xl text-sm font-semibold transition"
              >
                {tk('close')}
              </button>
              {isAdmin ? (
                <div className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5">
                  <span>🔒</span>
                  <span>{tr('patientd.k153')}</span>
                </div>
              ) : (
                <button
                  onClick={() => {
                    // Confirm the Счет -> open the checkout (yakunlash), not the receipt.
                    // The receipt appears in Оплаты only AFTER payment is completed.
                    setShowKarzinkaModal(false);
                    setShowCheckout(true);
                  }}
                  disabled={patientNaryads.length === 0}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/25 transition"
                >
                  {tk('checkout')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REASON PROMPT — why is this naryad being cancelled (mistake / other + comment) */}
      {removeTarget !== null && (
        <div className="fixed inset-0 z-[60] bg-slate-900/20 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-800 p-5 text-slate-900 dark:text-white">
            <h4 className="text-sm font-bold mb-1">
              {tk('k_15')}
            </h4>
            <p className="text-[11px] text-slate-400 mb-3">
              {tk('k_16')}
            </p>
            <div className="space-y-2">
              <label className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${removeReason === 'mistake' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40' : 'border-slate-200 dark:border-slate-700'}`}>
                <input type="radio" checked={removeReason === 'mistake'} onChange={() => setRemoveReason('mistake')} className="text-blue-600" />
                <span className="text-xs font-semibold">{tk('k_17')}</span>
              </label>
              <label className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${removeReason === 'other' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40' : 'border-slate-200 dark:border-slate-700'}`}>
                <input type="radio" checked={removeReason === 'other'} onChange={() => setRemoveReason('other')} className="text-blue-600" />
                <span className="text-xs font-semibold">{tk('k_18')}</span>
              </label>
              {removeReason === 'other' && (
                <textarea
                  rows={2}
                  value={removeComment}
                  onChange={(e) => setRemoveComment(e.target.value)}
                  placeholder={tk('k_19')}
                  className="w-full text-xs p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 resize-none mt-1"
                />
              )}
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setRemoveTarget(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 dark:hover:text-white rounded-xl text-xs font-bold transition"
              >
                {tk('k_20')}
              </button>
              <button
                onClick={() => {
                  const reasonText =
                    removeReason === 'mistake'
                      ? (tk('k_21'))
                      : (removeComment.trim() || (tk('k_22')));
                  if (removeTarget !== null) handleRemoveNaryad(removeTarget, reasonText);
                  setRemoveTarget(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition"
              >
                {tk('k_23')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHECKOUT (yakunlash) — opened from Счет "Подтвердить"; contains the naryads */}
      <ActiveCheckoutModal
        isOpen={showCheckout}
        onClose={() => setShowCheckout(false)}
        appointment={{
          id: patient.id,
          patient: patient.id,
          patient_name: patient.full_name,
          patient_phone: patient.phone,
          doctor: participants[0]?.id || 0,
          doctor_name: participants[0]?.full_name || 'Феруза Шоанварова',
          doctor_color: participants[0]?.color || '#3B82F6',
          start_time: new Date().toISOString(),
          end_time: new Date().toISOString(),
          treatment_notes: '',
          sms_sent: false,
          status: 'confirmed',
          color_code: '#10B981',
          price: patientNaryads.reduce((s, n) => s + n.price, 0),
          paid_amount: 0,
          chair_name: ''
        } as Appointment}
        patient={patient}
        initialItems={patientNaryads.map((n) => ({
          id: String(n.id),
          name: n.teeth.length ? `${n.name} (${n.teeth.join(', ')})` : n.name,
          price: n.unitPrice,
          quantity: n.quantity,
          doctor: n.doctor,
          duration: ''
        })) as CheckoutItem[]}
        onComplete={handleCheckoutComplete}
        onPreviewInvoice={() => {}}
      />

      {/* HISOB / CHEK — the printed receipt, shown AFTER payment (also listed in Оплаты) */}
      <PaidInvoiceModal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        appointment={{
          id: patient.id,
          patient: patient.id,
          patient_name: patient.full_name,
          patient_phone: patient.phone,
          doctor: participants[0]?.id || 0,
          doctor_name: participants[0]?.full_name || 'Феруза Шоанварова',
          doctor_color: participants[0]?.color || '#3B82F6',
          start_time: new Date().toISOString(),
          end_time: new Date().toISOString(),
          treatment_notes: '',
          sms_sent: false,
          status: 'completed',
          color_code: '#64748B',
          price: receiptTotal,
          paid_amount: receiptTotal,
          chair_name: ''
        } as Appointment}
        patient={patient}
        items={receiptItems}
        paymentMethod={receiptMethod}
        totalAmount={receiptTotal}
      />

      {/* APPOINTMENT MODAL — Opens when clicking any appointment */}
      <AppointmentModal
        appointment={selectedAptModal}
        onClose={() => setSelectedAptModal(null)}
        onStatusChange={async (id, status) => {
          await clinicApi.updateAppointmentStatus(id, status);
          setPatientAppointments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status } : a))
          );
          if (selectedAptModal && selectedAptModal.id === id) {
            setSelectedAptModal((prev) => (prev ? { ...prev, status } : null));
          }
        }}
        onRecordPayment={async (id, amount, method) => {
          const apt = patientAppointments.find((a) => a.id === id);
          if (!apt) return;
          const newPaid = (Number(apt.paid_amount) || 0) + amount;
          const now = new Date();
          const pId = patient.id;
          const newInv: PaymentInvoice = {
            id: now.getTime(),
            date: now.toLocaleDateString(language === 'uz' ? 'uz-UZ' : language === 'en' ? 'en-US' : 'ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }),
            status: 'Оплачен',
            paid: amount,
            total: amount,
            method,
            operator: CURRENT_OPERATOR,
            target: 'debt',
            description: tr('patientd.apptPayment').replace('{id}', String(id)).replace('{proc}', apt.procedure || 'Muolaja')
          };
          const nextInvoices = [newInv, ...invoices];
          setInvoices(nextInvoices);
          clinicApi.savePatientPayments(pId, nextInvoices);
          await clinicApi.updatePatientBalance(pId, amount);
          setPatient((prev) => (prev ? { ...prev, balance: prev.balance + amount } : null));
          setPatientAppointments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, paid_amount: newPaid } : a))
          );
          if (selectedAptModal && selectedAptModal.id === id) {
            setSelectedAptModal((prev) => (prev ? { ...prev, paid_amount: newPaid } : null));
          }
        }}
        onToggleSms={() => {}}
      />

      {/* FULL LAB ORDER MODAL (IMAGE 1) */}
      <LabOrderFullModal
        isOpen={isPatientLabFullModalOpen}
        onClose={() => setIsPatientLabFullModalOpen(false)}
        order={selectedPatientLabOrder}
        initialPatientId={patient?.id}
        onSaved={async () => {
          setIsPatientLabFullModalOpen(false);
          if (!patient) return;
          const allLabs = await clinicApi.getLabOrders();
          const labDeletions = clinicApi.getLabDeletions();
          setLabOrders(
            allLabs
              .filter((l) => l.patient === patient.id)
              .map((l) => {
                const oid = l.order_number || `L-${l.id}`;
                const del = labDeletions[oid];
                return {
                  id: oid,
                  tooth: l.tooth_numbers,
                  type: l.work_type,
                  material: l.notes || '',
                  colorShade: l.color_shade,
                  technician: l.technician_name,
                  labName: (l as { lab_name?: string }).lab_name || '',
                  sentDate: l.sent_date || '',
                  dueDate: l.due_date,
                  status: (l.status || 'В работе') as LabOrder['status'],
                  price: Number(l.clinic_price ?? l.cost) || 0,
                  createdBy: (l as { created_by?: string }).created_by || l.doctor_name || CURRENT_OPERATOR,
                  createdAt: l.sent_date || (l as { created_at?: string }).created_at || '',
                  deleted: !!del,
                  deletedBy: del?.deletedBy,
                  deletedAt: del?.deletedAt
                };
              })
          );
        }}
      />

      {/* FULLSCREEN IMAGE ZOOM PREVIEW MODAL */}
      {fullscreenImagePreview && (
        <div
          onClick={() => setFullscreenImagePreview(null)}
          className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in"
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700 p-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setFullscreenImagePreview(null)}
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center transition"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={fullscreenImagePreview} alt="Fullscreen preview" className="max-w-full max-h-[85vh] object-contain mx-auto rounded-xl" />
          </div>
        </div>
      )}

      {/* 3D SKAN MODAL */}
      {is3DScanModalOpen && (
        <div className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/70 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Boxes className="w-4 h-4" />
                </div>
                <h3 className="font-black text-sm text-slate-900 dark:text-white">
                  {tr('patientd.n3d3')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIs3DScanModalOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                {tr('patientd.n3d4')}
              </span>

              {/* Ha / Yo'q (Bor / Yo'q) Toggle */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleToggle3DScan(true)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 border ${
                    patient3DScan.hasScan
                      ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{tr('patientd.k154')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle3DScan(false)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 border ${
                    !patient3DScan.hasScan
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{tr('patientd.k155')}</span>
                </button>
              </div>

              {/* Upload 3D file */}
              <div className="p-3.5 rounded-2xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-purple-900 dark:text-purple-200">
                    {tr('patientd.n3dStlPlyObjZip')}
                  </span>
                </div>
                {patient3DScan.fileName ? (
                  <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-purple-200 dark:border-purple-800 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <Boxes className="w-4 h-4 text-purple-600 shrink-0" />
                      <span className="font-mono font-bold truncate text-slate-800 dark:text-slate-200">{patient3DScan.fileName}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-2">{patient3DScan.scanDate}</span>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {tr('patientd.k156')}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => scanFileInputRef.current?.click()}
                  className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{tr('patientd.n3dStlPlyZip')}</span>
                </button>

                {patient3DScan.hasScan && (
                  <button
                    type="button"
                    onClick={() => {
                      setIs3DScanModalOpen(false);
                      setIs3DScanViewerOpen(true);
                    }}
                    className="w-full py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Boxes className="w-3.5 h-3.5" />
                    <span>{tr('patientd.n3d5')}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIs3DScanModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black transition"
              >
                {tr('patientd.k157')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3D Scan Viewer Modal */}
      <Dental3DScanViewerModal
        isOpen={is3DScanViewerOpen}
        onClose={() => setIs3DScanViewerOpen(false)}
        patientId={patient?.id}
        patientName={patient?.full_name}
        initialFileName={patient3DScan.fileName}
        onSaveScan={(data) => {
          if (data.hasScan) {
            const updated = {
              hasScan: true,
              scanDate: new Date().toISOString().split('T')[0],
              fileName: data.fileName || patient3DScan.fileName || 'scan.zip',
              notes: `${data.fileName || 'scan.zip'} (${data.filesCount || 1} fayl)`
            };
            setPatient3DScan(updated);
            if (patient?.id) clinicApi.savePatient3DScan(patient.id, updated);
          }
        }}
      />

      {/* Rentgen (ZIP / CT / Image) Viewer Modal */}
      <DentalRentgenViewerModal
        isOpen={isRentgenViewerOpen}
        onClose={() => setIsRentgenViewerOpen(false)}
        patientId={patient?.id}
        patientName={patient?.full_name}
        initialFileName={selectedRentgenItem?.fileName}
        initialImageUrl={selectedRentgenItem?.imageUrl}
      />
    </div>
  );
}
