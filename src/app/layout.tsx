import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0A2540',
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'วันนี้ลา by DBC | ระบบบริหารจัดการวันลาออนไลน์และโควต้า',
  description:
    'วันนี้ลา by DBC - ระบบลางานออนไลน์พร้อมปฏิทินวันลา อนุมัติ 2 ขั้นตอน คำนวณวันหยุดอัตโนมัติ และเชื่อมต่อ Google Sheets',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'วันนี้ลา by DBC',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Text:wght@400;500;700&family=Noto+Sans+Thai:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased selection:bg-blue-100 selection:text-blue-900 font-sans">
        {children}
      </body>
    </html>
  );
}
