import type { Metadata } from 'next';
import './globals.css';
import ShellLayout from '../components/ShellLayout';

export const metadata: Metadata = {
  title: 'dentOS — Zamonaviy Stomatologiya Klinikasi Boshqaruv Tizimi | Dental Cloud CRM',
  description: 'dentOS — zamonaviy stomatologiya klinikalari uchun professional bulutli boshqaruv tizimi: Qabullar (zapis), 32-tish formulasi, rentgen va 3D skanlar arxivi, moliya va shifokor foizlari, zubnoy texnik laboratoriyasi.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased select-none">
        <ShellLayout>{children}</ShellLayout>
      </body>
    </html>
  );
}
