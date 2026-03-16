import Link from 'next/link';

export function Logo() {
  return (
    <Link href="/kanban" className="flex items-center gap-2.5 group">
      {/* Animated Mark */}
      <div className="relative w-[22px] h-[22px] flex-shrink-0">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="absolute inset-0">
          {/* Background rounded square */}
          <rect
            x="1" y="1" width="20" height="20" rx="6"
            className="fill-accent-blue/[0.07]"
          />

          {/* Outer orbital ring — slow spin */}
          <g className="origin-center animate-logo-spin" style={{ transformOrigin: '11px 11px' }}>
            <circle
              cx="11" cy="11" r="8"
              fill="none"
              stroke="url(#logo-gradient-outer)"
              strokeWidth="1"
              strokeDasharray="6 4"
              strokeLinecap="round"
              opacity="0.6"
            />
          </g>

          {/* Inner orbital ring — reverse spin */}
          <g className="origin-center animate-logo-spin-reverse" style={{ transformOrigin: '11px 11px' }}>
            <circle
              cx="11" cy="11" r="5.5"
              fill="none"
              stroke="url(#logo-gradient-inner)"
              strokeWidth="0.8"
              strokeDasharray="3 5"
              strokeLinecap="round"
              opacity="0.45"
            />
          </g>

          {/* Center dot — pulsing glow */}
          <circle
            cx="11" cy="11" r="2.5"
            className="fill-accent-blue animate-logo-pulse"
            style={{ transformOrigin: '11px 11px' }}
          />

          {/* Tiny accent particles */}
          <g className="animate-logo-spin" style={{ transformOrigin: '11px 11px' }}>
            <circle cx="11" cy="3.5" r="0.8" className="fill-accent-violet" opacity="0.7" />
          </g>
          <g className="animate-logo-spin-reverse" style={{ transformOrigin: '11px 11px' }}>
            <circle cx="18" cy="11" r="0.6" className="fill-accent-cyan" opacity="0.5" />
          </g>

          {/* Gradient defs */}
          <defs>
            <linearGradient id="logo-gradient-outer" x1="3" y1="3" x2="19" y2="19">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
            <linearGradient id="logo-gradient-inner" x1="19" y1="3" x2="3" y2="19">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Wordmark with shimmer across full text */}
      <span className="font-display text-[14px] tracking-tight inline-flex items-baseline">
        <span
          className="font-semibold bg-clip-text text-transparent animate-logo-shimmer"
          style={{
            backgroundImage: 'linear-gradient(90deg, #eef2ff 0%, #eef2ff 35%, #6366f1 45%, #8b5cf6 50%, #6366f1 55%, #eef2ff 65%, #eef2ff 100%)',
            backgroundSize: '200% auto',
          }}
        >
          aiox
        </span>
        <span
          className="font-normal ml-0.5 bg-clip-text text-transparent animate-logo-shimmer"
          style={{
            backgroundImage: 'linear-gradient(90deg, #4a5272 0%, #4a5272 35%, #6366f1 45%, #8b5cf6 50%, #6366f1 55%, #4a5272 65%, #4a5272 100%)',
            backgroundSize: '200% auto',
            animationDelay: '0.3s',
          }}
        >
          monitor
        </span>
      </span>
    </Link>
  );
}
