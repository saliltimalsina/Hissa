/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Scaffold only — class-based dark mode is wired up but the app ships light.
  // The page-migration pass can later add `dark:` variants against these tokens.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Brand ────────────────────────────────────────────────────────────
        brand: {
          DEFAULT: '#5B4DFF',
          hover: '#4C3FF0',
          // Tints used today as bg-[#F4F3FF] / [#5B4DFF]/10 etc.
          tint: '#F4F3FF',
          subtle: '#FAFAFF',
        },

        // ── Text / ink ───────────────────────────────────────────────────────
        ink: '#111827', // primary text
        body: '#374151', // secondary body text
        muted: '#6B7280', // muted/label text
        faint: '#9CA3AF', // faint/placeholder text

        // ── Surfaces & lines ─────────────────────────────────────────────────
        surface: '#F7F8FC', // app background
        card: '#FFFFFF', // card background
        line: '#ECECF2', // primary hairline border
        'line-soft': '#F4F4F8', // softer divider (e.g. table rows)
        border: '#D1D5DB', // input/control border

        // ── Status: success ──────────────────────────────────────────────────
        success: {
          DEFAULT: '#1F9D55',
          bg: '#EAFBF1',
        },

        // ── Status: warning ──────────────────────────────────────────────────
        warn: {
          DEFAULT: '#F59E0B',
          fg: '#92400E', // text-on-warning used in pills/cards
          bg: '#FEF6E0',
        },

        // ── Status: danger ───────────────────────────────────────────────────
        danger: {
          DEFAULT: '#EF4444',
          fg: '#B91C1C', // darker danger text used in pills/cards
          bg: '#FEE7E7',
        },

        // ── Status: info (uses brand hue) ────────────────────────────────────
        info: {
          DEFAULT: '#5B4DFF',
          bg: '#F4F3FF',
        },
      },
    },
  },
  plugins: [],
}
