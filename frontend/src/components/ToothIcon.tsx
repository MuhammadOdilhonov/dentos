'use client';

import React from 'react';

export default function ToothIcon({
  className = 'w-4 h-4',
  filled = false,
  selected = false
}: {
  className?: string;
  filled?: boolean;
  selected?: boolean;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 26"
      fill={selected || filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={selected ? '2' : '1.7'}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Anatomical Molar: Crown with enamel occlusal cusps and twin diverging roots */}
      <path d="M4.2 9.5C3.2 6.5 4.5 3.5 7.5 2.5C9.8 1.7 11.2 3.2 12 3.8C12.8 3.2 14.2 1.7 16.5 2.5C19.5 3.5 20.8 6.5 19.8 9.5C19 12 18.2 15 17.6 20C17.2 23 15.6 23.5 14.6 19.5C13.9 16.5 13.2 14.8 12 14.8C10.8 14.8 10.1 16.5 9.4 19.5C8.4 23.5 6.8 23 6.4 20C5.8 15 5 12 4.2 9.5Z" />
      {/* Subtle enamel groove */}
      <path d="M9 7.5C10.5 8.5 13.5 8.5 15 7.5" opacity="0.4" strokeWidth="1.2" />
    </svg>
  );
}
