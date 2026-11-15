'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Check,
  ClipboardList,
  Lock,
  Search,
  Edit2
} from 'lucide-react';
import {
  TreatmentPlan,
  TreatmentPlanStage,
  TreatmentPlanVariant,
  TreatmentProcedureItem
} from '../lib/types';
import { useI18n } from '../lib/i18n';
import { useBranch } from '../lib/branchContext';
import { clinicApi } from '../lib/api';
import ToothIcon from './ToothIcon';

export interface TreatmentPlanBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: number | string;
  patientName: string;
  planToEdit?: TreatmentPlan | null;
  onSave: (plan: TreatmentPlan) => void;
}

const ADULT_UPPER_LEFT = ['18', '17', '16', '15', '14', '13', '12', '11'];
const ADULT_UPPER_RIGHT = ['21', '22', '23', '24', '25', '26', '27', '28'];
const ADULT_LOWER_LEFT = ['48', '47', '46', '45', '44', '43', '42', '41'];
const ADULT_LOWER_RIGHT = ['31', '32', '33', '34', '35', '36', '37', '38'];

const CHILD_UPPER_LEFT = ['55', '54', '53', '52', '51'];
const CHILD_UPPER_RIGHT = ['61', '62', '63', '64', '65'];
const CHILD_LOWER_LEFT = ['85', '84', '83', '82', '81'];
const CHILD_LOWER_RIGHT = ['71', '72', '73', '74', '75'];

interface CatalogItem {
  id?: string;
  name: string;
  category: string;
  base_price: number;
}

interface VariantItem {
  id: string | number;
  name: string;
  stages: TreatmentPlanStage[];
}

