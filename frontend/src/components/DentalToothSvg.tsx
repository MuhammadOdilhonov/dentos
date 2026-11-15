'use client';

import React from 'react';
import ToothIcon from './ToothIcon';

export interface DentalToothSvgProps {
  tooth?: string | number;
  toothNumber?: string | number;
  selected?: boolean;
  isSelected?: boolean;
  hasProcedures?: boolean;
  procedureCount?: number;
  onClick?: () => void;
  scale?: number;
  size?: number;
  showNumber?: boolean;
  className?: string;
}

export default function DentalToothSvg({
  tooth,
  toothNumber,
  selected = false,
  isSelected = false,
  hasProcedures = false,
  procedureCount = 0,
  onClick,
  scale = 1,
  size,
  showNumber = true,
  className = ''
}: DentalToothSvgProps) {
  const effectiveTooth = tooth ?? toothNumber ?? '11';
  const effectiveSelected = selected || isSelected;
  const isHighlighted = effectiveSelected || hasProcedures || procedureCount > 0;
  const num = String(effectiveTooth);

  const dimension = size || 38;
  const isSmall = dimension < 26;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width: `${dimension}px`, height: `${Math.round(dimension * 1.38)}px` }}
      className={`relative ${isSmall ? 'rounded-md p-0.5 border' : 'rounded-xl p-1 border-2'} flex flex-col items-center justify-between transition-all select-none cursor-pointer ${
        isHighlighted
          ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 dark:border-blue-500 text-blue-600 dark:text-blue-400 shadow-xs'
          : 'bg-white dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/80 hover:border-slate-300'
      } ${className}`}
      title={`Зуб № ${num}`}
    >
      {/* Clean Tooth Icon */}
      <div className="flex-1 flex items-center justify-center">
        <ToothIcon
          className={`${isSmall ? 'w-2.5 h-2.5' : 'w-4 h-4'} transition-transform`}
          selected={isHighlighted}
          filled={isHighlighted}
        />
      </div>

      {/* Tooth number */}
      {showNumber && (
        <span className={`${isSmall ? 'text-[8px]' : 'text-[11px]'} font-black font-mono leading-none ${
          isHighlighted ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'
        }`}>
          {num}
        </span>
      )}
    </button>
  );
}
