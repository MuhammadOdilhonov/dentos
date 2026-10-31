'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Plus,
  Type,
  ImagePlus,
  Undo2,
  Redo2,
  Copy,
  Trash2,
  RotateCw,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ChevronUp,
  ChevronDown,
  Check,
  AlertCircle,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Share2,
  Table,
  Shapes,
  Crop,
  Sparkles,
  MessageSquare,
  ArrowUpRight,
  RefreshCw,
  Play,
  Paintbrush,
  ChevronLeft,
  ChevronRight,
  Scissors,
  ClipboardPaste,
  X
} from 'lucide-react';
import type { KeynoteElement, KeynoteSlide } from './KeynoteDentalPhotoProtocol';
import { clinicApi, isDemoClinic, getActiveClinicId } from '../lib/api';
import { collectMediaRewrites, applyMediaRewrites } from '../lib/photoDocMedia';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import type { ExportFormat } from './PhotoProtocolExport';
import css from './PhotoProtocolStudio.module.css';

export type Element = Omit<KeynoteElement, 'type' | 'align'> & {
  type: 'image' | 'text' | 'heading' | 'badge' | 'note';
  align?: 'left' | 'center' | 'right' | 'justify';
  fit?: 'cover' | 'contain';
  objectX?: number; // 0 to 100 percentage
  objectY?: number; // 0 to 100 percentage
  objectScale?: number; // 1 to 4
  brightness?: number; // -50 to 50
  contrast?: number; // 50 to 150
  opacity?: number; // 0 to 100
  borderRadius?: number; // px
  borderWidth?: number; // px
  borderColor?: string;
  shadow?: boolean;
  fontFamily?: string;
  underline?: boolean;
  strike?: boolean;
  bgColor?: string;
  noteAuthor?: string;
  noteTime?: string;
};

export type Slide = Omit<KeynoteSlide, 'elements'> & {
  elements: Element[];
};

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `el_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const blank = (): Slide => ({ id: uid(), elements: [], background: '#ffffff' });
const bound = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function storage(mode: 'readonly' | 'readwrite', key: string, value?: Slide[]): Promise<Slide[] | undefined> {
  return new Promise((resolve, reject) => {
    try {
      const open = indexedDB.open('dentos-photo-studio', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('documents');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('documents', mode);
        const store = tx.objectStore('documents');
        const r = mode === 'readonly' ? store.get(key) : store.put(value, key);
        tx.oncomplete = () => {
          db.close();
          resolve(mode === 'readonly' ? r.result : undefined);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      };
    } catch (e) {
      reject(e);
    }
  });
}

// Keynote tab-indikatori uchun: bemorning foto-protokolida rasm bormi? (studio IndexedDB).
export async function photoStudioHasImages(patientId: number): Promise<boolean> {
  try {
    const key = `${getActiveClinicId() ?? 'none'}:${patientId}`;
    const slides = await storage('readonly', key);
    if (Array.isArray(slides)) {
      return slides.some((s) => Array.isArray(s.elements) && s.elements.some((e: any) => e.type === 'image' && e.src));
    }
  } catch {
    /* indexedDB yo'q/bo'sh */
  }
  return false;
}

// ── Foto kartochka uchun: (klinika,bemor) → BIRINCHI SLAYD keshi ──
// Asosiy manba REAL klinikada SERVERdagi canonical doc. Ro'yxatni og'irlashtirmaslik uchun:
// (clinic,patient) kesh + in-flight dedupe + cheklangan parallellik (bir vaqtda ≤4 so'rov).
// Saqlanganda `invalidateFirstSlide` bilan tozalanadi. Demo fallback REAL ma'lumotga aralashmaydi.
const _firstSlideCache = new Map<string, Slide | null>();
const _firstSlideInflight = new Map<string, Promise<Slide | null>>();
let _firstSlideActive = 0;
const _firstSlideQueue: Array<() => void> = [];
function _pumpFirstSlide() {
  while (_firstSlideActive < 4 && _firstSlideQueue.length) {
    const job = _firstSlideQueue.shift()!;
    _firstSlideActive++;
    job();
  }
}
function firstSlideKey(patientId: number, clinicId?: number | null) {
  return `${clinicId ?? getActiveClinicId() ?? 'none'}:${patientId}`;
}
function fetchFirstSlide(patientId: number): Promise<Slide | null> {
  const key = firstSlideKey(patientId);
  if (_firstSlideCache.has(key)) return Promise.resolve(_firstSlideCache.get(key) ?? null);
  const existing = _firstSlideInflight.get(key);
  if (existing) return existing;
  const p = new Promise<Slide | null>((resolve) => {
    _firstSlideQueue.push(async () => {
      let result: Slide | null = null;
      let cacheable = true;
      try {
        if (isDemoClinic()) {
          const legacy = clinicApi.getPatientPhotoDoc(patientId) as any[];
          const doc = legacy && legacy[0]?.elements ? (legacy as Slide[]) : migrateLegacy(legacy || []);
          result = doc && doc.length ? doc[0] : null;
        } else {
          const doc = await clinicApi.fetchPatientPhotoDoc(patientId); // canonical doc | null(=o'qilmadi)
          if (doc === null) { cacheable = false; result = null; }   // xato — keshlamaymiz (qayta urinish mumkin)
          else result = doc.length ? (doc[0] as Slide) : null;      // [] = haqiqatan bo'sh → null (keshlanadi)
        }
        if (cacheable) _firstSlideCache.set(key, result);
      } catch { result = null; }
      finally {
        _firstSlideActive--;
        _pumpFirstSlide();
      }
      resolve(result);
    });
    _pumpFirstSlide();
  });
  _firstSlideInflight.set(key, p);
  void p.finally(() => { if (_firstSlideInflight.get(key) === p) _firstSlideInflight.delete(key); });
  return p;
}
export function invalidateFirstSlide(clinicId: number | null | undefined, patientId: number) {
  _firstSlideCache.delete(firstSlideKey(patientId, clinicId));
}

// Bemorlar ro'yxatidagi foto kartochkasi uchun: foto-protokolning BIRINCHI SAHIFASINI render qiladi
export function PhotoProtocolFirstPage({ patientId }: { patientId: number }) {
  const [slide, setSlide] = useState<Slide | null>(null);
  const [visible, setVisible] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const clinicRef = useRef(getActiveClinicId());

  // Lazy: faqat ko'rinishga yaqin kartochka yuklanadi (nazoratsiz N ta so'rov yubormaymiz).
  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '250px' });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  // Asosiy manba — SERVERdagi canonical doc (yangi sessiya/qurilmada ham ko'rinadi). Tez bemor
  // almashishida eski javob yangi kartochkaga tushmasin (cancel). Saqlanganda yangilanadi.
  useEffect(() => {
    if (!visible) return;
    let cancel = false;
    const load = () => { void fetchFirstSlide(patientId).then((s) => { if (!cancel) setSlide(s); }); };
    load();
    const onSaved = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (Number(d.patientId) === Number(patientId) && (d.clinicId ?? null) === (clinicRef.current ?? null)) {
        invalidateFirstSlide(clinicRef.current, patientId);
        load();
      }
    };
    window.addEventListener('dentos-photo-saved', onSaved);
    return () => { cancel = true; window.removeEventListener('dentos-photo-saved', onSaved); };
  }, [patientId, visible]);

  const hasContent =
    !!slide &&
    slide.elements.some(
      (e) => (e.type === 'image' && e.src) || (((e.content || (e as any).badgeText) || '').trim().length > 0)
    );
  if (!hasContent || !slide) return <div ref={hostRef} aria-hidden style={{ height: 0 }} />;

  return (
    <div ref={hostRef} className="mb-2 -mx-5 border-y border-slate-200 dark:border-slate-800">
      {/* Kartochka — muharrir/taqdimot bilan AYNAN bir xil 960×540 renderer (scale = kenglik/960).
          Shu tufayli saqlangan slayd kompozitsiyasi (matn/rasm o'lchami, oraliq masofa) bir xil. */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
        <ScaledSlide slide={slide} bg={slide.background || '#ffffff'} />
      </div>
    </div>
  );
}

// Visual Element Renderer inside Keynote Canvas
function Visual({ el, isMasking = false }: { el: Element; isMasking?: boolean }) {
  if (el.type === 'image') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          borderRadius: el.borderRadius ? `${el.borderRadius}px` : undefined,
          border: el.borderWidth ? `${el.borderWidth}px solid ${el.borderColor || '#007aff'}` : undefined,
          boxShadow: el.shadow ? '0 10px 30px rgba(0,0,0,0.25)' : undefined
        }}
      >
        <img
          src={el.src}
          alt={el.caption || 'Foto'}
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: el.fit || 'contain',
            objectPosition: `${el.objectX ?? 50}% ${el.objectY ?? 50}%`,
            transform: `scale(${el.objectScale || 1})`,
            transformOrigin: `${el.objectX ?? 50}% ${el.objectY ?? 50}%`,
            filter: `brightness(${(el.brightness || 0) + 100}%) contrast(${el.contrast || 100}%) opacity(${
              (el.opacity ?? 100) / 100
            })`,
            transition: isMasking ? 'none' : 'transform 0.1s ease-out'
          }}
        />
      </div>
    );
  }

  if (el.type === 'note') {
    return (
      <div className={css.stickyNote} style={{ width: '100%', height: '100%' }}>
        <div className={css.stickyHeader}>
          <span>{el.noteAuthor || 'Shifokor'}</span>
          <span>{el.noteTime || 'hozir'}</span>
        </div>
        <div className={css.stickyBody}>{el.content || 'Klinik izoh...'}</div>
      </div>
    );
  }

  if (el.type === 'badge') {
    return (
      <div
        className={css.clinicalBadge}
        style={{
          fontSize: el.fontSize || 16,
          background: el.bgColor || 'rgba(0, 122, 255, 0.12)',
          color: el.color || '#007aff'
        }}
      >
        {el.badgeText || el.content || '1.1 Tish'}
      </div>
    );
  }

  return (
    <div
      style={{
        fontSize: el.fontSize || 24,
        fontFamily: el.fontFamily || 'inherit',
        fontWeight: el.bold ? 700 : 400,
        fontStyle: el.italic ? 'italic' : 'normal',
        textDecoration: `${el.underline ? 'underline ' : ''}${el.strike ? 'line-through' : ''}`.trim() || 'none',
        textAlign: el.align || 'left',
        color: el.color || '#17212b',
        backgroundColor: el.bgColor || 'transparent',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.25,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        padding: el.bgColor ? '6px 12px' : 0,
        borderRadius: el.borderRadius ? `${el.borderRadius}px` : undefined
      }}
    >
      {el.content || (el.type === 'heading' ? 'Bo‘lim sarlavhasi' : 'Matn kiriting')}
    </div>
  );
}

// ── Umumiy slayd rendereri (960×540 bazaviy koordinata tizimi) ──
// Muharrir board'i (.paper = 960×540, transform:scale) bilan AYNAN bir xil: elementlar
// % joylashuv/o'lcham, matn esa `Visual` ichida 960-baza piksel fontSize. Preview, foto
// kartochka va taqdimot SHUNI ishlatadi — shuning uchun matn/rasm o'lchami va ular orasidagi
// masofa bir xil nisbatda masshtablanadi ("muharrirda chiroyli, taqdimotda boshqacha" yo'q).
function SlideStage({ slide }: { slide: Slide }) {
  return (
    <div style={{ width: 960, height: 540, position: 'relative', overflow: 'hidden', background: slide.background || '#ffffff' }}>
      {slide.elements.map((el) => (
        <div
          key={el.id}
          style={{
            position: 'absolute',
            left: `${el.x}%`,
            top: `${el.y}%`,
            width: `${el.width}%`,
            height: `${el.height ?? (el.type === 'image' ? 40 : 15)}%`,
            overflow: 'hidden',
            transform: `rotate(${el.rotation || 0}deg)`
          }}
        >
          <Visual el={el} />
        </div>
      ))}
    </div>
  );
}

// Slaydni mavjud joyga BUTUNLIGICHA, nisbatini buzmasdan masshtablab chizadi:
// scale = min(availW/960, availH/540); markazda; ortgan yon/yuqori-past joy `bg` (taqdimotda QORA).
// Slayd koordinatalari/fontSize/hujjatning o'zi O'ZGARMAYDI — faqat CSS transform.
function ScaledSlide({ slide, bg = '#000000', rounded = false }: { slide: Slide; bg?: string; rounded?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sf, setSf] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const w = node.clientWidth, h = node.clientHeight;
      if (w > 0 && h > 0) setSf(Math.min(w / 960, h / 540));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    // Resize/fullscreen/telefon orientatsiyasi scale'ni yangilaydi.
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    document.addEventListener('fullscreenchange', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      document.removeEventListener('fullscreenchange', measure);
    };
  }, []);
  return (
    <div
      ref={ref}
      style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, overflow: 'hidden', pointerEvents: 'none' }}
    >
      {sf > 0 && (
        <div style={{ width: Math.round(960 * sf), height: Math.round(540 * sf), position: 'relative', borderRadius: rounded ? 4 : 0, overflow: 'hidden' }}>
          <div style={{ width: 960, height: 540, transform: `scale(${sf})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
            <SlideStage slide={slide} />
          </div>
        </div>
      )}
    </div>
  );
}