export default function TreatmentPlanBuilderModal({
  isOpen,
  onClose,
  patientId,
  patientName,
  planToEdit,
  onSave
}: TreatmentPlanBuilderModalProps) {
  const { tk, language } = useI18n();
  const { currentBranchId } = useBranch();

  const getLocalizedVariantName = (num: number) => {
    if (language === 'uz') return `${num}-variant`;
    if (language === 'en') return `Variant ${num}`;
    return `Вариант ${num}`;
  };

  // Plan general state
  const [title, setTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [freezePrices, setFreezePrices] = useState(false);

  // Variants state (32Desk Treatment Plan Options)
  const [variants, setVariants] = useState<VariantItem[]>([]);
  const [activeVariantId, setActiveVariantId] = useState<string | number>('');
  const [editingVariantId, setEditingVariantId] = useState<string | number | null>(null);
  const [editingVariantName, setEditingVariantName] = useState('');
  const [activeStageId, setActiveStageId] = useState<number>(1);

  // Dental formula state
  const [isChildChart, setIsChildChart] = useState(false);
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);

  // Services catalog state
  const [activeTab, setActiveTab] = useState<'services' | 'templates'>('services');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Hydrate from planToEdit or initialize fresh
  useEffect(() => {
    if (!isOpen) return;

    if (planToEdit) {
      setTitle(planToEdit.title || tk('tp_default_name') || 'Kompleks davolash');
      setFreezePrices(Boolean(planToEdit.freeze_prices));

      // If existing plan already has variants
      if (planToEdit.variants && planToEdit.variants.length > 0) {
        const mappedVariants = planToEdit.variants.map((v, idx) => {
          const hasValidStages = v.stages && v.stages.length > 0;
          const stList = hasValidStages
            ? v.stages
            : [{
                id: Date.now() + idx,
                title: `${tk('tp_stage') || 'Bosqich'} 1`,
                description: '',
                cost: 0,
                status: 'Запланировано' as const,
                doctor: '',
                procedures: []
              }];
          return {
            id: v.id || `v-${idx + 1}`,
            name: v.name || getLocalizedVariantName(idx + 1),
            stages: stList
          };
        });
        setVariants(mappedVariants);
        const initVId = planToEdit.active_variant_id || mappedVariants[0]?.id || 'v-1';
        setActiveVariantId(initVId);
        const activeV = mappedVariants.find((v) => String(v.id) === String(initVId)) || mappedVariants[0];
        setActiveStageId(activeV?.stages?.[0]?.id || Date.now());
      } else {
        // Fallback: wrap existing stages in Variant 1
        const loadedStages: TreatmentPlanStage[] = (planToEdit.stages && planToEdit.stages.length > 0)
          ? planToEdit.stages
          : [{
              id: Date.now(),
              title: `${tk('tp_stage') || 'Bosqich'} 1`,
              description: '',
              cost: 0,
              status: 'Запланировано' as const,
              doctor: '',
              procedures: []
            }];
        const initialVariant: VariantItem = {
          id: 'v-1',
          name: getLocalizedVariantName(1),
          stages: loadedStages
        };
        setVariants([initialVariant]);
        setActiveVariantId('v-1');
        setActiveStageId(loadedStages[0]?.id || Date.now());
      }
    } else {
      // Fresh new plan
      setTitle(tk('tp_default_name') || 'Kompleks davolash');
      setFreezePrices(false);

      const firstStageId = Date.now();
      const initialVariant: VariantItem = {
        id: 'v-1',
        name: getLocalizedVariantName(1),
        stages: [{
          id: firstStageId,
          title: `${tk('tp_stage') || 'Bosqich'} 1`,
          description: '',
          cost: 0,
          status: 'Запланировано' as const,
          doctor: '',
          procedures: []
        }]
      };

      setVariants([initialVariant]);
      setActiveVariantId('v-1');
      setActiveStageId(firstStageId);
    }

    setSelectedTeeth([]);
    setIsChildChart(false);
    setCatalogSearch('');
    setActiveCategory('All');
    setEditingVariantId(null);

    // Load services catalog
    setLoadingCatalog(true);
    clinicApi.getNaryadCatalog(currentBranchId)
      .then((items) => {
        setCatalog(
          (items || []).map((it: any) => ({
            id: it.id || String(it.name),
            name: it.name,
            category: it.category || (tk('tp_general_services') || 'Umumiy'),
            base_price: Number(it.base_price) || 0
          }))
        );
      })
      .catch(() => {
        setCatalog([]);
      })
      .finally(() => {
        setLoadingCatalog(false);
      });
  }, [isOpen, planToEdit, currentBranchId]);

  if (!isOpen) return null;

  // Active variant & active stage resolution
  const activeVariant = variants.find((v) => v.id === activeVariantId) || variants[0];
  const activeStage = activeVariant?.stages.find((s) => s.id === activeStageId) || activeVariant?.stages[0];

  // Map of teeth with procedure counts across active variant
  const teethProcedureCounts: Record<string, number> = {};
  (activeVariant?.stages || []).forEach((stage) => {
    (stage.procedures || []).forEach((proc) => {
      if (proc.teeth) {
        proc.teeth.split(',').forEach((t) => {
          const cleanT = t.trim();
          if (cleanT) {
            teethProcedureCounts[cleanT] = (teethProcedureCounts[cleanT] || 0) + 1;
          }
        });
      }
    });
  });

  // Tooth toggle handler
  const handleToggleTooth = (tooth: string) => {
    setSelectedTeeth((prev) =>
      prev.includes(tooth) ? prev.filter((t) => t !== tooth) : [...prev, tooth]
    );
  };

  // Add a new variant (e.g. "Вариант 2")
  const handleAddVariant = () => {
    const nextIdx = variants.length + 1;
    const newStageId = Date.now();
    const newVariant: VariantItem = {
      id: `v-${Date.now()}`,
      name: getLocalizedVariantName(nextIdx),
      stages: [{
        id: newStageId,
        title: `${tk('tp_stage') || 'Bosqich'} 1`,
        description: '',
        cost: 0,
        status: 'Запланировано' as const,
        doctor: '',
        procedures: []
      }]
    };
    setVariants((prev) => [...prev, newVariant]);
    setActiveVariantId(newVariant.id);
    setActiveStageId(newStageId);
  };

  // Delete a variant
  const handleDeleteVariant = (vId: string | number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (variants.length <= 1) return;
    const next = variants.filter((v) => v.id !== vId);
    setVariants(next);
    if (activeVariantId === vId) {
      setActiveVariantId(next[0].id);
      setActiveStageId(next[0].stages[0]?.id || 1);
    }
  };

  // Start inline rename for variant
  const handleStartRenameVariant = (v: VariantItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingVariantId(v.id);
    setEditingVariantName(v.name);
  };

  // Save inline rename for variant
  const handleSaveRenameVariant = () => {
    if (!editingVariantId) return;
    const trimmed = editingVariantName.trim();
    if (trimmed) {
      setVariants((prev) =>
        prev.map((v) => (v.id === editingVariantId ? { ...v, name: trimmed } : v))
      );
    }
    setEditingVariantId(null);
  };

  // Add stage to active variant
  const handleAddStage = () => {
    if (!activeVariant) return;
    const stageNum = activeVariant.stages.length + 1;
    const newStage: TreatmentPlanStage = {
      id: Date.now(),
      title: `${tk('tp_stage') || 'Bosqich'} ${stageNum}`,
      description: '',
      cost: 0,
      status: 'Запланировано' as const,
      doctor: '',
      procedures: []
    };

    setVariants((prev) =>
      prev.map((v) => {
        if (v.id !== activeVariant.id) return v;
        return {
          ...v,
          stages: [...v.stages, newStage]
        };
      })
    );
    setActiveStageId(newStage.id);
  };

  // Remove stage from active variant
  const handleRemoveStage = (stageId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeVariant || activeVariant.stages.length <= 1) return;

    setVariants((prev) =>
      prev.map((v) => {
        if (v.id !== activeVariant.id) return v;
        const nextStages = v.stages.filter((s) => s.id !== stageId);
        if (activeStageId === stageId && nextStages.length > 0) {
          setActiveStageId(nextStages[0].id);
        }
        return {
          ...v,
          stages: nextStages
        };
      })
    );
  };

  // Add procedure/service to active stage of active variant
  const handleAddProcedure = (item: CatalogItem) => {
    if (!activeVariant) return;
    const curStage = activeVariant.stages.find((s) => String(s.id) === String(activeStageId)) || activeVariant.stages[0];
    if (!curStage) return;

    const qty = selectedTeeth.length > 0 ? selectedTeeth.length : 1;
    const teethStr = selectedTeeth.length > 0
      ? [...selectedTeeth].sort((a, b) => Number(a) - Number(b)).join(', ')
      : '';

    const newProc: TreatmentProcedureItem = {
      id: `${item.name}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      title: item.name,
      teeth: teethStr,
      quantity: qty,
      price: item.base_price,
      category: item.category
    };

    setVariants((prev) =>
      prev.map((v) => {
        if (String(v.id) !== String(activeVariant.id)) return v;
        const nextStages = v.stages.map((s) => {
          if (String(s.id) !== String(curStage.id)) return s;
          const nextProcs = [...(s.procedures || []), newProc];
          const nextCost = nextProcs.reduce(
            (sum, p) => sum + (Number(p.price) || 0) * (Number(p.quantity) || 1),
            0
          );
          return {
            ...s,
            procedures: nextProcs,
            cost: nextCost
          };
        });
        return {
          ...v,
          stages: nextStages
        };
      })
    );

    // Clear selected teeth after adding so user can choose next tooth
    setSelectedTeeth([]);
  };

  // Remove procedure from stage
  const handleRemoveProcedure = (stageId: number, procId: string | number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeVariant) return;

    setVariants((prev) =>
      prev.map((v) => {
        if (v.id !== activeVariant.id) return v;
        const nextStages = v.stages.map((s) => {
          if (s.id !== stageId) return s;
          const nextProcs = (s.procedures || []).filter((p) => p.id !== procId);
          const nextCost = nextProcs.reduce(
            (sum, p) => sum + (Number(p.price) || 0) * (Number(p.quantity) || 1),
            0
          );
          return {
            ...s,
            procedures: nextProcs,
            cost: nextCost
          };
        });
        return {
          ...v,
          stages: nextStages
        };
      })
    );
  };

  // Variant total cost calculation
  const variantTotalCost = (activeVariant?.stages || []).reduce((sum, s) => {
    const stageSum = (s.procedures || []).reduce(
      (pSum, p) => pSum + (Number(p.price) || 0) * (Number(p.quantity) || 1),
      0
    );
    return sum + stageSum;
  }, 0);

  // Filtered categories
  const categories = ['All', ...Array.from(new Set(catalog.map((c) => c.category).filter(Boolean)))];

  // Filtered catalog
  const filteredCatalog = catalog.filter((c) => {
    const matchCat = activeCategory === 'All' || c.category === activeCategory;
    const matchSearch =
      !catalogSearch.trim() ||
      c.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      c.category.toLowerCase().includes(catalogSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  // Final save
  const handleSave = () => {
    const finalPlan: TreatmentPlan = {
      id: planToEdit?.id || Date.now(),
      patient: Number(patientId),
      patient_id: Number(patientId),
      title: title.trim() || activeVariant?.name || `${tk('tp_variant') || 'Variant'} 1`,
      freeze_prices: freezePrices,
      status: planToEdit?.status || 'Согласован с пациентом',
      doctor_name: planToEdit?.doctor_name || 'Врач',
      stages: (activeVariant?.stages || variants[0]?.stages || []).map((s) => ({
        ...s,
        cost: (s.procedures || []).reduce(
          (sum, p) => sum + (Number(p.price) || 0) * (Number(p.quantity) || 1),
          0
        )
      })),
      variants: variants.map((v) => ({
        id: v.id,
        name: v.name,
        stages: v.stages.map((s) => ({
          ...s,
          cost: (s.procedures || []).reduce(
            (sum, p) => sum + (Number(p.price) || 0) * (Number(p.quantity) || 1),
            0
          )
        }))
      })),
      active_variant_id: activeVariant?.id || variants[0]?.id,
      created_at: planToEdit?.created_at || new Date().toISOString()
    };

    onSave(finalPlan);
    onClose();
  };

  const upperLeft = isChildChart ? CHILD_UPPER_LEFT : ADULT_UPPER_LEFT;
  const upperRight = isChildChart ? CHILD_UPPER_RIGHT : ADULT_UPPER_RIGHT;
  const lowerLeft = isChildChart ? CHILD_LOWER_LEFT : ADULT_LOWER_LEFT;
  const lowerRight = isChildChart ? CHILD_LOWER_RIGHT : ADULT_LOWER_RIGHT;

  const renderToothBtn = (tNum: string) => {
    const isSelected = selectedTeeth.includes(tNum);
    const hasProcs = (teethProcedureCounts[tNum] || 0) > 0;

    return (
      <button
        key={tNum}
        type="button"
        onClick={() => handleToggleTooth(tNum)}
        className={`w-8 sm:w-9 h-11 rounded-xl flex flex-col items-center justify-between p-1 transition-all select-none cursor-pointer border-2 ${
          isSelected
            ? 'bg-blue-100 dark:bg-blue-900/60 border-blue-600 text-blue-700 dark:text-blue-300 shadow-sm ring-2 ring-blue-400 scale-105 z-10'
            : hasProcs
            ? 'bg-blue-50 dark:bg-blue-950/70 border-blue-500 text-blue-600 dark:text-blue-400'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300'
        }`}
        title={`№ ${tNum}`}
      >
        <ToothIcon
          className="w-3.5 h-3.5 mt-0.5"
          selected={isSelected || hasProcs}
          filled={isSelected || hasProcs}
        />
        <span
          className={`text-[11px] font-black font-mono leading-none ${
            isSelected || hasProcs ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'
          }`}
        >
          {tNum}
        </span>
      </button>
    );
  };

  return (
    /* EXACT 32DESK FULL SCREEN MODAL VIEWPORT */
    <div className="fixed inset-0 z-[90] w-screen h-screen bg-white dark:bg-[#0f172a] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">
      
      {/* ── MODAL TOPBAR ── */}
      <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-900/90 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div className="flex items-center gap-2">
            {isEditingTitle ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => setIsEditingTitle(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
                  className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-blue-500 rounded-lg text-sm font-black text-slate-900 dark:text-white outline-none"
                />
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(false)}
                  className="p-1 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400 hover:bg-blue-100 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => setIsEditingTitle(true)}
                className="group flex items-center gap-2 cursor-pointer"
                title={tk('tp_plan_name') || 'Reja nomi'}
              >
                <h3 className="text-base font-black text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-sky-400 transition">
                  {title || tk('tp_title') || 'Davolash rejasi'}
                </h3>
                <Edit2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition" />
              </div>
            )}
            <span className="text-xs text-slate-400 font-medium">· {patientName}</span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              {tk('tp_total') || 'Jami'} ({activeVariant?.name || 'Variant 1'})
            </span>
            <span className="text-sm font-black text-blue-600 dark:text-sky-400 font-mono">
              {variantTotalCost.toLocaleString('ru-RU')} {tk('currency_som') || 'so‘m'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:text-slate-300 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── MODAL MAIN BODY: 2 COLUMNS (Full Screen edge-to-edge) ── */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        
        {/* ── LEFT 7/12: DENTAL FORMULA + CATALOG ── */}
        <div className="lg:col-span-7 border-r border-slate-200 dark:border-slate-800 flex flex-col overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* 1. Dental Formula Panel */}
          <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                {tk('tp_dental_formula') || 'Зубная формула'}
              </span>

              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isChildChart}
                  onChange={(e) => {
                    setIsChildChart(e.target.checked);
                    setSelectedTeeth([]);
                  }}
                  className="w-3.5 h-3.5 rounded text-blue-600 accent-blue-600 cursor-pointer"
                />
                <span>{tk('tp_child_chart') || 'Детская карта'}</span>
              </label>
            </div>

            {/* Teeth buttons rows */}
            <div className="overflow-x-auto pb-1 flex flex-col items-center gap-2">
              {/* Upper jaw */}
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-1">
                  {upperLeft.map((t) => renderToothBtn(t))}
                </div>
                <div className="w-px h-8 bg-slate-300 dark:bg-slate-700 mx-1.5" />
                <div className="flex items-center gap-1">
                  {upperRight.map((t) => renderToothBtn(t))}
                </div>
              </div>

              {/* Lower jaw */}
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-1">
                  {lowerLeft.map((t) => renderToothBtn(t))}
                </div>
                <div className="w-px h-8 bg-slate-300 dark:bg-slate-700 mx-1.5" />
                <div className="flex items-center gap-1">
                  {lowerRight.map((t) => renderToothBtn(t))}
                </div>
              </div>
            </div>

            {/* Teeth selection status */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
              {selectedTeeth.length > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="font-bold text-blue-600 dark:text-sky-400">
                    {tk('tp_by_teeth') || 'Зубы'} {selectedTeeth.sort((a, b) => Number(a) - Number(b)).join(', ')} ({selectedTeeth.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedTeeth([])}
                    className="text-[11px] font-bold text-rose-500 hover:text-rose-600 underline cursor-pointer"
                  >
                    {tk('tp_clear_selection') || 'Очистить выбор'}
                  </button>
                </div>
              ) : (
                <span className="text-slate-400 italic">
                  {tk('tp_no_teeth_selected') || 'Зубы не выбраны'}
                </span>
              )}
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                {tk('tp_select_teeth_hint') || 'Tishlarni tanlang va pastdagi xizmatni bosing'}
              </span>
            </div>
          </div>

          {/* 2. Services / Templates Catalog */}
          <div className="flex-1 flex flex-col space-y-3 min-h-[300px]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
              {/* Tabs: Услуги / Шаблоны */}
              <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveTab('services')}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    activeTab === 'services'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-sky-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {tk('tp_services') || 'Услуги'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('templates')}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    activeTab === 'templates'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-sky-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {tk('tp_templates') || 'Шаблоны'}
                </button>
              </div>

              {/* Category filter dropdown */}
              <select
                value={activeCategory}
                onChange={(e) => setActiveCategory(e.target.value)}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'All' ? (tk('tp_all_categories') || 'Все категории') : cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Search input */}
            <div className="relative shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={tk('tp_search_service') || 'Найти услугу или шаблон...'}
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Services list */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {loadingCatalog ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Yuklanmoqda...
                </div>
              ) : filteredCatalog.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Xizmatlar topilmadi
                </div>
              ) : (
                filteredCatalog.map((item, idx) => (
                  <button
                    key={item.id || idx}
                    type="button"
                    onClick={() => handleAddProcedure(item)}
                    className="w-full p-3 rounded-xl border border-slate-150 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 text-left transition flex items-center justify-between gap-3 group cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-sky-400 truncate">
                        {item.name}
                      </p>
                      <span className="text-[10px] text-slate-400">
                        {item.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-black font-mono text-slate-800 dark:text-slate-200">
                        {item.base_price.toLocaleString('ru-RU')} {tk('currency_som') || 'so‘m'}
                      </span>
                      <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <Plus className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT 5/12: VARIANTS & STAGES (32Desk Treatment Plan Options) ── */}
        <div className="lg:col-span-5 bg-slate-50/60 dark:bg-slate-900/50 flex flex-col overflow-hidden p-4 sm:p-6">
          
          {/* 1. Variants Tabs Bar (Top Pills: [ Вариант 1 ] [ Вариант 2 ] [ + ]) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
            {variants.map((v) => {
              const isSelected = v.id === activeVariantId;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setActiveVariantId(v.id);
                    setActiveStageId(v.stages[0]?.id || 1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 border ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-slate-400'}`} />
                  <span className="max-w-[120px] truncate">{v.name}</span>
                </button>
              );
            })}

            {/* '+' button to add new variant */}
            <button
              type="button"
              onClick={handleAddVariant}
              data-testid="add-plan-option"
              title={tk('tp_add_variant') || '+ Вариант'}
              className="p-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/60 text-blue-600 dark:text-sky-400 border border-dashed border-blue-400 dark:border-blue-600 transition flex items-center justify-center cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* 2. Active Variant Header (Rename pencil & Delete variant) */}
          <div className="py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
            {editingVariantId === activeVariant?.id ? (
              <div className="flex items-center gap-2 flex-1 mr-2">
                <input
                  type="text"
                  autoFocus
                  placeholder={tk('tp_variant_name_placeholder') || 'Variant nomi...'}
                  value={editingVariantName}
                  onChange={(e) => setEditingVariantName(e.target.value)}
                  onBlur={handleSaveRenameVariant}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveRenameVariant()}
                  className="w-full px-2.5 py-1 text-xs font-bold rounded-lg border border-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveRenameVariant}
                  className="p-1 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-sky-400 hover:bg-blue-100 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-900 dark:text-white">
                  {activeVariant?.name || 'Variant 1'}
                </span>
                <button
                  type="button"
                  onClick={(e) => handleStartRenameVariant(activeVariant, e)}
                  className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-sky-400 transition cursor-pointer"
                  title={tk('tp_rename_variant') || 'Nomini o‘zgartirish'}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleAddStage}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{tk('tp_add_stage') || '+ Добавить этап'}</span>
              </button>

              {variants.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => handleDeleteVariant(activeVariant.id, e)}
                  className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                  title={tk('tp_delete_variant') || 'Variantni o‘chirish'}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 3. Stages List for Active Variant */}
          <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1">
            {(activeVariant?.stages || []).map((stage) => {
              const isActive = stage.id === activeStageId;
              const stageCost = (stage.procedures || []).reduce(
                (sum, p) => sum + (Number(p.price) || 0) * (Number(p.quantity) || 1),
                0
              );

              return (
                <div
                  key={stage.id}
                  onClick={() => setActiveStageId(stage.id)}
                  className={`rounded-2xl border transition-all cursor-pointer ${
                    isActive
                      ? 'border-blue-500 bg-white dark:bg-slate-900 shadow-md ring-2 ring-blue-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 hover:border-slate-300'
                  }`}
                >
                  {/* Stage Header */}
                  <div className="p-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-blue-600' : 'bg-slate-400'}`} />
                      <span className="text-xs font-black text-slate-900 dark:text-white">
                        {stage.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                        {stageCost.toLocaleString('ru-RU')} {tk('currency_som') || 'so‘m'}
                      </span>
                      {activeVariant.stages.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => handleRemoveStage(stage.id, e)}
                          className="p-1 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                          title="O'chirish"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Stage Procedures */}
                  <div className="p-2 space-y-1.5">
                    {(!stage.procedures || stage.procedures.length === 0) ? (
                      <p className="text-[11px] text-slate-400 italic p-2 text-center">
                        {tk('tp_select_teeth_hint') || 'Xizmat qo‘shish uchun chapdan tanlang'}
                      </p>
                    ) : (
                      stage.procedures.map((proc, pIdx) => {
                        const procTotal = (Number(proc.price) || 0) * (Number(proc.quantity) || 1);
                        return (
                          <div
                            key={`${proc.id}-${pIdx}`}
                            className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-150 dark:border-slate-800 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                {proc.title}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                {proc.teeth && (
                                  <span className="font-bold text-blue-600 dark:text-sky-400">
                                    № {proc.teeth}
                                  </span>
                                )}
                                <span>•</span>
                                <span>×{proc.quantity || 1}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                                {procTotal.toLocaleString('ru-RU')}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => handleRemoveProcedure(stage.id, proc.id, e)}
                                className="p-1 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 4. Variant Total Summary */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">
              {tk('tp_total') || 'Всего'} ({activeVariant?.name}):
            </span>
            <span className="text-base font-black text-blue-600 dark:text-sky-400 font-mono">
              {variantTotalCost.toLocaleString('ru-RU')} {tk('currency_som') || 'so‘m'}
            </span>
          </div>
        </div>
      </div>

      {/* ── MODAL FOOTER ── */}
      <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 flex items-center justify-between shrink-0">
        {/* Freeze prices checkbox */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={freezePrices}
            onChange={(e) => setFreezePrices(e.target.checked)}
            className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
          />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-600" />
            <span>{tk('tp_freeze_checkbox') || 'Заморозить цены'}</span>
          </span>
        </label>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer"
          >
            {tk('tp_cancel') || 'Отмена'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{tk('tp_save') || 'Сохранить'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
