// Gemeinsame Hauslogik für die 3D-Straße (Browser) und den Generator (Node).
// Alles hängt nur vom Repo-Namen, der Commit-Zahl und der Hauptsprache ab,
// damit ein Haus überall gleich aussieht und nur wächst, wenn Commits dazukommen.

export const FLOOR_H = 3;

export const FACADES = [
  '#f3efe6', // Papier
  '#e6d6b8', // Birke
  '#d4c2a4', // Kork
  '#d99677', // Terrakotta
  '#aebfa5', // Salbei
  '#a7bacb', // Taubenblau
  '#e8c97a', // Ocker
  '#c4bdb4', // Beton
  '#efe3d3', // Sandstein
];

/** Fassadenmaterial nach Programmiersprache (Hauptsprache laut GitHub). */
export const MATERIALS = {
  klinker: { label: 'Klinker', langs: ['JavaScript', 'TypeScript'], colors: ['#a3563d', '#8e4b36', '#b4694c'] },
  holz: { label: 'Holz', langs: ['Python', 'Jupyter Notebook', 'R'], colors: ['#b98654', '#9b6c43', '#c9a173'] },
  beton: { label: 'Sichtbeton', langs: ['PowerShell', 'Shell', 'Batchfile', 'Dockerfile', 'Makefile'], colors: ['#b8b5ae', '#aaa79f', '#c4c1ba'] },
  metall: { label: 'Metall', langs: ['Java', 'C#', 'C++', 'C', 'Go', 'Rust', 'Kotlin', 'Swift', 'Dart', 'GDScript'], colors: ['#a3abb2', '#6c757d', '#c3c9ce'] },
  putz: { label: 'Putz', langs: ['HTML', 'CSS', 'SCSS', 'Vue', 'Svelte'], colors: FACADES },
};

export function materialFor(language) {
  for (const [key, m] of Object.entries(MATERIALS)) if (m.langs.includes(language)) return key;
  return 'putz'; // HTML/CSS und Repos ohne erkannte Sprache
}

export const ROOF_COLORS = ['#55504b', '#8b4c3d', '#3f4b56', '#6d6a5f'];

export const ROOF_TYPES = ['gable', 'gable', 'flat', 'shed', 'barrel'];

export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Jede Verdopplung der Commits bringt ein Geschoss: 1 → 1, 2 → 2, 4 → 3, 8 → 4, 16 → 5 … */
export function floorsFor(commits) {
  if (!commits || commits < 1) return 1;
  return 1 + Math.floor(Math.log2(commits));
}

/** Jede Verdopplung bringt ein Fensterabteil, das erste Commit noch keins: 1 → 0, 2 → 1, 4 → 2, 8 → 3 … */
export function windowsFor(commits) {
  return floorsFor(commits) - 1;
}

// Baumschule am Block-Haus: jeden Tag ein neuer Setzling (ab Anlage des Repos),
// der alle 8 Stunden eine Stufe wächst – Stufe 1 = Setzling, Stufe 5 = ausgewachsener Baum
export const SAPLINGS = { stages: 5, stepHours: 8, slots: 8 };
const HOUR = 3600 * 1000;

export function saplingsAt(since, now = Date.now()) {
  const t0 = Date.parse(since);
  const stages = [];
  for (let k = 0; k < SAPLINGS.slots; k++) {
    const age = now - (t0 + k * 24 * HOUR);
    if (!(age >= 0)) break;
    stages.push(Math.min(SAPLINGS.stages, 1 + Math.floor(age / (SAPLINGS.stepHours * HOUR))));
  }
  return stages;
}

// Zeitpunkt der nächsten Veränderung (neue Stufe oder neuer Setzling), null wenn fertig
export function nextSaplingChange(since, now = Date.now()) {
  const t0 = Date.parse(since), step = SAPLINGS.stepHours * HOUR;
  let next = Infinity;
  for (let k = 0; k < SAPLINGS.slots; k++) {
    const plant = t0 + k * 24 * HOUR;
    if (plant > now) { next = Math.min(next, plant); break; }
    const grown = plant + (SAPLINGS.stages - 1) * step;
    if (grown > now) next = Math.min(next, plant + Math.ceil((now - plant + 1) / step) * step);
  }
  return Number.isFinite(next) ? next : null;
}

