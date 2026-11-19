// Ansicht von der Straße für die eigenen Bauweisen (site/styles.js), fürs README-Banner.
// Was sich mit der Uhrzeit ändert (z. B. die Jetzt-Linie), bleibt hier weg, damit das
// Banner nicht bei jedem Lauf der Action neu committet wird.
import {
  FLOOR_H, rng, EFFIZIENZ, SWATCHES, mapLayerCount, renditeSteps, UA_LAYERS, MM_BAUSTOFFE, MM_FARBEN, bentoRows, terraCount,
  werkbankTextur,
} from '../site/house.mjs';

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
  if (h.style === 'materialmatch') return 2.8;
  if (h.style === 'terra') return 3.4;
  if (h.style === 'layerturm') return 0.6;
  if (h.style === 'kiosk') return 1.2;
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
    case 'layerturm': {
      const ins = 0.45 * s;
      out.push(rect(x - 0.6 * s, groundY - 0.1 * s, w + 1.2 * s, 0.1 * s, '#17161d'));
      out.push(rect(x + ins, y0, w - 2 * ins, H * s, '#14131a'));
      out.push(grid(h, x, groundY, s, { fill: '#2d2640', ww: 1.5, wh: 2.0, xs: [0.125, 0.375, 0.625, 0.875].map((f) => f * W) }));
      out.push(rect(x, groundY - 0.2 * s, w, 0.2 * s, '#1f1d26'));
      for (let f = 0; f < h.floors; f++) {
        const yt = groundY - (f + 1) * FLOOR_H * s;
        out.push(rect(x, yt, w, 0.32 * s, '#1f1d26'));
        out.push(rect(x - 0.06 * s, yt + 0.115 * s, w + 0.12 * s, 0.09 * s, UA_LAYERS[f % UA_LAYERS.length][1]));
      }
      out.push(door(x, w, groundY, s));
      const r = rng(h.seed + 20);
      for (let i = 0; i < 7; i++) {
        const bw = 0.6 + r(), bh = 0.3 + r() ** 2 * 1.8, bx = 1.3 + r() * (W - 2.6 - bw);
        out.push(rect(x + bx * s, y0 - bh * s, bw * s, bh * s, '#9c7bd6'));
        top = Math.min(top, y0 - bh * s);
      }
      break;
    }
    case 'materialmatch': {
      out.push(rect(x, y0, w, H * s, '#f5f6f8', ' class="ink"'));
      const gap = 0.18, usable = W - 0.3;
      let k = 0;
      bentoRows(h.floors, h.seed).forEach((row, f) => {
        let left = 0.15;
        row.forEach((frac, j) => {
          const tw = usable * frac - gap, th = FLOOR_H - 0.24;
          const tx = x + (left + gap / 2) * s, ty = groundY - (f + 1) * FLOOR_H * s + 0.12 * s;
          left += usable * frac;
          const isDoor = f === 0 && j === 1;
          const name = MM_BAUSTOFFE[(k + (h.seed % 3)) % MM_BAUSTOFFE.length];
          out.push(rect(tx, ty, tw * s, th * s, isDoor ? '#ffffff' : MM_FARBEN[name][0], ` rx="${n1(0.15 * s)}"`));
          if (isDoor) return;
          k++;
          const nw = tw >= 3.6 ? 2 : tw >= 1.7 ? 1 : 0;
          for (let i = 0; i < nw; i++) {
            const wx = tx + (tw / 2 + (nw === 2 ? ((i ? 1 : -1) * tw) / 4 : 0) - 0.55) * s;
            out.push(rect(wx, ty + (th / 2 - 0.88) * s, 1.1 * s, 1.45 * s, '#1f2530', ` rx="${n1(0.1 * s)}"`));
          }
        });
      });
      out.push(door(x, w, groundY, s));
      ['#b7cff0', '#5b8fd6', '#1f2530'].forEach((c, i) => out.push(rect(x + (0.3 + (i === 1 ? 0.5 : 0)) * s, y0 - (0.26 + i * 0.3) * s, w - 0.6 * s, 0.26 * s, c)));
      top = y0 - 0.86 * s;
      // Swipe-Karten neben dem Haus
      const cx = x + w + 1.4 * s, cy = groundY - 0.16 * s - 1.2 * s;
      [['#eee9fa', -0.18, 4], ['#e7f0fa', 0, -2], ['#ffffff', 0.3, -12]].forEach(([c, dx, deg]) => {
        out.push(`<rect x="${n1(cx + dx * s - 0.85 * s)}" y="${n1(cy - 1.2 * s)}" width="${n1(1.7 * s)}" height="${n1(2.4 * s)}" rx="${n1(0.12 * s)}" fill="${c}" stroke="#c9d3e0" stroke-width="0.6" transform="rotate(${deg} ${n1(cx + dx * s)} ${n1(cy + 1.2 * s)})"/>`);
      });
      out.push(`<text x="${n1(cx + 0.3 * s)}" y="${n1(cy + 0.3 * s)}" font-size="9" font-weight="800" style="fill:#2e9d6a" text-anchor="middle" transform="rotate(-12 ${n1(cx + 0.3 * s)} ${n1(cy + 1.2 * s)})">♥</text>`);
      out.push(rect(cx - 1.2 * s, groundY - 0.16 * s, 2.4 * s, 0.16 * s, '#e7f0fa'));
      break;
    }
    case 'terra': {
      const S = 0.6, n = terraCount(h), gy = groundY - S * s, yb = gy - H * s;
      const px0 = x - 0.6 * s, pw = w + 4.0 * s, hx = x + w + 1.9 * s;
      out.push(rect(px0, gy, pw, S * s, '#2f3a33'));
      ['#cfe3c4', '#b3d4a6', '#93c088', '#74a96c'].forEach((c, k) => {
        const rad = (1.5 - k * 0.32) * s;
        out.push(rect(hx - rad, gy - (k + 1) * 0.3 * s, 2 * rad, 0.3 * s, c));
      });
      out.push(rect(x, gy - FLOOR_H * s, w, FLOOR_H * s, '#f2c9c3', stroke('#2b3a2f', 0.8)));
      if (h.floors > 1) out.push(rect(x, yb, w, (H - FLOOR_H) * s, '#f4f5f2', stroke('#2b3a2f', 0.8)));
      out.push(grid(h, x, gy, s, { fill: '#3d5a48' }), door(x, w, gy, s));
      out.push(rect(x - 0.1 * s, yb - 0.25 * s, w + 0.2 * s, 0.25 * s, '#f4f5f2', stroke('#2b3a2f', 0.8)));
      top = yb - 0.25 * s;
      out.push(rect(px0, gy - 0.35 * s, pw, 0.35 * s, '#3d8fd6', ' fill-opacity="0.5"'));
      out.push(rect(px0, gy - 0.05 * s, pw, 0.05 * s, '#7fb27a'));
      if (n >= 2) { // Wolke mit Regen
        const ccx = hx - 0.4 * s, ccy = gy - 4.4 * s;
        for (let i = 0; i < 6; i++) {
          const rx = ccx - 0.9 * s + i * 0.36 * s;
          out.push(`<line x1="${n1(rx)}" y1="${n1(ccy + 0.6 * s + (i % 2) * 4)}" x2="${n1(rx)}" y2="${n1(ccy + 0.6 * s + (i % 2) * 4 + 7)}" stroke="#4c8fd9" stroke-width="0.8"/>`);
        }
        for (const [dx, dy, rr] of [[0, 0, 0.8], [0.7, 0.1, 0.6], [-0.7, 0.1, 0.62], [0.2, -0.35, 0.6]]) {
          out.push(`<circle cx="${n1(ccx + dx * s)}" cy="${n1(ccy + dy * s)}" r="${n1(rr * s)}" fill="#9aa5ad"/>`);
        }
      }
      if (n >= 3) { // Windpfeil über dem Dach
        const ay = yb - 1.4 * s, ax = x + w / 2;
        out.push(rect(ax - 1.3 * s, ay - 0.12 * s, 2.6 * s, 0.24 * s, '#2f6fdf'));
        out.push(`<polygon points="${n1(ax + 1.3 * s)},${n1(ay - 0.34 * s)} ${n1(ax + 2.0 * s)},${n1(ay)} ${n1(ax + 1.3 * s)},${n1(ay + 0.34 * s)}" fill="#2f6fdf"/>`);
        top = Math.min(top, ay - 0.34 * s);
      }
      if (n >= 4) { // Riss im Sockel
        const cx0 = x + 1.2 * s;
        out.push(`<polyline points="${n1(cx0 + 0.2 * s)},${n1(gy)} ${n1(cx0 - 0.05 * s)},${n1(gy + 0.2 * s)} ${n1(cx0 + 0.15 * s)},${n1(gy + 0.38 * s)} ${n1(cx0)},${n1(groundY)}" fill="none" stroke="#1d2420" stroke-width="0.8"/>`);
      }
      if (n >= 5) { // Tornado
        const tx = hx + 0.6 * s;
        out.push(`<polygon points="${n1(tx - 0.12 * s)},${n1(gy)} ${n1(tx + 0.12 * s)},${n1(gy)} ${n1(tx + 1.25 * s)},${n1(gy - 3.5 * s)} ${n1(tx - 1.0 * s)},${n1(gy - 3.5 * s)}" fill="#8d969c" fill-opacity="0.6"/>`);
      }
      if (n >= 6) { // Kaiju auf dem Hügel
        const kx = hx, ky = gy - 1.2 * s;
        out.push(rect(kx - 0.8 * s, ky - 1.4 * s, 0.6 * s, 1.4 * s, '#4f8a4b'), rect(kx + 0.2 * s, ky - 1.4 * s, 0.6 * s, 1.4 * s, '#4f8a4b'));
        out.push(rect(kx - 0.85 * s, ky - 3.6 * s, 1.7 * s, 2.3 * s, '#4f8a4b'), rect(kx - 0.6 * s, ky - 3.3 * s, 1.2 * s, 1.8 * s, '#a9cf8f'));
        out.push(rect(kx - 0.6 * s, ky - 4.5 * s, 1.2 * s, 0.95 * s, '#4f8a4b'), rect(kx - 0.35 * s, ky - 4.2 * s, 0.22 * s, 0.22 * s, '#ffffff'), rect(kx + 0.13 * s, ky - 4.2 * s, 0.22 * s, 0.22 * s, '#ffffff'));
        top = Math.min(top, ky - 4.5 * s);
      }
      if (n >= 7) { // Untertasse
        const ux = x + w * 0.3, uy = yb - 4.2 * s;
        out.push(`<polygon points="${n1(ux - 0.5 * s)},${n1(uy)} ${n1(ux + 0.5 * s)},${n1(uy)} ${n1(ux + 1.3 * s)},${n1(yb)} ${n1(ux - 1.3 * s)},${n1(yb)}" fill="#b6f5c8" fill-opacity="0.35"/>`);
        out.push(`<ellipse cx="${n1(ux)}" cy="${n1(uy - 0.3 * s)}" rx="${n1(0.6 * s)}" ry="${n1(0.5 * s)}" fill="#9fe0c0"/>`);
        out.push(`<ellipse cx="${n1(ux)}" cy="${n1(uy)}" rx="${n1(1.5 * s)}" ry="${n1(0.33 * s)}" fill="#c3c9ce"/>`);
        top = Math.min(top, uy - 0.8 * s);
      }
      break;
    }
    case 'kiosk': {
      const HW = 2.75, yk = groundY - HW * s;
      out.push(rect(x, yk, w, HW * s, '#f1e8d4', ' class="ink"'));
      out.push(rect(x, groundY - 0.9 * s, w, 0.9 * s, '#2f5d4a'));
      const ow = W - 1.8, ol = 0.9 + 0.25; // im Banner liegt die Gartenseite rechts
      out.push(rect(x + ol * s, groundY - 2.25 * s, ow * s, 1.25 * s, '#2a2622'));
      const colors = ['#c8382f', '#e6b33a', '#3b7fbf', '#5e9a4f'];
      const filled = Math.min(24, (h.level ?? 1) * 4);
      for (let k = 0; k < filled; k++) {
        const sh = Math.floor(k / 8), i = k % 8;
        out.push(rect(x + (ol + 0.12 + i * ((ow - 0.44) / 7)) * s, groundY - (1.12 + sh * 0.38 + 0.26) * s, 0.22 * s, 0.24 * s, colors[(sh * 3 + i) % 4]));
      }
      out.push(rect(x + (ol - 0.1) * s, groundY - 1.04 * s, (ow + 0.2) * s, 0.08 * s, '#d9c7a3'));
      for (let i = 0; i < 8; i++) {
        out.push(rect(x + (ol - 0.1) * s + (i * (ow + 0.2) * s) / 8, groundY - 2.55 * s, ((ow + 0.2) * s) / 8, 0.38 * s, i % 2 ? '#f5f1e6' : '#c8382f'));
      }
      out.push(rect(x - 0.15 * s, yk - 0.2 * s, w + 0.3 * s, 0.2 * s, '#2f5d4a'));
      out.push(rect(x + 0.45 * s, yk - 0.82 * s, w - 0.9 * s, 0.62 * s, '#c8382f'));
      out.push(`<text x="${n1(x + w / 2)}" y="${n1(yk - 0.33 * s)}" font-size="${n1(0.4 * s)}" font-weight="800" style="fill:#ffffff" text-anchor="middle">KIOSK</text>`);
      top = yk - 0.82 * s;
      const bx = x + w + 0.7 * s;
      out.push(`<polygon points="${n1(bx - 0.3 * s)},${n1(groundY)} ${n1(bx)},${n1(groundY - 0.9 * s)} ${n1(bx + 0.3 * s)},${n1(groundY)}" fill="#2d3a33" stroke="#6b4f3a" stroke-width="0.8"/>`);
      break;
    }
    case 'werkbank': {
      // Yaras Pixelblock von vorn: das 16×16-Raster der Seite, gleiche Farben einer Zeile zusammengefasst
      const S = Math.min(W, H), px = (S * s) / 16, bx = x + (w - S * s) / 2, by = groundY - S * s;
      const g = werkbankTextur('seite', { rauschen: false });
      for (let yy = 0; yy < 16; yy++) {
        for (let xx = 0; xx < 16;) {
          const f = g[yy][xx];
          let e = xx + 1;
          while (e < 16 && g[yy][e] === f) e++;
          if (f) out.push(rect(bx + xx * px, by + yy * px, (e - xx) * px + 0.4, px + 0.4, f));
          xx = e;
        }
      }
      // Yaras Schilder und Werkzeuge an der Straßenseite, vereinfacht: zwei Gruppen mit je drei Symbolen
      const k = S * s, farben = ['#c8382f', '#3a6fd6', '#7fd14c', '#f8d63e', '#e9dfbf', '#a6abb0'];
      [0.3, 0.6].forEach((oy, gi) => {
        const sw = k * 0.5, sh = k * 0.07, sy = by + k * oy;
        out.push(rect(bx + (k - sw) / 2, sy, sw, sh, '#57361a', stroke('#2a170a', 0.8)));
        const iw = k * 0.15;
        for (let n = 0; n < 3; n++) {
          const ix = bx + k / 2 + (n - 1) * (iw + k * 0.03) - iw / 2, iy = sy + sh + k * 0.04;
          out.push(rect(ix + iw / 2 - k * 0.01, iy - k * 0.025, k * 0.02, k * 0.02, '#2b2b2b'));
          out.push(rect(ix, iy, iw, iw, farben[gi * 3 + n], stroke('#1e1a1c', 0.8)));
        }
      });
      top = by;
      break;
    }
    default:
      return null;
  }
  return { svg: out.join(''), top };
}
