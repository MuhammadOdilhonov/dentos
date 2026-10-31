'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
export default function LoginScanPreview() {
    const mount = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState('3D model…');
    useEffect(() => { if (!mount.current)
        return; const host = mount.current; let disposed = false; let renderer: THREE.WebGLRenderer; try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    }
    catch {
        setStatus('3D preview unavailable');
        return;
    } renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setClearColor('#102234', 1); host.appendChild(renderer.domElement); const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(35, 1, .01, 2000); scene.add(new THREE.HemisphereLight(0xffffff, 0x476180, 2)); const light = new THREE.DirectionalLight(0xfff0da, 3); light.position.set(70, -70, 140); scene.add(light); const fill = new THREE.DirectionalLight(0xb9d8ff, 2); fill.position.set(-80, 30, 10); scene.add(fill); let mesh: THREE.Mesh | undefined; let geometry: THREE.BufferGeometry | undefined; const material = new THREE.MeshStandardMaterial({ color: 0xf3dfbd, roughness: .43, metalness: .03, side: THREE.DoubleSide }); const draw = () => renderer.render(scene, camera); const resize = () => { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); draw(); }; const observer = new ResizeObserver(resize); observer.observe(host); const controller = new AbortController(); fetch('/stl/maxillary.stl', { signal: controller.signal }).then(r => { if (!r.ok)
        throw new Error('Model unavailable'); return r.arrayBuffer(); }).then(buffer => { if (disposed)
        return; geometry = new STLLoader().parse(buffer); geometry.computeVertexNormals(); geometry.center(); geometry.computeBoundingSphere(); mesh = new THREE.Mesh(geometry, material); scene.add(mesh); const radius = geometry.boundingSphere!.radius; camera.position.set(0, -radius * 2.4, radius * 2.2); camera.up.set(0, 0, 1); camera.lookAt(0, 0, 0); resize(); setStatus(''); }).catch(() => { if (!disposed)
        setStatus('3D model yuklanmadi'); }); return () => { disposed = true; controller.abort(); observer.disconnect(); geometry?.dispose(); material.dispose(); renderer.dispose(); renderer.domElement.remove(); }; }, []);
    return <div style={{ position: 'relative', height: 370, width: '100%', background: '#102234' }}><div ref={mount} style={{ width: '100%', height: '100%' }}/>{status && <span style={{ position: 'absolute', top: '45%', left: 0, right: 0, textAlign: 'center', color: '#9eb6cb', fontSize: 12 }}>{status}</span>}<span style={{ position: 'absolute', bottom: 16, left: 18, fontSize: 10, color: '#819db4' }}>MAXILLA · STL</span><span style={{ position: 'absolute', bottom: 16, right: 18, fontSize: 10, color: '#819db4' }}>Z ↑ &nbsp; X →</span></div>;
}

