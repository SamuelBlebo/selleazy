/** @type {import('tailwindcss').Config} */
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Values live in src/index.css.
      colors: {
        canvas: c('canvas'),
        surface: c('surface'),
        raised: c('raised'),
        line: c('line'),
        line2: c('line2'),
        ink: c('ink'),
        muted: c('muted'),
        chat: c('chat'),
        brand: { DEFAULT: c('brand'), 2: c('brand2'), soft: c('brand-soft'), ink: c('brand-ink'), on: c('on-brand'), dim: c('on-brand-dim') },
        accent: { DEFAULT: c('accent'), soft: c('accent-soft'), ink: c('accent-ink') },
        ok: { DEFAULT: c('ok'), soft: c('ok-soft'), ink: c('ok-ink') },
        danger: { DEFAULT: c('danger'), soft: c('danger-soft') },
        // Older names some ported pages use.
        warn: c('accent-ink'),
        info: c('brand'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        cap: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'Cascadia Mono', 'Consolas', 'monospace'],
      },
      borderRadius: { xl: '0.625rem', '2xl': '0.75rem' },
      boxShadow: {
        card: '0 1px 2px rgb(16 24 40 / 0.04), 0 1px 3px rgb(16 24 40 / 0.06)',
        pop: '0 12px 32px -8px rgb(16 24 40 / 0.18)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in': { from: { opacity: '0', transform: 'translateX(32px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-in': 'slide-in 280ms cubic-bezier(.16,1,.3,1)',
      },
    },
  },
  plugins: [],
};
