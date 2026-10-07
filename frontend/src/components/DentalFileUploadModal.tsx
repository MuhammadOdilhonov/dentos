'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  FileArchive,
  CheckCircle2,
  AlertCircle,
  FileCode,
  HardDrive,
  Download,
  Loader2,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { dentalMediaStore, StoredMediaItem } from '../lib/dentalMediaStore';
import { useI18n } from '../lib/i18n';

interface DentalFileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: number | string;
  patientName: string;
  uploadType: 'rentgen' | 'skan';
  onSuccess?: (item: StoredMediaItem) => void;
}

export default function DentalFileUploadModal({
  isOpen,
  onClose,
  patientId,
  patientName,
  uploadType,
  onSuccess
}: DentalFileUploadModalProps) {
  const { tr } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string>('');
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [savedMediaItem, setSavedMediaItem] = useState<StoredMediaItem | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Reset state when modal is opened/closed
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setUploadProgress(0);
      setIsUploading(false);
      setIsCompleted(false);
      setSavedMediaItem(null);
      setErrorMsg('');
      setUploadStatusMsg('');
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isRentgen = uploadType === 'rentgen';
  const title = isRentgen ? tr('fileUpload.titleRentgen') : tr('fileUpload.title3d');
  const subtitle = isRentgen
    ? tr('fileUpload.subRentgen')
    : tr('fileUpload.sub3d');

  const acceptedFormats = isRentgen
    ? '.zip,.dcm,.rar,.7z,.jpg,.jpeg,.png'
    : '.stl,.ply,.obj,.zip';

  const acceptedLabel = isRentgen
    ? 'ZIP, DICOM (.dcm), RAR, JPG, PNG'
    : 'STL, PLY, OBJ, ZIP';

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    setErrorMsg('');
    setSelectedFile(file);
    startUpload(file);
  };

  const startUpload = async (file: File) => {
    setIsUploading(true);
    setIsCompleted(false);
    setUploadProgress(5);
    setUploadStatusMsg(tr('fileUpload.readingChecking'));

    // Progress simulation with smooth real-time steps
    let current = 5;
    const fileSizeMb = (file.size / (1024 * 1024)).toFixed(1);

    intervalRef.current = setInterval(() => {
      current += Math.floor(Math.random() * 14) + 8;
      if (current >= 95) {
        current = 95;
        if (intervalRef.current) clearInterval(intervalRef.current);
        setUploadStatusMsg(tr('fileUpload.writingSecure'));
      } else if (current > 60) {
        setUploadStatusMsg(`${fileSizeMb} MB yuklanmoqda... (${current}%)`);
      } else if (current > 30) {
        setUploadStatusMsg(`Fayl shifrlanmoqda va serverga uzatilmoqda... (${current}%)`);
      }
      setUploadProgress(current);
    }, 120);

    try {
      let item: StoredMediaItem;
      if (isRentgen) {
        item = await dentalMediaStore.saveRentgen(patientId, file, file.name);
      } else {
        item = await dentalMediaStore.saveScan(patientId, file, file.name);
      }

      if (intervalRef.current) clearInterval(intervalRef.current);
      setUploadProgress(100);
      setUploadStatusMsg(tr('fileUpload.savedSuccess'));
      setIsUploading(false);
      setIsCompleted(true);
      setSavedMediaItem(item);

      if (onSuccess) {
        onSuccess(item);
      }
    } catch (err: any) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setIsUploading(false);
      setErrorMsg(err?.message || tr('fileUpload.saveError'));
    }
  };

  const handleDownload = () => {
    if (!savedMediaItem && !selectedFile) return;
    const blob = savedMediaItem?.file || selectedFile;
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = savedMediaItem?.fileName || selectedFile?.name || 'medical_archive.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#111C38] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden text-slate-900 dark:text-white">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold shadow-sm ${
                isRentgen
                  ? 'bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-sky-400'
                  : 'bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'
              }`}
            >
              {isRentgen ? <HardDrive className="w-5 h-5" /> : <FileArchive className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight">{title}</h3>
              <p className="text-xs text-slate-400 font-medium">Bemor: <span className="font-semibold text-slate-700 dark:text-slate-200">{patientName}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {!isCompleted ? (
            <>
              {/* Dropzone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 scale-[1.01]'
                    : isUploading
                    ? 'border-slate-300 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40 cursor-wait'
                    : 'border-slate-300 hover:border-blue-500 dark:border-slate-700 dark:hover:border-sky-400 bg-slate-50/30 hover:bg-blue-50/20 dark:bg-slate-900/20'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptedFormats}
                  onChange={handleInputChange}
                  className="hidden"
                  disabled={isUploading}
                />

                <div className="flex flex-col items-center justify-center space-y-3">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform ${
                      isDragging ? 'scale-110' : ''
                    } ${
                      isRentgen
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400'
                        : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {isUploading ? (
                      <Loader2 className="w-7 h-7 animate-spin" />
                    ) : (
                      <Upload className="w-7 h-7" />
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-bold">
                      {isUploading
                        ? tr('fileUpload.uploadingWait')
                        : tr('fileUpload.dropOrClick')}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      {subtitle}
                    </p>
                  </div>

                  <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <span>{tr('fileUpload.supported')}</span>
                    <span className="font-mono text-blue-600 dark:text-sky-400">{acceptedLabel}</span>
                  </div>
                </div>
              </div>

              {/* Upload Progress Display */}
              {isUploading && selectedFile && (
                <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/50 border border-blue-200/80 dark:border-blue-900/60 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 truncate pr-2">
                      <FileCode className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0" />
                      <span className="font-bold truncate text-slate-800 dark:text-slate-200">
                        {selectedFile.name}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-blue-600 dark:text-sky-400">
                      {uploadProgress}%
                    </span>
                  </div>

                  {/* Animated Progress Bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-600 to-sky-400 h-full rounded-full transition-all duration-200 shadow-sm"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{uploadStatusMsg}</span>
                    <span className="font-mono font-medium">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                </div>
              )}

              {/* Error Message if any */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </>
          ) : (
            /* Upload Complete Success View */
            <div className="py-4 space-y-5 text-center animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-xl shadow-emerald-500/10">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h4 className="text-base font-black text-slate-900 dark:text-white">
                  Fayl muvaffaqiyatli yuklandi!
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Fayl bemorning raqamli kartasiga biriktirildi. Barcha shifokorlar va xodimlar endi ushbu faylni o‘z kompyuteriga yuklab olishi mumkin.
                </p>
              </div>

              {/* Uploaded File Info Card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Fayl nomi:</span>
                  <span className="font-bold truncate max-w-[240px] text-slate-800 dark:text-slate-200">
                    {savedMediaItem?.fileName || selectedFile?.name}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Hajmi:</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {((savedMediaItem?.fileSize || selectedFile?.size || 0) / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Holati:</span>
                  <span className="inline-flex items-center space-x-1 font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{tr('fileUpload.savedCloud')}</span>
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                <button
                  onClick={handleDownload}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition"
                >
                  <Download className="w-4 h-4 text-blue-600 dark:text-sky-400" />
                  <span>{tr('fileUpload.tryDownload')}</span>
                </button>

                <button
                  onClick={onClose}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition"
                >
                  <span>{tr('fileUpload.doneClose')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer info */}
        {!isCompleted && (
          <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>{tr('fileUpload.encryptedStorage')}</span>
            </span>
            <button
              onClick={onClose}
              disabled={isUploading}
              className="text-xs font-semibold hover:text-slate-600 dark:hover:text-white transition disabled:opacity-50"
            >
              Bekor qilish
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
