import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { PostHogProvider } from '@/components/PostHogProvider';

// One family, used decisively. The whole interface is set in it.
const jet = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jet',
  display: 'swap',
  weight: ['400', '500', '700'],
});

const BASE = process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:3042';

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: 'Roast — score your landing page out of 100',
  description:
    'Paste a URL. We roast your landing page, score it out of 100 against a real rubric, and hand you the rewrite. Free.',
  openGraph: {
    title: 'Roast — score your landing page out of 100',
    description:
      'Paste a URL. We roast your landing page, score it out of 100, and hand you the rewrite. Free.',
    type: 'website',
    url: '/',
    images: [{ url: '/api/og', width: 1200, height: 630, alt: 'Roast' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Roast — score your landing page out of 100',
    description:
      'Paste a URL. We roast your landing page, score it out of 100, and hand you the rewrite. Free.',
    images: ['/api/og'],
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-icon', sizes: '180x180', type: 'image/png' }],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jet.variable}>
      <body className="min-h-dvh font-mono antialiased">
        <PostHogProvider>
          <div className="grid-bg" aria-hidden />
          <div className="relative z-10">{children}</div>
        </PostHogProvider>
      </body>
    </html>
  );
}
