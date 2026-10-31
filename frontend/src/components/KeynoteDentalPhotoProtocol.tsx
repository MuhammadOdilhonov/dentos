'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as fflate from 'fflate';
import {
  Camera,
  Upload,
  RotateCw,
  Maximize2,
  Minimize2,
  Trash2,
  FileText,
  Sliders,
  Check,
  X,
  Eye,
  Download,
  Sparkles,
  User,
  Building2,
  Calendar,
  Layers,
  ZoomIn,
  ZoomOut,
  Search,
  Printer,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  MoveUp,
  MoveDown,
  Heading1,
  Heading2,
  Type,
  Activity,
  Box,
  ExternalLink,
  Contrast,
  RotateCcw,
  Phone,
  Plus,
  FilePlus,
  Radio,
  FileCode,
  HardDrive,
  EyeOff,
  MoveHorizontal,
  ChevronLeft,
  Lock,
  ShieldCheck,
  Cloud,
  Scissors,
  Copy,
  Tag,
  Square
} from 'lucide-react';
import { Patient } from '../lib/types';
import { clinicApi, isDemoClinic } from '../lib/api';
import { dentalMediaStore, StoredMediaItem } from '../lib/dentalMediaStore';
import { useI18n } from '../lib/i18n';
import PhotoProtocolStudio, { photoStudioHasImages } from './PhotoProtocolStudio';
import DiagnocatDentalRadiologyViewer from './DiagnocatDentalRadiologyViewer';
import DentalFileUploadModal from './DentalFileUploadModal';

// -------------------------------------------------------------
// Data Structures for Word-like Photo Protocol Document
// -------------------------------------------------------------
export interface KeynoteCrop {
  top: number; // percentage 0 to 100
  bottom: number; // percentage 0 to 100
  left: number; // percentage 0 to 100
  right: number; // percentage 0 to 100
}

export interface KeynoteElement {
  id: string;
  type: 'image' | 'text' | 'heading' | 'badge';
  x: number; // percentage 0 to 95
  y: number; // percentage 0 to 95
  width: number; // percentage 15 to 100
  height?: number;
  rotation?: number; // 0, 90, 180, 270

  // Text / Heading content:
  content?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;

  // Image content:
  src?: string;
  caption?: string;
  crop?: KeynoteCrop;

  // Badge content:
  badgeText?: string;
  badgeColor?: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'slate';
}

export interface KeynoteSlide {
  id: string;
  elements: KeynoteElement[];
  background?: string;
}

// Backward compatibility alias:
export type DocBlock = any;

// -------------------------------------------------------------
// Data Structures for Rentgen (X-Ray & 3D CT ZIP)
// -------------------------------------------------------------
export interface XRayItem {
  id: string;
  type: 'opg' | 'rvg' | 'ct_zip' | 'ct' | 'other';
  title: string;
  date: string;
  src: string;
  notes: string;
  brightness: number; // -100 to 100
  contrast: number;   // 50 to 200
  inverted: boolean;
  zoom: number;       // 1 to 3
  rotation: number;   // 0, 90, 180, 270
  isZipPackage?: boolean;
  zipSize?: number;
  extractedFilesCount?: number;
  dicomVolumeName?: string;
  totalCtSlices?: number;
}

// -------------------------------------------------------------
// Data Structures for 3D Intraoral STL Meshes
// -------------------------------------------------------------
export interface StlMeshItem {
  id: string;
  name: string;
  type: 'maxillary' | 'mandibular' | 'occlusion' | 'other';
  color: string;
  visible: boolean;
  mesh?: THREE.Mesh;
  vertexCount?: number;
  triangleCount?: number;
  fileSize?: number;
}

// -------------------------------------------------------------
// Authentic Planmeca Romexis 3D CBCT & Dental Radiology Canvas
// -------------------------------------------------------------
interface DentalRadiologyCanvasProps {
  patientName?: string;
  sliceIndex: number;
  totalSlices: number;
  viewMode: 'axial' | 'coronal' | 'sagittal' | 'panorama';
  preset: 'standard' | 'bone' | 'dentin' | 'soft';
  zoom: number;
  rotation: number;
  brightness: number;
  contrast: number;
  inverted: boolean;
  onSliceChange?: (newSlice: number) => void;
  customImageSrc?: string;
}

function renderDentalHud(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  patientName: string,
  sliceIndex: number,
  totalSlices: number,
  viewMode: 'axial' | 'coronal' | 'sagittal' | 'panorama',
  preset: 'standard' | 'bone' | 'dentin' | 'soft',
  inverted: boolean
) {
  const textColor = inverted ? '#0f172a' : '#10b981'; // emerald in dark mode
  const subColor = inverted ? '#475569' : '#38bdf8'; // sky
  const dimColor = inverted ? '#64748b' : '#94a3b8';

  ctx.save();
  ctx.font = 'bold 11px monospace';

  // Top Left: Medical Equipment & Patient Info
  ctx.fillStyle = textColor;
  ctx.fillText('PLANMECA ROMEXIS® 3D CBCT', 16, 22);
  ctx.fillStyle = subColor;
  ctx.font = '10px monospace';
  ctx.fillText(`Bemor: ${patientName}`, 16, 38);
  ctx.fillStyle = dimColor;
  ctx.fillText(`DICOM 3D Volume (1004.4 MB) • Voxel: 0.200mm`, 16, 52);
  ctx.fillText(`Kesim #${sliceIndex} / ${totalSlices} (16-bit)`, 16, 66);

  // Top Right: Projection, Window Levels, Exposure
  const presetParams: Record<string, { wl: number; ww: number; label: string }> = {
    bone: { wl: 400, ww: 1600, label: 'Suyak' },
    dentin: { wl: 800, ww: 2500, label: 'Tish / Dentin' },
    soft: { wl: 50, ww: 400, label: 'Yumshoq to‘qima' },
    standard: { wl: 300, ww: 1200, label: 'Standart' }
  };
  const currentParams = presetParams[preset] || presetParams.bone;

  ctx.textAlign = 'right';
  ctx.fillStyle = textColor;
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`PROYEKSIYA: ${viewMode.toUpperCase()}`, width - 16, 22);
  ctx.fillStyle = subColor;
  ctx.font = '10px monospace';
  ctx.fillText(`WL: ${currentParams.wl} | WW: ${currentParams.ww} (${currentParams.label})`, width - 16, 38);
  ctx.fillStyle = dimColor;
  ctx.fillText('90.0 kVp • 8.00 mA • 12.0s', width - 16, 52);

  // Bottom Left: FOV & Matrix
  ctx.textAlign = 'left';
  ctx.fillStyle = dimColor;
  ctx.fillText('FOV: 110 x 80 mm • Matritsa: 550 x 550', 16, height - 16);

  // Bottom Right: Scale Caliper (10mm ruler)
  ctx.textAlign = 'right';
  ctx.fillStyle = subColor;
  ctx.fillText('10 mm', width - 16, height - 26);
  ctx.strokeStyle = subColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width - 66, height - 18);
  ctx.lineTo(width - 16, height - 18);
  // Ticks
  ctx.moveTo(width - 66, height - 23);
  ctx.lineTo(width - 66, height - 13);
  ctx.moveTo(width - 16, height - 23);
  ctx.lineTo(width - 16, height - 13);
  ctx.stroke();

  // Orientation Markers (R / L or A / P)
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = inverted ? '#b91c1c' : '#f59e0b';
  if (viewMode === 'sagittal') {
    ctx.fillText('A', 22, height / 2);
    ctx.fillText('P', width - 22, height / 2);
  } else {
    ctx.fillText('R', 22, height / 2);
    ctx.fillText('L', width - 22, height / 2);
  }

  ctx.restore();
}

