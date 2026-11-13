'use client';

/**
 * MapPickerModal — filial lokatsiyasini XARITADAN tanlash (Leaflet + OpenStreetMap).
 * Leaflet CDN'dan bir marta dinamik yuklanadi (bundle kattalashmaydi, npm dep shart emas).
 * Xaritani bosganda marker tushadi; "Tanlash" → https://maps.google.com/?q=lat,lng havola qaytadi
 * (SMS/Telegram eslatmalarida bemorga shu havola yuboriladi — Google Maps hammada ochiladi).
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, MapPin, Check, Loader2 } from 'lucide-react';
import { useI18n } from '../lib/i18n';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
// Toshkent markazi — default ko'rinish
const DEFAULT_CENTER: [number, number] = [41.3111, 69.2797];

let leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('ssr'));
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = () => { leafletPromise = null; reject(new Error('leaflet load failed')); };
    document.head.appendChild(script);
  });
  return leafletPromise;
}

// Mavjud havoladan koordinatani ajratib olish (maps.google.com/?q=41.31,69.27 yoki yandex ll=)
export function parseLatLng(url: string): [number, number] | null {
  if (!url) return null;
  const q = url.match(/[?&]q=(-?\d{1,3}\.\d+)[,%2C]+(-?\d{1,3}\.\d+)/i);
  if (q) return [Number(q[1]), Number(q[2])];
  const ll = url.match(/[?&]ll=(-?\d{1,3}\.\d+)[,%2C]+(-?\d{1,3}\.\d+)/i);
  if (ll) return [Number(ll[2]), Number(ll[1])]; // yandex: lng,lat
  const at = url.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (at) return [Number(at[1]), Number(at[2])];
  return null;
}

interface Props {
  open: boolean;
  initialUrl?: string;
  onClose: () => void;
  onSelect: (url: string, lat: number, lng: number) => void;
}

export default function MapPickerModal({ open, initialUrl, onClose, onSelect }: Props) {
  const { tr } = useI18n();
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [picked, setPicked] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    const initial = parseLatLng(initialUrl || '');
    setPicked(initial);

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapDivRef.current) return;
        // Eski xarita qolgan bo'lsa tozalaymiz (modal qayta ochilishi)
        if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; }
        const center = initial || DEFAULT_CENTER;
        const map = L.map(mapDivRef.current).setView(center, initial ? 16 : 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap'
        }).addTo(map);
        if (initial) {
          markerRef.current = L.marker(initial).addTo(map);
        }
        map.on('click', (e: any) => {
          const { lat, lng } = e.latlng;
          setPicked([lat, lng]);
          if (markerRef.current) {
            markerRef.current.setLatLng(e.latlng);
          } else {
            markerRef.current = L.marker(e.latlng).addTo(map);
          }
        });
        mapRef.current = map;
        setLoading(false);
        // Modal animatsiyasidan keyin o'lchamni qayta hisoblash
        setTimeout(() => map.invalidateSize(), 150);
      })
      .catch(() => { if (!cancelled) { setLoading(false); setLoadError(true); } });

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; }
    };
  }, [open, initialUrl]);

  if (!open) return null;

  const handleConfirm = () => {
    if (!picked) return;
    const [lat, lng] = picked;
    const url = `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
    onSelect(url, lat, lng);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="px-5 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">{tr('settings2.mapPickTitle')}</h3>
              <p className="text-[11px] text-slate-400">{tr('settings2.mapPickHint')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center justify-center transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative" style={{ height: '55vh', minHeight: 320 }}>
          <div ref={mapDivRef} className="absolute inset-0 z-0" />
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50 dark:bg-slate-900">
              <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
            </div>
          )}
          {loadError && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-50 dark:bg-slate-900 text-xs font-bold text-rose-500 px-6 text-center">
              {tr('settings2.mapLoadError')}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 truncate">
            {picked ? `${picked[0].toFixed(6)}, ${picked[1].toFixed(6)}` : tr('settings2.mapNoPoint')}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition">
              {tr('naryadcat.cancel')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!picked}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black shadow-md shadow-blue-500/25 transition"
            >
              <Check className="w-4 h-4" />
              {tr('settings2.mapSelectBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
