'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectionStatus } from '@/components/shared/ConnectionStatus';
import { ProjectSelector } from '@/components/shared/ProjectSelector';

const LINKS = [
  { href: '/kanban', label: 'Kanban' },
  { href: '/lista', label: 'Lista' },
  { href: '/empresa', label: 'Empresa' },
  { href: '/empresa/config', label: 'Config' },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="bg-gray-900 border-b border-gray-800">
      <div className="flex items-center justify-between px-4 md:px-6 py-3">
        <div className="flex items-center gap-4 md:gap-6">
          <span className="text-sm font-bold text-gray-100 tracking-tight">
            aiox-monitor
          </span>
          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    active
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <ProjectSelector />
          </div>
          <ConnectionStatus />
          {/* Hamburger button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-1.5 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            aria-label="Menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>
      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-800 px-4 py-2 space-y-1">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2 rounded text-sm font-medium transition-colors ${
                  active
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="sm:hidden pt-2 border-t border-gray-800">
            <ProjectSelector />
          </div>
        </div>
      )}
    </nav>
  );
}
