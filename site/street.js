import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { houseFor, prettyTitle, FLOOR_H, rng, hash, MATERIALS, materialFor, nurdachCells, insetPolygon, saplingsAt, nextSaplingChange, SAPLINGS, styleLabel } from './house.mjs';
import { buildStyled, STYLED } from './styles.js';

// ---------- Maße der Straße (Meter) ----------
const STREET_HALF = 3.6;               // halbe Fahrbahn
const WALK = 2.6;                      // Gehweg
const CURB = STREET_HALF + WALK;       // Außenkante Gehweg
const YARD = 2.6;                      // Vorgarten
const SETBACK = CURB + YARD;           // Fassadenflucht
const START_Z = -14;                   // erstes Haus
const STEP_Z = 9;                      // Versatz zwischen Häusern (abwechselnd links/rechts)
const EYE = 1.7;
const SPEED = 6;
const ORG_FALLBACK = 'Jade-HS-Vibecoding-WPK';

const SIGN_FONT = '"Barlow Semi Condensed", "Arial Narrow", sans-serif';
const UI_FONT = 'Barlow, system-ui, sans-serif';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isNarrow = () => innerWidth <= 760;

const $ = (s) => document.querySelector(s);
function h(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) node.append(kid);
  return node;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---------- Daten ----------

async function loadData() {
  let data = null;
  try {
    const res = await fetch('projects.json', { cache: 'no-cache' });
    if (res.ok) data = await res.json();
  } catch {}
  const org = data?.org ?? ORG_FALLBACK;
  const exclude = new Set((data?.exclude ?? ['.github']).map((s) => s.toLowerCase()));
  const list = data?.projects ?? [];

  // Live nachschauen, ob seit dem letzten Update neue Repos dazugekommen sind.
  try {
    const res = await fetch(`https://api.github.com/orgs/${org}/repos?type=public&per_page=100`);
    if (res.ok) {
      const live = (await res.json()).filter((r) => !r.private && !exclude.has(r.name.toLowerCase()));
      const known = new Set(list.map((p) => p.name));
      for (const r of live) {
        if (known.has(r.name)) continue;
        list.push({
          name: r.name,
          title: prettyTitle(r.name),
          description: r.description ?? '',
          url: r.html_url,
          demo: r.homepage || (r.has_pages ? `https://${org.toLowerCase()}.github.io/${r.name}/` : null),
          language: r.language,
          createdAt: r.created_at,
          pushedAt: r.pushed_at,
          commits: null,
          empty: false,
          team: [],
          image: null,
          house: houseFor(r.name, null, false, r.language),
          fresh: true,
        });
      }
      if (live.length < 100) {
        const names = new Set(live.map((r) => r.name));
        for (let i = list.length - 1; i >= 0; i--) if (!names.has(list[i].name)) list.splice(i, 1);
      }
    }
  } catch {}

  list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  list.forEach((p, i) => (p.number = i + 1));
  return {
    org,
    streetName: data?.streetName ?? 'Vibecoding-Allee',
    subtitle: data?.subtitle ?? 'Projekte der KI-Werkstatt · Jade Hochschule',
    generatedAt: data?.generatedAt,
    projects: list,
  };
}

// ---------- Texte auf Leinwand ----------

function roundRect(g, x, y, w, hh, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + hh, r);
  g.arcTo(x + w, y + hh, x, y + hh, r);
  g.arcTo(x, y + hh, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fitText(g, text, maxW, maxH, weight, maxSize, minSize, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  for (let size = maxSize; size >= minSize; size -= 2) {
    g.font = `${weight} ${size}px ${SIGN_FONT}`;
    const lh = size * 1.02;
    const lines = [];
    let line = '';
    let ok = true;
    for (const w of words) {
      if (g.measureText(w).width > maxW) { ok = false; break; }
      const test = line ? `${line} ${w}` : w;
      if (g.measureText(test).width <= maxW) line = test;
      else { lines.push(line); line = w; }
    }
    if (!ok) continue;
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.length * lh <= maxH) return { size, lh, lines };
  }
  // Notlösung: lange Wörter hart umbrechen
  g.font = `${weight} ${minSize}px ${SIGN_FONT}`;
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (g.measureText(line + ch).width > maxW) { lines.push(line); line = ch.trim(); } else line += ch;
  }
  if (line) lines.push(line);
  return { size: minSize, lh: minSize * 1.02, lines: lines.slice(0, maxLines) };
}

let maxAniso = 4;
function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

/** Ausleger-Schild: Hausnummer + Projektname */
function signTexture(num, title, sub) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#1f2a36';
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = '#fbfaf6';
  roundRect(g, 18, 18, 988, 476, 28);
  g.fill();
  // Hausnummer
  g.fillStyle = '#1f4e8c';
  roundRect(g, 54, 140, 200, 232, 20);
  g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = 7;
  roundRect(g, 68, 154, 172, 204, 12);
  g.stroke();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 ${String(num).length > 2 ? 92 : 124}px ${SIGN_FONT}`;
  g.fillText(String(num), 154, 262);
  // Name
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#1f2a36';
  const top = 56, areaH = sub ? 330 : 400;
  const fit = fitText(g, title, 690, areaH, 700, 128, 50, 3);
  let y = top + (areaH - fit.lines.length * fit.lh) / 2 + fit.size * 0.8;
  for (const line of fit.lines) { g.fillText(line, 292, y); y += fit.lh; }
  if (sub) {
    g.font = `600 42px ${UI_FONT}`;
    g.fillStyle = '#c4561d';
    g.fillText(sub, 292, 448);
  }
  return canvasTexture(c);
}

function plateTexture(num) {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1f4e8c';
  roundRect(g, 0, 0, 160, 128, 14);
  g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = 6;
  roundRect(g, 10, 10, 140, 108, 8);
  g.stroke();
  g.fillStyle = '#fff';
  g.font = `700 ${String(num).length > 2 ? 58 : 76}px ${SIGN_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(num), 80, 68);
  return canvasTexture(c);
}

function bannerTexture(name, sub) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 224;
  const g = c.getContext('2d');
  g.fillStyle = '#1f2a36';
  g.fillRect(0, 0, 2048, 224);
  g.strokeStyle = '#fbfaf6';
  g.lineWidth = 6;
  g.strokeRect(16, 16, 2016, 192);
  g.fillStyle = '#fbfaf6';
  g.textAlign = 'center';
  g.font = `700 112px ${SIGN_FONT}`;
  g.fillText(name, 1024, 128);
  g.font = `600 40px ${UI_FONT}`;
  g.fillStyle = '#c9d6e6';
  g.fillText(sub, 1024, 186);
  return canvasTexture(c);
}

function streetSignTexture(name) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 232;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfbf8';
  g.fillRect(0, 0, 1024, 232);
  g.strokeStyle = '#111';
  g.lineWidth = 10;
  roundRect(g, 22, 22, 980, 188, 14);
  g.stroke();
  g.fillStyle = '#111';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const fit = fitText(g, name, 900, 160, 600, 140, 60, 1);
  g.font = `600 ${fit.size}px ${SIGN_FONT}`;
  g.fillText(name, 512, 122);
  return canvasTexture(c);
}

// ---------- Szene ----------

const canvas = $('#scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch {
  document.body.classList.add('no-webgl');
}

const scene = new THREE.Scene();
const HORIZON = new THREE.Color('#efe9df');
scene.background = HORIZON;
scene.fog = new THREE.Fog(HORIZON, 45, 170);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 600);

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...opts }));
  return matCache.get(key);
}
function mesh(geo, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
function box(w, hh, d, material, x = 0, y = 0, z = 0, opts) {
  const m = mesh(new THREE.BoxGeometry(w, hh, d), material, opts);
  m.position.set(x, y, z);
  return m;
}
function boxGeo(w, hh, d, x, y, z) {
  return new THREE.BoxGeometry(w, hh, d).translate(x, y, z);
}

function setupLights() {
  const hemi = new THREE.HemisphereLight('#f1f6ff', '#b6a98f', 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e2', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // großzügiger Schattenbereich, damit auch Hochhäuser Schatten werfen
  Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 420 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color('#86b3dc') }, bottom: { value: HORIZON.clone() }, stars: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform vec3 top; uniform vec3 bottom; uniform float stars; varying vec3 vDir;
        float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main() {
          float k = clamp(vDir.y * 1.8 + 0.02, 0.0, 1.0);
          vec3 col = mix(bottom, top, pow(k, 0.75));
          if (stars > 0.001) {
            float h = hash3(floor(vDir * 260.0));
            col += vec3(step(0.9975, h) * stars * smoothstep(0.04, 0.3, vDir.y) * (0.5 + 0.5 * fract(h * 91.7)));
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);
  return { sun, sky, hemi };
}

// ---------- Häuser ----------

function prism(points, length, material) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  geo.translate(0, 0, -length / 2);
  return mesh(geo, material);
}

/** Dach mit First entlang lokal Z (Spannweite über X). */
function buildRoof(type, span, length, wallMat, roofMat, r) {
  const g = new THREE.Group();
  const half = span / 2;
  const o = 0.45;
  const t = 0.24;
  if (type === 'gable') {
    const hh = span * 0.42;
    const ang = Math.atan2(hh, half);
    g.add(prism([[-half, 0], [half, 0], [0, hh]], length, wallMat));
    const len = (half + o) / Math.cos(ang);
    for (const s of [-1, 1]) {
      const m = box(len, t, length + 0.6, roofMat);
      const x0 = s * (half + o), y0 = -o * Math.tan(ang);
      m.position.set(x0 / 2 + s * Math.sin(ang) * t * 0.5, (y0 + hh) / 2 + Math.cos(ang) * t * 0.5, 0);
      m.rotation.z = -s * ang;
      g.add(m);
    }
    return { group: g, height: hh };
  }
  if (type === 'shed') {
    const hh = span * 0.25;
    const ang = Math.atan2(hh, span);
    g.add(prism([[-half, 0], [half, 0], [half, hh]], length, wallMat));
    const m = box((span + 2 * o) / Math.cos(ang), t, length + 0.6, roofMat);
    m.position.set(-Math.sin(ang) * t * 0.5, hh / 2 + Math.cos(ang) * t * 0.5, 0);
    m.rotation.z = ang;
    g.add(m);
    return { group: g, height: hh };
  }
  if (type === 'barrel') {
    const rad = half + 0.3, k = 0.45, hh = rad * k;
    // Giebelwand bündig mit der Fassade, genau unter der Tonnenschale
    const pts = [[-half, 0]];
    for (let i = 0; i <= 20; i++) {
      const x = -half + (span * i) / 20;
      pts.push([x, Math.max(0, hh * Math.sqrt(1 - (x * x) / (rad * rad)) - 0.04)]);
    }
    pts.push([half, 0]);
    g.add(prism(pts, length, wallMat));
    // Schale offen und beidseitig sichtbar, damit sie auch von unten stimmt
    const shellMat = roofMat.clone();
    shellMat.side = THREE.DoubleSide;
    const geo = new THREE.CylinderGeometry(rad, rad, length + 0.6, 32, 1, true, Math.PI / 2, Math.PI);
    geo.rotateX(Math.PI / 2);
    const m = mesh(geo, shellMat);
    m.scale.y = k;
    g.add(m);
    return { group: g, height: hh };
  }
  // flach
  g.add(box(span + 0.5, 0.36, length + 0.5, roofMat, 0, 0.18, 0));
  g.add(box(span + 0.5, 0.5, 0.18, wallMat, 0, 0.6, (length + 0.5) / 2 - 0.09));
  if (r() < 0.6) g.add(box(2.2, 1.7, 2.4, wallMat, (r() - 0.5) * (span - 3), 1.2, -(r() * 0.4) * length));
  return { group: g, height: 0.5 };
}

const glassMat = new THREE.MeshStandardMaterial({ color: '#2f3b47', roughness: 0.3, metalness: 0.2 });
const litMat = new THREE.MeshStandardMaterial({ color: '#ffe2a0', emissive: '#ffc964', emissiveIntensity: 0.85, roughness: 0.6 });
const frameMat = new THREE.MeshStandardMaterial({ color: '#f7f5ef', roughness: 0.8 });

// ---------- Fassadenmaterial nach Programmiersprache ----------
// Texturen werden im Browser gezeichnet. Eine Kachel = 3 m = ein Geschoss,
// damit Fugen und Steinlagen an jeder Geschossgrenze bündig sitzen.
const FACADE_TILE = 3;
const facadeTexCache = new Map();

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const m = (v) => clamp(Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)), 0, 255);
  return `rgb(${m(n >> 16)},${m((n >> 8) & 255)},${m(n & 255)})`;
}

