import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/layout/Navbar';

export const metadata: Metadata = {
  title: 'aiox-monitor',
  description: 'Observability dashboard for Claude Code + AIOX agents',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-950 text-gray-100 min-h-screen flex flex-col">
        <Navbar />
        {children}
      </body>
    </html>
  );
}
