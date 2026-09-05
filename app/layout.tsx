import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const metadataBase = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
);

export const metadata: Metadata = {
  metadataBase,
  title: 'geekheros.com | Control Plane',
  description:
    'Deploy, monitor, update and protect every WordPress site from one secure control plane.',
  openGraph: {
    title: 'geekheros.com | Control Plane',
    description: 'WordPress infrastructure, under control.',
    type: 'website',
    images: [{ url: '/og.png', width: 1729, height: 910, alt: 'GeekHeros WordPress control plane' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'geekheros.com | Control Plane',
    description: 'WordPress infrastructure, under control.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