function speckle(g, S, r, amount, count = 9000) {
  for (let i = 0; i < count; i++) {
    const v = r() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${(amount * r()).toFixed(3)})`;
    g.fillRect(r() * S, r() * S, 2, 2);
  }
}

function facadeTexture(material, color) {
  const key = material === 'putz' ? 'putz' : material + color;
  if (facadeTexCache.has(key)) return facadeTexCache.get(key);
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = rng(hash(key));
  if (material === 'klinker') {
    // Normalformat: 25 × 8,3 cm inkl. Fuge, Läuferverband
    g.fillStyle = '#d8d1c5';
    g.fillRect(0, 0, S, S);
    const rows = 36, cols = 12, bh = S / rows, bw = S / cols;
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * (bw / 2);
      for (let x = -1; x < cols; x++) {
        g.fillStyle = shade(color, (r() - 0.5) * 0.28);
        g.fillRect(x * bw + off + 1.2, y * bh + 1.2, bw - 2.4, bh - 2.4);
      }
    }
  } else if (material === 'holz') {
    // Boden-Deckel-Schalung, 15 cm Bretter
    const n = 20, bw = S / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = shade(color, (r() - 0.5) * 0.22);
      g.fillRect(i * bw, 0, bw, S);
      g.strokeStyle = 'rgba(60,38,18,0.16)';
      g.lineWidth = 1;
      for (let k = 0; k < 5; k++) {
        const x = i * bw + 3 + r() * (bw - 6);
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + r() * 5 - 2.5, S * 0.33, x + r() * 5 - 2.5, S * 0.66, x, S);
        g.stroke();
      }
      g.fillStyle = 'rgba(45,28,12,0.6)';
      g.fillRect(i * bw, 0, 2.5, S);
    }
  } else if (material === 'beton') {
    // Sichtbeton mit Schalungsstößen (1,5 × 0,75 m) und Ankerlöchern
    g.fillStyle = color;
    g.fillRect(0, 0, S, S);
    speckle(g, S, r, 0.08);
    g.strokeStyle = 'rgba(55,55,55,0.28)';
    g.lineWidth = 2;
    for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo((i * S) / 2, 0); g.lineTo((i * S) / 2, S); g.stroke(); }
    for (let j = 0; j <= 4; j++) { g.beginPath(); g.moveTo(0, (j * S) / 4); g.lineTo(S, (j * S) / 4); g.stroke(); }
    g.fillStyle = 'rgba(45,45,45,0.5)';
    for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) for (const fx of [0.25, 0.75]) {
      g.beginPath();
      g.arc(((i + fx) * S) / 2, ((j + 0.5) * S) / 4, 3.2, 0, Math.PI * 2);
      g.fill();
    }
  } else if (material === 'metall') {
    // Trapezblech, 20 cm Profil
    const n = 15, w = S / n;
    for (let i = 0; i < n; i++) {
      const grad = g.createLinearGradient(i * w, 0, (i + 1) * w, 0);
      grad.addColorStop(0, shade(color, -0.16));
      grad.addColorStop(0.2, shade(color, 0.18));
      grad.addColorStop(0.45, color);
      grad.addColorStop(0.75, shade(color, -0.08));
      grad.addColorStop(1, shade(color, -0.16));
      g.fillStyle = grad;
      g.fillRect(i * w, 0, w, S);
    }
  } else {
    // Putz: helle Körnung, die Farbe kommt über die Materialfarbe
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, S, S);
    speckle(g, S, r, 0.07, 12000);
  }
  const t = canvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / FACADE_TILE, 1 / FACADE_TILE);
  facadeTexCache.set(key, t);
  return t;
}

/** UVs eines Quaders in Metern, damit Texturen nicht verzerrt werden. */
function meterUVs(geo, w, hh, d) {
  const uv = geo.attributes.uv;
  const dims = [[d, hh], [d, hh], [w, d], [w, d], [w, hh], [w, hh]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
  }
  uv.needsUpdate = true;
  return geo;
}

// Schilder leuchten nachts (Hinterleuchtung über emissiveMap)
const glowMats = [];
function signMaterial(tex, roughness = 0.6) {
  const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0, roughness });
  glowMats.push(m);
  return m;
}

/** Flaches Polygon (Giebelkoordinaten in Metern) als dünne Platte vor der Fassade. */
function plateGeo(poly, z, depth, hole = null) {
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
  if (hole) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, z);
  return geo;
}

// Fassadenmaterial wie bei den normalen Häusern, für die eigenen Bauweisen
const facadeMatCache = new Map();
function facadeMaterial(material, color) {
  const key = material + color;
  if (!facadeMatCache.has(key)) {
    facadeMatCache.set(key, new THREE.MeshStandardMaterial({
      map: facadeTexture(material, color),
      color: material === 'putz' ? color : '#ffffff',
      roughness: material === 'metall' ? 0.55 : 0.92,
      metalness: material === 'metall' ? 0.15 : 0,
    }));
  }
  return facadeMatCache.get(key);
}
function numberPlate(g, plateTex, x, y, z) {
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.3), signMaterial(plateTex, 0.5));
  plate.position.set(x, y, z);
  g.add(plate);
}
// Dinge, die sich mit der Uhrzeit ändern (z. B. die Jetzt-Linie am Gantt-Haus), alle 30 s
const tickers = [];
// Bewegte Teile einzelner Bauweisen (Wasserstand, Tornado, Wind …), einmal pro Bild
const framers = [];
let frameTime = 0;

function addDoor(g, front, plateTex) {
  g.add(box(1.4, 2.45, 0.08, frameMat, 0, 1.5, front + 0.02, { cast: false }));
  g.add(box(1.15, 2.25, 0.12, mat('#6b4f3a', { roughness: 0.7 }), 0, 1.42, front + 0.04, { cast: false }));
  g.add(box(1.9, 0.18, 0.7, mat('#b9b3a8'), 0, 0.09, front + 0.35));
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.3), signMaterial(plateTex, 0.5));
  plate.position.set(0, 2.12, front + 0.105);
  g.add(plate);
}

/** Nurdachhaus: Dachflächen bis zum Boden, Giebel zur Straße. Wächst mit Fensterabteilen statt Geschossen. */
function buildNurdach(g, hs, bodyMat, roofMat, r, active, plateTex) {
  const W = hs.width, Hp = hs.height, D = hs.depth, front = D / 2;
  const half = W / 2, ang = Math.atan2(Hp, half);
  const t = 0.3, over = 0.8;
  g.add(box(W + 0.8, 0.25, D + 0.4, mat('#8f8a82'), 0, 0.125, 0));
  g.add(prism([[-half, 0], [half, 0], [0, Hp]], D, bodyMat));

  // Dachflächen vom First bis in den Boden, vorne und hinten weit überstehend
  const L = Math.hypot(half, Hp), a = t, b = 0.45;
  const u = (L + b - a) / 2;
  const trim = mat('#efe9dc', { roughness: 0.8 });
  for (const s of [-1, 1]) {
    const dx = s * Math.cos(ang), dy = -Math.sin(ang);
    const nx = s * Math.sin(ang), ny = Math.cos(ang);
    const x = dx * u + nx * t / 2, y = Hp + dy * u + ny * t / 2;
    const slab = box(L + a + b, t, D + 2 * over, roofMat, x, y, 0);
    slab.rotation.z = -s * ang;
    g.add(slab);
    // helle Stirnbretter an der Dachkante
    for (const zz of [front + over, -front - over]) {
      const board = box(L + a + b, t + 0.06, 0.1, trim, x, y, zz + Math.sign(zz) * 0.05, { cast: false });
      board.rotation.z = -s * ang;
      g.add(board);
    }
  }
  g.add(box(0.7, 0.3, D + 2 * over + 0.2, mat('#3d3a36', { roughness: 0.7 }), 0, Hp + t / Math.cos(ang) - 0.2, 0));

  // Fensterabteile im Giebel, zwei pro Verdopplung der Commits
  const frames = [], dark = [], lit = [];
  nurdachCells().slice(0, hs.windows ?? 0).forEach((cell) => {
    const glass = insetPolygon(cell, 0.17);
    frames.push(plateGeo(insetPolygon(cell, 0.05), front, 0.12, glass)); // Rahmen als Ring
    (active && r() < 0.6 ? lit : dark).push(plateGeo(glass, front, 0.05));
  });
  if (frames.length) g.add(mesh(mergeGeometries(frames), frameMat, { cast: false }));
  if (dark.length) g.add(mesh(mergeGeometries(dark), glassMat, { cast: false }));
  if (lit.length) g.add(mesh(mergeGeometries(lit), litMat, { cast: false }));

  addDoor(g, front, plateTex);
}

// ---------- Block-Stil (Test für Haus 11) ----------
// Alles in 1-m-Blöcken mit 16×16-Pixeltexturen; ein Geschoss = 3 Blöcke.
// Das Gründach nutzt den Erdblock aus dem Icon des Teams (urban-analysis-plugin).

const pixelTexCache = new Map();
const blockLitMats = [];
function pixelTexture(key, draw, w = 16, hh = 16) {
  if (pixelTexCache.has(key)) return pixelTexCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = hh;
  const g = c.getContext('2d');
  draw(g, rng(hash(key)), c);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  pixelTexCache.set(key, t);
  return t;
}
const pix = (g, x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
const jit = (hex, r, amt) => shade(hex, (r() - 0.5) * amt);

function planksTex(color) {
  return pixelTexture(`planks${color}`, (g, r) => {
    const base = '#d2ab78'; // helle Dielen
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pix(g, x, y, jit(base, r, 0.1));
    for (let row = 0; row < 4; row++) {
      for (let x = 0; x < 16; x++) pix(g, x, row * 4 + 3, shade(base, -0.24));
      const j = row % 2 ? 4 : 12;
      for (let y = row * 4; y < row * 4 + 3; y++) pix(g, j, y, shade(base, -0.18));
    }
    for (let i = 0; i < 10; i++) pix(g, Math.floor(r() * 16), Math.floor(r() * 4) * 4 + Math.floor(r() * 3), shade(base, -0.1));
  });
}
function logTex(horizontal) {
  return pixelTexture(`log${horizontal}`, (g, r) => {
    const base = '#86643d';
    for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) {
      const groove = a % 5 === 1 || (a % 5 === 3 && r() < 0.4);
      const col = shade(base, (groove ? -0.35 : 0) + (r() - 0.5) * 0.18);
      horizontal ? pix(g, b, a, col) : pix(g, a, b, col);
    }
  });
}
function glassTex(lit) {
  return pixelTexture(`glass${lit}`, (g, r) => {
    const base = lit ? '#ffd98a' : '#a9cddd', edge = lit ? '#c98f3a' : '#e9f4f8', hi = lit ? '#fff3cf' : '#ffffff';
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pix(g, x, y, jit(base, r, 0.06));
    for (let i = 0; i < 16; i++) { pix(g, i, 0, edge); pix(g, i, 15, edge); pix(g, 0, i, edge); pix(g, 15, i, edge); }
    for (const [x, y] of [[3, 4], [4, 3], [4, 5], [5, 4], [10, 9], [11, 8], [12, 7]]) pix(g, x, y, hi);
  });
}
function doorTex() {
  return pixelTexture('door', (g, r) => {
    const wood = '#7a5533';
    for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) pix(g, x, y, jit(wood, r, 0.14));
    for (let y = 0; y < 32; y++) { pix(g, 0, y, shade(wood, -0.4)); pix(g, 15, y, shade(wood, -0.4)); pix(g, 7, y, shade(wood, -0.25)); }
    for (let x = 0; x < 16; x++) { pix(g, x, 0, shade(wood, -0.4)); pix(g, x, 31, shade(wood, -0.4)); pix(g, x, 16, shade(wood, -0.3)); }
    for (const [x0, y0] of [[2, 3], [9, 3]]) for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + 5; x++) pix(g, x, y, '#a9cddd');
    pix(g, 12, 19, '#d8c070'); pix(g, 12, 20, '#b09a50');
  }, 16, 32);
}
function grassTopTex() {
  return pixelTexture('grassTop', (g, r) => {
    const cols = ['#5c9c33', '#5c9c33', '#86c74f', '#3b6b1f'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pix(g, x, y, cols[Math.floor(r() * cols.length)]);
  });
}
function dirtTex() {
  return pixelTexture('dirt', (g, r) => {
    const cols = ['#8a5a32', '#8a5a32', '#5a3a1f', '#b07b4b', '#3e2814'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pix(g, x, y, cols[Math.floor(r() * cols.length)]);
  });
}
function leavesTex() {
  return pixelTexture('leaves', (g, r) => {
    const cols = ['#3b6b1f', '#5c9c33', '#4a8228', '#86c74f', '#2c5217'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pix(g, x, y, cols[Math.floor(r() * cols.length)]);
  });
}
// Seitenansicht des Erdblocks: das SVG-Icon des Teams, pixelgenau auf 16×16 gezeichnet
function erdblockTex() {
  return pixelTexture('erdblock', (g, r, c) => {
    g.drawImage(dirtTex().image, 0, 0);
    const img = new Image();
    img.onload = () => { g.clearRect(0, 0, 16, 16); g.drawImage(img, 0, 0, 16, 16); pixelTexCache.get('erdblock').needsUpdate = true; };
    img.src = './blocks/erdblock.svg';
  });
}
function blockMat(tex, opts = {}) {
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, ...opts });
}
let erdMats = null;
function erdblockMats() {
  if (!erdMats) {
    const side = blockMat(erdblockTex()), top = blockMat(grassTopTex()), bottom = blockMat(dirtTex());
    erdMats = [side, side, top, bottom, side, side];
  }
  return erdMats;
}
function blockBox(w, hh, d, material, x, y, z) {
  const m = mesh(meterUVs(new THREE.BoxGeometry(w, hh, d), w, hh, d), material);
  m.position.set(x, y, z);
  return m;
}

// ---------- Baumschule am Block-Haus ----------
// Jeden Tag ein neuer Setzling auf einem Erdblock, alle 8 Stunden eine Stufe größer
// (Zeitplan in house.mjs). Stufe 1 = Setzling, Stufe 5 = 5 Blöcke hoher Baum mit Äpfeln.
function saplingTex() {
  return pixelTexture('sapling', (g, r) => {
    const greens = ['#3b6b1f', '#5c9c33', '#4a8228', '#86c74f'];
    for (const [cx, cy, rad] of [[8, 4.5, 3.2], [4.5, 8, 2.5], [11.5, 8.5, 2.6], [8, 9.5, 1.8]]) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= rad && (d < rad - 0.9 || r() < 0.55)) pix(g, x, y, greens[Math.floor(r() * greens.length)]);
      }
    }
    for (let y = 10; y < 16; y++) pix(g, 7, y, y % 3 ? '#6b4a2b' : '#53381f');
    pix(g, 8, 13, '#6b4a2b'); pix(g, 6, 11, '#6b4a2b');
  });
}
function fruitLeavesTex() {
  return pixelTexture('leavesFruit', (g, r) => {
    g.drawImage(leavesTex().image, 0, 0);
    for (const [x, y] of [[3, 2], [11, 4], [6, 9], [13, 12], [2, 13], [9, 14]]) {
      pix(g, x, y, '#d6352b'); pix(g, x + 1, y, '#b3241d'); pix(g, x, y + 1, '#b3241d'); pix(g, x + 1, y + 1, '#8f1a15');
    }
  });
}
let gardenMats = null;
function saplingMats() {
  gardenMats ??= {
    sapling: blockMat(saplingTex(), { alphaTest: 0.5, side: THREE.DoubleSide }),
    log: blockMat(logTex(false)),
    leaves: blockMat(leavesTex()),
    fruit: blockMat(fruitLeavesTex()),
  };
  return gardenMats;
}
function saplingTree(stage, x, z) {
  const m = saplingMats(), t = new THREE.Group();
  t.add(blockBox(1, 1, 1, erdblockMats(), x, 0.5, z));
  if (stage <= 1) {
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), m.sapling);
      s.position.set(x, 1.45, z);
      s.rotation.y = a;
      t.add(s);
    }
    return t;
  }
  const trunk = stage === 5 ? 2 : 1;
  t.add(blockBox(1, trunk, 1, m.log, x, 1 + trunk / 2, z));
  const L = stage === 5 ? m.fruit : m.leaves;
  const leaf = (w, hh, d, y, dz = 0) => t.add(blockBox(w, hh, d, L, x, 1 + y + hh / 2, z + dz));
  if (stage === 2) leaf(1, 1, 1, 1);
  if (stage === 3) { leaf(3, 1, 3, 1); leaf(1, 1, 1, 2); }
  if (stage === 4) { leaf(3, 2, 3, 1); leaf(1, 1, 1, 3); }
  if (stage === 5) { leaf(3, 2, 3, 2); leaf(3, 1, 1, 4); leaf(1, 1, 1, 4, -1); leaf(1, 1, 1, 4, 1); }
  return t;
}
// Beete neben dem Haus (Seite ohne Ausleger-Schild): 2 Reihen, von der Straße nach hinten
const gardens = [];
function buildGarden(g, hs, p, index, gs) {
  const gd = { group: new THREE.Group(), p, index, gs, W: hs.width, front: hs.depth / 2, key: null };
  g.add(gd.group);
  gardens.push(gd);
  refreshGarden(gd);
}
function refreshGarden(gd) {
  const stages = saplingsAt(gd.p.createdAt);
  const key = stages.join(',');
  if (key === gd.key) return;
  gd.key = key;
  gd.group.traverse((o) => o.geometry?.dispose());
  gd.group.clear();
  stages.forEach((stage, k) => {
    const x = gd.gs * (gd.W / 2 + 2 + (k % 2) * 4);
    const z = gd.front - 1.5 - Math.floor(k / 2) * 4;
    gd.group.add(saplingTree(stage, x, z));
  });
  gd.group.traverse((o) => (o.userData.house = gd.index));
}
function saplingFact(since) {
  const stages = saplingsAt(since);
  if (!stages.length) return 'noch nichts gepflanzt';
  const list = new Intl.ListFormat('de', { type: 'conjunction' }).format(stages.map(String));
  const head = stages.length === 1
    ? `1 Setzling, Stufe ${list} von ${SAPLINGS.stages}`
    : `${stages.length} Setzlinge, Stufe ${list} von ${SAPLINGS.stages}`;
  const next = nextSaplingChange(since);
  if (!next) return `${head} · fertig gewachsen`;
  const d = new Date(next);
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const day = d.toDateString() === new Date().toDateString() ? '' : `${d.toLocaleDateString('de-DE', { weekday: 'short' })} `;
  return `${head} · wächst wieder ${day}${time} Uhr`;
}

function buildVoxel(g, hs, r, active, plateTex) {
  const W = hs.width, D = hs.depth, H = hs.floors * FLOOR_H, front = D / 2;
  const planks = blockMat(planksTex(hs.facade));
  const logV = blockMat(logTex(false)), logH = blockMat(logTex(true));
  g.add(blockBox(W, H, D, planks, 0, H / 2, 0));
  // Eckpfosten aus Stämmen und ein Balkenkranz auf jeder Geschossgrenze
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(blockBox(1.04, H, 1.04, logV, sx * (W / 2 - 0.5), H / 2, sz * (D / 2 - 0.5)));
  for (let f = 0; f < hs.floors; f++) g.add(blockBox(W + 0.02, 1, D + 0.02, logH, 0, f * FLOOR_H + 0.5, 0));

  // Fenster: je 1×2 Blöcke, auf jedem zweiten Block zwischen den Pfosten
  const dark = [], lit = [];
  const add = (w, d, x, y, z) => (active && r() < 0.55 ? lit : dark).push(meterUVs(boxGeo(w, 2, d, x, y, z), w, 2, d));
  const doorX = W % 2 ? 0 : -0.5;
  for (let f = 0; f < hs.floors; f++) {
    const y = f * FLOOR_H + 2;
    for (let i = 1; i < W - 1; i += 2) {
      const x = -W / 2 + 0.5 + i;
      if (f === 0 && Math.abs(x - doorX) < 1.5) continue;
      for (const sz of [-1, 1]) add(1, 0.08, x, y, sz * (front + 0.03));
    }
    for (let i = 1; i < D - 1; i += 2) {
      const z = -D / 2 + 0.5 + i;
      for (const sx of [-1, 1]) add(0.08, 1, sx * (W / 2 + 0.03), y, z);
    }
  }
  if (dark.length) g.add(mesh(mergeGeometries(dark), blockMat(glassTex(false), { roughness: 0.4 }), { cast: false }));
  if (lit.length) {
    const tex = glassTex(true);
    const m = blockMat(tex, { emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.85, roughness: 0.6 });
    blockLitMats.push(m);
    g.add(mesh(mergeGeometries(lit), m, { cast: false }));
  }

  // Tür (1×2 Blöcke), Hausnummer darüber
  g.add(box(1, 2, 0.1, blockMat(doorTex()), doorX, 1, front + 0.05, { cast: false }));
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.3), signMaterial(plateTex, 0.5));
  plate.position.set(doorX, 2.4, front + 0.06);
  g.add(plate);

  // Gründach aus Erdblöcken mit kleinem Baum
  g.add(blockBox(W, 1, D, erdblockMats(), 0, H + 0.5, 0));
  const tx = -W / 2 + 1.5, tz = -D / 2 + 1.5;
  g.add(blockBox(1, 2, 1, logV, tx, H + 2, tz));
  g.add(blockBox(3, 2, 3, blockMat(leavesTex()), tx, H + 3.5, tz));
  g.add(blockBox(1, 1, 1, blockMat(leavesTex()), tx, H + 5, tz));

  // Vorgarten: eine Reihe Erdblöcke statt Hecke, Weg in der Mitte frei
  for (let i = 0; i < W; i++) {
    const x = -W / 2 + 0.5 + i;
    if (Math.abs(x - doorX) < 1.5) continue;
    g.add(blockBox(1, 1, 1, erdblockMats(), x, 0.5, front + YARD - 0.5));
  }
}

function buildHouse(p, index, signTex, plateTex) {
  const hs = p.house;
  const side = index % 2 === 0 ? -1 : 1;
  const z = START_Z - index * STEP_Z;
  const nurdach = hs.style === 'nurdach' && hs.floors > 0;
  const W = hs.width, D = hs.depth, H = nurdach ? hs.height : hs.floors * FLOOR_H;
  const r = rng(hs.seed);
  const active = p.pushedAt && Date.now() - Date.parse(p.pushedAt) < 24 * 3600 * 1000;

  const g = new THREE.Group();
  g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  g.position.set(side * (SETBACK + D / 2), 0, z);

  const material = hs.material ?? materialFor(p.language);
  const bodyMat = hs.floors > 0
    ? new THREE.MeshStandardMaterial({
        map: facadeTexture(material, hs.facade),
        color: material === 'putz' ? hs.facade : '#ffffff',
        roughness: material === 'metall' ? 0.55 : 0.92,
        metalness: material === 'metall' ? 0.15 : 0,
      })
    : new THREE.MeshStandardMaterial({ color: '#b9b4ab', roughness: 0.92 });
  const roofMat = mat(hs.roofColor, { roughness: 0.8 });
  const front = D / 2;
  // Ecke Richtung Straßeneingang (für das Ausleger-Schild)
  // (beim Nurdachhaus dort, wo der Giebel in Auslegerhöhe noch breit genug ist)
  const cornerOff = nurdach ? (W / 2) * (1 - 3.25 / H) - 0.35 : W / 2 - 0.6;
  const cornerX = side < 0 ? -cornerOff : cornerOff;
  let styled = null;

  if (nurdach) {
    buildNurdach(g, hs, bodyMat, roofMat, r, active, plateTex);
  } else if (hs.style === 'voxel' && hs.floors > 0) {
    buildVoxel(g, hs, r, active, plateTex);
    if (hs.saplings && p.createdAt) buildGarden(g, hs, p, index, side < 0 ? 1 : -1);
  } else if (STYLED.has(hs.style) && hs.floors > 0) {
    // eigene Bauweise nach dem Design des Projekts (site/styles.js)
    styled = buildStyled(g, p, hs, {
      mat, mesh, box, boxGeo, meterUVs, facadeMaterial, addDoor, buildRoof, glassMat, litMat, frameMat,
      numberPlate: (gg, x, y, zz) => numberPlate(gg, plateTex, x, y, zz),
      plateTex, r, active, gs: side < 0 ? 1 : -1, onTick: (fn) => tickers.push(fn),
      onFrame: (fn) => framers.push(fn), still: reduceMotion,
    });
  } else if (hs.floors > 0) {
    g.add(box(W + 0.3, 0.3, D + 0.3, mat('#8f8a82'), 0, 0.15, 0));
    const body = mesh(meterUVs(new THREE.BoxGeometry(W, H, D), W, H, D), bodyMat);
    body.position.y = H / 2;
    g.add(body);

    // Fenster (zusammengefasst zu wenigen Meshes)
    const dark = [], lit = [], frames = [];
    const cols = Math.max(2, Math.floor((W - 1) / 2));
    const addWin = (geoW, geoD, x, y, zz) => {
      frames.push(boxGeo(geoW + 0.2, 1.65, geoD + 0.0, x, y, zz));
      const glass = boxGeo(geoW, 1.45, geoD + 0.04, x, y, zz);
      (active && r() < 0.55 ? lit : dark).push(glass);
    };
    for (let f = 0; f < hs.floors; f++) {
      const y = f * FLOOR_H + 1.75;
      for (let c = 0; c < cols; c++) {
        const x = -W / 2 + (W * (c + 0.5)) / cols;
        if (f === 0 && Math.abs(x) < 1.3) continue;
        addWin(1.1, 0.08, x, y, front + 0.02);
      }
      const sideCols = Math.max(1, Math.floor((D - 1.5) / 2.6));
      for (let j = 0; j < sideCols; j++) {
        const zz = -D / 2 + (D * (j + 0.5)) / sideCols;
        for (const sx of [-1, 1]) {
          frames.push(boxGeo(0.08, 1.65, 1.3, sx * (W / 2 + 0.02), y, zz));
          (active && r() < 0.55 ? lit : dark).push(boxGeo(0.12, 1.45, 1.1, sx * (W / 2 + 0.02), y, zz));
        }
      }
    }
    if (frames.length) g.add(mesh(mergeGeometries(frames), frameMat, { cast: false }));
    if (dark.length) g.add(mesh(mergeGeometries(dark), glassMat, { cast: false }));
    if (lit.length) g.add(mesh(mergeGeometries(lit), litMat, { cast: false }));

    // Tür, Stufe, Hausnummer
    addDoor(g, front, plateTex);

    // Dach
    const roof = hs.ridge === 'street'
      ? buildRoof(hs.roof, W, D, bodyMat, roofMat, r)
      : buildRoof(hs.roof, D, W, bodyMat, roofMat, r);
    if (hs.ridge !== 'street') roof.group.rotation.y = Math.PI / 2;
    roof.group.position.y = H;
    g.add(roof.group);
  } else {
    // Baustelle: Fundament, Gerüst, Kran, Bauzaun
    g.add(box(W, 0.5, D, bodyMat, 0, 0.25, 0));
    const steel = [];
    const sh = 6.6;
    const nx = Math.ceil(W / 2), nz = Math.ceil(D / 2);
    for (let i = 0; i <= nx; i++) for (const zz of [-D / 2 - 0.5, D / 2 + 0.5]) steel.push(boxGeo(0.08, sh, 0.08, -W / 2 + (W * i) / nx, sh / 2, zz));
    for (let i = 0; i <= nz; i++) for (const xx of [-W / 2 - 0.5, W / 2 + 0.5]) steel.push(boxGeo(0.08, sh, 0.08, xx, sh / 2, -D / 2 + (D * i) / nz));
    for (const y of [2.2, 4.4, 6.6]) {
      for (const zz of [-D / 2 - 0.5, D / 2 + 0.5]) steel.push(boxGeo(W + 1, 0.07, 0.07, 0, y, zz));
      for (const xx of [-W / 2 - 0.5, W / 2 + 0.5]) steel.push(boxGeo(0.07, 0.07, D + 1, xx, y, 0));
    }
    g.add(mesh(mergeGeometries(steel), mat('#9aa3ab', { metalness: 0.4, roughness: 0.5 })));
    const planks = [boxGeo(W + 1, 0.06, 0.8, 0, 2.2, front + 0.5), boxGeo(W + 1, 0.06, 0.8, 0, 4.4, front + 0.5)];
    g.add(mesh(mergeGeometries(planks), mat('#c79a5b')));
    const yellow = mat('#f0b23a', { roughness: 0.6 });
    const cx = -W / 2 + 1.2, cz = -D / 2 + 1.4, ch = 16;
    g.add(box(0.75, ch, 0.75, yellow, cx, ch / 2, cz));
    g.add(box(15, 0.55, 0.55, yellow, cx + 4, ch + 0.3, cz));
    g.add(box(1.6, 1.1, 1.1, mat('#6b7280'), cx - 3, ch, cz));
    g.add(box(1.1, 1.1, 1.1, yellow, cx + 0.6, ch - 0.7, cz));
    g.add(box(0.04, 6, 0.04, mat('#333'), cx + 8, ch - 3, cz, { cast: false }));
    g.add(box(0.4, 0.4, 0.4, mat('#333'), cx + 8, ch - 6.2, cz));
    g.add(box(W + 1.4, 1.8, 0.06, mat('#e7dfcd'), 0, 0.9, front + YARD - 0.6));
  }

  // Vorgarten: Weg und Hecken
  g.add(box(1.5, 0.05, YARD, mat('#cfc8bb'), 0, 0.025, front + YARD / 2, { cast: false }));
  const hedgeW = (W - 1.5) / 2 - 0.4;
  if (hedgeW > 0.6 && hs.floors > 0 && hs.style !== 'voxel' && styled?.hedges !== false) {
    const hedge = mat(r() < 0.5 ? '#7f9a63' : '#8aa56c');
    for (const s of [-1, 1]) g.add(box(hedgeW, 0.75, 0.55, hedge, s * (0.75 + 0.2 + hedgeW / 2), 0.375, front + YARD - 0.4));
  }

  // Ausleger-Schild (beidseitig lesbar, quer zur Straße) – Stile mit eigenem Schild schalten es ab
  if (styled?.sign !== false) {
    const metal = mat('#2b333c', { metalness: 0.5, roughness: 0.4 });
    const armY = hs.floors > 0 ? Math.min(3.25, H - 0.2) : 3.4;
    // an der Fassade – oder auf der Baustelle an einem Pfosten am Zaun
    const anchorZ = hs.floors > 0 ? front : front + YARD - 0.9;
    if (hs.floors === 0) g.add(box(0.14, armY + 0.1, 0.14, metal, cornerX, (armY + 0.1) / 2, anchorZ));
    g.add(box(0.07, 0.07, 3.3, metal, cornerX, armY, anchorZ + 1.65, { cast: false }));
    const signMat = signMaterial(signTex);
    const signFrame = mat('#1f2a36');
    const sign = mesh(new THREE.BoxGeometry(0.06, 1.4, 2.8), [signMat, signMat, signFrame, signFrame, signFrame, signFrame]);
    sign.position.set(cornerX, armY - 0.88, anchorZ + 1.75);
    g.add(sign);
    for (const dz of [-1.1, 1.1]) g.add(box(0.03, 0.18, 0.03, metal, cornerX, armY - 0.12, anchorZ + 1.75 + dz, { cast: false }));
  }

  g.traverse((o) => (o.userData.house = index));
  g.userData.house = index;
  scene.add(g);
  return { p, group: g, side, z, bodyMat, top: H + 3 };
}

// ---------- Umgebung ----------

function buildWorld(endZ, info) {
  const len = 14 - endZ + 40;
  const midZ = (14 + endZ - 40) / 2;

  const lawn = mesh(new THREE.PlaneGeometry(600, len + 400), mat('#c3d0aa'), { cast: false });
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.z = midZ;
  scene.add(lawn);

  const road = mesh(new THREE.PlaneGeometry(STREET_HALF * 2, len), mat('#858a8f', { roughness: 0.95 }), { cast: false });
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, midZ);
  scene.add(road);

  // Mittellinie
  const dc = document.createElement('canvas');
  dc.width = 8; dc.height = 64;
  const dg = dc.getContext('2d');
  dg.fillStyle = '#f4f1ea';
  dg.fillRect(0, 0, 8, 34);
  const dashTex = new THREE.CanvasTexture(dc);
  dashTex.wrapT = THREE.RepeatWrapping;
  dashTex.repeat.set(1, len / 6);
  dashTex.colorSpace = THREE.SRGBColorSpace;
  const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.14, len), new THREE.MeshStandardMaterial({ map: dashTex, transparent: true, alphaTest: 0.5, roughness: 0.9 }));
  dash.rotation.x = -Math.PI / 2;
  dash.position.set(0, 0.03, midZ);
  dash.material.alphaMap = dashTex;
  scene.add(dash);

  for (const s of [-1, 1]) {
    scene.add(box(WALK, 0.14, len, mat('#ddd8ce'), s * (STREET_HALF + WALK / 2), 0.07, midZ, { cast: false }));
    scene.add(box(0.22, 0.16, len, mat('#c3bcaf'), s * (STREET_HALF + 0.11), 0.08, midZ, { cast: false }));
  }

  // Wendehammer am Ende
  const turnZ = endZ - 22;
  const turn = mesh(new THREE.CircleGeometry(11, 40), mat('#858a8f', { roughness: 0.95 }), { cast: false });
  turn.rotation.x = -Math.PI / 2;
  turn.position.set(0, 0.021, turnZ);
  scene.add(turn);
  const island = mesh(new THREE.CylinderGeometry(4, 4, 0.2, 32), mat('#b5c79a'), { cast: false });
  island.position.set(0, 0.1, turnZ);
  scene.add(island);

  // Torbogen am Eingang
  const post = mat('#2b333c', { metalness: 0.4, roughness: 0.5 });
  for (const s of [-1, 1]) scene.add(box(0.22, 6.1, 0.22, post, s * (CURB - 0.35), 3.05, 2));
  const banTex = bannerTexture(info.streetName, info.subtitle);
  const banMat = signMaterial(banTex, 0.7);
  const banFrame = mat('#1f2a36');
  scene.add(mesh(new THREE.BoxGeometry(2 * CURB - 0.7, 1.25, 0.08), [banFrame, banFrame, banFrame, banFrame, banMat, banMat]).translateY(5.2).translateZ(2));

  // Straßenschild
  scene.add(box(0.09, 3.1, 0.09, mat('#7d858d', { metalness: 0.5 }), STREET_HALF + 1.0, 1.55, -3));
  const ssMat = signMaterial(streetSignTexture(info.streetName), 0.5);
  scene.add(mesh(new THREE.BoxGeometry(2.4, 0.54, 0.04), [frameMat, frameMat, frameMat, frameMat, ssMat, ssMat]).translateX(STREET_HALF + 1.0).translateY(2.85).translateZ(-3));

  return { turnZ };
}

function buildPlot(index, label) {
  const side = index % 2 === 0 ? -1 : 1;
  const z = START_Z - index * STEP_Z;
  const x = side * (SETBACK + 4.5);
  const plot = mesh(new THREE.PlaneGeometry(9, 8), mat('#d6d2b4'), { cast: false });
  plot.rotation.x = -Math.PI / 2;
  plot.position.set(x, 0.015, z);
  scene.add(plot);
  const stake = mat('#d0452f');
  for (const dx of [-4.5, 4.5]) for (const dz of [-4, 4]) scene.add(box(0.08, 0.7, 0.08, stake, x + dx, 0.35, z + dz));
  const g = new THREE.Group();
  g.position.set(side * (CURB + 1.2), 0, z + 2);
  g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  const post = mat('#8a6b4a');
  for (const dx of [-1.1, 1.1]) g.add(box(0.12, 2.4, 0.12, post, dx, 1.2, 0));
  const tex = signTexture('+', label, 'Neues Repo = neues Haus');
  const m = signMaterial(tex);
  g.add(mesh(new THREE.BoxGeometry(2.8, 1.4, 0.06), [post, post, post, post, m, m]).translateY(1.9));
  g.rotation.y += side < 0 ? -0.35 : 0.35; // leicht zum Straßeneingang gedreht
  scene.add(g);
}

function buildTrees(endZ, turnZ) {
  const r = rng(20261116);
  const spots = [];
  const n = Math.round((14 - endZ) / STEP_Z) + 2;
  // Straßenbäume auf dem Gehweg, jeweils gegenüber der Häuser
  for (let k = -1; k <= n; k++) {
    const z = START_Z - k * STEP_Z;
    const side = k % 2 === 0 ? 1 : -1;
    spots.push([side * (STREET_HALF + 0.95), z, 0.95 + r() * 0.25]);
  }
  // Bäume in den Gärten und dahinter
  for (let z = 20; z > turnZ - 40; z -= 2.2) {
    for (const s of [-1, 1]) {
      if (r() < 0.55) spots.push([s * (SETBACK + 13 + r() * 22), z + r() * 2, 0.9 + r() * 0.9]);
      if (r() < 0.25) spots.push([s * (SETBACK + 36 + r() * 60), z + r() * 2, 1.1 + r() * 1.2]);
    }
  }
  for (let a = 0; a < Math.PI * 2; a += 0.5) spots.push([Math.cos(a) * (16 + r() * 8), turnZ - 4 + Math.sin(a) * (12 + r() * 6), 1 + r() * 0.8]);
  spots.push([0, turnZ, 1.5]);

  // hoch aufgeastet, damit die Kronen über den Schildern (max. 3,3 m) bleiben
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.2, 4.6, 6).translate(0, 2.3, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1.7, 0).translate(0, 6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, mat('#7a5f47'), spots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), spots.length);
  const greens = ['#7d9b5f', '#6f8f57', '#93ab6c', '#86a46a', '#a3b779'].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach(([x, z, s], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI);
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, Math.max(0.95, s * (0.95 + r() * 0.3)), s));
    trunks.setMatrixAt(i, m);
    crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, greens[Math.floor(r() * greens.length)]);
  });
  for (const im of [trunks, crowns]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }
}

// ---------- Straßenlaternen ----------

let lamps = null;
function buildLamps(count) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const poles = [], heads = [], pools = [];
  const spots = [];
  for (let i = -1; i <= count + 1; i++) {
    // vor jedem Haus an der Bordsteinkante, auf seiner Straßenseite
    const side = i % 2 === 0 ? -1 : 1;
    const z = START_Z - i * STEP_Z;
    const x = side * (STREET_HALF + 0.45);
    const hx = x - side * 1.0;
    poles.push(new THREE.CylinderGeometry(0.06, 0.09, 5.2, 8).translate(x, 2.6, z));
    poles.push(boxGeo(1.15, 0.07, 0.07, x - side * 0.5, 5.15, z));
    heads.push(new THREE.CylinderGeometry(0.3, 0.34, 0.12, 16).translate(hx, 5.08, z));
    pools.push(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2).translate(hx, 0.16, z));
    spots.push(new THREE.Vector3(hx, 4.8, z));
  }
  scene.add(mesh(mergeGeometries(poles), mat('#2b333c', { metalness: 0.5, roughness: 0.45 })));
  const headMat = new THREE.MeshStandardMaterial({ color: '#3a3f45', emissive: '#ffdcaa', emissiveIntensity: 0, roughness: 0.5 });
  scene.add(mesh(mergeGeometries(heads), headMat, { cast: false }));

  const pc = document.createElement('canvas');
  pc.width = pc.height = 256;
  const pg = pc.getContext('2d');
  const grad = pg.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  pg.fillStyle = grad;
  pg.fillRect(0, 0, 256, 256);
  const poolMat = new THREE.MeshBasicMaterial({
    map: canvasTexture(pc), color: '#ffc27a', transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const poolMesh = new THREE.Mesh(mergeGeometries(pools), poolMat);
  poolMesh.renderOrder = 1;
  scene.add(poolMesh);

  // Nur die nächstgelegenen Laternen bekommen echtes Licht (schont die Grafikkarte)
  const lightsList = [];
  for (let i = 0; i < (coarse ? 3 : 6); i++) {
    const l = new THREE.PointLight('#ffc98a', 0, 22, 1.6);
    scene.add(l);
    lightsList.push(l);
  }
  lamps = { headMat, poolMat, spots, lights: lightsList };
  placeLampLights(); // sofort platzieren, sonst stehen die Lichter anfangs im Ursprung
}

function placeLampLights() {
  if (!lamps) return;
  if (inside >= 0) {
    lamps.lights.forEach((l, i) => l.position.set(...ROOM_LIGHTS[i % ROOM_LIGHTS.length]));
    return;
  }
  const near = lamps.spots
    .map((p) => [p, (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2])
    .sort((a, b) => a[1] - b[1]);
  lamps.lights.forEach((l, i) => near[i] && l.position.copy(near[i][0]));
}

// ---------- Tag und Nacht nach echter Uhrzeit ----------

const PLACE = { lat: 53.143, lon: 8.214 }; // Oldenburg (Jade Hochschule, Studienort Oldenburg)
const DEG = Math.PI / 180;

/** Sonnenstand (Höhe, Azimut ab Nord im Uhrzeigersinn) – NOAA-Näherung, genau genug fürs Licht. */
function sunPosition(date) {
  const d = date.getTime() / 86400000 - 10957.5;
  const g = (357.529 + 0.98560028 * d) * DEG;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const e = (23.439 - 0.00000036 * d) * DEG;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) * 15 * DEG;
  const ha = gmst + PLACE.lon * DEG - ra;
  const lat = PLACE.lat * DEG;
  const alt = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha));
  return { alt, az: (az + 2 * Math.PI) % (2 * Math.PI) };
}

const toColors = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? new THREE.Color(v) : v]));
const PRESETS = {
  day: toColors({ top: '#86b3dc', horizon: '#efe9df', sun: '#fff4e2', sunI: 2.4, hemiSky: '#f1f6ff', hemiGround: '#b6a98f', hemiI: 1.5, fogNear: 45, fogFar: 170, lamps: 0, glow: 0, win: 0.85, stars: 0 }),
  dusk: toColors({ top: '#4d6a9c', horizon: '#f0b58a', sun: '#ffa564', sunI: 1.35, hemiSky: '#c2c4df', hemiGround: '#7d6e5d', hemiI: 0.85, fogNear: 40, fogFar: 160, lamps: 0.75, glow: 0.4, win: 1.15, stars: 0 }),
  night: toColors({ top: '#060b18', horizon: '#17223a', sun: '#a3b8ff', sunI: 0.32, hemiSky: '#34456c', hemiGround: '#101318', hemiI: 0.34, fogNear: 22, fogFar: 125, lamps: 1, glow: 0.8, win: 1.55, stars: 1 }),
};

function mixEnv(a, b, t) {
  const o = {};
  for (const k in a) o[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * t : a[k].clone().lerp(b[k], t);
  return o;
}
function presetFor(altDeg) {
  if (altDeg >= 6) return mixEnv(PRESETS.day, PRESETS.day, 0);
  if (altDeg >= -4) return mixEnv(PRESETS.dusk, PRESETS.day, (altDeg + 4) / 10);
  if (altDeg >= -10) return mixEnv(PRESETS.night, PRESETS.dusk, (altDeg + 10) / 6);
  return mixEnv(PRESETS.night, PRESETS.night, 0);
}
// Welt: −Z = Norden (die Straße läuft vom Eingang im Süden nach Norden), +X = Osten
const dirFrom = (alt, az) => new THREE.Vector3(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
const MOON_DIR = dirFrom(32 * DEG, 165 * DEG);

// Drinnen: gedimmtes Kinolicht, kein Nebel, keine Sonne
const INTERIOR = toColors({ top: '#000000', horizon: '#0d0f12', sun: '#ffffff', sunI: 0, hemiSky: '#fff1dc', hemiGround: '#3a3330', hemiI: 0.6, fogNear: 400, fogFar: 900, lamps: 0, glow: 0.3, win: 0.85, stars: 0 });

const LIGHT_MODES = ['auto', 'tag', 'nacht'];
let lightMode = 'auto';
let envNow = null, envTarget = null, envClock = Infinity;

function computeEnvTarget() {
  const sky = lightMode === 'tag' ? { alt: 32 * DEG, az: 205 * DEG }
    : lightMode === 'nacht' ? { alt: -25 * DEG, az: 0 }
    : sunPosition(new Date());
  const altDeg = sky.alt / DEG;
  const t = inside >= 0 ? mixEnv(INTERIOR, INTERIOR, 0) : presetFor(altDeg);
  const night = clamp((-altDeg - 2) / 8, 0, 1);
  t.dir = dirFrom(Math.max(sky.alt, 8 * DEG), sky.az).lerp(MOON_DIR, night).normalize();
  t.altDeg = altDeg;
  t.az = sky.az;
  return t;
}

function updateEnvironment(dt) {
  envClock += dt;
  if (envClock > 30) {
    envClock = 0;
    envTarget = computeEnvTarget();
    updateDaylightButton();
    gardens.forEach(refreshGarden);
    for (const t of tickers) t();
  }
  if (!envNow) envNow = { ...mixEnv(envTarget, envTarget, 0), dir: envTarget.dir.clone() };
  const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 2.5);
  for (const key in envTarget) {
    const a = envNow[key], b = envTarget[key];
    if (typeof b === 'number') envNow[key] = a + (b - a) * k;
    else if (b.isColor) a.lerp(b, k);
    else if (b.isVector3) a.lerp(b, k).normalize();
  }
  const e = envNow;
  const { sun, sky, hemi } = lights;
  sky.material.uniforms.top.value.copy(e.top);
  sky.material.uniforms.bottom.value.copy(e.horizon);
  sky.material.uniforms.stars.value = e.stars;
  scene.background.copy(e.horizon);
  scene.fog.color.copy(e.horizon);
  const lift = inside >= 0 ? 0 : Math.max(0, camY - EYE);
  scene.fog.near = e.fogNear + lift * 1.5;
  scene.fog.far = Math.min(300, e.fogFar + lift * 2.5);
  hemi.color.copy(e.hemiSky);
  hemi.groundColor.copy(e.hemiGround);
  hemi.intensity = e.hemiI;
  sun.color.copy(e.sun);
  sun.intensity = e.sunI;
  litMat.emissiveIntensity = e.win;
  for (const m of blockLitMats) m.emissiveIntensity = e.win;
  for (const m of glowMats) m.emissiveIntensity = e.glow;
  if (lamps) {
    lamps.headMat.emissiveIntensity = e.lamps * 3;
    lamps.poolMat.opacity = e.lamps * 0.55;
    for (const l of lamps.lights) l.intensity = inside >= 0 ? 9 : e.lamps * 38;
  }
  if (room) room.screenLight.intensity = inside >= 0 ? (houses[inside]?.p.demo ? 7 : 4) : 0;
}

const ICONS = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>',
  dusk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6.5 17a5.5 5.5 0 0 1 11 0M2 17h20M12 4v3M4.6 9.6l1.8 1.4M19.4 9.6l-1.8 1.4M7 21h10"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
};

function updateDaylightButton() {
  const b = $('#daylight');
  if (!b || !envTarget) return;
  const a = envTarget.altDeg;
  const phase = a >= 6 ? 'Tag' : a >= -6 ? (envTarget.az < Math.PI ? 'Morgengrauen' : 'Dämmerung') : 'Nacht';
  const time = new Date().toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  const label = lightMode === 'auto' ? `Echtzeit · ${phase} ${time}` : lightMode === 'tag' ? 'Immer Tag' : 'Immer Nacht';
  const icon = lightMode === 'tag' || (lightMode === 'auto' && a >= 6) ? 'sun' : lightMode === 'nacht' || a < -6 ? 'moon' : 'dusk';
  b.querySelector('.dl-icon').innerHTML = ICONS[icon];
  b.querySelector('.dl-text').textContent = label;
  b.setAttribute('aria-label', `Licht: ${label}. Klicken für ${{ auto: 'immer Tag', tag: 'immer Nacht', nacht: 'Echtzeit' }[lightMode]}.`);
}

function setupDaylight() {
  const param = new URLSearchParams(location.search).get('licht');
  let saved = null;
  try { saved = localStorage.getItem('allee-licht'); } catch {}
  lightMode = LIGHT_MODES.includes(param) ? param : LIGHT_MODES.includes(saved) ? saved : 'auto';
  $('#daylight')?.addEventListener('click', () => {
    lightMode = LIGHT_MODES[(LIGHT_MODES.indexOf(lightMode) + 1) % LIGHT_MODES.length];
    try { localStorage.setItem('allee-licht', lightMode); } catch {}
    envClock = Infinity;
  });
}

// ---------- Innenraum: Vorführraum mit Leinwand und Beamer ----------
// Ein gemeinsamer Raum weit abseits der Straße. Beim Eintreten wird er für das
// jeweilige Haus eingerichtet: Wände im Fassadenmaterial, Plakat, Live-Demo.

const IZ = 1200;
const ROOM = { w: 11, d: 14, h: 5.2 };
const SCREEN = { w: 6.4, h: 3.6, y: 3.0 };
const SCREEN_Z = IZ - ROOM.d / 2 + 0.11;
const ROOM_LIGHTS = [
  [-2.8, ROOM.h - 0.3, IZ - 3.5], [2.8, ROOM.h - 0.3, IZ + 0.5], [-2.8, ROOM.h - 0.3, IZ + 4.5],
  [2.8, ROOM.h - 0.3, IZ - 3.5], [-2.8, ROOM.h - 0.3, IZ + 0.5], [2.8, ROOM.h - 0.3, IZ + 4.5],
];
let room = null;
let inside = -1;
let busy = false;
let cssRenderer = null, cssScene = null, screenObj = null, screenFrame = null;

function wrapLines(g, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  let used = 0;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width <= maxW) { line = t; used++; continue; }
    if (line) lines.push(line);
    line = w;
    used++;
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (used < words.length || lines.length > maxLines) {
    lines.length = Math.min(lines.length, maxLines);
    lines[lines.length - 1] = lines[lines.length - 1].replace(/\s*\S*$/, ' …');
  }
  return lines;
}

function slideTexture(p) {
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 720;
  const g = c.getContext('2d');
  g.fillStyle = '#14171c';
  g.fillRect(0, 0, 1280, 720);
  g.fillStyle = '#1f4e8c';
  roundRect(g, 90, 90, 120, 96, 12);
  g.fill();
  g.fillStyle = '#fff';
  g.font = `700 64px ${SIGN_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(p.number), 150, 140);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fbfaf6';
  const fit = fitText(g, p.title, 940, 200, 700, 96, 48, 2);
  let y = 90 + fit.size * 0.8;
  for (const l of fit.lines) { g.fillText(l, 250, y); y += fit.lh; }
  g.font = `600 40px ${UI_FONT}`;
  g.fillStyle = '#f0a05f';
  y = Math.max(y + 30, 330);
  g.fillText(p.demo ? 'Live-Demo wird geladen …' : 'Noch keine Live-Demo', 90, y);
  g.fillStyle = '#c9d0d8';
  g.font = `500 32px ${UI_FONT}`;
  y += 58;
  for (const l of wrapLines(g, p.description || 'Noch keine Beschreibung.', 1100, 4)) { g.fillText(l, 90, y); y += 44; }
  if (!p.demo) {
    g.fillStyle = '#8b96a3';
    g.font = `500 26px ${UI_FONT}`;
    g.fillText('Tipp fürs Team: im Repo unter „About“ → Website einen Link eintragen oder GitHub Pages aktivieren.', 90, 660);
  }
  return canvasTexture(c);
}

