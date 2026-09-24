import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pulse Foundry — Rhythm Instrument',
  description:
    'An offline drum machine, percussion synthesizer, and rhythm trainer.',
  applicationName: 'Pulse Foundry',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Pulse Foundry',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#17242e',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.classList.toggle('dark',d);var local=location.hostname==='localhost'||location.hostname==='127.0.0.1'||location.hostname==='[::1]';var marker='pulse-foundry-dev-cache-cleaned';if(local&&!sessionStorage.getItem(marker)&&'serviceWorker'in navigator&&'caches'in window){Promise.all([navigator.serviceWorker.getRegistrations(),caches.keys()]).then(function(result){var registrations=result[0];var keys=result[1].filter(function(key){return key.indexOf('pulse-foundry-')===0});if(!registrations.length&&!keys.length)return;sessionStorage.setItem(marker,'1');return Promise.all(registrations.map(function(registration){return registration.unregister()}).concat(keys.map(function(key){return caches.delete(key)}))).then(function(){location.reload()})}).catch(function(){})}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
