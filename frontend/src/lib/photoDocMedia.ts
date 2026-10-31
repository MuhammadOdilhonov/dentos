// Foto-protokol: server qaytargan CANONICAL doc'dagi media havolalarini (base64 →
// /api/patient-media/.../download/) lokal hujjatga YANGI tahrirlarni yo'qotmasdan singdiramiz.
//
// Backend persist_images har bir `data:image/...;base64,...` satrni barqaror URL'ga
// almashtiradi (struktura o'zgarmaydi). Shuning uchun almashtirishni QIYMAT bo'yicha
// qilamiz: yuborilgan (sent) va canonical doc'ni parallel aylanib, base64→URL juftlarini
// yig'amiz; so'ng JORIY lokal doc'da AYNAN o'sha base64 satr hali tursa — URL'ga
// almashtiramiz. Agar foydalanuvchi save ketgandan keyin o'sha rasmni o'zgartirgan bo'lsa,
// eski base64 endi joriy doc'da yo'q → tegmaymiz (yangi tahrir saqlanadi).

export type Rewrites = Map<string, string>;

function isBase64Image(s: any): s is string {
  return typeof s === 'string' && s.startsWith('data:image/');
}
function isMediaUrl(s: any): s is string {
  return typeof s === 'string' && s.includes('/api/patient-media/');
}

// sent va canonical ni parallel aylanib base64→URL juftlarini yig'amiz.
export function collectMediaRewrites(sent: any, canonical: any, out: Rewrites = new Map()): Rewrites {
  if (isBase64Image(sent) && isMediaUrl(canonical) && sent !== canonical) {
    out.set(sent, canonical);
    return out;
  }
  if (Array.isArray(sent) && Array.isArray(canonical)) {
    const n = Math.min(sent.length, canonical.length);
    for (let i = 0; i < n; i++) collectMediaRewrites(sent[i], canonical[i], out);
    return out;
  }
  if (sent && canonical && typeof sent === 'object' && typeof canonical === 'object') {
    for (const k of Object.keys(sent)) {
      if (k in (canonical as any)) collectMediaRewrites((sent as any)[k], (canonical as any)[k], out);
    }
  }
  return out;
}

// Joriy doc'dagi aynan mos keladigan base64 satrlarni URL'ga almashtiradi (yangi nusxa qaytaradi).
export function applyMediaRewrites<T = any>(doc: T, rewrites: Rewrites): T {
  if (rewrites.size === 0) return doc;
  const walk = (v: any): any => {
    if (typeof v === 'string') return rewrites.get(v) ?? v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o: any = {};
      for (const k of Object.keys(v)) o[k] = walk(v[k]);
      return o;
    }
    return v;
  };
  return walk(doc);
}

// Qulaylik: sent/canonical'dan rewrite'larni yig'ib, current'ga qo'llaydi.
export function adoptCanonicalMedia<T = any>(current: T, sent: any, canonical: any): T {
  return applyMediaRewrites(current, collectMediaRewrites(sent, canonical));
}
