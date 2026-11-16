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

export function houseFor(name, commits, empty, language) {
  const r = rng(hash(name.toLowerCase()));
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const material = materialFor(language);
  return {
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
}

export function prettyTitle(name) {
  const t = name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
