/**
 * STARS design system — token layer (UI Phase 1).
 *
 * One source of truth for the visual language:
 * - primary:  indigo brand scale (navigation actions, links, focus)
 * - state:    semantic safety states, used consistently everywhere:
 *               ok     = SAFE / verified / healthy
 *               warn   = MODERATE / caution / degraded
 *               danger = RISKY / CRITICAL / hazardous
 *               info   = informational / simulation / estimates
 *               neutral= no data / disabled / inactive
 * - radius:   card = 12px, control = 8px, pill = full
 * - shadow:   subtle elevation only (no glow, no glass)
 *
 * Components consume these via the shared classes in src/index.css
 * (.stars-card, .stars-btn, .stars-badge, …) instead of re-inventing
 * styles per panel.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  darkMode: "class", // theme is driven by the `dark` class on <html>, toggled in the header
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        // Semantic safety states (see header comment)
        state: {
          ok: {
            DEFAULT: '#15803d',
            soft: '#f0fdf4',
            line: '#bbf7d0',
            text: '#166534',
            dark: '#4ade80',
            darkSoft: 'rgba(20, 83, 45, 0.35)',
            darkLine: '#166534',
            darkText: '#bbf7d0',
          },
          warn: {
            DEFAULT: '#b45309',
            soft: '#fffbeb',
            line: '#fde68a',
            text: '#92400e',
            dark: '#fbbf24',
            darkSoft: 'rgba(120, 53, 15, 0.35)',
            darkLine: '#92400e',
            darkText: '#fde68a',
          },
          danger: {
            DEFAULT: '#b91c1c',
            soft: '#fef2f2',
            line: '#fecaca',
            text: '#991b1b',
            dark: '#f87171',
            darkSoft: 'rgba(127, 29, 29, 0.35)',
            darkLine: '#991b1b',
            darkText: '#fecaca',
          },
          info: {
            DEFAULT: '#1d4ed8',
            soft: '#eff6ff',
            line: '#bfdbfe',
            text: '#1e40af',
            dark: '#60a5fa',
            darkSoft: 'rgba(30, 58, 138, 0.35)',
            darkLine: '#1e40af',
            darkText: '#bfdbfe',
          },
          neutral: {
            DEFAULT: '#4b5563',
            soft: '#f9fafb',
            line: '#e5e7eb',
            text: '#374151',
            dark: '#9ca3af',
            darkSoft: 'rgba(55, 65, 81, 0.4)',
            darkLine: '#374151',
            darkText: '#d1d5db',
          },
        },
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.08)',
        pop: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.08)',
        modal: '0 10px 25px -5px rgb(0 0 0 / 0.15), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      },
      borderRadius: {
        card: '0.75rem', // 12px — cards & panels
        control: '0.5rem', // 8px — buttons, inputs, chips
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [],
};
