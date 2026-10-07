'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { clinicApi } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { useRouter } from 'next/navigation';
import {
  Settings as SettingsIcon,
  Share2,
  Send,
  Phone,
  Smartphone,
  Check,
  CheckCircle2,
  ShieldCheck,
  X,
  Trash2,
  Loader2,
  MessageSquareText,
  Plus,
  Edit2,
  Sparkles,
  ShieldAlert,
  Wrench,
  HardDrive,
  QrCode,
  RefreshCw,
  KeyRound,
  Bot,
  Armchair,
  Stethoscope,
  Building2,
  MapPin,
  Globe,
  ExternalLink,
  CheckSquare,
  Eye,
  EyeOff,
  User,
  UserCog,
  Save
} from 'lucide-react';
import { WorkplaceItem, SpecialtyItem, Branch } from '../../lib/types';

type MsgTemplate = { id: number; title: string; uz: string; ru: string; en: string };

type Platform = 'telegram' | 'whatsapp';
type SocialConn = ReturnType<typeof clinicApi.getSocialConnections>;

const WP_COLORS = [
  '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4', '#6366F1',
  '#F97316', '#14B8A6', '#84CC16', '#E11D48', '#0F172A', '#64748B', '#D946EF'
];

export default function SettingsPage() {
  const { language, tr } = useI18n();
  const { user, updateCurrentUser } = useAuth();
  const router = useRouter();

  // Faqat direktor uchun
  useEffect(() => {
    if (user && user.role !== 'director') router.replace('/');
  }, [user, router]);


  // Bo'limlar
  const [activeSection, setActiveSection] = useState<'profile' | 'social' | 'templates' | 'reminders' | 'chairs' | 'specialties' | 'branches'>('profile');

  // ── Profil ma'lumotlari (F.I.O, Telefon, Gmail) ──
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileEmail, setProfileEmail] = useState(user?.username || '');
  const [profilePhone, setProfilePhone] = useState('+998 90 000 00 00');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ── Xavfsizlik va Parol ──
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [securitySaving, setSecuritySaving] = useState(false);
  const [securityFeedback, setSecurityFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ── Sun'iy Intellekt (AI Agent) Test Simulyatori ──
  const [aiTestMessage, setAiTestMessage] = useState('Tish oqartirish narxi qancha turadi?');
  const [aiTestLoading, setAiTestLoading] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<any>(null);

  useEffect(() => {
    if (user) {
      if (user.name) setProfileName(user.name);
      if (user.username) setProfileEmail(user.username);
    }
  }, [user]);

  // 1. Direktor Shaxsiy Ma'lumotlarini Saqlash (Parolsiz)
  const handleSaveProfileDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileFeedback(null);

    if (!profileName.trim()) {
      setProfileFeedback({
        type: 'error',
        msg: tr('settings2.enterDirectorFullName')
      });
      return;
    }

    if (!profileEmail.trim()) {
      setProfileFeedback({
        type: 'error',
        msg: tr('settings2.enterGmailEmail')
      });
      return;
    }

    setProfileSaving(true);
    try {
      const res = await clinicApi.updateUserProfile({
        user_id: user?.id,
        current_username: user?.username,
        full_name: profileName.trim(),
        username: profileEmail.trim(),
        phone: profilePhone.trim(),
        clinic_id: user?.clinicId ? Number(user.clinicId) : 1,
        role: user?.role || 'director'
      });

      if (res.ok) {
        updateCurrentUser({
          name: res.user?.full_name || profileName.trim(),
          username: res.user?.username || profileEmail.trim()
        });
        setProfileFeedback({
          type: 'success',
          msg: tr('settings2.directorProfileDetailsSuccessfully')
        });
      } else {
        setProfileFeedback({
          type: 'error',
          msg: res.message || tr('settings2.anErrorOccurred')
        });
      }
    } catch (err: any) {
      setProfileFeedback({
        type: 'error',
        msg: err?.message || tr('settings2.networkError')
      });
    } finally {
      setProfileSaving(false);
    }
  };

  // 2. Parolni Mustaqil O'zgartirish
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityFeedback(null);

    if (!newPassword || newPassword.length < 4) {
      setSecurityFeedback({
        type: 'error',
        msg: tr('settings2.newPasswordMustBeAtLeast')
      });
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      setSecurityFeedback({
        type: 'error',
        msg: tr('settings2.newPasswordsDoNotMatch')
      });
      return;
    }

    setSecuritySaving(true);
    try {
      const res = await clinicApi.updateUserProfile({
        user_id: user?.id,
        current_username: user?.username,
        current_password: currentPassword.trim() || undefined,
        password: newPassword.trim(),
        clinic_id: user?.clinicId ? Number(user.clinicId) : 1,
        role: user?.role || 'director'
      });

      if (res.ok) {
        setCurrentPassword('');
        setNewPassword('');
        setNewPasswordConfirm('');
        setSecurityFeedback({
          type: 'success',
          msg: tr('settings2.passwordSuccessfullyUpdatedUseYour')
        });
      } else {
        setSecurityFeedback({
          type: 'error',
          msg: res.message || tr('settings2.anErrorOccurred')
        });
      }
    } catch (err: any) {
      setSecurityFeedback({
        type: 'error',
        msg: err?.message || tr('settings2.networkError')
      });
    } finally {
      setSecuritySaving(false);
    }
  };

  // 3. AI Agent Simulator test
  const handleTestAiAgent = async (overrideMsg?: string) => {
    const textToSend = overrideMsg || aiTestMessage;
    if (!textToSend.trim()) return;
    setAiTestLoading(true);
    setAiTestResult(null);
    try {
      const cid = user?.clinicId ? Number(user.clinicId) : 1;
      const res = await clinicApi.aiAgentChat(cid, '+998 90 123 45 67', textToSend.trim(), 'Test Bemor');
      setAiTestResult(res);
    } catch (err: any) {
      setAiTestResult({ ok: false, reply: 'AI xizmatiga ulanib bo‘lmadi' });
    } finally {
      setAiTestLoading(false);
    }
  };

  // ── Filiallar (Branches) ──
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('+998 ');
  const [branchLocationUrl, setBranchLocationUrl] = useState('');
  const [branchUseGlobalTg, setBranchUseGlobalTg] = useState(true);
  const [branchTgPhone, setBranchTgPhone] = useState('');
  const [branchWaPhone, setBranchWaPhone] = useState('');
  const [branchIncludeLocationSms, setBranchIncludeLocationSms] = useState(true);
  const [branchIsActive, setBranchIsActive] = useState(true);
  const [branchSaving, setBranchSaving] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  // ── Branch Telegram Verification Flow ──
  const [branchTgStep, setBranchTgStep] = useState<'idle' | 'code' | 'password' | 'connected'>('idle');
  const [branchTgCode, setBranchTgCode] = useState('');
  const [branchTgPassword, setBranchTgPassword] = useState('');
  const [branchTgSending, setBranchTgSending] = useState(false);
  const [branchTgResending, setBranchTgResending] = useState(false);
  const [branchTgCountdown, setBranchTgCountdown] = useState(60);
  const [branchTgError, setBranchTgError] = useState('');
  const [branchTgSentType, setBranchTgSentType] = useState<'app' | 'sms' | 'call'>('app');

  useEffect(() => {
    let t: any;
    if (branchTgStep === 'code' && branchTgCountdown > 0) {
      t = setInterval(() => setBranchTgCountdown((c) => Math.max(0, c - 1)), 1000);
    }
    return () => clearInterval(t);
  }, [branchTgStep, branchTgCountdown]);

  const handleBranchTgSendCode = async () => {
    const digits = branchTgPhone.replace(/\D/g, '');
    if (digits.length < 9) {
      setBranchTgError(tr('settings2.enterAFullPhoneNumber'));
      return;
    }
    setBranchTgError('');
    setBranchTgSending(true);
    const res = await clinicApi.telegramSendCode(branchTgPhone);
    setBranchTgSending(false);
    if (res.ok) {
      if (res.phone) setBranchTgPhone(res.phone);
      setBranchTgSentType(res.sent_type || 'app');
      setBranchTgCountdown(res.timeout || 60);
      setBranchTgStep('code');
    } else {
      setBranchTgError(res.message || tr('settings2.failedToSendCode'));
    }
  };

  const handleBranchTgResendCode = async () => {
    if (branchTgCountdown > 0 || branchTgResending) return;
    setBranchTgResending(true);
    setBranchTgError('');
    const res = await clinicApi.telegramResendCode(branchTgPhone);
    setBranchTgResending(false);
    if (res.ok) {
      setBranchTgSentType(res.sent_type || 'sms');
      setBranchTgCountdown(60);
    } else {
      setBranchTgError(res.message || tr('settings2.failedToResend'));
    }
  };

  const handleBranchTgConfirmCode = async () => {
    if (branchTgCode.replace(/\D/g, '').length < 4) {
      setBranchTgError(tr('settings2.enterTheFullCode'));
      return;
    }
    setBranchTgError('');
    setBranchTgSending(true);
    const res = await clinicApi.telegramSignIn(branchTgPhone, branchTgCode.trim());
    setBranchTgSending(false);
    if (res.ok) {
      setBranchTgStep('connected');
      if (res.phone) setBranchTgPhone(res.phone);
    } else if (res.needs_password) {
      setBranchTgStep('password');
    } else {
      setBranchTgError(res.message || tr('settings2.invalidCode'));
    }
  };

  const handleBranchTgConfirmPassword = async () => {
    if (!branchTgPassword) {
      setBranchTgError(tr('settings2.enterThePassword'));
      return;
    }
    setBranchTgError('');
    setBranchTgSending(true);
    const res = await clinicApi.telegramPassword(branchTgPhone, branchTgPassword);
    setBranchTgSending(false);
    if (res.ok) {
      setBranchTgStep('connected');
      if (res.phone) setBranchTgPhone(res.phone);
    } else {
      setBranchTgError(res.message || tr('settings2.wrongPassword'));
    }
  };

  // ── Rabochie mesta (Kreslolar) ──
  const [workplaces, setWorkplaces] = useState<WorkplaceItem[]>([]);
  const [wpBranchFilter, setWpBranchFilter] = useState<number | 'all'>('all');
  const [isWpModalOpen, setIsWpModalOpen] = useState(false);
  const [editingWp, setEditingWp] = useState<WorkplaceItem | null>(null);
  const [wpName, setWpName] = useState('');
  const [wpColor, setWpColor] = useState('#3B82F6');
  const [wpBranchId, setWpBranchId] = useState<number | ''>('');

  // ── Mutaxassisliklar (Specialties) ──
  const [specialties, setSpecialties] = useState<SpecialtyItem[]>([]);
  const [isSpecModalOpen, setIsSpecModalOpen] = useState(false);
  const [newSpecName, setNewSpecName] = useState('');

  const loadWorkplacesAndSpecialties = async () => {
    const [wList, sList, bList] = await Promise.all([
      clinicApi.getWorkplaces(),
      clinicApi.getSpecialties(),
      clinicApi.getBranches()
    ]);
    setWorkplaces(wList);
    setSpecialties(sList);
    setBranches(bList);
  };

  useEffect(() => {
    loadWorkplacesAndSpecialties();
  }, []);

  const handleOpenAddBranch = () => {
    setEditingBranch(null);
    setBranchName('');
    setBranchAddress('');
    setBranchPhone('+998 ');
    setBranchLocationUrl('');
    setBranchUseGlobalTg(true);
    setBranchTgPhone('');
    setBranchWaPhone('');
    setBranchIncludeLocationSms(true);
    setBranchIsActive(true);
    setBranchTgStep('idle');
    setBranchTgCode('');
    setBranchTgPassword('');
    setBranchTgError('');
    setBranchTgCountdown(60);
    setIsBranchModalOpen(true);
  };

  const handleOpenEditBranch = (b: Branch) => {
    setEditingBranch(b);
    setBranchName(b.name);
    setBranchAddress(b.address || '');
    setBranchPhone(b.phone || '+998 ');
    setBranchLocationUrl(b.location_url || '');
    setBranchUseGlobalTg(b.use_global_telegram ?? true);
    setBranchTgPhone(b.telegram_phone || '');
    setBranchWaPhone(b.whatsapp_phone || '');
    setBranchIncludeLocationSms(b.include_location_in_sms ?? true);
    setBranchIsActive(b.is_active ?? true);
    setBranchTgStep(b.telegram_phone ? 'connected' : 'idle');
    setBranchTgCode('');
    setBranchTgPassword('');
    setBranchTgError('');
    setBranchTgCountdown(60);
    setIsBranchModalOpen(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) return;
    setBranchError(null);
    setBranchSaving(true);
    try {
      const payload: Partial<Branch> = {
        name: branchName.trim(),
        address: branchAddress.trim(),
        phone: branchPhone.trim(),
        location_url: branchLocationUrl.trim(),
        use_global_telegram: branchUseGlobalTg,
        telegram_phone: branchUseGlobalTg ? '' : branchTgPhone.trim(),
        whatsapp_phone: branchUseGlobalTg ? '' : branchWaPhone.trim(),
        include_location_in_sms: branchIncludeLocationSms,
        is_active: branchIsActive,
        clinic: user?.clinicId ? Number(user.clinicId) : undefined,
      };
      if (editingBranch) {
        await clinicApi.updateBranch(editingBranch.id, payload);
      } else {
        await clinicApi.createBranch(payload);
      }
      setIsBranchModalOpen(false);
      await loadWorkplacesAndSpecialties();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('branch-updated'));
    } catch (err: any) {
      setBranchError(err?.message || tr('settings2.branchNotSavedTryAgain'));
    } finally {
      setBranchSaving(false);
    }
  };

  const handleDeleteBranch = async (id: number, name: string) => {
    if (!confirm(tr('settings2.confirmDeleteBranch').replace('{name}', name))) return;
    await clinicApi.deleteBranch(id);
    await loadWorkplacesAndSpecialties();
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('branch-updated'));
  };

  const handleOpenAddWp = () => {
    setEditingWp(null);
    setWpName('');
    setWpColor('#3B82F6');
    setWpBranchId(branches.length > 0 ? branches[0].id : '');
    setIsWpModalOpen(true);
  };

  const handleOpenEditWp = (w: WorkplaceItem) => {
    setEditingWp(w);
    setWpName(w.name);
    setWpColor(w.color || '#3B82F6');
    setWpBranchId(w.branch ? Number(w.branch) : '');
    setIsWpModalOpen(true);
  };

  const handleSaveWp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wpName.trim()) return;
    const branchVal = wpBranchId ? Number(wpBranchId) : null;
    const branchObj = branches.find(b => b.id === branchVal);
    const payload = {
      name: wpName.trim(),
      color: wpColor,
      branch: branchVal,
      branch_name: branchObj?.name
    };
    if (editingWp) {
      await clinicApi.updateWorkplace(editingWp.id, payload);
    } else {
      await clinicApi.createWorkplace(payload);
    }
    setIsWpModalOpen(false);
    await loadWorkplacesAndSpecialties();
  };

  const handleDeleteWp = async (id: number | string, name: string) => {
    if (!confirm(tr('settings2.confirmDeleteWorkplace').replace('{name}', name))) return;
    await clinicApi.deleteWorkplace(id);
    await loadWorkplacesAndSpecialties();
  };

  const handleCreateSpec = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpecName.trim()) return;
    await clinicApi.createSpecialty(newSpecName.trim());
    setNewSpecName('');
    setIsSpecModalOpen(false);
    await loadWorkplacesAndSpecialties();
  };

  const handleDeleteSpec = async (id: number | string, name: string) => {
    if (!confirm(tr('settings2.confirmDeleteSpecialty').replace('{name}', name))) return;
    await clinicApi.deleteSpecialty(id);
    await loadWorkplacesAndSpecialties();
  };

  // ── Avto-eslatma ──
  type ReminderCfg = {
    enabled: boolean;
    send_telegram?: boolean;
    send_sms?: boolean;
    day_before: boolean;
    this_week: boolean;
    hour_before?: boolean;
    schedule_hour?: number;
    lang: 'uz' | 'ru' | 'en';
    day: Record<string, string>;
    week: Record<string, string>;
    hour?: Record<string, string>;
  };
  const [remCfg, setRemCfg] = useState<ReminderCfg | null>(null);
  const [remSaving, setRemSaving] = useState(false);
  const [remRunMsg, setRemRunMsg] = useState('');

  // ── Algoritmni sinash (NLP tester) ──
  const [testReplyText, setTestReplyText] = useState('Ha, albatta boraman');
  const [testReplyLoading, setTestReplyLoading] = useState(false);
  const [testReplyResult, setTestReplyResult] = useState<any>(null);

  const handleTestAlgorithm = async (customText?: string) => {
    const textToTest = customText !== undefined ? customText : testReplyText;
    if (!textToTest.trim()) return;
    setTestReplyLoading(true);
    const res = await clinicApi.testReplyAlgorithm('+998901234567', textToTest);
    setTestReplyResult(res);
    setTestReplyLoading(false);
  };

  // ── Sun'iy Intellekt (AI Agent) Sozlamalari ──
  const [aiSettings, setAiSettings] = useState<{
    has_ai_agent: boolean;
    has_auto_reminders: boolean;
    ai_agent_settings: any;
    context?: any;
  } | null>(null);
  const [aiCustomPrompt, setAiCustomPrompt] = useState('');
  const [aiAutoBooking, setAiAutoBooking] = useState(true);
  const [aiKnowledge, setAiKnowledge] = useState('');       // AI o'rganadigan manba (klinika haqida)
  const [aiGreeting, setAiGreeting] = useState('');         // Maxsus salomlashuv
  const [aiWorkingHours, setAiWorkingHours] = useState(''); // Ish vaqti
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaveMsg, setAiSaveMsg] = useState('');

  const aiClinicId = user?.clinicId ? Number(user.clinicId) : 1;

  const loadAiSettings = async () => {
    try {
      const s = await clinicApi.aiAgentGetSettings(aiClinicId);
      if (s) {
        setAiSettings(s);
        setAiCustomPrompt(s.ai_agent_settings?.custom_prompt || '');
        setAiAutoBooking(s.ai_agent_settings?.auto_booking !== false);
        setAiKnowledge(s.ai_agent_settings?.knowledge_base || '');
        setAiGreeting(s.ai_agent_settings?.greeting || '');
        setAiWorkingHours(s.ai_agent_settings?.working_hours || '');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveAiSettings = async () => {
    setAiSaving(true);
    setAiSaveMsg('');
    try {
      await clinicApi.aiAgentSaveSettings(aiClinicId, {
        ai_agent_settings: {
          ...(aiSettings?.ai_agent_settings || {}),
          custom_prompt: aiCustomPrompt,
          auto_booking: aiAutoBooking,
          knowledge_base: aiKnowledge,
          greeting: aiGreeting,
          working_hours: aiWorkingHours
        }
      });
      setAiSaveMsg(tr('settings2.aiSettingsSaved'));
      setTimeout(() => setAiSaveMsg(''), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setAiSaving(false);
    }
  };

  const handleTestAiChat = async (messageText?: string) => {
    const text = messageText !== undefined ? messageText : aiTestMessage;
    if (!text.trim()) return;
    setAiTestLoading(true);
    try {
      const res = await clinicApi.aiAgentChat(aiClinicId, '+998 90 777 88 99', text, 'Test Bemor');
      setAiTestResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setAiTestLoading(false);
    }
  };

  useEffect(() => {
    clinicApi.getReminderConfig().then((c) => { if (c && c.day) setRemCfg(c); });
    loadAiSettings();
  }, []);
  const saveRemCfg = async () => {
    if (!remCfg) return;
    setRemSaving(true);
    await clinicApi.saveReminderConfig(remCfg);
    setRemSaving(false);
  };
  const runRemNow = async () => {
    setRemRunMsg(tr('settings2.sending'));
    const res = await clinicApi.runRemindersNow();
    if (res.ok) setRemRunMsg(tr('settings2.remindersSent').replace('{n}', String(res.sent)));
    else setRemRunMsg(res.error === 'no_telegram' ? tr('settings2.telegramNotConnected') : (res.message || tr('settings2.error')));
  };

  // ── Xabar shablonlari ──
  const [templates, setTemplates] = useState<MsgTemplate[]>(() => clinicApi.getMessageTemplates());
  const [editTpl, setEditTpl] = useState<MsgTemplate | null>(null);
  const [tplFocused, setTplFocused] = useState<'uz' | 'ru' | 'en'>('uz');
  const tplRefs = { uz: useRef<HTMLTextAreaElement>(null), ru: useRef<HTMLTextAreaElement>(null), en: useRef<HTMLTextAreaElement>(null) };

  const insertPlaceholder = (token: string) => {
    if (!editTpl) return;
    const key = tplFocused;
    const el = tplRefs[key].current;
    const cur = (editTpl as any)[key] || '';
    const start = el ? el.selectionStart : cur.length;
    const end = el ? el.selectionEnd : cur.length;
    const next = cur.slice(0, start) + token + cur.slice(end);
    setEditTpl({ ...editTpl, [key]: next } as MsgTemplate);
    setTimeout(() => { if (el) { el.focus(); const p = start + token.length; el.selectionStart = el.selectionEnd = p; } }, 0);
  };

  const saveTpl = () => {
    if (!editTpl || !editTpl.title.trim()) return;
    const baseText = editTpl.uz.trim() || editTpl.ru.trim() || editTpl.en.trim();
    if (!baseText) return;
    const finalizedTpl: MsgTemplate = {
      ...editTpl,
      title: editTpl.title.trim(),
      uz: editTpl.uz.trim() || baseText,
      ru: editTpl.ru.trim() || baseText,
      en: editTpl.en.trim() || baseText,
    };
    const exists = templates.some((t) => t.id === finalizedTpl.id);
    const next = exists ? templates.map((t) => (t.id === finalizedTpl.id ? finalizedTpl : t)) : [...templates, finalizedTpl];
    setTemplates(next);
    clinicApi.saveMessageTemplates(next);
    setEditTpl(null);
  };
  const deleteTpl = (id: number) => {
    if (!confirm(tr('settings2.deleteTemplate'))) return;
    const next = templates.filter((t) => t.id !== id);
    setTemplates(next);
    clinicApi.saveMessageTemplates(next);
  };

  const PLACEHOLDERS: { token: string; uz: string; ru: string; en: string }[] = [
    { token: '{name}', uz: 'Ism', ru: 'Имя', en: 'Name' },
    { token: '{phone}', uz: 'Telefon', ru: 'Телефон', en: 'Phone' },
    { token: '{date}', uz: 'Sana', ru: 'Дата', en: 'Date' },
    { token: '{time}', uz: 'Vaqt', ru: 'Время', en: 'Time' },
    { token: '{clinic}', uz: 'Klinika', ru: 'Клиника', en: 'Clinic' },
    { token: '{doctor}', uz: 'Shifokor', ru: 'Врач', en: 'Doctor' }
  ];

  const [conn, setConn] = useState<SocialConn>(() => clinicApi.getSocialConnections());

  // Backenddan Telegram holatini avtomatik sinxronlash
  useEffect(() => {
    clinicApi.telegramStatus().then((st) => {
      if (st) {
        setConn((prev) => ({
          ...prev,
          telegram: {
            connected: !!st.connected,
            phone: st.phone || (st.connected ? prev.telegram.phone : ''),
            connectedAt: st.connectedAt || prev.telegram.connectedAt || '',
            device: st.device || 'dentos.app'
          }
        }));
      }
    });
  }, []);

  // WhatsApp Cloud API config
  const [showWaConfig, setShowWaConfig] = useState(false);
  const [waConnected, setWaConnected] = useState(false);
  const [waPhoneId, setWaPhoneId] = useState('');
  const [waToken, setWaToken] = useState('');
  const [waVerify, setWaVerify] = useState('dentos_verify');
  const [waHasToken, setWaHasToken] = useState(false);
  const [waSaving, setWaSaving] = useState(false);
  const webhookUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api') + '/whatsapp/webhook/';

  useEffect(() => {
    clinicApi.whatsappGetConfig().then((c) => {
      setWaConnected(!!c.connected);
      setWaPhoneId(c.phone_number_id || '');
      setWaVerify(c.verify_token || 'dentos_verify');
      setWaHasToken(!!c.has_token);
    });
  }, []);

  const saveWaConfig = async () => {
    if (!waPhoneId.trim()) return;
    setWaSaving(true);
    const res = await clinicApi.whatsappSaveConfig({ phone_number_id: waPhoneId.trim(), access_token: waToken.trim() || undefined, verify_token: waVerify.trim() });
    setWaSaving(false);
    if (res.ok) {
      const c = await clinicApi.whatsappGetConfig();
      setWaConnected(!!c.connected);
      setWaHasToken(!!c.has_token);
      setWaToken('');
      setShowWaConfig(false);
    }
  };

  // Ulash oynasi holati
  const [linkPlatform, setLinkPlatform] = useState<Platform | null>(null);
  const [linkMethod, setLinkMethod] = useState<'phone' | 'qr' | 'bot'>('phone');
  const [step, setStep] = useState<'phone' | 'code' | 'password' | 'done'>('phone');
  const [phone, setPhone] = useState('+998 ');
  const [code, setCode] = useState('');
  const [tfaPassword, setTfaPassword] = useState('');
  const [botToken, setBotToken] = useState('');
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [codeSentType, setCodeSentType] = useState<'app' | 'sms' | 'call'>('app');
  const [countdown, setCountdown] = useState(60);

  // QR kod orqali kirish
  const [qrTokenId, setQrTokenId] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);

  // Teskari hisob (timer)
  useEffect(() => {
    let t: any;
    if (step === 'code' && countdown > 0) {
      t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    }
    return () => clearInterval(t);
  }, [step, countdown]);

  // QR holatini poll qilish
  useEffect(() => {
    let t: any;
    if (linkPlatform === 'telegram' && linkMethod === 'qr' && qrTokenId && step === 'phone') {
      t = setInterval(async () => {
        const res = await clinicApi.telegramQrStatus(qrTokenId);
        if (res && res.authorized) {
          markConnected(res.phone || 'Telegram');
          setStep('done');
        }
      }, 2000);
    }
    return () => clearInterval(t);
  }, [linkPlatform, linkMethod, qrTokenId, step]);

  const platformName = (p: Platform) => (p === 'telegram' ? 'Telegram' : 'WhatsApp');

  const openLink = (p: Platform) => {
    setLinkPlatform(p);
    setLinkMethod('phone');
    setStep('phone');
    setPhone('+998 ');
    setCode('');
    setTfaPassword('');
    setBotToken('');
    setError('');
    setCodeSentType('app');
    setCountdown(60);
    setQrTokenId('');
    setQrUrl('');
  };
  const closeLink = () => { setLinkPlatform(null); setSending(false); setQrTokenId(''); };

  const markConnected = (phoneNum?: string, devModel?: string) => {
    const now = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const p = phoneNum || phone;
    const next = { ...conn, [linkPlatform as Platform]: { connected: true, phone: p, connectedAt: now, device: devModel || 'dentos.app' } };
    setConn(next);
    clinicApi.saveSocialConnections(next);
  };

  const startQrFlow = async () => {
    setLinkMethod('qr');
    setQrLoading(true);
    setError('');
    const res = await clinicApi.telegramQrStart();
    setQrLoading(false);
    if (res.ok) {
      setQrTokenId(res.token_id);
      setQrUrl(res.url);
    } else {
      setError(res.message || tr('settings2.failedToCreateQr'));
    }
  };

  // 1-qadam: raqamga kod yuborish
  const requestCode = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 9) { setError(tr('settings2.enterAFullPhoneNumber')); return; }
    setError('');
    setSending(true);
    if (linkPlatform === 'telegram') {
      const res = await clinicApi.telegramSendCode(phone);
      setSending(false);
      if (res.ok) {
        if (res.phone) setPhone(res.phone);
        setCodeSentType(res.sent_type || 'app');
        setCountdown(res.timeout || 60);
        setStep('code');
      } else {
        setError(res.message || tr('settings2.failedToSendCode'));
      }
    } else {
      setTimeout(() => { setSending(false); setStep('code'); }, 900);
    }
  };

  // Kodni qayta yuborish (Resend / SMS)
  const handleResendCode = async () => {
    if (countdown > 0 || resending) return;
    setResending(true);
    setError('');
    const res = await clinicApi.telegramResendCode(phone);
    setResending(false);
    if (res.ok) {
      setCodeSentType(res.sent_type || 'sms');
      setCountdown(60);
    } else {
      setError(res.message || tr('settings2.failedToResend'));
    }
  };

  // 2-qadam: kodni tasdiqlash → ulanadi
  const confirmCode = async () => {
    if (code.replace(/\D/g, '').length < 4) { setError(tr('settings2.enterTheFullCode')); return; }
    setError('');
    setSending(true);
    if (linkPlatform === 'telegram') {
      const res = await clinicApi.telegramSignIn(phone, code.trim());
      setSending(false);
      if (res.ok) { markConnected(res.phone); setStep('done'); }
      else if (res.needs_password) { setStep('password'); }
      else setError(res.message || tr('settings2.invalidCode'));
    } else {
      setTimeout(() => { markConnected(); setSending(false); setStep('done'); }, 900);
    }
  };

  // 2FA (bulutli parol) qadami — faqat Telegram
  const confirmPassword = async () => {
    if (!tfaPassword) { setError(tr('settings2.enterThePassword')); return; }
    setError('');
    setSending(true);
    const res = await clinicApi.telegramPassword(phone, tfaPassword);
    setSending(false);
    if (res.ok) { markConnected(res.phone); setStep('done'); }
    else setError(res.message || tr('settings2.wrongPassword'));
  };

  // Bot token orqali ulash
  const handleBotLogin = async () => {
    if (!botToken.trim()) { setError(tr('settings2.enterBotToken')); return; }
    setSending(true);
    setError('');
    const res = await clinicApi.telegramBotLogin(botToken.trim());
    setSending(false);
    if (res.ok) {
      markConnected(res.phone || 'Telegram Bot', 'Telegram Bot');
      setStep('done');
    } else {
      setError(res.message || tr('settings2.failedToLinkBot'));
    }
  };

  const disconnect = async (p: Platform) => {
    if (!confirm(tr('settings2.confirmDisconnect').replace('{name}', platformName(p)))) return;
    if (p === 'telegram') { await clinicApi.telegramDisconnect(conn.telegram.phone); }
    const next = { ...conn, [p]: { connected: false, phone: '', connectedAt: '', device: 'dentos.app' } };
    setConn(next);
    clinicApi.saveSocialConnections(next);
  };

  const platforms: { key: Platform; label: string; icon: React.ElementType; color: string; ring: string }[] = [
    { key: 'telegram', label: 'Telegram', icon: Send, color: 'text-sky-500', ring: 'bg-sky-50 dark:bg-sky-950/50 border-sky-200 dark:border-sky-900' },
    { key: 'whatsapp', label: 'WhatsApp', icon: Phone, color: 'text-emerald-500', ring: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-900' }
  ];

  return (
    <div className="space-y-6 text-slate-900 dark:text-white transition-colors">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-slate-800 text-white flex items-center justify-center shadow-sm">
          <SettingsIcon className="w-5.5 h-5.5" />
        </div>
        <div>
          <h1 className="text-xl font-black">{tr('settings2.settings')}</h1>
          <p className="text-xs text-slate-400">{tr('settings2.clinicSettings')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Bo'limlar ro'yxati (hozircha 1 ta) */}
        <aside className="lg:col-span-1">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveSection('profile')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                activeSection === 'profile'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>{tr('settings2.profileSecurity')}</span>
            </button>
            <button
              onClick={() => setActiveSection('social')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                activeSection === 'social'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Share2 className="w-4 h-4" />
              <span>{tr('settings2.socialNetworkLinking')}</span>
            </button>
            <button
              onClick={() => setActiveSection('templates')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                activeSection === 'templates'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <MessageSquareText className="w-4 h-4" />
              <span>{tr('settings2.messageTemplates')}</span>
            </button>
            <button
              onClick={() => setActiveSection('reminders')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                activeSection === 'reminders'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Sparkles className="w-4 h-4 shrink-0 text-purple-400" />
                <span className="truncate">{tr('settings2.autoRemindersAi')}</span>
              </div>
              {aiSettings?.has_ai_agent && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-400/30 shrink-0">AI</span>
              )}
            </button>

            <button
              onClick={() => setActiveSection('branches')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                activeSection === 'branches'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>{tr('settings2.branches')}</span>
            </button>

            <button
              onClick={() => setActiveSection('chairs')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                activeSection === 'chairs'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Armchair className="w-4 h-4" />
              <span>{tr('settings2.workplacesChairs')}</span>
            </button>

            <button
              onClick={() => setActiveSection('specialties')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                activeSection === 'specialties'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Stethoscope className="w-4 h-4" />
              <span>{tr('settings2.specialties')}</span>
            </button>

           
          </nav>
        </aside>

        {/* Bo'lim mazmuni */}
        <section className="lg:col-span-3 space-y-4">
          {activeSection === 'profile' && (
            <div className="space-y-6 max-w-3xl">
              {/* KARTA 1: Direktor shaxsiy ma'lumotlari */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 space-y-5">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <UserCog className="w-5 h-5 text-blue-600 dark:text-sky-400" />
                  <div>
                    <h2 className="text-base font-black text-slate-900 dark:text-white">
                      {tr('settings2.directorProfileDetails')}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {tr('settings2.directorFullNameContactPhoneAnd')}
                    </p>
                  </div>
                </div>

                {profileFeedback && (
                  <div
                    className={`p-4 rounded-xl border flex items-center gap-3 ${
                      profileFeedback.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                        : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                    }`}
                  >
                    {profileFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
                    )}
                    <p className="text-sm font-medium">{profileFeedback.msg}</p>
                  </div>
                )}

                <form onSubmit={handleSaveProfileDetails} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {tr('settings2.directorFullName')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={profileName}
                        onChange={e => setProfileName(e.target.value)}
                        placeholder="Masalan: Jasur Usmonov"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {tr('settings2.contactPhone')}
                      </label>
                      <input
                        type="text"
                        value={profilePhone}
                        onChange={e => setProfilePhone(e.target.value)}
                        placeholder="+998 90 123 45 67"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {tr('settings2.loginGmailEmail')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={profileEmail}
                      onChange={e => setProfileEmail(e.target.value)}
                      placeholder="Masalan: director.dentlux@gmail.com"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                    />
                    <p className="text-[11px] text-slate-400">
                      {tr('settings2.thisGmailEmailIsUsedTo')}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      {tr('settings2.nameAndLoginWillUpdateImmediately')}
                    </span>
                    <button
                      type="submit"
                      disabled={profileSaving}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm shadow-blue-600/20 transition active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                    >
                      {profileSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>{tr('settings2.saving')}</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>{tr('settings2.saveProfileDetails')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* KARTA 2: Xavfsizlik va Parolni o'zgartirish */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 space-y-5">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <KeyRound className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <h2 className="text-base font-black text-slate-900 dark:text-white">
                      {tr('settings2.securityLoginPassword')}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {tr('settings2.safelyUpdateYourLoginPasswordAnyti')}
                    </p>
                  </div>
                </div>

                {securityFeedback && (
                  <div
                    className={`p-4 rounded-xl border flex items-center gap-3 ${
                      securityFeedback.type === 'success'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                        : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                    }`}
                  >
                    {securityFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
                    )}
                    <p className="text-sm font-medium">{securityFeedback.msg}</p>
                  </div>
                )}

                <form onSubmit={handleSavePassword} className="space-y-4">
                  {/* Joriy parol — alohida maydon */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {tr('settings2.currentPassword')}
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPass ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        placeholder={tr('settings2.yourCurrentLoginPassword')}
                        autoComplete="current-password"
                        className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {tr('settings2.newPassword')} <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPass ? 'text' : 'password'}
                          required
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder={tr('settings2.atLeast4Characters')}
                          className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPass(!showNewPass)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {tr('settings2.confirmNewPassword')} <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPass ? 'text' : 'password'}
                          required
                          value={newPasswordConfirm}
                          onChange={e => setNewPasswordConfirm(e.target.value)}
                          placeholder={tr('settings2.reEnterNewPassword')}
                          className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPass(!showConfirmPass)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/40 text-xs text-indigo-800 dark:text-indigo-300 flex items-start gap-2">
                    <span className="text-sm">🔐</span>
                    <p>
                      {tr('settings2.itIsRecommendedToReplaceThe')}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={securitySaving}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm shadow-indigo-600/20 transition active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                    >
                      {securitySaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>{tr('settings2.updating')}</span>
                        </>
                      ) : (
                        <>
                          <KeyRound className="w-4 h-4" />
                          <span>{tr('settings2.updatePassword')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeSection === 'social' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Share2 className="w-5 h-5 text-blue-600 dark:text-sky-400" />
              <div>
                <h2 className="text-base font-black">{tr('settings2.socialNetworkLinking')}</h2>
                <p className="text-xs text-slate-400">
                  {tr('settings2.linkYourTelegramAndWhatsappEnter')}
                </p>
              </div>
            </div>

            {/* Platformalar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {platforms.map((p) => {
                const isWa = p.key === 'whatsapp';
                const c = conn[p.key];
                const connected = isWa ? waConnected : c.connected;
                const Icon = p.icon;
                return (
                  <div key={p.key} className={`rounded-2xl border p-4 ${p.ring} ${isWa ? 'opacity-70' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                          <Icon className={`w-5 h-5 ${p.color}`} />
                        </div>
                        <div>
                          <p className="font-bold text-sm">{p.label}</p>
                          {isWa ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600">🚧 {tr('settings2.inDevelopment')}</span>
                          ) : connected ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {tr('settings2.connected')}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">{tr('settings2.notConnected')}</span>
                          )}
                        </div>
                      </div>
                      {!isWa && connected && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                    </div>

                    {isWa ? (
                      // ── WhatsApp — hozircha ishlab chiqilmoqda ──
                      <div className="mt-3">
                        <button disabled className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-bold cursor-not-allowed">
                          {tr('settings2.soon')}
                        </button>
                      </div>
                    ) : connected ? (
                      // ── Telegram (QR/qurilma) ──
                      <div className="mt-3 space-y-2">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                          <p>{tr('settings2.number')}: <span className="font-semibold text-slate-700 dark:text-slate-200">{c.phone}</span></p>
                          <p>{tr('settings2.connectedOn')}: {c.connectedAt}</p>
                        </div>
                        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                          <Smartphone className="w-4 h-4 text-slate-500" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">dentos.app</p>
                            <p className="text-[10px] text-slate-400">
                              {tr('settings2.shownLikeThisInLinkedDevices')}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> {tr('settings2.active')}</span>
                        </div>
                        <button
                          onClick={() => disconnect(p.key)}
                          className="w-full mt-1 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> {tr('settings2.disconnect')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => openLink(p.key)}
                        className="w-full mt-3 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition"
                      >
                        {tr('settings2.connect')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 🏢 Filiallar bo‘yicha ijtimoiy tarmoqlar taqsimoti */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600 dark:text-sky-400" />
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {tr('settings2.branchSocialSettings')}
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">
                  {branches.length} {tr('settings2.branches2')}
                </span>
              </div>

              {branches.length <= 1 ? (
                <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/60 text-xs text-blue-700 dark:text-sky-300 flex items-start gap-2.5">
                  <div className="p-1 rounded-lg bg-blue-100 dark:bg-blue-900/60 shrink-0 mt-0.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
                  </div>
                  <div>
                    <p className="font-bold">
                      {tr('settings2.unifiedGlobalAccountModeActive')}
                    </p>
                    <p className="text-[11px] text-blue-600/80 dark:text-sky-400/80 mt-0.5">
                      {tr('settings2.allMessagesSentViaUnifiedAccount')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {branches.map((b) => (
                    <div
                      key={b.id}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-blue-600 dark:text-sky-400 shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-xs text-slate-800 dark:text-slate-100">{b.name}</p>
                          <p className="text-[10px] text-slate-400">{b.address || tr('settings2.noAddress')}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Telegram badge */}
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px]">
                          <Send className="w-3 h-3 text-sky-500" />
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {b.use_global_telegram
                              ? tr('settings2.globalTg')
                              : (b.telegram_phone ? b.telegram_phone : tr('settings2.customTg'))}
                          </span>
                        </div>

                        {/* WhatsApp badge */}
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px]">
                          <Phone className="w-3 h-3 text-emerald-500" />
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {b.whatsapp_phone ? b.whatsapp_phone : tr('settings2.globalWa')}
                          </span>
                        </div>

                        {!b.use_global_telegram && !b.telegram_phone && (
                          <button
                            type="button"
                            onClick={() => {
                              handleOpenEditBranch(b);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-bold text-[11px] transition shadow-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Send className="w-3 h-3" />
                            <span>{tr('settings2.connectViaSms')}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setActiveSection('branches');
                            handleOpenEditBranch(b);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-600 dark:text-sky-400 font-bold text-[11px] transition"
                        >
                          {tr('settings2.edit')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}

          {/* ══ SHABLONLAR bo'limi ══ */}
          {activeSection === 'templates' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <MessageSquareText className="w-5 h-5 text-blue-600 dark:text-sky-400" />
                <div>
                  <h2 className="text-base font-black">{tr('settings2.messageTemplates')}</h2>
                  <p className="text-xs text-slate-400">
                    {tr('settings2.writeIn3LanguagesInsertPlaceholder')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditTpl({ id: Date.now(), title: '', uz: '', ru: '', en: '' })}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" /> {tr('settings2.newTemplate')}
              </button>
            </div>

            {templates.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">{tr('settings2.noTemplatesYet')}</div>
            ) : (
              <div className="space-y-2.5">
                {templates.map((t) => (
                  <div key={t.id} className="flex items-start gap-3 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                      <MessageSquareText className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-900 dark:text-white">{t.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{t.uz || t.ru || t.en}</p>
                      <div className="flex gap-1 mt-1.5">
                        {(['uz', 'ru', 'en'] as const).map((l) => (
                          <span key={l} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${(t as any)[l] ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200 text-slate-400 dark:bg-slate-700'}`}>{l.toUpperCase()}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditTpl(t)} className="p-2 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => deleteTpl(t.id)} className="p-2 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {/* ══ AVTO-ESLATMA bo'limi ══ */}
          {activeSection === 'reminders' && remCfg && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 space-y-5">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <Send className="w-5 h-5 text-blue-600 dark:text-sky-400" />
                <div>
                  <h2 className="text-base font-black">{tr('settings2.autoRemindersSmsTelegram')}</h2>
                  <p className="text-xs text-slate-400">{tr('settings2.automaticRemindersAreSentAt18')}</p>
                </div>
              </div>

              {/* Umumiy yoqish */}
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50">
                <div>
                  <span className="font-bold text-sm block text-blue-950 dark:text-blue-200">{tr('settings2.enableAutoReminders')}</span>
                  <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">{tr('settings2.triggersAt1800TashkentTime')}</span>
                </div>
                <input type="checkbox" checked={remCfg.enabled} onChange={(e) => setRemCfg({ ...remCfg, enabled: e.target.checked })} className="w-5 h-5 accent-blue-600" />
              </label>

              {/* Kanallar: Telegram va SMS */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">{tr('settings2.deliveryChannels')}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">
                    <span className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                      <Send className="w-4 h-4 text-sky-500" />
                      Telegram
                    </span>
                    <input
                      type="checkbox"
                      checked={remCfg.send_telegram !== false}
                      onChange={(e) => setRemCfg({ ...remCfg, send_telegram: e.target.checked })}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </label>
                  <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">
                    <span className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                      <Smartphone className="w-4 h-4 text-emerald-500" />
                      SMS (Eskiz / Shlyuz)
                    </span>
                    <input
                      type="checkbox"
                      checked={remCfg.send_sms !== false}
                      onChange={(e) => setRemCfg({ ...remCfg, send_sms: e.target.checked })}
                      className="w-4 h-4 accent-blue-600"
                    />
                  </label>
                </div>
              </div>

              {/* Jadval va eslatma turlari */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">{tr('settings2.schedule1800TashkentTime')}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-start gap-2.5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">
                    <input type="checkbox" checked={remCfg.day_before} onChange={(e) => setRemCfg({ ...remCfg, day_before: e.target.checked })} className="w-4 h-4 accent-blue-600 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">{tr('settings2.n1DayBeforeAppointment1800')}</span>
                      <span className="text-xs text-slate-400 block mt-0.5">{tr('settings2.reminderForTomorrow')}</span>
                    </div>
                  </label>
                  <label className="flex items-start gap-2.5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">
                    <input type="checkbox" checked={remCfg.this_week} onChange={(e) => setRemCfg({ ...remCfg, this_week: e.target.checked })} className="w-4 h-4 accent-blue-600 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">{tr('settings2.weekendSunday1800')}</span>
                      <span className="text-xs text-slate-400 block mt-0.5">{tr('settings2.forAllNextWeekAppointments')}</span>
                    </div>
                  </label>
                  <label className="flex items-start gap-2.5 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer sm:col-span-2">
                    <input type="checkbox" checked={remCfg.hour_before ?? true} onChange={(e) => setRemCfg({ ...remCfg, hour_before: e.target.checked })} className="w-4 h-4 accent-blue-600 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">{tr('settings2.n1HourBeforeAppointment')}</span>
                      <span className="text-xs text-slate-400 block mt-0.5">{tr('settings2.duringTheDayAutoReminder1')}</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Yuborish tili */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">{tr('settings2.sendLanguage')}</label>
                <select value={remCfg.lang} onChange={(e) => setRemCfg({ ...remCfg, lang: e.target.value as 'uz' | 'ru' | 'en' })} className="w-full sm:w-48 p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-sm">
                  <option value="uz">O‘zbekcha</option>
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </div>

              {/* Placeholder eslatma */}
              <p className="text-[11px] text-slate-400">{tr('settings2.placeholders')}: <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{'{name} {date} {time} {doctor} {clinic}'}</span></p>

              {/* Xabar matnlari (tanlangan tilda) */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">{tr('settings2.n1DayBeforeMessageSentAt')}</label>
                <textarea rows={2} value={remCfg.day[remCfg.lang] || ''} onChange={(e) => setRemCfg({ ...remCfg, day: { ...remCfg.day, [remCfg.lang]: e.target.value } })} className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 text-sm resize-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">{tr('settings2.sundayWeeklyMessageSentAt18')}</label>
                <textarea rows={2} value={remCfg.week[remCfg.lang] || ''} onChange={(e) => setRemCfg({ ...remCfg, week: { ...remCfg.week, [remCfg.lang]: e.target.value } })} className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 text-sm resize-none" />
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <button onClick={runRemNow} className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition">
                    {tr('settings2.runSendNow')}
                  </button>
                  {remRunMsg && <span className="text-xs text-slate-500 font-medium">{remRunMsg}</span>}
                </div>
                <button onClick={saveRemCfg} disabled={remSaving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 transition shadow-xs">
                  {remSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {tr('settings2.save')}
                </button>
              </div>
            </div>

            {/* ══ JONLI NLP ALGORITM SINOVI (Bemor javobini tahlil qilish) ══ */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black">{tr('settings2.patientReplyNlpParserLiveTest')}</h3>
                  <p className="text-xs text-slate-400">{tr('settings2.autoUpdateAppointmentStatusBasedOn')}</p>
                </div>
              </div>

              {/* Qoidalar jadvali */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 text-cyan-900 dark:text-cyan-200">
                  <span className="font-bold block">Ha / Boraman / Да</span>
                  <span className="text-[11px] text-cyan-700 dark:text-cyan-300">→ Tasdiqlangan</span>
                </div>
                <div className="p-2.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 text-orange-900 dark:text-orange-200">
                  <span className="font-bold block">Kechikaman (15 min)</span>
                  <span className="text-[11px] text-orange-700 dark:text-orange-300">→ Kechikdi</span>
                </div>
                <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200">
                  <span className="font-bold block">Kela olmayman / Bekor</span>
                  <span className="text-[11px] text-red-700 dark:text-red-300">→ Kelmadi / Bekor</span>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                  <span className="font-bold block">Boshqa vaqtga</span>
                  <span className="text-[11px] text-amber-700 dark:text-amber-300">→ Ko‘chirish belgisi</span>
                </div>
              </div>

              {/* Tezkor namunalar (O'zbekcha va Ruscha) */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 block">{tr('settings2.pickAnExampleOrTypeUz')}</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Ha, albatta boraman',
                    'Да, конечно буду',
                    'Sal kechikaman 15 minut',
                    'Опоздаю на 15 минут',
                    'Kela olmayman, bekor qiling',
                    'Не смогу прийти, отмените',
                    'Boshqa kunga ko‘chiring',
                    'Перенесите на другое время',
                    'Yes, I will come on time'
                  ].map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => {
                        setTestReplyText(sample);
                        handleTestAlgorithm(sample);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kirish maydoni va test tugmasi */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testReplyText}
                  onChange={(e) => setTestReplyText(e.target.value)}
                  placeholder={tr('settings2.patientReplyText')}
                  className="flex-1 p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-purple-500 text-sm"
                />
                <button
                  type="button"
                  onClick={() => handleTestAlgorithm()}
                  disabled={testReplyLoading}
                  className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs"
                >
                  {testReplyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {tr('settings2.test')}
                </button>
              </div>

              {/* Natija bloki */}
              {testReplyResult && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3 animate-in fade-in duration-100">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">{tr('settings2.detectedIntent')}</span>
                      <span className="px-2 py-0.5 rounded-md font-mono text-xs font-black uppercase bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                        {testReplyResult.intent}
                      </span>
                    </div>

                    {/* Dinamik til holati */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">{tr('settings2.lang')}</span>
                      <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                        <span>🌐</span>
                        <span>
                          {testReplyResult.patient_language === 'ru' ? '🇷🇺 Русский' :
                           testReplyResult.patient_language === 'en' ? '🇬🇧 English' :
                           '🇺🇿 O‘zbek'}
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">{tr('settings2.statusAction')}</span>
                      <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                        testReplyResult.new_status === 'confirmed' ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200' :
                        testReplyResult.new_status === 'late' ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200' :
                        testReplyResult.new_status === 'cancelled' || testReplyResult.new_status === 'no_show' ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' :
                        'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}>
                        {testReplyResult.new_status
                          ? (testReplyResult.new_status === 'confirmed' ? 'Tasdiqlangan' :
                             testReplyResult.new_status === 'late' ? 'Kechikdi' :
                             testReplyResult.new_status === 'no_show' ? 'Kelmadi' :
                             testReplyResult.new_status === 'cancelled' ? 'Bekor qilingan' :
                             testReplyResult.new_status)
                          : tr('settings2.unchangedAdminReview')}
                      </span>
                    </div>
                  </div>

                  {testReplyResult.language_changed_to && (
                    <div className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      <span>{tr('settings2.langAutoUpdated').replace('{lang}', testReplyResult.language_changed_to.toUpperCase())}</span>
                    </div>
                  )}

                  {testReplyResult.reply_message && (
                    <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                      <span className="text-[11px] font-bold text-slate-400 block">{tr('settings2.politeAutoReplyToPatient')}</span>
                      <p className="text-slate-800 dark:text-slate-200 font-medium italic">"{testReplyResult.reply_message}"</p>
                    </div>
                  )}

                  {testReplyResult.note && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                      ⚠️ {testReplyResult.note}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ══ 2-MODUL: AI ADMINISTRATOR VA ONLAYN QABULGA YOZISH (AI AGENT) ══ */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/70 border border-purple-200 dark:border-purple-800 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black flex items-center gap-2">
                      <span>{tr('settings2.aiAdministratorSmartConsultant')}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 uppercase">
                        2-modul
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      {tr('settings2.analyzePatientInquiriesConsultOnPr')}
                    </p>
                  </div>
                </div>

                {/* Tarif holati belgisi */}
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                    aiSettings?.has_ai_agent
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${aiSettings?.has_ai_agent ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                    <span>{aiSettings?.has_ai_agent ? tr('settings2.activeInTariff') : tr('settings2.notInTariff')}</span>
                  </span>
                </div>
              </div>

              {!aiSettings?.has_ai_agent && (
                <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                  <span className="text-base shrink-0">ℹ️</span>
                  <div>
                    <span className="font-bold block">Ushbu klinika obunasida AI Administrator moduli o‘chiq</span>
                    <span className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 block leading-relaxed">
                      SuperAdmin panelida ushbu klinika uchun «AI Administrator» modulini yoqsangiz, real bemor chatlarida avtomatik javob va qabulga yozish ishga tushadi. Quyida esa simulyatorda AI javoblarini sinab ko‘rishingiz mumkin.
                    </span>
                  </div>
                </div>
              )}

              {/* CRM Baza bilan avtomatik bog'langan manbalar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                    <span>🦷</span>
                    <span>Xizmatlar va narxlar</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Klinikadagi barcha narxlar bazasi avto-sinxlangan
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                    <span>👨‍⚕️</span>
                    <span>Shifokorlar jadvali</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Mutaxassislar va ularning ish kunlari o‘qiladi
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                    <span>📅</span>
                    <span>Avto-zapis tizimi</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Bo‘sh vaqtga to‘qnashuvsiz (collision-free) yozish
                  </p>
                </div>
              </div>

              {/* Qo'shimcha yo'riqnoma va manbalar (Custom training / prompt) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {tr('settings2.customAiClinicInstructionsKnowledg')}
                  </label>
                  <span className="text-[11px] text-slate-400">Klinika kiritgan manbalar</span>
                </div>
                <textarea
                  rows={5}
                  value={aiKnowledge}
                  onChange={e => setAiKnowledge(e.target.value)}
                  placeholder={tr('settings2.eGFreeFirstConsultationFree')}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-purple-500 text-xs resize-none"
                />
                <p className="text-[11px] text-slate-400">
                  {tr('settings2.theAiAnswersPatientsBasedOn')}
                </p>
              </div>

              {/* Maxsus salomlashuv va ish vaqti */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {tr('settings2.workingHours')}
                  </label>
                  <input
                    type="text"
                    value={aiWorkingHours}
                    onChange={e => setAiWorkingHours(e.target.value)}
                    placeholder={tr('settings2.monSat09001900')}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-purple-500 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {tr('settings2.customGreetingOptional')}
                  </label>
                  <input
                    type="text"
                    value={aiGreeting}
                    onChange={e => setAiGreeting(e.target.value)}
                    placeholder={tr('settings2.helloWelcomeToClinic')}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-purple-500 text-xs"
                  />
                </div>
              </div>

              {/* Avto-zapis ruxsati & Saqlash */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aiAutoBooking}
                    onChange={e => setAiAutoBooking(e.target.checked)}
                    className="w-4 h-4 accent-purple-600 rounded"
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {tr('settings2.allowAutoCreatingAppointmentWhenPa')}
                  </span>
                </label>

                <div className="flex items-center gap-2 shrink-0">
                  {aiSaveMsg && <span className="text-xs text-emerald-600 font-bold">{aiSaveMsg}</span>}
                  <button
                    type="button"
                    onClick={handleSaveAiSettings}
                    disabled={aiSaving}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs"
                  >
                    {aiSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>{tr('settings2.saveAiSettings')}</span>
                  </button>
                </div>
              </div>

              {/* JONLI AI SINOV SIMULYATORI (SANDBOX) */}
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-600 flex items-center justify-center font-bold text-xs">
                    💬
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">AI Konsultant va Qabulga yozish simulyatori (Jonli sinov)</h4>
                    <p className="text-[11px] text-slate-400">Bemor nomidan savol bering yoki qabulga yozilishni so‘rang</p>
                  </div>
                </div>

                {/* Tezkor namunalar */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Tish oqartirish narxi qancha turadi?',
                    'Qanday shifokorlar bor va qachon ishlaydi?',
                    'Ertaga soat 15:00 ga qabulga yozib qo‘ying',
                    'Indin soat 11:30 ga doktorga yozing',
                    'Сколько стоит пломба и чистка зубов?',
                    'Запишите меня на завтра в 14:00 к врачу'
                  ].map(sample => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => {
                        setAiTestMessage(sample);
                        handleTestAiChat(sample);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-[11px] font-semibold text-slate-700 dark:text-slate-300 transition border border-transparent hover:border-purple-200"
                    >
                      {sample}
                    </button>
                  ))}
                </div>

                {/* Input va Test tugmasi */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiTestMessage}
                    onChange={e => setAiTestMessage(e.target.value)}
                    placeholder="Bemor yozadigan matnni kiriting..."
                    className="flex-1 p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-purple-500 text-xs"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleTestAiChat();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleTestAiChat()}
                    disabled={aiTestLoading || !aiTestMessage.trim()}
                    className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-xs shrink-0"
                  >
                    {aiTestLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>AI dan javob olish</span>
                  </button>
                </div>

                {/* AI javob natijasi */}
                {aiTestResult && (
                  <div className="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/60 space-y-3 animate-in fade-in duration-150">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-500">AI aniqlagan niyat:</span>
                        <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-black uppercase bg-purple-200 dark:bg-purple-900/80 text-purple-800 dark:text-purple-200">
                          {aiTestResult.intent || 'general_consultation'}
                        </span>
                      </div>

                      {aiTestResult.appointment_created && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Qabul CRM bazasiga muvaffaqiyatli yozildi!
                        </span>
                      )}
                    </div>

                    {/* AI xabari */}
                    <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-100 dark:border-purple-900/40 text-xs space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-purple-700 dark:text-purple-400 text-[11px]">
                        <Bot className="w-3.5 h-3.5" />
                        <span>AI Konsultantning bemorga javobi:</span>
                      </div>
                      <p className="text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed font-medium">
                        {aiTestResult.reply_message}
                      </p>
                    </div>

                    {/* Agar qabul yaratilgan bo'lsa, qabul ma'lumotlari */}
                    {aiTestResult.appointment && (
                      <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs flex flex-wrap items-center gap-4">
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase block">Qabul ID</span>
                          <span className="font-mono font-bold text-emerald-800 dark:text-emerald-200">#{aiTestResult.appointment.id}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase block">Shifokor</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{aiTestResult.appointment.doctor_name}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase block">Sana va vaqt</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{aiTestResult.appointment.start_time}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 uppercase block">Status</span>
                          <span className="font-bold text-cyan-600 uppercase text-[11px]">{aiTestResult.appointment.status}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}

          {/* ══════════════ 3.5. FILIALLAR (BRANCHES) ══════════════ */}
          {activeSection === 'branches' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    <span>{tr('settings2.branchManagement')}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-sky-300 font-bold">
                      {branches.length} {tr('settings2.branches2')}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {tr('settings2.branchNamesAddressesPhonesMapLocat')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOpenAddBranch}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 transition active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{tr('settings2.addBranch')}</span>
                </button>
              </div>

              {/* Branches Grid or Empty State */}
              {branches.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-xs">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-sky-400">
                    <Building2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{tr('settings2.noBranchesYet')}</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-5">
                    {tr('settings2.addYourFirstBranchToManage')}
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenAddBranch}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 transition active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{tr('settings2.addBranch')}</span>
                  </button>
                </div>
              ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {branches.map((b) => (
                  <div
                    key={b.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between hover:border-blue-400 transition group"
                  >
                    <div className="space-y-3.5">
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400 flex items-center justify-center font-black">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-black text-sm text-slate-900 dark:text-white leading-tight">
                              {b.name}
                            </h3>
                            <span className="text-[11px] font-semibold text-slate-400">
                              ID: #{b.id}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            b.is_active
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {b.is_active ? tr('settings2.active2') : tr('settings2.inactive')}
                        </span>
                      </div>

                      {/* Info Details */}
                      <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                        {/* Manzil */}
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{b.address || tr('settings2.noAddress2')}</span>
                        </div>

                        {/* Telefon */}
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="font-mono text-xs">{b.phone || tr('settings2.noPhone')}</span>
                        </div>

                        {/* Lokatsiya linki */}
                        {b.location_url ? (
                          <a
                            href={b.location_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-blue-600 dark:text-sky-400 hover:underline font-semibold text-[11px]"
                          >
                            <Globe className="w-3.5 h-3.5" />
                            <span>{tr('settings2.viewOnMap')}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <div className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Globe className="w-3.5 h-3.5 text-slate-300" />
                            <span>{tr('settings2.noMapLink')}</span>
                          </div>
                        )}
                      </div>

                      {/* Telegram, WhatsApp va SMS lokatsiya xulosasi */}
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-[11px]">
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <Send className="w-3.5 h-3.5 text-sky-500" />
                          <span>
                            {b.use_global_telegram
                              ? tr('settings2.globalClinicTelegramAccount')
                              : (b.telegram_phone ? `Telegram: ${b.telegram_phone}` : tr('settings2.dedicatedBranchTelegram'))}
                          </span>
                        </div>
                        {b.whatsapp_phone && (
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <Phone className="w-3.5 h-3.5 text-emerald-500" />
                            <span>WhatsApp: {b.whatsapp_phone}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
                          <span>
                            {b.include_location_in_sms
                              ? tr('settings2.branchLocationInSmsTelegramEnabled')
                              : tr('settings2.noLocationInMessages')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1.5 pt-4 mt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleOpenEditBranch(b)}
                        className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>{tr('settings2.edit2')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBranch(b.id, b.name)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                        title={tr('settings2.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          )}

          {/* ══════════════ 4. ISH O‘RINLARI (KRESLOLAR) ══════════════ */}
          {activeSection === 'chairs' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Armchair className="w-5 h-5 text-blue-600" />
                    <span>{tr('settings2.workplacesChairs2')}</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {tr('settings2.listOfClinicRoomsChairsBranch')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOpenAddWp}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 transition active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{tr('settings2.addChair')}</span>
                </button>
              </div>

              {/* Filial bo'yicha filter */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setWpBranchFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                    wpBranchFilter === 'all'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-blue-400'
                  }`}
                >
                  {tr('settings2.allBranches')} ({workplaces.length})
                </button>
                {branches.map((b) => {
                  const count = workplaces.filter((w) => w.branch === b.id).length;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setWpBranchFilter(b.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                        wpBranchFilter === b.id
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-blue-400'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>{b.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${wpBranchFilter === b.id ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Workplaces grid or Empty State */}
              {workplaces.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-xs">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-sky-400">
                    <Armchair className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{tr('settings2.noChairsYet')}</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-5">
                    {tr('settings2.addDentalChairsAndOperatoriesTo')}
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenAddWp}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{tr('settings2.addChair')}</span>
                  </button>
                </div>
              ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {workplaces
                  .filter((w) => wpBranchFilter === 'all' || w.branch === wpBranchFilter)
                  .map((w) => {
                    const br = branches.find((b) => b.id === w.branch);
                    return (
                      <div
                        key={w.id}
                        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs flex items-center justify-between hover:border-blue-400 transition"
                      >
                        <div className="flex items-center space-x-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-xs"
                            style={{ backgroundColor: w.color || '#3B82F6' }}
                          >
                            💺
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-slate-900 dark:text-white">
                              {w.name}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 border border-blue-200 dark:border-blue-800">
                                <Building2 className="w-2.5 h-2.5" />
                                {w.branch_name || br?.name || tr('settings2.global')}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditWp(w)}
                            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            title={tr('settings2.edit3')}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteWp(w.id, w.name)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            title={tr('settings2.delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
              )}
            </div>
          )}

          {/* ══════════════ 5. MUTAXASSISLIKLAR (SPECIALTIES) ══════════════ */}
          {activeSection === 'specialties' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Stethoscope className="w-5 h-5 text-blue-600" />
                    <span>{tr('settings2.doctorSpecialties')}</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {tr('settings2.officialSpecialtyCatalogManagedExc')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsSpecModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 transition active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{tr('settings2.addSpecialty')}</span>
                </button>
              </div>

              {/* Specialties grid / list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {specialties.map((s, idx) => (
                  <div
                    key={s.id || idx}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 shadow-xs flex items-center justify-between hover:border-blue-400 transition"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400 flex items-center justify-center font-black text-xs">
                        {idx + 1}
                      </div>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {s.name}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteSpec(s.id, s.name)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                      title={tr('settings2.delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* MODAL: Kreslo qo‘shish / tahrirlash */}
      {isWpModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Armchair className="w-5 h-5 text-blue-600" />
                <span>{editingWp ? tr('settings2.editChair') : tr('settings2.newWorkplace')}</span>
              </h3>
              <button onClick={() => setIsWpModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWp} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('settings2.cabinetChairName')} *
                </label>
                <input
                  type="text"
                  required
                  placeholder={tr('settings2.eGRoom1Chair1')}
                  value={wpName}
                  onChange={(e) => setWpName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('settings2.assignedBranch')}
                </label>
                <select
                  value={wpBranchId}
                  onChange={(e) => setWpBranchId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{tr('settings2.generalAllBranches')}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      🏢 {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('settings2.selectColor')}
                </label>
                <div className="grid grid-cols-7 gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                  {WP_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setWpColor(c)}
                      className={`h-7 rounded-lg transition-all flex items-center justify-center ${
                        wpColor.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-blue-600 scale-105' : 'hover:opacity-80'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {wpColor.toLowerCase() === c.toLowerCase() && (
                        <Check className="w-3.5 h-3.5 text-white" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsWpModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                >
                  {tr('settings2.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-500/20"
                >
                  {tr('settings2.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Filial qo‘shish / tahrirlash */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <span>{editingBranch ? tr('settings2.editBranch') : tr('settings2.addBranch')}</span>
              </h3>
              <button onClick={() => setIsBranchModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBranch} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('settings2.branchName')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={tr('settings2.eGChilonzorBranch')}
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {tr('settings2.branchAddress')}
                  </label>
                  <input
                    type="text"
                    placeholder={tr('settings2.chilonzor7Bld24')}
                    value={branchAddress}
                    onChange={(e) => setBranchAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {tr('settings2.branchPhone')}
                  </label>
                  <input
                    type="text"
                    placeholder="+998 71 200 00 00"
                    value={branchPhone}
                    onChange={(e) => setBranchPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('settings2.mapLinkGoogleYandex')}
                </label>
                <div className="relative">
                  <input
                    type="url"
                    placeholder="https://maps.google.com/?q=..."
                    value={branchLocationUrl}
                    onChange={(e) => setBranchLocationUrl(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                  />
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {tr('settings2.locationWillBeAttachedToSms')}
                </p>
              </div>

              {/* Telegram & WhatsApp integratsiyasi */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs block">
                  {tr('settings2.telegramWhatsappConnection')}
                </span>
                
                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer">
                    <input
                      type="radio"
                      name="tgMode"
                      checked={branchUseGlobalTg}
                      onChange={() => setBranchUseGlobalTg(true)}
                      className="mt-0.5 accent-blue-600"
                    />
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">
                        {tr('settings2.useGlobalClinicTelegramWhatsappAcc')}
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        {tr('settings2.messagesSentViaUnifiedClinicConnec')}
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer">
                    <input
                      type="radio"
                      name="tgMode"
                      checked={!branchUseGlobalTg}
                      onChange={() => setBranchUseGlobalTg(false)}
                      className="mt-0.5 accent-blue-600"
                    />
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">
                        {tr('settings2.dedicatedPhoneNumberForThisBranch')}
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        {tr('settings2.separateNumberUsedForThisBranch')}
                      </span>
                    </div>
                  </label>
                </div>

                {!branchUseGlobalTg && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-3 animate-in fade-in">
                    {/* Telegram alohida ulash qismi (SMS / Verification flow) */}
                    <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                          <Send className="w-3.5 h-3.5 text-sky-500" />
                          <span>{tr('settings2.branchTelegramSmsLink')}</span>
                        </label>
                        {branchTgStep === 'connected' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            {tr('settings2.connected2')}
                          </span>
                        )}
                      </div>

                      {/* Phone input with Send Code button */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="+998 90 123-45-67"
                          value={branchTgPhone}
                          onChange={(e) => {
                            setBranchTgPhone(e.target.value);
                            if (branchTgStep === 'connected') setBranchTgStep('idle');
                          }}
                          disabled={branchTgStep === 'code' || branchTgStep === 'password'}
                          className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                        />
                        {branchTgStep === 'connected' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setBranchTgStep('idle');
                              setBranchTgCode('');
                              setBranchTgError('');
                            }}
                            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer shrink-0"
                          >
                            {tr('settings2.change')}
                          </button>
                        ) : branchTgStep === 'idle' ? (
                          <button
                            type="button"
                            onClick={handleBranchTgSendCode}
                            disabled={branchTgSending || branchTgPhone.replace(/\D/g, '').length < 9}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                          >
                            {branchTgSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            <span>{tr('settings2.sendCode')}</span>
                          </button>
                        ) : null}
                      </div>

                      {/* Step 2: Code confirmation */}
                      {branchTgStep === 'code' && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-900 space-y-2.5 animate-in fade-in">
                          <div className="flex items-center justify-between text-xs text-blue-900 dark:text-blue-200">
                            <span className="font-semibold">
                              {tr('settings2.codeFromTelegramSms')}
                            </span>
                            <span className="text-[11px] font-mono text-blue-600 dark:text-sky-400 font-bold">
                              {branchTgCountdown > 0 ? `${branchTgCountdown}s` : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              maxLength={6}
                              placeholder="12345"
                              value={branchTgCode}
                              onChange={(e) => setBranchTgCode(e.target.value)}
                              className="w-32 px-3 py-2 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded-xl text-center text-sm font-black font-mono tracking-widest outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              type="button"
                              onClick={handleBranchTgConfirmCode}
                              disabled={branchTgSending || branchTgCode.trim().length < 4}
                              className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                            >
                              {branchTgSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              <span>{tr('settings2.confirmLink')}</span>
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-[11px] pt-1">
                            <button
                              type="button"
                              onClick={() => setBranchTgStep('idle')}
                              className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer"
                            >
                              {tr('settings2.reEnterPhone')}
                            </button>
                            {branchTgCountdown === 0 && (
                              <button
                                type="button"
                                onClick={handleBranchTgResendCode}
                                disabled={branchTgResending}
                                className="text-blue-600 dark:text-sky-400 hover:underline font-bold cursor-pointer"
                              >
                                {branchTgResending ? tr('settings2.sending') : tr('settings2.resendCode')}
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Step 3: 2FA Password if enabled */}
                      {branchTgStep === 'password' && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900 space-y-2.5 animate-in fade-in">
                          <span className="block text-xs font-semibold text-amber-900 dark:text-amber-200">
                            {tr('settings2.enter2faCloudPassword')}
                          </span>
                          <div className="flex items-center gap-2">
                            <input
                              type="password"
                              placeholder="••••••••"
                              value={branchTgPassword}
                              onChange={(e) => setBranchTgPassword(e.target.value)}
                              className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-amber-500"
                            />
                            <button
                              type="button"
                              onClick={handleBranchTgConfirmPassword}
                              disabled={branchTgSending || !branchTgPassword}
                              className="px-3 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                            >
                              {branchTgSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                              <span>{tr('settings2.signIn')}</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Error display */}
                      {branchTgError && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                          ⚠️ {branchTgError}
                        </p>
                      )}

                      {/* Connected Success Banner */}
                      {branchTgStep === 'connected' && (
                        <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>
                            {tr('settings2.branchSuccessfullyConnectedToThisT')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* WhatsApp alohida raqami */}
                    <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5">
                      <label className="block font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{tr('settings2.whatsappPhoneNumber')}</span>
                      </label>
                      <input
                        type="text"
                        placeholder="+998 90 123-45-67"
                        value={branchWaPhone}
                        onChange={(e) => setBranchWaPhone(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-[11px] text-slate-400">
                        {tr('settings2.whatsappMessagesSentFromThisBranch')}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* SMS sozlamasi */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={branchIncludeLocationSms}
                  onChange={(e) => setBranchIncludeLocationSms(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded"
                />
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">
                    {tr('settings2.includeBranchMapLinkInSms')}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    {tr('settings2.branchGeoLocationWillBeAppended')}
                  </span>
                </div>
              </label>

              {/* Faollik */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={branchIsActive}
                  onChange={(e) => setBranchIsActive(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block text-xs">
                    {tr('settings2.branchIsActive')}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    {tr('settings2.activeBranchAppearsInFiltersAnd')}
                  </span>
                </div>
              </label>

              {branchError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{branchError}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsBranchModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                >
                  {tr('settings2.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={branchSaving || !branchName.trim()}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold shadow-md shadow-blue-500/20 flex items-center gap-1.5"
                >
                  {branchSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>{tr('settings2.save')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Mutaxassislik qo‘shish */}
      {isSpecModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-blue-600" />
                <span>{tr('settings2.addSpecialty2')}</span>
              </h3>
              <button onClick={() => setIsSpecModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSpec} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {tr('settings2.specialtyName')} *
                </label>
                <input
                  type="text"
                  required
                  placeholder={tr('settings2.eGOrthodontistGnathologist')}
                  value={newSpecName}
                  onChange={(e) => setNewSpecName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSpecModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                >
                  {tr('settings2.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-500/20"
                >
                  {tr('settings2.add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHABLON tahrirlash oynasi */}
      {editTpl && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={() => setEditTpl(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-black text-sm flex items-center gap-2"><MessageSquareText className="w-5 h-5 text-blue-600" /> {tr('settings2.template')}</h3>
              <button onClick={() => setEditTpl(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">{tr('settings2.title')}</label>
                <input value={editTpl.title} onChange={(e) => setEditTpl({ ...editTpl, title: e.target.value })} placeholder={tr('settings2.eGAppointmentReminder')} className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-bold text-sm" />
              </div>

              {/* O'rniga qo'yiladigan joylar (placeholder) — fokusdagi maydonga qo'shiladi */}
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">{tr('settings2.insertPlaceholderIntoFocusedField')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {PLACEHOLDERS.map((ph) => (
                    <button key={ph.token} type="button" onClick={() => insertPlaceholder(ph.token)} className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 rounded-lg text-[11px] font-bold border border-blue-200 dark:border-blue-800 hover:bg-blue-100">
                      + {language === 'uz' ? ph.uz : language === 'en' ? ph.en : ph.ru} <span className="opacity-60 font-mono">{ph.token}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 3 til — kamida bitta til to‘ldirilishi yetarli */}
              {([['uz', 'O‘zbekcha'], ['ru', 'Русский'], ['en', 'English']] as const).map(([lng, lbl]) => (
                <div key={lng}>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">{lbl}</label>
                  <textarea
                    ref={tplRefs[lng]}
                    value={(editTpl as any)[lng]}
                    onFocus={() => setTplFocused(lng)}
                    onChange={(e) => setEditTpl({ ...editTpl, [lng]: e.target.value } as MsgTemplate)}
                    rows={3}
                    placeholder={`${lbl} matnini kiriting...`}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 text-sm resize-none"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setEditTpl(null)} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold">{tr('settings2.cancel')}</button>
              <button
                onClick={saveTpl}
                disabled={!editTpl.title.trim() || (!editTpl.uz.trim() && !editTpl.ru.trim() && !editTpl.en.trim())}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> {tr('settings2.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ULASH OYNASI: raqam → kod → ulandi */}
      {linkPlatform && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeLink}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {linkPlatform === 'telegram' ? <Send className="w-5 h-5 text-sky-500" /> : <Phone className="w-5 h-5 text-emerald-500" />}
                <h3 className="font-black text-sm">{platformName(linkPlatform)} {tr('settings2.linking')}</h3>
              </div>
              <button onClick={closeLink} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"><X className="w-4.5 h-4.5" /></button>
            </div>

            <div className="p-5 space-y-4">
              {step === 'phone' && (
                <>
                  {linkPlatform === 'telegram' && (
                    <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 gap-1 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => { setLinkMethod('phone'); setError(''); }}
                        className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition ${linkMethod === 'phone' ? 'bg-white dark:bg-slate-700 shadow-xs text-blue-600 dark:text-sky-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>{tr('settings2.number')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { startQrFlow(); setError(''); }}
                        className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition ${linkMethod === 'qr' ? 'bg-white dark:bg-slate-700 shadow-xs text-blue-600 dark:text-sky-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>{tr('settings2.qrCode')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setLinkMethod('bot'); setError(''); }}
                        className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition ${linkMethod === 'bot' ? 'bg-white dark:bg-slate-700 shadow-xs text-blue-600 dark:text-sky-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Bot</span>
                      </button>
                    </div>
                  )}

                  {linkMethod === 'phone' && (
                    <>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {tr('settings2.linkPhonePrompt').replace('{name}', platformName(linkPlatform))}
                      </p>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5">{tr('settings2.phoneNumber')}</label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+998 90 123 45 67"
                          className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-semibold"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                          {tr('settings2.example998901234567')}
                        </p>
                      </div>
                      {error && <p className="text-xs text-rose-500 font-semibold">{error}</p>}
                      <button
                        onClick={requestCode}
                        disabled={sending}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition"
                      >
                        {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> {tr('settings2.sending')}</> : tr('settings2.getCode')}
                      </button>
                    </>
                  )}

                  {linkMethod === 'qr' && (
                    <div className="space-y-3 text-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {tr('settings2.scanTheQrCodeInTelegram')}
                      </p>

                      <div className="flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl min-h-[220px]">
                        {qrLoading ? (
                          <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
                            <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
                            <span className="text-xs">{tr('settings2.generatingQr')}</span>
                          </div>
                        ) : qrUrl ? (
                          <div className="space-y-2">
                            {/* QR tasviri */}
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}&margin=10`}
                              alt="Telegram Login QR"
                              className="w-44 h-44 rounded-xl border border-slate-200 dark:border-slate-700 mx-auto shadow-xs"
                            />
                            <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-sky-600 dark:text-sky-400">
                              <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                              <span>{tr('settings2.waitingForScan')}</span>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={startQrFlow}
                            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
                          >
                            {tr('settings2.showQrCode')}
                          </button>
                        )}
                      </div>

                      {/* Ko'rsatma */}
                      <div className="text-left p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] space-y-1 text-slate-600 dark:text-slate-300">
                        <p className="font-bold text-slate-800 dark:text-slate-100">{tr('settings2.howToConnect')}</p>
                        <p>1. {tr('settings2.openTelegramOnPhone')}</p>
                        <p>2. {tr('settings2.settingsDevicesLinkDesktopDevice')}</p>
                        <p>3. {tr('settings2.pointCameraAtThisQrCode')}</p>
                      </div>

                      {error && <p className="text-xs text-rose-500 font-semibold">{error}</p>}

                      <button
                        type="button"
                        onClick={startQrFlow}
                        disabled={qrLoading}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{tr('settings2.refreshQr')}</span>
                      </button>
                    </div>
                  )}

                  {linkMethod === 'bot' && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {tr('settings2.enterBotTokenFromBotfatherTo')}
                      </p>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5">Bot Token</label>
                        <input
                          type="text"
                          value={botToken}
                          onChange={(e) => setBotToken(e.target.value)}
                          placeholder="1234567890:ABCdefGHIjklMNOpqr..."
                          className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-mono text-xs"
                        />
                      </div>
                      {error && <p className="text-xs text-rose-500 font-semibold">{error}</p>}
                      <button
                        onClick={handleBotLogin}
                        disabled={sending || !botToken.trim()}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition"
                      >
                        {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> {tr('settings2.connecting')}</> : tr('settings2.connectBot')}
                      </button>
                    </div>
                  )}
                </>
              )}

              {step === 'code' && (
                <>
                  {/* Kod yetkazilgan joy haqida aniq eslatma */}
                  <div className={`p-3 rounded-xl border text-xs space-y-1 ${codeSentType === 'app' ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200' : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'}`}>
                    <p className="font-bold flex items-center gap-1.5">
                      {codeSentType === 'app' ? '📲 Telegram ilovangizni tekshiring' : '📩 Telefon SMS xabarlarini tekshiring'}
                    </p>
                    <p className="text-[11px] opacity-90">
                      {codeSentType === 'app'
                        ? tr('settings2.codeSentTelegram')
                        : tr('settings2.codeSentSms').replace('{phone}', phone)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">{tr('settings2.confirmationCode5Digits')}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="— — — — —"
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-black text-center text-lg tracking-[0.4em]"
                    />
                  </div>

                  {error && <p className="text-xs text-rose-500 font-semibold">{error}</p>}

                  <button
                    onClick={confirmCode}
                    disabled={sending}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition shadow-sm"
                  >
                    {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> {tr('settings2.connecting')}</> : tr('settings2.confirmConnect')}
                  </button>

                  {/* Qayta yuborish / SMS so'rash tugmasi */}
                  <div className="flex items-center justify-between pt-1">
                    <button onClick={() => setStep('phone')} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-semibold">
                      {tr('settings2.changeNumber')}
                    </button>
                    <button
                      type="button"
                      onClick={handleResendCode}
                      disabled={countdown > 0 || resending}
                      className="text-xs font-bold text-blue-600 dark:text-sky-400 hover:underline disabled:text-slate-400 disabled:no-underline flex items-center gap-1"
                    >
                      {resending && <Loader2 className="w-3 h-3 animate-spin" />}
                      <span>
                        {countdown > 0
                          ? tr('settings2.resendIn').replace('{s}', String(countdown))
                          : tr('settings2.resendCodeSms')}
                      </span>
                    </button>
                  </div>
                </>
              )}

              {step === 'password' && (
                <>
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4" />
                      {tr('settings2.cloudPassword2fa')}
                    </p>
                    <p className="text-[11px] opacity-90">
                      {tr('settings2.twoStepVerificationIsEnabledOn')}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">{tr('settings2.telegramCloudPassword')}</label>
                    <input
                      type="password"
                      value={tfaPassword}
                      onChange={(e) => setTfaPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 font-semibold text-sm"
                    />
                  </div>
                  {error && <p className="text-xs text-rose-500 font-semibold">{error}</p>}
                  <button
                    onClick={confirmPassword}
                    disabled={sending}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition"
                  >
                    {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> {tr('settings2.connecting')}</> : tr('settings2.confirm')}
                  </button>
                  <button onClick={() => setStep('phone')} className="w-full text-xs text-slate-400 hover:text-slate-600 font-semibold">
                    {tr('settings2.back')}
                  </button>
                </>
              )}

              {step === 'done' && (
                <div className="text-center py-4 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center mx-auto">
                    <Check className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="font-black text-base">{tr('settings2.connected3')}</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {tr('settings2.linkConnected').replace('{name}', platformName(linkPlatform))}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-left">
                    <Smartphone className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-bold">{phone || 'Telegram'}</span>
                    <span className="ml-auto text-[10px] font-bold text-emerald-600 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> {tr('settings2.active')}</span>
                  </div>
                  <button onClick={closeLink} className="w-full py-2.5 bg-slate-900 dark:bg-slate-700 text-white rounded-xl text-sm font-bold">
                    {tr('settings2.close')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP CLOUD API CONFIG */}
      {showWaConfig && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowWaConfig(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-emerald-500" />
                <h3 className="font-black text-sm">WhatsApp Cloud API</h3>
              </div>
              <button onClick={() => setShowWaConfig(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"><X className="w-4.5 h-4.5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tr('settings2.enterValuesFromMetaDevelopersFaceb')}
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Phone Number ID</label>
                <input value={waPhoneId} onChange={(e) => setWaPhoneId(e.target.value)} placeholder="123456789012345" className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-emerald-500 font-mono text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Access Token {waHasToken && <span className="text-emerald-600 font-normal">({tr('settings2.savedLeaveEmpty')})</span>}</label>
                <input value={waToken} onChange={(e) => setWaToken(e.target.value)} placeholder={waHasToken ? '••••••••' : 'EAAG...'} className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-emerald-500 font-mono text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">Verify Token {tr('settings2.youChoose')}</label>
                <input value={waVerify} onChange={(e) => setWaVerify(e.target.value)} placeholder="dentos_verify" className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-emerald-500 font-mono text-sm" />
              </div>
              {/* Webhook URL — Meta dashboardга kiritiladi */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <p className="text-[11px] font-bold text-slate-500 mb-1">{tr('settings2.webhookUrlSetInMeta')}</p>
                <code className="text-[11px] break-all text-slate-700 dark:text-slate-300">{webhookUrl}</code>
                <p className="text-[10px] text-amber-600 mt-1">{tr('settings2.noteLocalhostIsNotPublicUse')}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setShowWaConfig(false)} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold">{tr('settings2.cancel')}</button>
              <button onClick={saveWaConfig} disabled={waSaving || !waPhoneId.trim()} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center gap-1.5">
                {waSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{tr('settings2.save')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
