// Sammelt alle öffentlichen Repos der Organisation und erzeugt daraus
//   site/projects.json    – Daten für die 3D-Straße (GitHub Pages)
//   profile/README.md     – Projekttabelle zwischen den PROJEKTE-Markern
//   profile/street.svg    – Straßenabwicklung als Banner fürs Org-Profil
//
// Lokal:  GITHUB_TOKEN=$(gh auth token) node scripts/build.mjs
// Ohne Token klappt es auch (60 API-Aufrufe/Stunde).

import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { houseFor, prettyTitle, FLOOR_H } from '../site/house.mjs';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('street.config.json', root), 'utf8'));
const ORG = config.org;
const EXCLUDE = new Set((config.exclude ?? []).map((n) => n.toLowerCase()));

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'vibecoding-allee-builder',
};
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (res.status === 204 || res.status === 404 || res.status === 409) return null;
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} für ${path}: ${await res.text()}`);
  return res.json();
}

async function listRepos() {
  const all = [];
  for (let page = 1; ; page++) {
    const batch = await gh(`/orgs/${ORG}/repos?type=public&per_page=100&page=${page}`);
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all.filter((r) => !r.private && !EXCLUDE.has(r.name.toLowerCase()));
}

// ---------- README auswerten ----------

function stripMarkdown(s) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s, max = 180) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\-–]+$/, '') + ' …';
}

/** Erster echter Absatz der README als Ersatzbeschreibung. */
function readmeSummary(md, repoName) {
  if (!md) return '';
  const clean = md.replace(/<!--[\s\S]*?-->/g, '').replace(/```[\s\S]*?```/g, '');
  const blocks = clean.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
  for (const b of blocks) {
    if (/^(#|=|-{3,}|\||<img|!\[|\[!\[)/.test(b)) continue;
    const text = stripMarkdown(b.replace(/^[-*+]\s+/gm, ''));
    if (text.length < 12) continue;
    if (norm(text) === norm(repoName)) continue;
    return truncate(text);
  }
  return '';
}

/** Erstes Bild der README (Screenshot), als absolute URL. */
function readmeImage(md, repo, readmePath) {
  if (!md) return null;
  const candidates = [];
  for (const m of md.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)) candidates.push([m.index, m[1]]);
  for (const m of md.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) candidates.push([m.index, m[1]]);
  candidates.sort((a, b) => a[0] - b[0]);
  for (const [, src] of candidates) {
    if (/shields\.io|badge|badgen|travis-ci|codecov/i.test(src)) continue;
    if (/^data:/.test(src)) continue;
    if (/^https?:\/\//.test(src)) {
      const blob = src.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)$/);
      return blob ? `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}` : src;
    }
    const base = readmePath.includes('/') ? readmePath.slice(0, readmePath.lastIndexOf('/') + 1) : '';
    const rel = src.startsWith('/') ? src.slice(1) : base + src.replace(/^\.\//, '');
    return `https://raw.githubusercontent.com/${ORG}/${repo.name}/${repo.default_branch}/${rel}`;
  }
  return null;
}

// ---------- Projekte zusammenstellen ----------

async function describe(repo) {
  const [contributors, readme] = await Promise.all([
    gh(`/repos/${ORG}/${repo.name}/contributors?per_page=100&anon=1`),
    gh(`/repos/${ORG}/${repo.name}/readme`),
  ]);
  const md = readme?.content ? Buffer.from(readme.content, 'base64').toString('utf8') : '';
  const list = Array.isArray(contributors) ? contributors : [];
  const commits = list.reduce((sum, c) => sum + (c.contributions ?? 0), 0);
  const team = list
    .filter((c) => c.login && c.type === 'User')
    .map((c) => ({ login: c.login, avatar: c.avatar_url, url: c.html_url, commits: c.contributions }));

  const override = config.overrides?.[repo.name] ?? {};
  const about = repo.description?.trim() ?? '';
  const fromReadme = about ? '' : readmeSummary(md, repo.name);
  const empty = commits === 0;
  const demo =
    override.demo ??
    (repo.homepage?.trim() || (repo.has_pages ? `https://${ORG.toLowerCase()}.github.io/${repo.name}/` : null));

  return {
    name: repo.name,
    title: override.title ?? prettyTitle(repo.name),
    description: override.description ?? (about || fromReadme),
    url: repo.html_url,
    demo,
    language: repo.language,
    topics: repo.topics ?? [],
    createdAt: repo.created_at,
    pushedAt: repo.pushed_at,
    commits,
    empty,
    team,
    image: override.image ?? readmeImage(md, repo, readme?.path ?? 'README.md'),
    house: houseFor(repo.name, commits, empty),
  };
}

