import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProvider } from '@/components/app-provider';
import { AppShell } from '@/components/app-shell';
import { ToastProvider } from '@/components/ui/toast';
import { ServiceWorkerRegister } from '@/components/service-worker-register';

export const metadata: Metadata = {
  title: '家計簿',
  description: '夫婦でも個人でも使える、シンプルな家計簿アプリ。今いくら使えるかがすぐ分かります。',
  manifest: '/manifest.webmanifest',
  applicationName: '家計簿',
  appleWebApp: {
    capable: true,
    title: '家計簿',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  // iPhone のセーフエリア（ノッチ・ホームバー）まで描画する
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f6f4' },
    { media: '(prefers-color-scheme: dark)', color: '#121214' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <ToastProvider>
          <AppProvider>
            <AppShell>{children}</AppShell>
          </AppProvider>
        </ToastProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
