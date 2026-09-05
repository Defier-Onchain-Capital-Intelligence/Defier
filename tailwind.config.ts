import type { Config } from 'tailwindcss'

/**
 * Design system: premium fintech, dark.
 *
 * Derived from the mockups in ../diseno/ui_referencia_v1.png. Three rules the
 * mockups get right and this file exists to enforce:
 *
 *   1. Hierarchy comes from size, not colour. The number that matters is large;
 *      everything supporting it is grey. Colouring things to make them important
 *      is what makes a screen shout.
 *   2. Green and red mean sign, never decoration. If a number is not a gain or a
 *      loss, it is not green or red.
 *   3. The accent is reserved for actions. The moment blue starts decorating,
 *      it stops meaning "you can press this".
 *
 * Surfaces step up from the background rather than being outlined. Borders are
 * hairlines that separate, not frames that contain.
 */
const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base:     '#08090C',  // page
          surface:  '#101218',  // cards, one step up
          elevated: '#181B23',  // rows, active tabs, inputs
          border:   '#23262F',  // hairlines
        },
        ink: {
          primary:   '#F7F8FA',
          secondary: '#A2A9B8',
          muted:     '#6B7280',
        },
        accent: {
          DEFAULT: '#3B6EF6',   // Base blue, actions only
          soft:    '#16203A',
          dim:     '#2E58D0',
        },
        gain:  { DEFAULT: '#34D399', soft: '#0F2A22' },
        loss:  { DEFAULT: '#F87171', soft: '#2A1416' },
        warn:  { DEFAULT: '#FBBF24', soft: '#2A2110' },
        stock: { DEFAULT: '#A78BFA', soft: '#1E1832' },  // tokenized stocks
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        hero:  ['2.75rem', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '600' }],
        kpi:   ['1.5rem',  { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '600' }],
        micro: ['0.6875rem', { lineHeight: '1.3', letterSpacing: '0.04em' }],
      },
      borderRadius: { xl2: '1.125rem' },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.35)',
      },
      maxWidth: { app: '30rem' },   // mobile first: the app is a column
    },
  },
  plugins: [],
}

export default config
