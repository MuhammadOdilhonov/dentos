'use client';
import { useEffect, useRef, useState } from 'react';
import CalendarGrid from './CalendarGrid';
import { mockEmployees, mockAppointments } from '../lib/mockData';
export default function LoginAppointmentPreview() {
    const host = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(.55);
    useEffect(() => { if (!host.current)
        return; host.current.setAttribute('inert', ''); const o = new ResizeObserver(([e]) => setScale(e.contentRect.width / 1120)); o.observe(host.current); return () => o.disconnect(); }, []);
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    const doctors = ['Sardor Alimov', 'Malvina Abdullaeva', 'Ozod Rasulov'].map((name, i) => ({ ...mockEmployees.find(e => e.role === 'doctor')!, id: 900 + i, full_name: name, avatar: undefined, chair: `Kreslo ${i + 1}`, color: ['#0ea5e9', '#8b5cf6', '#10b981'][i], role: 'doctor' as const }));
    const appointments = Array.from({ length: 6 }, (_, i) => { const start = new Date(date); start.setHours(9 + Math.floor(i / 3) * 2, i % 2 ? 30 : 0); const end = new Date(start.getTime() + 60 * 60 * 1000); return { ...mockAppointments[0], id: 990 + i, doctor: 900 + i % 3, doctor_name: doctors[i % 3].full_name, patient_name: ['Aziza Karimova', 'Jasur Aliyev', 'Madina Soliyeva'][i % 3], patient_phone: '+998 •• ••• •• ••', start_time: start.toISOString(), end_time: end.toISOString(), status: ['confirmed', 'in_progress', 'reserved'][i % 3] as 'confirmed' | 'in_progress' | 'reserved', treatment_notes: ['Ko‘rik', 'Professional gigiyena', 'Konsultatsiya'][i % 3], price: 350000, paid_amount: i % 2 ? 350000 : 0 }; });
    return <div ref={host} style={{ width: '100%', height: 520, overflow: 'hidden', pointerEvents: 'none', background: '#f1f5f9', borderRadius: 14 }} aria-hidden="true"><div style={{ width: 1120, transform: `scale(${scale})`, transformOrigin: 'top left', padding: 14 }}><CalendarGrid currentDate={date} onDateChange={() => { }} employees={doctors} appointments={appointments} onSelectAppointment={() => { }} onSlotClick={() => { }}/></div></div>;
}

