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
          // Was #6B7280, which came out at 4.12 on the page, 3.87 on a card and
          // 3.56 on a row: below the 4.5 that normal text needs, on every
          // surface, for the colour most of the small text on this product is
          // written in. Raised along its own hue until it clears 4.5 on the
          // lightest surface, which is the least change that makes it legible.
          muted:     '#828A9C',
        },
        accent: {
          // Two blues, because one cannot do both jobs. White on #3B6EF6 is
          // 4.42, just under the line, so a button label in it failed; blue on
          // a dark card is 3.89, so a link in it failed the other way. Making
          // the fill darker fixes the label and breaks the link, and the
          // reverse. So the fill is darker, the text is lighter, and the brand
          // blue stays exactly itself wherever it is not carrying words.
          DEFAULT: '#3B6EF6',   // the mark and anything not text
          fill:    '#3566EE',   // behind white labels: white reads 4.90
          text:    '#5583F8',   // blue on dark: 4.91 on the lightest surface
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