// Nurdachhaus: Das Dach reicht bis zum Boden, der Giebel zeigt zur Straße.
// Es wächst nicht in die Höhe, sondern bekommt im Giebel ein Fensterabteil nach dem anderen.
export const NURDACH = { width: 9, height: 8.6 };
const NURDACH_COLS = [-4.5, -2.25, -0.75, 0.75, 2.25, 4.5];
const NURDACH_ROWS = [0.4, 2.8, 5.4, NURDACH.height];
// Reihenfolge, in der die Abteile verglast werden: [Reihe, Spalte] (Mitte unten ist die Tür)
const NURDACH_ORDER = [[0, 1], [0, 3], [1, 2], [0, 0], [0, 4], [1, 1], [1, 3], [2, 2], [2, 1], [2, 3]];

function clipPolygon(poly, a, b) {
  // behält die Seite links der Kante a→b (Sutherland-Hodgman)
  const side = ([x, y]) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

export function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/** Konvexes Polygon (gegen den Uhrzeigersinn) um d nach innen versetzen. */
export function insetPolygon(poly, d) {
  const n = poly.length;
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len; // Normale nach innen
    return { p: [p[0] + nx * d, p[1] + ny * d], dx, dy };
  });
  return lines.map((l1, i) => {
    const l0 = lines[(i - 1 + n) % n];
    const den = l0.dx * l1.dy - l0.dy * l1.dx;
    if (Math.abs(den) < 1e-9) return l1.p;
    const t = ((l1.p[0] - l0.p[0]) * l1.dy - (l1.p[1] - l0.p[1]) * l1.dx) / den;
    return [l0.p[0] + l0.dx * t, l0.p[1] + l0.dy * t];
  });
}

/** Alle Fensterabteile im Giebel (Meter, Mitte unten = 0,0), in der Reihenfolge, in der sie dazukommen. */
export function nurdachCells() {
  const { width: W, height: Hp } = NURDACH;
  const tri = [[-W / 2, 0], [W / 2, 0], [0, Hp]];
  const cells = [];
  for (const [row, col] of NURDACH_ORDER) {
    const x0 = NURDACH_COLS[col], x1 = NURDACH_COLS[col + 1];
    const y0 = NURDACH_ROWS[row], y1 = NURDACH_ROWS[row + 1];
    let poly = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (let i = 0; i < 3; i++) poly = clipPolygon(poly, tri[i], tri[(i + 1) % 3]);
    // doppelte Punkte (Ecken genau auf der Dachkante) entfernen
    poly = poly.filter((p, i) => {
      const q = poly[(i + 1) % poly.length];
      return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6;
    });
    if (poly.length >= 3 && polygonArea(poly) >= 0.7) cells.push(poly);
  }
  return cells;
}

export function houseFor(name, commits, empty, language, style) {
  const r = rng(hash(name.toLowerCase()));
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const material = materialFor(language);
  const house = {
    width: 6 + Math.round(r() * 6) / 2,  // 6–9 m entlang der Straße
    depth: 7 + Math.round(r() * 6) / 2,  // 7–10 m in die Tiefe
    roof: pick(ROOF_TYPES),
    ridge: r() < 0.5 ? 'street' : 'side', // giebelständig / traufständig
    material,
    facade: pick(MATERIALS[material].colors),
    roofColor: pick(ROOF_COLORS),
    floors: empty ? 0 : floorsFor(commits),
    seed: hash(name),
  };
  if (style === 'voxel') {
    // Block-Stil: alles auf ganze Meter (1 Block = 1 m), Gründach
    Object.assign(house, { style, width: Math.round(house.width), depth: Math.round(house.depth), roof: 'flat' });
  }
  if (style === 'nurdach') {
    Object.assign(house, {
      style,
      width: NURDACH.width,
      height: NURDACH.height,
      roof: 'nurdach',
      roofColor: '#3f4b56', // dunkles Schieferdach, hebt das Dreieck ab
      floors: empty ? 0 : 1,
      windows: empty ? 0 : Math.min(windowsFor(commits), nurdachCells().length),
    });
  }
  return house;
}

export function prettyTitle(name) {
  const t = name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
