// Ansicht von der Straße für die eigenen Bauweisen (site/styles.js), fürs README-Banner.
// Was sich mit der Uhrzeit ändert (z. B. die Jetzt-Linie), bleibt hier weg, damit das
// Banner nicht bei jedem Lauf der Action neu committet wird.
import { FLOOR_H, rng, EFFIZIENZ, SWATCHES, mapLayerCount, renditeSteps } from '../site/house.mjs';

const n1 = (v) => +v.toFixed(1);
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" fill="${fill}"${extra}/>`;
const stroke = (c, w = 1) => ` stroke="${c}" stroke-width="${w}"`;
const EFF_COLORS = ['#b5603d', '#c27440', '#c8913a', '#d6c445', '#9bb24a', '#5e9a4f', '#3b8455'];

/** Meter, die rechts neben dem Haus gezeichnet werden (Treppe, Bäume, Technik). */
export function styleSideExtra(h) {
  if (h.floors === 0) return 0;
  if (h.style === 'swiss') return 4.2;
  if (h.style === 'treppe') return h.floors > 1 ? 1.6 : 0;
  if (h.style === 'passivhaus') return (h.level ?? 0) >= 3 ? 2.2 : 0;
  return 0;
}

// Fensterraster wie bei den normalen Häusern
function grid(h, x, groundY, s, { fill = '#33414e', line = null, lw = 1, ww = 1.1, wh = 1.4, xs, floors = h.floors, skipDoor = true } = {}) {
  const W = h.width, out = [];
  const cols = Math.max(2, Math.floor((W - 1) / 2));
  const list = xs ?? Array.from({ length: cols }, (_, c) => (W * (c + 0.5)) / cols);
  for (let f = 0; f < floors; f++) {
    for (const cx of list) {
      if (f === 0 && skipDoor && Math.abs(cx - W / 2) < 1.2) continue;
      const wy = groundY - f * FLOOR_H * s - 1.0 * s - wh * s;
      out.push(rect(x + (cx - ww / 2) * s, wy, ww * s, wh * s, fill, line ? stroke(line, lw) : ''));
    }
  }
  return out.join('');
}
const door = (x, w, groundY, s, fill = '#6b4f3a') => rect(x + w / 2 - 0.55 * s, groundY - 2.2 * s, 1.1 * s, 2.2 * s, fill);
const floorLines = (h, x, w, groundY, s, color, t = 0.8) => {
  const out = [];
  for (let f = 1; f < h.floors; f++) out.push(rect(x, groundY - f * FLOOR_H * s - t / 2, w, t, color));
  return out.join('');
};

