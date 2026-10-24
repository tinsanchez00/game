// Canvas-drawn textures for the 3D table: card faces and backs, discard
// minis, glyphs and text labels. In Node (tests) there is no canvas, so every
// factory returns null and the scene falls back to plain colours.
//
// Textures are redrawn once the game's fonts have loaded, since a canvas
// draws with a fallback font until then.

import * as THREE from '../../../vendor/three/three.module.js';
import { language, POWER_INFO } from '../labels.js';
import { POWER_ICONS } from '../powerIcons.js';

const COL = {
  lapisDeep: '#142147',
  lapisCard: '#1D3B8C',
  gold: '#D4AF5A',
  goldLine: 'rgba(212,175,90,0.45)',
  shell: '#EFE6CF',
  shellDim: '#D6CBAE',
  cellLine: '#B89A55',
  muted: '#B8C0D9',
  lovers: '#C2453A',
  shellBright: '#F8F1DE',
};
const DISPLAY = "700 {px}px Cinzel, 'Trajan Pro', Georgia, serif";
const BODY = "{w} {px}px 'Alegreya Sans', 'Gill Sans', 'Segoe UI', sans-serif";

const font = (tpl, px, w = 400) => tpl.replace('{px}', px).replace('{w}', w);

const cache = new Map(); // key -> { tex, ctx, w, h, draw }
const live = new Set(); // entries redrawn on font load (cached and labels)
let fontsRequested = false;
const listeners = new Set();

export function canvasAvailable() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

/** Called after textures were redrawn with the loaded fonts. */
export function onTexturesRedrawn(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function requestFonts() {
  if (fontsRequested || !document.fonts?.load) return;
  fontsRequested = true;
  Promise.all([
    document.fonts.load(font(DISPLAY, 40)),
    document.fonts.load(font(BODY, 40)),
    document.fonts.load(font(BODY, 40, 500)),
  ]).then(() => {
    for (const e of live) {
      e.ctx.clearRect(0, 0, e.w, e.h);
      e.draw(e.ctx, e.w, e.h);
      e.tex.needsUpdate = true;
    }
    for (const fn of listeners) fn();
  }).catch(() => {});
}

function makeEntry(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const entry = { tex, ctx, w, h, draw };
  live.add(entry);
  requestFonts();
  return entry;
}

function cached(key, w, h, draw) {
  if (!canvasAvailable()) return null;
  // Keyed by language too: a card drawn in one language must not be reused in the other.
  const k = `${language}|${key}`;
  let e = cache.get(k);
  if (!e) {
    e = makeEntry(w, h, draw);
    if (!e) return null;
    cache.set(k, e);
  }
  return e.tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- materials: wood, shell, lapis, felt (procedural, seeded) ------------------------

/** Small seeded generator so textures look the same on every load. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paperGrain(ctx, w, h, alpha) {
  const rand = seeded(7);
  for (let i = 0; i < (w * h) / 40; i += 1) {
    ctx.fillStyle = rand() < 0.5 ? `rgba(80,60,30,${alpha})` : `rgba(255,255,255,${alpha})`;
    ctx.fillRect(rand() * w, rand() * h, 1.5, 1.5);
  }
}

function repeating(tex, rx, ry) {
  if (!tex) return null;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  return tex;
}

/** Wood with long grain along the texture's width. */
function woodDraw({ base, dark, light, seed, rings = 70 }) {
  return (ctx, w, h) => {
    const rand = seeded(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < rings; i += 1) {
      const y0 = rand() * h;
      const amp = 2 + rand() * 9;
      const freq = (1 + rand() * 3) * (Math.PI * 2) / w;
      const phase = rand() * Math.PI * 2;
      ctx.strokeStyle = rand() < 0.6 ? dark : light;
      ctx.globalAlpha = 0.08 + rand() * 0.22;
      ctx.lineWidth = 0.6 + rand() * 2.6;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase) * amp * 0.25;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < (w * h) / 60; i += 1) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,240,210,0.04)';
      ctx.fillRect(rand() * w, rand() * h, 2 + rand() * 6, 1);
    }
  };
}

/** The table: dark walnut. */
export function tableWood() {
  return repeating(cached('wood:table', 1024, 1024, woodDraw({ base: '#3a2416', dark: '#1f120a', light: '#6b4428', seed: 11, rings: 140 })), 3, 3);
}

