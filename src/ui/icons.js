// Inline SVG markup for units and board marks.

const HELMET =
  'M12 6.5c-3.8 0-6.3 2.7-6.3 6.4V18c0 .8.6 1.5 1.4 1.5h2.3l.9-3.2h3.4l.9 3.2h2.3c.8 0 1.4-.7 1.4-1.5v-5.1c0-3.7-2.5-6.4-6.3-6.4Zm-3.1 6.2h6.2v2.2H8.9z';
const CROWN =
  'M6.6 9.3 6.2 3.4l3 2.6L12 2.2l2.8 3.8 3-2.6-.4 5.9C16.2 7.6 14.3 6.8 12 6.8s-4.2.8-5.4 2.5Z';
const TOWER = 'M6 21V9h12v12M6 9V4h2.5v2.2h2.2V4h2.6v2.2h2.2V4H18v5M10 21v-4.5h4V21';

export const TEAM_CLASS = ['gold', 'obsidian', 'carnelian', 'pearl'];

export function unitIcon(unit, extraClass = '') {
  const crown = unit.type === 'commander' ? `<path d="${CROWN}"></path>` : '';
  return `<svg class="unit ${TEAM_CLASS[unit.player]} ${extraClass}" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${HELMET}"></path>${crown}</svg>`;
}

export function towerGlyph() {
  return `<svg class="tower-glyph" viewBox="0 0 24 24" fill="none" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="${TOWER}"></path></svg>`;
}

const STONES = [[19.5, 12], [17.3, 17.3], [12, 19.5], [6.7, 17.3], [4.5, 12], [6.7, 6.7], [12, 4.5], [17.3, 6.7]]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.7"></circle>`).join('');

/** Campsite: a ring of stones. */
export function campsiteGlyph() {
  return `<svg class="camp-glyph" viewBox="0 0 24 24" aria-hidden="true">${STONES}</svg>`;
}

export function lockIcon() {
  return '<svg class="lock" viewBox="0 0 10 10" fill="none" stroke-width="1.3" aria-hidden="true"><rect x="2" y="4.5" width="6" height="4.5" rx="1"></rect><path d="M3.5 4.5V3a1.5 1.5 0 0 1 3 0v1.5"></path></svg>';
}

/** The Lovers' jump mark. */
export function heartIcon() {
  return '<svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.4c0 5.5-7.5 10.1-7.5 10.1Z"></path></svg>';
}
