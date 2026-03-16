import type { Metadata } from 'next';
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';
import { ProjectProvider } from '@/contexts/ProjectContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
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
    <html lang="pt-BR" className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
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