export function styleSvg(p, x, groundY, s, kit) {
  const h = p.house;
  const W = h.width, w = W * s, H = h.floors * FLOOR_H, y0 = groundY - H * s;
  const out = [];
  let top = y0;
  const slab = (fill, line, over = 0.2, t = 0.3) => {
    out.push(rect(x - over * s, y0 - t * s, w + 2 * over * s, t * s, fill, line ? stroke(line, 1) : ''));
    top = Math.min(top, y0 - t * s);
  };

  switch (h.style) {
    case 'hoehenmodell': {
      out.push(rect(x, y0, w, H * s, '#eef1f4', ' class="ink"'));
      out.push(floorLines(h, x, w, groundY, s, '#d5dbe1'));
      out.push(grid(h, x, groundY, s, { fill: '#5b6773' }), door(x, w, groundY, s));
      slab({ flat: '#e6cc4d', gable: '#f28019' }[h.roof] ?? '#2e7d4f', '#1f2a36', 0.25, 0.4);
      const dx = x + w + 0.45 * s;
      out.push(rect(dx - 0.4, y0, 0.8, H * s, '#2f6fdf'));
      for (let f = 0; f <= h.floors; f++) out.push(`<line x1="${n1(dx - 2.5)}" y1="${n1(groundY - f * FLOOR_H * s + 2.5)}" x2="${n1(dx + 2.5)}" y2="${n1(groundY - f * FLOOR_H * s - 2.5)}" stroke="#2f6fdf" stroke-width="1.2"/>`);
      out.push(`<text x="${n1(dx)}" y="${n1(y0 - 0.4 * s - 3)}" font-size="8" font-weight="700" style="fill:#2f6fdf" text-anchor="end">${H.toFixed(2).replace('.', ',')} m</text>`);
      top = Math.min(top, y0 - 0.4 * s - 12);
      break;
    }
    case 'karton': {
      out.push(rect(x, y0, w, H * s, '#c9a46c', stroke('#a9824a', 1.2)));
      out.push(floorLines(h, x, w, groundY, s, '#a9824a'));
      out.push(grid(h, x, groundY, s, { fill: '#3b2a1a', line: '#ff6a00', lw: 0.9 }), door(x, w, groundY, s));
      slab('#c9a46c', '#a9824a', 0.3, 0.22);
      break;
    }
    case 'plankopf': {
      out.push(rect(x, y0, w, H * s, '#f7f5ef', stroke('#1a1a1a', 1.2)));
      out.push(floorLines(h, x, w, groundY, s, '#1a1a1a', 0.6));
      out.push(grid(h, x, groundY, s, { fill: '#dcd7ca', line: '#1a1a1a', lw: 0.8 }), door(x, w, groundY, s));
      slab('#f7f5ef', '#1a1a1a', 0.15, 0.3);
      const cx = x + w / 2, py = y0 - 0.3 * s;
      out.push(`<path d="M${n1(cx)},${n1(py)} L${n1(cx - 0.42 * s)},${n1(py - 1.25 * s)} L${n1(cx + 0.42 * s)},${n1(py - 1.25 * s)} Z" fill="#d62828"/>`);
      out.push(`<circle cx="${n1(cx)}" cy="${n1(py - 1.45 * s)}" r="${n1(0.55 * s)}" fill="#d62828"/><circle cx="${n1(cx)}" cy="${n1(py - 1.5 * s)}" r="${n1(0.2 * s)}" fill="#ffffff"/>`);
      top = py - 2 * s;
      break;
    }
    case 'schwarzplan': {
      out.push(rect(x - 2.2 * s, groundY - 0.12 * s, w + 4.4 * s, 0.12 * s, '#f5f5f7', stroke('#c7c7cc', 0.6)));
      out.push(rect(x, y0, w, H * s, '#1d1d1f'));
      for (let f = 0; f < h.floors; f++) {
        const yy = groundY - (f * FLOOR_H + 1.8 + 0.625) * s;
        if (f === 0) {
          const bw = W / 2 - 1.4;
          out.push(rect(x + 0.5 * s, yy, bw * s, 1.25 * s, '#0b4f9c'), rect(x + (W / 2 + 0.9) * s, yy, bw * s, 1.25 * s, '#0b4f9c'));
        } else out.push(rect(x + 0.5 * s, yy, (W - 1) * s, 1.25 * s, '#0b4f9c'));
      }
      out.push(door(x, w, groundY, s, '#f5f5f7'));
      out.push(rect(x - 0.06 * s, y0 - 0.25 * s, w + 0.12 * s, 0.25 * s, '#f5f5f7', stroke('#1d1d1f', 0.6)));
      top = y0 - 0.25 * s;
      break;
    }
    case 'laserplatte': {
      out.push(rect(x, y0, w, H * s, '#ffead9', stroke('#ff6347', 1.2)));
      out.push(floorLines(h, x, w, groundY, s, '#ff6347'));
      out.push(grid(h, x, groundY, s, { fill: '#7a4a3a', line: '#ff6347', lw: 0.8 }), door(x, w, groundY, s, '#7a4a3a'));
      for (let f = 0; f < h.floors; f++) out.push(`<text x="${n1(x + 0.35 * s)}" y="${n1(groundY - f * FLOOR_H * s - 0.3 * s)}" font-size="5" style="fill:#7a4a3a">A-${String(f + 1).padStart(3, '0')}</text>`);
      slab('#ff6347', null, 0.2, 0.25);
      break;
    }
    case 'passivhaus': {
      const L = h.level ?? 0;
      out.push(rect(x - 0.15 * s, groundY - 0.3 * s, w + 0.3 * s, 0.3 * s, '#5b6b73'));
      out.push(rect(x, y0, w, H * s, '#c9ddcd', ' class="ink"'));
      if (L >= 2) out.push(rect(x, groundY - (FLOOR_H + 0.3) * s, w, FLOOR_H * s, '#b9832c', ' class="ink"'));
      out.push(grid(h, x, groundY, s, { fill: '#33414e', line: '#fbfcfa', lw: 1.6 }), door(x, w, groundY, s));
      const rh = h.depth * 0.42 * s, o = 0.4 * s;
      out.push(`<polygon class="ink" points="${n1(x - o)},${n1(y0)} ${n1(x + o)},${n1(y0 - rh)} ${n1(x + w - o)},${n1(y0 - rh)} ${n1(x + w + o)},${n1(y0)}" fill="#1f5a3d"/>`);
      if (L >= 1) {
        const cols = Math.max(2, Math.floor((W - 1.2) / 1.15));
        for (const u of [0.3, 0.62]) for (let c = 0; c < cols; c++) {
          const cx = x + w / 2 + (-((cols - 1) * 1.15) / 2 + c * 1.15) * s;
          out.push(rect(cx - 0.5 * s, y0 - rh * (u + 0.12), 1.0 * s, rh * 0.22, '#1d2b4a'));
        }
      }
      if (L >= 4) for (let i = 0; i < 9; i++) out.push(rect(x + w - 0.5 * s, groundY - (0.5 + i * 0.6) * s, 0.5 * s, 0.4 * s, '#3b8455'));
      if (L >= 3) out.push(rect(x + w + 0.5 * s, groundY - 0.85 * s, 1.1 * s, 0.85 * s, '#e6e9e6', stroke('#5b6b73', 0.6)), `<circle cx="${n1(x + w + 1.05 * s)}" cy="${n1(groundY - 0.43 * s)}" r="${n1(0.3 * s)}" fill="#5b6b73"/>`);
      if (L >= 5) out.push(rect(x + w + 0.15 * s, groundY - 1.1 * s, 0.6 * s, 1.1 * s, '#1f5a3d'));
      if (L >= 6) out.push(rect(x + w + 1.8 * s, groundY - 1.4 * s, 0.32 * s, 1.4 * s, '#fbfcfa', stroke('#5b6b73', 0.6)));
      out.push(rect(x + w / 2 + 0.85 * s, groundY - 2.0 * s, 0.7 * s, 0.75 * s, EFF_COLORS[L]), `<text x="${n1(x + w / 2 + 1.2 * s)}" y="${n1(groundY - 1.42 * s)}" font-size="5.5" font-weight="800" style="fill:#fff" text-anchor="middle">${EFFIZIENZ[L]}</text>`);
      top = y0 - rh;
      break;
    }
    case 'swiss': {
      out.push(rect(x, y0, w, H * s, '#ffffff', stroke('#000000', 1.2)));
      out.push(grid(h, x, groundY, s, { fill: '#26303a', line: '#000000', lw: 1.2, ww: 1.25, wh: 1.25 }), door(x, w, groundY, s));
      slab('#b7d7b0', '#000000', 0.1, 0.25);
      for (let k = 0; k < Math.min(2, h.floors); k++) {
        const cx = x + w + (1.5 + k * 1.5) * s, sc = 0.85 + ((k * 37) % 10) / 25;
        out.push(rect(cx - 0.1 * s, groundY - 0.6 * s, 0.2 * s, 0.6 * s, '#6b4f3a'));
        out.push(`<polygon points="${n1(cx - 0.95 * sc * s)},${n1(groundY - 0.6 * s)} ${n1(cx + 0.95 * sc * s)},${n1(groundY - 0.6 * s)} ${n1(cx)},${n1(groundY - (0.6 + 2.6 * sc) * s)}" fill="${k % 2 ? '#527b59' : '#9fc393'}"/>`);
        out.push(`<polygon points="${n1(cx - 0.7 * sc * s)},${n1(groundY - (0.6 + 1.6 * sc) * s)} ${n1(cx + 0.7 * sc * s)},${n1(groundY - (0.6 + 1.6 * sc) * s)} ${n1(cx)},${n1(groundY - (0.6 + 3.4 * sc) * s)}" fill="${k % 2 ? '#9fc393' : '#527b59'}"/>`);
      }
      break;
    }
    case 'planpruefer': {
      out.push(rect(x - 0.15 * s, groundY - 0.3 * s, w + 0.3 * s, 0.3 * s, '#0f1e3a'));
      out.push(rect(x, y0, w, H * s, '#1e2f4f', stroke('#a7b6d0', 1)));
      out.push(floorLines(h, x, w, groundY, s, '#3c5072'));
      out.push(grid(h, x, groundY, s, { fill: '#0f1e3a', line: '#a7b6d0', lw: 0.9 }), door(x, w, groundY, s));
      slab('#263a5f', '#a7b6d0', 0.15, 0.35);
      for (let f = 0; f < h.floors; f++) {
        const ok = f < h.floors - 1;
        out.push(`<circle cx="${n1(x + w - 0.35 * s)}" cy="${n1(groundY - (f * FLOOR_H + 1.75) * s)}" r="${n1(0.25 * s)}" fill="${ok ? '#a7b6d0' : '#b06a8a'}"/>`);
      }
      const nx = x + 0.75 * s, ny = y0 + 0.4 * s;
      out.push(`<path d="M${n1(nx)},${n1(ny)} l${n1(0.2 * s)},${n1(0.55 * s)} l${n1(-0.2 * s)},${n1(-0.12 * s)} l${n1(-0.2 * s)},${n1(0.12 * s)} Z" fill="#ffffff"/>`);
      break;
    }
    case 'glas': {
      out.push(rect(x, y0, w, H * s, '#cfdbeb', stroke('#9fb3c8', 1)));
      out.push(rect(x + w / 2 - 0.21 * W * s, y0, 0.42 * W * s, H * s, '#e5e5ea'));
      for (let f = 0; f <= h.floors; f++) out.push(rect(x - 0.1 * s, groundY - f * FLOOR_H * s - 0.15 * s, w + 0.2 * s, 0.3 * s, '#f2f2f7', stroke('#c7c7cc', 0.6)));
      out.push(rect(x + w / 2 - 0.65 * s, groundY - 2.3 * s, 1.3 * s, 2.3 * s, '#9fb3c8'));
      const colors = ['#30b0c7', '#ff9500', '#af52de', '#34c759', '#007aff'];
      const xs = [-1.4, W + 1.4, -0.5, W + 0.5, -2.2, W + 2.2];
      for (let k = 0; k < Math.min(h.floors, xs.length); k++) {
        const px = x + xs[k] * s;
        out.push(`<path d="M${n1(px)},${n1(groundY - 0.05 * s)} l${n1(-0.26 * s)},${n1(-0.75 * s)} l${n1(0.52 * s)},0 Z" fill="${colors[k % 5]}"/><circle cx="${n1(px)}" cy="${n1(groundY - 0.95 * s)}" r="${n1(0.33 * s)}" fill="${colors[k % 5]}"/>`);
      }
      top = y0 - 0.15 * s;
      break;
    }
    case 'musterfassade': {
      const colors = { klinker: '#a3563d', holz: '#b98654', putz: '#e8e2d4', beton: '#b8b5ae', metall: '#a3abb2' };
      for (let f = 0; f < h.floors; f++) {
        const [key] = SWATCHES[f % SWATCHES.length];
        out.push(rect(x, groundY - (f + 1) * FLOOR_H * s, w, FLOOR_H * s, kit.facadeFill({ material: key, facade: colors[key] })));
      }
      out.push(rect(x, y0, w, H * s, 'none', ' class="ink"'));
      out.push(grid(h, x, groundY, s, { fill: '#5b7db3', line: '#1f3a68', lw: 1 }), door(x, w, groundY, s));
      slab('#eeeeec', '#1f2a36', 0.1, 0.25);
      break;
    }
    case 'treppe': {
      out.push(rect(x, y0, w, H * s, '#ffffff', stroke('#000000', 1.2)));
      out.push(floorLines(h, x, w, groundY, s, '#151515', 0.5));
      out.push(grid(h, x, groundY, s, { fill: '#2a2a2a', line: '#000000', lw: 0.8 }), door(x, w, groundY, s));
      if (h.floors > 1) {
        const cols = Math.max(2, Math.floor((W - 1) / 2)), cx = W / (2 * cols);
        out.push(rect(x + (cx - 0.7) * s, groundY - ((h.floors - 1) * FLOOR_H + 1.75 + 0.86) * s, 1.4 * s, 1.72 * s, 'none', stroke('#e2001a', 1.4)));
      }
      slab('#ffffff', '#000000', 0.08, 0.25);
      // Außentreppe in der Ansicht: Läufe im Zickzack neben der Fassade
      for (let k = 0; k < h.floors - 1; k++) {
        const pts = [], left = x + w + 0.15 * s, span = 1.1 * s, st = 6;
        for (let i = 0; i <= st; i++) {
          const u = k % 2 ? 1 - i / st : i / st, yy = groundY - (k * FLOOR_H + (FLOOR_H * i) / st) * s;
          pts.push(`${n1(left + u * span)},${n1(yy + (FLOOR_H * s) / st)}`, `${n1(left + u * span)},${n1(yy)}`);
        }
        out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="#151515" stroke-width="1.1"/>`);
        out.push(rect(left - 0.1 * s, groundY - (k + 1) * FLOOR_H * s - 1, span + 0.3 * s, 2, '#151515'));
      }
      break;
    }
    case 'sperrholz': {
      out.push(rect(x - 1.5 * s, groundY - 0.1 * s, w + 3 * s, 0.1 * s, '#e9ece4', stroke('#b9bfb2', 0.6)));
      out.push(rect(x, y0, w, H * s, '#e3cc9f', stroke('#a67c45', 1)));
      for (let yy = 0, i = 0; yy < H - 0.01; yy += 0.5, i++) {
        for (const ex of [x - 0.1 * s, x + w - 0.1 * s]) out.push(rect(ex, groundY - (yy + 0.5) * s, 0.2 * s, 0.5 * s, i % 2 ? '#c49a62' : '#ecd8b0'));
      }
      const cols = Math.max(3, Math.floor(W / 1.2));
      out.push(grid(h, x, groundY, s, { fill: '#3a2a18', ww: 0.34, wh: 1.7, xs: Array.from({ length: cols }, (_, c) => (W * (c + 0.5)) / cols) }), door(x, w, groundY, s));
      slab('#e3cc9f', '#a67c45', 0.2, 0.18);
      break;
    }
    case 'kacheln': {
      out.push(rect(x + w / 2 - 0.25 * W * s, y0, 0.5 * W * s, H * s, '#f2f2f7', ` rx="${n1(0.45 * s)}" class="ink"`));
      const cats = ['#378add', '#1d9e75', '#d85a30', '#8e8e93'];
      const r = rng(h.seed + 16), bars = h.floors - 1;
      for (let f = 1; f <= bars; f++) {
        const len = Math.min(W, W * (0.5 + 0.5 * r()));
        const t = bars > 1 ? (f - 1) / (bars - 1) : 0.5;
        const bx = x + (W - len) * t * s, by = groundY - (f * FLOOR_H + 2.75) * s;
        out.push(rect(bx, by, len * s, 2.5 * s, cats[(f - 1) % cats.length], ` rx="${n1(0.4 * s)}"`));
        const n = Math.max(1, Math.floor((len - 0.6) / 1.5));
        for (let i = 0; i < n; i++) {
          const cx = bx + (len / 2 - ((n - 1) * 1.5) / 2 + i * 1.5) * s;
          out.push(rect(cx - 0.45 * s, by + 0.8 * s, 0.9 * s, 0.9 * s, '#fbfbfd'));
        }
      }
      out.push(door(x, w, groundY, s));
      break;
    }
    case 'holzrahmen': {
      out.push(rect(x, y0, w, H * s, kit.facadeFill({ material: 'holz', facade: '#c8a36a' }), ' class="ink"'));
      const layers = ['#8b6a3e', '#2f3b47', '#e8c547', '#d4b483', '#f0ede6'], sw = 1.6 / layers.length;
      layers.forEach((c, j) => out.push(rect(x + w - (1.6 - j * sw) * s, y0, sw * s, H * s, c)));
      const cols = Math.max(2, Math.floor((W - 1) / 2));
      const xs = Array.from({ length: cols }, (_, c) => (W * (c + 0.5)) / cols).filter((cx) => Math.abs(cx - W) > 2.35);
      out.push(grid(h, x, groundY, s, { fill: '#33414e', line: '#6d5434', lw: 1, xs }), door(x, w, groundY, s));
      out.push(rect(x - 0.4 * s, y0 - h.depth * 0.25 * s, w + 0.8 * s, h.depth * 0.25 * s, '#4a4743', ' class="ink"'));
      top = y0 - h.depth * 0.25 * s;
      const spots = [[W - 0.8, 0.7], [0.7, H - 0.6], [W - 0.8, H * 0.5], [0.7, 0.7], [W / 2, H - 0.5], [W - 0.8, H - 0.6], [0.7, H * 0.5]];
      const n = Math.min(spots.length, h.floors), finding = ['#c62828', '#e07b00', '#1f6fb2'];
      for (let k = 0; k < n; k++) {
        const age = n - 1 - k, color = age < finding.length ? finding[age] : '#15803d';
        out.push(`<circle cx="${n1(x + spots[k][0] * s)}" cy="${n1(groundY - spots[k][1] * s)}" r="${n1(0.3 * s)}" fill="#ffffff" stroke="${color}" stroke-width="1.4"/>`);
      }
      break;
    }
    case 'kartenplatte': {
      const n = mapLayerCount(h), colors = ['#94b98a', '#6a8caf', '#e3c46b', '#cf7fb0', '#557d4f', '#d9625f', '#efc6df'].slice(0, n);
      const pw = w + 5 * s;
      colors.forEach((c, i) => out.push(rect(x - 2.5 * s + (pw * i) / n, groundY - 0.12 * s, pw / n, 0.12 * s, c)));
      out.push(rect(x, groundY - FLOOR_H * s, w, FLOOR_H * s, '#e9c24f', ' class="ink"'));
      if (h.floors > 1) out.push(rect(x, y0, w, (H - FLOOR_H) * s, '#ffffff', ' class="ink"'));
      out.push(grid(h, x, groundY, s, { fill: '#4a4a4a' }), door(x, w, groundY, s));
      slab('#ffffff', '#c8c8c8', 0.1, 0.25);
      break;
    }
    case 'rendite': {
      const steps = renditeSteps(h.floors), sw = W / 3;
      steps.forEach((fl, j) => {
        const sx = x + j * sw * s, sh = fl * FLOOR_H * s;
        out.push(rect(sx, groundY - sh, sw * s, sh, '#f4f4f2', stroke('#262624', 1)));
        out.push(rect(sx - 0.07 * s, groundY - sh - 0.22 * s, (sw + 0.14) * s, 0.22 * s, '#262624'));
        for (let f = 0; f < fl; f++) {
          if (f === 0 && j === 1) continue;
          out.push(rect(sx + (sw / 2 - 0.62) * s, groundY - (f * FLOOR_H + 2.8) * s, 1.24 * s, 2.0 * s, '#33414e', stroke('#262624', 0.8)));
        }
        top = Math.min(top, groundY - sh - 0.22 * s);
      });
      out.push(door(x, w, groundY, s));
      break;
    }
    default:
      return null;
  }
  return { svg: out.join(''), top };
}
