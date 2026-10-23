/**
 * Design tokens from the EstateFlow brief, with three AA adjustments (see tests/contrast.test.ts):
 *  - muted  #667085 -> #5F6A7D  (was 4.45:1 on #F0F3F1)
 *  - emerald.text #127560, warn.text #8A5A12, danger.text #B3303E: darker text-only variants; brand colors stay for fills/borders/focus.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F8F9F6', surface: '#FFFFFF', navy: { DEFAULT: '#142B3B', 2: '#233F50' },
        emerald: { DEFAULT: '#16856B', hover: '#116B56', soft: '#E8F5EF', text: '#127560' },
        ink: '#17212B', muted: '#5F6A7D', line: '#E4E8E5', mutedbg: '#F0F3F1',
        warn: { DEFAULT: '#B7791F', bg: '#FFF5DD', text: '#8A5A12' }, danger: { DEFAULT: '#C43D4B', bg: '#FDEBED', text: '#B3303E' }, info: '#3469B8',
      },
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { card: '14px', ctl: '10px' },
      boxShadow: { card: '0 1px 2px rgba(20,43,59,.05), 0 1px 1px rgba(20,43,59,.03)' },
    },
  },
  plugins: [],
};
