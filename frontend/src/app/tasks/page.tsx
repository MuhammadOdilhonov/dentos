'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { clinicApi } from '../../lib/api';
import { ClinicTask, Employee, Patient, Branch } from '../../lib/types';
import { useI18n } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import {
  Plus,
  CheckCircle2,
  User,
  X,
  ExternalLink,
  Calendar,
  AlertCircle,
  Lock,
  Trash2,
  Edit3,
  Clock,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  TrendingUp,
  BarChart2,
  Building2,
  Users,
  MapPin,
  ListTodo,
  CheckSquare
} from 'lucide-react';

export default function TasksPage() {
  const { t, tr } = useI18n();
  const { user } = useAuth();

  const isDirector = user?.role === 'director' || user?.role === 'superadmin' || user?.role === 'deputy_director';

  const [tasks, setTasks] = useState<ClinicTask[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<number | 'all'>('all');
  const [viewMode, setViewMode] = useState<'board' | 'analytics'>('board');

  const [filter, setFilter] = useState<'all' | 'my' | 'director_tasks' | 'patients' | 'pending' | 'completed'>('all');
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form states for creating a new task
  const [newTitle, setNewTitle] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newAssignee, setNewAssignee] = useState<string>('');
  const [newPatientId, setNewPatientId] = useState<string>('');
  const [newBranchId, setNewBranchId] = useState<string>('1');
  const [newDueDate, setNewDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newStage, setNewStage] = useState<'new' | 'in_progress' | 'review' | 'completed'>('new');

  // Form states for editing a task (Director / Owner)
  const [editingTask, setEditingTask] = useState<ClinicTask | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [editAssignee, setEditAssignee] = useState<string>('');
  const [editPatientId, setEditPatientId] = useState<string>('');
  const [editBranchId, setEditBranchId] = useState<string>('1');
  const [editDueDate, setEditDueDate] = useState<string>('');
  const [editStage, setEditStage] = useState<'new' | 'in_progress' | 'review' | 'completed'>('in_progress');

  const loadAll = async () => {
    const [tsk, emp, pat, brs] = await Promise.all([
      clinicApi.getTasks(),
      clinicApi.getEmployees(),
      clinicApi.getPatients(),
      clinicApi.getBranches()
    ]);
    setTasks(tsk);
    setEmployees(emp);
    setPatients(pat);
    setBranches(brs || []);
    if (emp.length > 0) {
      const currentEmp = emp.find(
        (e) =>
          (user?.username && e.username === user.username) ||
          (user?.name && e.full_name.toLowerCase().includes(user.name.toLowerCase()))
      );
      setNewAssignee(currentEmp ? currentEmp.id.toString() : emp[0].id.toString());
      if (currentEmp?.branch) setNewBranchId(currentEmp.branch.toString());
    }
  };

  useEffect(() => {
    loadAll();
  }, [user]);

  // Director kirsa srazi samaradorlik ochilsin, o'rinbosar kirsa vazifa berish ochilsin
  useEffect(() => {
    if (!user) return;
    if (user.role === 'director' || user.role === 'superadmin') {
      setViewMode('analytics');
    } else if (user.role === 'deputy_director') {
      setViewMode('board');
      setIsAddOpen(true);
    }
  }, [user?.role]);

  // Check if a task belongs to the currently logged in doctor/user
  const isTaskOwner = (task: ClinicTask): boolean => {
    if (!user) return false;
    const currentUserId = String(user.id);
    const currentUserName = user.name?.toLowerCase().trim() || '';
    const currentUsername = user.username?.toLowerCase().trim() || '';

    // Direct ID match
    if (task.assignee !== undefined && String(task.assignee) === currentUserId) return true;
    if (task.creator !== undefined && String(task.creator) === currentUserId) return true;

    // Match by employees list
    const myEmp = employees.find(
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
      if (task.assignee_name && myEmp.full_name && (
        task.assignee_name.toLowerCase().includes(myEmp.full_name.toLowerCase()) ||
        myEmp.full_name.toLowerCase().includes(task.assignee_name.toLowerCase())
      )) return true;
    }

    // Name match
    if (task.assignee_name && currentUserName && (
      task.assignee_name.toLowerCase().includes(currentUserName) ||
      currentUserName.includes(task.assignee_name.toLowerCase())
    )) return true;

    if (task.creator_name && currentUserName && (
      task.creator_name.toLowerCase().includes(currentUserName) ||
      currentUserName.includes(task.creator_name.toLowerCase())
    )) return true;

    return false;
  };

  // Director can modify ANY task; Doctors can modify only tasks assigned to them / owned by them
  const canModifyTask = (task: ClinicTask): boolean => {
    if (!user) return false;
    if (isDirector) return true;
    return isTaskOwner(task);
  };

  const isTaskAssignedToMe = (task: ClinicTask): boolean => {
    if (!user) return false;
    const currentUserId = String(user.id);
    const currentUserName = user.name?.toLowerCase().trim() || '';
    const currentUsername = user.username?.toLowerCase().trim() || '';

    if (task.assignee !== undefined && String(task.assignee) === currentUserId) return true;
    if (task.assignee_name && currentUserName && (
      task.assignee_name.toLowerCase().includes(currentUserName) ||
      currentUserName.includes(task.assignee_name.toLowerCase())
    )) return true;

    const myEmp = employees.find(
      (e) =>
        (e.username && e.username.toLowerCase() === currentUsername) ||
        (e.full_name && currentUserName && e.full_name.toLowerCase().includes(currentUserName)) ||
        String(e.id) === currentUserId
    );
    if (myEmp && task.assignee !== undefined && String(task.assignee) === String(myEmp.id)) return true;

    return false;
  };

  const isTaskFromDirector = (task: ClinicTask): boolean => {
    if (task.creator_role === 'director' || task.creator_role === 'superadmin') return true;
    const cName = (task.creator_name || '').toLowerCase();
    return cName.includes('director') || cName.includes('direktor') || cName.includes('usmonov');
  };

  // Toggle status with audit logging (who completed and when)
  const toggleTaskStatus = async (id: number, currentStatus: string, taskItem: ClinicTask) => {
    if (!canModifyTask(taskItem)) {
      alert("Ushbu vazifa boshqa xodimga biriktirilgan. Siz faqat o'zingizning vazifalaringiz statusini o'zgartira olasiz!");
      return;
    }
    const nextStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    const nowFormatted = new Date().toLocaleString('uz-UZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const patch: Partial<ClinicTask> = {
      status: nextStatus,
      stage: nextStatus === 'completed' ? 'completed' : 'in_progress',
      completed_by: nextStatus === 'completed' ? user?.id : undefined,
      completed_by_name: nextStatus === 'completed' ? (user?.name || (user?.role === 'doctor' ? 'Shifokor' : 'Direktor')) : undefined,
      completed_at: nextStatus === 'completed' ? nowFormatted : undefined
    };

    setTasks((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
    await clinicApi.updateTask(id, patch);
  };

  // Director or Assignee can update the stage (Yangi -> Jarayonda -> Tekshiruvda -> Bajarildi)
  const handleUpdateTaskStage = async (id: number, newStage: 'new' | 'in_progress' | 'review' | 'completed', taskItem: ClinicTask) => {
    if (!canModifyTask(taskItem)) {
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
      completed_by_name: isDone ? (user?.name || 'Direktor') : undefined,
      completed_at: isDone ? nowFormatted : undefined
    };

    setTasks((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
    await clinicApi.updateTask(id, patch);
  };

  const handleDeleteTask = async (id: number, taskItem: ClinicTask) => {
    if (!canModifyTask(taskItem)) {
      alert("Siz faqat o'zingizning vazifalaringizni o'chira olasiz!");
      return;
    }
    setTasks((prev) => prev.filter((item) => item.id !== id));
    await clinicApi.deleteTask(id);
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const emp = employees.find((e) => e.id.toString() === newAssignee);
    const pat = patients.find((p) => p.id.toString() === newPatientId);

    const creatorDisplayName = user?.name
      ? `${user.name}${isDirector ? ' (Direktor)' : ''}`
      : isDirector ? 'Direktorat' : 'Shifokor';

    const bId = newBranchId ? Number(newBranchId) : (emp?.branch || 1);
    const bObj = branches.find((b) => b.id === bId);

    const taskPayload: Omit<ClinicTask, 'id'> = {
      title: newTitle.trim(),
      description: newNote.trim(),
      priority: newPriority,
      status: newStage === 'completed' ? 'completed' : 'pending',
      stage: newStage,
      assignee: emp ? emp.id : undefined,
      assignee_name: emp ? emp.full_name : (user?.name || 'Xodim'),
      creator: user?.id ? Number(user.id) : undefined,
      creator_name: creatorDisplayName,
      creator_role: user?.role || (isDirector ? 'director' : 'doctor'),
      patient: pat ? pat.id : undefined,
      patient_name: pat ? pat.full_name : undefined,
      due_date: newDueDate || new Date().toISOString().split('T')[0],
      start_date: new Date().toISOString().split('T')[0],
      task_type: pat ? 'treatment' : 'general',
      service: newTitle.trim(),
      branch: bId,
      branch_name: bObj?.name || 'Toshkent Markaziy'
    };

    const created = await clinicApi.createTask(taskPayload);
    setTasks((prev) => [created, ...prev]);

    setNewTitle('');
    setNewNote('');
    setNewPatientId('');
    setNewStage('new');
    setIsAddOpen(false);
  };

  const openEditModal = (task: ClinicTask) => {
    setEditingTask(task);
    setEditTitle(task.title || '');
    setEditNote(task.description || '');
    setEditPriority(task.priority || 'medium');
    setEditAssignee(task.assignee ? task.assignee.toString() : '');
    setEditPatientId(task.patient ? task.patient.toString() : '');
    setEditBranchId(task.branch ? task.branch.toString() : '1');
    setEditDueDate(task.due_date || '');
    setEditStage(task.stage || (task.status === 'completed' ? 'completed' : 'in_progress'));
  };

  const handleSaveEditTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !editTitle.trim()) return;

    const emp = employees.find((e) => e.id.toString() === editAssignee);
    const pat = patients.find((p) => p.id.toString() === editPatientId);
    const bId = editBranchId ? Number(editBranchId) : (editingTask.branch || 1);
    const bObj = branches.find((b) => b.id === bId);
    const isDone = editStage === 'completed';
    const nowFormatted = new Date().toLocaleString('uz-UZ', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const patch: Partial<ClinicTask> = {
      title: editTitle.trim(),
      description: editNote.trim(),
      priority: editPriority,
      stage: editStage,
      status: isDone ? 'completed' : 'pending',
      assignee: emp ? emp.id : editingTask.assignee,
      assignee_name: emp ? emp.full_name : editingTask.assignee_name,
      patient: pat ? pat.id : editingTask.patient,
      patient_name: pat ? pat.full_name : editingTask.patient_name,
      branch: bId,
      branch_name: bObj?.name || editingTask.branch_name || 'Toshkent Markaziy',
      due_date: editDueDate || editingTask.due_date,
      completed_by: isDone ? (editingTask.completed_by || user?.id) : undefined,
      completed_by_name: isDone ? (editingTask.completed_by_name || user?.name || (isDirector ? 'Direktor' : 'Shifokor')) : undefined,
      completed_at: isDone ? (editingTask.completed_at || nowFormatted) : undefined
    };

    setTasks((prev) =>
      prev.map((item) => (item.id === editingTask.id ? { ...item, ...patch } : item))
    );
    await clinicApi.updateTask(editingTask.id, patch);
    setEditingTask(null);
  };

  // Filtered tasks based on active tab and selected branch
  const filtered = useMemo(() => {
    return tasks.filter((item) => {
      // Branch filter
      if (selectedBranchId !== 'all') {
        const itemBranch = item.branch || employees.find((e) => e.id === item.assignee)?.branch;
        if (itemBranch !== selectedBranchId) return false;
      }

      if (filter === 'all') return true;
      if (filter === 'pending') return item.status === 'pending';
      if (filter === 'completed') return item.status === 'completed';
      if (filter === 'patients') return Boolean(item.patient || item.patient_name);
      if (filter === 'director_tasks') return isTaskFromDirector(item);
      if (filter === 'my') {
        if (isDirector) {
          return isTaskFromDirector(item) || isTaskAssignedToMe(item);
        }
        return isTaskAssignedToMe(item);
      }
      return true;
    });
  }, [tasks, filter, selectedBranchId, user, employees, isDirector]);

  // Analytics computations for director / deputy / management
  const analyticsData = useMemo(() => {
    const list = selectedBranchId === 'all'
      ? tasks
      : tasks.filter((t) => (t.branch === selectedBranchId || (employees.find((e) => e.id === t.assignee)?.branch === selectedBranchId)));

    const total = list.length;
    const completed = list.filter((t) => t.status === 'completed').length;
    const todayStr = new Date().toISOString().split('T')[0];
    const overdue = list.filter((t) => t.status !== 'completed' && t.due_date && t.due_date < todayStr).length;
    const inProgress = list.filter((t) => t.status !== 'completed' && (!t.due_date || t.due_date >= todayStr)).length;
    const kpiRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Per-employee efficiency & KPI ranking
    const relevantEmps = selectedBranchId === 'all'
      ? employees
      : employees.filter((e) => e.branch === selectedBranchId);

    const empStats = relevantEmps.map((emp) => {
      const empTasks = list.filter(
        (t) =>
          t.assignee === emp.id ||
          (t.assignee_name && emp.full_name && t.assignee_name.toLowerCase().includes(emp.full_name.toLowerCase()))
      );
      const empCompleted = empTasks.filter((t) => t.status === 'completed').length;
      const empOverdue = empTasks.filter((t) => t.status !== 'completed' && t.due_date && t.due_date < todayStr).length;
      const empPending = empTasks.filter((t) => t.status !== 'completed').length;
      const empKpi = empTasks.length > 0 ? Math.round((empCompleted / empTasks.length) * 100) : 100;

      const br = branches.find((b) => b.id === emp.branch);
      return {
        id: emp.id,
        name: emp.full_name,
        role: emp.role,
        specialty: emp.specialty,
        branchName: emp.branch_name || br?.name || 'Toshkent Markaziy',
        color: emp.color || '#0EA5E9',
        total: empTasks.length,
        completed: empCompleted,
        pending: empPending,
        overdue: empOverdue,
        kpi: empKpi
      };
    }).sort((a, b) => b.total - a.total);

    // Delegation flow: who assigned what to whom
    const delegationList = list.map((t) => {
      const bObj = branches.find((b) => b.id === t.branch);
      const isOverdue = t.status !== 'completed' && t.due_date && t.due_date < todayStr;
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        creator: t.creator_name || (t.creator_role === 'director' ? 'Direktor Usmanov' : 'Admin'),
        creatorRole: t.creator_role || 'director',
        assignee: t.assignee_name || 'Barcha xodimlar',
        branchName: t.branch_name || bObj?.name || 'Toshkent Markaziy',
        dueDate: t.due_date || 'Muddatsiz',
        stage: t.stage || (t.status === 'completed' ? 'completed' : 'in_progress'),
        status: t.status,
        isOverdue,
        completedAt: t.completed_at,
        completedBy: t.completed_by_name
      };
    });

    return {
      total,
      completed,
      inProgress,
      overdue,
      kpiRate,
      empStats,
      delegationList
    };
  }, [tasks, selectedBranchId, employees, branches]);

  const pendingCount = filtered.filter((item) => item.status === 'pending').length;
  const myTotalCount = filtered.filter((item) => {
    if (isDirector) return isTaskFromDirector(item) || isTaskAssignedToMe(item);
    return isTaskAssignedToMe(item);
  }).length;
  const directorTasksCount = filtered.filter((item) => isTaskFromDirector(item)).length;
  const patientsTasksCount = filtered.filter((item) => Boolean(item.patient || item.patient_name)).length;
  const completedCount = filtered.filter((item) => item.status === 'completed').length;

  // ── DOCTOR SPECIFIC VIEW STATES & FILTERING ──
  const [doctorActiveTab, setDoctorActiveTab] = useState<'todo' | 'overdue' | 'completed'>('todo');
  const todayDateStr = new Date().toISOString().split('T')[0];

  const doctorTasks = useMemo(() => {
    const myTasks = tasks.filter((t) => isTaskOwner(t) || isTaskAssignedToMe(t));
    return myTasks.length > 0 ? myTasks : tasks;
  }, [tasks, employees, user]);

  const doctorTodoTasks = useMemo(() => {
    return doctorTasks.filter((t) => t.status !== 'completed' && (!t.due_date || t.due_date >= todayDateStr));
  }, [doctorTasks, todayDateStr]);

  const doctorOverdueTasks = useMemo(() => {
    return doctorTasks.filter((t) => t.status !== 'completed' && t.due_date && t.due_date < todayDateStr);
  }, [doctorTasks, todayDateStr]);

  const doctorCompletedTasks = useMemo(() => {
    return doctorTasks.filter((t) => t.status === 'completed');
  }, [doctorTasks]);

  // If user is a Doctor (not director/superadmin), render clean, focused doctor view
  if (!isDirector) {
    const activeDoctorList =
      doctorActiveTab === 'todo'
        ? doctorTodoTasks
        : doctorActiveTab === 'overdue'
        ? doctorOverdueTasks
        : doctorCompletedTasks;

    return (
      <div className="space-y-6 text-slate-900 dark:text-white transition-colors max-w-5xl mx-auto pb-16">
        {/* Clean Doctor Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#0F172A] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Mening vazifalarim
              </h1>
              <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-bold shadow-xs">
                {doctorTodoTasks.length} ta bajarilishi kerak
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
              Bajarishingiz kerak bo‘lgan, kechikayotgan va yakunlangan klinik vazifalar
            </p>
          </div>

          <button
            onClick={() => {
              setNewTitle('');
              setNewNote('');
              setNewPatientId('');
              setNewStage('new');
              setIsAddOpen(true);
            }}
            className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/20 active:scale-95 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>+ Yangi vazifa qo‘shish</span>
          </button>
        </div>

        {/* 3 Clean Doctor Tabs */}
        <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setDoctorActiveTab('todo')}
            className={`flex items-center justify-center space-x-2 py-3 px-3 rounded-xl text-xs font-bold transition ${
              doctorActiveTab === 'todo'
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-sky-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ListTodo className="w-4 h-4 text-blue-500" />
            <span>📌 Bajarilishi kerak ({doctorTodoTasks.length})</span>
          </button>

          <button
            onClick={() => setDoctorActiveTab('overdue')}
            className={`flex items-center justify-center space-x-2 py-3 px-3 rounded-xl text-xs font-bold transition ${
              doctorActiveTab === 'overdue'
                ? 'bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 shadow-sm border border-rose-200 dark:border-rose-800/60'
                : 'text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400'
            }`}
          >
            <AlertCircle className="w-4 h-4 text-rose-500" />
            <span>⚠️ Kechikayotgan / O‘tib ketgan ({doctorOverdueTasks.length})</span>
          </button>

          <button
            onClick={() => setDoctorActiveTab('completed')}
            className={`flex items-center justify-center space-x-2 py-3 px-3 rounded-xl text-xs font-bold transition ${
              doctorActiveTab === 'completed'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>✅ Yakunlangan ({doctorCompletedTasks.length})</span>
          </button>
        </div>

        {/* Doctor Task List Cards */}
        <div className="space-y-3">
          {activeDoctorList.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-[#0F172A] rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400">
              <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mx-auto mb-2" />
              <p className="font-bold text-sm text-slate-700 dark:text-slate-300">
                {doctorActiveTab === 'todo'
                  ? 'Bajarilishi kerak bo‘lgan vazifalar mavjud emas'
                  : doctorActiveTab === 'overdue'
                  ? 'Kechikayotgan vazifalar yo‘q! Barcha ishlar o‘z vaqtida bajarilgan.'
                  : 'Yakunlangan vazifalar mavjud emas'}
              </p>
            </div>
          ) : (
            activeDoctorList.map((item) => {
              const isDone = item.status === 'completed';
              const isOverdue = !isDone && item.due_date && item.due_date < todayDateStr;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border transition shadow-xs flex items-start gap-4 ${
                    isDone
                      ? 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800/80 opacity-75'
                      : isOverdue
                      ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40'
                      : 'bg-white dark:bg-[#0F172A] border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600'
                  }`}
                >
                  {/* One-click Checkbox to Complete Task */}
                  <button
                    onClick={() => toggleTaskStatus(item.id, item.status, item)}
                    className={`mt-1 w-6 h-6 rounded-lg border flex items-center justify-center transition shrink-0 ${
                      isDone
                        ? 'bg-emerald-500 border-emerald-500 text-white shadow-xs'
                        : 'border-slate-300 dark:border-slate-600 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                    }`}
                    title={isDone ? 'Qayta tiklash' : 'Bajarildi deb belgilash'}
                  >
                    {isDone && <CheckSquare className="w-4 h-4" />}
                  </button>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        className={`text-sm font-bold ${
                          isDone
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {item.title}
                      </h3>

                      {item.priority === 'high' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300">
                          Shoshilinch
                        </span>
                      )}

                      {isOverdue && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white animate-pulse">
                          Muddati o‘tgan
                        </span>
                      )}

                      {item.patient_name && (
                        <Link
                          href={`/patients/${item.patient || ''}`}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-sky-300 border border-blue-200 dark:border-blue-800 hover:underline flex items-center gap-1"
                        >
                          <User className="w-3 h-3" />
                          <span>Bemor: {item.patient_name}</span>
                        </Link>
                      )}
                    </div>

                    {item.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 whitespace-pre-line">
                        {item.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 mt-2.5 text-[11px] text-slate-400">
                      {item.due_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Muddat: {item.due_date}</span>
                        </span>
                      )}

                      {item.creator_name && (
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          <span>Topshiriq beruvchi: {item.creator_name}</span>
                        </span>
                      )}

                      {isDone && item.completed_at && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          Bajarilgan vaqt: {item.completed_at}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(item)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      title={tr('common.edit')}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {canModifyTask(item) && (
                      <button
                        onClick={() => handleDeleteTask(item.id, item)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                        title={tr('common.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal for adding a task */}
        {isAddOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 space-y-4 border border-slate-200 dark:border-slate-800 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Yangi vazifa qo‘shish
                </h3>
                <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddTask} className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Vazifa nomi: *</label>
                  <input
                    type="text"
                    required
                    placeholder="masalan: 16-tish plombalash yoki konsultatsiya"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Bemor (ixtiyoriy):</label>
                  <select
                    value={newPatientId}
                    onChange={(e) => setNewPatientId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                  >
                    <option value="">-- Bemorga bog‘lanmagan --</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id.toString()}>
                        {p.full_name} ({p.phone || 'Tel yo‘q'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Muhimlik:</label>
                    <select
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value as any)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                    >
                      <option value="low">{tr('tasks.low')}</option>
                      <option value="medium">{tr('tasks.medium')}</option>
                      <option value="high">{tr('tasks.urgent')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Bajarish muddati:</label>
                    <input
                      type="date"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Izoh / Ko‘rsatma:</label>
                  <textarea
                    rows={3}
                    placeholder={tr('tasks.phMoreDetails')}
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-none font-medium text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(false)}
                    className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition shadow-md shadow-blue-500/20 active:scale-95"
                  >
                    Saqlash
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal for editing task */}
        {editingTask && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 space-y-4 border border-slate-200 dark:border-slate-800 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Vazifani tahrirlash
                </h3>
                <button onClick={() => setEditingTask(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEditTask} className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Vazifa nomi: *</label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Muhimlik:</label>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as any)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                    >
                      <option value="low">{tr('tasks.low')}</option>
                      <option value="medium">{tr('tasks.medium')}</option>
                      <option value="high">{tr('tasks.urgent')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Muddat:</label>
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Izoh / Ko‘rsatma:</label>
                  <textarea
                    rows={3}
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-none font-medium text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditingTask(null)}
                    className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition shadow-md shadow-blue-500/20 active:scale-95"
                  >
                    O‘zgarishlarni saqlash
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── DIRECTOR VIEW (Full director analytics, KPIs, delegation flow, and settings) ──
  return (
    <div className="space-y-6 text-slate-900 dark:text-white transition-colors max-w-[1600px] mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {isDirector ? 'Direktor topshiriqlari va Klinika vazifalar nazorati' : 'Mening vazifalarim va Bemorlar rejasi'}
            </h1>
            <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-black shadow-xs">
              {pendingCount} ta jarayonda
            </span>
            {isDirector && (
              <span className="px-3 py-1 bg-purple-600 text-white rounded-full text-xs font-black shadow-xs flex items-center space-x-1">
                <Sparkles className="w-3 h-3" />
                <span>{tr('tasks.directorControl')}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Vazifani kim berganligi, ijrochisi, samaradorlik tahlili va filiallar kesimida ijro intizomi
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Mode Toggle: Board vs Analytics */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('board')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                viewMode === 'board'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ListTodo className="w-3.5 h-3.5" />
              <span>{tr('tasks.tasksTitle')}</span>
            </button>
            <button
              onClick={() => setViewMode('analytics')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                viewMode === 'analytics'
                  ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>{tr('tasks.perfAnalytics')}</span>
            </button>
          </div>

          {/* Branch Filter Selector */}
          <div className="relative">
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 shadow-xs outline-none cursor-pointer"
            >
              <option value="all">🏢 Barcha filiallar</option>
              {(branches.length > 0 ? branches : [
                { id: 1, name: 'Toshkent Markaziy' },
                { id: 2, name: 'Chilonzor' },
                { id: 3, name: 'Yunusobod' }
              ]).map((b) => (
                <option key={b.id} value={b.id}>
                  🏢 {b.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              setNewTitle('');
              setNewNote('');
              setNewPatientId('');
              setNewStage('new');
              setIsAddOpen(true);
            }}
            className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-500/20 active:scale-95 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>+ {isDirector ? 'Topshiriq / Vazifa berish' : 'Yangi vazifa qo‘shish'}</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: ANALYTICS & EFFICIENCY VIEW */}
      {viewMode === 'analytics' ? (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{tr('tasks.totalTasks')}</p>
                <h3 className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-1">
                  {analyticsData.total} <span className="text-xs font-medium text-slate-400">{tr('tasks.count')}</span>
                </h3>
                <span className="text-[11px] text-slate-500 font-medium">{tr('tasks.allBranches')}</span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 flex items-center justify-center">
                <CheckSquare className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{tr('tasks.completedPerf')}</p>
                <h3 className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                  {analyticsData.completed} <span className="text-xs font-bold text-emerald-500">({analyticsData.kpiRate}%)</span>
                </h3>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">{tr('tasks.highDiscipline')}</span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{tr('tasks.inProgressReview')}</p>
                <h3 className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400 mt-1">
                  {analyticsData.inProgress} <span className="text-xs font-medium text-slate-400">{tr('tasks.count')}</span>
                </h3>
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">{tr('tasks.activeTasks')}</span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{tr('tasks.overdue')}</p>
                <h3 className="text-2xl font-black font-mono text-rose-600 dark:text-rose-400 mt-1">
                  {analyticsData.overdue} <span className="text-xs font-medium text-slate-400">{tr('tasks.count')}</span>
                </h3>
                <span className="text-[11px] text-rose-500 font-medium">{tr('tasks.needsAttention')}</span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <ShieldAlert className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Section 1: Delegation Flow ("Kim nima ish buyuryapti") */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center space-x-2">
                  <Users className="w-5 h-5 text-blue-600 dark:text-sky-400" />
                  <span>{tr('tasks.flowTitle')}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Rahbarlar va shifokorlar tomonidan berilgan barcha topshiriqlarning ijro trayektoriyasi
                </p>
              </div>
              <span className="text-xs font-bold text-slate-400">
                {analyticsData.delegationList.length} ta topshiriq
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-400">
                  <tr>
                    <th className="py-3.5 px-4">{tr('tasks.assignerLeader')}</th>
                    <th className="py-3.5 px-4">{tr('tasks.assignee')}</th>
                    <th className="py-3.5 px-4">{tr('tasks.branch')}</th>
                    <th className="py-3.5 px-4">{tr('tasks.taskTitle')}</th>
                    <th className="py-3.5 px-4">{tr('tasks.deadline')}</th>
                    <th className="py-3.5 px-4">{tr('tasks.statusStage')}</th>
                    <th className="py-3.5 px-4 text-right">{tr('tasks.confirmFinish')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {analyticsData.delegationList.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center space-x-2">
                          <span className="w-7 h-7 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold flex items-center justify-center text-xs">
                            👑
                          </span>
                          <div>
                            <p>{item.creator}</p>
                            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold capitalize">
                              {item.creatorRole === 'director' ? 'Boshqaruv' : item.creatorRole}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-800 dark:text-slate-200 font-medium">
                        <div className="flex items-center space-x-2">
                          <User className="w-4 h-4 text-blue-500" />
                          <span>{item.assignee}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-sky-300">
                          <MapPin className="w-3 h-3 text-blue-500" />
                          {item.branchName}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900 dark:text-white">{item.title}</p>
                        {item.description && (
                          <p className="text-[11px] text-slate-400 truncate max-w-xs">{item.description}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-600 dark:text-slate-300">
                        {item.dueDate}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                            item.status === 'completed'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                              : item.isOverdue
                              ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {item.status === 'completed'
                            ? 'Bajarildi'
                            : item.isOverdue
                            ? 'Muddati o‘tgan'
                            : item.stage === 'review'
                            ? 'Tekshiruvda'
                            : 'Jarayonda'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-[11px] font-medium text-slate-500">
                        {item.completedBy ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                            ✓ {item.completedBy}
                          </span>
                        ) : (
                          <span className="text-slate-400">{tr('tasks.pending')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {analyticsData.delegationList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Topshiriqlar mavjud emas
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Employee Performance & KPI Ranking Table */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center space-x-2">
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                  <span>{tr('tasks.staffKpiRating')}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Har bir shifokor va xodimning yuklatilgan vazifalarni bajarish ko‘rsatkichi va intizomi
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-400">
                  <tr>
                    <th className="py-3.5 px-4">{tr('tasks.staffPosition')}</th>
                    <th className="py-3.5 px-4">{tr('tasks.branch')}</th>
                    <th className="py-3.5 px-4 text-center">{tr('tasks.totalTasks')}</th>
                    <th className="py-3.5 px-4 text-center text-emerald-600 dark:text-emerald-400 font-bold">{tr('tasks.completed')}</th>
                    <th className="py-3.5 px-4 text-center text-amber-600 dark:text-amber-400 font-bold">{tr('tasks.inProgress')}</th>
                    <th className="py-3.5 px-4 text-center text-rose-600 dark:text-rose-400 font-bold">{tr('tasks.late')}</th>
                    <th className="py-3.5 px-4 text-right">{tr('tasks.perfKpi')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {analyticsData.empStats.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs"
                            style={{ backgroundColor: emp.color }}
                          >
                            {emp.name.split(' ')[1]?.[0] || emp.name[0] || 'X'}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{emp.name}</p>
                            <p className="text-[11px] text-slate-400">{emp.specialty || emp.role}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {emp.branchName}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-900 dark:text-white font-mono">
                        {emp.total}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        {emp.completed}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-amber-600 dark:text-amber-400 font-mono">
                        {emp.pending}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-rose-600 dark:text-rose-400 font-mono">
                        {emp.overdue}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <div className="w-24 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                emp.kpi >= 80 ? 'bg-emerald-500' : emp.kpi >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                              }`}
                              style={{ width: `${emp.kpi}%` }}
                            />
                          </div>
                          <span
                            className={`font-black font-mono text-xs ${
                              emp.kpi >= 80
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : emp.kpi >= 50
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {emp.kpi}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* VIEW 2: STANDARD TASK BOARD & FILTER PILLS */
        <>
          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs w-fit">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                filter === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Barchasi ({tasks.length})
            </button>

            <button
              onClick={() => setFilter('my')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                filter === 'my'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Mening vazifalarim ({myTotalCount})
            </button>

            <button
              onClick={() => setFilter('director_tasks')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                filter === 'director_tasks'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Direktor topshiriqlari ({directorTasksCount})
            </button>

            <button
              onClick={() => setFilter('patients')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                filter === 'patients'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Bemorlar vazifalari ({patientsTasksCount})
            </button>

            <button
              onClick={() => setFilter('pending')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                filter === 'pending'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Jarayonda ({pendingCount})
            </button>

            <button
              onClick={() => setFilter('completed')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                filter === 'completed'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Bajarilgan ({completedCount})
            </button>
          </div>

      {/* Tasks List */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <CheckCircle2 className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-semibold">{tr('tasks.noTasks')}</p>
          </div>
        ) : (
          filtered.map((task) => {
            const isOwner = isTaskOwner(task);
            const canEdit = canModifyTask(task);
            const fromDirector = isTaskFromDirector(task);

            return (
              <div
                key={task.id}
                className={`p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition ${
                  task.status === 'completed' ? 'bg-slate-50/60 dark:bg-slate-800/30' : ''
                }`}
              >
                <div className="flex items-start space-x-3.5 min-w-0 flex-1">
                  {/* Status Toggle Button */}
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => toggleTaskStatus(task.id, task.status, task)}
                      className={`w-6 h-6 rounded-lg border flex items-center justify-center transition flex-shrink-0 mt-1 ${
                        task.status === 'completed'
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-slate-300 dark:border-slate-600 hover:border-blue-500 bg-white dark:bg-slate-800'
                      }`}
                      title={task.status === 'completed' ? 'Qayta faollashtirish' : 'Bajarildi deb belgilash'}
                    >
                      {task.status === 'completed' && <CheckCircle2 className="w-4 h-4" />}
                    </button>
                  ) : (
                    <div className="relative group flex-shrink-0 mt-1">
                      <button
                        type="button"
                        disabled
                        className="w-6 h-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-400 opacity-60 cursor-not-allowed flex items-center justify-center"
                        title={`Faqat biriktirilgan xodim (${task.assignee_name}) o'zgartira oladi`}
                      >
                        <Lock className="w-3 h-3" />
                      </button>
                      <div className="pointer-events-none absolute -bottom-7 left-0 opacity-0 group-hover:opacity-100 transition-all z-30 px-2 py-0.5 bg-slate-900 text-white text-[10px] rounded shadow-md whitespace-nowrap">
                        Faqat {task.assignee_name} o'zgartira oladi
                      </div>
                    </div>
                  )}

                  <div className="min-w-0 space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`text-sm font-bold text-slate-900 dark:text-white ${
                          task.status === 'completed' ? 'line-through text-slate-400 dark:text-slate-500' : ''
                        }`}
                      >
                        {task.title}
                      </p>

                      {fromDirector && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                          👑 Direktor topshirig‘i
                        </span>
                      )}

                      {task.task_type && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {task.task_type === 'treatment' ? 'Muolaja' : task.task_type === 'reminder' ? 'Eslatma' : 'Umumiy'}
                        </span>
                      )}

                      {isOwner && !isDirector && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          Sizga biriktirilgan
                        </span>
                      )}
                    </div>

                    {task.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    {/* Metadata & Audit Information */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                      {/* Topshiruvchi (Kim bergan) */}
                      <span className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                        <span className="text-slate-400">Topshirdi:</span>
                        <strong className="text-slate-900 dark:text-white font-semibold">
                          {task.creator_name || 'Direktorat'}
                        </strong>
                      </span>

                      {/* Ijrochi (Kimga biriktirilgan) */}
                      <span className="flex items-center space-x-1 bg-blue-50 dark:bg-sky-950/60 px-2 py-0.5 rounded-md border border-blue-200/70 dark:border-sky-800/60">
                        <User className="w-3 h-3 text-blue-600 dark:text-sky-400" />
                        <span className="text-slate-500 dark:text-slate-400">Ijrochi:</span>
                        <strong className="text-blue-700 dark:text-sky-300 font-bold">
                          {task.assignee_name || 'Tayinlanmagan'}
                        </strong>
                      </span>

                      {/* Bosqich / Etap */}
                      {isDirector ? (
                        <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                          <span className="text-slate-400">Etap:</span>
                          <select
                            value={task.stage || (task.status === 'completed' ? 'completed' : 'in_progress')}
                            onChange={(e) => handleUpdateTaskStage(task.id, e.target.value as any, task)}
                            className="bg-transparent font-bold text-slate-800 dark:text-slate-200 text-[10px] outline-none cursor-pointer"
                          >
                            <option value="new">{tr('tasks.new')}</option>
                            <option value="in_progress">{tr('tasks.inProgress')}</option>
                            <option value="review">{tr('tasks.review')}</option>
                            <option value="completed">{tr('tasks.done')}</option>
                          </select>
                        </div>
                      ) : (
                        <span className="flex items-center space-x-1">
                          <span className="text-slate-400">Etap:</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              task.status === 'completed'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : task.stage === 'review'
                                ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                                : task.stage === 'new'
                                ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                                : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {task.status === 'completed' ? 'Bajarildi' : task.stage === 'review' ? 'Tekshiruvda' : task.stage === 'new' ? 'Yangi' : 'Jarayonda'}
                          </span>
                        </span>
                      )}

                      {/* Kim yakunlagan (Audit) */}
                      {task.status === 'completed' && (
                        <span className="flex items-center space-x-1 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-md">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Yakunladi: <strong>{task.completed_by_name || 'Shifokor'}</strong> {task.completed_at ? `(${task.completed_at})` : ''}</span>
                        </span>
                      )}

                      {/* Bemor havolasi */}
                      {task.patient && (
                        <span className="flex items-center space-x-1">
                          <Link
                            href={`/patients/${task.patient}`}
                            className="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-sky-400 hover:underline"
                          >
                            <span>Bemor: {task.patient_name || `#${task.patient}`}</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </span>
                      )}

                      {/* Muddat */}
                      {task.due_date && (
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>Muddat: {task.due_date}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side actions & priority badge */}
                <div className="flex items-center space-x-2 shrink-0 self-end lg:self-center">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                      task.priority === 'high'
                        ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                        : task.priority === 'medium'
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                        : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                    }`}
                  >
                    {task.priority === 'high' ? 'Shoshilinch' : task.priority === 'medium' ? 'O‘rta' : 'Oddiy'}
                  </span>

                  {/* Edit Button for Director or Owner */}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openEditModal(task)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-sky-950/50 rounded-lg transition"
                      title={tr('tasks.titleEditTask')}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}

                  {/* Delete Button */}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTask(task.id, task)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition"
                      title={tr('tasks.titleDeleteTask')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      </>
      )}

      {/* Add Task Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full shadow-2xl p-6 space-y-4 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {isDirector ? 'Direktor nomidan topshiriq berish' : 'Yangi vazifa yoki Bemor eslatmasi'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Topshiriq tanlangan shifokorga bevosita boradi va etaplari nazorat qilinadi
                </p>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddTask} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Vazifa / Muolaja nomi*:</label>
                <input
                  type="text"
                  required
                  placeholder={tr('tasks.phTaskTitle')}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Bemorga biriktirish (ixtiyoriy):</label>
                <select
                  value={newPatientId}
                  onChange={(e) => setNewPatientId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                >
                  <option value="">-- Bemorga biriktirmaslik (Ichki vazifa) --</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id.toString()}>
                      {p.full_name} ({p.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    🏢 Filial:
                  </label>
                  <select
                    value={newBranchId}
                    onChange={(e) => setNewBranchId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                  >
                    {(branches.length > 0 ? branches : [
                      { id: 1, name: 'Toshkent Markaziy' },
                      { id: 2, name: 'Chilonzor' },
                      { id: 3, name: 'Yunusobod' }
                    ]).map((b) => (
                      <option key={b.id} value={b.id.toString()}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {isDirector ? 'Topshiriq kimga yuborilsin (Ijrochi)*:' : 'Mas’ul shifokor / xodim:'}
                  </label>
                  <select
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                  >
                    {employees.map((e) => (
                      <option key={e.id} value={e.id.toString()}>
                        {e.full_name} ({e.specialty || e.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Boshlang‘ich bosqich (Etap):</label>
                <select
                  value={newStage}
                  onChange={(e) => setNewStage(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                >
                  <option value="new">{tr('tasks.newAssigned')}</option>
                  <option value="in_progress">{tr('tasks.inProgress')}</option>
                  <option value="review">{tr('tasks.review')}</option>
                  <option value="completed">{tr('tasks.done')}</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Muhimlik darajasi:</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                  >
                    <option value="low">{tr('tasks.low')}</option>
                    <option value="medium">{tr('tasks.medium')}</option>
                    <option value="high">{tr('tasks.urgentHigh')}</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Ijro muddati (Deadline):</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Izoh / Batafsil ko‘rsatma:</label>
                <textarea
                  rows={3}
                  placeholder={tr('tasks.phInstructions')}
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-none font-medium text-slate-900 dark:text-white"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 space-y-1">
                <p>
                  👤 <strong>Topshiruvchi:</strong> {user?.name || 'Direktorat'} ({user?.roleLabel || user?.role || 'Admin'})
                </p>
                <p>
                  🎯 <strong>Ijrochi:</strong> Ushbu topshiriq tanlangan shifokorning shaxsiy vazifalarida aks etadi.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition shadow-md shadow-blue-500/20 active:scale-95"
                >
                  Topshiriqni yuborish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Task Modal (Director / Owner) */}
      {editingTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full shadow-2xl p-6 space-y-4 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Vazifani tahrirlash va qayta biriktirish
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Etapini o‘zgartirish, ijrochini yangilash yoki muddatini uzaytirish
                </p>
              </div>
              <button
                onClick={() => setEditingTask(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditTask} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Vazifa / Muolaja nomi*:</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    🏢 Filial:
                  </label>
                  <select
                    value={editBranchId}
                    onChange={(e) => setEditBranchId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                  >
                    {(branches.length > 0 ? branches : [
                      { id: 1, name: 'Toshkent Markaziy' },
                      { id: 2, name: 'Chilonzor' },
                      { id: 3, name: 'Yunusobod' }
                    ]).map((b) => (
                      <option key={b.id} value={b.id.toString()}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Ijrochi shifokor:</label>
                  <select
                    value={editAssignee}
                    onChange={(e) => setEditAssignee(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                  >
                    {employees.map((e) => (
                      <option key={e.id} value={e.id.toString()}>
                        {e.full_name} ({e.specialty || e.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Qaysi bosqichda (Etap):</label>
                <select
                  value={editStage}
                  onChange={(e) => setEditStage(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                >
                  <option value="new">{tr('tasks.newAssigned')}</option>
                  <option value="in_progress">{tr('tasks.inProgress')}</option>
                  <option value="review">{tr('tasks.review')}</option>
                  <option value="completed">{tr('tasks.done')}</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Muhimlik:</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                  >
                    <option value="low">{tr('tasks.low')}</option>
                    <option value="medium">{tr('tasks.medium')}</option>
                    <option value="high">{tr('tasks.urgent')}</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Muddat:</label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Izoh / Ko‘rsatma:</label>
                <textarea
                  rows={3}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-none font-medium text-slate-900 dark:text-white"
                />
              </div>

              {/* Audit Card */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 space-y-1">
                <p>
                  📌 <strong>Vazifani bergan:</strong> {editingTask.creator_name || 'Direktorat'}
                </p>
                {editingTask.completed_by_name && (
                  <p className="text-emerald-600 dark:text-emerald-400 font-bold">
                    ✅ <strong>Yakunlagan:</strong> {editingTask.completed_by_name} ({editingTask.completed_at || 'Bajarilgan'})
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition shadow-md shadow-blue-500/20 active:scale-95"
                >
                  O‘zgarishlarni saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