/** The board's box: warmer, slightly lighter wood. */
export function boardWood() {
  return repeating(cached('wood:board', 512, 512, woodDraw({ base: '#5a3820', dark: '#2e1b0e', light: '#8a5a32', seed: 23, rings: 80 })), 2, 1);
}

/** Shell inlay: cream with soft mottling and fine cracks. */
export function shellInlay() {
  return cached('shell', 256, 256, (ctx, w, h) => {
    const rand = seeded(31);
    ctx.fillStyle = COL.shell;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i += 1) {
      const r = 10 + rand() * 40;
      const x = rand() * w;
      const y = rand() * h;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rand() < 0.5 ? 'rgba(214,196,160,0.18)' : 'rgba(255,252,240,0.2)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.strokeStyle = 'rgba(150,120,80,0.18)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 6; i += 1) {
      let x = rand() * w;
      let y = rand() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k += 1) {
        x += (rand() - 0.5) * 50;
        y += (rand() - 0.5) * 50;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    paperGrain(ctx, w, h, 0.04);
  });
}

/** Lapis lazuli: deep blue, lighter veins and gold pyrite flecks. */
export function lapisInlay() {
  return cached('lapis', 256, 256, (ctx, w, h) => {
    const rand = seeded(43);
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i += 1) {
      const r = 12 + rand() * 50;
      const x = rand() * w;
      const y = rand() * h;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rand() < 0.5 ? 'rgba(10,22,70,0.45)' : 'rgba(70,100,190,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    for (let i = 0; i < 90; i += 1) {
      ctx.fillStyle = `rgba(232,196,110,${0.4 + rand() * 0.5})`;
      const s = 0.8 + rand() * 1.8;
      ctx.fillRect(rand() * w, rand() * h, s, s);
    }
  });
}

/** Campsite stone: darker sand. */
export function sandInlay() {
  return cached('sand', 256, 256, (ctx, w, h) => {
    const rand = seeded(57);
    ctx.fillStyle = '#cdbb94';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 18; i += 1) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(90,70,40,0.12)' : 'rgba(255,245,220,0.12)';
      ctx.fillRect(rand() * w, rand() * h, 1.5, 1.5);
    }
  });
}

/** Felt lining for the trays. */
export function felt() {
  return repeating(cached('felt', 256, 256, (ctx, w, h) => {
    const rand = seeded(71);
    ctx.fillStyle = '#16245a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < (w * h) / 6; i += 1) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(120,140,220,0.08)';
      ctx.fillRect(rand() * w, rand() * h, 1, 1);
    }
  }), 2, 1);
}

// --- cards (256 x 358, the 0.9 x 1.26 card ratio) ------------------------------

const CW = 256;
const CH = 358;

function face(ctx, w, h) {
  roundRect(ctx, 3, 3, w - 6, h - 6, 18);
  ctx.fillStyle = COL.shell;
  ctx.fill();
  paperGrain(ctx, w, h, 0.05);
  roundRect(ctx, 3, 3, w - 6, h - 6, 18);
  ctx.lineWidth = 8;
  ctx.strokeStyle = COL.gold;
  ctx.stroke();
}

export function cardBack() {
  return cached('back', CW, CH, (ctx, w, h) => {
    roundRect(ctx, 3, 3, w - 6, h - 6, 18);
    ctx.fillStyle = COL.lapisCard;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = COL.goldLine;
    ctx.lineWidth = 3;
    for (let d = -h; d < w + h; d += 24) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + h, h);
      ctx.moveTo(d, h);
      ctx.lineTo(d + h, 0);
      ctx.stroke();
    }
    ctx.restore();
    roundRect(ctx, 3, 3, w - 6, h - 6, 18);
    ctx.lineWidth = 8;
    ctx.strokeStyle = COL.gold;
    ctx.stroke();
  });
}

/** A number card or the Joker. */
export function cardFace(card) {
  const joker = typeof card !== 'number';
  return cached(`card:${card}`, CW, CH, (ctx, w, h) => {
    face(ctx, w, h);
    ctx.fillStyle = COL.lapisDeep;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (joker) {
      ctx.font = font(DISPLAY, 52);
      ctx.fillText('JOKER', w / 2, h / 2);
    } else {
      ctx.font = font(DISPLAY, 190);
      ctx.fillText(String(card), w / 2, h / 2 + 8);
    }
  });
}

