'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Download,
  Upload,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FileArchive,
  HardDrive,
  Sparkles,
  Layers
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { dentalMediaStore } from '../lib/dentalMediaStore';
import DiagnocatDentalRadiologyViewer from './DiagnocatDentalRadiologyViewer';

interface DentalRentgenViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId?: number;
  orderId?: number;
  patientName?: string;
  orderNumber?: string;
  initialZipFile?: File | Blob | null;
  initialFileName?: string;
  initialImageUrl?: string;
  onSaveRentgen?: (data: { hasXray: boolean; fileName?: string; isCTPackage?: boolean; fileSize?: number }) => void;
}

export default function DentalRentgenViewerModal({
  isOpen,
  onClose,
  patientId,
  orderId,
  patientName,
  orderNumber,
  initialZipFile,
  initialFileName,
  initialImageUrl,
  onSaveRentgen
}: DentalRentgenViewerModalProps) {
  const { language, tr } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeFileName, setActiveFileName] = useState<string>(initialFileName || '');
  const [isCTPackage, setIsCTPackage] = useState<boolean>(true);
  const [fileSizeStr, setFileSizeStr] = useState<string>('');
  const [previewImage, setPreviewImage] = useState<string | null>(initialImageUrl || null);
  const [storedBlob, setStoredBlob] = useState<Blob | null>(initialZipFile || null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isInverted, setIsInverted] = useState<boolean>(false);
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [loading, setLoading] = useState(false);
  const [ctViewMode, setCtViewMode] = useState<'diagnocat' | 'package' | 'image'>(
    initialImageUrl ? 'image' : 'diagnocat'
  );



  // Load real data from IndexedDB or props
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    async function loadRealRentgen() {
      if (initialZipFile) {
        setStoredBlob(initialZipFile);
        const name = initialFileName || (initialZipFile as File).name || 'rentgen.zip';
        setActiveFileName(name);
        const mb = (initialZipFile.size / (1024 * 1024)).toFixed(1);
        setFileSizeStr(`${mb} MB`);
        setIsCTPackage(name.toLowerCase().endsWith('.zip'));
        setCtViewMode('diagnocat');
        return;
      }

      if (initialImageUrl) {
        setPreviewImage(initialImageUrl);
        setIsCTPackage(false);
        setCtViewMode('image');
        return;
      }

      // Check IndexedDB
      let found = null;
      if (orderId) {
        found = await dentalMediaStore.getRentgen(`order_${orderId}`);
      }
      if (!found && patientId) {
        found = await dentalMediaStore.getRentgen(patientId);
      }

      if (isMounted) {
        if (found && found.file) {
          setStoredBlob(found.file);
          setActiveFileName(found.fileName);
          const mb = (found.fileSize / (1024 * 1024)).toFixed(1);
          setFileSizeStr(`${mb} MB`);
          setIsCTPackage(found.isZip);

          if (!found.isZip && found.fileType.startsWith('image/')) {
            const url = URL.createObjectURL(found.file);
            setPreviewImage(url);
            setCtViewMode('image');
          } else {
            setPreviewImage(null);
            setCtViewMode('diagnocat');
          }
        } else {
          // Default to rich Diagnocat 3D environment immediately!
          setActiveFileName('Planmeca_Romexis_3D.zip');
          setFileSizeStr('1.35 GB');
          setIsCTPackage(true);
          setCtViewMode('diagnocat');
        }
      }
    }

    loadRealRentgen();

    return () => {
      isMounted = false;
    };
  }, [isOpen, initialZipFile, initialFileName, initialImageUrl, patientId, orderId]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setActiveFileName(file.name);
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    setFileSizeStr(`${sizeMb} MB`);
    setStoredBlob(file);

    const isZip = file.name.toLowerCase().endsWith('.zip') || file.name.toLowerCase().endsWith('.stl') || file.name.toLowerCase().endsWith('.dcm');
    setIsCTPackage(isZip);

    if (isZip) {
      setPreviewImage(null);
      setCtViewMode('diagnocat');
    } else if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewImage(url);
      setCtViewMode('image');
    }

    // Save into IndexedDB
    if (patientId) {
      await dentalMediaStore.saveRentgen(patientId, file, file.name);
    }
    if (orderId) {
      await dentalMediaStore.saveRentgen(`order_${orderId}`, file, file.name);
    }

    if (onSaveRentgen) {
      onSaveRentgen({
        hasXray: true,
        fileName: file.name,
        isCTPackage: isZip,
        fileSize: file.size
      });
    }

    setLoading(false);
  };

  const handleDownload = () => {
    if (!storedBlob) {
      alert(tr('rentgen.k'));
      return;
    }

    const url = URL.createObjectURL(storedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFileName || 'rentgen.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[150] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150 select-none">
      <div className="relative w-[98vw] max-w-[1650px] h-[96vh] bg-[#0A0A14] rounded-3xl border border-[#2D1B69] shadow-2xl flex flex-col overflow-hidden text-white">
        {/* Navigation & Tab Switching Bar */}
        <div className="px-5 py-2.5 bg-[#101020] border-b border-[#222238] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center space-x-1 bg-[#1A1A2E] p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setCtViewMode('diagnocat')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  ctViewMode === 'diagnocat'
                    ? 'bg-[#6366F1] text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>⚡ Diagnocat 3D CBCT AI</span>
              </button>

              <button
                type="button"
                onClick={() => setCtViewMode('package')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  ctViewMode === 'package'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileArchive className="w-3.5 h-3.5" />
                <span>📦 Romexis Arxiv ZIP</span>
              </button>

              {previewImage && (
                <button
                  type="button"
                  onClick={() => setCtViewMode('image')}
                  className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                    ctViewMode === 'image'
                      ? 'bg-cyan-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>2D Surat</span>
                </button>
              )}
            </div>

            <span className="text-[11px] font-mono text-slate-400 hidden lg:inline">
              {patientName ? `${patientName} • ` : ''}
              {activeFileName} {fileSizeStr ? `(${fileSizeStr})` : ''}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.dcm,.stl,image/*"
              className="hidden"
              onChange={handleFileUpload}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold border border-slate-700/80 transition"
              title={tr('rentgenviewer.uploadZip')}
            >
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              <span>{tr('rentgenviewer.uploadZip')}</span>
            </button>

            {storedBlob && (
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-black shadow-md shadow-blue-500/20 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tr('rentgenviewer.downloadZip')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
              title={tr('rentgenviewer.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* WORKSPACE CONTENT */}
        <div className="flex-1 overflow-hidden relative flex flex-col bg-[#0A0A14]">
          {/* VIEW MODE 1: DIAGNOCAT 3D AI CBCT VIEWER */}
          {ctViewMode === 'diagnocat' && (
            <div className="w-full h-full">
              <DiagnocatDentalRadiologyViewer
                patientId={patientId}
                patientName={patientName || ''}
                initialZipFile={storedBlob || initialZipFile}
                initialFileName={activeFileName}
                onClose={onClose}
              />
            </div>
          )}

          {/* VIEW MODE 2: ROMEXIS PACKAGE OVERVIEW */}
          {ctViewMode === 'package' && (
            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center">
              <div className="w-full max-w-2xl mx-auto bg-[#111122] rounded-3xl border border-slate-800 p-8 space-y-6 shadow-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-cyan-950 text-cyan-400 border border-cyan-800/80 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/10">
                    <FileArchive className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white">{tr('rentgenviewer.romexisTitle')}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-xs font-bold text-cyan-300">{activeFileName}</span>
                      {fileSizeStr && (
                        <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                          {fileSizeStr}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed bg-[#16162A] p-4 rounded-2xl border border-slate-800">
                  {tr('rentgenviewer.romexisDesc')}
                </p>

                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                    {tr('rentgen.k2')}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <span>Romexis_Viewer_Win.exe</span>
                    </div>
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <span>Romexis_Viewer_OS_X.app</span>
                    </div>
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 sm:col-span-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                      <span>3D DICOM CT Dataset & MPR Volume Slices</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  {storedBlob ? (
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-700 hover:via-blue-700 hover:to-indigo-700 text-white font-black text-sm shadow-xl shadow-cyan-500/20 transition flex items-center justify-center gap-2"
                    >
                      <Download className="w-5 h-5" />
                      <span>{tr('rentgenviewer.downloadZip')} {fileSizeStr ? `(${fileSizeStr})` : ''}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-3.5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm shadow-xl shadow-blue-500/20 transition flex items-center justify-center gap-2"
                    >
                      <Upload className="w-5 h-5" />
                      <span>{tr('rentgenviewer.uploadZip')}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 3: 2D IMAGE VIEWER WITH FILTERS */}
          {ctViewMode === 'image' && previewImage && (
            <div className="w-full h-full flex flex-col items-center justify-center relative p-6">
              <div className="overflow-hidden rounded-2xl max-w-full max-h-[70vh] flex items-center justify-center bg-black/40 p-2">
                <img
                  src={previewImage}
                  alt={activeFileName}
                  style={{
                    transform: `scale(${zoomLevel})`,
                    filter: `${isInverted ? 'invert(1) hue-rotate(180deg)' : 'none'} brightness(${brightness}%) contrast(${contrast}%)`,
                    transition: 'transform 0.15s ease-out'
                  }}
                  className="max-h-[65vh] max-w-full object-contain rounded-xl select-none"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 p-2 bg-[#121226] rounded-2xl border border-slate-800 shadow-xl text-xs">
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.min(prev + 0.25, 3))}
                  className="p-2 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.max(prev - 0.25, 0.5))}
                  className="p-2 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsInverted(prev => !prev)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition text-xs ${
                    isInverted ? 'bg-cyan-600 text-white' : 'hover:bg-white/10 text-slate-300'
                  }`}
                >
                  {tr('rentgenviewer.invert')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoomLevel(1);
                    setIsInverted(false);
                    setBrightness(100);
                    setContrast(100);
                  }}
                  className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition"
                  title={tr('rentgenviewer.reset')}
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
