'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';

const LINKS = [
  {
    href: '/command-room',
    label: 'Sala de Comando',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
  {
    href: '/empresa',
    label: 'Real Time',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
];

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isConfig = pathname === '/config';

  return (
    <nav className="sticky top-0 z-nav bg-black/95 backdrop-blur-xl border-b border-[rgba(255,68,0,0.18)]">
      <div className="flex items-center justify-between px-5 h-11">

        {/* ── Left: Logo + Nav links ────────────────────────────────── */}
        <div className="flex items-center gap-5">
          <Logo />

          <div className="hidden md:block w-px h-4 bg-[rgba(255,68,0,0.2)]" />

          <div className="hidden md:flex items-center h-11">
            {LINKS.map((link) => {
              const active = pathname === link.href || pathname.startsWith(link.href + '/');
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`
                    relative flex items-center gap-1.5 px-3.5 h-full
                    font-mono text-[9px] font-medium uppercase tracking-[0.12em]
                    transition-colors duration-150
                    ${active
                      ? 'text-[#F4F4E8]'
                      : 'text-[rgba(244,244,232,0.32)] hover:text-[rgba(244,244,232,0.6)]'
                    }
                  `}
                >
                  {/* Active bottom underline */}
                  {active && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#FF4400] rounded-full" />
                  )}
                  <span style={{ color: active ? '#FF4400' : 'inherit' }}>
                    {link.icon}
                  </span>
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* ── Right: Settings + Hamburger ──────────────────────────── */}
        <div className="flex items-center gap-1">
          <Link
            href="/config"
            className={`
              w-7 h-7 flex items-center justify-center rounded transition-colors
              ${isConfig
                ? 'text-[#FF4400]'
                : 'text-[rgba(244,244,232,0.32)] hover:text-[rgba(244,244,232,0.6)] hover:bg-[rgba(255,255,255,0.04)]'
              }
            `}
            title="Configurações"
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7 7 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.248a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a7 7 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a7 7 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a7 7 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-7 h-7 flex items-center justify-center rounded text-[rgba(244,244,232,0.32)] hover:text-[rgba(244,244,232,0.6)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
            aria-label="Menu"
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* ── Mobile menu ──────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[rgba(255,68,0,0.12)] px-2 py-1.5 space-y-0.5 bg-black/98 backdrop-blur-xl animate-fade-in">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(link.href + '/');
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`
                  flex items-center gap-2 px-3 py-2.5 rounded-sm
                  font-mono text-[9px] font-medium uppercase tracking-[0.12em] transition-colors
                  ${active
                    ? 'bg-[rgba(255,68,0,0.08)] text-[#F4F4E8] border-l-2 border-[#FF4400]'
                    : 'border-l-2 border-transparent text-[rgba(244,244,232,0.32)] hover:text-[rgba(244,244,232,0.6)] hover:bg-[rgba(255,255,255,0.03)]'
                  }
                `}
              >
                <span style={{ color: active ? '#FF4400' : 'inherit' }}>{link.icon}</span>
                {link.label}
              </Link>
            );
          })}
          <Link
            href="/config"
            onClick={() => setMobileOpen(false)}
            className={`
              flex items-center gap-2 px-3 py-2.5 rounded-sm border-l-2
              font-mono text-[9px] font-medium uppercase tracking-[0.12em] transition-colors
              ${isConfig
                ? 'bg-[rgba(255,68,0,0.08)] text-[#F4F4E8] border-[#FF4400]'
                : 'border-transparent text-[rgba(244,244,232,0.32)] hover:text-[rgba(244,244,232,0.6)] hover:bg-[rgba(255,255,255,0.03)]'
              }
            `}
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" style={{ color: isConfig ? '#FF4400' : 'inherit' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7 7 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.248a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a7 7 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a7 7 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a7 7 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Configurações
          </Link>
        </div>
      )}
    </nav>
  );
}