function posterTexture(p) {
  const W = 900, H = 1272;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfaf6';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1f2a36';
  g.fillRect(0, 0, W, 120);
  g.fillStyle = '#fbfaf6';
  g.font = `600 38px ${UI_FONT}`;
  g.fillText('VIBECODING-ALLEE', 60, 76);
  g.textAlign = 'right';
  g.fillText(`NR. ${p.number}`, W - 60, 76);
  g.textAlign = 'left';
  g.fillStyle = '#1f2a36';
  const fit = fitText(g, p.title, W - 120, 330, 700, 120, 56, 3);
  let y = 200 + fit.size * 0.8;
  for (const l of fit.lines) { g.fillText(l, 60, y); y += fit.lh; }
  g.fillStyle = '#c4561d';
  g.fillRect(60, y + 6, 120, 8);
  y += 80;
  g.fillStyle = '#2b3540';
  g.font = `500 36px ${UI_FONT}`;
  for (const l of wrapLines(g, p.description || 'Noch keine Beschreibung.', W - 120, 12)) { g.fillText(l, 60, y); y += 50; }
  g.fillStyle = '#1f2a36';
  g.fillRect(60, H - 210, W - 120, 3);
  g.font = `600 30px ${UI_FONT}`;
  const team = (p.team ?? []).map((t) => t.login).join(' · ') || '–';
  g.fillText(wrapLines(g, `Team: ${team}`, W - 120, 1)[0], 60, H - 150);
  g.fillStyle = '#5b6672';
  g.font = `500 28px ${UI_FONT}`;
  const mat = MATERIALS[p.house.material ?? materialFor(p.language)].label;
  g.fillText(`${p.language || 'ohne Sprache'} · ${mat} · ${p.commits ?? '–'} Commits`, 60, H - 95);
  return canvasTexture(c);
}

function exitSignTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 176;
  const g = c.getContext('2d');
  g.fillStyle = '#12834b';
  g.fillRect(0, 0, 512, 176);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 6;
  roundRect(g, 12, 12, 488, 152, 12);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = `700 84px ${SIGN_FONT}`;
  g.textBaseline = 'middle';
  g.fillText('AUSGANG', 60, 92);
  g.beginPath();
  g.moveTo(400, 62); g.lineTo(460, 88); g.lineTo(400, 114); g.closePath();
  g.fill();
  g.fillRect(372, 80, 40, 16);
  return canvasTexture(c);
}

function buildRoom() {
  const { w, d, h: rh } = ROOM;
  const t = 0.2;
  const g = new THREE.Group();
  const sideMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92 });
  const floorMat = new THREE.MeshStandardMaterial({ map: facadeTexture('holz', '#6e4c33'), roughness: 0.75 });
  const floor = mesh(meterUVs(new THREE.BoxGeometry(w, t, d), w, t, d), floorMat, { cast: false });
  floor.position.set(0, -t / 2, IZ);
  g.add(floor);
  g.add(box(w + 2 * t, t, d + 2 * t, mat('#15171b'), 0, rh + t / 2, IZ, { cast: false }));
  g.add(box(w, rh, t, mat('#1c2026', { roughness: 0.95 }), 0, rh / 2, IZ - d / 2 - t / 2, { cast: false }));
  for (const sx of [-1, 1]) {
    const wall = mesh(meterUVs(new THREE.BoxGeometry(t, rh, d), t, rh, d), sideMat, { cast: false });
    wall.position.set(sx * (w / 2 + t / 2), rh / 2, IZ);
    g.add(wall);
  }
  const back = mesh(meterUVs(new THREE.BoxGeometry(w, rh, t), w, rh, t), sideMat, { cast: false });
  back.position.set(0, rh / 2, IZ + d / 2 + t / 2);
  g.add(back);

  // Leinwand
  g.add(box(SCREEN.w + 0.3, SCREEN.h + 0.3, 0.1, mat('#0b0c0f'), 0, SCREEN.y, IZ - d / 2 + 0.05, { cast: false }));
  const slideMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const slide = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), slideMat);
  slide.position.set(0, SCREEN.y, SCREEN_Z);
  g.add(slide);

  // Beamer an der Decke, mit Lichtkegel zur Leinwand
  const pz = IZ + 1.6, py = rh - 0.6;
  const metal = mat('#2b333c', { metalness: 0.5, roughness: 0.45 });
  g.add(box(0.06, 0.5, 0.06, metal, 0, rh - 0.25, pz, { cast: false }));
  g.add(box(0.56, 0.22, 0.48, mat('#e6e4df', { roughness: 0.5 }), 0, py, pz, { cast: false }));
  const lens = mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.09, 20).rotateX(Math.PI / 2), mat('#15171b'), { cast: false });
  lens.position.set(0.13, py, pz - 0.28);
  g.add(lens);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.062, 20), new THREE.MeshBasicMaterial({ color: '#fff7e6' }));
  glass.position.set(0.13, py, pz - 0.33);
  glass.rotation.y = Math.PI;
  g.add(glass);
  const apex = [0.13, py, pz - 0.33];
  const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [a * SCREEN.w / 2, SCREEN.y + b * SCREEN.h / 2, SCREEN_Z + 0.01]);
  const verts = [], cols = [];
  for (let i = 0; i < 4; i++) {
    const a = cs[i], b = cs[(i + 1) % 4];
    verts.push(...apex, ...a, ...b);
    // sehr kleine Werte: additiv wird im gamma-kodierten Bild gemischt
    cols.push(0.012, 0.012, 0.011, 0.0012, 0.0012, 0.0015, 0.0012, 0.0012, 0.0015);
  }
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  beamGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }));
  g.add(beam);

  // Kinosessel in zwei Blöcken mit Mittelgang
  const seats = [];
  for (const rz of [IZ - 1.6, IZ - 0.1, IZ + 1.4]) for (const bx of [-1, 1]) for (let k = 0; k < 5; k++) {
    const x = bx * (1.56 + k * 0.62);
    seats.push(boxGeo(0.54, 0.12, 0.5, x, 0.45, rz));
    seats.push(boxGeo(0.54, 0.64, 0.1, x, 0.8, rz + 0.25));
    seats.push(boxGeo(0.06, 0.5, 0.46, x + 0.3, 0.3, rz));
  }
  g.add(mesh(mergeGeometries(seats), mat('#8a2f33', { roughness: 0.85 })));

  // Deckenleuchten
  const downs = ROOM_LIGHTS.map(([x, , z]) => new THREE.CylinderGeometry(0.16, 0.16, 0.04, 16).translate(x, rh - 0.02, z));
  g.add(new THREE.Mesh(mergeGeometries(downs), new THREE.MeshBasicMaterial({ color: '#ffe8c4' })));

  // Ausgang hinten rechts (klickbar)
  g.add(box(1.15, 2.3, 0.08, mat('#3b3f46'), 3.6, 1.15, IZ + d / 2 - 0.04, { cast: false }));
  const exit = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.33, 0.06), new THREE.MeshBasicMaterial({ map: exitSignTexture() }));
  exit.position.set(3.6, 2.75, IZ + d / 2 - 0.05);
  exit.rotation.y = Math.PI;
  exit.userData.exit = true;
  g.add(exit);

  // Plakat an der linken Wand
  const posterMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 });
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.77), posterMat);
  poster.position.set(-w / 2 + 0.02, 2.25, IZ - 2.2);
  poster.rotation.y = Math.PI / 2;
  g.add(poster);

  // Licht der Leinwand
  const screenLight = new THREE.PointLight('#dfe8ff', 0, 16, 1.4);
  screenLight.position.set(0, SCREEN.y, SCREEN_Z + 1.6);
  g.add(screenLight);

  scene.add(g);
  room = { sideMat, slideMat, posterMat, exit, screenLight };

  // Live-Demo als echte Webseite auf der Leinwand
  cssRenderer = new CSS3DRenderer();
  cssRenderer.domElement.className = 'css3d';
  cssRenderer.domElement.hidden = true;
  canvas.after(cssRenderer.domElement);
  cssScene = new THREE.Scene();
  screenFrame = document.createElement('iframe');
  screenFrame.title = 'Live-Demo';
  screenFrame.setAttribute('allow', 'fullscreen; clipboard-write');
  screenFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock');
  screenFrame.referrerPolicy = 'no-referrer';
  const wrap = document.createElement('div');
  wrap.className = 'screen-frame';
  wrap.append(screenFrame);
  screenObj = new CSS3DObject(wrap);
  screenObj.position.set(0, SCREEN.y, SCREEN_Z + 0.005);
  screenObj.scale.setScalar(SCREEN.w / 1280);
  cssScene.add(screenObj);
}

