'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as fflate from 'fflate';
import {
  X,
  Maximize2,
  Minimize2,
  RotateCcw,
  Eye,
  EyeOff,
  Download,
  Upload,
  Boxes,
  Layers,
  Sparkles,
  Info,
  CheckCircle2,
  FileCheck,
  AlertCircle,
  HardDrive
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { dentalMediaStore } from '../lib/dentalMediaStore';

export interface ScanMeshItem {
  id: string;
  name: string;
  type: 'maxillary' | 'mandibular' | 'occlusion' | 'other';
  color: string;
  visible: boolean;
  mesh?: THREE.Mesh;
  vertexCount?: number;
  triangleCount?: number;
  fileSize?: number;
  buffer?: ArrayBuffer;
}

interface Dental3DScanViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId?: number;
  orderId?: number;
  patientName?: string;
  orderNumber?: string;
  initialZipFile?: File | Blob | null;
  initialFileName?: string;
  onSaveScan?: (data: { hasScan: boolean; fileName?: string; filesCount?: number; fileSize?: number }) => void;
}

export default function Dental3DScanViewerModal({
  isOpen,
  onClose,
  patientId,
  orderId,
  patientName,
  orderNumber,
  initialZipFile,
  initialFileName,
  onSaveScan
}: Dental3DScanViewerModalProps) {
  const { language, tr } = useI18n();
  const mountRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<string>('');
  const [meshes, setMeshes] = useState<ScanMeshItem[]>([]);
  const [isWireframe, setIsWireframe] = useState(false);
  const [activeFileName, setActiveFileName] = useState<string>(initialFileName || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [storedBlob, setStoredBlob] = useState<Blob | null>(initialZipFile || null);
  const [totalFileSize, setTotalFileSize] = useState<number>(0);

  // Three.js instances ref
  const threeRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    meshesGroup: THREE.Group;
    animId?: number;
  } | null>(null);



  // 1. Initialize Three.js Scene
  useEffect(() => {
    if (!isOpen || !mountRef.current) return;

    const width = mountRef.current.clientWidth || 800;
    const height = mountRef.current.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // Slate-900 studio

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(0, -120, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(100, 150, 200);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x93c5fd, 0.8);
    dirLight2.position.set(-100, -150, 150);
    scene.add(dirLight2);

    const dirLight3 = new THREE.DirectionalLight(0xffedd5, 0.6);
    dirLight3.position.set(0, 100, -100);
    scene.add(dirLight3);

    const meshesGroup = new THREE.Group();
    scene.add(meshesGroup);

    threeRef.current = {
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
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (mountRef.current) {
        mountRef.current.innerHTML = '';
      }
      threeRef.current = null;
    };
  }, [isOpen]);

  // Adjust camera to fit all loaded geometries
  const fitCameraToMeshes = (group: THREE.Group) => {
    if (!threeRef.current) return;
    const { camera, controls } = threeRef.current;

    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.6;

    camera.position.set(center.x, center.y - cameraZ, center.z + cameraZ * 0.4);
    camera.lookAt(center);
    controls.target.copy(center);
    camera.updateProjectionMatrix();
    controls.update();
  };

  // 2. Parse and Load STL Buffer into Scene
  const loadStlBuffers = async (rawFiles: Array<{ name: string; buffer: ArrayBuffer; size: number }>) => {
    if (!threeRef.current) return;
    const { meshesGroup } = threeRef.current;

    // Clear previous models
    while (meshesGroup.children.length > 0) {
      const obj = meshesGroup.children[0] as THREE.Mesh;
      meshesGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else if (obj.material) obj.material.dispose();
    }

    const loader = new STLLoader();
    const newMeshItems: ScanMeshItem[] = [];

    for (const file of rawFiles) {
      const lowerName = file.name.toLowerCase();
      let type: ScanMeshItem['type'] = 'other';
      let colorHex = 0xf5efe4; // Natural tooth ivory

      if (lowerName.includes('maxillary') || lowerName.includes('upper') || lowerName.includes('верхн')) {
        type = 'maxillary';
        colorHex = 0xf8f4ec; // clean pearlescent enamel
      } else if (lowerName.includes('mandibular') || lowerName.includes('lower') || lowerName.includes('нижн')) {
        type = 'mandibular';
        colorHex = 0xebd9c1; // slightly warmer tooth enamel
      } else if (lowerName.includes('occlusion') || lowerName.includes('bite') || lowerName.includes('прикус')) {
        type = 'occlusion';
        colorHex = 0x38bdf8; // translucent sky blue for bite
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
          wireframe: isWireframe
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
          fileSize: file.size,
          buffer: file.buffer
        });
      } catch (e) {
        console.error(`Error parsing STL ${file.name}:`, e);
      }
    }

    setMeshes(newMeshItems);
    fitCameraToMeshes(meshesGroup);
  };

  // 3. Process File (ZIP or STL)
  const handleProcessFile = async (file: File | Blob, explicitName?: string) => {
    const fileName = explicitName || (file as File).name || '3d_scan.zip';
    setActiveFileName(fileName);
    setTotalFileSize(file.size);
    setStoredBlob(file);
    setErrorMsg(null);
    setLoading(true);
    setLoadingProgress(tr('scan3d.k'));

    try {
      const arrayBuffer = await file.arrayBuffer();

      // If it is a ZIP archive
      if (fileName.toLowerCase().endsWith('.zip') || (file as File).type?.includes('zip')) {
        setLoadingProgress(tr('scan3d.zip'));

        const uint8 = new Uint8Array(arrayBuffer);
        const unzipped = fflate.unzipSync(uint8);

        const stlFiles: Array<{ name: string; buffer: ArrayBuffer; size: number }> = [];

        Object.keys(unzipped).forEach(filename => {
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
          throw new Error(
            tr('scan3d.zip3dStl')
          );
        }

        setLoadingProgress(tr('scanviewer.renderProgress').replace('{n}', String(stlFiles.length)));
        await loadStlBuffers(stlFiles);

        // Save into IndexedDB for patient and order
        if (patientId) {
          await dentalMediaStore.saveScan(patientId, file, fileName, stlFiles.map(s => s.name));
        }
        if (orderId) {
          await dentalMediaStore.saveScan(`order_${orderId}`, file, fileName, stlFiles.map(s => s.name));
        }

        if (onSaveScan) {
          onSaveScan({
            hasScan: true,
            fileName,
            filesCount: stlFiles.length,
            fileSize: file.size
          });
        }
      } else if (fileName.toLowerCase().endsWith('.stl')) {
        // Direct single STL file
        await loadStlBuffers([
          {
            name: fileName,
            buffer: arrayBuffer,
            size: file.size
          }
        ]);

        if (patientId) {
          await dentalMediaStore.saveScan(patientId, file, fileName, [fileName]);
        }
        if (orderId) {
          await dentalMediaStore.saveScan(`order_${orderId}`, file, fileName, [fileName]);
        }

        if (onSaveScan) {
          onSaveScan({
            hasScan: true,
            fileName,
            filesCount: 1,
            fileSize: file.size
          });
        }
      } else {
        throw new Error(
          tr('scan3d.zipStl')
        );
      }
    } catch (err: any) {
      console.error('3D Scan loading error:', err);
      setErrorMsg(err.message || 'Faylni ochishda xatolik yuz berdi');
    } finally {
      setLoading(false);
      setLoadingProgress('');
    }
  };

  // 4. On modal open: load real file from props or IndexedDB
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    async function loadRealData() {
      // 1. If passed directly via prop
      if (initialZipFile) {
        handleProcessFile(initialZipFile, initialFileName);
        return;
      }

      // 2. Check IndexedDB by orderId or patientId
      let found = null;
      if (orderId) {
        found = await dentalMediaStore.getScan(`order_${orderId}`);
      }
      if (!found && patientId) {
        found = await dentalMediaStore.getScan(patientId);
      }

      if (isMounted) {
        if (found && found.file) {
          handleProcessFile(found.file, found.fileName);
        } else {
          // Clear any previous data: NO FAKE DEMO DATA!
          setMeshes([]);
          setActiveFileName('');
          setStoredBlob(null);
          if (threeRef.current) {
            const { meshesGroup } = threeRef.current;
            while (meshesGroup.children.length > 0) {
              const obj = meshesGroup.children[0] as THREE.Mesh;
              meshesGroup.remove(obj);
              if (obj.geometry) obj.geometry.dispose();
            }
          }
        }
      }
    }

    loadRealData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, initialZipFile, patientId, orderId]);

  // Toggle layer visibility
  const toggleVisibility = (id: string) => {
    setMeshes(prev =>
      prev.map(item => {
        if (item.id === id) {
          const next = !item.visible;
          if (item.mesh) item.mesh.visible = next;
          return { ...item, visible: next };
        }
        return item;
      })
    );
  };

  // Toggle wireframe mode
  const toggleWireframe = () => {
    setIsWireframe(prev => {
      const next = !prev;
      meshes.forEach(item => {
        if (item.mesh && item.mesh.material) {
          const mat = item.mesh.material as THREE.MeshPhongMaterial;
          mat.wireframe = next;
        }
      });
      return next;
    });
  };

  // Viewpoint presets
  const setViewpoint = (view: 'front' | 'top' | 'right' | 'left' | 'fit') => {
    if (!threeRef.current) return;
    const { camera, controls, meshesGroup } = threeRef.current;

    const box = new THREE.Box3().setFromObject(meshesGroup);
    const center = box.isEmpty() ? new THREE.Vector3(0, 0, 0) : box.getCenter(new THREE.Vector3());
    const size = box.isEmpty() ? new THREE.Vector3(50, 50, 50) : box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 1.8;

    controls.target.copy(center);

    switch (view) {
      case 'front':
        camera.position.set(center.x, center.y - dist, center.z);
        break;
      case 'top':
        camera.position.set(center.x, center.y, center.z + dist);
        break;
      case 'right':
        camera.position.set(center.x + dist, center.y, center.z);
        break;
      case 'left':
        camera.position.set(center.x - dist, center.y, center.z);
        break;
      case 'fit':
      default:
        fitCameraToMeshes(meshesGroup);
        return;
    }

    camera.lookAt(center);
    controls.update();
  };

  // Download real file / ZIP
  const handleDownload = () => {
    if (!storedBlob) {
      alert(tr('scan3d.k2'));
      return;
    }
    const url = URL.createObjectURL(storedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFileName || '3d_scan.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle direct file input upload
  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
    e.target.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 select-none animate-in fade-in duration-150">
      <div className="relative w-full max-w-6xl h-[92vh] bg-slate-900 rounded-3xl border border-slate-700 shadow-2xl flex flex-col overflow-hidden text-white">
        
        {/* TOP BAR */}
        <div className="px-5 py-3 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-md shadow-purple-500/20">
              <Boxes className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight text-white">{tr('scanviewer.title')}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-950 text-purple-300 border border-purple-800">
                  WebGL 3D
                </span>
                {totalFileSize > 0 && (
                  <span className="text-[10px] font-mono text-slate-400">
                    ({(totalFileSize / (1024 * 1024)).toFixed(1)} MB)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-medium">
                {patientName ? `${patientName} • ` : ''}
                {orderNumber ? `${orderNumber} • ` : ''}
                <span className="font-mono text-slate-300">{activeFileName || tr('scanviewer.noFileTitle')}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.stl"
              className="hidden"
              onChange={onFileInputChange}
            />

            {/* Upload real ZIP/STL button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition shadow-xs"
              title={tr('scanviewer.uploadZip')}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{tr('scanviewer.uploadZip')}</span>
            </button>

            {/* Download real file */}
            {storedBlob && (
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold transition shadow-xs"
                title={tr('scanviewer.download')}
              >
                <Download className="w-3.5 h-3.5" />
                <span>{tr('scanviewer.download')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700/80 transition"
              title={tr('scanviewer.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MAIN WORKSPACE (VIEWPORT + SIDEBAR) */}
        <div className="flex-1 relative flex overflow-hidden">
          
          {/* 3D Canvas Mount */}
          <div ref={mountRef} className="w-full h-full relative cursor-grab active:cursor-grabbing bg-radial from-slate-900 to-slate-950" />

          {/* EMPTY STATE (When no 3D scan is uploaded yet - NO FAKE PROCEDURAL DATA) */}
          {!loading && meshes.length === 0 && (
            <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xs">
              <div className="max-w-md w-full p-8 rounded-3xl bg-slate-900/95 border border-slate-700 text-center space-y-4 shadow-2xl">
                <div className="w-16 h-16 rounded-3xl bg-purple-950/80 text-purple-400 border border-purple-800 flex items-center justify-center mx-auto shadow-lg shadow-purple-500/10">
                  <Boxes className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">{tr('scanviewer.noFileTitle')}</h3>
                  <p className="text-xs text-slate-400 mt-1">{tr('scanviewer.noFileDesc')}</p>
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-6 rounded-2xl border-2 border-dashed border-purple-500/40 hover:border-purple-400 bg-purple-950/20 hover:bg-purple-950/40 transition cursor-pointer space-y-2 group"
                >
                  <Upload className="w-6 h-6 text-purple-400 mx-auto group-hover:scale-110 transition" />
                  <p className="text-xs font-bold text-purple-300">{tr('scanviewer.dragOrClick')}</p>
                  <p className="text-[10px] text-slate-500 font-mono">160926-Nasarullaev Shaxruh проект.zip, *.stl</p>
                </div>
              </div>
            </div>
          )}

          {/* LOADING OVERLAY */}
          {loading && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-xs gap-3">
              <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
              <p className="text-xs font-mono font-bold text-purple-300 animate-pulse">{loadingProgress || 'Yuklanmoqda…'}</p>
            </div>
          )}

          {/* ERROR ALERT */}
          {errorMsg && (
            <div className="absolute top-4 left-4 z-30 max-w-md p-3 rounded-2xl bg-rose-950/90 border border-rose-700 text-rose-200 text-xs flex items-center gap-2 shadow-lg">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span className="flex-1">{errorMsg}</span>
              <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* VIEWPORT CONTROLS BAR (Top Center Overlay) */}
          {meshes.length > 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 p-1 bg-slate-800/80 backdrop-blur-md rounded-2xl border border-slate-700 shadow-lg text-xs">
              <button
                type="button"
                onClick={() => setViewpoint('front')}
                className="px-2.5 py-1 rounded-xl hover:bg-slate-700 text-slate-300 hover:text-white transition font-bold text-[11px]"
              >
                {tr('scanviewer.front')}
              </button>
              <button
                type="button"
                onClick={() => setViewpoint('top')}
                className="px-2.5 py-1 rounded-xl hover:bg-slate-700 text-slate-300 hover:text-white transition font-bold text-[11px]"
              >
                {tr('scanviewer.top')}
              </button>
              <button
                type="button"
                onClick={() => setViewpoint('right')}
                className="px-2.5 py-1 rounded-xl hover:bg-slate-700 text-slate-300 hover:text-white transition font-bold text-[11px]"
              >
                {tr('scanviewer.right')}
              </button>
              <button
                type="button"
                onClick={() => setViewpoint('left')}
                className="px-2.5 py-1 rounded-xl hover:bg-slate-700 text-slate-300 hover:text-white transition font-bold text-[11px]"
              >
                {tr('scanviewer.left')}
              </button>
              <div className="w-[1px] h-4 bg-slate-700 mx-1" />
              <button
                type="button"
                onClick={() => setViewpoint('fit')}
                className="px-2.5 py-1 rounded-xl hover:bg-slate-700 text-purple-400 hover:text-purple-300 transition font-bold text-[11px] flex items-center gap-1"
                title={tr('scanviewer.reset')}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{tr('scanviewer.reset')}</span>
              </button>
              <button
                type="button"
                onClick={toggleWireframe}
                className={`px-2.5 py-1 rounded-xl transition font-bold text-[11px] flex items-center gap-1 ${
                  isWireframe ? 'bg-purple-600 text-white' : 'hover:bg-slate-700 text-slate-300'
                }`}
                title={isWireframe ? tr('scanviewer.solid') : tr('scanviewer.wireframe')}
              >
                <Layers className="w-3 h-3" />
                <span>{isWireframe ? tr('scanviewer.solid') : tr('scanviewer.wireframe')}</span>
              </button>
            </div>
          )}

          {/* RIGHT SIDEBAR: LAYERS & MESHES */}
          {meshes.length > 0 && (
            <div className="absolute right-4 top-4 bottom-4 w-72 z-20 flex flex-col rounded-3xl bg-slate-800/85 backdrop-blur-md border border-slate-700/80 shadow-2xl p-3.5 space-y-3 overflow-hidden">
              <div className="flex items-center justify-between pb-2 border-b border-slate-700">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-200">{tr('scanviewer.layers')}</h3>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-950 text-purple-300">
                  {meshes.length} STL
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {meshes.map(item => {
                  const label =
                    item.type === 'maxillary'
                      ? tr('scanviewer.maxillary')
                      : item.type === 'mandibular'
                      ? tr('scanviewer.mandibular')
                      : item.type === 'occlusion'
                      ? tr('scanviewer.occlusion')
                      : item.name;

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-2xl border transition space-y-1.5 ${
                        item.visible
                          ? 'bg-slate-900/80 border-slate-600 shadow-sm'
                          : 'bg-slate-900/40 border-slate-800 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-3 h-3 rounded-full shrink-0 shadow-xs border border-white/20"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-xs font-black text-white truncate">{label}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleVisibility(item.id)}
                          className={`p-1.5 rounded-xl transition ${
                            item.visible
                              ? 'text-purple-400 hover:bg-purple-950/60'
                              : 'text-slate-500 hover:bg-slate-800'
                          }`}
                          title={item.visible ? 'Yashirish' : 'Ko‘rsatish'}
                        >
                          {item.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-800">
                        <span className="truncate max-w-[140px] text-slate-500">{item.name}</span>
                        <span>{item.triangleCount ? `${Math.round(item.triangleCount).toLocaleString()} ▲` : ''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Info */}
              <div className="p-2.5 rounded-2xl bg-purple-950/30 border border-purple-900/40 text-[11px] text-purple-200/80 space-y-1">
                <div className="flex items-center gap-1 font-bold text-purple-300">
                  <Sparkles className="w-3 h-3" />
                  <span>{tr('scan3d.n3d')}</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  {tr('scan3d.k3')}
                </p>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