function wrapWords(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** A power card: numeral, an art panel (placeholder) and the name. */
export function powerFace(id) {
  return cached(`power:${id}`, CW, CH, (ctx, w, h) => {
    face(ctx, w, h);
    const info = POWER_INFO[id] ?? { name: id, numeral: '' };
    ctx.fillStyle = COL.lapisDeep;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(DISPLAY, 34);
    ctx.fillText(info.numeral, w / 2, 48);
    ctx.fillStyle = COL.shellDim;
    ctx.strokeStyle = COL.cellLine;
    ctx.lineWidth = 3;
    roundRect(ctx, w * 0.16, 82, w * 0.68, 160, 8);
    ctx.fill();
    ctx.stroke();
    const icon = POWER_ICONS[id];
    if (icon) {
      ctx.save();
      const size = 128;
      ctx.translate(w / 2 - size / 2, 82 + 80 - size / 2);
      ctx.scale(size / 24, size / 24);
      ctx.strokeStyle = COL.lapisDeep;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const d of icon) ctx.stroke(new Path2D(d));
      ctx.restore();
    }
    ctx.fillStyle = COL.lapisDeep;
    ctx.font = font(DISPLAY, 30);
    const lines = wrapWords(ctx, info.name, w - 40);
    lines.forEach((l, i) => ctx.fillText(l, w / 2, 282 + (i - (lines.length - 1) / 2) * 34));
  });
}

/** A small discard card (96 x 134). */
export function miniFace(label) {
  return cached(`mini:${label}`, 96, 134, (ctx, w, h) => {
    roundRect(ctx, 2, 2, w - 4, h - 4, 6);
    ctx.fillStyle = COL.shell;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = COL.cellLine;
    ctx.stroke();
    ctx.fillStyle = COL.lapisDeep;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(DISPLAY, label.length > 1 ? 40 : 68);
    ctx.fillText(label, w / 2, h / 2 + 3);
  });
}

// --- glyphs ------------------------------------------------------------------------

const TOWER_PATH = 'M6 21V9h12v12M6 9V4h2.5v2.2h2.2V4h2.6v2.2h2.2V4H18v5M10 21v-4.5h4V21';
const HEART_PATH = 'M12 20.5s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.4c0 5.5-7.5 10.1-7.5 10.1Z';
const LOCK_PATH = 'M2 4.5h6v4.5H2zM3.5 4.5V3a1.5 1.5 0 0 1 3 0v1.5';

export function towerGlyph() {
  return cached('tower', 128, 128, (ctx, size) => {
    ctx.scale(size / 24, size / 24);
    ctx.translate(12, 12);
    ctx.scale(0.66, 0.66);
    ctx.translate(-12, -12);
    ctx.strokeStyle = COL.gold;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(TOWER_PATH));
  });
}

export function heartGlyph() {
  return cached('heart', 128, 128, (ctx, size) => {
    ctx.scale(size / 24, size / 24);
    const p = new Path2D(HEART_PATH);
    ctx.fillStyle = COL.lovers;
    ctx.fill(p);
    ctx.strokeStyle = COL.shellBright;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.stroke(p);
  });
}

export function lockGlyph() {
  return cached('lock', 64, 64, (ctx, size) => {
    ctx.scale(size / 10, size / 10);
    ctx.strokeStyle = COL.muted;
    ctx.lineWidth = 1.1;
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(LOCK_PATH));
  });
}

// --- text labels ------------------------------------------------------------------------

/**
 * A text texture that can be changed: { tex, set(text) } or null.
 * `style`: 'label' (muted body text), 'caps' (small gold capitals) or
 * 'badge' (a star and a number on a lapis pill; placeholder look).
 */
