// #6 regressiya — server canonical doc (base64→media URL) ni lokal hujjatga YANGI
// tahrirlarni yo'qotmasdan singdirish. Tashqi framework YO'Q; ts-resolve hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./ts-resolve.mjs', import.meta.url);

const { collectMediaRewrites, applyMediaRewrites, adoptCanonicalMedia } = await import('../src/lib/photoDocMedia.ts');

const B64_A = 'data:image/jpeg;base64,AAAA';
const B64_B = 'data:image/jpeg;base64,BBBB';
const B64_C = 'data:image/jpeg;base64,CCCC';
const URL_A = '/api/patient-media/11/download/';
const URL_B = '/api/patient-media/22/download/';

test('collectMediaRewrites base64→URL juftlarini parallel yig‘adi', () => {
  const sent = [{ id: 1, elements: [{ id: 'e1', type: 'image', src: B64_A }, { id: 'e2', type: 'text', content: 'x' }] }];
  const canonical = [{ id: 1, elements: [{ id: 'e1', type: 'image', src: URL_A }, { id: 'e2', type: 'text', content: 'x' }] }];
  const rw = collectMediaRewrites(sent, canonical);
  assert.equal(rw.size, 1);
  assert.equal(rw.get(B64_A), URL_A);
});

test('adopt: o‘zgarmagan rasm URL oladi, QAYTA tahrirlangan rasm TEGILMAYDI', () => {
  // Yuborilgan: ikki rasm (A, B). Server ikkisini ham URL qildi.
  const sent = [{ id: 1, elements: [
    { id: 'e1', type: 'image', src: B64_A },
    { id: 'e2', type: 'image', src: B64_B },
  ] }];
  const canonical = [{ id: 1, elements: [
    { id: 'e1', type: 'image', src: URL_A },
    { id: 'e2', type: 'image', src: URL_B },
  ] }];
  // Save ketgandan KEYIN foydalanuvchi e2 ni YANGI rasmga (C) almashtirdi; e1 o‘zgarmagan.
  const current = [{ id: 1, elements: [
    { id: 'e1', type: 'image', src: B64_A },   // o‘zgarmagan → URL_A bo‘lsin
    { id: 'e2', type: 'image', src: B64_C },   // yangi tahrir → TEGILMASIN
  ] }];
  const adopted = adoptCanonicalMedia(current, sent, canonical);
  assert.equal(adopted[0].elements[0].src, URL_A, 'o‘zgarmagan rasm server URL‘ini oladi');
  assert.equal(adopted[0].elements[1].src, B64_C, 'qayta tahrirlangan rasm (yangi base64) saqlanib qoladi');
  // Asl obyekt mutatsiya qilinmasligi (yangi nusxa) kerak.
  assert.equal(current[0].elements[0].src, B64_A, 'applyMediaRewrites asl doc‘ni o‘zgartirmaydi');
});

test('rewrite yo‘q bo‘lsa — doc o‘zgarmaydi (bir xil havola qaytsa)', () => {
  const sent = [{ id: 1, elements: [{ id: 'e1', type: 'image', src: URL_A }] }];
  const canonical = [{ id: 1, elements: [{ id: 'e1', type: 'image', src: URL_A }] }];
  const rw = collectMediaRewrites(sent, canonical);
  assert.equal(rw.size, 0);
  const current = [{ id: 9 }];
  assert.equal(applyMediaRewrites(current, rw), current, 'bo‘sh rewrite — aynan o‘sha obyekt qaytadi');
});

test('pending (navbatdagi) hujjatga ham qo‘llanadi — keyingi saqlash URL yuboradi', () => {
  const sent = [{ id: 1, elements: [{ id: 'e1', type: 'image', src: B64_A }] }];
  const canonical = [{ id: 1, elements: [{ id: 'e1', type: 'image', src: URL_A }] }];
  const rewrites = collectMediaRewrites(sent, canonical);
  // pending: foydalanuvchi matn qo‘shdi, lekin e1 rasm o‘zgarmagan (hali base64).
  const pending = [{ id: 1, elements: [{ id: 'e1', type: 'image', src: B64_A }, { id: 'e9', type: 'text', content: 'yangi' }] }];
  const out = applyMediaRewrites(pending, rewrites);
  assert.equal(out[0].elements[0].src, URL_A, 'pending ichidagi o‘zgarmagan rasm ham URL bo‘ladi');
  assert.equal(out[0].elements[1].content, 'yangi', 'yangi matn saqlanadi');
});
