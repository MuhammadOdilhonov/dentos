// IndexedDB-based binary media store for Dental 3D Scans (.zip / .stl) and Rentgen / CT Suites (.zip / images)
// Allows storing real patient files without localStorage 5MB quota limitations.

const DB_NAME = '32desk_dental_media_db';
const DB_VERSION = 1;
const STORE_SCANS = 'scans';
const STORE_RENTGENS = 'rentgens';

export interface StoredMediaItem {
  key: string;
  file: Blob;
  fileName: string;
  fileSize: number;
  fileType: string;
  isZip: boolean;
  uploadedAt: string;
  filesCount?: number;
  extractedList?: string[];
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_SCANS)) {
        db.createObjectStore(STORE_SCANS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_RENTGENS)) {
        db.createObjectStore(STORE_RENTGENS, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const dentalMediaStore = {
  // ════════════ 3D SCANS (ZIP / STL) ════════════
  async saveScan(
    identifier: string | number,
    file: Blob | File,
    fileName?: string,
    extractedList?: string[]
  ): Promise<StoredMediaItem> {
    const db = await openDB();
    const actualName = fileName || (file as File).name || '3d_scan.zip';
    const isZip = actualName.toLowerCase().endsWith('.zip');

    const item: StoredMediaItem = {
      key: String(identifier),
      file,
      fileName: actualName,
      fileSize: file.size,
      fileType: file.type || (isZip ? 'application/zip' : 'model/stl'),
      isZip,
      uploadedAt: new Date().toISOString(),
      filesCount: extractedList?.length,
      extractedList
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SCANS, 'readwrite');
      const store = tx.objectStore(STORE_SCANS);
      const req = store.put(item);
      req.onsuccess = () => resolve(item);
      req.onerror = () => reject(req.error);
    });
  },

  async getScan(identifier: string | number): Promise<StoredMediaItem | null> {
    if (!identifier) return null;
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SCANS, 'readonly');
        const store = tx.objectStore(STORE_SCANS);
        const req = store.get(String(identifier));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('dentalMediaStore.getScan error:', e);
      return null;
    }
  },

  async deleteScan(identifier: string | number): Promise<void> {
    if (!identifier) return;
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SCANS, 'readwrite');
        const store = tx.objectStore(STORE_SCANS);
        const req = store.delete(String(identifier));
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('dentalMediaStore.deleteScan error:', e);
    }
  },

  // ════════════ RENTGEN / KT (ZIP / IMAGES) ════════════
  async saveRentgen(
    identifier: string | number,
    file: Blob | File,
    fileName?: string,
    extractedList?: string[]
  ): Promise<StoredMediaItem> {
    const db = await openDB();
    const actualName = fileName || (file as File).name || 'rentgen.zip';
    const isZip = actualName.toLowerCase().endsWith('.zip');

    const item: StoredMediaItem = {
      key: String(identifier),
      file,
      fileName: actualName,
      fileSize: file.size,
      fileType: file.type || (isZip ? 'application/zip' : 'image/jpeg'),
      isZip,
      uploadedAt: new Date().toISOString(),
      filesCount: extractedList?.length,
      extractedList
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_RENTGENS, 'readwrite');
      const store = tx.objectStore(STORE_RENTGENS);
      const req = store.put(item);
      req.onsuccess = () => resolve(item);
      req.onerror = () => reject(req.error);
    });
  },

  async getRentgen(identifier: string | number): Promise<StoredMediaItem | null> {
    if (!identifier) return null;
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_RENTGENS, 'readonly');
        const store = tx.objectStore(STORE_RENTGENS);
        const req = store.get(String(identifier));
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('dentalMediaStore.getRentgen error:', e);
      return null;
    }
  },

  async deleteRentgen(identifier: string | number): Promise<void> {
    if (!identifier) return;
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_RENTGENS, 'readwrite');
        const store = tx.objectStore(STORE_RENTGENS);
        const req = store.delete(String(identifier));
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('dentalMediaStore.deleteRentgen error:', e);
    }
  }
};