export function textLabel(style = 'label', w = style === 'badge' ? 208 : 512, h = 96) {
  if (!canvasAvailable()) return null;
  let text = '';
  // Bright text with a dark outline, readable on wood, felt or cards.
  const draw = (ctx, cw, ch) => {
    ctx.clearRect(0, 0, cw, ch);
    if (!text) return;
    if (style === 'badge') {
      drawStarBadge(ctx, cw, ch, text);
      return;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const caps = style === 'caps';
    ctx.font = caps ? font(BODY, 56, 500) : font(BODY, 62, 500);
    if ('letterSpacing' in ctx) ctx.letterSpacing = caps ? '6px' : '0px';
    const line = caps ? text.toUpperCase() : text;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(12,10,8,0.85)';
    ctx.strokeText(line, cw / 2, ch / 2 + 2);
    ctx.fillStyle = caps ? COL.gold : COL.shellBright;
    ctx.fillText(line, cw / 2, ch / 2 + 2);
  };
  const entry = makeEntry(w, h, draw);
  if (!entry) return null;
  return {
    tex: entry.tex,
    aspect: w / h,
    set(next) {
      if (next === text) return;
      text = next;
      entry.ctx.clearRect(0, 0, w, h);
      draw(entry.ctx, w, h);
      entry.tex.needsUpdate = true;
    },
    dispose() {
      live.delete(entry);
      entry.tex.dispose();
    },
  };
}

const STAR = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z';

function drawStarBadge(ctx, cw, ch, text) {
  const pad = 6;
  ctx.fillStyle = COL.lapisDeep;
  ctx.strokeStyle = COL.gold;
  ctx.lineWidth = 6;
  roundRect(ctx, pad, pad, cw - 2 * pad, ch - 2 * pad, (ch - 2 * pad) / 2);
  ctx.fill();
  ctx.stroke();
  const s = (ch - 2 * pad) * 0.62;
  ctx.save();
  ctx.translate(cw * 0.3 - s / 2, ch / 2 - s / 2);
  ctx.scale(s / 24, s / 24);
  ctx.fillStyle = COL.gold;
  if (typeof Path2D !== 'undefined') ctx.fill(new Path2D(STAR));
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font(BODY, 58, 700);
  ctx.fillStyle = COL.shellBright;
  ctx.fillText(text, cw * 0.64, ch / 2 + 2);
}

/** The star-cost badge for an upside-down card (placeholder look). */
export function starCost(n) {
  return cached(`cost:${n}`, 208, 96, (ctx, cw, ch) => {
    ctx.clearRect(0, 0, cw, ch);
    drawStarBadge(ctx, cw, ch, String(n));
  });
}

function outlined(ctx, text, x, y, fill) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(12,10,8,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Caption texture size (see sideCaption). */
export const CAPTION = Object.freeze({ w: 512, h: 224 });

/** A title over a note of up to two lines, centred: the caption under a side of the held power. */
export function sideCaption(title, note) {
  return cached(`caption:${title}|${note}`, CAPTION.w, CAPTION.h, (ctx, cw, ch) => {
    ctx.clearRect(0, 0, cw, ch);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(DISPLAY, 52);
    outlined(ctx, title, cw / 2, 42, COL.gold);
    ctx.font = font(BODY, 38, 500);
    const lines = [];
    let line = '';
    for (const word of note.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > cw * 0.94) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    lines.slice(0, 3).forEach((l, i) => outlined(ctx, l, cw / 2, 108 + i * 46, COL.shellBright));
  });
}

/** One line of display text, centred (the heading over the side picker). */
export function headingText(text) {
  return cached(`heading:${text}`, 1024, 96, (ctx, cw, ch) => {
    ctx.clearRect(0, 0, cw, ch);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(DISPLAY, 60);
    outlined(ctx, text, cw / 2, ch / 2 + 2, COL.gold);
  });
}

// --- glow halos ------------------------------------------------------------------------

/**
 * A soft white glow ring for a w x d target, on a plane `margin` larger on
 * every side (tinted by the material colour).
 */
export function glowRing(w, d, margin) {
  const W = w + 2 * margin;
  const D = d + 2 * margin;
  const cw = 256;
  const ch = Math.max(32, Math.round((cw * D) / W));
  const key = `glow:${w.toFixed(2)}x${d.toFixed(2)}+${margin.toFixed(2)}`;
  return cached(key, cw, ch, (ctx) => {
    const px = cw / W;
    const inset = margin * px;
    ctx.clearRect(0, 0, cw, ch);
    ctx.shadowColor = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    for (const [blur, width, alpha] of [[inset * 0.9, inset * 0.18, 0.55], [inset * 0.45, inset * 0.12, 0.9]]) {
      ctx.shadowBlur = blur;
      ctx.lineWidth = width;
      ctx.globalAlpha = alpha;
      roundRect(ctx, inset, inset, cw - 2 * inset, ch - 2 * inset, Math.min(cw, ch) * 0.06);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}
