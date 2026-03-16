'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { ConnectionStatus } from '@/components/shared/ConnectionStatus';
import { ProjectSelector } from '@/components/shared/ProjectSelector';

const LINKS = [
  { href: '/kanban', label: 'Kanban', icon: '⬡' },
  { href: '/lista', label: 'Lista', icon: '☰' },
  { href: '/terminais', label: 'Terminais', icon: '▣' },
  { href: '/empresa', label: 'Empresa', icon: '◈' },
  { href: '/empresa/config', label: 'Config', icon: '⚙' },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 glass border-gradient-b">
      <div className="flex items-center justify-between px-4 md:px-6 h-12">
        {/* Left: Logo + Nav */}
        <div className="flex items-center gap-6">
          <Logo />

          {/* Separator */}
          <div className="hidden md:block w-px h-5 bg-border" />

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-0.5">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                    active
                      ? 'text-text-primary bg-surface-3/60'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-2/50'
                  }`}
                >
                  {link.label}
                  {active && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full bg-accent-blue shadow-glow-sm" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right: Project selector + Connection + Hamburger */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <ProjectSelector />
          </div>
          <ConnectionStatus />
          {/* Hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2/50 transition-colors"
            aria-label="Menu"
          >
            <svg className="w-4.5 h-4.5" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border px-4 py-2 space-y-0.5 animate-fade-in">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                  active
                    ? 'text-text-primary bg-surface-3/60'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-2/50'
                }`}
              >
                <span className="text-xs opacity-50">{link.icon}</span>
                {link.label}
              </Link>
            );
          })}
          <div className="sm:hidden pt-2 border-t border-border">
            <ProjectSelector />
          </div>
        </div>
      )}
    </nav>
  );
}
