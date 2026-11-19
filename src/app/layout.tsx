import type { Metadata } from 'next';
import { Barlow_Condensed, Barlow, Share_Tech_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const barlowCondensed = Barlow_Condensed({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-heading' });
const barlow = Barlow({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body' });
const shareTechMono = Share_Tech_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'DrillNex Admin',
  description: 'DrillNex platform administration panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${barlowCondensed.variable} ${barlow.variable} ${shareTechMono.variable}`} style={{ margin: 0, padding: 0 }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