function setMap(m, tex) {
  // Plakat und Folie werden pro Haus neu gezeichnet, Fassadentexturen bleiben im Cache
  if (m.map && m.map !== tex && ![...facadeTexCache.values()].includes(m.map)) m.map.dispose();
  m.map = tex;
  m.needsUpdate = true;
}

function configureRoom(p) {
  const material = p.house.material ?? materialFor(p.language);
  setMap(room.sideMat, facadeTexture(material, p.house.facade));
  room.sideMat.color.set(material === 'putz' ? p.house.facade : '#ffffff');
  setMap(room.posterMat, posterTexture(p));
  setMap(room.slideMat, slideTexture(p));
  screenFrame.src = p.demo || 'about:blank';
  cssRenderer.domElement.hidden = !p.demo;

  $('#hud-num').textContent = String(p.number);
  $('#hud-title').textContent = p.title;
  $('#hud-sub').textContent = p.demo
    ? 'Live-Demo läuft auf der Leinwand. Klick hinein, um sie zu bedienen.'
    : 'Noch keine Live-Demo – auf der Leinwand steht, was fehlt.';
  const open = $('#hud-open');
  open.href = p.demo || p.url;
  open.textContent = p.demo ? 'In neuem Tab ↗' : 'Repository ↗';
  $('#hud-front').hidden = !p.demo;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fade(on) {
  $('#fade').classList.toggle('on', on);
  return sleep(reduceMotion ? 0 : 380);
}
function flyToAsync(pose, dur, lock = false) {
  return new Promise((resolve) => {
    flyTo(pose, dur, lock);
    tween.onDone = resolve;
  });
}

async function enterHouse(i) {
  if (busy || inside >= 0 || !renderer || !room) return;
  const H = houses[i];
  if (!H || H.p.house.floors === 0) return;
  if (flying) setFlying(false, { land: false });
  busy = true;
  closeCard();
  setHover(-1);
  const d = H.p.house.depth / 2;
  const at = H.group.localToWorld(new THREE.Vector3(0, EYE, d + 2.4));
  const door = H.group.localToWorld(new THREE.Vector3(0, 1.6, d));
  await flyToAsync({ x: at.x, z: at.z, y: EYE, yaw: Math.atan2(-(door.x - at.x), -(door.z - at.z)), pitch: 0 }, 1.1, true);
  await fade(true);
  inside = i;
  configureRoom(H.p);
  pos.set(0, EYE, IZ + 4.8);
  camY = EYE; yaw = 0; pitch = 0.1;
  velF = velS = wheelVel = 0;
  envClock = Infinity; envNow = null;
  placeLampLights();
  document.body.classList.add('inside');
  $('#inside-hud').hidden = false;
  history.replaceState(null, '', `#${encodeURIComponent(H.p.name)}`);
  await fade(false);
  busy = false;
}

async function exitHouse() {
  if (busy || inside < 0) return;
  busy = true;
  await fade(true);
  const i = inside;
  inside = -1;
  tween = null;
  screenFrame.src = 'about:blank';
  cssRenderer.domElement.hidden = true;
  $('#inside-hud').hidden = true;
  document.body.classList.remove('inside');
  const pose = poseFor(i);
  pos.set(pose.x, EYE, pose.z);
  camY = EYE; yaw = pose.yaw; pitch = pose.pitch;
  velF = velS = wheelVel = 0;
  envClock = Infinity; envNow = null;
  placeLampLights();
  select(i, { fly: false });
  await fade(false);
  busy = false;
}

function frontOfScreen() {
  if (busy || inside < 0) return;
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
  const hf = Math.atan(Math.tan(vf) * camera.aspect);
  const dist = Math.max(SCREEN.h / 2 / Math.tan(vf) / 0.82, SCREEN.w / 2 / Math.tan(hf) / 0.94);
  flyTo({ x: 0, z: Math.min(SCREEN_Z + dist, IZ + ROOM.d / 2 - 0.6), y: SCREEN.y - 0.15, yaw: 0, pitch: 0 }, 1.0);
}

function pickExit(cx, cy) {
  if (!room) return false;
  ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObject(room.exit, false).length > 0;
}

const _toScreen = new THREE.Vector3(), _fwd = new THREE.Vector3();
function renderScreen() {
  if (inside < 0 || cssRenderer.domElement.hidden) return;
  // nur zeigen, wenn die Leinwand vor der Kamera liegt (CSS kennt keine Tiefe)
  _toScreen.set(0, SCREEN.y, SCREEN_Z).sub(camera.position).normalize();
  camera.getWorldDirection(_fwd);
  screenObj.element.style.visibility = _toScreen.dot(_fwd) > 0.35 ? '' : 'hidden';
  cssRenderer.render(cssScene, camera);
}

// ---------- Bewegung ----------

const pos = new THREE.Vector3(0, EYE, 12);
let yaw = 0, pitch = -0.04, camY = EYE;
let velF = 0, velS = 0, wheelVel = 0, walked = 0;
const keys = new Set();
let tween = null;
let bounds = { minZ: -100, maxZ: 16 };

// Freiflug: frei durch die Luft, auch senkrecht nach unten schauen
let flying = false, velY = 0;
const FLY_TOP = 60, FLY_SIDE = 70, FLY_KEYS = new Set(['KeyE', 'KeyQ', 'Space']);

function setFlying(on, { land = true } = {}) {
  if (on === flying) return;
  if (on && (busy || inside >= 0 || tween?.lock || !renderer)) return;
  flying = on;
  document.body.classList.toggle('flying', on);
  const hud = $('#fly-hud');
  if (hud) hud.hidden = !on;
  velF = velS = wheelVel = velY = 0;
  for (const k of FLY_KEYS) keys.delete(k);
  if (on) {
    // Fokus vom Knopf nehmen, damit Leertaste und E/Q beim Fliegen ankommen
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    flyTo({ x: pos.x, z: pos.z, y: Math.max(camY, 9), yaw, pitch: Math.min(pitch, -0.45) }, 0.9);
  } else if (land) {
    // zurück auf den Gehweg, in Blickrichtung
    flyTo({ x: clamp(pos.x, -(CURB - 0.5), CURB - 0.5), z: clamp(pos.z, bounds.minZ, bounds.maxZ), y: EYE, yaw, pitch: clamp(pitch, -0.2, 0.3) }, 1.2, true);
  }
}

function poseFor(i) {
  const H = houses[i];
  const floors = H.p.house.style === 'nurdach' ? 3 : H.p.house.floors || 2;
  const portrait = innerWidth < innerHeight;
  const back = (6.5 + clamp(floors - 2, 0, 6) * 1.3) * (portrait ? 1.45 : 1);
  const x = -H.side * (portrait ? 3.2 : 1.4), z = H.z + back;
  const tx = H.side * (SETBACK + 0.5), tz = H.z;
  const ty = clamp(floors * FLOOR_H * 0.5 + 0.8, 2.6, 8);
  const dx = tx - x, dz = tz - z;
  return { x, z, y: EYE, yaw: Math.atan2(-dx, -dz), pitch: clamp(Math.atan2(ty - EYE, Math.hypot(dx, dz)), -0.2, 0.42) };
}

function flyTo(pose, dur = 1.4, lock = false) {
  tween = { from: { x: pos.x, z: pos.z, y: camY, yaw, pitch }, to: pose, t: 0, start: performance.now(), dur: reduceMotion ? 0.001 : dur, lock };
}

function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ---------- Zustand & UI ----------

let houses = [];
let selected = -1;
let hovered = -1;
let info;
const viewShift = { x: 0, y: 0 };

const rtf = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });
function ago(iso) {
  if (!iso) return '–';
  const s = (Date.parse(iso) - Date.now()) / 1000;
  for (const [u, sec] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(s) >= sec) return rtf.format(Math.round(s / sec), u);
  }
  return 'gerade eben';
}

