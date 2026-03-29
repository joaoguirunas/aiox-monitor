import type { Metadata } from 'next';
import { Geist, Roboto_Mono } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';
import { ProjectProvider } from '@/contexts/ProjectContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
});

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'aiox monitor',
  description: 'Real-time AI agent monitoring dashboard with virtual isometric office',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${geist.variable} ${robotoMono.variable}`}>
      <body className="bg-surface-0 text-text-primary font-sans min-h-screen flex flex-col antialiased">
        <WebSocketProvider>
          <ProjectProvider>
            <Navbar />
            {children}
          </ProjectProvider>
        </WebSocketProvider>
      </body>
    </html>
  );
}