const repos = await listRepos();
const projects = (await Promise.all(repos.map(describe))).sort((a, b) =>
  a.createdAt.localeCompare(b.createdAt),
);
projects.forEach((p, i) => (p.number = i + 1));

const data = {
  org: ORG,
  streetName: config.streetName,
  subtitle: config.subtitle,
  exclude: [...EXCLUDE],
  generatedAt: new Date().toISOString(),
  projects,
};

await mkdir(new URL('site/', root), { recursive: true });
await writeFile(new URL('site/projects.json', root), JSON.stringify(data, null, 2) + '\n');

// ---------- README ----------

const esc = (s) => s.replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/\n/g, ' ');
const site = config.siteUrl.replace(/\/?$/, '/');

function readmeSection() {
  const rows = projects.map((p) => {
    const desc = p.description ? esc(p.description) : '_Beschreibung folgt_';
    const demo = p.demo ? ` · [Live-Demo](${p.demo})` : '';
    const team = p.team
      .slice(0, 6)
      .map((t) => `<a href="${t.url}"><img src="${t.avatar}&s=48" width="22" height="22" alt="${t.login}" title="${t.login}"></a>`)
      .join(' ');
    return `| [${p.number}](${site}#${encodeURIComponent(p.name)}) | [**${esc(p.name)}**](${p.url}) | ${desc}${demo} | ${team} |`;
  });
  return [
    '<!-- PROJEKTE:START – wird automatisch erzeugt (scripts/build.mjs), bitte nicht von Hand ändern -->',
    `<a href="${site}"><img src="street.svg" alt="Straßenabwicklung der ${config.streetName} – klicken für den 3D-Rundgang" width="100%"></a>`,
    '',
    `<p align="center"><b><a href="${site}">Rundgang durch die ${config.streetName} →</a></b><br>`,
    `<sub>Jedes Projekt ist ein Haus, jeder Commit ein Geschoss. Neue Repos ziehen automatisch ein.</sub></p>`,
    '',
    '| Nr. | Projekt | Worum geht’s | Team |',
    '|---:|---|---|---|',
    ...rows,
    '',
    `<sub>${projects.length} Projekte · Liste aktualisiert sich automatisch alle 20 Minuten. Die Nummer führt direkt zum Haus in der Straße.</sub>`,
    '<!-- PROJEKTE:END -->',
  ].join('\n');
}

const readmeUrl = new URL('profile/README.md', root);
const readmeOld = await readFile(readmeUrl, 'utf8');
const marker = /<!-- PROJEKTE:START[\s\S]*?<!-- PROJEKTE:END -->/;
if (!marker.test(readmeOld)) throw new Error('profile/README.md: PROJEKTE-Marker fehlen');
const readmeNew = readmeOld.replace(marker, readmeSection());
if (readmeNew !== readmeOld) await writeFile(readmeUrl, readmeNew);

// ---------- Straßenabwicklung (SVG) ----------

function svgEsc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Höhere Häuser werden in der Abwicklung mit Bruchlinie gekürzt gezeichnet.
const MAX_DRAWN = 12;
const drawnFloors = (h) => Math.min(h.floors, MAX_DRAWN);

function zigzag(x0, x1, y, amp = 2.2, step = 5) {
  const pts = [];
  for (let x = x0, i = 0; x <= x1 + 0.01; x += step, i++) pts.push(`${x.toFixed(1)},${(y + (i % 2 ? amp : -amp)).toFixed(1)}`);
  return pts.join(' ');
}

