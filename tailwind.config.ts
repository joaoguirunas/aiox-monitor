import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ═══════════════════════════════════════════════════════════════════
      // REVOS Design System — Brandbook v2.0 Dark Cockpit
      // Primary override: #FF4400 (Growth Sales) replaces #D1FF00 (Lime)
      // ═══════════════════════════════════════════════════════════════════

      colors: {
        // ── Surfaces (depth system) ────────────────────────────────────
        surface: {
          0: '#050505',       // background / void
          1: '#0A0A0A',       // base bg
          2: '#0F0F11',       // card / --bb-surface
          3: '#161618',       // secondary / --bb-surface-alt (neutral)
          4: '#242424',       // elevated
          5: '#3D3D3D',       // --bb-gray-charcoal
        },
        // ── Borders ────────────────────────────────────────────────────
        border: {
          DEFAULT: 'rgba(156,156,156,0.15)',     // --bb-border
          hover: 'rgba(156,156,156,0.24)',        // --bb-border-hover
          strong: '#3D3D3D',                      // --bb-gray-charcoal
          accent: 'rgba(255,68,0,0.15)',          // brand accent
        },
        // ── Text hierarchy ─────────────────────────────────────────────
        'text-primary': '#F4F4E8',               // --bb-cream
        'text-secondary': 'rgba(244,244,232,0.7)',
        'text-tertiary': 'rgba(244,244,232,0.55)',
        'text-muted': 'rgba(244,244,232,0.4)',   // --bb-dim
        // ── Gray scale ─────────────────────────────────────────────────
        gray: {
          charcoal: '#3D3D3D',
          dim: '#696969',
          muted: '#999999',
          silver: '#BDBDBD',
          light: '#C2C2C2',
        },
        // ── Brand accent — Growth Sales Orange ─────────────────────────
        accent: {
          orange: '#FF4400',                      // PRIMARY
          'orange-light': '#FF6B35',
          'orange-dim': 'rgba(255,68,0,0.15)',
          blue: '#0099FF',                        // --bb-blue
          violet: '#8B5CF6',
          cyan: '#06B6D4',
          emerald: '#34d399',
          amber: '#f59e0b',                       // --bb-warning
          rose: '#EF4444',                        // --bb-error
        },
        // ── Semantic ───────────────────────────────────────────────────
        brand: '#FF4400',
        success: '#34d399',
        warning: '#f59e0b',
        error: '#EF4444',
        info: '#0099FF',
        destructive: '#EF4444',
        // ── Agent palette ──────────────────────────────────────────────
        agent: {
          dev: '#FF4400',
          qa: '#34d399',
          architect: '#8B5CF6',
          pm: '#0099FF',
          sm: '#06B6D4',
          po: '#f59e0b',
          analyst: '#818cf8',
          devops: '#EF4444',
          data: '#f472b6',
          ux: '#e879f9',
          master: '#FF4400',
        },
        // ── Chart palette ──────────────────────────────────────────────
        chart: {
          1: '#FF4400',
          2: '#0099FF',
          3: '#34d399',
          4: '#f59e0b',
          5: '#8B5CF6',
          6: '#06B6D4',
        },
      },

      // ── Typography ───────────────────────────────────────────────────
      // Brandbook: Geist (sans), TASA Orbiter 800 (display), Roboto Mono 500 (mono)
      fontFamily: {
        sans: ['var(--font-geist)', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['var(--font-geist)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-roboto-mono)', 'Menlo', 'Monaco', 'monospace'],
      },
      // Brandbook type scale
      fontSize: {
        'micro':   ['0.6rem',   { lineHeight: '1',   letterSpacing: '0.12em' }],    // footer/meta/refs
        'label':   ['0.65rem',  { lineHeight: '1.2', letterSpacing: '0.1em' }],     // HUD/nav/status
        '2xs':     ['0.6875rem',{ lineHeight: '1.3' }],                              // 11px
        'xs':      ['0.75rem',  { lineHeight: '1.4' }],                              // 12px
        'sm':      ['0.8rem',   { lineHeight: '1.4' }],                              // small/secondary
        'body':    ['1rem',     { lineHeight: '1.5' }],                              // primary text
        'h2':      ['1.5rem',   { lineHeight: '1.2', letterSpacing: '-0.02em' }],   // section title
        'h1':      ['2.5rem',   { lineHeight: '1.1', letterSpacing: '-0.03em' }],   // page title
        'display': ['4rem',     { lineHeight: '1',   letterSpacing: '-0.03em' }],   // hero display
      },

      // Spacing: uses Tailwind defaults (4px grid) — compatible with brandbook.
      // Brandbook --space-N tokens are available via CSS vars in globals.css.

      // ── Border radius — Brandbook: 0.5rem base ──────────────────────
      borderRadius: {
        'none': '0px',
        'sm':   '2px',
        'md':   '0.25rem',
        'DEFAULT': '0.5rem', // brandbook base
        'lg':   '0.5rem',
        'xl':   '0.75rem',
        '2xl':  '1rem',
        'full': '9999px',
      },

      // ── Z-Index — Brandbook layer stack ──────────────────────────────
      zIndex: {
        'nav':      '100',
        'dropdown': '200',
        'overlay':  '300',
        'modal':    '400',
        'toast':    '500',
      },

      // ── Shadows — brand orange glow ──────────────────────────────────
      boxShadow: {
        'glow-sm':    '0 0 8px -2px rgba(255,68,0,0.25)',
        'glow':       '0 0 16px -4px rgba(255,68,0,0.20)',
        'glow-lg':    '0 0 32px -8px rgba(255,68,0,0.18)',
        'glow-brand': '0 0 20px rgba(255,68,0,0.12), 0 0 60px rgba(255,68,0,0.04)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.04)',
        'card':       '0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px rgba(156,156,156,0.08)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,68,0,0.12)',
        'dropdown':   '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(156,156,156,0.1)',
        'drawer':     '-8px 0 32px rgba(0,0,0,0.5)',
        'focus-ring': '0 0 0 2px #050505, 0 0 0 4px rgba(255,68,0,0.5)',
      },

      // ── Transitions — Brandbook easing ───────────────────────────────
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        'decel':  'cubic-bezier(0, 0, 0.2, 1)',
        'accel':  'cubic-bezier(0.4, 0, 1, 1)',
        'expo':   'cubic-bezier(0.16, 1, 0.3, 1)',
      },

      // ── Screens — Brandbook breakpoints ──────────────────────────────
      screens: {
        'mobile':  { max: '767px' },  // --bp-mobile
        'tablet':  '768px',           // --bp-tablet
        'desktop': '1200px',          // --bp-desktop
      },

      // ── Animations ───────────────────────────────────────────────────
      animation: {
        'shimmer':          'shimmer 2s infinite linear',
        'slide-in-right':   'slideInRight 250ms cubic-bezier(0.16,1,0.3,1)',
        'slide-in-down':    'slideInDown 300ms cubic-bezier(0.16,1,0.3,1)',
        'slide-in-up':      'slideInUp 300ms cubic-bezier(0.16,1,0.3,1)',
        'fade-in':          'fadeIn 200ms ease-out',
        'fade-in-up':       'fadeInUp 300ms cubic-bezier(0.16,1,0.3,1)',
        'status-pulse':     'statusPulse 2s infinite ease-in-out',
        'orbital':          'orbital 3s infinite ease-in-out',
        'card-flash':       'cardFlash 600ms ease-out',
        'logo-spin':        'logoSpin 8s infinite linear',
        'logo-spin-reverse':'logoSpinReverse 12s infinite linear',
        'logo-pulse':       'logoPulse 3s infinite ease-in-out',
        'logo-shimmer':     'logoShimmer 4s infinite linear',
        'pulse-brand':      'pulseBrand 2s infinite ease-in-out',
        'scanline':         'scanlineSweep 4s infinite linear',
        'spin-slow':        'bbSpin 2s infinite linear',
        'progress-fill':    'progressFill 1s ease-out forwards',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        slideInRight: {
          from: { transform: 'translateX(100%)', opacity: '0.9' },
          to:   { transform: 'translateX(0)', opacity: '1' },
        },
        slideInDown: {
          from: { transform: 'translateY(-8px)', opacity: '0' },
          to:   { transform: 'translateY(0)', opacity: '1' },
        },
        slideInUp: {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to:   { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        statusPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255,68,0,0.4)' },
          '50%':      { boxShadow: '0 0 0 6px rgba(255,68,0,0)' },
        },
        orbital: {
          '0%, 100%': { boxShadow: '0 0 4px rgba(255,68,0,0.5)' },
          '50%':      { boxShadow: '0 0 12px rgba(255,68,0,0.3), 0 0 24px rgba(255,68,0,0.1)' },
        },
        cardFlash: {
          '0%':   { boxShadow: '0 0 0 0 rgba(255,68,0,0.5)' },
          '70%':  { boxShadow: '0 0 0 8px rgba(255,68,0,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(255,68,0,0)' },
        },
        logoSpin:        { from: { transform: 'rotate(0deg)' },   to: { transform: 'rotate(360deg)' } },
        logoSpinReverse: { from: { transform: 'rotate(360deg)' }, to: { transform: 'rotate(0deg)' } },
        logoPulse: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%':      { opacity: '1', transform: 'scale(1.15)' },
        },
        logoShimmer: {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        pulseBrand: {
          '0%, 100%': { opacity: '0.6' },
          '50%':      { opacity: '1' },
        },
        scanlineSweep: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        bbSpin: {
          from: { transform: 'rotate(0deg)' },
          to:   { transform: 'rotate(360deg)' },
        },
        progressFill: {
          from: { width: '0%' },
          to:   { width: 'var(--progress, 100%)' },
        },
      },

      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};

export default config;
