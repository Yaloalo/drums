import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pulse Foundry — Rhythm Instrument',
  description: 'An offline drum machine, percussion synthesizer, and rhythm trainer.',
  applicationName: 'Pulse Foundry',
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { url: '/icon-512.png', sizes: '512x512', type: 'image/png' }], apple: '/icon-192.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Pulse Foundry' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#07090b',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="dark"><body>{children}</body></html>;
}
