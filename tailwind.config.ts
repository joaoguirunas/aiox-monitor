import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Surface layers (depth system)
        surface: {
          0: '#0c0e14',
          1: '#12141c',
          2: '#181b25',
          3: '#1f2330',
          4: '#272b3b',
        },
        // Borders
        border: {
          DEFAULT: '#1c2033',
          hover: '#2a3050',
          accent: 'rgba(99,102,241,0.15)',
        },
        // Text hierarchy
        'text-primary': '#eef2ff',
        'text-secondary': '#8892b0',
        'text-muted': '#4a5272',
        // Accents
        accent: {
          blue: '#6366f1',
          violet: '#8b5cf6',
          cyan: '#22d3ee',
          emerald: '#34d399',
          amber: '#fbbf24',
          rose: '#fb7185',
        },
        // Agent palette (refined, harmonized)
        agent: {
          dev: '#6366f1',
          qa: '#34d399',
          architect: '#a78bfa',
          pm: '#fb923c',
          sm: '#22d3ee',
          po: '#fbbf24',
          analyst: '#818cf8',
          devops: '#f87171',
          data: '#f472b6',
          ux: '#e879f9',
          master: '#fbbf24',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-space-grotesk)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        'xl': '0.875rem',
        '2xl': '1rem',
      },
      boxShadow: {
        'glow-sm': '0 0 8px -2px rgba(99,102,241,0.3)',
        'glow': '0 0 16px -4px rgba(99,102,241,0.25)',
        'glow-lg': '0 0 32px -8px rgba(99,102,241,0.2)',
        'card': '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3)',
        'drawer': '-8px 0 32px rgba(0,0,0,0.5)',
      },
      animation: {
        'shimmer': 'shimmer 2s infinite linear',
        'slide-in-right': 'slideInRight 250ms cubic-bezier(0.16,1,0.3,1)',
        'slide-in-down': 'slideInDown 300ms cubic-bezier(0.16,1,0.3,1)',
        'fade-in': 'fadeIn 200ms ease-out',
        'status-pulse': 'statusPulse 2s infinite ease-in-out',
        'orbital': 'orbital 3s infinite ease-in-out',
        'card-flash': 'cardFlash 600ms ease-out',
        'logo-spin': 'logoSpin 8s infinite linear',
        'logo-spin-reverse': 'logoSpinReverse 12s infinite linear',
        'logo-pulse': 'logoPulse 3s infinite ease-in-out',
        'logo-shimmer': 'logoShimmer 4s infinite linear',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        slideInRight: {
          from: { transform: 'translateX(100%)', opacity: '0.9' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        slideInDown: {
          from: { transform: 'translateY(-6px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        statusPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(52,211,153,0.4)' },
          '50%': { boxShadow: '0 0 0 5px rgba(52,211,153,0)' },
        },
        orbital: {
          '0%, 100%': { boxShadow: '0 0 4px rgba(99,102,241,0.6)' },
          '50%': { boxShadow: '0 0 12px rgba(99,102,241,0.4), 0 0 24px rgba(99,102,241,0.15)' },
        },
        cardFlash: {
          '0%': { boxShadow: '0 0 0 0 rgba(99,102,241,0.5)' },
          '70%': { boxShadow: '0 0 0 8px rgba(99,102,241,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(99,102,241,0)' },
        },
        logoSpin: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        logoSpinReverse: {
          from: { transform: 'rotate(360deg)' },
          to: { transform: 'rotate(0deg)' },
        },
        logoPulse: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.15)' },
        },
        logoShimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
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
