import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const display = Inter({
  subsets: ['latin'],
  variable: '--font-sans-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Roast my site — honest scores + an instant glow-up',
  description:
    'Paste a URL. Get a brutally specific roast of your messaging, a score out of 100, and a rewritten headline that is actually better.',
  openGraph: {
    title: 'Roast my site',
    description: 'A sharp roast, a score out of 100, and an instant glow-up for your landing page.',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#07070a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <body className="min-h-dvh font-display antialiased">
        <div className="aurora" aria-hidden />
        <div className="grain" aria-hidden />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