function plateEl(num, cls = '') {
  return h('span', { class: `plate ${cls}`, 'aria-hidden': 'true' }, String(num));
}

function buildDirectory() {
  const list = $('#dir-list');
  list.replaceChildren(
    ...houses.map((H, i) =>
      h('li', { 'data-i': i },
        h('button', { type: 'button', onclick: () => { select(i); closeDirectoryOnMobile(); } },
          plateEl(H.p.number),
          h('span', {},
            h('span', { class: 'dir-title' }, H.p.title, h('span', { class: 'here-tag' }, 'hier')),
            h('span', { class: 'dir-desc' }, H.p.description || (H.p.empty ? 'Baustelle – noch keine Commits' : 'Beschreibung folgt')),
          ),
        ),
      ),
    ),
  );
  $('#count').textContent = `${houses.length} Häuser`;
  const stand = info.generatedAt ? new Date(info.generatedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : null;
  $('#stand').textContent = stand ? `Stand: ${stand} · aktualisiert sich automatisch` : '';

  $('#search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    let shown = 0;
    list.querySelectorAll('li[data-i]').forEach((li) => {
      const p = houses[+li.dataset.i].p;
      const hay = [p.title, p.name, p.description, p.language, ...(p.team ?? []).map((t) => t.login)].join(' ').toLowerCase();
      const hit = !q || hay.includes(q);
      li.hidden = !hit;
      shown += hit;
    });
    list.querySelector('.dir-empty')?.remove();
    if (!shown) list.append(h('li', { class: 'dir-empty' }, 'Kein Haus gefunden.'));
  });

  const toggle = $('#dir-toggle');
  toggle.addEventListener('click', () => {
    if (!isNarrow()) return;
    const open = $('#directory').classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    if (open) $('#search').focus();
  });
}

