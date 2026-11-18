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

// Eigene Bauweisen, die Farben, Formen und Motive aus der Oberfläche des jeweiligen
// Projekts aufgreifen (overrides.house in street.config.json). Gebaut in site/styles.js,
// gezeichnet fürs README in scripts/style-svg.mjs.
export const STYLES = {
  hoehenmodell: {},                         // gebaeudehoehentool: weißes Umgebungsmodell mit Höhenkote
  karton: { roof: 'flat' },                 // laserdatei-aus-3D: Kraftkarton, Abwicklung im Garten
  plankopf: { roof: 'flat' },               // Grundstücksanalyse: Papier, Tusche, roter Standortpunkt
  schwarzplan: { roof: 'flat' },            // SiteKick: schwarzer Block auf weißer Platte
  laserplatte: { roof: 'flat' },            // Modellbau-Laserdatei: Pfirsich-Platten mit Ausschnitten
  passivhaus: { roof: 'gable', ridge: 'side' }, // Energieeffizienz: wird nachhaltiger statt höher
  swiss: { roof: 'flat' },                  // CO-Emissionsrechner: Swiss Style, Nadelbäume
  planpruefer: { roof: 'flat' },            // plan-pruefer: Nachtblau, Prüfhaken je Geschoss
  glas: { roof: 'flat' },                   // 15-min-stadt-scanner: Milchglas, Ringe, Ziel-Pins
  musterfassade: { roof: 'flat' },          // fassaden-tool: jedes Geschoss ein anderes Material
  treppe: { roof: 'flat' },                 // treppenplaner: Linienzeichnung mit Außentreppe
  sperrholz: { roof: 'flat' },              // Map2Model: Sperrholzmodell auf Kartenplatte
  kacheln: { roof: 'flat' },                // Workflow_App: Gantt-Balken und rote Jetzt-Linie
  holzrahmen: {},                           // Detailpruefer: Holzrahmenbau mit Schnitt und Prüfmarken
  kartenplatte: { roof: 'flat' },           // Standortanalyse: Weißmodell auf bemalter Kartenplatte
  rendite: { roof: 'flat' },                // ImmoCheck: Stadthaus wie ein steigendes Balkendiagramm
  layerturm: { roof: 'flat', width: 10, depth: 10 },   // urban-analyst: dunkler Turm, je Geschoss ein Analyse-Layer
  materialmatch: { roof: 'flat', width: 10, depth: 9 }, // MaterialMatch: Bento-Fassade aus Baustoffen, Swipe-Karten
  terra: { roof: 'flat', width: 9, depth: 9 },         // TERRA-Sim: Arbeitsmodell auf Geländesockel mit Gefahren
};
export const PASSIV_UPGRADES = ['Solardach', 'Holzfaserfassade', 'Wärmepumpe', 'Fassadengrün', 'Regenspeicher', 'E-Ladesäule'];
export const EFFIZIENZ = ['G', 'F', 'E', 'D', 'C', 'B', 'A'];
export const SWATCHES = [['klinker', 'Klinker'], ['holz', 'Holz'], ['putz', 'Putz'], ['beton', 'Sichtbeton'], ['metall', 'Metall']];
export const MAP_LAYERS = ['Grünflächen', 'Hauptstraßen', 'Buslinie', 'Radwege', 'Bäume', 'Nutzungen', 'Fußwege'];
export const mapLayerCount = (hs) => Math.min(MAP_LAYERS.length, hs.floors + 1);
// Stadthaus in drei Abschnitten, die nach außen ansteigen wie ein Renditechart
export const renditeSteps = (floors) => [Math.max(1, Math.round(floors * 0.5)), Math.max(1, Math.round(floors * 0.75)), floors];
// urban-analyst: Bausteine in den Legendenfarben der App, von unten nach oben ein Geschoss je Layer
export const UA_LAYERS = [
  ['Gebäude', '#9c7bd6'], ['Straßen', '#d8d3e3'], ['Grün', '#6e9f5d'], ['Wasser', '#6bb7e8'], ['ÖPNV', '#b07fe0'],
  ['Bahn', '#e86fa0'], ['Bäume', '#4e8f4a'], ['Nutzung', '#c9a27e'], ['Sonnenbahn', '#f5b544'], ['Hochwasser', '#4c7fd9'],
];
// MaterialMatch: Baustoffe der Bento-Kacheln, und der Match wird mit jedem Geschoss besser
export const MM_BAUSTOFFE = ['Holz', 'Lehm', 'Ziegel', 'Hanf', 'Beton', 'Stroh', 'Kalk', 'Stahl'];
// Grund- und Linienfarbe der Schraffur je Baustoff
export const MM_FARBEN = {
  Holz: ['#dcb47e', '#a8773f'], Lehm: ['#d8b48a', '#b0865a'], Ziegel: ['#c7795a', '#f1e2d8'], Hanf: ['#e3d6a0', '#9f9152'],
  Beton: ['#cac8c3', '#8f8c86'], Stroh: ['#ecd98f', '#bf9f43'], Kalk: ['#f1efe8', '#bdb7a6'], Stahl: ['#b7c0c9', '#66707a'],
};
export const matchScore = (floors) => Math.min(100, 40 + floors * 12);
export const bentoRows = (floors, seed) => {
  // je Geschoss zwei oder drei Kacheln, Breiten als Anteile der Fassade
  const r = rng(seed + 21), rows = [];
  for (let f = 0; f < floors; f++) {
    if (f === 0) rows.push([0.38, 0.24, 0.38]); // Erdgeschoss: Tür in der Mitte
    else if (r() < 0.5) { const a = 0.35 + r() * 0.3; rows.push([a, 1 - a]); }
    else { const a = 0.22 + r() * 0.16, b = 0.22 + r() * 0.16; rows.push([a, b, 1 - a - b]); }
  }
  return rows;
};
// TERRA-Sim: Gefahren in der Reihenfolge der README, je Geschoss kommt eine dazu
export const TERRA_GEFAHREN = ['Hochwasser', 'Starkregen', 'Starkwind', 'Erdbeben', 'Tornado', 'Kaiju-Angriff', 'Alien-Invasion'];
export const terraCount = (hs) => Math.min(TERRA_GEFAHREN.length, hs.floors);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export function styleLabel(hs) {
  const n = hs.floors;
  switch (hs.style) {
    case 'hoehenmodell': return `Umgebungsmodell · Höhenkote ${(n * FLOOR_H).toFixed(2).replace('.', ',')} m`;
    case 'karton': return `Kartonmodell · Abwicklung mit ${Math.min(n, 6)} von 6 Flächen`;
    case 'plankopf': return 'Planzeichnung · Papier, Tusche, roter Standortpunkt';
    case 'schwarzplan': return 'Schwarzplan-Block · der Schatten folgt der echten Sonne';
    case 'laserplatte': return `Laserplatten · Teile A-001 bis A-${String(n).padStart(3, '0')}`;
    case 'passivhaus':
      return `Passivhaus · Effizienzklasse ${EFFIZIENZ[hs.level ?? 0]}${hs.level ? ` · ${PASSIV_UPGRADES.slice(0, hs.level).join(', ')}` : ''}`;
    case 'swiss': return `Swiss Style · ${plural(n, 'Nadelbaum', 'Nadelbäume')} im Garten`;
    case 'planpruefer': return `Prüfhaus · ${n - 1} von ${n} Geschossen abgehakt`;
    case 'glas': return `Glaspavillon · ${plural(n, 'Ziel', 'Ziele')} im 15-Minuten-Radius`;
    case 'musterfassade': return `Musterfassade · ${SWATCHES.slice(0, Math.min(n, SWATCHES.length)).map((s) => s[1]).join(', ')}`;
    case 'treppe': return n > 1 ? `Außentreppe · ${plural(n - 1, 'Lauf', 'Läufe')}` : 'Linienzeichnung · Treppe folgt';
    case 'sperrholz': return 'Sperrholzmodell mit Fingerzinken auf Kartenplatte';
    case 'kacheln': return `Gantt-Haus · ${Math.max(0, n - 1)} Balken · rote Jetzt-Linie`;
    case 'holzrahmen': return `Holzrahmenbau im Schnitt · ${plural(n, 'Prüfmarke', 'Prüfmarken')}`;
    case 'kartenplatte': return `Weißmodell auf Kartenplatte · ${mapLayerCount(hs)} Layer`;
    case 'rendite': return `Stadthaus wie ein Renditechart · ${renditeSteps(n).join(' · ')} Geschosse`;
    case 'layerturm': return `Layer-Turm · ${UA_LAYERS.slice(0, n).map((l) => l[0]).join(', ')}`;
    case 'materialmatch': return `Bento-Haus · ${bentoRows(n, hs.seed).flat().length - 1} Baustoff-Kacheln · Match ${matchScore(n)} %`;
    case 'terra': return `Arbeitsmodell auf Geländesockel · ${terraCount(hs)} von ${TERRA_GEFAHREN.length} Gefahren: ${TERRA_GEFAHREN.slice(0, terraCount(hs)).join(', ')}`;
  }
  return null;
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

// opts.startGeschoss: Nachzügler starten höher (3 = das erste Commit bringt schon drei Geschosse)
export function houseFor(name, commits, empty, language, style, opts = {}) {
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
    floors: empty ? 0 : floorsFor(commits) + Math.max(0, (opts.startGeschoss ?? 1) - 1),
    seed: hash(name),
  };
  if (style === 'voxel') {
    // Block-Stil: alles auf ganze Meter (1 Block = 1 m), Gründach
    Object.assign(house, { style, width: Math.round(house.width), depth: Math.round(house.depth), roof: 'flat' });
  }
  if (STYLES[style]) {
    Object.assign(house, { style, ...STYLES[style] });
    if (style === 'passivhaus' && !empty) {
      // wächst nicht in die Höhe, sondern wird mit jeder Verdopplung nachhaltiger
      house.floors = 2;
      house.level = Math.min(PASSIV_UPGRADES.length, floorsFor(commits) - 1);
    }
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