// Slide Thumbnail in Navigator
function Mini({ slide }: { slide: Slide }) {
  return (
    <div className={css.thumbCard}>
      <div className={css.thumbCardInner} style={{ background: slide.background || '#ffffff' }}>
        {slide.elements.map((el) => (
          <div
            key={el.id}
            style={{
              position: 'absolute',
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: `${el.width}%`,
              height: `${el.height ?? (el.type === 'image' ? 40 : 15)}%`,
              overflow: 'hidden',
              transform: `rotate(${el.rotation || 0}deg)`
            }}
          >
            <Visual el={el} />
          </div>
        ))}
      </div>
    </div>
  );
}

type LegacyBlock = Partial<Element> & { pageIndex?: number; widthPercent?: number; level?: number };
function migrateLegacy(raw: LegacyBlock[]): Slide[] {
  if (!raw.length) return [blank()];
  const pages = new Map<number, Element[]>();
  raw.forEach((block) => {
    const page = block.pageIndex ?? 0;
    const elements = pages.get(page) || [];
    const type = block.type || 'text';
    elements.push({
      ...block,
      id: block.id || uid(),
      type,
      x: block.x ?? 8,
      y: block.y ?? Math.min(80, 8 + elements.length * 22),
      width: block.width ?? block.widthPercent ?? (type === 'image' ? 42 : 84),
      height: block.height ?? (type === 'image' ? 40 : 18),
      fontSize: block.fontSize ?? (type === 'heading' ? 32 : 22)
    });
    pages.set(page, elements);
  });
  return Array.from(pages.entries())
    .sort(([a], [b]) => a - b)
    .map(([, elements]) => ({ id: uid(), elements, background: '#ffffff' }));
}

