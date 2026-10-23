import { describe, it, expect } from 'vitest';
import cfg from '../tailwind.config.js';

const c: any = (cfg as any).theme.extend.colors;
const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [foreground, background, minimum ratio, where it is used]
const PAIRS: [string, string, number, string][] = [
  [c.ink, c.bg, 4.5, 'body text on page'], [c.ink, c.surface, 4.5, 'body text on cards'], [c.navy.DEFAULT, c.bg, 4.5, 'headings'],
  [c.muted, c.bg, 4.5, 'secondary text on page'], [c.muted, c.surface, 4.5, 'secondary text on cards'], [c.muted, c.mutedbg, 4.5, 'secondary text in table headers / badges'],
  ['#FFFFFF', c.emerald.DEFAULT, 4.5, 'primary button label'], ['#FFFFFF', c.emerald.hover, 4.5, 'primary button hover'],
  [c.emerald.text, c.surface, 4.5, 'emerald links on cards'], [c.emerald.text, c.bg, 4.5, 'emerald links on page / active tab'], [c.emerald.text, c.emerald.soft, 4.5, 'emerald step numbers on soft emerald'],
  [c.emerald.hover, c.emerald.soft, 4.5, 'success badge / notice'], [c.warn.text, c.warn.bg, 4.5, 'warning badge / notice'], [c.warn.text, c.surface, 4.5, 'warning text on cards'], [c.danger.text, c.danger.bg, 4.5, 'error badge / notice'],
  ['#FFFFFF', c.danger.DEFAULT, 4.5, 'destructive button'], [c.info, '#EFF6FF', 4.5, 'info notice (blue-50)'],
  ['#FFFFFF', c.navy.DEFAULT, 4.5, 'text on navy sidebar/hero'], ['#FFFFFF', c.navy[2], 4.5, 'text on secondary navy'],
  [c.danger.text, c.surface, 4.5, 'form error text'], [c.danger.text, c.bg, 4.5, 'danger text on page'], [c.emerald.DEFAULT, c.surface, 3, 'focus ring / UI component boundary (3:1)'],
];
describe('WCAG AA contrast of the design tokens', () => {
  for (const [fg, bg, min, where] of PAIRS) it(`${where}: ${fg} on ${bg} ≥ ${min}`, () => expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min));
  for (const a of [0.6, 0.7, 0.75, 0.8]) it(`white text at ${a * 100}% opacity on navy (sidebar/hero/footer) ≥ 4.5`, () => {
    const mix = (x: number, y: number) => Math.round(x * a + y * (1 - a)), n = c.navy.DEFAULT; const rgb = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
    const blended = '#' + [1, 3, 5].map((i) => mix(255, rgb(n, i)).toString(16).padStart(2, '0')).join('');
    expect(ratio(blended, n)).toBeGreaterThanOrEqual(4.5);
  });
});