function houseSvg(p, x, groundY, s) {
  const h = p.house;
  const w = h.width * s;
  const out = [];
  if (h.floors === 0) {
    // Baustelle: Fundament, Gerüst, Kran
    const fh = 0.5 * s;
    out.push(`<rect class="ink" x="${x}" y="${groundY - fh}" width="${w}" height="${fh}" fill="#c9c4bb"/>`);
    const top = groundY - 2 * FLOOR_H * s;
    for (let i = 0; i <= 3; i++) {
      const xx = x + (w * i) / 3;
      out.push(`<line class="thin" x1="${xx}" y1="${groundY}" x2="${xx}" y2="${top}"/>`);
    }
    for (let j = 1; j <= 3; j++) {
      const yy = groundY - (j * (groundY - top)) / 3;
      out.push(`<line class="thin" x1="${x}" y1="${yy}" x2="${x + w}" y2="${yy}"/>`);
    }
    const cx = x + w * 0.25, ct = groundY - 4.6 * FLOOR_H * s;
    out.push(`<line class="crane" x1="${cx}" y1="${groundY}" x2="${cx}" y2="${ct}"/>`);
    out.push(`<line class="crane" x1="${cx - 2 * s}" y1="${ct}" x2="${cx + 9 * s}" y2="${ct}"/>`);
    out.push(`<line class="thin" x1="${cx + 7 * s}" y1="${ct}" x2="${cx + 7 * s}" y2="${ct + 3 * s}"/>`);
    return { svg: out.join(''), top: ct };
  }
  const drawn = drawnFloors(h);
  const bh = drawn * FLOOR_H * s;
  const y0 = groundY - bh;
  out.push(`<rect class="ink" x="${x}" y="${y0}" width="${w}" height="${bh}" fill="${h.facade}"/>`);
  // Fenster
  const cols = Math.max(2, Math.floor((h.width - 1) / 2));
  const ww = 1.1 * s, wh = 1.4 * s;
  for (let f = 0; f < drawn; f++) {
    for (let c = 0; c < cols; c++) {
      const cxw = x + (w * (c + 0.5)) / cols;
      if (f === 0 && Math.abs(cxw - (x + w / 2)) < 1.2 * s) continue;
      const wy = groundY - f * FLOOR_H * s - 1.0 * s - wh;
      out.push(`<rect class="win" x="${(cxw - ww / 2).toFixed(1)}" y="${wy.toFixed(1)}" width="${ww.toFixed(1)}" height="${wh.toFixed(1)}"/>`);
    }
  }
  // Bruchlinie mit echter Geschosszahl
  if (h.floors > drawn) {
    const yb = groundY - (drawn / 2) * FLOOR_H * s - FLOOR_H * s * 0.15;
    const bandH = 13;
    out.push(`<rect class="paper" x="${x - 3}" y="${yb - bandH / 2}" width="${w + 6}" height="${bandH}"/>`);
    out.push(`<polyline class="zig" points="${zigzag(x - 3, x + w + 3, yb - bandH / 2)}"/>`);
    out.push(`<polyline class="zig" points="${zigzag(x - 3, x + w + 3, yb + bandH / 2)}"/>`);
    out.push(`<text class="floors" x="${x + w / 2}" y="${yb + 3.6}" text-anchor="middle">${h.floors} G</text>`);
  }
  // Tür
  out.push(`<rect class="door" x="${x + w / 2 - 0.55 * s}" y="${groundY - 2.2 * s}" width="${1.1 * s}" height="${2.2 * s}"/>`);
  // Dach (in der Ansicht von der Straße)
  const o = 0.4 * s;
  let top = y0;
  const fill = h.roofColor;
  if (h.roof === 'flat') {
    out.push(`<rect class="ink" x="${x - o / 2}" y="${y0 - 0.4 * s}" width="${w + o}" height="${0.4 * s}" fill="${fill}"/>`);
    top = y0 - 0.4 * s;
  } else if (h.roof === 'gable') {
    if (h.ridge === 'street') {
      const rh = h.width * 0.42 * s;
      out.push(`<polygon class="ink" points="${x - o},${y0} ${x + w / 2},${y0 - rh} ${x + w + o},${y0}" fill="${h.facade}"/>`);
      out.push(`<polyline class="roofline" points="${x - o},${y0} ${x + w / 2},${y0 - rh} ${x + w + o},${y0}" stroke="${fill}"/>`);
      top = y0 - rh;
    } else {
      const rh = h.depth * 0.42 * s;
      out.push(`<polygon class="ink" points="${x - o},${y0} ${x + o},${y0 - rh} ${x + w - o},${y0 - rh} ${x + w + o},${y0}" fill="${fill}"/>`);
      top = y0 - rh;
    }
  } else if (h.roof === 'shed') {
    const rh = h.width * 0.25 * s;
    out.push(`<polygon class="ink" points="${x - o},${y0} ${x + w + o},${y0 - rh} ${x + w + o},${y0 - rh + 0.4 * s} ${x - o},${y0 + 0.4 * s}" fill="${fill}"/>`);
    out.push(`<polygon class="ink" points="${x},${y0 + 0.4 * s} ${x + w},${y0 - rh + 0.4 * s} ${x + w},${y0 + 0.4 * s}" fill="${h.facade}"/>`);
    top = y0 - rh;
  } else if (h.roof === 'barrel') {
    const rh = (h.width / 2 + 0.3) * 0.45 * s;
    out.push(`<path class="ink" d="M${x - o / 2},${y0} A${w / 2 + o / 2},${rh} 0 0 1 ${x + w + o / 2},${y0} Z" fill="${fill}"/>`);
    top = y0 - rh;
  }
  return { svg: out.join(''), top };
}