// Multi-language strings dictionary
const STUDIO_I18N = {
  uz: {
    photoProtocol: 'Foto protokol',
    newSlide: 'Yangi slayd',
    addSlide: '+ Slayd',
    slides: 'Slaydlar',
    presentation: 'Taqdimot (Slayd-shou)',
    table: 'Jadval',
    badge: 'Klinik belgi',
    note: 'Klinik izoh (Sticky Note)',
    photo: 'Klinik rasm yuklash',
    text: 'Matn',
    heading: 'Sarlavha',
    format: 'Formatlash paneli',
    undo: 'Bekor qilish (Ctrl Z)',
    redo: 'Qaytarish (Ctrl Y)',
    export: 'Eksport va yuklab olish',
    exportAll: 'Barcha slaydlar',
    exportCurrent: 'Faqat joriy slayd',
    exportPdf: 'PDF Hujjat (.pdf)',
    exportPptx: 'PowerPoint (.pptx)',
    exportDocx: 'Word Hujjat (.doc)',
    exportPng: 'Yuqori aniqlikdagi Rasm (.png)',
    saved: 'Saqlandi',
    saving: 'Saqlanmoqda…',
    notSaved: 'Saqlanmadi',
    emptySlide: 'Bo‘sh slayd',
    emptySlideDesc: 'Klinik fotosuratlarni shu yerga tashlang yoki yuqoridagi rasm tugmasi orqali yuklang.',
    cut: 'Kesish',
    copy: 'Nusxa',
    paste: 'Qo‘yish',
    delete: 'O‘chirish',
    crop: 'Kadrlash',
    autoCrop: 'Автообрезка',
    replacePhoto: 'Rasmni almashtirish...',
    hdEnhance: 'Yuqori aniqlik (HD)',
    bringForward: 'Oldingi planga',
    sendBackward: 'Orqa planga',
    style: 'Uslub',
    image: 'Rasm',
    arrange: 'Joylashuv',
    slide: 'Slayd',
    fontSize: 'Shrift o‘lchami',
    textStyle: 'Matn stili',
    align: 'Tekislash',
    textColor: 'Matn rangi',
    fitMode: 'Kadr rejimi',
    contain: 'To‘liq sig‘dirish',
    cover: 'Kadrni to‘ldirish',
    brightness: 'Yorqinlik',
    contrast: 'Kontrast',
    slideBg: 'Slayd foni',
    templates: 'Stomatologik Shablonlar',
    tmpl2: '2 Rasm: Oldin / Keyin (Before/After)',
    tmpl4: '4 Rasm: Orto 2x2 Setka',
    tmpl6: '6 Rasm: Smile Design 3x2',
    tmpl9: '9 Rasm: To‘liq Foto Protokol 3x3',
    cornerRadius: 'Burchaklar silliqligi',
    border: 'Chegara chizig‘i',
    shadow: 'Soya effekti',
    layerOrder: 'Qatlamlar tartibi',
    rotate: '90° ga burish',
    dimensions: 'O‘lcham va Joylashuv',
    width: 'Kenglik (%)',
    height: 'Balandlik (%)',
    cancel: 'Bekor',
    done: 'Tayyor',
    prev: 'Oldingi',
    next: 'Keyingi',
    exitSlideshow: 'Taqdimotdan chiqish (Esc)'
  },
  ru: {
    photoProtocol: 'Фотопротокол',
    newSlide: 'Новый слайд',
    addSlide: '+ Слайд',
    slides: 'Слайды',
    presentation: 'Презентация (Слайд-шоу)',
    table: 'Таблица',
    badge: 'Клиническая метка',
    note: 'Заметка врача (Sticky Note)',
    photo: 'Загрузить фото',
    text: 'Текст',
    heading: 'Заголовок',
    format: 'Панель форматирования',
    undo: 'Отменить (Ctrl Z)',
    redo: 'Повторить (Ctrl Y)',
    export: 'Экспорт и скачивание',
    exportAll: 'Все слайды',
    exportCurrent: 'Только текущий',
    exportPdf: 'PDF Документ (.pdf)',
    exportPptx: 'PowerPoint (.pptx)',
    exportDocx: 'Word Документ (.doc)',
    exportPng: 'Высокое разрешение (.png)',
    saved: 'Сохранено',
    saving: 'Сохранение…',
    notSaved: 'Не сохранено',
    emptySlide: 'Пустой слайд',
    emptySlideDesc: 'Перетащите клинические фотографии сюда или нажмите кнопку фото вверху.',
    cut: 'Вырезать',
    copy: 'Скопировать',
    paste: 'Вставить',
    delete: 'Удалить',
    crop: 'Обрезка',
    autoCrop: 'Автообрезка',
    replacePhoto: 'Заменить изображение...',
    hdEnhance: 'Сверхвысокое разрешение (HD)',
    bringForward: 'На передний план',
    sendBackward: 'На задний план',
    style: 'Стиль',
    image: 'Изображение',
    arrange: 'Упорядочить',
    slide: 'Слайд',
    fontSize: 'Размер шрифта',
    textStyle: 'Начертание',
    align: 'Выравнивание',
    textColor: 'Цвет текста',
    fitMode: 'Режим кадра',
    contain: 'Вписать',
    cover: 'Заполнить',
    brightness: 'Яркость',
    contrast: 'Контраст',
    slideBg: 'Фон слайда',
    templates: 'Стоматологические шаблоны',
    tmpl2: '2 Фото: До / После (Before/After)',
    tmpl4: '4 Фото: Орто 2x2',
    tmpl6: '6 Фото: Smile Design 3x2',
    tmpl9: '9 Фото: Полный фотопротокол 3x3',
    cornerRadius: 'Скругление углов',
    border: 'Граница',
    shadow: 'Тень',
    layerOrder: 'Порядок слоев',
    rotate: 'Повернуть на 90°',
    dimensions: 'Размер и положение',
    width: 'Ширина (%)',
    height: 'Высота (%)',
    cancel: 'Отмена',
    done: 'Готово',
    prev: 'Назад',
    next: 'Вперед',
    exitSlideshow: 'Выйти (Esc)'
  },
  en: {
    photoProtocol: 'Photo Protocol',
    newSlide: 'New Slide',
    addSlide: '+ Slide',
    slides: 'Slides',
    presentation: 'Presentation (Slideshow)',
    table: 'Table',
    badge: 'Clinical Badge',
    note: 'Clinical Note (Sticky Note)',
    photo: 'Upload Photo',
    text: 'Text',
    heading: 'Heading',
    format: 'Format Inspector',
    undo: 'Undo (Ctrl Z)',
    redo: 'Redo (Ctrl Y)',
    export: 'Export & Download',
    exportAll: 'All slides',
    exportCurrent: 'Current slide only',
    exportPdf: 'PDF Document (.pdf)',
    exportPptx: 'PowerPoint (.pptx)',
    exportDocx: 'Word Document (.doc)',
    exportPng: 'High-Res Image (.png)',
    saved: 'Saved',
    saving: 'Saving…',
    notSaved: 'Not saved',
    emptySlide: 'Empty Slide',
    emptySlideDesc: 'Drag clinical photos here or click upload photo above.',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    delete: 'Delete',
    crop: 'Crop',
    autoCrop: 'Auto Crop',
    replacePhoto: 'Replace Photo...',
    hdEnhance: 'HD Enhance',
    bringForward: 'Bring to Front',
    sendBackward: 'Send Backward',
    style: 'Style',
    image: 'Image',
    arrange: 'Arrange',
    slide: 'Slide',
    fontSize: 'Font Size',
    textStyle: 'Text Style',
    align: 'Alignment',
    textColor: 'Text Color',
    fitMode: 'Frame Mode',
    contain: 'Contain',
    cover: 'Fill Frame',
    brightness: 'Brightness',
    contrast: 'Contrast',
    slideBg: 'Slide Background',
    templates: 'Dental Layout Templates',
    tmpl2: '2 Photos: Before / After',
    tmpl4: '4 Photos: Ortho 2x2 Grid',
    tmpl6: '6 Photos: Smile Design 3x2',
    tmpl9: '9 Photos: Full Photo Protocol 3x3',
    cornerRadius: 'Corner Radius',
    border: 'Border',
    shadow: 'Shadow',
    layerOrder: 'Layer Order',
    rotate: 'Rotate 90°',
    dimensions: 'Size & Position',
    width: 'Width (%)',
    height: 'Height (%)',
    cancel: 'Cancel',
    done: 'Done',
    prev: 'Previous',
    next: 'Next',
    exitSlideshow: 'Exit Presentation (Esc)'
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// Main Apple Keynote Photo Protocol Studio Component
// ═════════════════════════════════════════════════════════════════════════════
export default function PhotoProtocolStudio({
  patientId,
  patientName
}: {
  patientId: number;
  patientName: string;
}) {
  const { language } = useI18n();
  const { isDark } = useTheme();
  const txt = STUDIO_I18N[(language as 'uz' | 'ru' | 'en') || 'uz'] || STUDIO_I18N.uz;

  const [slides, setSlides] = useState<Slide[]>([]);
  const doc = useRef<Slide[]>([]);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  // Apple Keynote Inspector, Masks & Context Menus
  const [formatOpen, setFormatOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'style' | 'content' | 'arrange'>('content');
  const [isMasking, setIsMasking] = useState(false);
  const [maskTemp, setMaskTemp] = useState<Element | null>(null);

  // Left Navigator & Slideshow
  const [navigatorOpen, setNavigatorOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [slideshowMode, setSlideshowMode] = useState(false);

  // Context Menu state
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [clipboard, setClipboard] = useState<Element | null>(null);

  // Text Inline Editing
  const [editing, setEditing] = useState<string | null>(null);

  // Measurement Guide Badge & Alignment Guides
  const [measureInfo, setMeasureInfo] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [guides, setGuides] = useState({ x: false, y: false });

  // Persistence & Auto-Save
  const [status, setStatus] = useState<'loading' | 'saved' | 'saving' | 'error'>('loading');
  const [error, setError] = useState('');
  const [readFailed, setReadFailed] = useState(false);
  const [scale, setScale] = useState(0.65);
  const [zoom] = useState(100);

  // History (Undo / Redo)
  const [history, setHistory] = useState<Slide[][]>([]);
  const [future, setFuture] = useState<Slide[][]>([]);

  // Media upload & Export
  const [uploading, setUploading] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportRange, setExportRange] = useState<'all' | 'current'>('all');
  const [exporting, setExporting] = useState(false);

  // DOM Refs
  const board = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceFileInput = useRef<HTMLInputElement>(null);
  const live = useRef(true);
  const saveVersion = useRef(0);
  const lastSaveDoc = useRef<Slide[] | null>(null);
  // Saqlashni COALESCING qilish: in-flight POST tugaguncha kelgan har bir oraliq holat
  // (matn/rang/brightness slider harakatlari) alohida to'liq-hujjat POST'i YARATMASIN —
  // faqat ENG YANGI holat yuboriladi. pendingSave = keyingi yuboriladigan holat.
  const pendingSave = useRef<Slide[] | null>(null);
  const saving = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Klinikani MOUNT paytida qotiramiz. Unmount-flush yoki kech kelgan POST klinika
  // almashishi/logoutdan KEYIN ishga tushsa ham — AYNAN shu bemorning klinikasiga yoziladi
  // (yangi klinika nomidan EMAS). Komponent patient+clinic kaliti bilan remount bo'ladi.
  const studioClinicId = useRef(getActiveClinicId());
  const dragSlide = useRef<number | null>(null);
  const lastTap = useRef({ id: '', time: 0 });

  const key = `${getActiveClinicId() ?? 'none'}:${patientId}`;
  const loadCancelled = useRef(false);

  // 1. Load Document from Backend / IndexedDB
  const loadDoc = useCallback(async () => {
    loadCancelled.current = false;
    setStatus('loading');
    setError('');
    setReadFailed(false);
    try {
      const backendDoc = await clinicApi.fetchPatientPhotoDoc(patientId);
      if (loadCancelled.current) return;

      if (backendDoc === null && !isDemoClinic()) {
        setReadFailed(true);
        setStatus('error');
        setError('Foto hujjatini serverdan o‘qib bo‘lmadi. Internetni tekshirib, "Qayta yuklash"ni bosing.');
        return;
      }

      if (Array.isArray(backendDoc) && backendDoc.length && (backendDoc[0] as any).elements) {
        doc.current = backendDoc as Slide[];
        setSlides(backendDoc as Slide[]);
        setStatus('saved');
        return;
      }

      if (!isDemoClinic()) {
        const initial = backendDoc?.length ? migrateLegacy(backendDoc) : [blank()];
        doc.current = initial;
        setSlides(initial);
        setStatus('saved');
        return;
      }

      // Demo fallback: IndexedDB / localStorage
      const saved = await storage('readonly', key).catch(() => undefined);
      if (loadCancelled.current) return;
      const legacy = clinicApi.getPatientPhotoDoc(patientId);
      const initial = (saved?.length ? saved : legacy?.[0]?.elements ? legacy : migrateLegacy(legacy)) as Slide[];
      doc.current = initial;
      setSlides(initial);
      setStatus('saved');
    } catch {
      if (!loadCancelled.current) {
        setReadFailed(true);
        setStatus('error');
        setError('Foto hujjatini o‘qib bo‘lmadi. "Qayta yuklash"ni bosing.');
      }
    }
  }, [key, patientId]);

  useEffect(() => {
    live.current = true;
    loadCancelled.current = false;
    void loadDoc();
    return () => {
      loadCancelled.current = true;
      live.current = false;
    };
  }, [loadDoc]);

  // Responsive Canvas Scaling to Viewport Width
  useEffect(() => {
    if (!viewport.current) return;
    const resize = new ResizeObserver(([entry]) => {
      const availableW = entry.contentRect.width - (navigatorOpen ? 40 : 40);
      const computedScale = Math.min(1.2, Math.max(0.35, availableW / 990));
      setScale(computedScale);
    });
    resize.observe(viewport.current);
    return () => resize.disconnect();
  }, [navigatorOpen]);

  // Auto-Save Handler — debounce + coalescing.
  // In-flight POST tugaguncha kelgan oraliq holatlar pendingSave'ga yig'iladi; POST
  // tugagach faqat ENG OXIRGI holat yuboriladi. Shuning uchun slider harakatlari
  // o'nlab to'liq-hujjat (base64 bilan) POST'iga aylanmaydi. 'saved' faqat haqiqatan
  // oxirgi holat serverga tushgach qo'yiladi — yolg'on muvaffaqiyat yo'q.
  const runPendingSaves = async () => {
    if (saving.current) return;        // allaqachon ishlayapti — tugagach o'zi davom etadi
    saving.current = true;
    try {
      while (pendingSave.current) {
        const next = pendingSave.current;
        pendingSave.current = null;    // shu holatni oldik; keyingi save yangi pending qo'yadi
        const sentVersion = saveVersion.current;
        try {
          const { ok, doc: canonical } = await clinicApi.savePatientPhotoDocBackend(patientId, next, studioClinicId.current ?? undefined);
          if (!ok) throw new Error('Server saqlamadi');
          // Server base64 rasmlarni media URL'ga aylantirib qaytardi — joriy hujjatga
          // (va navbatdagi pending'ga) singdiramiz, YANGI tahrirlarni yo'qotmasdan. Shunda
          // keyingi saqlashlarda katta base64 qayta yuborilmaydi.
          if (canonical) {
            const rewrites = collectMediaRewrites(next, canonical);
            if (rewrites.size) {
              doc.current = applyMediaRewrites(doc.current, rewrites);
              if (pendingSave.current) pendingSave.current = applyMediaRewrites(pendingSave.current, rewrites);
              if (live.current) setSlides(doc.current);
            }
          }
          // Foto kartochka (bemorlar ro'yxati) preview keshini AYNAN shu klinika+bemor uchun
          // tozalab, yangilanishni xabar qilamiz — boshqa bemor/klinikaga aralashmaydi.
          invalidateFirstSlide(studioClinicId.current, patientId);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('dentos-photo-saved', { detail: { clinicId: studioClinicId.current, patientId } }));
          }
        } catch {
          // Xatoni ko'rsatamiz va TO'XTAYMIZ (cheksiz qayta-urinish yo'q). Keyingi tahrir
          // yoki 'Qayta saqlash' tugmasi yana yuboradi. Oraliq pending'ni tashlaymiz.
          pendingSave.current = null;
          if (live.current) {
            setStatus('error');
            setError('Serverga saqlanmadi. O‘zgarishlarni yo‘qotmaslik uchun hujjatni yuklab oling.');
          }
          return;
        }
        // Shu POST ketayotganda yangi tahrir kelgan bo'lsa (saveVersion oshgan) — loop
        // davom etadi va eng yangi holatni yuboradi.
        if (sentVersion === saveVersion.current && live.current) setStatus('saved');
      }
    } finally { saving.current = false; }
  };
  const save = (next: Slide[]) => {
    if (isDemoClinic()) {
      setStatus('saved');
      return;
    }
    if (readFailed) return;
    lastSaveDoc.current = next;
    saveVersion.current++;
    pendingSave.current = next;        // eng yangi holat
    setStatus('saving');
    setError('');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Debounce: tez ketma-ket tahrirlarni (slider) bitta POST'ga yig'amiz.
    saveTimer.current = setTimeout(() => { saveTimer.current = null; void runPendingSaves(); }, 400);
  };
  // Komponent yopilganda (bemor/sahifa almashish) kutilayotgan saqlashni YO'QOTMAYMIZ:
  // debounce taymerini darhol ishga tushiramiz. POST clinicApi orqali tugaydi (live
  // tekshiruvi faqat setState'ni to'xtatadi, so'rovni emas).
  const flushSaveNow = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (pendingSave.current) void runPendingSaves();
  };
  useEffect(() => () => flushSaveNow(), []); // unmount'da flush

  const commit = (next: Slide[], before = doc.current) => {
    if (status === 'loading' || readFailed) return;
    setHistory((h) => [...h.slice(-29), before]);
    setFuture([]);
    doc.current = next;
    setSlides(next);
    save(next);
  };

  const currentSlide = slides[active] || slides[0];
  const selectedEl = currentSlide?.elements.find((e) => e.id === selected) || null;

  const updateSelected = (patch: Partial<Element>) => {
    if (!selected) return;
    commit(
      doc.current.map((s, i) =>
        i === active ? { ...s, elements: s.elements.map((e) => (e.id === selected ? { ...e, ...patch } : e)) } : s
      )
    );
  };

  const removeSelected = () => {
    if (!selected) return;
    commit(
      doc.current.map((s, i) => (i === active ? { ...s, elements: s.elements.filter((e) => e.id !== selected) } : s))
    );
    setSelected(null);
    setContextMenuOpen(false);
  };

  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setFuture((f) => [doc.current, ...f]);
    setHistory((h) => h.slice(0, -1));
    doc.current = prev;
    setSlides(prev);
    setActive((a) => Math.min(a, prev.length - 1));
    setSelected(null);
    save(prev);
  };

  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setHistory((h) => [...h, doc.current]);
    setFuture((f) => f.slice(1));
    doc.current = next;
    setSlides(next);
    setActive((a) => Math.min(a, next.length - 1));
    setSelected(null);
    save(next);
  };

  // Add Slide Handler
  const addNewSlide = () => {
    const newSlide = blank();
    const curr = [...doc.current];
    const insertIdx = active >= 0 && active < curr.length ? active + 1 : curr.length;
    curr.splice(insertIdx, 0, newSlide);
    commit(curr);
    setActive(insertIdx);
    setSelected(null);
  };

  // 2. Element Insertion Helpers (Text, Heading, Note, Photo)
  const addText = (heading = false) => {
    const e: Element = {
      id: uid(),
      type: heading ? 'heading' : 'text',
      x: 15,
      y: heading ? 12 : 35,
      width: heading ? 70 : 45,
      height: heading ? 12 : 18,
      content: heading ? 'Klinik Tashxis' : 'Matn kiriting...',
      fontSize: heading ? 36 : 24,
      bold: heading,
      color: '#17212b',
      align: heading ? 'center' : 'left'
    };
    commit(doc.current.map((s, i) => (i === active ? { ...s, elements: [...s.elements, e] } : s)));
    setSelected(e.id);
  };

  const addStickyNote = () => {
    const note: Element = {
      id: uid(),
      type: 'note',
      x: 20,
      y: 25,
      width: 28,
      height: 25,
      content: 'Bemor shikoyati va klinik kuzatuv...',
      noteAuthor: 'Shifokor',
      noteTime: 'hozir'
    };
    commit(doc.current.map((s, i) => (i === active ? { ...s, elements: [...s.elements, note] } : s)));
    setSelected(note.id);
  };

  const addBadge = (text = '1.1 Tish') => {
    const badge: Element = {
      id: uid(),
      type: 'badge',
      x: 20,
      y: 20,
      width: 18,
      height: 8,
      badgeText: text,
      color: '#007aff',
      bgColor: 'rgba(0, 122, 255, 0.12)',
      fontSize: 16
    };
    commit(doc.current.map((s, i) => (i === active ? { ...s, elements: [...s.elements, badge] } : s)));
    setSelected(badge.id);
  };

  // Dental Table Comparison Helper
  const addDentalTable = () => {
    const e: Element = {
      id: uid(),
      type: 'text',
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      content: 'Tish raqami\tHolati\tReja\n1.1\tKaries\tKompozit plomba\n2.1\tPlomba tushgan\tRestavratsiya',
      fontSize: 20,
      color: '#17212b'
    };
    commit(doc.current.map((s, i) => (i === active ? { ...s, elements: [...s.elements, e] } : s)));
    setSelected(e.id);
  };

  // Image Upload Handlers
  // Bitta rasmni tekshiradi + dekodlaydi + 1920px gacha kichiklaydi. uploadPhotos VA
  // replaceSelectedPhoto IKKISI ham shuni ishlatadi — tekshiruvlar bir xil bo'lsin (#4):
  //  - format/hajm tekshiruvi (buzilgan rasm uchun aniq xabar);
  //  - piksel chegarasi (juda katta rasm brauzerni qotirmasin);
  //  - xatoda ham bitmap.close() (resurs bo'shaydi).
  const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
  const MAX_IMAGE_PIXELS = 40_000_000; // ~40 MP
  async function decodeImageElement(f: File): Promise<{ src: string; name: string }> {
    if (!/^image\/(jpeg|png|webp)$/i.test(f.type)) {
      throw new Error(`"${f.name || 'fayl'}" — faqat JPG, PNG yoki WebP formatidagi rasm yuklang.`);
    }
    if (f.size > MAX_IMAGE_BYTES) {
      throw new Error(`"${f.name}" 25 MB dan katta — kichikroq rasm yuklang.`);
    }
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(f);
    } catch {
      throw new Error(`"${f.name}" ochilmadi — rasm buzilgan yoki qo‘llab-quvvatlanmaydigan format.`);
    }
    try {
      if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
        throw new Error(`"${f.name}" o‘lchami juda katta (${bitmap.width}×${bitmap.height} px). Kichikroq rasm yuklang.`);
      }
      const canvas = document.createElement('canvas');
      const ratio = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * ratio);
      canvas.height = Math.round(bitmap.height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Brauzer canvas konteksti yaratolmadi.');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return { src: canvas.toDataURL('image/jpeg', 0.92), name: f.name };
    } finally {
      bitmap.close(); // xatoda ham resurs bo'shaydi
    }
  }
  // Butun hujjat BITTA JSON POST bo'lib ketadi; backend DATA_UPLOAD_MAX_MEMORY_SIZE = 12 MiB.
  // Shu chegaradan oshmasin — aks holda POST 413/"saqlanmadi" bo'lardi. Oldindan tekshirib,
  // aniq sabab + qayta urinish yo'lini ko'rsatamiz (limitni shunchaki oshirmaymiz).
  const DOC_JSON_SOFT_LIMIT = 11 * 1024 * 1024;

  async function uploadPhotos(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    setError('');
    try {
      const arr = Array.from(files);
      if (arr.length > 30) {
        throw new Error('Bir martada 30 tadan ortiq rasm yuklab bo‘lmaydi. Kichikroq to‘plam tanlang.');
      }
      // KETMA-KET dekodlash: bir vaqtda faqat bitta bitmap xotirada bo'ladi (cheklanmagan
      // Promise.all o'rniga — ko'p katta rasm xotira/asosiy oqimni band qilmasin).
      const pictures: Array<{ id: string; type: 'image'; src: string; caption: string; x: number; y: number; width: number; height: number; fit: 'contain'; objectScale: number; objectX: number; objectY: number }> = [];
      for (const f of arr) {
        const { src, name } = await decodeImageElement(f);
        pictures.push({ id: uid(), type: 'image', src, caption: name, x: 10, y: 15, width: 40, height: 48, fit: 'contain', objectScale: 1, objectX: 50, objectY: 50 });
      }

      if (!pictures.length) return;
      if (!doc.current.length) doc.current = [blank()];
      const next: Slide[] = doc.current.map((s) => ({ ...s, elements: [...s.elements] }));
      const idx = Math.max(0, Math.min(active, next.length - 1));
      const existing = next[idx].elements.filter((e) => e.type === 'image').length;

      pictures.forEach((pic, i) => {
        const n = existing + i;
        next[idx].elements.push({
          ...pic,
          x: 6 + (n % 3) * 31,
          y: 16 + Math.floor(n / 3) * 26,
          width: 29,
          height: 25
        });
      });

      if (JSON.stringify(next).length > DOC_JSON_SOFT_LIMIT) {
        throw new Error('Rasmlar umumiy hajmi serverda saqlash chegarasidan oshib ketdi. Kamroq yoki kichikroq rasm yuklang.');
      }

      commit(next);
      setActive(idx);
      setSelected(pictures[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rasm yuklanmadi. Qayta urinib ko‘ring.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  // Replace Single Photo Handler — uploadPhotos bilan BIR XIL tekshiruvlar (#4).
  async function replaceSelectedPhoto(files: FileList | null) {
    if (!files || !files[0] || !selected) return;
    try {
      const { src, name } = await decodeImageElement(files[0]);
      // Almashtirilgan rasm bilan hujjat hajmi chegaradan oshmasligini tekshiramiz.
      const probe: Slide[] = doc.current.map((s, i) =>
        i === active ? { ...s, elements: s.elements.map((el) => (el.id === selected ? { ...el, src } : el)) } : s);
      if (JSON.stringify(probe).length > DOC_JSON_SOFT_LIMIT) {
        throw new Error('Rasm juda katta — hujjat serverda saqlash chegarasidan oshadi. Kichikroq rasm tanlang.');
      }
      updateSelected({ src, caption: name, objectScale: 1, objectX: 50, objectY: 50 });
      setContextMenuOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rasmni almashtirishda xatolik yuz berdi.');
    } finally {
      if (replaceFileInput.current) replaceFileInput.current.value = '';
    }
  }

  // Slide Navigator reordering
  const moveSlide = (from: number, to: number) => {
    if (to < 0 || to >= doc.current.length || from === to) return;
    const arr = [...doc.current];
    const [s] = arr.splice(from, 1);
    arr.splice(to, 0, s);
    commit(arr);
    setActive(to);
    setSelected(null);
  };

  // Clipboard operations (Cut, Copy, Paste)
  const copyObject = (cut = false) => {
    if (!selectedEl) return;
    setClipboard({ ...selectedEl });
    if (cut) removeSelected();
    setContextMenuOpen(false);
  };

  const pasteObject = () => {
    if (!clipboard || !currentSlide) return;
    const item: Element = {
      ...clipboard,
      id: uid(),
      x: bound(clipboard.x + 3, 0, 100 - clipboard.width),
      y: bound(clipboard.y + 3, 0, 100 - (clipboard.height ?? 15))
    };
    commit(doc.current.map((s, i) => (i === active ? { ...s, elements: [...s.elements, item] } : s)));
    setSelected(item.id);
    setContextMenuOpen(false);
  };

  // ═════════════════════════════════════════════════════════════════════════
  // DOUBLE CLICK / DOUBLE TAP IMAGE: KEYNOTE MASK / CROP MODE ("Автообрезка")
  // ═════════════════════════════════════════════════════════════════════════
  const enterMaskMode = (item: Element) => {
    setSelected(item.id);
    setFormatOpen(false);
    setContextMenuOpen(false);
    setMaskTemp({
      ...item,
      fit: 'cover',
      objectScale: item.objectScale || 1,
      objectX: item.objectX ?? 50,
      objectY: item.objectY ?? 50
    });
    setIsMasking(true);
  };

  const finishMaskMode = (apply = true) => {
    if (apply && maskTemp && selected) {
      updateSelected({
        fit: 'cover',
        objectScale: maskTemp.objectScale || 1,
        objectX: maskTemp.objectX ?? 50,
        objectY: maskTemp.objectY ?? 50
      });
    }
    setIsMasking(false);
    setMaskTemp(null);
  };

  const resetMask = () => {
    if (maskTemp) {
      setMaskTemp({
        ...maskTemp,
        fit: 'contain',
        objectScale: 1,
        objectX: 50,
        objectY: 50
      });
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // POINTER GESTURES: Drag & Proportional Corner Resize
  // ═════════════════════════════════════════════════════════════════════════
  function handlePointerDown(e: React.PointerEvent, id: string, corner?: string) {
    if (status === 'loading' || readFailed || !doc.current[active]) return;
    if (e.button !== 0 || (e.target as HTMLElement).closest('textarea,input')) return;

    e.preventDefault();
    e.stopPropagation();

    // Double tap / Double click detection
    const now = Date.now();
    const isDoubleTap = lastTap.current.id === id && now - lastTap.current.time < 350;
    lastTap.current = { id, time: now };

    const initialEl = doc.current[active].elements.find((x) => x.id === id);
    if (!initialEl || !board.current) return;

    if (isDoubleTap) {
      if (initialEl.type === 'image') {
        enterMaskMode(initialEl);
        return;
      } else {
        setSelected(id);
        setEditing(id);
        return;
      }
    }

    setSelected(id);
    setContextMenuOpen(false);

    const rect = board.current.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    const initX = initialEl.x;
    const initY = initialEl.y;
    const initW = initialEl.width;
    const initH = initialEl.height ?? (initialEl.type === 'image' ? 40 : 15);
    const initFontSize = initialEl.fontSize || 24;
    const aspectRatio = initW / initH;

    const node = e.currentTarget as HTMLElement;
    node.setPointerCapture(e.pointerId);

    let hasMoved = false;

    // Mask mode panning
    if (isMasking && maskTemp && !corner) {
      const startX = maskTemp.objectX ?? 50;
      const startY = maskTemp.objectY ?? 50;

      const maskMove = (ev: PointerEvent) => {
        const dx = ((ev.clientX - sx) / rect.width) * 150;
        const dy = ((ev.clientY - sy) / rect.height) * 150;
        setMaskTemp((prev) =>
          prev ? { ...prev, objectX: bound(startX - dx, 0, 100), objectY: bound(startY - dy, 0, 100) } : null
        );
      };

      const maskUp = () => {
        node.removeEventListener('pointermove', maskMove);
        node.removeEventListener('pointerup', maskUp);
        if (node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);
      };

      node.addEventListener('pointermove', maskMove);
      node.addEventListener('pointerup', maskUp);
      return;
    }

    // Normal element move / resize
    const beforeSlides = doc.current;
    const moveHandler = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3 && !hasMoved) return;
      hasMoved = true;

      const dx = ((ev.clientX - sx) / rect.width) * 100;
      const dy = ((ev.clientY - sy) / rect.height) * 100;

      let newX = initX;
      let newY = initY;
      let newW = initW;
      let newH = initH;
      let newFontSize = initFontSize;
      let snapX = false;
      let snapY = false;

      if (corner) {
        // Corner dragging with smooth proportional aspect-ratio scaling
        if (corner === 'se') {
          // Bottom-Right corner: Anchor is Top-Left (initX, initY)
          const delta = (dx + dy * aspectRatio) / 2;
          const scale = Math.max(0.08, (initW + delta) / initW);
          newW = bound(initW * scale, 5, 100 - initX);
          newH = bound(initH * scale, 5, 100 - initY);
          newX = initX;
          newY = initY;
          if (initialEl.type !== 'image') {
            newFontSize = Math.round(bound(initFontSize * scale, 12, 120));
          }
        } else if (corner === 'ne') {
          // Top-Right corner: Anchor is Bottom-Left (initX, initY + initH)
          const delta = (dx - dy * aspectRatio) / 2;
          const scale = Math.max(0.08, (initW + delta) / initW);
          newW = bound(initW * scale, 5, 100 - initX);
          newH = bound(initH * scale, 5, initY + initH);
          newX = initX;
          newY = initY + initH - newH;
          if (initialEl.type !== 'image') {
            newFontSize = Math.round(bound(initFontSize * scale, 12, 120));
          }
        } else if (corner === 'sw') {
          // Bottom-Left corner: Anchor is Top-Right (initX + initW, initY)
          const delta = (-dx + dy * aspectRatio) / 2;
          const scale = Math.max(0.08, (initW + delta) / initW);
          newW = bound(initW * scale, 5, initX + initW);
          newH = bound(initH * scale, 5, 100 - initY);
          newX = initX + initW - newW;
          newY = initY;
          if (initialEl.type !== 'image') {
            newFontSize = Math.round(bound(initFontSize * scale, 12, 120));
          }
        } else if (corner === 'nw') {
          // Top-Left corner: Anchor is Bottom-Right (initX + initW, initY + initH)
          const delta = (-dx - dy * aspectRatio) / 2;
          const scale = Math.max(0.08, (initW + delta) / initW);
          newW = bound(initW * scale, 5, initX + initW);
          newH = bound(initH * scale, 5, initY + initH);
          newX = initX + initW - newW;
          newY = initY + initH - newH;
          if (initialEl.type !== 'image') {
            newFontSize = Math.round(bound(initFontSize * scale, 12, 120));
          }
        } else {
          // Edge handles (e, w, s, n) for direct width/height stretch
          if (corner === 'e') {
            newW = bound(initW + dx, 4, 100 - initX);
            newX = initX;
          } else if (corner === 'w') {
            newX = bound(initX + dx, 0, initX + initW - 4);
            newW = initX + initW - newX;
          } else if (corner === 's') {
            newH = bound(initH + dy, 4, 100 - initY);
            newY = initY;
          } else if (corner === 'n') {
            newY = bound(initY + dy, 0, initY + initH - 4);
            newH = initY + initH - newY;
          }
        }
      } else {
        // Element moving (dragging whole box)
        newX = bound(initX + dx, 0, 100 - newW);
        newY = bound(initY + dy, 0, 100 - newH);

        // Center guide snapping
        if (Math.abs(newX + newW / 2 - 50) < 1.2) {
          newX = 50 - newW / 2;
          snapX = true;
        }
        if (Math.abs(newY + newH / 2 - 50) < 1.2) {
          newY = 50 - newH / 2;
          snapY = true;
        }
      }

      setGuides({ x: snapX, y: snapY });
      setMeasureInfo({
        x: newX,
        y: newY,
        w: Math.round(newW * 9.6),
        h: Math.round(newH * 5.4)
      });

      const next = beforeSlides.map((s, idx) =>
        idx === active
          ? {
              ...s,
              elements: s.elements.map((a) =>
                a.id === id ? { ...a, x: newX, y: newY, width: newW, height: newH, fontSize: newFontSize } : a
              )
            }
          : s
      );
      doc.current = next;
      setSlides(next);
    };

    const upHandler = () => {
      node.removeEventListener('pointermove', moveHandler);
      node.removeEventListener('pointerup', upHandler);
      node.removeEventListener('pointercancel', upHandler);
      if (node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);

      setGuides({ x: false, y: false });
      setMeasureInfo(null);

      if (hasMoved) {
        commit(doc.current, beforeSlides);
      }
    };

    node.addEventListener('pointermove', moveHandler);
    node.addEventListener('pointerup', upHandler);
    node.addEventListener('pointercancel', upHandler);
  }

  // Export Document in PDF / PPTX / Word / PNG
  async function doExport(format: ExportFormat) {
    setExportOpen(false);
    const list = exportRange === 'current' ? [slides[active]].filter(Boolean) : slides;
    if (!list.length) return;
    setExporting(true);
    setError('');
    try {
      const { exportSlides } = await import('./PhotoProtocolExport');
      await exportSlides(list, format, patientName);
    } catch (e) {
      setError('Yuklab olishda xatolik: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setExporting(false);
    }
  }

  // Dental Layout Presets (1-Click Grid Alignment)
  function applyLayoutPreset(preset: '1-photo' | '2-photos' | '4-grid' | '6-grid' | '9-protocol') {
    if (!currentSlide) return;
    const photos = currentSlide.elements.filter((e) => e.type === 'image');
    if (!photos.length) return;

    let cols = 2;
    if (preset === '1-photo') cols = 1;
    else if (preset === '4-grid') cols = 2;
    else if (preset === '6-grid' || preset === '9-protocol') cols = 3;

    const rows = Math.ceil(photos.length / cols);
    const gap = 3;
    const w = (88 - gap * (cols - 1)) / cols;
    const h = (68 - gap * (rows - 1)) / rows;

    let idx = 0;
    const nextElements = currentSlide.elements.map((el) => {
      if (el.type !== 'image') return el;
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      idx++;
      return {
        ...el,
        x: 6 + c * (w + gap),
        y: 18 + r * (h + gap),
        width: w,
        height: h,
        rotation: 0,
        fit: 'contain' as const,
        objectScale: 1,
        objectX: 50,
        objectY: 50
      };
    });

    commit(doc.current.map((s, i) => (i === active ? { ...s, elements: nextElements } : s)));
    setFormatOpen(false);
  }

  // Keyboard navigation for presentation mode
  useEffect(() => {
    if (!slideshowMode) return;
    const handleSlideshowKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        setActive((a) => Math.min(slides.length - 1, a + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSlideshowMode(false);
      }
    };
    window.addEventListener('keydown', handleSlideshowKey);
    return () => window.removeEventListener('keydown', handleSlideshowKey);
  }, [slideshowMode, slides.length]);

  const sf = Math.max(0.2, scale) * (zoom / 100);

  // Requirement 1: Calculate whether element is near bottom so context menu is placed directly beneath/above it
  const isNearBottom = selectedEl ? selectedEl.y > 45 : false;
  const isNearTop = selectedEl ? selectedEl.y < 14 : false;

  return (
    <section
      className={`${css.keynoteStudio} ${isDark ? '' : css.lightMode} ${expanded ? css.expanded : ''}`}
      aria-label={txt.photoProtocol}
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest('input,textarea,select')) return;
        if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'v'].includes(e.key.toLowerCase()) && !isMasking) {
          e.preventDefault();
          if (e.key.toLowerCase() === 'v') pasteObject();
          else copyObject(e.key.toLowerCase() === 'x');
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          removeSelected();
          return;
        }
        if (e.key === 'Escape') {
          if (isMasking) finishMaskMode(false);
          setSelected(null);
          setFormatOpen(false);
          setContextMenuOpen(false);
          setEditing(null);
          return;
        }
        if (selectedEl && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          e.preventDefault();
          const step = e.shiftKey ? 1 : 0.2;
          updateSelected({
            x: bound(
              selectedEl.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0),
              0,
              100 - selectedEl.width
            ),
            y: bound(
              selectedEl.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0),
              0,
              100 - (selectedEl.height ?? 15)
            )
          });
        }
      }}
    >
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 1. TOP NAVIGATION BAR (Apple iPad Keynote Toolbar)                 */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <header className={css.topBar}>
        {/* Left: Sidebar Toggle, Title Pill & Save Indicator */}
        <div className={css.leftGroup}>
          <button
            className={`${css.iconBtn} ${navigatorOpen ? css.active : ''}`}
            onClick={() => setNavigatorOpen((v) => !v)}
            title={txt.slides}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>

          <button className={css.titlePill} onClick={() => setFormatOpen(true)} title={txt.format}>
            <span>{patientName ? `${txt.photoProtocol}: ${patientName}` : txt.photoProtocol}</span>
            <ChevronDown size={14} className="opacity-70" />
          </button>

          <div className={css.saveIndicator}>
            {status === 'saved' ? (
              <Check size={13} className="text-emerald-400" />
            ) : status === 'saving' ? (
              <RefreshCw size={12} className="animate-spin text-amber-400" />
            ) : status === 'error' ? (
              <AlertCircle size={13} className="text-rose-400" />
            ) : null}
            <span>
              {status === 'saved'
                ? isDemoClinic()
                  ? 'Demo'
                  : txt.saved
                : status === 'saving'
                ? txt.saving
                : status === 'loading'
                ? '...'
                : txt.notSaved}
            </span>
          </div>
        </div>

        {/* Center / Right Toolbar Controls */}
        <div className={css.rightGroup}>
          {/* Play Fullscreen Slideshow button */}
          <button
            className={css.playBtn}
            onClick={() => setSlideshowMode(true)}
            title={txt.presentation}
          >
            <Play size={16} fill="currentColor" />
          </button>

          {/* Insert Capsule Group (Table, Shapes/Badge, Note, Photo, Text) */}
          <div className={css.insertCapsule} role="toolbar" aria-label="Obyekt qo‘shish">
            <button className={css.insertBtn} onClick={addDentalTable} title={txt.table}>
              <Table size={16} />
            </button>
            <button className={css.insertBtn} onClick={() => addBadge()} title={txt.badge}>
              <Shapes size={16} />
            </button>
            <button className={css.insertBtn} onClick={addStickyNote} title={txt.note}>
              <MessageSquare size={16} />
            </button>
            <button
              className={css.insertBtn}
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              title={txt.photo}
            >
              <ImagePlus size={16} />
            </button>
            <button className={css.insertBtn} onClick={() => addText(false)} title={txt.text}>
              <Type size={16} />
            </button>
          </div>

          <div className={css.divider} />

          {/* Format Brush Button (Paintbrush) */}
          <button
            className={`${css.iconBtn} ${formatOpen ? css.active : ''}`}
            onClick={() => {
              setFormatOpen((v) => !v);
              if (!formatOpen && selectedEl) {
                setInspectorTab(selectedEl.type === 'image' ? 'content' : 'style');
              }
            }}
            title={txt.format}
          >
            <Paintbrush size={18} />
          </button>

          {/* Undo / Redo */}
          <button className={css.iconBtn} onClick={undo} disabled={!history.length} title={txt.undo}>
            <Undo2 size={17} />
          </button>
          <button className={css.iconBtn} onClick={redo} disabled={!future.length} title={txt.redo}>
            <Redo2 size={17} />
          </button>

          <div className={css.divider} />

          {/* Export / Share Button */}
          <div className="relative">
            <button
              className={css.iconBtn}
              onClick={() => setExportOpen((o) => !o)}
              disabled={exporting}
              title={txt.export}
            >
              <Share2 size={17} />
            </button>

            {exportOpen && (
              <div
                className="absolute right-0 top-full mt-2 z-50 p-2 w-56 rounded-2xl shadow-2xl flex flex-col gap-1 border"
                style={{
                  background: 'var(--kn-popover-bg)',
                  borderColor: 'var(--kn-bar-border)',
                  color: 'var(--kn-text)'
                }}
              >
                <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold border-b border-white/10 opacity-70">
                  <span>{txt.export.toUpperCase()}</span>
                  <select
                    className="bg-transparent text-xs outline-none cursor-pointer font-bold"
                    value={exportRange}
                    onChange={(e) => setExportRange(e.target.value as any)}
                  >
                    <option value="all" className="bg-slate-800 text-white">
                      {txt.exportAll}
                    </option>
                    <option value="current" className="bg-slate-800 text-white">
                      {txt.exportCurrent}
                    </option>
                  </select>
                </div>

                <button
                  onClick={() => doExport('pdf')}
                  className="flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl hover:bg-white/10 transition"
                >
                  <span>{txt.exportPdf}</span>
                  <span className="text-[10px] opacity-60">PDF</span>
                </button>
                <button
                  onClick={() => doExport('pptx')}
                  className="flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl hover:bg-white/10 transition"
                >
                  <span>{txt.exportPptx}</span>
                  <span className="text-[10px] opacity-60">PPTX</span>
                </button>
                <button
                  onClick={() => doExport('docx')}
                  className="flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl hover:bg-white/10 transition"
                >
                  <span>{txt.exportDocx}</span>
                  <span className="text-[10px] opacity-60">DOC</span>
                </button>
                <button
                  onClick={() => doExport('png')}
                  className="flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-xl hover:bg-white/10 transition"
                >
                  <span>{txt.exportPng}</span>
                  <span className="text-[10px] opacity-60">HD</span>
                </button>
              </div>
            )}
          </div>

          {/* Expand Fullscreen Toggle */}
          <button
            className={css.iconBtn}
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Kichraytirish' : 'Keng ekranda tahrirlash'}
          >
            {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>

        {/* Hidden File Inputs */}
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => void uploadPhotos(e.target.files)}
          hidden
          aria-label="Rasmlarni tanlash"
        />
        <input
          ref={replaceFileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => void replaceSelectedPhoto(e.target.files)}
          hidden
          aria-label="Rasmni almashtirish"
        />
      </header>

      {/* Error / Alert Banner */}
      {error && (
        <div className="bg-rose-950/80 border-b border-rose-800 text-rose-200 px-4 py-2 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-white font-bold px-2 py-0.5">
            ✕
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 2. WORKSPACE: LEFT NAVIGATOR + VIEWPORT CANVAS                      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className={css.workspace}>
        {/* Left Slide Navigator (Thumbnails Strip) */}
        <nav
          className={`${css.navigator} ${!navigatorOpen ? css.collapsed : ''}`}
          aria-label={txt.slides}
        >
          {/* Requirement 2: [+] Add Slide Button at the TOP of the Navigator */}
          <button
            className={css.addSlideTopBtn}
            onClick={addNewSlide}
            title={txt.newSlide}
          >
            <Plus size={16} />
            <span>{txt.addSlide}</span>
          </button>

          <div className={css.slideList}>
            {slides.map((slide, i) => (
              <div
                key={slide.id}
                className={`${css.slideThumbItem} ${i === active ? css.active : ''}`}
                draggable
                onDragStart={() => {
                  dragSlide.current = i;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragSlide.current !== null && dragSlide.current !== i) {
                    moveSlide(dragSlide.current, i);
                  }
                  dragSlide.current = null;
                }}
                onClick={() => {
                  setActive(i);
                  setSelected(null);
                  setIsMasking(false);
                  setContextMenuOpen(false);
                }}
                title={`${txt.slide} ${i + 1}`}
              >
                <span className={css.slideNumber}>{i + 1}</span>
                <Mini slide={slide} />
              </div>
            ))}
          </div>
        </nav>

        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* VIEWPORT & KEYNOTE CANVAS                                         */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        <main
          className={css.viewport}
          ref={viewport}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelected(null);
              setContextMenuOpen(false);
              setFormatOpen(false);
              setEditing(null);
            }
          }}
        >
          {/* Top Keynote Ruler Bar */}
          <div className={css.rulerTop}>
            <div className={css.rulerTicks}>
              <span>50</span>
              <span>40</span>
              <span>30</span>
              <span>20</span>
              <span>10</span>
              <span className="font-bold text-blue-400">0</span>
              <span>10</span>
              <span>20</span>
              <span>30</span>
              <span>40</span>
              <span>50</span>
            </div>
          </div>

          {/* Slide Canvas Wrapper */}
          <div
            className={css.paperWrap}
            style={{
              width: 960 * sf,
              height: 540 * sf
            }}
          >
            {/* Slide Canvas with Dynamic Background Color (Requirement 2: reflects selected background) */}
            <div
              ref={board}
              className={css.paper}
              style={{
                transform: `scale(${sf})`,
                backgroundColor: currentSlide?.background || '#ffffff'
              }}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) {
                  setSelected(null);
                  setContextMenuOpen(false);
                  setEditing(null);
                  if (isMasking) finishMaskMode(false);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenuOpen(true);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void uploadPhotos(e.dataTransfer.files);
              }}
            >
              {/* Empty Slide Hint */}
              {!currentSlide?.elements.length && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-8 select-none">
                  <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-500 mb-4 shadow-sm">
                    <ImagePlus size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-700 mb-1">{txt.emptySlide}</h3>
                  <p className="text-sm text-slate-500 mb-4 max-w-sm text-center">{txt.emptySlideDesc}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fileInput.current?.click()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition shadow-md"
                    >
                      + {txt.photo}
                    </button>
                    <button
                      onClick={() => addText(true)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
                    >
                      + {txt.heading}
                    </button>
                  </div>
                </div>
              )}

              {/* Slide Elements */}
              {currentSlide?.elements.map((item) => {
                const isSelected = selected === item.id;
                const isMaskTarget = isMasking && maskTemp?.id === item.id;

                return (
                  <div
                    key={item.id}
                    className={`${css.element} ${isSelected ? css.selected : ''} ${isMaskTarget ? css.maskTarget : ''}`}
                    style={{
                      left: `${item.x}%`,
                      top: `${item.y}%`,
                      width: `${item.width}%`,
                      height: `${item.height ?? (item.type === 'image' ? 40 : 15)}%`,
                      transform: `rotate(${item.rotation || 0}deg)`
                    }}
                    onPointerDown={(e) => handlePointerDown(e, item.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelected(item.id);
                      setContextMenuOpen(true);
                    }}
                  >
                    {/* Inline Text Editing */}
                    {editing === item.id ? (
                      <textarea
                        autoFocus
                        value={item.content || ''}
                        onPointerDown={(e) => e.stopPropagation()}
                        onChange={(e) => updateSelected({ content: e.target.value })}
                        onBlur={() => setEditing(null)}
                        style={{
                          width: '100%',
                          height: '100%',
                          background: 'transparent',
                          resize: 'none',
                          border: 'none',
                          outline: 'none',
                          fontSize: item.fontSize || 24,
                          fontWeight: item.bold ? 700 : 400,
                          color: item.color || '#17212b',
                          textAlign: item.align || 'left',
                          fontFamily: item.fontFamily || 'inherit'
                        }}
                      />
                    ) : (
                      <Visual el={isMaskTarget && maskTemp ? maskTemp : item} isMasking={isMaskTarget} />
                    )}

                    {/* 8 Circular Drag Handles with Proportional Scaling */}
                    {isSelected && !isMasking && (
                      <>
                        <span className={`${css.handle} ${css.nw}`} onPointerDown={(e) => handlePointerDown(e, item.id, 'nw')} />
                        <span className={`${css.handle} ${css.ne}`} onPointerDown={(e) => handlePointerDown(e, item.id, 'ne')} />
                        <span className={`${css.handle} ${css.sw}`} onPointerDown={(e) => handlePointerDown(e, item.id, 'sw')} />
                        <span className={`${css.handle} ${css.se}`} onPointerDown={(e) => handlePointerDown(e, item.id, 'se')} />
                        <span className={`${css.handle} ${css.n}`} onPointerDown={(e) => handlePointerDown(e, item.id, 'n')} />
                        <span className={`${css.handle} ${css.s}`} onPointerDown={(e) => handlePointerDown(e, item.id, 's')} />
                        <span className={`${css.handle} ${css.w}`} onPointerDown={(e) => handlePointerDown(e, item.id, 'w')} />
                        <span className={`${css.handle} ${css.e}`} onPointerDown={(e) => handlePointerDown(e, item.id, 'e')} />
                      </>
                    )}
                  </div>
                );
              })}

              {/* Dynamic Center Snapping Guides */}
              {guides.x && <div className={css.guideX} />}
              {guides.y && <div className={css.guideY} />}

              {/* Floating Measurement Tooltip */}
              {measureInfo && (
                <div
                  className={css.measureBadge}
                  style={{
                    left: `${measureInfo.x + 10}%`,
                    top: `${measureInfo.y}%`
                  }}
                >
                  {txt.width}: {measureInfo.w} pt; {txt.height}: {measureInfo.h} pt
                </div>
              )}
            </div>

            {/* ═════════════════════════════════════════════════════════════ */}
            {/* FLOATING ACTION CALLOUT BAR & ANCHORED CONTEXT MENU           */}
            {/* Exactly positioned above or below element in pixels           */}
            {/* ═════════════════════════════════════════════════════════════ */}
            {(() => {
              if (!selectedEl) return null;
              const paperW = 960 * sf;
              const paperH = 540 * sf;

              const elLeft = (selectedEl.x / 100) * paperW;
              const elTop = (selectedEl.y / 100) * paperH;
              const elW = (selectedEl.width / 100) * paperW;
              const elH = ((selectedEl.height ?? (selectedEl.type === 'image' ? 40 : 15)) / 100) * paperH;
              const elCenterX = elLeft + elW / 2;
              const elBottom = elTop + elH;

              // 1. Horizontal Callout Bar position:
              // Primary: directly above the element ("tepasiga").
              // Fallback if near top: directly below the element ("tegiga").
              const calloutW = selectedEl.type === 'image' ? 330 : 270;
              const calloutLeft = Math.max(8, Math.min(paperW - calloutW - 8, elCenterX - calloutW / 2));
              const calloutTop = elTop >= 46 ? elTop - 42 : elBottom + 8;

              // 2. Vertical Context Menu position:
              // Menu size: ~220px wide, ~290px tall (image) / ~220px tall (text)
              const menuW = 220;
              const menuH = selectedEl.type === 'image' ? 290 : 220;

              let menuLeft: number;
              let menuTop: number;

              const fitsBelow = elBottom + menuH + 8 <= paperH + 30;
              const fitsAbove = elTop - menuH - 8 >= -10;

              if (fitsBelow) {
                // Directly below the element ("tegiga"), centered on the element
                menuLeft = Math.max(8, Math.min(paperW - menuW - 8, elCenterX - menuW / 2));
                menuTop = elBottom + 8;
              } else if (fitsAbove) {
                // Directly above the element ("tepasiga"), centered on the element
                menuLeft = Math.max(8, Math.min(paperW - menuW - 8, elCenterX - menuW / 2));
                menuTop = Math.max(8, elTop - menuH - 8);
              } else {
                // Tall element: place on side ("yonida"), right next to the element, NEVER overlapping ("ustidan yopib qo'ymisan")
                if (elCenterX > paperW / 2) {
                  menuLeft = Math.max(8, elLeft - menuW - 8);
                } else {
                  menuLeft = Math.min(paperW - menuW - 8, elLeft + elW + 8);
                }
                menuTop = Math.max(8, Math.min(paperH - menuH - 8, elTop));
              }

              return (
                <>
                  {/* 1. FLOATING ACTION CALLOUT BAR (Hidden when contextMenuOpen is true) */}
                  {!isMasking && !editing && !contextMenuOpen && (
                    <div
                      className={css.calloutBar}
                      style={{
                        left: `${calloutLeft}px`,
                        top: `${calloutTop}px`
                      }}
                      role="toolbar"
                      aria-label="Tanlangan obyekt amallari"
                    >
                      <button className={css.calloutBtn} onClick={() => copyObject(true)}>
                        {txt.cut}
                      </button>
                      <button className={css.calloutBtn} onClick={() => copyObject(false)}>
                        {txt.copy}
                      </button>
                      <button className={css.calloutBtn} onClick={pasteObject} disabled={!clipboard}>
                        {txt.paste}
                      </button>
                      <div className={css.calloutDivider} />
                      <button className={`${css.calloutBtn} ${css.danger}`} onClick={removeSelected}>
                        {txt.delete}
                      </button>
                      {selectedEl.type === 'image' && (
                        <>
                          <div className={css.calloutDivider} />
                          <button className={css.calloutBtn} onClick={() => enterMaskMode(selectedEl)}>
                            {txt.crop}
                          </button>
                        </>
                      )}
                      <div className={css.calloutDivider} />
                      <button
                        className={css.calloutBtn}
                        onClick={() => setContextMenuOpen(true)}
                        title="Ko‘proq sozlamalar"
                      >
                        ›
                      </button>
                    </div>
                  )}

                  {/* 2. ANCHORED CONTEXT MENU (Shown when contextMenuOpen is true; Callout bar is CLOSED) */}
                  {contextMenuOpen && !isMasking && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setContextMenuOpen(false)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenuOpen(false);
                        }}
                      />
                      <div
                        className={css.contextMenuAnchored}
                        style={{
                          left: `${menuLeft}px`,
                          top: `${menuTop}px`
                        }}
                      >
                        <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-white/10 text-[11px] font-semibold text-slate-400">
                          <button
                            onClick={() => setContextMenuOpen(false)}
                            className="flex items-center gap-1 hover:text-white transition"
                            title="Orqaga"
                          >
                            <ChevronLeft size={14} />
                            <span>{txt.prev || 'Orqaga'}</span>
                          </button>
                          <button onClick={() => setContextMenuOpen(false)} className="hover:text-white px-1">
                            ✕
                          </button>
                        </div>

                        <button className={css.contextMenuItem} onClick={() => copyObject(true)}>
                          <Scissors size={15} />
                          <span>{txt.cut}</span>
                        </button>
                        <button className={css.contextMenuItem} onClick={() => copyObject(false)}>
                          <Copy size={15} />
                          <span>{txt.copy}</span>
                        </button>
                        <button className={css.contextMenuItem} onClick={pasteObject} disabled={!clipboard}>
                          <ClipboardPaste size={15} />
                          <span>{txt.paste}</span>
                        </button>
                        <button className={`${css.contextMenuItem} ${css.danger}`} onClick={removeSelected}>
                          <Trash2 size={15} />
                          <span>{txt.delete}</span>
                        </button>

                        <div className={css.contextMenuDivider} />

                        {selectedEl.type === 'image' && (
                          <>
                            <button
                              className={css.contextMenuItem}
                              onClick={() => {
                                enterMaskMode(selectedEl);
                              }}
                            >
                              <Crop size={15} />
                              <span>
                                {txt.crop} ({txt.autoCrop})...
                              </span>
                            </button>
                            <button
                              className={css.contextMenuItem}
                              onClick={() => replaceFileInput.current?.click()}
                            >
                              <RefreshCw size={15} />
                              <span>{txt.replacePhoto}</span>
                            </button>
                            <button
                              className={css.contextMenuItem}
                              onClick={() => {
                                updateSelected({ contrast: 125, brightness: 5 });
                                setContextMenuOpen(false);
                              }}
                            >
                              <Sparkles size={15} />
                              <span>{txt.hdEnhance}</span>
                            </button>
                          </>
                        )}

                        {selectedEl.type !== 'image' && (
                          <button
                            className={css.contextMenuItem}
                            onClick={() => {
                              setFormatOpen(true);
                              setInspectorTab('content');
                              setContextMenuOpen(false);
                            }}
                          >
                            <Type size={15} />
                            <span>{txt.format} ›</span>
                          </button>
                        )}

                        <div className={css.contextMenuDivider} />

                        <button
                          className={css.contextMenuItem}
                          onClick={() => {
                            const idx = currentSlide.elements.findIndex((e) => e.id === selectedEl.id);
                            const items = [...currentSlide.elements];
                            if (idx < items.length - 1) {
                              const [item] = items.splice(idx, 1);
                              items.push(item);
                              commit(doc.current.map((s, i) => (i === active ? { ...s, elements: items } : s)));
                            }
                            setContextMenuOpen(false);
                          }}
                        >
                          <ArrowUpRight size={15} />
                          <span>{txt.bringForward}</span>
                        </button>
                        <button
                          className={css.contextMenuItem}
                          onClick={() => {
                            const idx = currentSlide.elements.findIndex((e) => e.id === selectedEl.id);
                            const items = [...currentSlide.elements];
                            if (idx > 0) {
                              const [item] = items.splice(idx, 1);
                              items.unshift(item);
                              commit(doc.current.map((s, i) => (i === active ? { ...s, elements: items } : s)));
                            }
                            setContextMenuOpen(false);
                          }}
                        >
                          <ChevronDown size={15} />
                          <span>{txt.sendBackward}</span>
                        </button>
                      </div>
                    </>
                  )}
                </>
              );
            })()}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* KEYNOTE MASK / CROP MODE BAR (Anchored directly under photo)    */}
            {/* Requirement: "kadirlash o'shani tegida bo'lsin"               */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {isMasking && maskTemp && (() => {
              const paperW = 960 * sf;
              const paperH = 540 * sf;
              const elLeft = (maskTemp.x / 100) * paperW;
              const elTop = (maskTemp.y / 100) * paperH;
              const elW = (maskTemp.width / 100) * paperW;
              const elH = ((maskTemp.height ?? 40) / 100) * paperH;
              const elCenterX = elLeft + elW / 2;
              const elBottom = elTop + elH;

              const maskBarW = 380;
              const maskBarLeft = Math.max(8, Math.min(paperW - maskBarW - 8, elCenterX - maskBarW / 2));
              // Primary: directly under the photo ("tegiga")
              // If near bottom of slide: place directly above the photo
              const fitsBelow = elBottom + 58 <= paperH + 40;
              const maskBarTop = fitsBelow ? elBottom + 10 : (elTop >= 55 ? elTop - 52 : Math.max(8, elBottom - 52));

              return (
                <div
                  className={css.maskBar}
                  style={{
                    left: `${maskBarLeft}px`,
                    top: `${maskBarTop}px`
                  }}
                  role="group"
                  aria-label={txt.crop}
                >
                  <button className={css.maskAutoBtn} onClick={resetMask} title="Asliga qaytarish">
                    <Crop size={16} />
                    <span>{txt.autoCrop}</span>
                  </button>

                  <div className={css.maskSliderWrap}>
                    <input
                      type="range"
                      min="1"
                      max="3.5"
                      step="0.05"
                      value={maskTemp.objectScale || 1}
                      onChange={(e) => setMaskTemp({ ...maskTemp, objectScale: Number(e.target.value) })}
                      className={css.maskSlider}
                      aria-label="Rasm masshtabi"
                    />
                  </div>

                  <button className={css.maskResetBtn} onClick={() => finishMaskMode(false)}>
                    {txt.cancel}
                  </button>

                  <button className={css.maskDoneBtn} onClick={() => finishMaskMode(true)} title={txt.done}>
                    <Check size={18} strokeWidth={3} />
                  </button>
                </div>
              );
            })()}
          </div>
        </main>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 4. FORMAT INSPECTOR POPOVER (Paintbrush 🖌️ Button Panel)           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {formatOpen && (
        <aside className={css.formatInspector} aria-label={txt.format}>
          <div className={css.inspectorHeader}>
            <h3>{txt.format}</h3>
            <button className={css.iconBtn} onClick={() => setFormatOpen(false)} aria-label="Yopish">
              <X size={16} />
            </button>
          </div>

          {/* Segmented Control Tabs */}
          <div className={css.segmentedControl}>
            <button
              className={`${css.segmentTab} ${inspectorTab === 'style' ? css.active : ''}`}
              onClick={() => setInspectorTab('style')}
            >
              {txt.style}
            </button>
            <button
              className={`${css.segmentTab} ${inspectorTab === 'content' ? css.active : ''}`}
              onClick={() => setInspectorTab('content')}
            >
              {selectedEl ? (selectedEl.type === 'image' ? txt.image : txt.text) : txt.slide}
            </button>
            <button
              className={`${css.segmentTab} ${inspectorTab === 'arrange' ? css.active : ''}`}
              onClick={() => setInspectorTab('arrange')}
            >
              {txt.arrange}
            </button>
          </div>

          <div className={css.inspectorBody}>
            {/* ────────────────────────────────────────────────────────── */}
            {/* CONTENT TAB: TEXT / HEADING CONTROLS                       */}
            {/* ────────────────────────────────────────────────────────── */}
            {inspectorTab === 'content' && selectedEl && selectedEl.type !== 'image' && (
              <>
                {/* Font Size Stepper ([-] 24 pt [+]) */}
                <div className={css.controlGroup}>
                  <label className={css.controlLabel}>{txt.fontSize}</label>
                  <div className={css.stepperRow}>
                    <button
                      className={css.stepperBtn}
                      onClick={() => updateSelected({ fontSize: Math.max(10, (selectedEl.fontSize || 24) - 2) })}
                    >
                      -
                    </button>
                    <span className={css.stepperVal}>{selectedEl.fontSize || 24} pt</span>
                    <button
                      className={css.stepperBtn}
                      onClick={() => updateSelected({ fontSize: Math.min(120, (selectedEl.fontSize || 24) + 2) })}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Quick Font Size Presets */}
                <div className={css.fontPresetRow}>
                  {[16, 20, 24, 32, 44, 60].map((sz) => (
                    <button
                      key={sz}
                      className={`${css.fontPresetBtn} ${selectedEl.fontSize === sz ? css.active : ''}`}
                      onClick={() => updateSelected({ fontSize: sz })}
                    >
                      {sz}
                    </button>
                  ))}
                </div>

                {/* Font Styling Toggles (B, I, U, S) */}
                <div className={css.controlGroup}>
                  <label className={css.controlLabel}>{txt.textStyle}</label>
                  <div className={css.toggleRow}>
                    <button
                      className={`${css.toggleBtn} ${selectedEl.bold ? css.active : ''}`}
                      onClick={() => updateSelected({ bold: !selectedEl.bold })}
                    >
                      <b>B</b>
                    </button>
                    <button
                      className={`${css.toggleBtn} ${selectedEl.italic ? css.active : ''}`}
                      onClick={() => updateSelected({ italic: !selectedEl.italic })}
                    >
                      <i>I</i>
                    </button>
                    <button
                      className={`${css.toggleBtn} ${selectedEl.underline ? css.active : ''}`}
                      onClick={() => updateSelected({ underline: !selectedEl.underline })}
                    >
                      <u>U</u>
                    </button>
                    <button
                      className={`${css.toggleBtn} ${selectedEl.strike ? css.active : ''}`}
                      onClick={() => updateSelected({ strike: !selectedEl.strike })}
                    >
                      <s>S</s>
                    </button>
                  </div>
                </div>

                {/* Alignment */}
                <div className={css.controlGroup}>
                  <label className={css.controlLabel}>{txt.align}</label>
                  <div className={css.toggleRow}>
                    <button
                      className={`${css.toggleBtn} ${selectedEl.align === 'left' || !selectedEl.align ? css.active : ''}`}
                      onClick={() => updateSelected({ align: 'left' })}
                    >
                      <AlignLeft size={16} />
                    </button>
                    <button
                      className={`${css.toggleBtn} ${selectedEl.align === 'center' ? css.active : ''}`}
                      onClick={() => updateSelected({ align: 'center' })}
                    >
                      <AlignCenter size={16} />
                    </button>
                    <button
                      className={`${css.toggleBtn} ${selectedEl.align === 'right' ? css.active : ''}`}
                      onClick={() => updateSelected({ align: 'right' })}
                    >
                      <AlignRight size={16} />
                    </button>
                    <button
                      className={`${css.toggleBtn} ${selectedEl.align === 'justify' ? css.active : ''}`}
                      onClick={() => updateSelected({ align: 'justify' })}
                    >
                      <AlignJustify size={16} />
                    </button>
                  </div>
                </div>

                {/* Text Color Swatches */}
                <div className={css.controlGroup}>
                  <label className={css.controlLabel}>{txt.textColor}</label>
                  <div className={css.colorSwatches}>
                    {['#17212b', '#007aff', '#34c759', '#ff3b30', '#ff9500', '#af52de', '#ffffff'].map((c) => (
                      <span
                        key={c}
                        className={`${css.colorCircle} ${selectedEl.color === c ? css.selected : ''}`}
                        style={{ backgroundColor: c, border: c === '#ffffff' ? '1px solid #ccc' : 'none' }}
                        onClick={() => updateSelected({ color: c })}
                      />
                    ))}
                    <input
                      type="color"
                      value={selectedEl.color || '#17212b'}
                      onChange={(e) => updateSelected({ color: e.target.value })}
                      className="w-7 h-7 rounded-full cursor-pointer bg-transparent border-0"
                    />
                  </div>
                </div>
              </>
            )}

            {/* ────────────────────────────────────────────────────────── */}
            {/* CONTENT TAB: IMAGE CONTROLS                                */}
            {/* ────────────────────────────────────────────────────────── */}
            {inspectorTab === 'content' && selectedEl && selectedEl.type === 'image' && (
              <>
                <button
                  className={`${css.inspectorActionBtn} ${css.primary}`}
                  onClick={() => enterMaskMode(selectedEl)}
                >
                  <Crop size={16} />
                  <span>{txt.crop} ({txt.autoCrop})</span>
                </button>

                <button
                  className={css.inspectorActionBtn}
                  onClick={() => replaceFileInput.current?.click()}
                >
                  <RefreshCw size={15} />
                  <span>{txt.replacePhoto}</span>
                </button>

                <div className={css.controlGroup}>
                  <label className={css.controlLabel}>{txt.fitMode}</label>
                  <div className={css.toggleRow}>
                    <button
                      className={`${css.toggleBtn} ${selectedEl.fit === 'contain' || !selectedEl.fit ? css.active : ''}`}
                      onClick={() => updateSelected({ fit: 'contain' })}
                    >
                      {txt.contain}
                    </button>
                    <button
                      className={`${css.toggleBtn} ${selectedEl.fit === 'cover' ? css.active : ''}`}
                      onClick={() => updateSelected({ fit: 'cover' })}
                    >
                      {txt.cover}
                    </button>
                  </div>
                </div>

                {/* Brightness & Contrast Sliders */}
                <div className={css.controlGroup}>
                  <label className={css.controlLabel}>
                    {txt.brightness} ({selectedEl.brightness || 0}%)
                  </label>
                  <input
                    type="range"
                    min="-40"
                    max="40"
                    value={selectedEl.brightness || 0}
                    onChange={(e) => updateSelected({ brightness: Number(e.target.value) })}
                    className="w-full accent-blue-500"
                  />
                </div>

                <div className={css.controlGroup}>
                  <label className={css.controlLabel}>
                    {txt.contrast} ({selectedEl.contrast || 100}%)
                  </label>
                  <input
                    type="range"
                    min="60"
                    max="150"
                    value={selectedEl.contrast || 100}
                    onChange={(e) => updateSelected({ contrast: Number(e.target.value) })}
                    className="w-full accent-blue-500"
                  />
                </div>
              </>
            )}

            {/* ────────────────────────────────────────────────────────── */}
            {/* CONTENT TAB: SLIDE / DOCUMENT (Requirement 2: background)  */}
            {/* ────────────────────────────────────────────────────────── */}
            {inspectorTab === 'content' && !selectedEl && (
              <>
                <div className={css.controlGroup}>
                  <label className={css.controlLabel}>{txt.slideBg}</label>
                  <div className={css.colorSwatches}>
                    {['#ffffff', '#f8fafc', '#f1f5f9', '#0f172a', '#1e293b', '#fef3c7', '#dbeafe'].map((bg) => (
                      <span
                        key={bg}
                        className={`${css.colorCircle} ${currentSlide?.background === bg ? css.selected : ''}`}
                        style={{ backgroundColor: bg, border: bg === '#ffffff' ? '1px solid #ccc' : 'none' }}
                        onClick={() =>
                          commit(doc.current.map((s, i) => (i === active ? { ...s, background: bg } : s)))
                        }
                      />
                    ))}
                    <input
                      type="color"
                      value={currentSlide?.background || '#ffffff'}
                      onChange={(e) =>
                        commit(doc.current.map((s, i) => (i === active ? { ...s, background: e.target.value } : s)))
                      }
                      className="w-7 h-7 rounded-full cursor-pointer bg-transparent border-0"
                    />
                  </div>
                </div>

                <div className={css.controlGroup}>
                  <label className={css.controlLabel}>{txt.templates}</label>
                  <button className={css.inspectorActionBtn} onClick={() => applyLayoutPreset('2-photos')}>
                    <LayoutGrid size={15} />
                    <span>{txt.tmpl2}</span>
                  </button>
                  <button className={css.inspectorActionBtn} onClick={() => applyLayoutPreset('4-grid')}>
                    <LayoutGrid size={15} />
                    <span>{txt.tmpl4}</span>
                  </button>
                  <button className={css.inspectorActionBtn} onClick={() => applyLayoutPreset('6-grid')}>
                    <LayoutGrid size={15} />
                    <span>{txt.tmpl6}</span>
                  </button>
                  <button className={css.inspectorActionBtn} onClick={() => applyLayoutPreset('9-protocol')}>
                    <LayoutGrid size={15} />
                    <span>{txt.tmpl9}</span>
                  </button>
                </div>
              </>
            )}

            {/* ────────────────────────────────────────────────────────── */}
            {/* STYLE TAB: Border, Corner Radius, Shadow                   */}
            {/* ────────────────────────────────────────────────────────── */}
            {inspectorTab === 'style' && (
              <>
                {selectedEl ? (
                  <>
                    <div className={css.controlGroup}>
                      <label className={css.controlLabel}>
                        {txt.cornerRadius} ({selectedEl.borderRadius || 0}px)
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="32"
                        value={selectedEl.borderRadius || 0}
                        onChange={(e) => updateSelected({ borderRadius: Number(e.target.value) })}
                        className="w-full accent-blue-500"
                      />
                    </div>

                    <div className={css.controlGroup}>
                      <label className={css.controlLabel}>{txt.border}</label>
                      <div className={css.toggleRow}>
                        {[0, 1, 2, 4].map((bw) => (
                          <button
                            key={bw}
                            className={`${css.toggleBtn} ${(selectedEl.borderWidth || 0) === bw ? css.active : ''}`}
                            onClick={() => updateSelected({ borderWidth: bw, borderColor: '#007aff' })}
                          >
                            {bw === 0 ? '0px' : `${bw}px`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={css.controlGroup}>
                      <label className={css.controlLabel}>{txt.shadow}</label>
                      <button
                        className={`${css.inspectorActionBtn} ${selectedEl.shadow ? css.primary : ''}`}
                        onClick={() => updateSelected({ shadow: !selectedEl.shadow })}
                      >
                        <span>{selectedEl.shadow ? '✓ ' + txt.shadow : '+ ' + txt.shadow}</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    Uslubni sozlash uchun slayd ustidagi rasm yoki matnni tanlang.
                  </p>
                )}
              </>
            )}

            {/* ────────────────────────────────────────────────────────── */}
            {/* ARRANGE TAB: Layer Order, Rotation, Dimensions             */}
            {/* ────────────────────────────────────────────────────────── */}
            {inspectorTab === 'arrange' && (
              <>
                {selectedEl ? (
                  <>
                    <div className={css.controlGroup}>
                      <label className={css.controlLabel}>{txt.layerOrder}</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          className={css.inspectorActionBtn}
                          onClick={() => {
                            const idx = currentSlide.elements.findIndex((e) => e.id === selectedEl.id);
                            const items = [...currentSlide.elements];
                            if (idx < items.length - 1) {
                              const [item] = items.splice(idx, 1);
                              items.push(item);
                              commit(doc.current.map((s, i) => (i === active ? { ...s, elements: items } : s)));
                            }
                          }}
                        >
                          <ChevronUp size={15} />
                          <span>{txt.bringForward}</span>
                        </button>
                        <button
                          className={css.inspectorActionBtn}
                          onClick={() => {
                            const idx = currentSlide.elements.findIndex((e) => e.id === selectedEl.id);
                            const items = [...currentSlide.elements];
                            if (idx > 0) {
                              const [item] = items.splice(idx, 1);
                              items.unshift(item);
                              commit(doc.current.map((s, i) => (i === active ? { ...s, elements: items } : s)));
                            }
                          }}
                        >
                          <ChevronDown size={15} />
                          <span>{txt.sendBackward}</span>
                        </button>
                      </div>
                    </div>

                    <div className={css.controlGroup}>
                      <label className={css.controlLabel}>{txt.rotate}</label>
                      <button
                        className={css.inspectorActionBtn}
                        onClick={() => updateSelected({ rotation: ((selectedEl.rotation || 0) + 90) % 360 })}
                      >
                        <RotateCw size={15} />
                        <span>{txt.rotate}</span>
                      </button>
                    </div>

                    <div className={css.controlGroup}>
                      <label className={css.controlLabel}>{txt.dimensions}</label>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-slate-400">{txt.width}</span>
                          <input
                            type="number"
                            min="5"
                            max="100"
                            value={Math.round(selectedEl.width)}
                            onChange={(e) => updateSelected({ width: Number(e.target.value) })}
                            className="p-2 rounded-lg bg-black/20 border border-white/10 text-white"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-slate-400">{txt.height}</span>
                          <input
                            type="number"
                            min="5"
                            max="100"
                            value={Math.round(selectedEl.height || 40)}
                            onChange={(e) => updateSelected({ height: Number(e.target.value) })}
                            className="p-2 rounded-lg bg-black/20 border border-white/10 text-white"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    Joylashuvni o‘zgartirish uchun slayd ustidagi obyektni tanlang.
                  </p>
                )}
              </>
            )}
          </div>
        </aside>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 5. REQUIREMENT 3: FULLSCREEN PRESENTATION / SLIDESHOW MODE (▶ Play) */}
      {/* Screen left click -> previous slide, right click -> next slide     */}
      {/* ArrowLeft & ArrowRight keyboard keys fully functional              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {slideshowMode && (
        <div
          className="fixed inset-0 z-[999999] bg-black flex flex-col items-center justify-center select-none"
          onClick={(e) => {
            // Ignore click if clicking direct buttons
            if ((e.target as HTMLElement).closest('button')) return;
            const halfW = window.innerWidth / 2;
            if (e.clientX < halfW) {
              setActive((a) => Math.max(0, a - 1));
            } else {
              setActive((a) => Math.min(slides.length - 1, a + 1));
            }
          }}
        >
          {/* Transparent left and right click zones */}
          <div
            className={css.slideshowZoneLeft}
            onClick={(e) => {
              e.stopPropagation();
              setActive((a) => Math.max(0, a - 1));
            }}
            title={txt.prev}
          />
          <div
            className={css.slideshowZoneRight}
            onClick={(e) => {
              e.stopPropagation();
              setActive((a) => Math.min(slides.length - 1, a + 1));
            }}
            title={txt.next}
          />

          {/* Top Info & Exit button */}
          <div className="absolute top-4 right-4 z-50 flex items-center gap-3">
            <span className="text-white/70 text-xs font-mono font-bold bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md">
              {active + 1} / {slides.length}
            </span>
            <button
              onClick={() => setSlideshowMode(false)}
              className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition backdrop-blur-md"
              title={txt.exitSlideshow}
            >
              <X size={20} />
            </button>
          </div>

          {/* Presentation Slide Viewport — muharrir bilan AYNAN bir xil 960×540 renderer;
              scale = min(ekranW/960, ekranH/540); markazda; ortgan joy QORA (letterbox). */}
          {currentSlide && <ScaledSlide slide={currentSlide} bg="#000000" rounded />}

          {/* Slide Navigation Buttons & Chevrons */}
          <div className="absolute bottom-6 flex items-center gap-4 z-50 pointer-events-auto">
            <button
              disabled={active === 0}
              onClick={(e) => {
                e.stopPropagation();
                setActive((a) => Math.max(0, a - 1));
              }}
              className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 disabled:opacity-20 text-white font-bold backdrop-blur-md transition flex items-center gap-1 text-sm"
            >
              <ChevronLeft size={18} />
              <span>{txt.prev}</span>
            </button>
            <button
              disabled={active === slides.length - 1}
              onClick={(e) => {
                e.stopPropagation();
                setActive((a) => Math.min(slides.length - 1, a + 1));
              }}
              className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 disabled:opacity-20 text-white font-bold backdrop-blur-md transition flex items-center gap-1 text-sm"
            >
              <span>{txt.next}</span>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
