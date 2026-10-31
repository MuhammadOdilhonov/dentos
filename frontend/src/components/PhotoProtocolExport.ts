// Foto protokol slaydlarini PDF / PowerPoint (PPTX) / Word (.doc) / PNG ga eksport qiladi.
// Har slayd 960x540 (16:9) canvasga chiziladi (fon + rasm + matn), so'ng formatga joylanadi.
// jspdf/pptxgenjs OG'IR — dinamik import (faqat eksport bosilganda yuklanadi).

const W = 960, H = 540;

type AnyEl = {
  type: string; x: number; y: number; width: number; height?: number;
  src?: string; content?: string; badgeText?: string; caption?: string;
  fontSize?: number; bold?: boolean; italic?: boolean; align?: 'left' | 'center' | 'right' | 'justify';
  objectX?:number; objectY?:number; objectScale?:number; color?: string; fit?: 'cover' | 'contain'; rotation?: number;
};
type AnySlide = { id: string; background?: string; elements: AnyEl[] };

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Bitta slaydni PNG dataURL ga render qiladi. SCALE — sifat (3× = yuqori aniqlik, kachestvasi tushmaydi).
const SCALE = 3;
export async function renderSlideToDataURL(slide: AnySlide): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE); // butun chizish 3× aniqlikda (koordinatalar 960x540 bo'lib qolaveradi)
  ctx.imageSmoothingEnabled = true;
  (ctx as any).imageSmoothingQuality = 'high';
  ctx.fillStyle = slide.background || '#ffffff';
  ctx.fillRect(0, 0, W, H);

  for (const el of slide.elements) {
    const bx = (el.x / 100) * W;
    const by = (el.y / 100) * H;
    const bw = (el.width / 100) * W;
    const bh = ((el.height ?? (el.type === 'image' ? 40 : 15)) / 100) * H;
    ctx.save();
    ctx.translate(bx+bw/2,by+bh/2);ctx.rotate((el.rotation||0)*Math.PI/180);ctx.translate(-bx-bw/2,-by-bh/2);
    ctx.beginPath();ctx.rect(bx,by,bw,bh);ctx.clip();
    if (el.type === 'image' && el.src) {
      try {
        const img = await loadImg(el.src);
        if (el.fit === 'cover') {
          const s = Math.max(bw / img.width, bh / img.height);
          const dw = img.width * s * (el.objectScale || 1), dh = img.height * s * (el.objectScale || 1);
          ctx.save(); ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
          ctx.drawImage(img, bx + (bw - dw) * (el.objectX ?? 50) / 100, by + (bh - dh) * (el.objectY ?? 50) / 100, dw, dh); ctx.restore();
        } else {
          const s = Math.min(bw / img.width, bh / img.height);
          const dw = img.width * s * (el.objectScale || 1), dh = img.height * s * (el.objectScale || 1);
          ctx.drawImage(img, bx + (bw - dw) * (el.objectX ?? 50) / 100, by + (bh - dh) * (el.objectY ?? 50) / 100, dw, dh);
        }
      } catch { /* rasm yuklanmadi — o'tkazamiz */ }
    } else {
      const text = (el.type === 'badge' ? el.badgeText : el.content) || '';
      if (!text) {ctx.restore();continue;}
      const fs = el.fontSize || 24;
      ctx.font = `${el.italic ? 'italic ' : ''}${el.bold ? '700' : '400'} ${fs}px Arial, sans-serif`;
      ctx.fillStyle = el.color || '#17212b';
      ctx.textBaseline = 'top';
      const align = el.align || 'left';
      ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
      const tx = align === 'center' ? bx + bw / 2 : align === 'right' ? bx + bw : bx;
      // So'zlarni qatorlarga bo'lamiz (box kengligiga sig'dirib)
      const lines: string[] = [];
      for (const para of text.split('\n')) {
        let line = '';
        for (const word of para.split(' ')) {
          const test = line ? line + ' ' + word : word;
          if (ctx.measureText(test).width > bw && line) { lines.push(line); line = word; }
          else line = test;
        }
        lines.push(line);
      }
      lines.forEach((ln, i) => ctx.fillText(ln, tx, by + i * fs * 1.25));
    }
    ctx.restore();
  }
  return canvas.toDataURL('image/png');
}

export type ExportFormat = 'pdf' | 'pptx' | 'docx' | 'png';

async function renderAll(slides: AnySlide[]): Promise<string[]> {
  const out: string[] = [];
  for (const s of slides) out.push(await renderSlideToDataURL(s));
  return out;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// slides — eksport qilinadigan slaydlar (hammasi yoki tanlangan). format — tanlangan format.
export async function exportSlides(slides: AnySlide[], format: ExportFormat, patientName: string): Promise<void> {
  const safe = (patientName || 'bemor').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 40) || 'bemor';
  const name = `foto-protokol-${safe}`;
  const imgs = await renderAll(slides);
  if (!imgs.length) return;

  if (format === 'png') {
    if (imgs.length === 1) {
      const b = await (await fetch(imgs[0])).blob();
      download(b, `${name}.png`);
    } else {
      // Bir nechta sahifa — har birini alohida yuklaymiz
      for (let i = 0; i < imgs.length; i++) {
        const b = await (await fetch(imgs[i])).blob();
        download(b, `${name}-${i + 1}.png`);
      }
    }
    return;
  }

  if (format === 'pdf') {
    const { default: jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [W, H] });
    imgs.forEach((img, i) => { if (i > 0) pdf.addPage([W, H], 'landscape'); pdf.addImage(img, 'PNG', 0, 0, W, H); });
    pdf.save(`${name}.pdf`);
    return;
  }

  if (format === 'pptx') {
    const { default: pptxgen } = await import('pptxgenjs');
    const pptx = new pptxgen();
    pptx.defineLayout({ name: 'DENT16x9', width: 10, height: 5.625 });
    pptx.layout = 'DENT16x9';
    imgs.forEach((img) => { const s = pptx.addSlide(); s.addImage({ data: img, x: 0, y: 0, w: 10, h: 5.625 }); });
    await pptx.writeFile({ fileName: `${name}.pptx` });
    return;
  }

  if (format === 'docx') {
    // Word HTML .doc — har sahifa rasm sifatida (Word .doc HTML ni ochadi)
    const body = imgs.map((img) => `<p style="margin:0 0 12pt 0"><img src="${img}" width="640" /></p>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${name}</title></head><body>${body}</body></html>`;
    download(new Blob(['﻿' + html], { type: 'application/msword' }), `${name}.doc`);
    return;
  }
}
