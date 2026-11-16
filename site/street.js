import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { houseFor, prettyTitle, FLOOR_H, rng } from './house.mjs';

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
          house: houseFor(r.name, null, false),
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
  scene.add(new THREE.HemisphereLight('#f1f6ff', '#b6a98f', 1.5));
  const sun = new THREE.DirectionalLight('#fff4e2', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 140 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color('#86b3dc') }, bottom: { value: HORIZON.clone() } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 bottom; varying vec3 vDir;' +
        'void main(){ float k = clamp(vDir.y * 1.8 + 0.02, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(k, 0.75)), 1.0);\n#include <colorspace_fragment>\n}',
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);
  return { sun, sky };
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
    const rad = half + 0.3;
    const geo = new THREE.CylinderGeometry(rad, rad, length + 0.5, 28, 1, false, Math.PI / 2, Math.PI);
    geo.rotateX(Math.PI / 2);
    const m = mesh(geo, [roofMat, wallMat, wallMat]);
    m.scale.y = 0.45;
    g.add(m);
    return { group: g, height: rad * 0.45 };
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

function buildHouse(p, index, signTex, plateTex) {
  const hs = p.house;
  const side = index % 2 === 0 ? -1 : 1;
  const z = START_Z - index * STEP_Z;
  const W = hs.width, D = hs.depth, H = hs.floors * FLOOR_H;
  const r = rng(hs.seed);
  const active = p.pushedAt && Date.now() - Date.parse(p.pushedAt) < 24 * 3600 * 1000;

  const g = new THREE.Group();
  g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  g.position.set(side * (SETBACK + D / 2), 0, z);

  const bodyMat = new THREE.MeshStandardMaterial({ color: hs.facade, roughness: 0.92 });
  const roofMat = mat(hs.roofColor, { roughness: 0.8 });
  const front = D / 2;
  // Ecke Richtung Straßeneingang (für das Ausleger-Schild)
  const cornerX = side < 0 ? -(W / 2 - 0.6) : W / 2 - 0.6;

  if (hs.floors > 0) {
    g.add(box(W + 0.3, 0.3, D + 0.3, mat('#8f8a82'), 0, 0.15, 0));
    g.add(box(W, H, D, bodyMat, 0, H / 2 + 0.3 - 0.3, 0));

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
    g.add(box(1.4, 2.45, 0.08, frameMat, 0, 1.5, front + 0.02, { cast: false }));
    g.add(box(1.15, 2.25, 0.12, mat('#6b4f3a', { roughness: 0.7 }), 0, 1.42, front + 0.04, { cast: false }));
    g.add(box(1.9, 0.18, 0.7, mat('#b9b3a8'), 0, 0.09, front + 0.35));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4), new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.5 }));
    plate.position.set(1.15, 2.45, front + 0.03);
    g.add(plate);

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
  if (hedgeW > 0.6 && hs.floors > 0) {
    const hedge = mat(r() < 0.5 ? '#7f9a63' : '#8aa56c');
    for (const s of [-1, 1]) g.add(box(hedgeW, 0.75, 0.55, hedge, s * (0.75 + 0.2 + hedgeW / 2), 0.375, front + YARD - 0.4));
  }

  // Ausleger-Schild (beidseitig lesbar, quer zur Straße)
  const metal = mat('#2b333c', { metalness: 0.5, roughness: 0.4 });
  const armY = hs.floors > 0 ? Math.min(3.25, H - 0.2) : 3.4;
  // an der Fassade – oder auf der Baustelle an einem Pfosten am Zaun
  const anchorZ = hs.floors > 0 ? front : front + YARD - 0.9;
  if (hs.floors === 0) g.add(box(0.14, armY + 0.1, 0.14, metal, cornerX, (armY + 0.1) / 2, anchorZ));
  g.add(box(0.07, 0.07, 3.3, metal, cornerX, armY, anchorZ + 1.65, { cast: false }));
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 });
  const signFrame = mat('#1f2a36');
  const sign = mesh(new THREE.BoxGeometry(0.06, 1.4, 2.8), [signMat, signMat, signFrame, signFrame, signFrame, signFrame]);
  sign.position.set(cornerX, armY - 0.88, anchorZ + 1.75);
  g.add(sign);
  for (const dz of [-1.1, 1.1]) g.add(box(0.03, 0.18, 0.03, metal, cornerX, armY - 0.12, anchorZ + 1.75 + dz, { cast: false }));

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
  const banMat = new THREE.MeshStandardMaterial({ map: banTex, roughness: 0.7 });
  const banFrame = mat('#1f2a36');
  scene.add(mesh(new THREE.BoxGeometry(2 * CURB - 0.7, 1.25, 0.08), [banFrame, banFrame, banFrame, banFrame, banMat, banMat]).translateY(5.2).translateZ(2));

  // Straßenschild
  scene.add(box(0.09, 3.1, 0.09, mat('#7d858d', { metalness: 0.5 }), STREET_HALF + 1.0, 1.55, -3));
  const ssMat = new THREE.MeshStandardMaterial({ map: streetSignTexture(info.streetName), roughness: 0.5 });
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
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
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

// ---------- Bewegung ----------

const pos = new THREE.Vector3(0, EYE, 12);
let yaw = 0, pitch = -0.04, camY = EYE;
let velF = 0, velS = 0, wheelVel = 0, walked = 0;
const keys = new Set();
let tween = null;
let bounds = { minZ: -100, maxZ: 16 };