function streetSvg() {
  const s = 6; // px pro Meter
  const gap = 13;
  const perRow = 24;
  const rows = [];
  for (let i = 0; i < projects.length; i += perRow) rows.push(projects.slice(i, i + perRow));
  if (!rows.length) rows.push([]);
  const marginX = 26;
  // Platz für die schrägen Beschriftungen (40°) aus der Textlänge schätzen
  const labelLen = (p) => (String(p.number).length + 1 + p.title.length) * 7.4;
  const labelRise = Math.ceil(Math.max(60, ...projects.map(labelLen)) * Math.sin(Math.PI * 40 / 180)) + 24;
  const tallest = Math.max(2, ...projects.map((p) => (p.house.floors === 0 ? 4.8 : drawnFloors(p.house))));
  const maxHouse = tallest * FLOOR_H * s + 10 * 0.42 * s;
  const rowH = labelRise + maxHouse + 58;
  const rowWidths = rows.map((r) => {
    let x = marginX, right = 0;
    for (const p of r) {
      const cx = x + (p.house.width * s) / 2;
      right = Math.max(right, cx + labelLen(p) * Math.cos(Math.PI * 40 / 180) + 20, x + p.house.width * s + marginX);
      x += p.house.width * s + gap;
    }
    return right;
  });
  const width = Math.max(900, Math.round(Math.max(...rowWidths)));
  const height = Math.round(rows.length * rowH + 34);
  const parts = [];
  rows.forEach((row, ri) => {
    const groundY = 34 + ri * rowH + labelRise + maxHouse;
    const houses = [];
    let x = marginX;
    for (const p of row) {
      houses.push({ p, x, ...houseSvg(p, x, groundY, s) });
      x += p.house.width * s + gap;
    }
    const labelY = Math.min(...houses.map((h) => h.top), groundY - 40) - 16;
    // Boden und Straße
    parts.push(`<rect class="street" x="0" y="${groundY}" width="${width}" height="22"/>`);
    parts.push(`<line class="ink" x1="0" y1="${groundY}" x2="${width}" y2="${groundY}"/>`);
    parts.push(`<line class="dash" x1="0" y1="${groundY + 11}" x2="${width}" y2="${groundY + 11}"/>`);
    for (const h of houses) {
      const cx = h.x + (h.p.house.width * s) / 2;
      parts.push(`<a href="${svgEsc(h.p.url)}"><g>${h.svg}`);
      parts.push(`<line class="leader" x1="${cx}" y1="${h.top - 4}" x2="${cx}" y2="${labelY + 2}"/>`);
      parts.push(
        `<text class="label" transform="translate(${cx + 2},${labelY}) rotate(-40)"><tspan class="num">${h.p.number}</tspan> ${svgEsc(h.p.title)}</text>`,
      );
      parts.push(`<text class="plate" x="${cx}" y="${groundY + 15}" text-anchor="middle">${h.p.number}</text></g></a>`);
    }
  });
  const title = `${config.streetName.toUpperCase()} · STRASSENABWICKLUNG`;
  const scaleX = width - 26 - 10 * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${svgEsc(config.streetName)}: ${projects.length} Projekte als Häuser">
<style>
  text { font-family: 'Barlow Semi Condensed', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif; fill: #1f2a36; }
  .ink { stroke: #1f2a36; stroke-width: 1.2; stroke-linejoin: round; }
  .roofline { fill: none; stroke-width: 3; stroke-linejoin: round; }
  .thin { stroke: #6b7280; stroke-width: 1; }
  .crane { stroke: #e0a526; stroke-width: 2.4; }
  .win { fill: #33414e; }
  .door { fill: #6b4f3a; }
  .street { fill: #d9d6cf; }
  .dash { stroke: #fbfaf6; stroke-width: 1.5; stroke-dasharray: 10 8; }
  .leader { stroke: #9aa3ad; stroke-width: 0.8; stroke-dasharray: 2 3; }
  .label { font-size: 15px; font-weight: 600; }
  .num { fill: #1f4e8c; font-weight: 700; }
  .plate { font-size: 11px; font-weight: 700; fill: #1f4e8c; }
  .meta { font-size: 12px; letter-spacing: 0.12em; fill: #6b7280; }
  .paper { fill: #ffffff; }
  .zig { fill: none; stroke: #1f2a36; stroke-width: 1; stroke-linejoin: round; }
  .floors { font-size: 10px; font-weight: 700; fill: #1f2a36; }
  @media (prefers-color-scheme: dark) {
    .paper { fill: #0d1117; }
    .zig { stroke: #e8e3d8; }
    .floors { fill: #e8e3d8; }
    text { fill: #e8e3d8; }
    .ink { stroke: #e8e3d8; }
    .street { fill: #2c3138; }
    .dash { stroke: #8b939c; }
    .num, .plate { fill: #8fb4e8; }
    .meta { fill: #9aa3ad; }
  }
</style>
<text class="meta" x="${marginX}" y="22">${svgEsc(title)} · ${projects.length} HÄUSER</text>
<g class="meta"><line class="ink" x1="${scaleX}" y1="16" x2="${scaleX + 10 * s}" y2="16"/><line class="ink" x1="${scaleX}" y1="12" x2="${scaleX}" y2="20"/><line class="ink" x1="${scaleX + 10 * s}" y1="12" x2="${scaleX + 10 * s}" y2="20"/><text x="${scaleX - 6}" y="20" text-anchor="end">10 m</text></g>
${parts.join('\n')}
</svg>
`;
}

const svgUrl = new URL('profile/street.svg', root);
const svgNew = streetSvg();
const svgOld = await readFile(svgUrl, 'utf8').catch(() => '');
if (svgNew !== svgOld) await writeFile(svgUrl, svgNew);

// ---------- Hat sich gegenüber der veröffentlichten Seite etwas geändert? ----------

let changed = true;
try {
  const live = await fetch(site + 'projects.json', { headers: { 'Cache-Control': 'no-cache' } });
  if (live.ok) {
    const old = await live.json();
    const strip = (d) => JSON.stringify({ ...d, generatedAt: null });
    changed = strip(old) !== strip(data);
  }
} catch {}
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);

console.log(
  `${projects.length} Projekte · README ${readmeNew !== readmeOld ? 'aktualisiert' : 'unverändert'} · ` +
    `SVG ${svgNew !== svgOld ? 'aktualisiert' : 'unverändert'} · Daten ${changed ? 'geändert' : 'unverändert'}`,
);
