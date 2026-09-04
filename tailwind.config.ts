import type { Config } from 'tailwindcss'

/**
 * Design system: premium fintech. Light-first, lots of white space, sober
 * positive/negative states, no neon, no terminal aesthetic.
 * Base brand blue is used sparingly as the single accent.
 */
const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          base:     '#FAFAF9',  // page background (warm off-white)
          surface:  '#FFFFFF',  // cards
          elevated: '#F4F4F5',  // secondary surfaces, table headers
          border:   '#E7E5E4',  // hairlines
        },
        ink: {
          primary:   '#111827',
          secondary: '#4B5563',
          muted:     '#9CA3AF',
        },
        accent: {
          DEFAULT: '#0052FF',   // Base blue
          soft:    '#E8EEFF',
          dim:     '#0041CC',
        },
        gain:  { DEFAULT: '#12805C', soft: '#E6F4EE' },
        loss:  { DEFAULT: '#C2410C', soft: '#FDECE4' },
        warn:  { DEFAULT: '#B45309', soft: '#FDF3E1' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        hero: ['3rem', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '600' }],
        kpi:  ['1.75rem', { lineHeight: '1.1', letterSpacing: '-0.01em', fontWeight: '600' }],
      },
      borderRadius: { xl2: '1.25rem' },
      boxShadow: { card: '0 1px 2px rgba(17,24,39,0.04), 0 4px 16px rgba(17,24,39,0.04)' },
    },
  },
  plugins: [],
}

export default config
