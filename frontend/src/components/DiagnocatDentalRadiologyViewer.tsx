'use client';

// ─────────────────────────────────────────────────────────────────────────────
// REAL Dental Radiology Viewer
// Ochilgan ZIP ichidagi HAQIQIY ma'lumotni ko'rsatadi (soxta 3D emas):
//   • .stl  → haqiqiy 3D jag' modellari (Three.js)
//   • .dcm  → haqiqiy DICOM CT kesimlari (dicom-parser + canvas, window/level)
//   • rasm  → haqiqiy surat (JPG/PNG/BMP)
// ZIP oqim (streaming) bilan ochiladi — 1GB+ arxivlar ham xotirani portlatmaydi,
// faqat kerakli fayllar (stl/dcm/rasm) ajratib olinadi, exe/jar/dll tashlanadi.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { VolumeRenderShader1 } from 'three/examples/jsm/shaders/VolumeShader.js';
import * as fflate from 'fflate';
import * as dicomParser from 'dicom-parser';
import type { DataSet } from 'dicom-parser';
import {
  X,
  Upload,
  Eye,
  EyeOff,
  Layers,
  Box,
  ScanLine,
  Image as ImageIcon,
  AlertTriangle,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sliders,
  FileArchive,
  ChevronLeft,
  ChevronRight,
  Info
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { dentalMediaStore } from '../lib/dentalMediaStore';

interface DiagnocatViewerProps {
  patientId?: number;
  patientName?: string;
  initialZipUrl?: string;
  initialZipFile?: File | Blob | null;
  initialFileName?: string;
  onClose?: () => void;
}

type EntryKind = 'stl' | 'dicom' | 'image' | 'other';

interface ZipEntry {
  name: string;      // to'liq yo'l
  short: string;     // faqat fayl nomi
  size: number;      // baytlarda (originalSize)
  kind: EntryKind;
  bytes?: Uint8Array; // faqat stl/dcm/image uchun ajratib olinadi
}

interface DicomMeta {
  rows: number;
  cols: number;
  frames: number;
  bitsAllocated: number;
  signed: boolean;
  samplesPerPixel: number;
  monochrome1: boolean;
  slope: number;
  intercept: number;
  windowCenter: number;
  windowWidth: number;
  pixelDataOffset: number;
  frameSizeBytes: number;
  patientName?: string;
  modality?: string;
  pixelSpacing?: string;
  manufacturer?: string;
}

// ── Yordamchi funksiyalar ────────────────────────────────────────────────────

function classify(name: string): EntryKind {
  const n = name.toLowerCase();
  if (n.endsWith('.stl')) return 'stl';
  if (n.endsWith('.dcm') || n.endsWith('.dicom')) return 'dicom';
  if (/\.(jpg|jpeg|png|bmp|gif|webp)$/.test(n)) return 'image';
  return 'other';
}

function shortName(name: string): string {
  const parts = name.split('/').filter(Boolean);
  return parts[parts.length - 1] || name;
}

function formatBytes(b: number): string {
  if (!b || b <= 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// Medical fayllarni tanlash: .dcm/.stl doim; rasm faqat bemor surati bo'lsa
// (Romexis viewer chrome — logo/splash/ikonka/font — chiqarib tashlanadi).
function isWantedMedical(name: string): boolean {
  const n = name.toLowerCase();
  if (n.endsWith('.dcm') || n.endsWith('.dicom') || n.endsWith('.stl')) return true;
  if (/\.(jpg|jpeg|png|bmp|gif|webp)$/.test(n)) {
    if (/\/(pics|icons?|fonts|resources|skins?|themes?|assets|toolbar|buttons|ui|gui|res)\//.test(n)) return false;
    if (/(^|\/)(logo|splash|checkbox|radio|arrow|button|icon|cursor|background|bg[_-]|spinner|loading|watermark|combined-shape|dragdrop)/.test(n)) return false;
    return true;
  }
  return false;
}

function concatU8(arr: Uint8Array[], total: number): Uint8Array {
  const m = new Uint8Array(total);
  let o = 0;
  for (const c of arr) {
    m.set(c, o);
    o += c.length;
  }
  return m;
}

// fflate zaxira: bitta deflate oqimni chunk bo'lib ochib, progress beradi.
function inflateStreamFflate(comp: Uint8Array, expectedSize: number, onBytes: (n: number) => void): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const out = expectedSize > 0 ? new Uint8Array(expectedSize) : null;
    const chunks: Uint8Array[] = [];
    let written = 0;
    let inf: fflate.Inflate;
    try {
      inf = new fflate.Inflate((chunk, final) => {
        if (out) out.set(chunk, written);
        else chunks.push(chunk.slice());
        written += chunk.length;
        onBytes(written);
        if (final) resolve(out ?? concatU8(chunks, written));
      });
    } catch (e) {
      reject(e as Error);
      return;
    }
    (async () => {
      try {
        const CH = 4 * 1024 * 1024;
        for (let o = 0; o < comp.length; o += CH) {
          const end = Math.min(o + CH, comp.length);
          inf.push(comp.subarray(o, end), end >= comp.length);
          await new Promise((r) => setTimeout(r));
        }
      } catch (e) {
        reject(e as Error);
      }
    })();
  });
}

// Deflate oqimni ochish. Avval brauzerning NATIVE `DecompressionStream` (C++
// tezligida, asosiy oqimni BLOKLAMAYDI → progress silliq aylanadi) bilan
// urinadi; bo'lmasa fflate'ga qaytadi. Chiqayotgan baytlarni sanab progress.
async function inflateStream(comp: Uint8Array, expectedSize: number, onBytes: (n: number) => void): Promise<Uint8Array> {
  const DS = (globalThis as unknown as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (DS) {
    try {
      const dsx = new DS('deflate-raw');
      const writer = dsx.writable.getWriter();
      // yozishni kutmaymiz (katta bufer), oqim o'zi so'rab oladi
      writer.write(comp as unknown as BufferSource);
      writer.close();
      const reader = dsx.readable.getReader();
      const out = expectedSize > 0 ? new Uint8Array(expectedSize) : null;
      const chunks: Uint8Array[] = [];
      let written = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (out) out.set(value, written);
        else chunks.push(value);
        written += value.length;
        onBytes(written);
      }
      return out ?? concatU8(chunks, written);
    } catch (e) {
      console.warn('DecompressionStream failed, fflate fallback:', e);
    }
  }
  return inflateStreamFflate(comp, expectedSize, onBytes);
}

// ZIP'ni markaziy katalog (central directory) orqali ochish: butun arxiv
// o'qilmaydi — faqat kerakli medical fayllarning siqilgan qismi kesib olinadi
// va ochiladi. 1GB+ DICOM ham ishlaydi (streaming inflate'ning "invalid
// distance" xatosisiz), arxivdagi yuzlab viewer-rasmlari tortilmaydi.
async function extractZipCentralDir(
  blob: Blob,
  onProgress?: (pct: number) => void
): Promise<{ manifest: { name: string; size: number }[]; wanted: Map<string, Uint8Array> }> {
  const size = blob.size;
  const dec = new TextDecoder('utf-8');

  // 1) EOCD (End Of Central Directory) ni oxiridan qidirish
  const tailLen = Math.min(size, 65557);
  const tail = new Uint8Array(await blob.slice(size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP arxiv tuzilishi buzuq (EOCD topilmadi).');
  const tdv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  const cdSize = tdv.getUint32(eocd + 12, true);
  const cdOffset = tdv.getUint32(eocd + 16, true);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new Error('ZIP64 arxiv (4GB+) hozircha qo‘llab-quvvatlanmaydi.');
  }

  // 2) Markaziy katalogni o'qib, yozuvlarni ajratish
  const cd = new Uint8Array(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const cdv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  interface CDEntry {
    name: string;
    method: number;
    compSize: number;
    uncompSize: number;
    localOffset: number;
  }
  const entries: CDEntry[] = [];
  let p = 0;
  while (p + 46 <= cd.length && cdv.getUint32(p, true) === 0x02014b50) {
    const method = cdv.getUint16(p + 10, true);
    const compSize = cdv.getUint32(p + 20, true);
    const uncompSize = cdv.getUint32(p + 24, true);
    const nameLen = cdv.getUint16(p + 28, true);
    const extraLen = cdv.getUint16(p + 30, true);
    const commentLen = cdv.getUint16(p + 32, true);
    const localOffset = cdv.getUint32(p + 42, true);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compSize, uncompSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  // 3) Faqat kerakli medical fayllarni kesib olib ochish
  const wanted = new Map<string, Uint8Array>();
  const manifest: { name: string; size: number }[] = [];
  const targets = entries.filter((e) => isWantedMedical(e.name));
  const totalUncomp = targets.reduce((s, e) => s + (e.uncompSize || e.compSize), 0) || 1;
  let cum = 0;
  for (const e of targets) {
    // Local header (30 bayt) → haqiqiy data offset (nom+extra o'zgaruvchan)
    const lh = new Uint8Array(await blob.slice(e.localOffset, e.localOffset + 30).arrayBuffer());
    const ldv = new DataView(lh.buffer, lh.byteOffset, lh.byteLength);
    if (ldv.getUint32(0, true) !== 0x04034b50) continue;
    const lNameLen = ldv.getUint16(26, true);
    const lExtraLen = ldv.getUint16(28, true);
    const dataStart = e.localOffset + 30 + lNameLen + lExtraLen;
    const comp = new Uint8Array(await blob.slice(dataStart, dataStart + e.compSize).arrayBuffer());
    let out: Uint8Array;
    if (e.method === 0) {
      out = comp;
      cum += comp.length;
      if (onProgress) onProgress(Math.round((cum / totalUncomp) * 100));
    } else if (e.method === 8) {
      const before = cum;
      out = await inflateStream(comp, e.uncompSize, (w) => {
        if (onProgress) onProgress(Math.round(((before + w) / totalUncomp) * 100));
      });
      cum += e.uncompSize;
    } else {
      continue;
    }
    wanted.set(e.name, out);
    manifest.push({ name: e.name, size: e.uncompSize });
  }

  return { manifest, wanted };
}

// Blob turini magic-baytlar orqali aniqlash (nom bo'lmasa ham ishlaydi)
async function detectKind(blob: Blob, name?: string): Promise<'zip' | 'dicom' | 'stl' | 'image' | 'unknown'> {
  const head = new Uint8Array(await blob.slice(0, 136).arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07)) return 'zip';
  if (head.length >= 132 && head[128] === 0x44 && head[129] === 0x49 && head[130] === 0x43 && head[131] === 0x4d) return 'dicom';
  const n = (name || '').toLowerCase();
  if (n.endsWith('.stl')) return 'stl';
  if (n.endsWith('.dcm') || n.endsWith('.dicom')) return 'dicom';
  // ASCII STL "solid"
  if (head[0] === 0x73 && head[1] === 0x6f && head[2] === 0x6c && head[3] === 0x69 && head[4] === 0x64) return 'stl';
  if (/\.(jpg|jpeg|png|bmp|gif|webp)$/.test(n)) return 'image';
  if (head[0] === 0xff && head[1] === 0xd8) return 'image'; // jpeg
  if (head[0] === 0x89 && head[1] === 0x50) return 'image'; // png
  return 'unknown';
}

function firstStr(ds: DataSet, tag: string): string | undefined {
  try {
    const v = ds.string(tag);
    return v ? v.split('\\')[0] : undefined;
  } catch {
    return undefined;
  }
}

function parseDicomMeta(bytes: Uint8Array): DicomMeta {
  const ds = dicomParser.parseDicom(bytes);
  const rows = ds.uint16('x00280010') || 0;
  const cols = ds.uint16('x00280011') || 0;
  const frames = parseInt(ds.string('x00280008') || '1', 10) || 1;
  const bitsAllocated = ds.uint16('x00280100') || 16;
  const signed = (ds.uint16('x00280103') || 0) === 1;
  const samplesPerPixel = ds.uint16('x00280002') || 1;
  const photometric = (ds.string('x00280004') || 'MONOCHROME2').trim();
  const slope = parseFloat(firstStr(ds, 'x00281053') || '1') || 1;
  const intercept = parseFloat(firstStr(ds, 'x00281052') || '0') || 0;
  let windowCenter = parseFloat(firstStr(ds, 'x00281050') || 'NaN');
  let windowWidth = parseFloat(firstStr(ds, 'x00281051') || 'NaN');

  const pixelEl = ds.elements.x7fe00010;
  const pixelDataOffset = pixelEl ? pixelEl.dataOffset : 0;
  const frameSizeBytes = rows * cols * (bitsAllocated / 8) * samplesPerPixel;

  if (isNaN(windowCenter) || isNaN(windowWidth)) {
    // Standart CBCT/CT oynasi
    windowCenter = signed ? 400 : 32768;
    windowWidth = signed ? 2000 : 40000;
  }

  return {
    rows,
    cols,
    frames,
    bitsAllocated,
    signed,
    samplesPerPixel,
    monochrome1: photometric.indexOf('MONOCHROME1') === 0,
    slope,
    intercept,
    windowCenter,
    windowWidth,
    pixelDataOffset,
    frameSizeBytes,
    patientName: (ds.string('x00100010') || '').replace(/\^/g, ' ').trim() || undefined,
    modality: ds.string('x00080060') || undefined,
    pixelSpacing: firstStr(ds, 'x00280030'),
    manufacturer: ds.string('x00080070') || undefined
  };
}

function renderDicomFrame(
  canvas: HTMLCanvasElement,
  bytes: Uint8Array,
  meta: DicomMeta,
  frameIdx: number,
  wc: number,
  ww: number
) {
  const { rows, cols, bitsAllocated, signed, slope, intercept, frameSizeBytes, pixelDataOffset, monochrome1 } = meta;
  if (!rows || !cols) return;
  const start = pixelDataOffset + frameIdx * frameSizeBytes;
  const dv = new DataView(bytes.buffer, bytes.byteOffset + start, Math.min(frameSizeBytes, bytes.byteLength - start));

  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(cols, rows);
  const data = img.data;

  const low = wc - ww / 2;
  const scale = ww > 0 ? 255 / ww : 0;
  const count = rows * cols;
  const bytesPerPixel = bitsAllocated / 8;

  for (let i = 0; i < count; i++) {
    let raw: number;
    if (bytesPerPixel === 2) {
      raw = signed ? dv.getInt16(i * 2, true) : dv.getUint16(i * 2, true);
    } else {
      raw = signed ? dv.getInt8(i) : dv.getUint8(i);
    }
    const hu = raw * slope + intercept;
    let v = (hu - low) * scale;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    if (monochrome1) v = 255 - v;
    const p = i * 4;
    data[p] = v;
    data[p + 1] = v;
    data[p + 2] = v;
    data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

const STL_COLORS: Record<string, number> = {
  mandibular: 0x22d3ee,
  lower: 0x22d3ee,
  maxillary: 0xc084fc,
  upper: 0xc084fc,
  occlusion: 0xfbbf24,
  bite: 0xfbbf24
};

function stlColorFor(name: string): number {
  const n = name.toLowerCase();
  for (const key of Object.keys(STL_COLORS)) {
    if (n.includes(key)) return STL_COLORS[key];
  }
  return 0x93c5fd;
}

// ── DICOM → 3D hajm (downsample + window → 8-bit) ────────────────────────────

interface DicomVolumeData {
  data: Uint8Array; // nx*ny*nz, x-tez, keyin y, keyin z
  nx: number;
  ny: number;
  nz: number;
  stepX: number;
  stepY: number;
  stepZ: number;
  meta: DicomMeta;
}

// CBCT hajmini GPU 3D-teksturaga sig'adigan qilib kichraytiradi (~256^3),
// har vokselga window/level qo'llab 8-bitga o'tkazadi. Z bo'yicha bo'lib
// ishlaydi va har bir bo'lakdan keyin progress beradi (dumaloq foiz uchun).
async function buildVolume(
  bytes: Uint8Array,
  meta: DicomMeta,
  wc: number,
  ww: number,
  onProgress: (pct: number) => void
): Promise<DicomVolumeData> {
  const { rows, cols, frames, bitsAllocated, signed, slope, intercept, frameSizeBytes, pixelDataOffset, monochrome1 } = meta;
  const TARGET = 256;
  const stepX = Math.max(1, Math.ceil(cols / TARGET));
  const stepY = Math.max(1, Math.ceil(rows / TARGET));
  const stepZ = Math.max(1, Math.ceil(frames / TARGET));
  const nx = Math.floor((cols - 1) / stepX) + 1;
  const ny = Math.floor((rows - 1) / stepY) + 1;
  const nz = Math.floor((frames - 1) / stepZ) + 1;

  const data = new Uint8Array(nx * ny * nz);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bpp = bitsAllocated / 8;
  const low = wc - ww / 2;
  const scale = ww > 0 ? 255 / ww : 0;
  const maxOff = bytes.byteLength - bpp;

  const readVal = (off: number): number => {
    if (off < 0 || off > maxOff) return 0;
    let raw: number;
    if (bpp === 2) raw = signed ? dv.getInt16(off, true) : dv.getUint16(off, true);
    else raw = signed ? dv.getInt8(off) : dv.getUint8(off);
    const hu = raw * slope + intercept;
    let v = (hu - low) * scale;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    return monochrome1 ? 255 - v : v;
  };

  const BATCH = 6; // har 6 z-kesimda nafas olamiz
  for (let z = 0; z < nz; z++) {
    const sz = z * stepZ;
    const frameBase = pixelDataOffset + sz * frameSizeBytes;
    const zBase = z * nx * ny;
    for (let y = 0; y < ny; y++) {
      const sy = y * stepY;
      const rowBase = frameBase + sy * cols * bpp;
      const outRow = zBase + y * nx;
      for (let x = 0; x < nx; x++) {
        data[outRow + x] = readVal(rowBase + x * stepX * bpp);
      }
    }
    if (z % BATCH === 0) {
      onProgress(Math.round((z / nz) * 100));
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r));
    }
  }
  onProgress(100);
  return { data, nx, ny, nz, stepX, stepY, stepZ, meta };
}

// ── Dumaloq progress halqasi ─────────────────────────────────────────────────

function CircularProgress({ value, label, sub }: { value: number; label: string; sub?: string }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const off = C * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="relative w-36 h-36">
        <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={R} fill="none" stroke="#1e293b" strokeWidth="9" />
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke="url(#pgrad)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={off}
            style={{ transition: 'stroke-dashoffset 0.25s ease' }}
          />
          <defs>
            <linearGradient id="pgrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-white tabular-nums">{Math.round(value)}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-bold text-slate-200">{label}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Komponent ────────────────────────────────────────────────────────────────

export default function DiagnocatDentalRadiologyViewer({
  patientId,
  patientName = '',
  initialZipFile,
  initialZipUrl,
  initialFileName,
  onClose
}: DiagnocatViewerProps) {
  const { language, tr } = useI18n();

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [error, setError] = useState<string>('');

  const [entries, setEntries] = useState<ZipEntry[]>([]);
  const [manifest, setManifest] = useState<{ name: string; size: number }[]>([]);
  const [view, setView] = useState<'3d' | 'dicom' | 'image' | 'empty'>('empty');
  const [sourceName, setSourceName] = useState<string>('');
  const [dicomPatient, setDicomPatient] = useState<string>('');
  const [dicomVolume, setDicomVolume] = useState<DicomVolumeData | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const t = {
    empty: language === 'ru' ? 'Файл не загружен' : language === 'en' ? 'No file uploaded' : 'Fayl yuklanmagan',
    emptyDesc:
      language === 'ru'
        ? 'Загрузите ZIP (STL / DICOM) или снимок этого пациента, чтобы открыть реальный рентген.'
        : language === 'en'
        ? 'Upload this patient’s ZIP (STL / DICOM) or image to open the real X-ray.'
        : 'Ushbu bemorning ZIP (STL / DICOM) yoki suratini yuklang — haqiqiy rentgen ochiladi.',
    upload: language === 'ru' ? 'Загрузить файл' : language === 'en' ? 'Upload file' : 'Fayl yuklash',
    opening: language === 'ru' ? 'Открытие...' : language === 'en' ? 'Opening...' : 'Ochilmoqda...',
    model3d: language === 'ru' ? '3D Модель' : language === 'en' ? '3D Model' : '3D Model',
    ctSlices: language === 'ru' ? 'КТ Срезы' : language === 'en' ? 'CT Slices' : 'KT Kesimlar',
    images: language === 'ru' ? 'Снимки' : language === 'en' ? 'Images' : 'Suratlar',
    files: language === 'ru' ? 'Файлы в архиве' : language === 'en' ? 'Files in archive' : 'Arxiv ichidagi fayllar',
    close: language === 'ru' ? 'Закрыть' : language === 'en' ? 'Close' : 'Yopish'
  };

  const revokeUrls = () => {
    objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    objectUrlsRef.current = [];
  };

  const loadSource = useCallback(
    async (blob: Blob, name?: string) => {
      setLoading(true);
      setError('');
      setProgress(0);
      setEntries([]);
      setManifest([]);
      setDicomPatient('');
      setDicomVolume(null);
      revokeUrls();
      setSourceName(name || (blob as File).name || '');

      try {
        const kind = await detectKind(blob, name || (blob as File).name);

        let collected: ZipEntry[] = [];
        let manifestList: { name: string; size: number }[] = [];

        if (kind === 'zip') {
          setStatusMsg(language === 'ru' ? 'Распаковка архива...' : language === 'en' ? 'Unpacking archive...' : 'Arxiv ochilmoqda...');
          const { manifest: mf, wanted } = await extractZipCentralDir(blob, (p) => setProgress(Math.round(p * 0.6)));
          manifestList = mf;
          collected = Array.from(wanted.entries()).map(([full, bytes]) => ({
            name: full,
            short: shortName(full),
            size: bytes.length,
            kind: classify(full),
            bytes
          }));
        } else if (kind === 'dicom') {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const nm = name || (blob as File).name || 'image.dcm';
          collected = [{ name: nm, short: shortName(nm), size: bytes.length, kind: 'dicom', bytes }];
          manifestList = [{ name: nm, size: bytes.length }];
        } else if (kind === 'stl') {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const nm = name || (blob as File).name || 'model.stl';
          collected = [{ name: nm, short: shortName(nm), size: bytes.length, kind: 'stl', bytes }];
          manifestList = [{ name: nm, size: bytes.length }];
        } else if (kind === 'image') {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const nm = name || (blob as File).name || 'image.jpg';
          collected = [{ name: nm, short: shortName(nm), size: bytes.length, kind: 'image', bytes }];
          manifestList = [{ name: nm, size: bytes.length }];
        } else {
          throw new Error(
            language === 'ru'
              ? 'Формат файла не распознан (нужен ZIP, DICOM, STL или снимок).'
              : language === 'en'
              ? 'Unrecognized file format (need ZIP, DICOM, STL or image).'
              : 'Fayl formati aniqlanmadi (ZIP, DICOM, STL yoki surat kerak).'
          );
        }

        setEntries(collected);
        setManifest(manifestList);

        const hasDicom = collected.some((e) => e.kind === 'dicom');
        const hasStl = collected.some((e) => e.kind === 'stl');
        const hasImage = collected.some((e) => e.kind === 'image');

        // DICOM bo'lsa — real 3D hajmni quramiz (aylantiriladigan rekonstruksiya)
        const dicomEntry = collected.find((e) => e.kind === 'dicom');
        if (dicomEntry?.bytes) {
          try {
            setStatusMsg(language === 'ru' ? 'Построение 3D...' : language === 'en' ? 'Building 3D...' : '3D tayyorlanmoqda...');
            const meta = parseDicomMeta(dicomEntry.bytes);
            if (meta.patientName) setDicomPatient(meta.patientName);
            const base = kind === 'zip' ? 60 : 0;
            const span = 100 - base;
            const vol = await buildVolume(dicomEntry.bytes, meta, meta.windowCenter, meta.windowWidth, (q) =>
              setProgress(base + Math.round((q * span) / 100))
            );
            setDicomVolume(vol);
          } catch (volErr) {
            console.warn('Volume build failed:', volErr);
          }
        }
        setProgress(100);

        if (hasDicom) setView('dicom');
        else if (hasStl) setView('3d');
        else if (hasImage) setView('image');
        else {
          setView('empty');
          setError(
            language === 'ru'
              ? 'В архиве нет STL/DICOM/снимков для просмотра.'
              : language === 'en'
              ? 'No STL/DICOM/images to view in the archive.'
              : 'Arxivda ko‘rsatiladigan STL/DICOM/surat topilmadi.'
          );
        }
        setStatusMsg('');
      } catch (e) {
        console.error('Rentgen load error:', e);
        setError((e as Error).message || 'Xatolik yuz berdi');
        setView('empty');
      } finally {
        setLoading(false);
        setProgress(0);
      }
    },
    [language]
  );

  // Prop yoki IndexedDB'dan yuklash
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (initialZipFile) {
        await loadSource(initialZipFile, initialFileName);
        return;
      }
      if (patientId) {
        const found = await dentalMediaStore.getRentgen(patientId);
        if (!cancelled && found && found.file) {
          await loadSource(found.file, found.fileName);
          return;
        }
      }
      if (initialZipUrl) {
        try {
          const resp = await fetch(initialZipUrl);
          const blob = await resp.blob();
          if (!cancelled) await loadSource(blob, initialFileName || initialZipUrl.split('/').pop());
        } catch (err) {
          console.warn('initialZipUrl fetch failed', err);
        }
      }
    })();
    return () => {
      cancelled = true;
      revokeUrls();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialZipFile, initialZipUrl, initialFileName, patientId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (patientId) {
      try {
        await dentalMediaStore.saveRentgen(patientId, file, file.name);
      } catch (err) {
        console.warn('saveRentgen error', err);
      }
    }
    await loadSource(file, file.name);
  };

  const displayPatient = dicomPatient || patientName;

  const availableViews: { key: '3d' | 'dicom' | 'image'; label: string; icon: React.ReactNode }[] = [];
  if (entries.some((e) => e.kind === 'dicom')) availableViews.push({ key: 'dicom', label: t.ctSlices, icon: <ScanLine className="w-3.5 h-3.5" /> });
  if (entries.some((e) => e.kind === 'stl')) availableViews.push({ key: '3d', label: t.model3d, icon: <Box className="w-3.5 h-3.5" /> });
  if (entries.some((e) => e.kind === 'image')) availableViews.push({ key: 'image', label: t.images, icon: <ImageIcon className="w-3.5 h-3.5" /> });

  return (
    <div className="relative flex flex-col w-full h-[820px] bg-[#0A0A14] rounded-2xl border border-[#2D1B69] overflow-hidden select-none text-white shadow-2xl font-sans">
      {/* Header */}
      <div className="h-14 px-4 bg-[#101020]/95 border-b border-[#222238] flex items-center justify-between gap-3 shrink-0 backdrop-blur-md z-30">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#6366F1] to-[#A855F7] flex items-center justify-center shadow-md shadow-purple-500/20 shrink-0">
            <ScanLine className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-extrabold text-sm tracking-tight text-white leading-tight truncate">
              {displayPatient || (language === 'ru' ? 'Рентген' : language === 'en' ? 'Radiology' : 'Rentgen')}
            </p>
            {sourceName && <p className="text-[10px] text-slate-400 font-mono truncate">{sourceName}</p>}
          </div>
        </div>

        {/* View switch tabs (faqat mavjud turlar) */}
        {availableViews.length > 0 && (
          <div className="flex items-center space-x-1 bg-[#1A1A2E] p-1 rounded-xl border border-slate-800">
            {availableViews.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  view === v.key ? 'bg-[#6366F1] text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                {v.icon}
                <span>{v.label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center space-x-2 shrink-0">
          <input ref={fileInputRef} type="file" accept=".zip,.dcm,.dicom,.stl,image/*" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold border border-slate-700/80 transition"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">{t.upload}</span>
          </button>
          {onClose && (
            <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-rose-500/20 hover:text-rose-400 transition" title={t.close}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Loading overlay — dumaloq progress */}
        {loading && (
          <div className="absolute inset-0 z-40 bg-[#0A0A14]/95 backdrop-blur-sm flex flex-col items-center justify-center">
            <CircularProgress value={progress} label={statusMsg || t.opening} sub={sourceName} />
          </div>
        )}

        {/* Left: file manifest */}
        {manifest.length > 0 && !loading && (
          <div className="w-60 bg-[#0C0C18] border-r border-[#1E1E30] flex flex-col shrink-0 overflow-hidden">
            <div className="px-3 py-2 border-b border-[#1E1E30] flex items-center gap-2 text-xs font-bold text-slate-300">
              <FileArchive className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t.files}</span>
              <span className="ml-auto text-[10px] text-slate-500 font-mono">{manifest.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
              {manifest.map((m, i) => {
                const k = classify(m.name);
                const readable = k !== 'other';
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${readable ? 'bg-white/5 text-slate-200' : 'text-slate-500'}`}
                    title={m.name}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        k === 'stl' ? 'bg-cyan-400' : k === 'dicom' ? 'bg-fuchsia-400' : k === 'image' ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                    />
                    <span className="truncate flex-1">{shortName(m.name)}</span>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">{formatBytes(m.size)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Main area */}
        <div className="flex-1 relative overflow-hidden bg-[#0A0A14]">
          {!loading && view === 'empty' && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
              {error ? (
                <>
                  <AlertTriangle className="w-12 h-12 text-amber-400" />
                  <p className="text-sm font-bold text-amber-300 max-w-md">{error}</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-indigo-950/60 border border-indigo-800/60 flex items-center justify-center">
                    <ScanLine className="w-8 h-8 text-indigo-400" />
                  </div>
                  <p className="text-base font-black text-slate-200">{t.empty}</p>
                  <p className="text-xs text-slate-400 max-w-sm leading-relaxed">{t.emptyDesc}</p>
                </>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition"
              >
                <Upload className="w-4 h-4" />
                {t.upload}
              </button>
            </div>
          )}

          {!loading && view === '3d' && <StlView entries={entries.filter((e) => e.kind === 'stl')} />}
          {!loading && view === 'dicom' && (
            <DicomView entries={entries.filter((e) => e.kind === 'dicom')} volume={dicomVolume} onPatient={setDicomPatient} />
          )}
          {!loading && view === 'image' && <ImagesView entries={entries.filter((e) => e.kind === 'image')} urlsRef={objectUrlsRef} />}
        </div>
      </div>
    </div>
  );
}

// ── 3D STL Viewer ────────────────────────────────────────────────────────────

function StlView({ entries }: { entries: ZipEntry[] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a14);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 5000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.3);
    d1.position.set(1, 1, 1);
    scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x818cf8, 0.7);
    d2.position.set(-1, -0.5, -1);
    scene.add(d2);

    const loader = new STLLoader();
    const group = new THREE.Group();
    const initialVisible: Record<string, boolean> = {};

    entries.forEach((e) => {
      if (!e.bytes) return;
      try {
        const ab = e.bytes.buffer.slice(e.bytes.byteOffset, e.bytes.byteOffset + e.bytes.byteLength);
        const geom = loader.parse(ab as ArrayBuffer);
        geom.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ color: stlColorFor(e.short), roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geom, mat);
        group.add(mesh);
        meshesRef.current.set(e.name, mesh);
        initialVisible[e.name] = true;
      } catch (err) {
        console.warn('STL parse failed:', e.short, err);
      }
    });

    scene.add(group);
    setVisible(initialVisible);

    // Kamerani modelga moslash
    const box = new THREE.Box3().setFromObject(group);
    if (!box.isEmpty()) {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      group.position.sub(center); // markazga keltirish
      const maxDim = Math.max(size.x, size.y, size.z);
      const dist = maxDim * 2.2;
      camera.position.set(0, size.y * 0.3, dist);
      camera.near = maxDim / 100;
      camera.far = maxDim * 20;
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0);
      controls.update();
    }

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      meshesRef.current.forEach((m) => {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      meshesRef.current.clear();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  useEffect(() => {
    meshesRef.current.forEach((mesh, name) => {
      mesh.visible = visible[name] !== false;
    });
  }, [visible]);

  const resetView = () => {
    const cam = cameraRef.current;
    const controls = controlsRef.current;
    const scene = sceneRef.current;
    if (!cam || !controls || !scene) return;
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 100;
    cam.position.set(0, size.y * 0.3, maxDim * 2.2);
    controls.target.set(0, 0, 0);
    controls.update();
  };

  return (
    <div className="w-full h-full relative">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Model visibility toggles */}
      <div className="absolute top-4 left-4 bg-[#121226]/85 backdrop-blur-md rounded-2xl border border-[#2B2B4A] p-2 space-y-1 shadow-xl z-10 max-w-[260px]">
        <p className="text-[10px] font-bold text-slate-400 px-2 pt-1 uppercase tracking-wider">Model</p>
        {entries.map((e) => (
          <div key={e.name} className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg hover:bg-white/5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: `#${stlColorFor(e.short).toString(16).padStart(6, '0')}` }} />
              <span className="text-xs text-slate-200 truncate">{e.short}</span>
            </div>
            <button
              onClick={() => setVisible((prev) => ({ ...prev, [e.name]: prev[e.name] === false }))}
              className="text-slate-400 hover:text-white shrink-0"
            >
              {visible[e.name] !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={resetView}
        className="absolute bottom-4 right-4 p-2.5 rounded-xl bg-black/70 hover:bg-black/90 text-slate-300 hover:text-white border border-white/10 transition shadow-lg backdrop-blur-md z-10"
        title="Ko‘rinishni tiklash"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── DICOM CT Viewer ──────────────────────────────────────────────────────────

// DICOM ko'rinishi: 3D hajm (aylantiriladigan) + Kesimlar (MPR) subtablari
function DicomView({
  entries,
  volume,
  onPatient
}: {
  entries: ZipEntry[];
  volume: DicomVolumeData | null;
  onPatient: (n: string) => void;
}) {
  const [sub, setSub] = useState<'3d' | 'slices'>(volume ? '3d' : 'slices');
  useEffect(() => {
    setSub(volume ? '3d' : 'slices');
  }, [volume]);

  return (
    <div className="w-full h-full flex flex-col">
      {volume && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1E1E30] shrink-0">
          <button
            onClick={() => setSub('3d')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              sub === '3d' ? 'bg-[#6366F1] text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>3D</span>
          </button>
          <button
            onClick={() => setSub('slices')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              sub === 'slices' ? 'bg-[#6366F1] text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Kesimlar</span>
          </button>
        </div>
      )}
      <div className="flex-1 relative overflow-hidden">
        {sub === '3d' && volume ? (
          <DicomVolumeView volume={volume} />
        ) : (
          <DicomSlicesView entries={entries} onPatient={onPatient} />
        )}
      </div>
    </div>
  );
}

// Real DICOM hajmini raycasting bilan aylantiriladigan 3D qilib ko'rsatadi
function DicomVolumeView({ volume }: { volume: DicomVolumeData }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const uniformsRef = useRef<Record<string, THREE.IUniform> | null>(null);
  const viewRef = useRef<{ camera: THREE.PerspectiveCamera; controls: OrbitControls; center: THREE.Vector3; dist: number } | null>(null);
  const [density, setDensity] = useState(0.08);
  const [mip, setMip] = useState(true);

  // Standart ko'rinishga o'tish (kadr tartibi teskari bo'lsa ham to'g'irlaydi)
  const applyView = useCallback((v: 'front' | 'back' | 'left' | 'right') => {
    const s = viewRef.current;
    if (!s) return;
    const { camera, controls, center, dist } = s;
    camera.up.set(0, 0, 1); // Z doim tepaga — OrbitControls barqaror
    if (v === 'front') camera.position.set(center.x, center.y - dist, center.z);
    else if (v === 'back') camera.position.set(center.x, center.y + dist, center.z);
    else if (v === 'left') camera.position.set(center.x + dist, center.y, center.z);
    else if (v === 'right') camera.position.set(center.x - dist, center.y, center.z);
    controls.target.copy(center);
    controls.update();
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;
    const mount = mountRef.current;
    const w = mount.clientWidth;
    const h = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a14);

    const { data, nx, ny, nz, stepX, stepY, stepZ } = volume;

    const texture = new THREE.Data3DTexture(data, nx, ny, nz);
    texture.format = THREE.RedFormat;
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    // Kulrang (grayscale) rang-jadval — CT ko'rinishi
    const cm = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      cm[i * 4] = i;
      cm[i * 4 + 1] = i;
      cm[i * 4 + 2] = i;
      cm[i * 4 + 3] = 255;
    }
    const cmtex = new THREE.DataTexture(cm, 256, 1, THREE.RGBAFormat);
    cmtex.needsUpdate = true;

    const uniforms = THREE.UniformsUtils.clone(VolumeRenderShader1.uniforms);
    uniforms.u_data.value = texture;
    uniforms.u_size.value.set(nx, ny, nz);
    uniforms.u_clim.value.set(density, 1.0);
    uniforms.u_renderstyle.value = mip ? 0 : 1;
    uniforms.u_renderthreshold.value = 0.25;
    uniforms.u_cmdata.value = cmtex;
    uniformsRef.current = uniforms;

    // MUHIM: VolumeShader `gl_FragColor` ishlatadi, lekin GLSL3'da u e'lon
    // qilinmagan → shaderga o'z `out` o'zgaruvchimizni qo'shamiz (aks holda
    // shader kompilyatsiya bo'lmay, qora ekran chiqadi).
    const patchedFrag =
      'layout(location = 0) out highp vec4 volOutColor;\n#define gl_FragColor volOutColor\n' + VolumeRenderShader1.fragmentShader;
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VolumeRenderShader1.vertexShader,
      fragmentShader: patchedFrag,
      side: THREE.BackSide,
      glslVersion: THREE.GLSL3
    });

    const geometry = new THREE.BoxGeometry(nx, ny, nz);
    geometry.translate(nx / 2 - 0.5, ny / 2 - 0.5, nz / 2 - 0.5);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(stepX, stepY, stepZ); // fizik proporsiya (voksel qadamlari)
    scene.add(mesh);

    // Kamerani hajm butunlay ko'rinadigan qilib moslash (fit-to-view):
    // ekran vertikali = Z (bo'y), gorizontali = X (en). Butun bosh-jag'
    // to'liq ko'rinadi (bo'yindan tepagacha), kadrga sig'adi.
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const fov = 45;
    const fovRad = (fov * Math.PI) / 180;
    const aspect = w / h;
    const fitHeightDist = size.z / 2 / Math.tan(fovRad / 2);
    const fitWidthDist = size.x / 2 / (Math.tan(fovRad / 2) * aspect);
    const dist = Math.max(fitHeightDist, fitWidthDist) * 1.3;
    const camera = new THREE.PerspectiveCamera(fov, aspect, dist * 0.02, dist * 20);
    camera.up.set(0, 0, 1); // Z tepaga (bosh tik turadi)
    camera.position.set(center.x, center.y - dist, center.z); // frontal ko'rinish

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.copy(center);
    controls.update();
    viewRef.current = { camera, controls, center, dist };

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const W = mount.clientWidth;
      const H = mount.clientHeight;
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      cmtex.dispose();
      renderer.dispose();
      uniformsRef.current = null;
      viewRef.current = null;
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume]);

  // Zichlik/rejim jonli o'zgaradi (sahnani qayta qurmasdan)
  useEffect(() => {
    const u = uniformsRef.current;
    if (u) {
      u.u_clim.value.set(density, 1.0);
      u.u_renderstyle.value = mip ? 0 : 1;
    }
  }, [density, mip]);

  return (
    <div className="w-full h-full relative">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-[#121226]/90 backdrop-blur border border-[#2B2B4A] rounded-2xl px-4 py-2 shadow-xl">
        <Sliders className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-[11px] text-slate-400">Zichlik</span>
        <input
          type="range"
          min={0}
          max={0.9}
          step={0.01}
          value={density}
          onChange={(e) => setDensity(parseFloat(e.target.value))}
          className="w-36 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
        />
        <button
          onClick={() => setMip((m) => !m)}
          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/5 text-slate-200 hover:bg-white/10 transition"
          title="Ko‘rsatish rejimi"
        >
          {mip ? 'MIP' : 'Yuza'}
        </button>
      </div>
      {/* Oriyentatsiya tugmalari — bir tugma bilan to'g'ri ko'rinish */}
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/75 backdrop-blur rounded-xl p-1 border border-white/10 shadow-xl">
        {([
          ['front', 'Old'],
          ['left', 'Yon'],
          ['right', 'O‘ng'],
          ['back', 'Orqa']
        ] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => applyView(k)}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-300 hover:text-white hover:bg-indigo-600/60 transition"
            title={l}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="absolute top-3 left-3 px-2.5 py-1 bg-black/70 backdrop-blur rounded-lg text-[11px] font-mono text-cyan-300 border border-cyan-900/60 pointer-events-none">
        3D CBCT • {volume.nx}×{volume.ny}×{volume.nz} • sichqoncha bilan aylantiring
      </div>
    </div>
  );
}

function DicomSlicesView({ entries, onPatient }: { entries: ZipEntry[]; onPatient: (n: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [meta, setMeta] = useState<DicomMeta | null>(null);
  const [frame, setFrame] = useState(0);
  const [wc, setWc] = useState(0);
  const [ww, setWw] = useState(0);
  const [parseError, setParseError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [showInfo, setShowInfo] = useState(false);
  const bytesRef = useRef<Uint8Array | null>(null);

  const active = entries[activeIdx];

  // Parse selected DICOM
  useEffect(() => {
    setParseError('');
    setMeta(null);
    if (!active?.bytes) return;
    try {
      const m = parseDicomMeta(active.bytes);
      bytesRef.current = active.bytes;
      setMeta(m);
      setFrame(Math.floor(m.frames / 2)); // o'rtadagi kesim
      setWc(m.windowCenter);
      setWw(m.windowWidth);
      if (m.patientName) onPatient(m.patientName);
    } catch (e) {
      console.error('DICOM parse error:', e);
      setParseError(
        (e as Error).message?.includes('length')
          ? 'DICOM fayl juda katta yoki buzilgan — brauzer xotirasi yetmadi.'
          : 'DICOM faylni o‘qib bo‘lmadi: ' + (e as Error).message
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Render frame
  useEffect(() => {
    if (!canvasRef.current || !meta || !bytesRef.current) return;
    try {
      renderDicomFrame(canvasRef.current, bytesRef.current, meta, frame, wc, ww);
    } catch (e) {
      console.warn('frame render error', e);
    }
  }, [meta, frame, wc, ww]);

  const onWheel = (e: React.WheelEvent) => {
    if (!meta) return;
    e.preventDefault();
    setFrame((f) => Math.min(meta.frames - 1, Math.max(0, f + (e.deltaY > 0 ? 1 : -1))));
  };

  if (parseError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-400" />
        <p className="text-sm font-bold text-amber-300 max-w-md">{parseError}</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Multi-DICOM selector */}
      {entries.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1E1E30] overflow-x-auto shrink-0">
          {entries.map((e, i) => (
            <button
              key={e.name}
              onClick={() => setActiveIdx(i)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono whitespace-nowrap transition ${
                i === activeIdx ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {e.short}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black" onWheel={onWheel}>
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full object-contain"
          style={{ transform: `scale(${zoom})`, transition: 'transform 0.12s ease-out', imageRendering: 'pixelated' }}
        />

        {meta && (
          <>
            {/* Overlay: frame + info */}
            <div className="absolute top-3 left-3 px-2.5 py-1 bg-black/70 backdrop-blur rounded-lg text-[11px] font-mono text-cyan-300 border border-cyan-900/60">
              {meta.frames > 1 ? `Kesim ${frame + 1} / ${meta.frames}` : `${meta.cols}×${meta.rows}`} {meta.modality ? `• ${meta.modality}` : ''}
            </div>
            <button
              onClick={() => setShowInfo((s) => !s)}
              className="absolute top-3 right-3 p-2 bg-black/70 backdrop-blur rounded-lg text-slate-300 hover:text-white border border-white/10 transition"
            >
              <Info className="w-4 h-4" />
            </button>

            {showInfo && (
              <div className="absolute top-14 right-3 w-64 bg-[#121226]/95 backdrop-blur border border-[#2B2B4A] rounded-xl p-3 text-[11px] font-mono text-slate-300 space-y-1 z-20 shadow-2xl">
                <Row label="Bemor" value={meta.patientName || '—'} />
                <Row label="Apparat" value={meta.manufacturer || '—'} />
                <Row label="Modality" value={meta.modality || '—'} />
                <Row label="O‘lcham" value={`${meta.cols}×${meta.rows}×${meta.frames}`} />
                <Row label="Bit" value={`${meta.bitsAllocated}-bit ${meta.signed ? 'signed' : 'unsigned'}`} />
                <Row label="Piksel (mm)" value={meta.pixelSpacing || '—'} />
                <Row label="Window C/W" value={`${Math.round(wc)} / ${Math.round(ww)}`} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      {meta && (
        <div className="shrink-0 border-t border-[#1E1E30] bg-[#0E0E1B] p-3 space-y-2">
          {meta.frames > 1 && (
            <div className="flex items-center gap-3">
              <button onClick={() => setFrame((f) => Math.max(0, f - 1))} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="range"
                min={0}
                max={meta.frames - 1}
                value={frame}
                onChange={(e) => setFrame(parseInt(e.target.value, 10))}
                className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <button onClick={() => setFrame((f) => Math.min(meta.frames - 1, f + 1))} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <div className="flex items-center gap-2 flex-1">
              <Sliders className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="w-16 shrink-0">Yorug‘lik</span>
              <input
                type="range"
                min={meta.signed ? -1000 : 0}
                max={meta.signed ? 3000 : 65535}
                value={wc}
                onChange={(e) => setWc(parseInt(e.target.value, 10))}
                className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <span className="w-16 shrink-0">Kontrast</span>
              <input
                type="range"
                min={1}
                max={meta.signed ? 4000 : 65535}
                value={ww}
                onChange={(e) => setWw(parseInt(e.target.value, 10))}
                className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300">
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setZoom((z) => Math.min(4, z + 0.2))} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setWc(meta.windowCenter);
                  setWw(meta.windowWidth);
                  setZoom(1);
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}:</span>
      <span className="text-slate-200 text-right truncate">{value}</span>
    </div>
  );
}

// ── Images Viewer ────────────────────────────────────────────────────────────

function ImagesView({ entries, urlsRef }: { entries: ZipEntry[]; urlsRef: React.MutableRefObject<string[]> }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [invert, setInvert] = useState(false);

  useEffect(() => {
    const made = entries.map((e) => {
      const b = e.bytes as Uint8Array;
      const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      const blob = new Blob([ab]);
      const u = URL.createObjectURL(blob);
      urlsRef.current.push(u);
      return u;
    });
    setUrls(made);
    setActive(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  if (!urls.length) return null;

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urls[active]}
          alt={entries[active]?.short}
          className="max-w-full max-h-full object-contain"
          style={{ transform: `scale(${zoom})`, filter: invert ? 'invert(1)' : 'none', transition: 'transform 0.12s ease-out' }}
        />
        <div className="absolute top-3 left-3 px-2.5 py-1 bg-black/70 backdrop-blur rounded-lg text-[11px] font-mono text-emerald-300 border border-emerald-900/60">
          {entries[active]?.short}
        </div>
      </div>

      <div className="shrink-0 border-t border-[#1E1E30] bg-[#0E0E1B] p-2 flex items-center gap-2">
        <div className="flex items-center gap-1 overflow-x-auto flex-1">
          {urls.map((u, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`w-12 h-12 rounded-lg overflow-hidden border-2 shrink-0 transition ${i === active ? 'border-indigo-500' : 'border-transparent opacity-60 hover:opacity-100'}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setInvert((v) => !v)} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${invert ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}>
            Inv
          </button>
          <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300">
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setZoom((z) => Math.min(4, z + 0.2))} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => { setZoom(1); setInvert(false); }} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
