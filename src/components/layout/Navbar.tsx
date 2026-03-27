'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { ConnectionStatus } from '@/components/shared/ConnectionStatus';
import { ProjectSelector } from '@/components/shared/ProjectSelector';

const LINKS = [
  { href: '/empresa', label: 'Real Time' },
  { href: '/kanban', label: 'Kanban' },
  { href: '/terminais', label: 'Terminais' },
  { href: '/empresa/config', label: 'Config' },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-surface-0/80 backdrop-blur-md border-b border-border/40">
      <div className="flex items-center justify-between px-4 h-11">
        {/* Left: Logo + Nav */}
        <div className="flex items-center gap-5">
          <Logo />

          <div className="hidden md:block w-px h-4 bg-border/40" />

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-0.5">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors duration-150 ${
                    active
                      ? 'text-text-primary bg-white/[0.06]'
                      : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.03]'
                  }`}
                >
                  {link.label}
                  {active && (
                    <span className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 w-3 h-[1.5px] rounded-full bg-accent-blue" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <ProjectSelector />
          </div>
          <ConnectionStatus />

          {/* Hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-1 rounded-md text-text-muted hover:text-text-secondary hover:bg-white/[0.04] transition-colors"
            aria-label="Menu"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div className="md:hidden border-t border-border/30 px-4 py-1.5 space-y-0.5 animate-fade-in">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`block px-2.5 py-2 rounded-md text-[12px] font-medium transition-colors ${
                  active
                    ? 'text-text-primary bg-white/[0.06]'
                    : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.03]'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="sm:hidden pt-1.5 border-t border-border/30">
            <ProjectSelector />
          </div>
        </div>
      )}
    </nav>
  );
}
