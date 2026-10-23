// Line icons for the power cards (24 x 24 viewBox, stroked), shared by the
// flat cards (inline SVG) and the 3D cards (canvas Path2D). Placeholder art.

import { POWERS } from '../rules/index.js';

/** A heart centred on (cx, cy), about 12 * s wide. */
function heart(cx, cy, s) {
  const p = (x, y) => `${(cx + x * s).toFixed(2)} ${(cy + y * s).toFixed(2)}`;
  return `M${p(0, 4.5)}C${p(-6, 1)} ${p(-5, -5)} ${p(0, -2.5)}C${p(5, -5)} ${p(6, 1)} ${p(0, 4.5)}Z`;
}

const circle = (cx, cy, r) => `M${cx + r} ${cy}a${r} ${r} 0 1 1 ${-2 * r} 0a${r} ${r} 0 1 1 ${2 * r} 0`;

export const POWER_ICONS = {
  // A tower struck by lightning.
  [POWERS.TOWER]: [
    'M7 21V10L6 8V4h2v2h2V4h2v2h2V4h2v4l-1 2v11z',
    'M10.5 21v-4h3v4',
    'M19.5 1.5 16.8 6h2.4L16.5 10.5',
  ],
  // Hanging upside down from a beam: legs up, head down.
  [POWERS.HANGED_MAN]: [
    'M4 3h16',
    'M12 3v3',
    'M12 6v8',
    'M12 6l3.5 2.5-2 2.5',
    'M12 14l-3 2.5M12 14l3 2.5',
    circle(12, 18.6, 2.2),
  ],
  // Two hearts.
  [POWERS.LOVERS]: [heart(9.5, 13.5, 1), heart(15.5, 9, 0.75)],
  // Horned head.
  [POWERS.DEVIL]: [
    'M6.5 3.5c-.5 3.5.8 6 3.2 7M17.5 3.5c.5 3.5-.8 6-3.2 7',
    circle(12, 14.5, 5.5),
    'M9.3 13.2l1.7 1M14.7 13.2l-1.7 1',
    'M10 17.5c1.3.8 2.7.8 4 0',
  ],
  // A lantern with its flame.
  [POWERS.HERMIT]: [
    'M12 1.8v2.2M10 4h4',
    'M8.5 6.5h7l1 2v9l-1 2h-7l-1-2v-9z',
    'M12 16.5c-1.6-.9-1.8-3.2 0-5 1.8 1.8 1.6 4.1 0 5z',
  ],
};

/** Inline SVG for a power's icon, or '' when it has none. */
export function powerIconSvg(id, className = 'power-icon') {
  const paths = POWER_ICONS[id];
  if (!paths) return '';
  const d = paths.map((p) => `<path d="${p}"></path>`).join('');
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}
