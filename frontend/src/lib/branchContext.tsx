'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Branch } from './types';
import { clinicApi } from './api';
import { useAuth } from './auth';

interface BranchContextType {
  branches: Branch[];
  currentBranch: Branch | null;
  currentBranchId: number | null;
  selectBranch: (branchId: number | null) => void;
  refreshBranches: () => Promise<void>;
  isLoading: boolean;
  canChangeBranch: boolean;
}

const BranchContext = createContext<BranchContextType>({
  branches: [],
  currentBranch: null,
  currentBranchId: null,
  selectBranch: () => {},
  refreshBranches: async () => {},
  isLoading: true,
  canChangeBranch: true
});

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const { user, isInitialized } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranchId, setCurrentBranchId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Direktor, Direktor o'rinbosari va SuperAdmin hamma filiallarni ko'ra oladi va erkin almashtiradi.
  // Filial admini yoki shifokor o'z filialiga biriktirilgan bo'lsa, o'sha filial bo'yicha ochiladi.
  const isSuperOrDirector = user?.role === 'director' || user?.role === 'superadmin' || user?.role === 'deputy_director';
  const canChangeBranch = isSuperOrDirector;

  const loadBranches = useCallback(async () => {
    try {
      const data = await clinicApi.getBranches();
      setBranches(data);
      return data;
    } catch (e) {
      console.error('Error loading branches:', e);
      return [];
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    // Auth tayyor bo'lmaguncha yoki foydalanuvchi kirmaguncha himoyalangan
    // /api/branches/ so'rovini YUBORMAYMIZ (login sahifasida 401 bo'lmasin).
    if (!isInitialized || !user) {
      setBranches([]);
      setCurrentBranchId(null);
      setIsLoading(false);
      return;
    }
    (async () => {
      setIsLoading(true);
      const bList = await loadBranches();
      if (!mounted) return;

      // Agar login qilgan user ma'lum filialga biriktirilgan bo'lsa (masalan admin yoki doctor)
      if (user?.branchId) {
        setCurrentBranchId(user.branchId);
      } else if (user?.role === 'doctor') {
        try {
          const emps = await clinicApi.getEmployees();
          const doc = emps.find(e =>
            (user?.username && e.username && e.username.toLowerCase() === user.username.toLowerCase()) ||
            (user?.name && e.full_name && e.full_name.toLowerCase() === user.name.toLowerCase()) ||
            String(e.id) === String(user?.id) ||
            e.role === 'doctor'
          );
          if (doc && doc.branch) {
            setCurrentBranchId(Number(doc.branch));
          }
        } catch {}
      } else if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('32desk_active_branch_id');
        if (stored && stored !== 'all') {
          const numId = Number(stored);
          if (bList.some(b => b.id === numId)) {
            setCurrentBranchId(numId);
          } else {
            setCurrentBranchId(null);
          }
        } else {
          setCurrentBranchId(null);
        }
      }
      setIsLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [loadBranches, isInitialized, user?.branchId, user?.role, user?.name, user?.username, user?.id]);

  // Admin yoki doctor login qilganda filialini avtomatik faollashtirish
  useEffect(() => {
    if (!user) return;
    if (user?.branchId) {
      setCurrentBranchId(user.branchId);
    } else if (user?.role === 'doctor') {
      clinicApi.getEmployees().then(emps => {
        const doc = emps.find(e =>
          (user?.username && e.username && e.username.toLowerCase() === user.username.toLowerCase()) ||
          (user?.name && e.full_name && e.full_name.toLowerCase() === user.name.toLowerCase()) ||
          (e.full_name && (e.full_name.includes('Alimov') || e.full_name.includes('Алимов'))) ||
          String(e.id) === String(user?.id) ||
          e.role === 'doctor'
        );
        if (doc && doc.branch) {
          setCurrentBranchId(Number(doc.branch));
        }
      }).catch(() => {});
    }
  }, [user?.branchId, user?.role, user?.name, user?.username, user?.id]);

  const selectBranch = (branchId: number | null) => {
    setCurrentBranchId(branchId);
    if (typeof window !== 'undefined') {
      if (branchId === null) {
        localStorage.setItem('32desk_active_branch_id', 'all');
      } else {
        localStorage.setItem('32desk_active_branch_id', String(branchId));
      }
    }
  };

  const currentBranch = branches.find(b => b.id === currentBranchId) || null;

  return (
    <BranchContext.Provider
      value={{
        branches,
        currentBranch,
        currentBranchId,
        selectBranch,
        refreshBranches: async () => {
          await loadBranches();
        },
        isLoading,
        canChangeBranch
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  return useContext(BranchContext);
}