function closeDirectoryOnMobile() {
  if (!isNarrow()) return;
  $('#directory').classList.remove('open');
  $('#dir-toggle').setAttribute('aria-expanded', 'false');
}

let stripRange = { z0: 12, z1: -100 };
function buildStrip() {
  const track = h('div', { class: 'track' });
  stripRange = { z0: 10, z1: houses.length ? houses[houses.length - 1].z - 6 : -20 };
  houses.forEach((H, i) => {
    track.append(
      h('button', {
        class: `dot ${H.side < 0 ? 'l' : 'r'} ${H.p.house.floors === 0 ? 'site' : ''}`,
        style: `left:${stripPct(H.z)}%`,
        title: `${H.p.number} · ${H.p.title} (${H.side < 0 ? 'links' : 'rechts'})`,
        'aria-label': `Haus ${H.p.number}: ${H.p.title}, ${H.side < 0 ? 'links' : 'rechts'}`,
        'data-i': i,
        onclick: () => select(i),
      }, String(H.p.number)),
    );
  });
  track.append(h('span', { class: 'you', id: 'you' }));
  $('#strip').replaceChildren(track);
}
const stripPct = (z) => clamp(((stripRange.z0 - z) / (stripRange.z0 - stripRange.z1)) * 100, 0, 100);

function select(i, { fly = true } = {}) {
  if (i < 0 || i >= houses.length || (busy && fly)) return;
  selected = i;
  renderCard(houses[i].p, i);
  document.querySelectorAll('#dir-list li, .dot').forEach((n) => n.classList.toggle('selected', +n.dataset.i === i));
  if (fly && renderer) {
    const fromAir = flying;
    if (fromAir) setFlying(false, { land: false });
    flyTo(poseFor(i), fromAir ? 1.8 : 1.4, fromAir);
  }
  history.replaceState(null, '', `#${encodeURIComponent(houses[i].p.name)}`);
}

function closeCard() {
  if (selected < 0) return;
  selected = -1;
  $('#card').hidden = true;
  document.body.classList.remove('card-open');
  document.querySelectorAll('.selected').forEach((n) => n.classList.remove('selected'));
  history.replaceState(null, '', location.pathname + location.search);
  canvas.focus({ preventScroll: true });
}

function renderCard(p, i) {
  const card = $('#card');
  const facts = [
    ['Commits', p.commits == null ? '–' : String(p.commits)],
    p.house.style === 'nurdach' && p.house.floors > 0
      ? ['Bauweise', `Nurdachhaus · ${p.house.windows} ${p.house.windows === 1 ? 'Fensterabteil' : 'Fensterabteile'}`]
      : p.house.style === 'voxel' && p.house.floors > 0
        ? ['Bauweise', 'Block-Stil · Gründach aus dem Erdblock des Teams']
        : p.house.floors > 0 && styleLabel(p.house)
          ? ['Bauweise', styleLabel(p.house)]
          : null,
    p.house.saplings && p.createdAt ? ['Baumschule', saplingFact(p.createdAt)] : null,
    ['Sprache', p.language
      ? `${p.language} · ${MATERIALS[p.house.material ?? materialFor(p.language)].label}`
      : `${MATERIALS[p.house.material ?? 'putz'].label} (ohne Sprache)`],
    ['Zuletzt aktiv', ago(p.pushedAt)],
  ].filter(Boolean);
  const team = (p.team ?? []).map((t) =>
    h('a', { href: t.url, target: '_blank', rel: 'noopener' },
      h('img', { src: `${t.avatar}${t.avatar.includes('?') ? '&' : '?'}s=64`, alt: '', loading: 'lazy', width: 26, height: 26 }),
      h('span', {}, t.login),
    ),
  );
  const img = p.image
    ? h('img', { class: 'shot', src: p.image, alt: `Screenshot aus der README von ${p.title}`, loading: 'lazy', onerror: (e) => e.target.remove() })
    : null;
  const prev = houses[i - 1], next = houses[i + 1];
  card.replaceChildren(...[
    h('div', { class: 'grabber', 'aria-hidden': 'true' }),
    h('button', { class: 'close', type: 'button', 'aria-label': 'Schließen', onclick: closeCard }, '×'),
    h('div', { class: 'card-head' },
      plateEl(p.number),
      h('div', {}, h('h2', { id: 'card-title' }, p.title), h('code', { class: 'repo' }, `${info.org}/${p.name}`)),
    ),
    p.fresh ? h('p', { class: 'fresh' }, 'Gerade eingezogen – Details kommen mit dem nächsten Update.') : null,
    img,
    p.description
      ? h('p', { class: 'desc' }, p.description)
      : h('p', { class: 'desc none' }, p.empty ? 'Hier wird noch gebaut – das Repo hat noch keine Commits.' : 'Noch keine Beschreibung. Tipp fürs Team: im Repo rechts oben beim Zahnrad unter „About“ eintragen.'),
    h('dl', { class: 'facts' }, ...facts.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))),
    team.length ? h('div', { class: 'team', 'aria-label': 'Team' }, ...team) : null,
    h('div', { class: 'actions' },
      p.house.floors > 0 && renderer
        ? h('button', { class: 'btn primary', type: 'button', onclick: () => enterHouse(i) }, p.demo ? 'Eintreten · Live-Demo' : 'Eintreten')
        : null,
      h('a', { class: `btn ${p.house.floors > 0 && renderer ? '' : 'primary'}`, href: p.url, target: '_blank', rel: 'noopener' }, 'Repository öffnen ↗'),
      p.demo ? h('a', { class: 'btn', href: p.demo, target: '_blank', rel: 'noopener' }, 'Live-Demo ↗') : null,
    ),
    h('div', { class: 'card-nav' },
      h('button', { type: 'button', disabled: !prev, onclick: () => select(i - 1) }, prev ? `← Nr. ${prev.p.number}` : ''),
      h('button', { type: 'button', disabled: !next, onclick: () => select(i + 1) }, next ? `Nr. ${next.p.number} →` : ''),
    ),
  ].filter(Boolean));
  card.hidden = false;
  card.scrollTop = 0;
  document.body.classList.add('card-open');
}

function setHover(i, x, y) {
  const tip = $('#tooltip');
  if (i !== hovered) {
    if (hovered >= 0) houses[hovered].bodyMat.emissive.setHex(0x000000);
    hovered = i;
    if (i >= 0) houses[i].bodyMat.emissive.setHex(0x2a2620);
    canvas.classList.toggle('over-house', i >= 0);
    if (i >= 0) tip.replaceChildren(h('span', { class: 'n' }, String(houses[i].p.number)), houses[i].p.title);
  }
  tip.hidden = i < 0;
  if (i >= 0) { tip.style.left = `${x}px`; tip.style.top = `${y}px`; }
}

// ---------- Eingabe ----------

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(cx, cy) {
  ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(houses.map((H) => H.group), true);
  return hits.length ? hits[0].object.userData.house ?? -1 : -1;
}

// ---------- Wischen auf der Projektkarte (Touch) ----------
// Zur Seite: vorheriges/nächstes Projekt, die Karte folgt dem Finger.
// Nach unten am Griff oder Kopf der Karte: schließen. Senkrechtes Scrollen bleibt nativ (touch-action: pan-y).
function setupCardSwipe() {
  const card = $('#card');
  let g = null, swallowClick = false;
  const slide = (transform, ms, done) => {
    if (reduceMotion) {
      card.style.transition = 'none';
      card.style.transform = done ? transform : '';
      done?.();
      return;
    }
    card.style.transition = `transform ${ms}ms cubic-bezier(.2, .8, .2, 1)`;
    card.style.transform = transform;
    setTimeout(() => { if (done) done(); else card.style.transition = ''; }, ms);
  };
  card.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !e.isPrimary || selected < 0) return;
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, dy: 0, axis: null, head: !!e.target.closest('.grabber, .card-head') };
  });
  card.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    g.dx = e.clientX - g.x;
    g.dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.hypot(g.dx, g.dy) < 10) return;
      g.axis = Math.abs(g.dx) > Math.abs(g.dy) * 1.2 ? 'x' : g.head && g.dy > 0 ? 'y' : null;
      if (!g.axis) { g = null; return; } // senkrecht scrollt der Browser selbst
      try { card.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ }
      card.style.transition = 'none';
    }
    if (g.axis === 'x') {
      const atEnd = (g.dx > 0 && selected <= 0) || (g.dx < 0 && selected >= houses.length - 1);
      card.style.transform = `translateX(${atEnd ? g.dx * 0.25 : g.dx}px)`;
    } else {
      card.style.transform = `translateY(${Math.max(0, g.dy)}px)`;
    }
  });
  const end = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const { axis, dx, dy } = g, dt = Math.max(1, performance.now() - g.t);
    g = null;
    if (!axis) return;
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 60);
    if (axis === 'x') {
      const w = card.offsetWidth, dir = dx < 0 ? 1 : -1, target = selected + dir;
      const far = Math.abs(dx) > w * 0.22 || (Math.abs(dx) > 30 && Math.abs(dx) / dt > 0.45);
      if (far && target >= 0 && target < houses.length && !busy && e.type === 'pointerup') {
        slide(`translateX(${-dir * w}px)`, 150, () => {
          select(target);
          card.style.transition = 'none';
          card.style.transform = `translateX(${dir * w * 0.35}px)`;
          void card.offsetWidth; // neue Lage übernehmen, bevor sie einrollt
          slide('', 200);
        });
      } else slide('', 180);
    } else {
      const hh = card.offsetHeight;
      if (e.type === 'pointerup' && (dy > hh * 0.25 || (dy > 30 && dy / dt > 0.45))) {
        slide(`translateY(${hh}px)`, 180, () => {
          closeCard();
          card.style.transition = 'none';
          card.style.transform = '';
        });
      } else slide('', 180);
    }
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
  // nach einem Wisch keinen Klick auf Knopf oder Link auslösen
  card.addEventListener('click', (e) => {
    if (swallowClick) { e.preventDefault(); e.stopPropagation(); swallowClick = false; }
  }, true);
}

