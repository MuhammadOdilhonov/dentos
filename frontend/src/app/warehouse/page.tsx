'use client';

import React, { useState, useEffect } from 'react';
import { clinicApi } from '../../lib/api';
import { WarehouseItem } from '../../lib/types';
import { useI18n } from '../../lib/i18n';
import {
  Package, Plus, AlertTriangle, CheckCircle2, Search,
  ArrowDownCircle, ArrowUpCircle, X, Trash2, Edit3, DollarSign, RefreshCw
} from 'lucide-react';

export default function WarehousePage() {
  const { tr } = useI18n();
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockModalType, setStockModalType] = useState<'in' | 'out'>('in');
  const [selectedItem, setSelectedItem] = useState<WarehouseItem | null>(null);
  const [stockAmount, setStockAmount] = useState<number>(1);
  const [stockNote, setStockNote] = useState<string>('');

  // Edit / Add Form State
  const [formItem, setFormItem] = useState<Partial<WarehouseItem>>({
    name: '',
    category: 'Расходники',
    quantity: 10,
    unit: 'шт',
    min_quantity: 5,
    cost: 50000
  });
  const [isEditing, setIsEditing] = useState(false);

  const loadWarehouse = async () => {
    setLoading(true);
    try {
      const data = await clinicApi.getWarehouse();
      setItems(data || []);
    } catch (err) {
      console.error('Error loading warehouse:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWarehouse();
  }, []);

  const handleOpenAdd = () => {
    setIsEditing(false);
    setFormItem({
      name: '',
      category: 'Расходники',
      quantity: 10,
      unit: 'шт',
      min_quantity: 5,
      cost: 50000
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (item: WarehouseItem) => {
    setIsEditing(true);
    setSelectedItem(item);
    setFormItem({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      min_quantity: item.min_quantity,
      cost: item.cost
    });
    setIsAddModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formItem.name?.trim()) return;

    if (isEditing && selectedItem) {
      const updated = await clinicApi.updateWarehouseItem(selectedItem.id, {
        name: formItem.name,
        category: formItem.category,
        quantity: Number(formItem.quantity) || 0,
        unit: formItem.unit || 'шт',
        min_quantity: Number(formItem.min_quantity) || 5,
        cost: Number(formItem.cost) || 0
      });
      if (updated) {
        setItems(prev => prev.map(i => String(i.id) === String(selectedItem.id) ? { ...i, ...updated } : i));
      }
    } else {
      const created = await clinicApi.createWarehouseItem({
        name: formItem.name,
        category: formItem.category || 'Расходники',
        quantity: Number(formItem.quantity) || 0,
        unit: formItem.unit || 'шт',
        min_quantity: Number(formItem.min_quantity) || 5,
        cost: Number(formItem.cost) || 0
      });
      if (created) {
        setItems(prev => [created, ...prev.filter(i => String(i.id) !== String(created.id))]);
      }
    }
    setIsAddModalOpen(false);
  };

  const handleDeleteItem = async (id: number | string) => {
    if (!confirm(tr('warehouse.deleteConfirm'))) return;
    await clinicApi.deleteWarehouseItem(id);
    setItems(prev => prev.filter(i => String(i.id) !== String(id)));
  };

  const handleOpenStockModal = (item: WarehouseItem, type: 'in' | 'out') => {
    setSelectedItem(item);
    setStockModalType(type);
    setStockAmount(1);
    setStockNote('');
    setIsStockModalOpen(true);
  };

  const handleApplyStockChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || stockAmount <= 0) return;

    const currentQty = Number(selectedItem.quantity) || 0;
    const newQty = stockModalType === 'in'
      ? currentQty + stockAmount
      : Math.max(0, currentQty - stockAmount);

    const updated = await clinicApi.updateWarehouseItem(selectedItem.id, { quantity: newQty });
    if (updated) {
      setItems(prev => prev.map(i => String(i.id) === String(selectedItem.id) ? { ...i, quantity: newQty } : i));
    }
    setIsStockModalOpen(false);
  };

  const categories = ['All', ...Array.from(new Set(items.map((i) => i.category).filter(Boolean)))];

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCat = categoryFilter === 'All' || categoryFilter === 'Все' || item.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const lowStockCount = items.filter((i) => Number(i.quantity) > 0 && Number(i.quantity) <= Number(i.min_quantity)).length;
  const outOfStockCount = items.filter((i) => Number(i.quantity) <= 0).length;
  const totalValue = items.reduce((acc, curr) => acc + (Number(curr.quantity) || 0) * (Number(curr.cost) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center space-x-2">
            <Package className="w-7 h-7 text-cyan-600 dark:text-cyan-400" />
            <span>{tr('warehouse.title')}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {tr('warehouse.subtitle')}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={loadWarehouse}
            title={tr('common.refresh')}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-1.5 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-600/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>{tr('warehouse.addItem')}</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr('warehouse.totalTypes')}</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{items.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">{tr('warehouse.totalTypesSub')}</div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{tr('warehouse.totalValue')}</div>
          <div className="text-xl font-black text-cyan-600 dark:text-cyan-400 mt-1 font-mono">
            {totalValue.toLocaleString()} UZS
          </div>
          <div className="text-[11px] text-slate-500 mt-1">{tr('warehouse.totalValueSub')}</div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center space-x-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{tr('warehouse.lowStock')}</span>
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{lowStockCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">{tr('warehouse.lowStockSub')}</div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-xs font-bold text-rose-500 uppercase tracking-wider">{tr('warehouse.outOfStock')}</div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">{outOfStockCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">{tr('warehouse.outOfStockSub')}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder={tr('warehouse.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full text-xs pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl outline-none focus:border-cyan-500 text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 sm:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`text-xs px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition ${
                categoryFilter === cat
                  ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-600/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {cat === 'All' ? tr('common.all') : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3.5 px-4">{tr('warehouse.colName')}</th>
                <th className="py-3.5 px-4">{tr('warehouse.colCategory')}</th>
                <th className="py-3.5 px-4">{tr('warehouse.colQty')}</th>
                <th className="py-3.5 px-4">{tr('warehouse.colMinLimit')}</th>
                <th className="py-3.5 px-4">{tr('warehouse.colUnitPrice')}</th>
                <th className="py-3.5 px-4">{tr('warehouse.colTotal')}</th>
                <th className="py-3.5 px-4">{tr('warehouse.colStatus')}</th>
                <th className="py-3.5 px-4 text-right">{tr('warehouse.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    {tr('warehouse.noItems')}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const qty = Number(item.quantity) || 0;
                  const minQty = Number(item.min_quantity) || 5;
                  const cost = Number(item.cost) || 0;
                  const isOut = qty <= 0;
                  const isLow = !isOut && qty <= minQty;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                        {item.name}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`font-mono font-black text-sm ${isOut ? 'text-rose-600 dark:text-rose-400' : isLow ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
                          {qty} {item.unit}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-mono">
                        {minQty} {item.unit}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-mono">
                        {cost.toLocaleString()} UZS
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200 font-mono">
                        {(qty * cost).toLocaleString()} UZS
                      </td>
                      <td className="py-3.5 px-4">
                        {isOut ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                            {tr('warehouse.statusOut')}
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                            <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 inline" />
                            <span>{tr('warehouse.statusLow')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400 inline" />
                            <span>{tr('warehouse.statusIn')}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          {/* Kirim button */}
                          <button
                            onClick={() => handleOpenStockModal(item, 'in')}
                            title={tr('warehouse.stockIn')}
                            className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition"
                          >
                            <ArrowDownCircle className="w-4 h-4" />
                          </button>
                          {/* Chiqim / Rashod button */}
                          <button
                            onClick={() => handleOpenStockModal(item, 'out')}
                            title={tr('warehouse.stockOut')}
                            className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition"
                          >
                            <ArrowUpCircle className="w-4 h-4" />
                          </button>
                          {/* Edit button */}
                          <button
                            onClick={() => handleOpenEdit(item)}
                            title={tr('common.edit')}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {/* Delete button */}
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            title={tr('common.delete')}
                            className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Add / Edit Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full shadow-2xl p-6 space-y-4 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {isEditing ? tr('warehouse.editItem') : tr('warehouse.addNewItem')}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveItem} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">{tr('warehouse.itemNameLabel')}</label>
                <input
                  type="text"
                  required
                  placeholder={tr('warehouse.itemNamePlaceholder')}
                  value={formItem.name}
                  onChange={(e) => setFormItem({ ...formItem, name: e.target.value })}
                  className="w-full text-xs p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-cyan-500 text-slate-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">{tr('warehouse.categoryLabel')}</label>
                  <select
                    value={formItem.category}
                    onChange={(e) => setFormItem({ ...formItem, category: e.target.value })}
                    className="w-full text-xs p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-slate-900 dark:text-white"
                  >
                    <option value="Анестезия">{tr('warehouse.catAnesthesia')}</option>
                    <option value="Пломбировочные">{tr('warehouse.catFilling')}</option>
                    <option value="Расходники">{tr('warehouse.catConsumables')}</option>
                    <option value="Инструменты">{tr('warehouse.catInstruments')}</option>
                    <option value="Имплантология">{tr('warehouse.catImplantology')}</option>
                    <option value="Ортопедия">{tr('warehouse.catOrthopedics')}</option>
                    <option value="Ортодонтия">{tr('warehouse.catOrthodontics')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">{tr('warehouse.initialQty')}</label>
                  <input
                    type="number"
                    step="any"
                    value={formItem.quantity}
                    onChange={(e) => setFormItem({ ...formItem, quantity: Number(e.target.value) })}
                    className="w-full text-xs p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">{tr('warehouse.unitLabel')}</label>
                  <input
                    type="text"
                    value={formItem.unit}
                    onChange={(e) => setFormItem({ ...formItem, unit: e.target.value })}
                    className="w-full text-xs p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">{tr('warehouse.unitPriceLabel')}</label>
                  <input
                    type="number"
                    value={formItem.cost}
                    onChange={(e) => setFormItem({ ...formItem, cost: Number(e.target.value) })}
                    className="w-full text-xs p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">{tr('warehouse.minLimitLabel')}</label>
                  <input
                    type="number"
                    value={formItem.min_quantity}
                    onChange={(e) => setFormItem({ ...formItem, min_quantity: Number(e.target.value) })}
                    className="w-full text-xs p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold"
                >
                  {tr('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-600/20"
                >
                  {isEditing ? tr('common.update') : tr('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock In / Stock Out (Kirim / Chiqim) Modal */}
      {isStockModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full shadow-2xl p-6 space-y-4 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {stockModalType === 'in' ? (
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center">
                    <ArrowDownCircle className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 flex items-center justify-center">
                    <ArrowUpCircle className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-black">
                    {stockModalType === 'in' ? tr('warehouse.stockIn') : tr('warehouse.stockOut')}
                  </h3>
                  <div className="text-xs text-slate-400 font-bold">{selectedItem.name}</div>
                </div>
              </div>
              <button
                onClick={() => setIsStockModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl flex justify-between items-center text-xs font-bold">
              <span className="text-slate-400">{tr('warehouse.currentStock')}</span>
              <span className="font-mono text-cyan-600 dark:text-cyan-400 text-sm">
                {selectedItem.quantity} {selectedItem.unit}
              </span>
            </div>

            <form onSubmit={handleApplyStockChange} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {stockModalType === 'in' ? tr('warehouse.qtyToAdd') : tr('warehouse.qtyToDeduct')}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  required
                  value={stockAmount}
                  onChange={(e) => setStockAmount(Number(e.target.value))}
                  className="w-full text-sm font-mono font-bold p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-cyan-500 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">{tr('warehouse.noteLabel')}</label>
                <input
                  type="text"
                  placeholder={stockModalType === 'in' ? tr('warehouse.notePlaceholderIn') : tr('warehouse.notePlaceholderOut')}
                  value={stockNote}
                  onChange={(e) => setStockNote(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold"
                >
                  {tr('common.cancel')}
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 text-white rounded-xl text-xs font-bold shadow-md ${
                    stockModalType === 'in'
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                      : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                  }`}
                >
                  {stockModalType === 'in' ? tr('warehouse.confirmIn') : tr('warehouse.confirmOut')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
