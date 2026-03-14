'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectionStatus } from '@/components/shared/ConnectionStatus';
import { ProjectSelector } from '@/components/shared/ProjectSelector';

const LINKS = [
  { href: '/kanban', label: 'Kanban' },
  { href: '/lista', label: 'Lista' },
  { href: '/empresa', label: 'Empresa' },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800">
      <div className="flex items-center gap-6">
        <span className="text-sm font-bold text-gray-100 tracking-tight">
          aiox-monitor
        </span>
        <div className="flex items-center gap-1">
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
        <ProjectSelector />
        <ConnectionStatus />
      </div>
    </nav>
  );
}