function setupInput() {
  setupCardSwipe();
  const moveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.code === 'KeyF' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { setFlying(!flying); return; }
    if (e.key === 'Escape') { if (inside >= 0) exitHouse(); else if (flying) setFlying(false); else { closeCard(); closeDirectoryOnMobile(); } return; }
    if (flying && FLY_KEYS.has(e.code)) {
      keys.add(e.code);
      if (tween && !tween.lock) tween = null;
      e.preventDefault();
      return;
    }
    if ((e.code === 'KeyE' || e.key === 'Enter') && inside < 0 && selected >= 0 && e.target === document.body) { enterHouse(selected); return; }
    if (moveKeys.has(e.code) || e.code.startsWith('Shift')) {
      keys.add(e.code);
      if (tween && !tween.lock && moveKeys.has(e.code)) tween = null;
      if (e.code.startsWith('Arrow') && e.target === document.body || e.target === canvas) e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, type: e.pointerType };
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved < 6) return;
      if (tween?.lock) return;
      tween = null;
      if (drag.type === 'mouse') {
        yaw += dx * 0.0035;
        pitch = flying ? clamp(pitch + dy * 0.0028, -1.52, 1.2) : clamp(pitch + dy * 0.0028, -0.7, 0.6);
      } else {
        yaw += dx * 0.005;
        pos.x += -Math.sin(yaw) * dy * 0.06;
        pos.z += -Math.cos(yaw) * dy * 0.06;
      }
      setHover(-1);
    } else if (e.pointerType === 'mouse') {
      if (inside >= 0) {
        const over = pickExit(e.clientX, e.clientY);
        canvas.classList.toggle('over-house', over);
        const tip = $('#tooltip');
        tip.hidden = !over;
        if (over) { tip.textContent = 'Ausgang – zurück auf die Straße'; tip.style.left = `${e.clientX}px`; tip.style.top = `${e.clientY}px`; }
      } else setHover(pick(e.clientX, e.clientY), e.clientX, e.clientY);
    }
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const click = drag.moved < 6;
    drag = null;
    canvas.classList.remove('dragging');
    if (click && e.type === 'pointerup' && inside >= 0) {
      if (pickExit(e.clientX, e.clientY)) exitHouse();
      return;
    }
    if (click && e.type === 'pointerup') {
      const i = pick(e.clientX, e.clientY);
      if (i >= 0) select(i, { fly: !flying });
      else if (isNarrow()) closeCard();
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => setHover(-1));
  canvas.addEventListener('dblclick', (e) => {
    if (inside >= 0) return;
    const i = pick(e.clientX, e.clientY);
    if (i >= 0) enterHouse(i);
  });
  $('#hud-exit').addEventListener('click', exitHouse);
  $('#hud-front').addEventListener('click', frontOfScreen);
  $('#fly-land')?.addEventListener('click', () => setFlying(false)); // ? = ältere index.html aus dem Cache
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (tween?.lock) return;
    tween = null;
    const d = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    wheelVel = clamp(wheelVel + d * 0.05, -24, 24);
  }, { passive: false });

  document.querySelectorAll('.touchpad button').forEach((b) => {
    const k = b.dataset.key;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); keys.add(k); tween = tween?.lock ? tween : null; });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => keys.delete(k));
  });

  addEventListener('resize', resize);
  addEventListener('hashchange', () => {
    const i = houses.findIndex((H) => H.p.name === decodeURIComponent(location.hash.slice(1)));
    if (i >= 0 && i !== selected && inside < 0) select(i);
  });
}

function resize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight, false);
  cssRenderer?.setSize(innerWidth, innerHeight);
  applyViewOffset();
}

function applyViewOffset() {
  const w = innerWidth, hh = innerHeight;
  const sx = Math.round(viewShift.x), sy = Math.round(viewShift.y);
  camera.aspect = (w + sx) / (hh + sy);
  // Sichtfeld so anpassen, dass der sichtbare Ausschnitt nicht heranzoomt
  const base = THREE.MathUtils.degToRad(w < hh ? 72 : 60);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(base / 2) * (hh + sy) / hh));
  if (sx || sy) camera.setViewOffset(w + sx, hh + sy, sx, sy, w, hh);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}

// ---------- Schleife ----------

let lights;
let lastNear = -1, nearClock = 0;
function update(dt) {
  if (tween) {
    // nach Uhrzeit statt nach Bildern, damit Flüge auch bei Rucklern pünktlich enden
    tween.t = Math.min(1, (performance.now() - tween.start) / (tween.dur * 1000));
    const k = ease(tween.t), f = tween.from, t = tween.to;
    pos.x = f.x + (t.x - f.x) * k;
    pos.z = f.z + (t.z - f.z) * k;
    camY = f.y + (t.y - f.y) * k;
    yaw = angleLerp(f.yaw, t.yaw, k);
    pitch = f.pitch + (t.pitch - f.pitch) * k;
    velF = velS = wheelVel = 0;
    if (tween.t >= 1) {
      const done = tween.onDone;
      tween = null;
      done?.();
    }
  } else {
    let fIn = 0, sIn = 0, turn = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fIn += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fIn -= 1;
    if (keys.has('KeyD')) sIn += 1;
    if (keys.has('KeyA')) sIn -= 1;
    if (keys.has('ArrowLeft')) turn += 1;
    if (keys.has('ArrowRight')) turn -= 1;
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2 : 1;
    yaw += turn * 1.9 * dt;
    const k = Math.min(1, dt * 7);
    if (flying) {
      // WASD waagerecht (auch beim Blick nach unten), E/Q Höhe, Mausrad in Blickrichtung; je höher, desto schneller
      const up = (keys.has('KeyE') || keys.has('Space') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
      const hk = 1 + Math.max(0, camY - EYE) / 12;
      const v = SPEED * (run > 1 ? 3 : 1) * hk;
      velF += (fIn * v - velF) * k;
      velS += (sIn * v * 0.8 - velS) * k;
      velY += (up * v * 0.7 - velY) * k;
      wheelVel *= Math.pow(0.12, dt);
      const z = wheelVel * hk, f = velF + Math.cos(pitch) * z;
      pos.x += (-Math.sin(yaw) * f + Math.cos(yaw) * velS) * dt;
      pos.z += (-Math.cos(yaw) * f - Math.sin(yaw) * velS) * dt;
      camY += (Math.sin(pitch) * z + velY) * dt;
    } else {
      velF += (fIn * SPEED * run - velF) * k;
      velS += (sIn * SPEED * 0.8 * run - velS) * k;
      wheelVel *= Math.pow(0.12, dt);
      const f = velF + wheelVel;
      pos.x += (-Math.sin(yaw) * f + Math.cos(yaw) * velS) * dt;
      pos.z += (-Math.cos(yaw) * f - Math.sin(yaw) * velS) * dt;
      walked += Math.hypot(f, velS) * dt;
      if (Math.abs(f) + Math.abs(velS) > 0.2) camY += (EYE - camY) * Math.min(1, dt * 2.5);
    }
  }
  // Flüge starten und enden an erlaubten Punkten, dazwischen nicht begrenzen
  if (!tween) {
    if (flying) {
      pos.x = clamp(pos.x, -FLY_SIDE, FLY_SIDE);
      pos.z = clamp(pos.z, bounds.minZ - 30, bounds.maxZ + 30);
      camY = clamp(camY, 0.4, FLY_TOP);
    } else if (inside >= 0) {
      pos.x = clamp(pos.x, -(ROOM.w / 2 - 0.6), ROOM.w / 2 - 0.6);
      pos.z = clamp(pos.z, SCREEN_Z + 1.2, IZ + ROOM.d / 2 - 0.6);
    } else {
      pos.x = clamp(pos.x, -(CURB - 0.5), CURB - 0.5);
      pos.z = clamp(pos.z, bounds.minZ, bounds.maxZ);
    }
  }
  const bob = reduceMotion || tween || flying ? 0 : Math.sin(walked * 1.9) * 0.035;
  camera.position.set(pos.x, camY + bob, pos.z);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');

  updateEnvironment(dt);
  frameTime += dt;
  for (const f of framers) f(frameTime, dt);
  const sz = Math.round(pos.z / 4) * 4;
  lights.sun.target.position.set(0, 0, sz - 10);
  lights.sun.position.copy(lights.sun.target.position).addScaledVector(envNow.dir, 150);
  lights.sky.position.copy(camera.position);

  // Ansicht seitlich/oben verschieben, damit die Karte das Haus nicht verdeckt
  const narrow = isNarrow();
  const cardOpen = selected >= 0;
  const target = {
    x: cardOpen && !narrow ? 400 + 32 : 0,
    y: cardOpen && narrow ? Math.min(innerHeight * 0.62, $('#card').offsetHeight || 0) : 0,
  };
  const before = viewShift.x + viewShift.y * 1000;
  const lk = reduceMotion ? 1 : Math.min(1, dt * 6);
  viewShift.x += (target.x - viewShift.x) * lk;
  viewShift.y += (target.y - viewShift.y) * lk;
  if (Math.abs(target.x - viewShift.x) < 0.5) viewShift.x = target.x;
  if (Math.abs(target.y - viewShift.y) < 0.5) viewShift.y = target.y;
  if (viewShift.x + viewShift.y * 1000 !== before) applyViewOffset();

  const you = document.getElementById('you');
  if (you) you.style.left = `${stripPct(pos.z)}%`;

  nearClock += dt;
  if (nearClock > 0.25) {
    nearClock = 0;
    placeLampLights();
    let best = -1, bd = 9;
    houses.forEach((H, i) => { const d = Math.abs(H.z - pos.z); if (d < bd) { bd = d; best = i; } });
    if (best !== lastNear) {
      lastNear = best;
      document.querySelectorAll('#dir-list li[data-i]').forEach((li) => li.classList.toggle('here', +li.dataset.i === best));
    }
  }
}

// ---------- Start ----------

async function waitFonts() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`700 64px "Barlow Semi Condensed"`),
        document.fonts.load(`600 64px "Barlow Semi Condensed"`),
        document.fonts.load(`600 40px Barlow`),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {}
}

async function main() {
  const [data] = await Promise.all([loadData(), waitFonts()]);
  info = data;
  document.title = data.streetName;
  $('#street-name').textContent = data.streetName;
  $('#subtitle').textContent = data.subtitle;

  if (!renderer) {
    houses = data.projects.map((p, i) => ({ p, side: i % 2 === 0 ? -1 : 1, z: 0, bodyMat: null }));
    buildDirectory();
    $('#dir-toggle').setAttribute('aria-expanded', 'true');
    $('#loading').classList.add('done');
    return;
  }

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  lights = setupLights();

  houses = data.projects.map((p, i) =>
    buildHouse(p, i, signTexture(p.number, p.title, p.house.floors === 0 ? 'Baustelle' : p.demo ? 'Live-Demo drinnen' : null), plateTexture(p.number)),
  );
  const n = houses.length;
  buildPlot(n, 'Bauplatz frei');
  buildPlot(n + 1, 'Bauplatz frei');
  const endZ = START_Z - (n + 1) * STEP_Z;
  const { turnZ } = buildWorld(endZ, data);
  buildTrees(endZ, turnZ);
  buildLamps(n);
  buildRoom();
  bounds = { minZ: turnZ + 2, maxZ: 16 };
  setupDaylight();

  buildDirectory();
  buildStrip();
  setupInput();
  resize();

  const hashName = decodeURIComponent(location.hash.slice(1));
  const start = houses.findIndex((H) => H.p.name === hashName);

  if (start >= 0) {
    // Direktlink (z. B. Hausnummer aus der README): ohne Anflug direkt zum Haus
    select(start);
  } else if (!reduceMotion) {
    // Anflug von oben in die Straße
    pos.set(0, 0, 40); camY = 30; pitch = -0.62; yaw = 0;
    flyTo({ x: 0, z: 12, y: EYE, yaw: 0, pitch: -0.04 }, 2.6, true);
  }
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    renderer.render(scene, camera);
    renderScreen();
  });
  requestAnimationFrame(() => $('#loading').classList.add('done'));
}

main().catch((err) => {
  console.error(err);
  const l = $('#loading');
  l.classList.add('error');
  l.textContent = 'Die Straße konnte nicht geladen werden. Alle Projekte findest du auf github.com/Jade-HS-Vibecoding-WPK.';
});