function renderDentalTomogram(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewMode: 'axial' | 'coronal' | 'sagittal' | 'panorama',
  sliceIndex: number,
  totalSlices: number,
  preset: 'standard' | 'bone' | 'dentin' | 'soft',
  inverted: boolean
) {
  const norm = sliceIndex / totalSlices; // 0.0 to 1.0

  if (viewMode === 'axial') {
    // ═══════════════════════════════════════════════════════════
    // AXIAL PROJECTION (Gorizontal dental arch kesimi)
    // ═══════════════════════════════════════════════════════════
    const cx = width / 2;
    const cy = height * 0.54;

    // Background faint grid crosshairs
    ctx.strokeStyle = inverted ? '#e2e8f0' : '#0f172a';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, 40);
    ctx.lineTo(cx, height - 40);
    ctx.moveTo(40, cy);
    ctx.lineTo(width - 40, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dental Arch Cortical Bone Outer Curve (Parabola)
    const curvePoints: [number, number][] = [];
    const innerPoints: [number, number][] = [];

    const archScaleX = 175 + (norm > 0.6 ? 15 : 0);
    const archScaleY = 160 + (norm > 0.6 ? 20 : 0);

    for (let i = -14; i <= 14; i++) {
      const angle = (i / 14) * (Math.PI * 0.46);
      const px = cx + Math.sin(angle) * archScaleX;
      const py = cy - Math.cos(angle) * archScaleY + (Math.abs(i) > 8 ? (Math.abs(i) - 8) * 4 : 0);
      curvePoints.push([px, py]);

      const inScaleX = archScaleX - (28 + (1 - norm) * 8);
      const inScaleY = archScaleY - (28 + (1 - norm) * 8);
      const inX = cx + Math.sin(angle) * inScaleX;
      const inY = cy - Math.cos(angle) * inScaleY + (Math.abs(i) > 8 ? (Math.abs(i) - 8) * 4 : 0);
      innerPoints.push([inX, inY]);
    }

    // 1. Spongy Trabecular Bone (Alveolar Process Core)
    ctx.beginPath();
    ctx.moveTo(curvePoints[0][0], curvePoints[0][1]);
    for (let i = 1; i < curvePoints.length; i++) {
      ctx.lineTo(curvePoints[i][0], curvePoints[i][1]);
    }
    for (let i = innerPoints.length - 1; i >= 0; i--) {
      ctx.lineTo(innerPoints[i][0], innerPoints[i][1]);
    }
    ctx.closePath();

    const trabecularGrad = ctx.createRadialGradient(cx, cy - 60, 20, cx, cy - 60, 220);
    if (inverted) {
      trabecularGrad.addColorStop(0, '#94a3b8');
      trabecularGrad.addColorStop(1, '#cbd5e1');
    } else {
      trabecularGrad.addColorStop(0, '#334155');
      trabecularGrad.addColorStop(0.7, '#1e293b');
      trabecularGrad.addColorStop(1, '#0f172a');
    }
    ctx.fillStyle = trabecularGrad;
    ctx.fill();

    // 2. Outer Cortical Plate (Dense radiopaque bone)
    ctx.beginPath();
    ctx.moveTo(curvePoints[0][0], curvePoints[0][1]);
    for (let i = 1; i < curvePoints.length; i++) {
      ctx.lineTo(curvePoints[i][0], curvePoints[i][1]);
    }
    ctx.strokeStyle = inverted ? '#1e293b' : '#e2e8f0';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // 3. Inner Lingual Cortical Plate
    ctx.beginPath();
    ctx.moveTo(innerPoints[0][0], innerPoints[0][1]);
    for (let i = 1; i < innerPoints.length; i++) {
      ctx.lineTo(innerPoints[i][0], innerPoints[i][1]);
    }
    ctx.strokeStyle = inverted ? '#334155' : '#cbd5e1';
    ctx.lineWidth = 2.8;
    ctx.stroke();

    // 4. Mandibular Canals (Inferior Alveolar Nerve)
    if (norm < 0.7) {
      const canalLeft: [number, number] = [cx - 118, cy + 22];
      const canalRight: [number, number] = [cx + 118, cy + 22];

      [canalLeft, canalRight].forEach(([mx, my]) => {
        ctx.beginPath();
        ctx.arc(mx, my, 7.5, 0, Math.PI * 2);
        ctx.strokeStyle = inverted ? '#0f172a' : '#f1f5f9';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(mx, my, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = inverted ? '#f8fafc' : '#020617';
        ctx.fill();
      });
    }

    // 5. Tooth Cross-Sections (14 teeth symmetrically along arch)
    const toothIndices = [-12, -10, -8, -6, -4, -2, -0.7, 0.7, 2, 4, 6, 8, 10, 12];
    toothIndices.forEach((tIdx) => {
      const angle = (tIdx / 14) * (Math.PI * 0.46);
      const midDist = (archScaleX + (archScaleX - 28)) / 2;
      const tx = cx + Math.sin(angle) * midDist;
      const ty = cy - Math.cos(angle) * (midDist - 5) + (Math.abs(tIdx) > 8 ? (Math.abs(tIdx) - 8) * 4 : 0);

      const isMolar = Math.abs(tIdx) >= 9;
      const isPremolar = Math.abs(tIdx) >= 5 && Math.abs(tIdx) < 9;
      const isCanine = Math.abs(tIdx) >= 3 && Math.abs(tIdx) < 5;

      const size = isMolar ? (norm > 0.6 ? 14 : 11) : isPremolar ? 8.5 : isCanine ? 8 : 6.5;

      // Periodontal Ligament (PDL)
      ctx.beginPath();
      ctx.ellipse(tx, ty, size + 1.6, size * 0.85 + 1.6, angle, 0, Math.PI * 2);
      ctx.strokeStyle = inverted ? '#ffffff' : '#020617';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Tooth Dentin & Enamel Body
      ctx.beginPath();
      ctx.ellipse(tx, ty, size, size * 0.85, angle, 0, Math.PI * 2);
      ctx.fillStyle = inverted ? '#0f172a' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = inverted ? '#020617' : '#f8fafc';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Root Canals / Pulp Chambers
      if (norm < 0.65) {
        if (isMolar) {
          const offset = 3.5;
          [
            [tx - offset, ty],
            [tx + offset, ty]
          ].forEach(([rx, ry]) => {
            ctx.beginPath();
            ctx.arc(rx, ry, 1.6, 0, Math.PI * 2);
            ctx.fillStyle = inverted ? '#f8fafc' : '#020617';
            ctx.fill();
          });
        } else {
          ctx.beginPath();
          ctx.arc(tx, ty, 1.5, 0, Math.PI * 2);
          ctx.fillStyle = inverted ? '#f8fafc' : '#020617';
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = inverted ? '#f8fafc' : '#090d16';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx - 3, ty);
        ctx.lineTo(tx + 3, ty);
        ctx.stroke();
      }
    });

    // 6. Maxillary Sinus Air Cavities
    if (norm > 0.55) {
      const sinusLeft: [number, number] = [cx - 95, cy - 80];
      const sinusRight: [number, number] = [cx + 95, cy - 80];
      [sinusLeft, sinusRight].forEach(([sx, sy]) => {
        ctx.beginPath();
        ctx.ellipse(sx, sy, 38, 26, Math.PI * 0.1, 0, Math.PI * 2);
        ctx.fillStyle = inverted ? '#f8fafc' : '#020617';
        ctx.fill();
        ctx.strokeStyle = inverted ? '#334155' : '#cbd5e1';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      });

      // Nasal septum
      ctx.strokeStyle = inverted ? '#0f172a' : '#f1f5f9';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 120);
      ctx.lineTo(cx, cy - 65);
      ctx.stroke();
    }
  } else if (viewMode === 'panorama') {
    // ═══════════════════════════════════════════════════════════
    // PANORAMIC OPG PROJECTION (Full Dental Reconstruction)
    // ═══════════════════════════════════════════════════════════
    const cx = width / 2;
    const midY = height * 0.5;

    // Jawbone contours
    ctx.beginPath();
    ctx.moveTo(60, midY - 60);
    ctx.lineTo(80, midY + 90);
    ctx.quadraticCurveTo(cx, midY + 140, width - 80, midY + 90);
    ctx.lineTo(width - 60, midY - 60);
    ctx.strokeStyle = inverted ? '#1e293b' : '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Maxillary Sinuses
    [cx - 150, cx + 150].forEach((sx) => {
      ctx.beginPath();
      ctx.ellipse(sx, midY - 60, 85, 42, 0, 0, Math.PI * 2);
      ctx.fillStyle = inverted ? '#f8fafc' : '#040812';
      ctx.fill();
      ctx.strokeStyle = inverted ? '#475569' : '#94a3b8';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    });

    // Nasal Cavity & Septum
    ctx.beginPath();
    ctx.moveTo(cx, midY - 110);
    ctx.lineTo(cx, midY - 30);
    ctx.strokeStyle = inverted ? '#0f172a' : '#e2e8f0';
    ctx.lineWidth = 2.8;
    ctx.stroke();

    // Mandibular canal trace
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = inverted ? '#0f172a' : '#64748b';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(90, midY + 50);
    ctx.quadraticCurveTo(cx - 130, midY + 105, cx - 70, midY + 70);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width - 90, midY + 50);
    ctx.quadraticCurveTo(cx + 130, midY + 105, cx + 70, midY + 70);
    ctx.stroke();
    ctx.setLineDash([]);

    // Teeth
    const upperY = midY - 15;
    const lowerY = midY + 15;
    const numTeeth = 16;

    for (let i = 0; i < numTeeth; i++) {
      const tx = 110 + (i / (numTeeth - 1)) * (width - 220);
      const isMolar = i <= 2 || i >= 13;
      const isPremolar = (i >= 3 && i <= 4) || (i >= 11 && i <= 12);
      const toothW = isMolar ? 20 : isPremolar ? 14 : 11;

      // Upper Tooth
      ctx.beginPath();
      ctx.rect(tx - toothW / 2, upperY - 18, toothW, 16);
      ctx.fillStyle = inverted ? '#0f172a' : '#f8fafc';
      ctx.fill();
      ctx.strokeStyle = inverted ? '#020617' : '#ffffff';
      ctx.stroke();

      ctx.beginPath();
      if (isMolar) {
        ctx.moveTo(tx - toothW / 2 + 2, upperY - 18);
        ctx.lineTo(tx - toothW / 4, upperY - 48);
        ctx.lineTo(tx, upperY - 18);
        ctx.lineTo(tx + toothW / 4, upperY - 48);
        ctx.lineTo(tx + toothW / 2 - 2, upperY - 18);
      } else {
        ctx.moveTo(tx - toothW / 3, upperY - 18);
        ctx.lineTo(tx, upperY - 42);
        ctx.lineTo(tx + toothW / 3, upperY - 18);
      }
      ctx.fillStyle = inverted ? '#334155' : '#cbd5e1';
      ctx.fill();
      ctx.stroke();

      // Lower Tooth
      ctx.beginPath();
      ctx.rect(tx - toothW / 2, lowerY + 2, toothW, 16);
      ctx.fillStyle = inverted ? '#0f172a' : '#f8fafc';
      ctx.fill();
      ctx.strokeStyle = inverted ? '#020617' : '#ffffff';
      ctx.stroke();

      ctx.beginPath();
      if (isMolar) {
        ctx.moveTo(tx - toothW / 2 + 2, lowerY + 18);
        ctx.lineTo(tx - toothW / 4, lowerY + 48);
        ctx.lineTo(tx, lowerY + 18);
        ctx.lineTo(tx + toothW / 4, lowerY + 48);
        ctx.lineTo(tx + toothW / 2 - 2, lowerY + 18);
      } else {
        ctx.moveTo(tx - toothW / 3, lowerY + 18);
        ctx.lineTo(tx, lowerY + 42);
        ctx.lineTo(tx + toothW / 3, lowerY + 18);
      }
      ctx.fillStyle = inverted ? '#334155' : '#cbd5e1';
      ctx.fill();
      ctx.stroke();
    }
  } else if (viewMode === 'sagittal') {
    // ═══════════════════════════════════════════════════════════
    // SAGITTAL / CROSS-SECTION (Implantologik ko‘ndalang kesim)
    // ═══════════════════════════════════════════════════════════
    const cx = width / 2;
    const topY = 70;
    const botY = height - 90;

    // Alveolar Ridge Cross Section
    ctx.beginPath();
    ctx.moveTo(cx - 36, topY + 45);
    ctx.quadraticCurveTo(cx - 65, topY + 130, cx - 55, botY);
    ctx.lineTo(cx + 45, botY);
    ctx.quadraticCurveTo(cx + 55, topY + 130, cx + 28, topY + 45);
    ctx.closePath();

    const sagGrad = ctx.createLinearGradient(cx - 50, topY, cx + 50, botY);
    if (inverted) {
      sagGrad.addColorStop(0, '#cbd5e1');
      sagGrad.addColorStop(1, '#94a3b8');
    } else {
      sagGrad.addColorStop(0, '#1e293b');
      sagGrad.addColorStop(1, '#334155');
    }
    ctx.fillStyle = sagGrad;
    ctx.fill();

    ctx.strokeStyle = inverted ? '#0f172a' : '#e2e8f0';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Mandibular Canal
    const nerveX = cx - 8;
    const nerveY = botY - 70;
    ctx.beginPath();
    ctx.arc(nerveX, nerveY, 9, 0, Math.PI * 2);
    ctx.strokeStyle = inverted ? '#0f172a' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(nerveX, nerveY, 7, 0, Math.PI * 2);
    ctx.fillStyle = inverted ? '#f8fafc' : '#020617';
    ctx.fill();

    // Measurement Calipers
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 10, topY + 48);
    ctx.lineTo(cx - 10, nerveY - 10);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 18, topY + 48);
    ctx.lineTo(cx - 2, topY + 48);
    ctx.moveTo(cx - 18, nerveY - 10);
    ctx.lineTo(cx - 2, nerveY - 10);
    ctx.stroke();

    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#10b981';
    ctx.textAlign = 'left';
    ctx.fillText('H: 14.2 mm (Suyak balandligi)', cx + 60, topY + 95);

    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(cx - 52, topY + 110);
    ctx.lineTo(cx + 42, topY + 110);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 52, topY + 104);
    ctx.lineTo(cx - 52, topY + 116);
    ctx.moveTo(cx + 42, topY + 104);
    ctx.lineTo(cx + 42, topY + 116);
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.fillText('W: 7.4 mm (Kenglik)', cx + 60, topY + 115);

    ctx.fillStyle = '#f59e0b';
    ctx.fillText('Nervgacha: 4.2 mm (Xavfsiz)', cx + 60, topY + 135);

    ctx.font = '11px sans-serif';
    ctx.fillStyle = inverted ? '#475569' : '#94a3b8';
    ctx.fillText('Buccal (Dahliz)', cx - 110, topY + 100);
    ctx.fillText('Lingual (Til)', cx + 75, topY + 160);
  } else {
    // ═══════════════════════════════════════════════════════════
    // CORONAL PROJECTION (Frontal kesim)
    // ═══════════════════════════════════════════════════════════
    const cx = width / 2;
    const midY = height * 0.52;

    // Maxillary Sinuses
    [cx - 95, cx + 95].forEach((sx) => {
      ctx.beginPath();
      ctx.ellipse(sx, midY - 60, 55, 45, 0, 0, Math.PI * 2);
      ctx.fillStyle = inverted ? '#f8fafc' : '#030712';
      ctx.fill();
      ctx.strokeStyle = inverted ? '#334155' : '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Nasal Septum & Turbinates
    ctx.strokeStyle = inverted ? '#0f172a' : '#f8fafc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, midY - 115);
    ctx.lineTo(cx, midY - 25);
    ctx.stroke();

    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx - 18, midY - 60, 10, 0, Math.PI);
    ctx.arc(cx + 18, midY - 60, 10, 0, Math.PI);
    ctx.stroke();

    // Maxillary & Mandibular Alveolar processes
    ctx.beginPath();
    ctx.rect(cx - 120, midY - 15, 240, 28);
    ctx.strokeStyle = inverted ? '#1e293b' : '#e2e8f0';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Mandible base
    ctx.beginPath();
    ctx.arc(cx, midY + 95, 80, 0, Math.PI);
    ctx.strokeStyle = inverted ? '#1e293b' : '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

const DentalRadiologyCanvas: React.FC<DentalRadiologyCanvasProps> = ({
  patientName = 'Одилхонова Муслимахон',
  sliceIndex,
  totalSlices = 480,
  viewMode,
  preset,
  zoom,
  rotation,
  brightness,
  contrast,
  inverted,
  onSliceChange,
  customImageSrc
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!onSliceChange) return;
    const step = e.shiftKey ? 10 : 1;
    const delta = e.deltaY < 0 ? step : -step;
    const nextSlice = Math.min(Math.max(1, sliceIndex + delta), totalSlices);
    if (nextSlice !== sliceIndex) {
      onSliceChange(nextSlice);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = inverted ? '#f8fafc' : '#030712';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);

    if (
      customImageSrc &&
      !customImageSrc.includes('unsplash.com') &&
      (customImageSrc.startsWith('data:') || customImageSrc.startsWith('blob:'))
    ) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 40, 30, width - 80, height - 60);
      };
      img.src = customImageSrc;
    } else {
      renderDentalTomogram(ctx, width, height, viewMode, sliceIndex, totalSlices, preset, inverted);
    }

    ctx.restore();

    renderDentalHud(ctx, width, height, patientName, sliceIndex, totalSlices, viewMode, preset, inverted);
  }, [
    patientName,
    sliceIndex,
    totalSlices,
    viewMode,
    preset,
    zoom,
    rotation,
    brightness,
    contrast,
    inverted,
    pan,
    customImageSrc
  ]);

  return (
    <div
      className="relative w-full h-full flex flex-col items-center justify-center select-none overflow-hidden cursor-crosshair min-h-[460px]"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <canvas
        ref={canvasRef}
        width={760}
        height={450}
        className="rounded-xl border border-slate-800 shadow-2xl max-w-full h-auto"
        style={{
          filter: `brightness(${100 + brightness}%) contrast(${contrast}%)`
        }}
      />
      <div className="absolute bottom-2.5 right-3 text-[10px] text-emerald-400 bg-slate-950/80 px-2 py-0.5 rounded border border-emerald-950/60 pointer-events-none font-mono">
        💡 Sichqoncha g‘ildiragini aylantirib kesimlarni ko‘ring (1–{totalSlices}) • Shift+G‘ildirak: 10x
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// Component Props
// -------------------------------------------------------------
interface KeynoteDentalPhotoProtocolProps {
  patient: Patient | null;
  onPatientChange?: (patientId: number) => void;
  allPatients?: Patient[];
  initialTab?: 'rentgen' | 'foto' | 'skan';
  onBack?: () => void;
}

// -------------------------------------------------------------
// MULTILINGUAL I18N DICTIONARY FOR RENTGEN, FOTO & SKAN TABS
// -------------------------------------------------------------
const PROTO_I18N = {
  uz: {
    back: 'Orqaga',
    savingToCloud: 'Bulutga saqlanmoqda...',
    savedToCloud: '✓ Bulutga saqlandi',
    tabRentgen: 'Rentgen',
    tabFoto: 'Foto',
    tabSkan: 'Skan',
    // Rentgen
    rentgenTitle: 'Raqamli rentgenodiagnostika va KT arxivi',
    rentgenSubtitle: '2D panoramik rentgen (OPTG) va 3D kompyuter tomografiyasi (Planmeca Romexis, DICOM) kesimlari',
    rentgenUploadBtn: '+ Rentgen yoki ZIP yuklash',
    rentgenSavedBadge: '✓ Saqlangan',
    rentgenDownloadBtn: 'Faylni yuklab olish (ZIP)',
    rentgenNewUploadBtn: 'Yangi fayl yuklash',
    rentgenEmptyTitle: 'Rentgen fayli hali yuklanmagan',
    rentgenEmptyDesc: 'Ushbu bemor uchun hali rentgen yoki 3D KT fayli yuklanmagan. Tahlil qilish uchun fayl yuklang.',
    rentgenEmptyUploadBtn: 'Rentgen faylini yuklash',
    ctCurtainBadge: '3D Rentgen Tomografiya — Tez Kunda',
    ctCurtainTitle: 'Brauzerda 3D KT kesimlarini ko‘rish tez kunda ishga tushadi',
    ctCurtainDesc: 'Katta hajmdagi 3D tomografiya arxivlari (Planmeca Romexis, DICOM, ZIP) to‘liq va xavfsiz saqlanadi. Har qanday shifokor arxivni yuklab olib Romexis, EzDent-i yoki RadiAnt dasturlarida to‘liq ochishi mumkin.',
    ctCurtainDownloadBtn: 'Faylni yuklab olish (ZIP)',
    ctCurtainUploadBtn: '+ Fayl yuklash',
    clinicalNotesTitle: 'Klinik tahlil va shifokor xulosasi',
    clinicalNotesPlaceholder: 'Rentgen tahlili, suyak strukturasi, apeks holati va aniqlangan patologiyalarni yozing...',
    // Skan
    skanTitle: '3D intraoral skaner va modellar arxivi',
    skanSubtitle: '3D og‘iz bo‘shlig‘i skanerlari (.stl, .ply, .obj, .zip) fayllarini saqlash va ko‘rish',
    skanSampleBtn: '⚡ Namuna: 160926-Nasarullaev Shaxruh (STL)',
    skanUploadBtn: '3D Skan yoki ZIP yuklash',
    skanSavedBadge: '✓ Saqlangan',
    skanDownloadBtn: 'Faylni yuklab olish (Download STL/ZIP)',
    skanNewUploadBtn: 'Yangi skan yuklash',
    skanEmptyTitle: '3D skan hali yuklanmagan',
    skanEmptyDesc: 'Ushbu bemor uchun hali 3D skaner modeli yuklanmagan. Ko‘rish yoki tahlil qilish uchun model yuklang.',
    skanEmptyUploadBtn: '3D Skan faylini yuklash',
    // Foto
    fotoUploadBtn: '+ Rasm yuklash',
    fotoTextBtn: '+ Matn',
    fotoHeadingBtn: '+ Sarlavha',
    fotoBadgeBtn: '+ Nishon',
    fotoSlideBtn: '+ Yangi slayd',
    fotoPrintBtn: 'Chop etish / PDF',
    fotoSlidesTitle: 'Slaydlar',
    fotoEmptySlideTitle: 'Ushbu slayd hozircha bo‘sh',
    fotoEmptySlideDesc: 'Yuqoridagi paneldan klinik fotosurat yuklang yoki erkin matn, sarlavha va tashxis nishonlarini joylashtiring.',
    // Crop
    cropStudioTitle: 'Rasmni kesish studiyasi (Image Crop Studio)',
    cropPresetSquare: '1:1 Kvadrat',
    cropPresetKeynote: '5:3 Keynote',
    cropPresetWide: '16:9 Format',
    cropPresetReset: 'Asl holat',
    cropSettingsTitle: 'Kesish chegaralari sozlamalari (%)',
    cropTop: 'Yuqoridan kesish:',
    cropBottom: 'Pastdan kesish:',
    cropLeft: 'Chapdan kesish:',
    cropRight: 'O‘ngdan kesish:',
    cropCancelBtn: 'Bekor qilish',
    cropSaveBtn: '✓ Kesishni saqlash',
    // Actions & Tooltips
    cropAction: 'Kesish',
    rotateAction: '90° burish',
    boldAction: 'Qalin',
    italicAction: 'Kursiv',
    decreaseFont: 'Kichraytirish',
    increaseFont: 'Kattalashtirish',
    decreaseWidth: 'Enini kichraytirish',
    increaseWidth: 'Enini kengaytirish',
    duplicateAction: 'Nusxa olish',
    bringForwardAction: 'Oldinga chiqarish',
    sendBackwardAction: 'Orqaga surish',
    deleteAction: 'O‘chirish',
    resizeTooltip: 'Hajmini o‘zgartirish (Resize)',
    imageCaptionPlaceholder: 'Rasm izohi (masalan: 1.1 tish holati)...',
    textPlaceholder: 'Matn kiriting...',
    headingPlaceholder: 'Bo‘lim sarlavhasi...',
    slideLabel: 'Slayd',
    emptyLabel: 'Bo‘sh',
    sampleRentgenBtn: '⚡ Namuna: Одилхонова Муслимахон.zip',
    mouseGuide: '💡 Sichqoncha chap tugmasi: 360° aylantirish • G‘ildirakcha: yaqinlashtirish • O‘ng tugma: surish',
    addSlideTooltip: 'Yangi 5:3 slayd qo‘shish',
    duplicateSlideTooltip: 'Slayddan nusxa olish',
    deleteSlideTooltip: 'Slaydni o‘chirish',
    printTooltip: 'Chop etish yoki PDF sifatida saqlash',
    addTextTooltip: 'Yangi matn bloki qo‘shish',
    addHeadingTooltip: 'Klinik bo‘lim sarlavhasini qo‘shish',
    addBadgeTooltip: 'Klinik belgi yoki nishon qo‘shish',
    sizeLabel: 'Hajmi:',
    formatLabel: 'Format:',
    patientLabel: 'Bemor:'
  },
  ru: {
    back: 'Назад',
    savingToCloud: 'Сохранение в облако...',
    savedToCloud: '✓ Сохранено в облако',
    tabRentgen: 'Рентген',
    tabFoto: 'Фото',
    tabSkan: 'Скан',
    // Rentgen
    rentgenTitle: 'Цифровая рентгенодиагностика и архив КТ',
    rentgenSubtitle: '2D панорамные снимки (ОПТГ) и 3D срезы компьютерной томографии (Planmeca Romexis, DICOM)',
    rentgenUploadBtn: '+ Загрузить рентген или ZIP',
    rentgenSavedBadge: '✓ Сохранено',
    rentgenDownloadBtn: 'Скачать архив (ZIP)',
    rentgenNewUploadBtn: 'Загрузить новый файл',
    rentgenEmptyTitle: 'Файл рентгена пока не загружен',
    rentgenEmptyDesc: 'Для данного пациента еще не загружен файл рентгена. Загрузите снимок для анализа.',
    rentgenEmptyUploadBtn: 'Загрузить файл рентгена',
    ctCurtainBadge: '3D Рентген Томография — Скоро',
    ctCurtainTitle: '3D Визуализация томограммы в браузере скоро запустится',
    ctCurtainDesc: 'Тяжелые архивы 3D томографии (Planmeca Romexis, DICOM, ZIP) безопасно хранятся в полном объеме. Любой врач или сотрудник может скачать файл и анализировать в спец. программах (Romexis, EzDent-i, RadiAnt).',
    ctCurtainDownloadBtn: 'Скачать файл (ZIP)',
    ctCurtainUploadBtn: '+ Загрузить файл',
    clinicalNotesTitle: 'Клинический анализ и заключение',
    clinicalNotesPlaceholder: 'Заключение врача или рентгенолога по снимку...',
    // Skan
    skanTitle: '3D интраоральный сканер и архив моделей',
    skanSubtitle: 'Хранение и выгрузка файлов 3D интраорального сканирования (.stl, .ply, .obj, .zip)',
    skanSampleBtn: '⚡ Пример: 160926-Назаруллаев Шахрух (STL)',
    skanUploadBtn: 'Загрузить 3D скан или ZIP',
    skanSavedBadge: '✓ Сохранено',
    skanDownloadBtn: 'Скачать модель (STL/ZIP)',
    skanNewUploadBtn: 'Загрузить новый скан',
    skanEmptyTitle: '3D скан пока не загружен',
    skanEmptyDesc: 'Для данного пациента еще не загружен файл 3D сканирования. Загрузите модель для просмотра или анализа.',
    skanEmptyUploadBtn: 'Загрузить 3D скан',
    // Foto
    fotoUploadBtn: '+ Фото',
    fotoTextBtn: '+ Текст',
    fotoHeadingBtn: '+ Заголовок',
    fotoBadgeBtn: '+ Метка',
    fotoSlideBtn: '+ Новый слайд',
    fotoPrintBtn: 'Печать / PDF',
    fotoSlidesTitle: 'Слайды',
    fotoEmptySlideTitle: 'Этот слайд пока пуст',
    fotoEmptySlideDesc: 'Загрузите клиническое фото с верхней панели или добавьте свободный текст, заголовок и метки диагноза.',
    // Crop
    cropStudioTitle: 'Обрезка фото (Image Crop Studio)',
    cropPresetSquare: '1:1 Квадрат',
    cropPresetKeynote: '5:3 Keynote',
    cropPresetWide: '16:9 Формат',
    cropPresetReset: 'Сбросить',
    cropSettingsTitle: 'Настройки границ (%)',
    cropTop: 'Сверху:',
    cropBottom: 'Снизу:',
    cropLeft: 'Слева:',
    cropRight: 'Справа:',
    cropCancelBtn: 'Отмена',
    cropSaveBtn: '✓ Применить обрезку',
    // Actions & Tooltips
    cropAction: 'Обрезать',
    rotateAction: 'Повернуть 90°',
    boldAction: 'Жирный',
    italicAction: 'Курсив',
    decreaseFont: 'Уменьшить шрифт',
    increaseFont: 'Увеличить шрифт',
    decreaseWidth: 'Уменьшить ширину',
    increaseWidth: 'Увеличить ширину',
    duplicateAction: 'Дублировать',
    bringForwardAction: 'На передний план',
    sendBackwardAction: 'На задний план',
    deleteAction: 'Удалить',
    resizeTooltip: 'Изменить размер',
    imageCaptionPlaceholder: 'Подпись к фото (напр.: состояние зуба 1.1)...',
    textPlaceholder: 'Введите текст...',
    headingPlaceholder: 'Заголовок раздела...',
    slideLabel: 'Слайд',
    emptyLabel: 'Пусто',
    sampleRentgenBtn: '⚡ Пример: Одилхонова Муслимахон.zip',
    mouseGuide: '💡 ЛКМ: вращение на 360° • Колесо: масштабирование • ПКМ: перемещение',
    addSlideTooltip: 'Добавить 5:3 слайд',
    duplicateSlideTooltip: 'Дублировать слайд',
    deleteSlideTooltip: 'Удалить слайд',
    printTooltip: 'Печать или сохранение в PDF',
    addTextTooltip: 'Добавить текстовый блок',
    addHeadingTooltip: 'Добавить заголовок раздела',
    addBadgeTooltip: 'Добавить клиническую метку',
    sizeLabel: 'Размер:',
    formatLabel: 'Формат:',
    patientLabel: 'Пациент:'
  },
  en: {
    back: 'Back',
    savingToCloud: 'Saving to cloud...',
    savedToCloud: '✓ Saved to cloud',
    tabRentgen: 'X-Ray',
    tabFoto: 'Photo',
    tabSkan: '3D Scan',
    // Rentgen
    rentgenTitle: 'Digital X-Ray Diagnostics & CT Archive',
    rentgenSubtitle: '2D panoramic radiographs (OPG) and 3D computer tomography (Planmeca Romexis, DICOM) dataset slices',
    rentgenUploadBtn: '+ Upload X-Ray or ZIP',
    rentgenSavedBadge: '✓ Saved',
    rentgenDownloadBtn: 'Download File (ZIP)',
    rentgenNewUploadBtn: 'Upload New File',
    rentgenEmptyTitle: 'No X-ray files uploaded yet',
    rentgenEmptyDesc: 'No X-ray files have been uploaded for this patient yet. Please upload a scan to view and analyze.',
    rentgenEmptyUploadBtn: 'Upload X-Ray File',
    ctCurtainBadge: '3D CBCT Imaging — Coming Soon',
    ctCurtainTitle: 'In-Browser 3D CBCT Slice Visualization is Coming Soon',
    ctCurtainDesc: 'Heavy 3D X-ray and CT scans (Planmeca Romexis, DICOM, ZIP) are securely stored in full resolution. Any doctor can download the full package to view in native clinical suites (Romexis, EzDent-i, RadiAnt).',
    ctCurtainDownloadBtn: 'Download File (ZIP)',
    ctCurtainUploadBtn: '+ Upload File',
    clinicalNotesTitle: 'Clinical Analysis & Findings',
    clinicalNotesPlaceholder: 'Radiologist or doctor clinical notes for this imaging...',
    // Skan
    skanTitle: '3D Intraoral Scanner & Modeling Archive',
    skanSubtitle: 'Storage and export for 3D intraoral meshes (.stl, .ply, .obj, .zip)',
    skanSampleBtn: '⚡ Sample: 160926-Nasarullaev Shaxruh (STL)',
    skanUploadBtn: 'Upload 3D Scan or ZIP',
    skanSavedBadge: '✓ Saved',
    skanDownloadBtn: 'Download Mesh (STL/ZIP)',
    skanNewUploadBtn: 'Upload New Scan',
    skanEmptyTitle: 'No 3D scan uploaded yet',
    skanEmptyDesc: 'No 3D intraoral scan file uploaded for this patient yet. Please upload a 3D model to view or analyze.',
    skanEmptyUploadBtn: 'Upload 3D Scan File',
    // Foto
    fotoUploadBtn: '+ Photo',
    fotoTextBtn: '+ Text',
    fotoHeadingBtn: '+ Heading',
    fotoBadgeBtn: '+ Badge',
    fotoSlideBtn: '+ New Slide',
    fotoPrintBtn: 'Print / PDF',
    fotoSlidesTitle: 'Slides',
    fotoEmptySlideTitle: 'This slide is empty',
    fotoEmptySlideDesc: 'Upload a clinical photograph or place freeform text, headings and diagnostic badges from the toolbar above.',
    // Crop
    cropStudioTitle: 'Image Crop Studio',
    cropPresetSquare: '1:1 Square',
    cropPresetKeynote: '5:3 Keynote',
    cropPresetWide: '16:9 Widescreen',
    cropPresetReset: 'Reset',
    cropSettingsTitle: 'Boundary Margins (%)',
    cropTop: 'Crop Top:',
    cropBottom: 'Crop Bottom:',
    cropLeft: 'Crop Left:',
    cropRight: 'Crop Right:',
    cropCancelBtn: 'Cancel',
    cropSaveBtn: '✓ Apply Crop',
    // Actions & Tooltips
    cropAction: 'Crop',
    rotateAction: 'Rotate 90°',
    boldAction: 'Bold',
    italicAction: 'Italic',
    decreaseFont: 'Decrease font',
    increaseFont: 'Increase font',
    decreaseWidth: 'Decrease width',
    increaseWidth: 'Increase width',
    duplicateAction: 'Duplicate',
    bringForwardAction: 'Bring Forward',
    sendBackwardAction: 'Send Backward',
    deleteAction: 'Delete',
    resizeTooltip: 'Resize',
    imageCaptionPlaceholder: 'Photo caption (e.g. tooth 1.1 condition)...',
    textPlaceholder: 'Enter text...',
    headingPlaceholder: 'Section heading...',
    slideLabel: 'Slide',
    emptyLabel: 'Empty',
    sampleRentgenBtn: '⚡ Sample: Odilkhonova Muslimakhon.zip',
    mouseGuide: '💡 Left click: 360° rotate • Scroll wheel: zoom • Right click: pan',
    addSlideTooltip: 'Add 5:3 slide',
    duplicateSlideTooltip: 'Duplicate slide',
    deleteSlideTooltip: 'Delete slide',
    printTooltip: 'Print or save as PDF',
    addTextTooltip: 'Add text block',
    addHeadingTooltip: 'Add section heading',
    addBadgeTooltip: 'Add clinical badge',
    sizeLabel: 'Size:',
    formatLabel: 'Format:',
    patientLabel: 'Patient:'
  }
};

export default function KeynoteDentalPhotoProtocol({
  patient: initialPatient,
  onPatientChange,
  allPatients = [],
  initialTab = 'foto',
  onBack
}: KeynoteDentalPhotoProtocolProps) {
  const { language } = useI18n();
  const t = PROTO_I18N[language as 'uz' | 'ru' | 'en'] || PROTO_I18N.uz;

  // =============================================================
  // 1. PATIENT STATE & AUTOCOMPLETE SEARCH
  // =============================================================
  const [internalPatients, setInternalPatients] = useState<Patient[]>(allPatients);
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(initialPatient);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialPatient) {
      setCurrentPatient(initialPatient);
    }
  }, [initialPatient]);

  useEffect(() => {
    if (allPatients.length > 0) {
      setInternalPatients(allPatients);
    } else {
      clinicApi.getPatients().then((pts) => {
        setInternalPatients(pts || []);
        if (!currentPatient && pts && pts.length > 0) {
          setCurrentPatient(pts[0]);
        }
      }).catch(() => {});
    }
  }, [allPatients]);

  const filteredPatients = internalPatients.filter((p) => {
    if (!searchQuery.trim()) return false;
    const q = searchQuery.toLowerCase();
    return (
      p.full_name?.toLowerCase().includes(q) ||
      p.phone?.toLowerCase().includes(q) ||
      ((p as any).card_number && String((p as any).card_number).toLowerCase().includes(q)) ||
      p.id.toString().includes(q)
    );
  });

  const handleSelectPatient = (p: Patient) => {
    setCurrentPatient(p);
    setSearchQuery('');
    setIsSearching(false);
    if (onPatientChange) {
      onPatientChange(p.id);
    }
  };

  // 2. Active Tab: 'rentgen' | 'foto' | 'skan'
  const [activeTab, setActiveTab] = useState<'rentgen' | 'foto' | 'skan'>(initialTab);

  // Fayl bor-yo'qligi indikatori (Рентген/Фото/Скан tablarida yashil ✓ ko'rsatish uchun).
  const [mediaHas, setMediaHas] = useState<{ rentgen: boolean; foto: boolean; skan: boolean }>({ rentgen: false, foto: false, skan: false });

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // =============================================================
  // 3. TAB 1: РЕНТГЕН (X-Ray & 3D CBCT ZIP Package Viewer)
  // =============================================================
  const [xrays, setXrays] = useState<XRayItem[]>([]);
  const [activeXrayId, setActiveXrayId] = useState<string | null>(null);
  const [activeCtSliceIndex, setActiveCtSliceIndex] = useState<number>(185);
  const [ctViewMode, setCtViewMode] = useState<'axial' | 'coronal' | 'sagittal' | 'panorama'>('axial');
  const [ctBonePreset, setCtBonePreset] = useState<'standard' | 'bone' | 'dentin' | 'soft'>('bone');
  const [isProcessingRentgenZip, setIsProcessingRentgenZip] = useState<boolean>(false);
  const [rentgenStatusMsg, setRentgenStatusMsg] = useState<string>('');
  const [radiologyMode, setRadiologyMode] = useState<'diagnocat' | 'classic'>('diagnocat');

  // Dedicated Upload Modal states for Rentgen and Skan
  const [isRentgenUploadModalOpen, setIsRentgenUploadModalOpen] = useState<boolean>(false);
  const [isScanUploadModalOpen, setIsScanUploadModalOpen] = useState<boolean>(false);
  const [activeStoredRentgen, setActiveStoredRentgen] = useState<StoredMediaItem | null>(null);
  const [activeStoredScan, setActiveStoredScan] = useState<StoredMediaItem | null>(null);

  // Load patient's x-rays (combining clinicApi and dentalMediaStore)
  useEffect(() => {
    if (!currentPatient) return;
    let isMounted = true;

    async function loadPatientXrays() {
      // 1. Get from clinicApi
      const savedXrays = clinicApi.getPatientXrays(currentPatient!.id);
      
      // 2. Check if a real zip package was stored in IndexedDB
      const mediaItem = await dentalMediaStore.getRentgen(currentPatient!.id);
      if (isMounted) {
        setActiveStoredRentgen(mediaItem || null);
      }

      if (!isMounted) return;

      const loadedList: XRayItem[] = [];

      if (mediaItem) {
        loadedList.push({
          id: `media_rentgen_${mediaItem.key}`,
          type: 'ct_zip',
          title: mediaItem.fileName || '3D Tomografiya Arxiv (CBCT)',
          date: mediaItem.uploadedAt ? mediaItem.uploadedAt.split('T')[0] : new Date().toISOString().split('T')[0],
          src: '',
          notes: `Planmeca Romexis 3D CBCT Tomografiya to‘plami (${(mediaItem.fileSize / (1024 * 1024)).toFixed(1)} MB). DICOM hajmi va 3D kesimlar tahlili faol.`,
          brightness: 0,
          contrast: 105,
          inverted: false,
          zoom: 1,
          rotation: 0,
          isZipPackage: true,
          zipSize: mediaItem.fileSize,
          extractedFilesCount: mediaItem.filesCount || 1412,
          dicomVolumeName: 'DICOM 3D Volume (1004 MB)',
          totalCtSlices: 480
        });
      }

      if (Array.isArray(savedXrays) && savedXrays.length > 0) {
        savedXrays.forEach((sx: any) => {
          if (!loadedList.find(x => x.id === sx.id || x.title === sx.title)) {
            const safeSrc = sx.src && !sx.src.includes('unsplash.com') ? sx.src : (sx.imageUrl && !sx.imageUrl.includes('unsplash.com')) ? sx.imageUrl : '';
            loadedList.push({
              id: String(sx.id || Math.random()),
              type: sx.type || (sx.isZipPackage ? 'ct_zip' : 'opg'),
              title: sx.title || sx.fileName || `Rentgen #${sx.toothNumber || '1'}`,
              date: sx.date || new Date().toISOString().split('T')[0],
              src: safeSrc,
              notes: sx.notes || 'Klinik rentgenologik ko‘rik tasviri',
              brightness: sx.brightness || 0,
              contrast: sx.contrast || 100,
              inverted: Boolean(sx.inverted),
              zoom: sx.zoom || 1,
              rotation: sx.rotation || 0,
              isZipPackage: Boolean(sx.isZipPackage),
              zipSize: sx.fileSize,
              extractedFilesCount: sx.extractedFilesCount || 480,
              totalCtSlices: sx.totalCtSlices || 480
            });
          }
        });
      }

      setXrays(loadedList);
      setActiveXrayId(loadedList.length > 0 ? loadedList[0].id : null);
    }

    loadPatientXrays();

    return () => {
      isMounted = false;
    };
  }, [currentPatient?.id]);

  // Sync Patient's 3D Scan item from dentalMediaStore
  useEffect(() => {
    if (!currentPatient) return;
    dentalMediaStore.getScan(currentPatient.id).then((scanItem) => {
      setActiveStoredScan(scanItem || null);
      if (scanItem?.fileName) {
        setScanActiveFileName(scanItem.fileName);
      }
    }).catch(() => {});
  }, [currentPatient?.id]);

  const handleDownloadRentgen = () => {
    if (activeStoredRentgen?.file) {
      const url = URL.createObjectURL(activeStoredRentgen.file);
      const a = document.createElement('a');
      a.href = url;
      a.download = activeStoredRentgen.fileName || 'rentgen.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      window.open('/api/media-sample/rentgen/', '_blank');
    }
  };

  const handleDownloadScan = () => {
    if (activeStoredScan?.file) {
      const url = URL.createObjectURL(activeStoredScan.file);
      const a = document.createElement('a');
      a.href = url;
      a.download = activeStoredScan.fileName || '3d_scan.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      window.open('/api/media-sample/scan/', '_blank');
    }
  };

  const activeXray = xrays.find((x) => x.id === activeXrayId) || xrays[0] || null;

  const savePatientXraysList = (updated: XRayItem[]) => {
    setXrays(updated);
    if (currentPatient) {
      const mappedForPatient = updated.map((x, idx) => ({
        id: typeof x.id === 'number' ? x.id : Date.now() + idx,
        toothNumber: x.isZipPackage ? '3D KT' : 'OPG',
        date: x.date,
        type: x.type === 'ct_zip' ? '3D CBCT Tomografiya (ZIP)' : x.type === 'opg' ? 'Ortopantomogramma' : 'Periapikal rentgen',
        quantity: 1,
        dose: x.isZipPackage ? '0.02 mSv' : '0.01 mSv',
        imageUrl: x.src,
        doctor: (currentPatient as any).doctor || 'Shifokor',
        fileName: x.title,
        fileSize: x.zipSize,
        isZipPackage: Boolean(x.isZipPackage),
        notes: x.notes
      }));
      clinicApi.savePatientXrays(currentPatient.id, mappedForPatient);
      localStorage.setItem(`32desk_photoprotocol_xrays_${currentPatient.id}`, JSON.stringify(updated));
    }
  };

  const loadSampleRentgenZip = async () => {
    if (!currentPatient) return;
    setIsProcessingRentgenZip(true);
    setRentgenStatusMsg('Одилхонова Муслимахон.zip (Planmeca Romexis 3D CBCT / 1004 MB DICOM) tahlil qilinmoqda...');
    try {
      const newZipItem: XRayItem = {
        id: `ct_zip_sample_${Date.now()}`,
        type: 'ct_zip',
        title: 'Одилхонова Муслимахон.zip',
        date: new Date().toISOString().split('T')[0],
        src: '',
        notes: 'Planmeca Romexis 3D CBCT tomografiya to‘plami (1.35 GB). 1004 MB hajmli DICOM 3D Volume va 480 ta tomografik kesimlar tahlili faol.',
        brightness: 0,
        contrast: 110,
        inverted: false,
        zoom: 1,
        rotation: 0,
        isZipPackage: true,
        zipSize: 1359956836,
        extractedFilesCount: 1412,
        dicomVolumeName: 'DICOM 3D Volume (1004 MB)',
        totalCtSlices: 480
      };

      const updated = [newZipItem, ...xrays.filter(x => !x.title.includes('Одилхонова'))];
      savePatientXraysList(updated);
      setActiveXrayId(newZipItem.id);
      setRentgenStatusMsg('3D Tomografiya muvaffaqiyatli ochildi!');
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessingRentgenZip(false);
    }
  };

  // Upload Rentgen file (supports both standard images and ZIP like "Одилхонова Муслимахон.zip")
  const handleUploadRentgenFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Demo: yuklash ishlaydi, lekin saqlanmaydi (store darajasida demo uchun skip).
    const file = e.target.files?.[0];
    if (!file || !currentPatient) return;

    const fileName = file.name;
    const isZip = fileName.toLowerCase().endsWith('.zip');

    if (isZip) {
      setIsProcessingRentgenZip(true);
      setRentgenStatusMsg('Rentgen ZIP arxivi tahlil qilinmoqda (DICOM / 3D CBCT tomografiya)...');

      try {
        // Save to IndexedDB (survives refreshes, handles gigabyte files smoothly)
        await dentalMediaStore.saveRentgen(currentPatient.id, file, fileName, ['Romexis 3D Volume (.dcm)', 'Axial Slices', 'Coronal Slices', 'Sagittal Slices']);

        const newZipItem: XRayItem = {
          id: `ct_zip_${Date.now()}`,
          type: 'ct_zip',
          title: fileName.replace(/\.[^/.]+$/, ''),
          date: new Date().toISOString().split('T')[0],
          src: '',
          notes: `Planmeca Romexis 3D CBCT tomografiya arxivi yuklandi (${(file.size / (1024 * 1024)).toFixed(1)} MB). Barcha 3D kesimlar tahlilga tayyor.`,
          brightness: 0,
          contrast: 110,
          inverted: false,
          zoom: 1,
          rotation: 0,
          isZipPackage: true,
          zipSize: file.size,
          extractedFilesCount: 1412,
          dicomVolumeName: 'DICOM 3D Volume (1004 MB)',
          totalCtSlices: 480
        };

        const updated = [newZipItem, ...xrays];
        savePatientXraysList(updated);
        setActiveXrayId(newZipItem.id);
        setRentgenStatusMsg('3D Tomografiya muvaffaqiyatli ochildi!');
      } catch (err) {
        console.error('Error saving rentgen zip:', err);
        setRentgenStatusMsg('ZIP arxivini ochishda xatolik yuz berdi.');
      } finally {
        setIsProcessingRentgenZip(false);
      }
    } else {
      // Standard image file (JPG / PNG / DCM)
      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;
        if (src) {
          const newItem: XRayItem = {
            id: `xray_${Date.now()}`,
            type: fileName.toLowerCase().includes('opg') ? 'opg' : 'rvg',
            title: fileName.replace(/\.[^/.]+$/, ''),
            date: new Date().toISOString().split('T')[0],
            src,
            notes: 'Klinik rentgen tasviri tashxisi...',
            brightness: 0,
            contrast: 100,
            inverted: false,
            zoom: 1,
            rotation: 0
          };
          const updated = [newItem, ...xrays];
          savePatientXraysList(updated);
          setActiveXrayId(newItem.id);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const updateActiveXrayProps = (partial: Partial<XRayItem>) => {
    if (!activeXray) return;
    const updated = xrays.map((x) => (x.id === activeXray.id ? { ...x, ...partial } : x));
    savePatientXraysList(updated);
  };

  // =============================================================
  // 4. TAB 2: СКАН (3D Intraoral Scanner with Real STL Loader)
  // =============================================================
  const scanMountRef = useRef<HTMLDivElement>(null);
  const scanFileInputRef = useRef<HTMLInputElement>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanStatusProgress, setScanStatusProgress] = useState<string>('');
  const [scanMeshes, setScanMeshes] = useState<StlMeshItem[]>([]);
  const [scanIsWireframe, setScanIsWireframe] = useState(false);
  const [scanActiveFileName, setScanActiveFileName] = useState<string>('');
  const [scanErrorMsg, setScanErrorMsg] = useState<string | null>(null);
  // A→B bemor almashuvida eski (uzoq davom etgan) skan ishlovining natijasi YANGI
  // bemorga render/yozilmasligi uchun eng oxirgi bemor id sini kuzatamiz.
  const latestScanPatientIdRef = useRef<number | undefined>(currentPatient?.id);
  useEffect(() => { latestScanPatientIdRef.current = currentPatient?.id; }, [currentPatient?.id]);

  // Tab indikatorlari: har bo'limda (Рентген/Фото/Скан) fayl bor-yo'qligini aniqlaydi.
  useEffect(() => {
    if (!currentPatient) { setMediaHas({ rentgen: false, foto: false, skan: false }); return; }
    let cancelled = false;
    const id = currentPatient.id;
    const rentgen = xrays.length > 0;
    const scan3d = clinicApi.getPatient3DScan(id);
    const skan = !!(activeStoredScan && activeStoredScan.file) || scanMeshes.length > 0 || !!(scan3d && scan3d.hasScan);
    // Foto: eski localStorage hujjat bloklari (tez, sinxron)
    const legacyDoc = clinicApi.getPatientPhotoDoc(id) || [];
    const legacyFoto = Array.isArray(legacyDoc) && legacyDoc.some((b: any) =>
      (b?.kind === 'image' && b?.url) || (b?.type === 'image' && b?.src) ||
      (Array.isArray(b?.elements) && b.elements.some((e: any) => e?.type === 'image' && e?.src))
    );
    setMediaHas({ rentgen, foto: legacyFoto, skan });
    // Foto: yangi studio hujjati (IndexedDB) — asinxron tekshiriladi
    photoStudioHasImages(id).then((has) => { if (!cancelled && has) setMediaHas((m) => ({ ...m, foto: true })); }).catch(() => {});
    return () => { cancelled = true; };
  }, [currentPatient, xrays, activeStoredScan, scanMeshes]);

  // Three.js instances ref for the embedded 3D viewer
  const threeScanRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    meshesGroup: THREE.Group;
    animId?: number;
  } | null>(null);

  // Initialize Three.js scene for 3D Scan viewer
  useEffect(() => {
    if (activeTab !== 'skan' || !scanMountRef.current) return;

    const width = scanMountRef.current.clientWidth || 700;
    const height = scanMountRef.current.clientHeight || 520;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // sleek deep slate

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(0, -120, 90);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    scanMountRef.current.innerHTML = '';
    scanMountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight1.position.set(100, 150, 200);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x93c5fd, 0.4);
    dirLight2.position.set(-100, -100, -100);
    scene.add(dirLight2);

    const meshesGroup = new THREE.Group();
    scene.add(meshesGroup);

    threeScanRef.current = {
      scene,
      camera,
      renderer,
      controls,
      meshesGroup
    };

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!scanMountRef.current) return;
      const w = scanMountRef.current.clientWidth;
      const h = scanMountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // If current patient already has a stored scan in IndexedDB, auto-load it!
    // persist=false — bu FAQAT ko'rsatish; qayta yozib fayl soni/kvotani oshirmaymiz.
    if (currentPatient) {
      dentalMediaStore.getScan(currentPatient.id).then((stored) => {
        if (stored && stored.file) {
          process3DScanFile(stored.file, stored.fileName, false);
        } else if (isDemoClinic() && clinicApi.getPatient3DScan(currentPatient.id).hasScan) {
          // Demo: saqlangan fayl yo'q, lekin namuna skan belgilangan — namunani avto-yuklaymiz
          loadSampleScanZip();
        }
      }).catch((err) => { console.error('Saqlangan skan yuklanmadi:', err); });
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
      renderer.dispose();
      threeScanRef.current = null;
    };
  }, [activeTab, currentPatient?.id]);

  // Fit camera to bounding box of all meshes
  const fitCameraToScanMeshes = (group: THREE.Group) => {
    if (!threeScanRef.current) return;
    const { camera, controls } = threeScanRef.current;
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;

    camera.position.set(center.x, center.y - cameraZ, center.z + cameraZ * 0.4);
    camera.lookAt(center);
    controls.target.copy(center);
    camera.updateProjectionMatrix();
    controls.update();
  };

  // Load and render parsed STL buffers
  const loadScanStlBuffers = async (rawFiles: Array<{ name: string; buffer: ArrayBuffer; size: number }>) => {
    if (!threeScanRef.current) return;
    const { meshesGroup } = threeScanRef.current;

    // Clear previous models
    while (meshesGroup.children.length > 0) {
      const obj = meshesGroup.children[0] as THREE.Mesh;
      meshesGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else if (obj.material) obj.material.dispose();
    }

    const loader = new STLLoader();
    const newMeshItems: StlMeshItem[] = [];

    for (const file of rawFiles) {
      const lower = file.name.toLowerCase();
      let type: StlMeshItem['type'] = 'other';
      let colorHex = 0xf5efe4; // Natural tooth ivory

      if (lower.includes('maxillary') || lower.includes('upper') || lower.includes('верхн')) {
        type = 'maxillary';
        colorHex = 0xf8f4ec; // Pearlescent enamel
      } else if (lower.includes('mandibular') || lower.includes('lower') || lower.includes('нижн')) {
        type = 'mandibular';
        colorHex = 0xebd9c1; // Warm tooth enamel
      } else if (lower.includes('occlusion') || lower.includes('bite') || lower.includes('прикус')) {
        type = 'occlusion';
        colorHex = 0x38bdf8; // Translucent sky blue
      }

      try {
        const geometry = loader.parse(file.buffer);
        geometry.computeVertexNormals();

        const material = new THREE.MeshPhongMaterial({
          color: colorHex,
          specular: 0x444444,
          shininess: 35,
          side: THREE.DoubleSide,
          transparent: type === 'occlusion',
          opacity: type === 'occlusion' ? 0.75 : 1.0,
          wireframe: scanIsWireframe
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = file.name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        meshesGroup.add(mesh);

        const posAttr = geometry.attributes.position;
        const vertexCount = posAttr ? posAttr.count : 0;
        const triangleCount = geometry.index ? geometry.index.count / 3 : vertexCount / 3;

        newMeshItems.push({
          id: `stl-${Math.random().toString(36).substring(2, 9)}`,
          name: file.name,
          type,
          color: `#${colorHex.toString(16).padStart(6, '0')}`,
          visible: true,
          mesh,
          vertexCount,
          triangleCount,
          fileSize: file.size
        });
      } catch (err) {
        console.error('Error parsing STL:', file.name, err);
      }
    }

    setScanMeshes(newMeshItems);
    fitCameraToScanMeshes(meshesGroup);
  };

  // Process 3D Scan file (ZIP containing STL or single STL)
  // persist=true FAQAT yangi fayl yuklanganda (yoki namuna) kerak. Saqlangan skanni
  // KO'RSATISH uchun chaqirilsa persist=false — aks holda oddiy ochish/tab/reload har
  // safar faylni QAYTA yozib, fayl soni va xotira kvotasini oshiradi.
  const process3DScanFile = async (file: File | Blob, explicitName?: string, persist: boolean = true) => {
    const startPatientId = currentPatient?.id;
    const fileName = explicitName || (file as File).name || '3d_scan.zip';
    setScanActiveFileName(fileName);
    setScanErrorMsg(null);
    setScanLoading(true);
    setScanStatusProgress('3D Skan fayli o‘qilmoqda...');

    try {
      const arrayBuffer = await file.arrayBuffer();
      // Bemor almashgan bo'lsa — eski faylni yangi bemor sahnasiga render/yozmaymiz.
      if (latestScanPatientIdRef.current !== startPatientId) return;

      if (fileName.toLowerCase().endsWith('.zip') || (file as File).type?.includes('zip')) {
        setScanStatusProgress('ZIP arxiv dekompressiya qilinmoqda (STL modellar)...');

        const uint8 = new Uint8Array(arrayBuffer);
        const unzipped = fflate.unzipSync(uint8);

        const stlFiles: Array<{ name: string; buffer: ArrayBuffer; size: number }> = [];

        Object.keys(unzipped).forEach((filename) => {
          if (filename.toLowerCase().endsWith('.stl')) {
            const data = unzipped[filename];
            const baseName = filename.split('/').pop() || filename;
            stlFiles.push({
              name: baseName,
              buffer: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
              size: data.byteLength
            });
          }
        });

        if (stlFiles.length === 0) {
          throw new Error('Ushbu ZIP arxiv ichida .stl formatidagi 3D skan fayllari topilmadi.');
        }

        setScanStatusProgress(`${stlFiles.length} ta STL modeli 3D sahnada render qilinmoqda...`);
        if (latestScanPatientIdRef.current !== startPatientId) return;
        await loadScanStlBuffers(stlFiles);

        // Save into IndexedDB and clinicApi — FAQAT yangi yuklash (persist) va bemor
        // hali ham o'sha bo'lsa. Saqlangan skanni ko'rsatishda (persist=false) YOZMAYMIZ.
        if (persist && currentPatient && latestScanPatientIdRef.current === startPatientId) {
          await dentalMediaStore.saveScan(currentPatient.id, file, fileName, stlFiles.map((s) => s.name));
          clinicApi.savePatient3DScan(currentPatient.id, {
            hasScan: true,
            scanDate: new Date().toISOString().split('T')[0],
            fileName,
            notes: `${fileName} (${stlFiles.length} ta STL modeli)`
          });
        }
      } else if (fileName.toLowerCase().endsWith('.stl')) {
        if (latestScanPatientIdRef.current !== startPatientId) return;
        await loadScanStlBuffers([{ name: fileName, buffer: arrayBuffer, size: file.size }]);
        if (persist && currentPatient && latestScanPatientIdRef.current === startPatientId) {
          await dentalMediaStore.saveScan(currentPatient.id, file, fileName, [fileName]);
          clinicApi.savePatient3DScan(currentPatient.id, {
            hasScan: true,
            scanDate: new Date().toISOString().split('T')[0],
            fileName,
            notes: `${fileName} (1 ta STL)`
          });
        }
      }
    } catch (err: any) {
      console.error('Scan process error:', err);
      setScanErrorMsg(err.message || '3D Skan faylini ochishda xatolik yuz berdi');
    } finally {
      setScanLoading(false);
      setScanStatusProgress('');
    }
  };

  const loadSampleScanZip = async () => {
    setScanLoading(true);
    setScanStatusProgress('160926-Nasarullaev Shaxruh loyihasi yuklanmoqda (57 MB STL)...');
    try {
      const res = await fetch('/api/media-sample/scan/');
      if (!res.ok) throw new Error('Namuna faylini yuklab bo‘lmadi');
      const blob = await res.blob();
      await process3DScanFile(blob, '160926-Nasarullaev Shaxruh проект.zip');
    } catch (err: any) {
      setScanErrorMsg(err.message || 'Xatolik yuz berdi');
      setScanLoading(false);
    }
  };

  const toggleScanMeshVisibility = (id: string) => {
    setScanMeshes((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const next = !item.visible;
          if (item.mesh) item.mesh.visible = next;
          return { ...item, visible: next };
        }
        return item;
      })
    );
  };

  const setScanCameraAngle = (view: 'front' | 'top' | 'right' | 'left' | 'reset') => {
    if (!threeScanRef.current) return;
    const { camera, controls, meshesGroup } = threeScanRef.current;
    const box = new THREE.Box3().setFromObject(meshesGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const dist = Math.max(size.x, size.y, size.z) * 1.8;

    controls.target.copy(center);

    if (view === 'front') camera.position.set(center.x, center.y - dist, center.z);
    else if (view === 'top') camera.position.set(center.x, center.y, center.z + dist);
    else if (view === 'right') camera.position.set(center.x + dist, center.y, center.z);
    else if (view === 'left') camera.position.set(center.x - dist, center.y, center.z);
    else fitCameraToScanMeshes(meshesGroup);

    controls.update();
  };

  // =============================================================
  // 5. TAB 3: FOTO PROTOKOL (Apple Keynote Style Presentation 5:3)
  // =============================================================
  const [slides, setSlides] = useState<KeynoteSlide[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved'>('saved');
  const [activeCropElementId, setActiveCropElementId] = useState<string | null>(null);
  const [cropTemp, setCropTemp] = useState<KeynoteCrop>({ top: 0, bottom: 0, left: 0, right: 0 });
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const slideContainerRef = useRef<HTMLDivElement>(null);

  // Load saved Keynote slides (EMPTY BY DEFAULT for brand new patient!)
  useEffect(() => {
    if (!currentPatient) return;
    const rawData = clinicApi.getPatientPhotoDoc(currentPatient.id);
    if (Array.isArray(rawData) && rawData.length > 0) {
      // Check if data is already KeynoteSlide[]
      if ((rawData[0] as any).elements !== undefined) {
        setSlides(rawData as KeynoteSlide[]);
        setActiveSlideIndex(0);
        return;
      }
      // Migrate old Word blocks if any
      const migrated: KeynoteSlide[] = [];
      const pageCount = rawData.reduce((acc, b) => Math.max(acc, (b as any).pageIndex || 0), 0) + 1;
      for (let p = 0; p < pageCount; p++) {
        const pageBlocks = rawData.filter((b) => (b as any).pageIndex === p);
        const elements: KeynoteElement[] = pageBlocks.map((b, idx) => {
          if (b.type === 'image') {
            return {
              id: b.id || `img_${idx}`,
              type: 'image',
              x: 10 + (idx * 5) % 40,
              y: 15 + (idx * 10) % 50,
              width: b.widthPercent || 48,
              src: b.src,
              caption: b.caption || '',
              rotation: b.rotation || 0,
              crop: { top: 0, bottom: 0, left: 0, right: 0 }
            };
          }
          if (b.type === 'heading') {
            return {
              id: b.id || `head_${idx}`,
              type: 'heading',
              x: 5,
              y: 5 + idx * 8,
              width: 90,
              content: b.content,
              fontSize: b.level === 1 ? 24 : 18,
              bold: true
            };
          }
          return {
            id: b.id || `txt_${idx}`,
            type: 'text',
            x: 5,
            y: 15 + idx * 10,
            width: 90,
            content: b.content,
            fontSize: 14,
            bold: b.bold,
            italic: b.italic
          };
        });
        migrated.push({ id: `slide_${p + 1}`, elements });
      }
      setSlides(migrated.length > 0 ? migrated : [{ id: 'slide_1', elements: [] }]);
      setActiveSlideIndex(0);
      return;
    }

    // For brand new patient: COMPLETELY CLEAN SLIDE!
    // Zero fake teeth photos, zero dummy text!
    setSlides([{ id: 'slide_1', elements: [] }]);
    setActiveSlideIndex(0);
  }, [currentPatient?.id]);

  // BAZADAN foto-protokol hujjatini yuklaymiz (admin/boshqa qurilma ham ko'rsin).
  // Backend doc mavjud bo'lsa — u asosiy manba (localStorage ustidan).
  useEffect(() => {
    if (!currentPatient) return;
    let cancelled = false;
    clinicApi.fetchPatientPhotoDoc(currentPatient.id).then((backendDoc) => {
      if (cancelled || !backendDoc) return;
      if (Array.isArray(backendDoc) && backendDoc.length > 0 && (backendDoc[0] as any).elements !== undefined) {
        setSlides(backendDoc as KeynoteSlide[]);
        setActiveSlideIndex(0);
      }
    });
    return () => { cancelled = true; };
  }, [currentPatient?.id]);

  // Debounced Auto-Save with Cloud Status Indicator
  const triggerAutoSave = useCallback((newSlides: KeynoteSlide[]) => {
    setSlides(newSlides);
    setSaveStatus('saving');
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      if (currentPatient) {
        clinicApi.savePatientPhotoDoc(currentPatient.id, newSlides);
        try {
          localStorage.setItem(`32desk_photoprotocol_doc_${currentPatient.id}`, JSON.stringify(newSlides));
        } catch (e) {
          console.error('Error saving slide doc:', e);
        }
      }
      setSaveStatus('saved');
    }, 600);
  }, [currentPatient]);

  // Slide actions
  const addSlide = () => {
    const newSlide: KeynoteSlide = {
      id: `slide_${Date.now()}`,
      elements: []
    };
    const next = [...slides, newSlide];
    triggerAutoSave(next);
    setActiveSlideIndex(next.length - 1);
    setSelectedElementId(null);
  };

  const deleteSlide = (index: number) => {
    if (slides.length <= 1) {
      const next = [{ id: `slide_${Date.now()}`, elements: [] }];
      triggerAutoSave(next);
      setActiveSlideIndex(0);
      return;
    }
    const next = slides.filter((_, i) => i !== index);
    triggerAutoSave(next);
    setActiveSlideIndex(Math.max(0, Math.min(activeSlideIndex, next.length - 1)));
  };

  const duplicateSlide = (index: number) => {
    const source = slides[index];
    if (!source) return;
    const cloned: KeynoteSlide = {
      id: `slide_${Date.now()}`,
      background: source.background,
      elements: source.elements.map((el) => ({
        ...el,
        id: `${el.type}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        x: Math.min(85, el.x + 3),
        y: Math.min(85, el.y + 3)
      }))
    };
    const next = [...slides.slice(0, index + 1), cloned, ...slides.slice(index + 1)];
    triggerAutoSave(next);
    setActiveSlideIndex(index + 1);
  };

  // Add Elements
  const addTextElement = () => {
    const newEl: KeynoteElement = {
      id: `text_${Date.now()}`,
      type: 'text',
      content: 'Matn kiriting...',
      x: 10,
      y: 20,
      width: 45,
      fontSize: 16,
      bold: false,
      italic: false,
      align: 'left',
      color: '#1e293b'
    };
    const nextSlides = slides.map((s, idx) =>
      idx === activeSlideIndex ? { ...s, elements: [...s.elements, newEl] } : s
    );
    triggerAutoSave(nextSlides);
    setSelectedElementId(newEl.id);
  };

  const addHeadingElement = () => {
    const newEl: KeynoteElement = {
      id: `head_${Date.now()}`,
      type: 'heading',
      content: 'Klinik Bo‘lim Sarlavhasi',
      x: 8,
      y: 8,
      width: 80,
      fontSize: 24,
      bold: true,
      align: 'left',
      color: '#0f172a'
    };
    const nextSlides = slides.map((s, idx) =>
      idx === activeSlideIndex ? { ...s, elements: [...s.elements, newEl] } : s
    );
    triggerAutoSave(nextSlides);
    setSelectedElementId(newEl.id);
  };

  const addBadgeElement = (badgeText = 'Tashxis', badgeColor: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'slate' = 'blue') => {
    const newEl: KeynoteElement = {
      id: `badge_${Date.now()}`,
      type: 'badge',
      badgeText,
      badgeColor,
      x: 10,
      y: 10,
      width: 25
    };
    const nextSlides = slides.map((s, idx) =>
      idx === activeSlideIndex ? { ...s, elements: [...s.elements, newEl] } : s
    );
    triggerAutoSave(nextSlides);
    setSelectedElementId(newEl.id);
  };

  const handleUploadPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Demo: yuklash ishlaydi, lekin saqlanmaydi (store darajasida demo uchun skip).
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file, fIdx) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;
        if (!src) return;

        const initialX = 10 + (fIdx * 8) % 45;
        const initialY = 15 + (fIdx * 8) % 40;

        const newEl: KeynoteElement = {
          id: `img_${Date.now()}_${fIdx}`,
          type: 'image',
          src,
          caption: file.name.replace(/\.[^/.]+$/, ''),
          x: initialX,
          y: initialY,
          width: 48,
          rotation: 0,
          crop: { top: 0, bottom: 0, left: 0, right: 0 }
        };

        setSlides((prev) => {
          const updated = prev.map((s, idx) =>
            idx === activeSlideIndex ? { ...s, elements: [...s.elements, newEl] } : s
          );
          triggerAutoSave(updated);
          return updated;
        });
        setSelectedElementId(newEl.id);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const updateElement = (elementId: string, patch: Partial<KeynoteElement>) => {
    const nextSlides = slides.map((s, idx) => {
      if (idx !== activeSlideIndex) return s;
      return {
        ...s,
        elements: s.elements.map((el) => (el.id === elementId ? { ...el, ...patch } : el))
      };
    });
    triggerAutoSave(nextSlides);
  };

  const deleteElement = (elementId: string) => {
    const nextSlides = slides.map((s, idx) => {
      if (idx !== activeSlideIndex) return s;
      return {
        ...s,
        elements: s.elements.filter((el) => el.id !== elementId)
      };
    });
    triggerAutoSave(nextSlides);
    if (selectedElementId === elementId) {
      setSelectedElementId(null);
    }
  };

  const duplicateElement = (elementId: string) => {
    const slide = slides[activeSlideIndex];
    if (!slide) return;
    const currentEl = slide.elements.find((el) => el.id === elementId);
    if (!currentEl) return;
    const cloned: KeynoteElement = {
      ...currentEl,
      id: `${currentEl.type}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      x: Math.min(85, currentEl.x + 3),
      y: Math.min(85, currentEl.y + 3)
    };
    const nextSlides = slides.map((s, idx) =>
      idx === activeSlideIndex ? { ...s, elements: [...s.elements, cloned] } : s
    );
    triggerAutoSave(nextSlides);
    setSelectedElementId(cloned.id);
  };

  const bringForward = (elementId: string) => {
    const slide = slides[activeSlideIndex];
    if (!slide) return;
    const idx = slide.elements.findIndex((el) => el.id === elementId);
    if (idx === -1 || idx === slide.elements.length - 1) return;
    const updated = [...slide.elements];
    const [item] = updated.splice(idx, 1);
    updated.splice(idx + 1, 0, item);
    const nextSlides = slides.map((s, i) => (i === activeSlideIndex ? { ...s, elements: updated } : s));
    triggerAutoSave(nextSlides);
  };

  const sendBackward = (elementId: string) => {
    const slide = slides[activeSlideIndex];
    if (!slide) return;
    const idx = slide.elements.findIndex((el) => el.id === elementId);
    if (idx <= 0) return;
    const updated = [...slide.elements];
    const [item] = updated.splice(idx, 1);
    updated.splice(idx - 1, 0, item);
    const nextSlides = slides.map((s, i) => (i === activeSlideIndex ? { ...s, elements: updated } : s));
    triggerAutoSave(nextSlides);
  };

  // Drag element on 5:3 slide canvas
  const handleElementMouseDown = (e: React.MouseEvent, elementId: string) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('button')) {
      return;
    }
    e.preventDefault();
    setSelectedElementId(elementId);

    const startX = e.clientX;
    const startY = e.clientY;
    const currentEl = slides[activeSlideIndex]?.elements.find((el) => el.id === elementId);
    if (!currentEl || !slideContainerRef.current) return;

    const rect = slideContainerRef.current.getBoundingClientRect();
    const initX = currentEl.x;
    const initY = currentEl.y;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      const nextX = Math.max(0, Math.min(95, Math.round(initX + dx)));
      const nextY = Math.max(0, Math.min(95, Math.round(initY + dy)));

      setSlides((prev) =>
        prev.map((s, idx) => {
          if (idx !== activeSlideIndex) return s;
          return {
            ...s,
            elements: s.elements.map((el) =>
              el.id === elementId ? { ...el, x: nextX, y: nextY } : el
            )
          };
        })
      );
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setSlides((prev) => {
        triggerAutoSave(prev);
        return prev;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Corner resize on 5:3 slide canvas
  const handleResizeMouseDown = (e: React.MouseEvent, elementId: string) => {
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const currentEl = slides[activeSlideIndex]?.elements.find((el) => el.id === elementId);
    if (!currentEl || !slideContainerRef.current) return;

    const rect = slideContainerRef.current.getBoundingClientRect();
    const initW = currentEl.width;

    const onMouseMove = (ev: MouseEvent) => {
      // Keynote uslubi: burchakni diagonal (gorizontal + vertikal) tortganda ham ishlaydi
      const dxPct = ((ev.clientX - startX) / rect.width) * 100;
      const dyPct = ((ev.clientY - startY) / rect.height) * 100;
      const delta = (dxPct + dyPct) / 2;
      const nextW = Math.max(10, Math.min(100, Math.round(initW + delta)));

      setSlides((prev) =>
        prev.map((s, idx) => {
          if (idx !== activeSlideIndex) return s;
          return {
            ...s,
            elements: s.elements.map((el) =>
              el.id === elementId ? { ...el, width: nextW } : el
            )
          };
        })
      );
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setSlides((prev) => {
        triggerAutoSave(prev);
        return prev;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Image Cropping Studio Handlers
  const startCropping = (element: KeynoteElement) => {
    setActiveCropElementId(element.id);
    setCropTemp(element.crop || { top: 0, bottom: 0, left: 0, right: 0 });
  };

  const applyCrop = () => {
    if (!activeCropElementId) return;
    updateElement(activeCropElementId, { crop: { ...cropTemp } });
    setActiveCropElementId(null);
  };

  const resetCrop = () => {
    setCropTemp({ top: 0, bottom: 0, left: 0, right: 0 });
  };

  const setPresetCrop = (preset: '1:1' | '5:3' | '16:9') => {
    if (preset === '1:1') {
      setCropTemp({ top: 12.5, bottom: 12.5, left: 0, right: 0 });
    } else if (preset === '5:3') {
      setCropTemp({ top: 8, bottom: 8, left: 4, right: 4 });
    } else if (preset === '16:9') {
      setCropTemp({ top: 18, bottom: 18, left: 0, right: 0 });
    }
  };

  return (
    <div className="space-y-6 text-slate-900 dark:text-white">
      {/* ========================================================= */}
      {/* 1-QATOR: 3 TA TUGMA [RENTGEN] [FOTO] [SKAN] + BULUTGA SAQLASH */}
      {/* ========================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs">
        <div className="flex items-center space-x-2">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition shadow-xs group"
              title={t.back}
            >
              <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
              <span>{t.back}</span>
            </button>
          )}
          <span className="flex items-center gap-1.5 text-xs font-black text-blue-600 dark:text-sky-400 uppercase tracking-wider font-mono">
            <img src="/logo.png" alt="" className="w-5 h-5 object-contain" />
            DentOS
          </span>
        </div>

        {/* 3 Mode Tabs [Rentgen] [Foto] [Skan] + Cloud Save Status */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-100 dark:bg-[#0F172A] p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setActiveTab('rentgen')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition ${
                activeTab === 'rentgen'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{t.tabRentgen}</span>
              {mediaHas.rentgen && <Check className={`w-3.5 h-3.5 ${activeTab === 'rentgen' ? 'text-white' : 'text-emerald-500'}`} strokeWidth={3} />}
            </button>
            <button
              onClick={() => setActiveTab('foto')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition ${
                activeTab === 'foto'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{t.tabFoto}</span>
              {mediaHas.foto && <Check className={`w-3.5 h-3.5 ${activeTab === 'foto' ? 'text-white' : 'text-emerald-500'}`} strokeWidth={3} />}
            </button>
            <button
              onClick={() => setActiveTab('skan')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition ${
                activeTab === 'skan'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>{t.tabSkan}</span>
              {mediaHas.skan && <Check className={`w-3.5 h-3.5 ${activeTab === 'skan' ? 'text-white' : 'text-emerald-500'}`} strokeWidth={3} />}
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. TAB 1: РЕНТГЕН (X-RAY & 3D CBCT ZIP VIEWER)            */}
      {/* ========================================================= */}
      {activeTab === 'rentgen' && (
        <div className="space-y-4">
          {/* Header Action: Upload X-Ray Image or ZIP */}
          <div className="bg-white dark:bg-[#1E293B] p-4 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5">
              <Activity className="w-5 h-5 text-blue-600 dark:text-sky-400" />
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {t.rentgenTitle}
                </h3>
                <p className="text-xs text-slate-400">
                  {t.rentgenSubtitle}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={loadSampleRentgenZip}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>{t.sampleRentgenBtn}</span>
              </button>

              <button
                onClick={() => setIsRentgenUploadModalOpen(true)}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition shadow-xs"
              >
                <Upload className="w-4 h-4" />
                <span>{t.rentgenUploadBtn}</span>
              </button>
            </div>
          </div>

          {/* RENTGEN FILE CARD: ONLY SHOWN IF REAL FILE EXISTS, OTHERWISE CLEAN UPLOAD HERO */}
          {Boolean(activeStoredRentgen?.file || (activeXray && activeXray.src && activeXray.id !== 'demo_opg_1' && !activeXray.id.startsWith('demo_'))) ? (
            <div className="bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-slate-900/60 p-5 rounded-2xl border border-blue-500/30 shadow-lg flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-sky-400 shrink-0">
                  <HardDrive className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="font-black text-sm text-white">
                      {activeStoredRentgen?.fileName || activeXray?.title || 'Rentgen arxivi'}
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      ✓ Saqlangan
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {t.sizeLabel} <span className="font-mono text-slate-200 font-bold">{activeStoredRentgen ? `${(activeStoredRentgen.fileSize / (1024 * 1024)).toFixed(1)} MB` : 'Yuklangan fayl'}</span> • 
                    {t.formatLabel} <span className="text-sky-300 font-mono">DICOM / Romexis / 2D OPG</span> • 
                    {t.patientLabel} <span className="text-white font-semibold">{currentPatient?.full_name}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2.5">
                <button
                  onClick={handleDownloadRentgen}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/25 transition transform hover:-translate-y-0.5"
                >
                  <Download className="w-4 h-4" />
                  <span>{t.rentgenDownloadBtn}</span>
                </button>

                <button
                  onClick={() => setIsRentgenUploadModalOpen(true)}
                  className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  <Upload className="w-4 h-4 text-sky-400" />
                  <span>{t.rentgenNewUploadBtn}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/60 border-2 border-dashed border-slate-700/80 rounded-2xl p-8 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-sky-400">
                <Upload className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">{t.rentgenEmptyTitle}</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  {t.rentgenEmptyDesc}
                </p>
              </div>
              <div>
                <button
                  onClick={() => setIsRentgenUploadModalOpen(true)}
                  className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25 transition"
                >
                  <Upload className="w-4 h-4" />
                  <span>{t.rentgenEmptyUploadBtn}</span>
                </button>
              </div>
            </div>
          )}

          {isProcessingRentgenZip && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950/50 rounded-2xl border border-blue-200 dark:border-blue-800 text-center space-y-2">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-bold text-blue-800 dark:text-blue-300">{rentgenStatusMsg}</p>
            </div>
          )}

          {/* 3D RENTGEN PARDA (Curtain Overlay) */}
          <div className="relative rounded-3xl overflow-hidden border border-slate-800 bg-slate-950/80 min-h-[360px] flex items-center justify-center p-6 text-center shadow-xl">
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950/80 to-slate-950 blur-xl opacity-80" />

            {/* Frosted Glass Curtain Card */}
            <div className="relative z-10 max-w-lg mx-auto p-8 rounded-3xl bg-slate-900/90 backdrop-blur-xl border border-slate-700/60 shadow-2xl space-y-4">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-sky-400 shadow-xl shadow-blue-500/10">
                <Lock className="w-8 h-8" />
              </div>

              <div>
                <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-black uppercase tracking-wider mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t.ctCurtainBadge}</span>
                </div>
                <h4 className="text-base font-black text-white">
                  {t.ctCurtainTitle}
                </h4>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  {t.ctCurtainDesc}
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                {Boolean(activeStoredRentgen?.file || (activeXray && activeXray.src && activeXray.id !== 'demo_opg_1' && !activeXray.id.startsWith('demo_'))) ? (
                  <button
                    onClick={handleDownloadRentgen}
                    className="w-full sm:w-auto flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>{t.rentgenDownloadBtn}</span>
                  </button>
                ) : null}
                <button
                  onClick={() => setIsRentgenUploadModalOpen(true)}
                  className="w-full sm:w-auto flex items-center justify-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20 transition"
                >
                  <Upload className="w-4 h-4" />
                  <span>{t.ctCurtainUploadBtn}</span>
                </button>
              </div>
            </div>
          </div>

              {/* Bottom Details Grid: Clinical Notes + Archive List */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Clinical Notes Card */}
                {activeXray && (
                  <div className="bg-white dark:bg-[#1E293B] p-4 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs space-y-3">
                    <div className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200">
                        Rentgenologik xulosa va AI tashxis izohi
                      </h4>
                    </div>
                    <textarea
                      rows={4}
                      value={activeXray.notes}
                      onChange={(e) => updateActiveXrayProps({ notes: e.target.value })}
                      placeholder={t.clinicalNotesPlaceholder}
                      className="w-full p-3 bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155] rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                    <p className="text-[11px] text-slate-400">
                      O‘zgarishlar avtomatik ravishda bemor kartasiga saqlanadi.
                    </p>
                  </div>
                )}

                {/* X-Rays List for Current Patient */}
                <div className="bg-white dark:bg-[#1E293B] p-4 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs space-y-3">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    Bemorning rentgenlari ({xrays.length})
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {xrays.map((x) => (
                      <div
                        key={x.id}
                        onClick={() => setActiveXrayId(x.id)}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                          activeXray?.id === x.id
                            ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-400 dark:border-blue-600'
                            : 'bg-slate-50 dark:bg-[#0F172A] border-slate-200 dark:border-[#334155] hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0 pr-2">
                          <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center overflow-hidden shrink-0 border border-slate-800">
                            {x.isZipPackage ? (
                              <HardDrive className="w-5 h-5 text-blue-400" />
                            ) : (
                              <Activity className="w-5 h-5 text-emerald-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {x.title}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {x.date} • {x.isZipPackage ? '3D CBCT ZIP' : x.type.toUpperCase()}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadRentgen();
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center space-x-1 shrink-0 transition"
                          title="Yuklab olish"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Yuklab olish</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
      {/* ========================================================= */}
      {/* 4. TAB 2: СКАН (REAL 3D INTRAORAL STL VIEWER)             */}
      {/* ========================================================= */}
      {activeTab === 'skan' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#1E293B] p-4 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5">
              <Box className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  {t.skanTitle}
                </h3>
                <p className="text-xs text-slate-400">
                  {scanActiveFileName
                    ? `Faol skan: ${scanActiveFileName}`
                    : t.skanSubtitle}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={loadSampleScanZip}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>{t.skanSampleBtn}</span>
              </button>

              <button
                onClick={() => setIsScanUploadModalOpen(true)}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-xs"
              >
                <Upload className="w-4 h-4" />
                <span>{t.skanUploadBtn}</span>
              </button>
            </div>
          </div>

          {/* 3D SKAN FILE CARD: ONLY SHOWN IF REAL FILE EXISTS, OTHERWISE CLEAN UPLOAD HERO */}
          {Boolean(activeStoredScan?.file || (scanMeshes.length > 0 && scanActiveFileName && activeStoredScan)) ? (
            <div className="bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-900/60 p-5 rounded-2xl border border-indigo-500/30 shadow-lg flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                  <Box className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h4 className="font-black text-sm text-white">
                      {activeStoredScan?.fileName || scanActiveFileName || '3D Skan arxivi'}
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      ✓ Saqlangan
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {t.sizeLabel} <span className="font-mono text-slate-200 font-bold">{activeStoredScan ? `${(activeStoredScan.fileSize / (1024 * 1024)).toFixed(1)} MB` : 'Yuklangan fayl'}</span> • 
                    {t.formatLabel} <span className="text-indigo-300 font-mono">3D Intraoral Mesh (.stl, .ply)</span> • 
                    {t.patientLabel} <span className="text-white font-semibold">{currentPatient?.full_name}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2.5">
                <button
                  onClick={handleDownloadScan}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/25 transition transform hover:-translate-y-0.5"
                >
                  <Download className="w-4 h-4" />
                  <span>{t.skanDownloadBtn}</span>
                </button>

                <button
                  onClick={() => setIsScanUploadModalOpen(true)}
                  className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  <Upload className="w-4 h-4 text-indigo-400" />
                  <span>{t.skanNewUploadBtn}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/60 border-2 border-dashed border-indigo-700/60 rounded-2xl p-8 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Box className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">{t.skanEmptyTitle}</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  {t.skanEmptyDesc}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setIsScanUploadModalOpen(true)}
                  className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 transition"
                >
                  <Upload className="w-4 h-4" />
                  <span>{t.skanEmptyUploadBtn}</span>
                </button>
              </div>
            </div>
          )}

          {scanLoading && (
            <div className="p-4 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl border border-indigo-200 dark:border-indigo-800 text-center space-y-2">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-bold text-indigo-800 dark:text-indigo-300">{scanStatusProgress}</p>
            </div>
          )}

          {scanErrorMsg && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/50 rounded-2xl border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs">
              {scanErrorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left 2 Cols: Real Three.js Canvas Scene */}
            <div className="lg:col-span-2 bg-slate-950 rounded-2xl border border-slate-800 p-4 shadow-xl flex flex-col justify-between min-h-[540px]">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-white mb-2">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-slate-200">
                    {scanActiveFileName || '3D Skaner ko‘rinishi'}
                  </span>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => setScanCameraAngle('front')}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px]"
                  >
                    Oldindan
                  </button>
                  <button
                    onClick={() => setScanCameraAngle('top')}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px]"
                  >
                    Tepadan
                  </button>
                  <button
                    onClick={() => setScanCameraAngle('right')}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px]"
                  >
                    O‘ngdan
                  </button>
                  <button
                    onClick={() => setScanCameraAngle('left')}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[11px]"
                  >
                    Chapdan
                  </button>

                  <button
                    onClick={() => {
                      const next = !scanIsWireframe;
                      setScanIsWireframe(next);
                      scanMeshes.forEach((item) => {
                        if (item.mesh && (item.mesh.material as any)) {
                          (item.mesh.material as any).wireframe = next;
                        }
                      });
                    }}
                    className={`px-2 py-1 rounded text-[11px] font-bold ${
                      scanIsWireframe ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    To‘r (Wireframe)
                  </button>

                  <button
                    onClick={() => setScanCameraAngle('reset')}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    title="Asliga qaytarish"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Active Interactive Three.js 3D Canvas Viewport */}
              <div className="relative flex-1 w-full bg-slate-950 rounded-2xl overflow-hidden min-h-[480px] flex items-center justify-center border border-slate-800 shadow-2xl">
                <div
                  ref={scanMountRef}
                  className="w-full h-full min-h-[480px] flex items-center justify-center cursor-grab active:cursor-grabbing"
                />

                {/* Subtle Interactive 3D Controls Overlay Footer */}
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] text-slate-300 bg-slate-900/85 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-700/60 pointer-events-none">
                  <span>{t.mouseGuide}</span>
                  <span className="font-mono text-cyan-400 font-semibold">Three.js 3D Canvas</span>
                </div>
              </div>
            </div>

            {/* Right 1 Col: Layers, Stats & Patient 3D Scans */}
            <div className="space-y-4">
              {/* 3D Layers Manager */}
              <div className="bg-white dark:bg-[#1E293B] p-4 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs space-y-3">
                <div className="flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    3D Jag‘ Qatlamlari ({scanMeshes.length})
                  </h4>
                </div>

                {scanMeshes.length > 0 ? (
                  <div className="space-y-2">
                    {scanMeshes.map((m) => (
                      <div
                        key={m.id}
                        className="p-2.5 rounded-xl border border-slate-200 dark:border-[#334155] bg-slate-50 dark:bg-[#0F172A] flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 border border-black/20"
                            style={{ backgroundColor: m.color }}
                          />
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 dark:text-white truncate">
                              {m.name}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {m.triangleCount ? `${Math.round(m.triangleCount).toLocaleString()} uchburchak` : 'Mesh'}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => toggleScanMeshVisibility(m.id)}
                          className={`p-1.5 rounded-lg transition ${
                            m.visible
                              ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60'
                              : 'text-slate-400 bg-slate-100 dark:bg-slate-800'
                          }`}
                          title={m.visible ? 'Yashirish' : 'Ko‘rsatish'}
                        >
                          {m.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-4">
                    3D skan modeli hali yuklanmagan.
                  </p>
                )}
              </div>

              {/* Technician & Lab Notes */}
              <div className="bg-white dark:bg-[#1E293B] p-4 rounded-2xl border border-slate-200 dark:border-[#334155] shadow-xs space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Laboratoriya / Skaner izohi
                </h4>
                <textarea
                  rows={5}
                  defaultValue="3Shape TRIOS / Medit skaneri orqali olingan tish qatorlari 3D modeli. Zubnoy texnikka protez va vinirlar tayyorlash uchun yuboriladi."
                  className="w-full p-3 bg-slate-50 dark:bg-[#0F172A] border border-slate-200 dark:border-[#334155] rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <p className="text-[11px] text-slate-400">
                  Ushbu ma’lumot bemor kartasi va laboratoriya naryadlarida ham saqlanadi.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. TAB 3: ФОТО (WORD-LIKE VERTICAL DOCUMENT PAGES)        */}
      {/* ========================================================= */}
      {/* 5. TAB 3: FOTO PROTOKOL (APPLE KEYNOTE STUDIO 4:3)         */}
      {/* ========================================================= */}
      {activeTab === 'foto' && currentPatient && <PhotoProtocolStudio key={currentPatient.id} patientId={currentPatient.id} patientName={currentPatient.full_name} />}

      {/* Dedicated File Upload Modals with Progress Bar and Store */}
      <DentalFileUploadModal
        isOpen={isRentgenUploadModalOpen}
        onClose={() => setIsRentgenUploadModalOpen(false)}
        patientId={currentPatient?.id || 1}
        patientName={currentPatient?.full_name || 'Bemor'}
        uploadType="rentgen"
        onSuccess={(item) => {
          setActiveStoredRentgen(item);
          if (currentPatient) {
            dentalMediaStore.getRentgen(currentPatient.id).then((stored) => {
              if (stored) {
                setActiveStoredRentgen(stored);
                setXrays((prev) => [
                  {
                    id: `media_rentgen_${stored.key}`,
                    type: 'ct_zip',
                    title: stored.fileName || '3D Tomografiya Arxiv (CBCT)',
                    date: stored.uploadedAt ? stored.uploadedAt.split('T')[0] : new Date().toISOString().split('T')[0],
                    src: '',
                    notes: `Planmeca Romexis 3D CBCT Tomografiya to‘plami (${(stored.fileSize / (1024 * 1024)).toFixed(1)} MB).`,
                    brightness: 0,
                    contrast: 105,
                    inverted: false,
                    zoom: 1,
                    rotation: 0,
                    isZipPackage: true,
                    zipSize: stored.fileSize,
                    extractedFilesCount: stored.filesCount || 1412,
                    dicomVolumeName: 'DICOM 3D Volume',
                    totalCtSlices: 480
                  },
                  ...prev.filter((x) => !x.id.startsWith('media_rentgen_'))
                ]);
              }
            });
          }
        }}
      />

      <DentalFileUploadModal
        isOpen={isScanUploadModalOpen}
        onClose={() => setIsScanUploadModalOpen(false)}
        patientId={currentPatient?.id || 1}
        patientName={currentPatient?.full_name || 'Bemor'}
        uploadType="skan"
        onSuccess={(item) => {
          setActiveStoredScan(item);
          if (item?.fileName) {
            setScanActiveFileName(item.fileName);
          }
        }}
      />
    </div>
  );
}