function poseFor(i) {
  const H = houses[i];
  const floors = H.p.house.floors || 2;
  const portrait = innerWidth < innerHeight;
  const back = (6.5 + Math.max(0, floors - 2) * 1.3) * (portrait ? 1.45 : 1);
  const x = -H.side * (portrait ? 3.2 : 1.4), z = H.z + back;
  const tx = H.side * (SETBACK + 0.5), tz = H.z;
  const ty = clamp(floors * FLOOR_H * 0.5 + 0.8, 2.6, 8);
  const dx = tx - x, dz = tz - z;
  return { x, z, y: EYE, yaw: Math.atan2(-dx, -dz), pitch: clamp(Math.atan2(ty - EYE, Math.hypot(dx, dz)), -0.2, 0.42) };
}

function flyTo(pose, dur = 1.4, lock = false) {
  tween = { from: { x: pos.x, z: pos.z, y: camY, yaw, pitch }, to: pose, t: 0, dur: reduceMotion ? 0.001 : dur, lock };
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
  if (i < 0 || i >= houses.length) return;
  selected = i;
  renderCard(houses[i].p, i);
  document.querySelectorAll('#dir-list li, .dot').forEach((n) => n.classList.toggle('selected', +n.dataset.i === i));
  if (fly && renderer) flyTo(poseFor(i));
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
    ['Sprache', p.language || '–'],
    ['Zuletzt aktiv', ago(p.pushedAt)],
  ];
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
      h('a', { class: 'btn primary', href: p.url, target: '_blank', rel: 'noopener' }, 'Repository öffnen ↗'),
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

function setupInput() {
  const moveKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'Escape') { closeCard(); closeDirectoryOnMobile(); return; }
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
        pitch = clamp(pitch + dy * 0.0028, -0.7, 0.6);
      } else {
        yaw += dx * 0.005;
        pos.x += -Math.sin(yaw) * dy * 0.06;
        pos.z += -Math.cos(yaw) * dy * 0.06;
      }
      setHover(-1);
    } else if (e.pointerType === 'mouse') {
      setHover(pick(e.clientX, e.clientY), e.clientX, e.clientY);
    }
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const click = drag.moved < 6;
    drag = null;
    canvas.classList.remove('dragging');
    if (click && e.type === 'pointerup') {
      const i = pick(e.clientX, e.clientY);
      if (i >= 0) select(i);
      else if (isNarrow()) closeCard();
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => setHover(-1));
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
    if (i >= 0 && i !== selected) select(i);
  });
}

function resize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight, false);
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
    tween.t = Math.min(1, tween.t + dt / tween.dur);
    const k = ease(tween.t), f = tween.from, t = tween.to;
    pos.x = f.x + (t.x - f.x) * k;
    pos.z = f.z + (t.z - f.z) * k;
    camY = f.y + (t.y - f.y) * k;
    yaw = angleLerp(f.yaw, t.yaw, k);
    pitch = f.pitch + (t.pitch - f.pitch) * k;
    velF = velS = wheelVel = 0;
    if (tween.t >= 1) tween = null;
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
    velF += (fIn * SPEED * run - velF) * k;
    velS += (sIn * SPEED * 0.8 * run - velS) * k;
    wheelVel *= Math.pow(0.12, dt);
    const f = velF + wheelVel;
    pos.x += (-Math.sin(yaw) * f + Math.cos(yaw) * velS) * dt;
    pos.z += (-Math.cos(yaw) * f - Math.sin(yaw) * velS) * dt;
    walked += Math.hypot(f, velS) * dt;
  }
  if (!tween?.lock) {
    pos.x = clamp(pos.x, -(CURB - 0.5), CURB - 0.5);
    pos.z = clamp(pos.z, bounds.minZ, bounds.maxZ);
  }
  const bob = reduceMotion || tween ? 0 : Math.sin(walked * 1.9) * 0.035;
  camera.position.set(pos.x, camY + bob, pos.z);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');

  const sz = Math.round(pos.z / 4) * 4;
  lights.sun.target.position.set(0, 0, sz - 10);
  lights.sun.position.set(28, 46, sz + 8);
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
    buildHouse(p, i, signTexture(p.number, p.title, p.house.floors === 0 ? 'Baustelle' : null), plateTexture(p.number)),
  );
  const n = houses.length;
  buildPlot(n, 'Bauplatz frei');
  buildPlot(n + 1, 'Bauplatz frei');
  const endZ = START_Z - (n + 1) * STEP_Z;
  const { turnZ } = buildWorld(endZ, data);
  buildTrees(endZ, turnZ);
  bounds = { minZ: turnZ + 2, maxZ: 16 };

  buildDirectory();
  buildStrip();
  setupInput();
  resize();

  const hashName = decodeURIComponent(location.hash.slice(1));
  const start = houses.findIndex((H) => H.p.name === hashName);

  // Anflug von oben in die Straße
  if (!reduceMotion) {
    pos.set(0, 0, 40); camY = 30; pitch = -0.62; yaw = 0;
    flyTo({ x: 0, z: 12, y: EYE, yaw: 0, pitch: -0.04 }, 2.6, true);
  }
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const wasIntro = tween?.lock;
    update(dt);
    if (wasIntro && !tween && start >= 0) select(start);
    renderer.render(scene, camera);
  });
  if (reduceMotion && start >= 0) select(start);
  requestAnimationFrame(() => $('#loading').classList.add('done'));
}

main().catch((err) => {
  console.error(err);
  const l = $('#loading');
  l.classList.add('error');
  l.textContent = 'Die Straße konnte nicht geladen werden. Alle Projekte findest du auf github.com/Jade-HS-Vibecoding-WPK.';
});
