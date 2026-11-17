// Eigene Bauweisen für einzelne Projekte. Jede greift Farben, Formen und Motive aus der
// Oberfläche des jeweiligen Projekts auf (overrides.house in street.config.json).
// Lokale Koordinaten wie in street.js: x entlang der Straße, z zur Straße hin (+D/2 = Fassade), y nach oben.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FLOOR_H, rng, EFFIZIENZ, PASSIV_UPGRADES, SWATCHES, mapLayerCount, ampelFor, renditeSteps } from './house.mjs';

let K; // Werkzeugkasten aus street.js: mat, mesh, box, boxGeo, meterUVs, facadeMaterial, addDoor, …

export function buildStyled(g, p, hs, kit) {
  K = kit;
  const fn = BUILDERS[hs.style];
  return fn ? fn(g, p, hs) ?? {} : null;
}

// ---------- Helfer ----------

const dims = (hs) => ({ W: hs.width, D: hs.depth, H: hs.floors * FLOOR_H, fz: hs.depth / 2 });
const add = (g, ...objs) => { for (const o of objs) if (o) g.add(o); };
const merged = (geos, material, opts) => (geos.length ? K.mesh(mergeGeometries(geos), material, opts) : null);

const texCache = new Map();
function tex(key, w, h, draw, { repeat = false } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), c);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
const matCache = new Map();
function texMat(key, make) {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
}

// Fläche mit Bild oder Schrift, schaut zur Straße (+z)
function picture(key, w, h, draw, px = 128) {
  const t = tex(`pic:${key}`, Math.round((px * w) / h), px, draw);
  const m = texMat(`pic:${key}`, () => new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.8 }));
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}
function textPlate(text, w, h, { color = '#111111', bg = null, font = 'system-ui, sans-serif', weight = 700, size = 0.6 } = {}) {
  return picture(`txt:${text}:${color}:${bg}:${font}:${w}x${h}`, w, h, (g, c) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); }
    g.fillStyle = color;
    g.font = `${weight} ${Math.round(c.height * size)}px ${font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height * 0.54);
  });
}
function at(obj, x, y, z, ry = 0) {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  return obj;
}

const lineMats = new Map();
function edges(geo, color = '#151515', x = 0, y = 0, z = 0) {
  if (!lineMats.has(color)) lineMats.set(color, new THREE.LineBasicMaterial({ color }));
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), lineMats.get(color));
  l.position.set(x, y, z);
  return l;
}

function body(g, W, H, D, material, x = 0, y = 0, z = 0) {
  const m = K.mesh(K.meterUVs(new THREE.BoxGeometry(W, H, D), W, H, D), material);
  m.position.set(x, y + H / 2, z);
  g.add(m);
  return m;
}

// Fenster wie bei den normalen Häusern, mit eigenen Materialien.
// Leuchten (litMat) nur, wenn in den letzten 24 Stunden gepusht wurde.
function windows(g, hs, o = {}) {
  const { W, D, fz } = dims(hs);
  const {
    ww = 1.1, wh = 1.45, y0 = 1.75, frame = K.frameMat, frameW = 0.2, dark = K.glassMat, lit = K.litMat,
    depth = 0.08, out = 0.02, sides = true, skipDoor = true, floors = hs.floors,
  } = o;
  const nc = o.cols ?? Math.max(2, Math.floor((W - 1) / 2));
  const xs = o.xs ?? Array.from({ length: nc }, (_, c) => -W / 2 + (W * (c + 0.5)) / nc);
  const frames = [], darkG = [], litG = [];
  const pick = () => (K.active && K.r() < 0.55 ? litG : darkG);
  for (let f = 0; f < floors; f++) {
    const y = f * FLOOR_H + y0;
    for (const x of xs) {
      if (f === 0 && skipDoor && Math.abs(x) < 1.3) continue;
      if (frame) frames.push(K.boxGeo(ww + frameW, wh + frameW, depth, x, y, fz + out));
      pick().push(K.boxGeo(ww, wh, depth + 0.04, x, y, fz + out));
    }
    if (!sides) continue;
    const n = Math.max(1, Math.floor((D - 1.5) / 2.6));
    for (let j = 0; j < n; j++) {
      const z = -D / 2 + (D * (j + 0.5)) / n;
      for (const sx of sides === true ? [-1, 1] : [sides]) {
        if (frame) frames.push(K.boxGeo(depth, wh + frameW, ww + frameW, sx * (W / 2 + out), y, z));
        pick().push(K.boxGeo(depth + 0.04, wh, ww, sx * (W / 2 + out), y, z));
      }
    }
  }
  add(g, merged(frames, frame, { cast: false }), merged(darkG, dark, { cast: false }), merged(litG, lit, { cast: false }));
  return xs;
}

function roofOn(g, hs, wallMat, roofMat, H) {
  const roof = hs.ridge === 'street'
    ? K.buildRoof(hs.roof, hs.width, hs.depth, wallMat, roofMat, K.r)
    : K.buildRoof(hs.roof, hs.depth, hs.width, wallMat, roofMat, K.r);
  if (hs.ridge !== 'street') roof.group.rotation.y = Math.PI / 2;
  roof.group.position.y = H;
  g.add(roof.group);
  return roof;
}

function flatRoof(g, W, D, H, material, { over = 0.2, t = 0.3, line } = {}) {
  const geo = new THREE.BoxGeometry(W + over * 2, t, D + over * 2);
  g.add(at(K.mesh(geo, material), 0, H + t / 2, 0));
  if (line) g.add(edges(geo, line, 0, H + t / 2, 0));
}

// Kreisförmige Marke (Prüfhaken, Befund, Nordpfeil …)
function badge(key, size, draw) {
  return picture(`badge:${key}`, size, size, (g, c) => draw(g, c.width), 128);
}

// ---------- 3 Gebäudehöhentool: weißes Umgebungsmodell mit blauer Höhenkote ----------
function hoehenmodell(g, p, hs) {
  const { W, D, H, fz } = dims(hs);
  const white = K.mat('#eef1f4', { roughness: 1 });
  body(g, W, H, D, white);
  const seams = [];
  for (let f = 1; f < hs.floors; f++) seams.push(K.boxGeo(W + 0.04, 0.06, D + 0.04, 0, f * FLOOR_H, 0));
  add(g, merged(seams, K.mat('#d5dbe1'), { cast: false }));
  windows(g, hs, { frame: null, dark: K.mat('#5b6773', { roughness: 0.5 }) });
  K.addDoor(g, fz, K.plateTex);
  // Dachfarbe nach Dachtyp wie im Tool: flach gelb, Sattel orange, sonst grün
  const roofColor = { flat: '#e6cc4d', gable: '#f28019' }[hs.roof] ?? '#2e7d4f';
  roofOn(g, hs, white, K.mat(roofColor, { roughness: 0.8 }), H);
  // Maßkette an der Ecke: ein Strich pro Geschoss, oben die Höhe in Metern
  const blue = K.mat('#2f6fdf', { roughness: 0.6 });
  const x = K.gs * (W / 2 + 0.4), z = fz + 0.4;
  const dim = [K.boxGeo(0.05, H, 0.05, x, H / 2, z)];
  for (let f = 0; f <= hs.floors; f++) {
    dim.push(K.boxGeo(0.45, 0.05, 0.05, x, f * FLOOR_H, z));
    const tick = new THREE.BoxGeometry(0.04, 0.3, 0.04).rotateZ(Math.PI / 4).translate(x, f * FLOOR_H, z);
    dim.push(tick);
  }
  add(g, merged(dim, blue, { cast: false }));
  const kote = `${H.toFixed(2).replace('.', ',')} m`;
  g.add(at(textPlate(kote, 1.7, 0.5, { color: '#ffffff', bg: '#2f6fdf' }), x + K.gs * 0.95, H + 0.1, z));
  return {};
}

// ---------- 4 laserdatei-aus-3D (LaserPrep): Kraftkarton mit oranger Schnittkante, Abwicklung im Garten ----------
function kraftTex() {
  return tex('kraft', 256, 256, (g) => {
    g.fillStyle = '#c9a46c';
    g.fillRect(0, 0, 256, 256);
    const r = rng(7);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(120,85,40,0.13)' : 'rgba(255,240,210,0.13)';
      g.fillRect(r() * 256, r() * 256, 1 + r() * 4, 1);
    }
    // gelaserte Ziegelgravur
    g.strokeStyle = 'rgba(105,68,30,0.55)';
    g.lineWidth = 2;
    const rows = 6, rh = 256 / rows;
    for (let row = 0; row < rows; row++) {
      const y = Math.round(row * rh) + 1;
      g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
      for (let x = row % 2 ? 0 : 64; x < 256; x += 128) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + rh); g.stroke(); }
    }
  }, { repeat: true });
}
function karton(g, p, hs) {
  const { W, D, H, fz } = dims(hs);
  const kraft = texMat('kraft', () => new THREE.MeshStandardMaterial({ map: kraftTex(), roughness: 0.95 }));
  const edge = K.mat('#a9824a', { roughness: 1 });
  const orange = K.mat('#ff6a00', { roughness: 0.6 });
  body(g, W, H, D, kraft);
  // Plattenstöße an Ecken und Geschossen (Schnittkante dunkler)
  const seams = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) seams.push(K.boxGeo(0.07, H, 0.07, sx * W / 2, H / 2, sz * D / 2));
  for (let f = 1; f < hs.floors; f++) seams.push(K.boxGeo(W + 0.03, 0.05, D + 0.03, 0, f * FLOOR_H, 0));
  add(g, merged(seams, edge, { cast: false }));
  // Fenster als ausgelaserte Öffnungen: orange Schnittlinie, dahinter dunkel
  windows(g, hs, { frame: orange, frameW: 0.07, dark: K.mat('#3b2a1a', { roughness: 1 }) });
  K.addDoor(g, fz, K.plateTex);
  const lid = K.meterUVs(new THREE.BoxGeometry(W + 0.6, 0.22, D + 0.6), W + 0.6, 0.22, D + 0.6);
  g.add(at(K.mesh(lid, [edge, edge, kraft, kraft, edge, edge]), 0, H + 0.11, 0));
  // Abwicklung eines Würfels: pro Verdopplung eine Fläche mehr, bei 6 komplett
  const net = [[1, 0], [1, 1], [0, 1], [2, 1], [1, 2], [1, 3]];
  const cell = 1.6, cuts = [], plates = [];
  net.slice(0, Math.min(6, hs.floors)).forEach(([c, row]) => {
    const x = K.gs * (W / 2 + 1.4 + c * cell), z = fz - 0.9 - row * cell;
    cuts.push(K.boxGeo(cell - 0.04, 0.03, cell - 0.04, x, 0.015, z));
    plates.push(K.boxGeo(cell - 0.12, 0.05, cell - 0.12, x, 0.045, z));
  });
  add(g, merged(cuts, orange, { cast: false }), merged(plates, kraft, { cast: false }));
  return {};
}

// ---------- 5 Grundstücksanalyse: Papier, Tusche, roter Standortpunkt ----------
function plankopf(g, p, hs) {
  const { W, D, H, fz } = dims(hs);
  const paper = K.mat('#f7f5ef', { roughness: 1 });
  const ink = '#1a1a1a';
  const b = body(g, W, H, D, paper);
  g.add(edges(b.geometry, ink, 0, H / 2, 0));
  const lines = [];
  for (let f = 1; f < hs.floors; f++) lines.push(K.boxGeo(W + 0.03, 0.04, D + 0.03, 0, f * FLOOR_H, 0));
  add(g, merged(lines, K.mat(ink), { cast: false }));
  windows(g, hs, { frame: K.mat(ink), frameW: 0.1, dark: K.mat('#dcd7ca', { roughness: 1 }) });
  K.addDoor(g, fz, K.plateTex);
  flatRoof(g, W, D, H, paper, { over: 0.15, line: ink });
  // Nordpfeil an der Fassade
  g.add(at(badge('nord-ink', 1.0, (c, s) => {
    c.strokeStyle = ink; c.lineWidth = s * 0.05;
    c.beginPath(); c.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2); c.stroke();
    c.fillStyle = ink;
    c.beginPath(); c.moveTo(s / 2, s * 0.14); c.lineTo(s * 0.66, s * 0.62); c.lineTo(s / 2, s * 0.52); c.lineTo(s * 0.34, s * 0.62); c.closePath(); c.fill();
    c.font = `700 ${s * 0.2}px system-ui, sans-serif`; c.textAlign = 'center'; c.fillText('N', s / 2, s * 0.84);
  }), -K.gs * (W / 2 - 0.8), H - 0.75, fz + 0.03));
  // roter Standortpunkt auf dem Dach
  const red = K.mat('#d62828', { roughness: 0.45 });
  const top = H + 0.3;
  const cone = new THREE.ConeGeometry(0.42, 1.25, 20).rotateX(Math.PI).translate(0, top + 0.62, 0);
  const ball = new THREE.SphereGeometry(0.55, 24, 16).translate(0, top + 1.45, 0);
  g.add(K.mesh(mergeGeometries([cone, ball]), red));
  g.add(at(K.mesh(new THREE.SphereGeometry(0.2, 16, 12), K.mat('#ffffff')), 0, top + 1.5, 0.42));
  return {};
}

// ---------- 6 Mapping-Tool: schwarzer Schwarzplan-Block auf weißer Platte ----------
function schwarzplan(g, p, hs) {
  const { W, D, H, fz } = dims(hs);
  const black = K.mat('#1d1d1f', { roughness: 0.85 });
  const white = K.mat('#f5f5f7', { roughness: 0.95 });
  // weiße Grundplatte: der echte Schatten der Sonne fällt darauf wie in der Sonnenstudie des Tools
  g.add(at(K.mesh(new THREE.BoxGeometry(W + 4.4, 0.12, D + 3.4), white, { cast: false }), 0, 0.06, -0.3));
  body(g, W, H, D, black);
  // Fensterbänder in iOS-Blau
  const glass = K.mat('#0b4f9c', { roughness: 0.2, metalness: 0.35 });
  const dark = [], lit = [];
  for (let f = 0; f < hs.floors; f++) {
    const y = f * FLOOR_H + 1.8, list = K.active && K.r() < 0.55 ? lit : dark;
    if (f === 0) {
      const w = W / 2 - 0.5 - 0.9;
      for (const s of [-1, 1]) list.push(K.boxGeo(w, 1.25, 0.06, s * (0.9 + w / 2), y, fz + 0.02));
    } else list.push(K.boxGeo(W - 1.0, 1.25, 0.06, 0, y, fz + 0.02));
    for (const s of [-1, 1]) list.push(K.boxGeo(0.06, 1.25, D - 1.0, s * (W / 2 + 0.02), y, 0));
  }
  add(g, merged(dark, glass, { cast: false }), merged(lit, K.litMat, { cast: false }));
  g.add(at(K.mesh(new THREE.BoxGeometry(W + 0.12, 0.25, D + 0.12), white), 0, H + 0.12, 0));
  K.addDoor(g, fz, K.plateTex);
  return { hedges: false };
}

// ---------- 7 Modellbau-Laserdatei (HB Laser): Pfirsich-Platten, Fenster ausgeschnitten, Teilenummern ----------
function wallGeo(w, h, holes, t) {
  const pts = [[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]];
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const o of holes) {
    const hp = [[o.x - o.w / 2, o.y - o.h / 2], [o.x + o.w / 2, o.y - o.h / 2], [o.x + o.w / 2, o.y + o.h / 2], [o.x - o.w / 2, o.y + o.h / 2]];
    shape.holes.push(new THREE.Path(hp.map(([x, y]) => new THREE.Vector2(x, y))));
  }
  return new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
}
function laserplatte(g, p, hs) {
  const { W, D, H, fz } = dims(hs);
  const t = 0.18;
  const peach = K.mat('#ffead9', { roughness: 0.95 });
  const tomato = K.mat('#ff6347', { roughness: 0.7 });
  const inner = K.mat('#7a4a3a', { roughness: 1 });
  const ww = 1.1, wh = 1.45;
  const cols = Math.max(2, Math.floor((W - 1) / 2));
  const xs = Array.from({ length: cols }, (_, c) => -W / 2 + (W * (c + 0.5)) / cols);
  const nSide = Math.max(1, Math.floor((D - 1.5) / 2.6));
  const zs = Array.from({ length: nSide }, (_, j) => -D / 2 + (D * (j + 0.5)) / nSide);
  const frontHoles = [], sideHoles = [], litPanes = [];
  for (let f = 0; f < hs.floors; f++) {
    const y = f * FLOOR_H + 1.75;
    for (const x of xs) {
      if (f === 0 && Math.abs(x) < 1.3) continue;
      frontHoles.push({ x, y, w: ww, h: wh });
      if (K.active && K.r() < 0.55) litPanes.push(K.boxGeo(ww, wh, 0.02, x, y, fz - t - 0.03));
    }
    for (const z of zs) sideHoles.push({ x: z, y, w: ww, h: wh });
  }
  frontHoles.push({ x: 0, y: 1.25, w: 1.15, h: 2.3 }); // Tür
  // Außenplatten: Flächen pfirsich, Schnittkanten tomatenrot (Gruppen der ExtrudeGeometry)
  const front = wallGeo(W, H, frontHoles, t).translate(0, 0, fz - t);
  const back = wallGeo(W, H, [], t).rotateY(Math.PI).translate(0, 0, -fz + t);
  const right = wallGeo(D - 2 * t, H, sideHoles, t).rotateY(Math.PI / 2).translate(W / 2 - t, 0, 0);
  const left = wallGeo(D - 2 * t, H, sideHoles.map((o) => ({ ...o, x: -o.x })), t).rotateY(-Math.PI / 2).translate(-W / 2 + t, 0, 0);
  for (const geo of [front, back, right, left]) g.add(K.mesh(geo, [peach, tomato]));
  // Innenplatte, durch die Ausschnitte zu sehen
  body(g, W - 2 * t - 0.1, H, D - 2 * t - 0.1, inner);
  add(g, merged(litPanes, K.litMat, { cast: false }));
  // Geschossfugen als Schnittlinien und Dachplatte
  const seams = [];
  for (let f = 1; f < hs.floors; f++) seams.push(K.boxGeo(W + 0.02, 0.04, D + 0.02, 0, f * FLOOR_H, 0));
  add(g, merged(seams, tomato, { cast: false }));
  g.add(at(K.mesh(new THREE.BoxGeometry(W + 0.4, 0.25, D + 0.4), tomato), 0, H + 0.125, 0));
  g.add(at(K.mesh(new THREE.BoxGeometry(1.7, 0.16, 0.7), K.mat('#e9cdb8')), 0, 0.08, fz + 0.35));
  K.numberPlate(g, 0, 2.7, fz + 0.01);
  // Teilenummern A-001, A-002 … je Geschoss
  for (let f = 0; f < hs.floors; f++) {
    const id = `A-${String(f + 1).padStart(3, '0')}`;
    g.add(at(textPlate(id, 1.1, 0.32, { color: '#7a4a3a', font: '"Century Gothic", "Didact Gothic", sans-serif' }), -W / 2 + 0.85, f * FLOOR_H + 0.4, fz + 0.01));
  }
  return {};
}

// ---------- 8 Energieeffizienz (Greenprint): Passivhaus, das mit jeder Verdopplung nachhaltiger wird ----------
const EFF_COLORS = ['#b5603d', '#c27440', '#c8913a', '#d6c445', '#9bb24a', '#5e9a4f', '#3b8455'];
function passivhaus(g, p, hs) {
  const { W, D, H, fz } = dims(hs);
  const L = hs.level ?? 0;
  const sage = K.facadeMaterial('putz', '#c9ddcd');
  g.add(K.box(W + 0.3, 0.3, D + 0.3, K.mat('#5b6b73'), 0, 0.15, 0));
  body(g, W, H, D, sage);
  // Holzfaserfassade im Erdgeschoss
  if (L >= 2) body(g, W + 0.06, FLOOR_H, D + 0.06, K.facadeMaterial('holz', '#b9832c'), 0, 0.3);
  // Fenster mit tiefen, gedämmten Laibungen
  windows(g, hs, { frame: K.mat('#fbfcfa', { roughness: 0.8 }), frameW: 0.26, depth: 0.32, out: 0.05 });
  K.addDoor(g, fz, K.plateTex);
  const roof = roofOn(g, hs, sage, K.mat('#1f5a3d', { roughness: 0.75 }), H);
  // Solardach auf der Straßenseite
  if (L >= 1) {
    const hh = roof.height, ang = Math.atan2(hh, D / 2);
    const n = new THREE.Vector3(0, Math.cos(ang), Math.sin(ang));
    const panels = [];
    const cols = Math.max(2, Math.floor((W - 1.2) / 1.15));
    for (const u of [0.3, 0.62]) for (let c = 0; c < cols; c++) {
      const geo = new THREE.BoxGeometry(1.0, 0.05, 1.5).rotateX(ang);
      const pos = new THREE.Vector3(-((cols - 1) * 1.15) / 2 + c * 1.15, H + hh * u, (D / 2) * (1 - u)).addScaledVector(n, 0.3);
      panels.push(geo.translate(pos.x, pos.y, pos.z));
    }
    add(g, merged(panels, K.mat('#1d2b4a', { roughness: 0.25, metalness: 0.5 })));
  }
  const sx = K.gs * (W / 2);
  // Wärmepumpe neben dem Haus
  if (L >= 3) {
    g.add(K.box(1.1, 0.85, 0.5, K.mat('#e6e9e6'), sx + K.gs * 1.0, 0.45, fz - 1.2));
    g.add(at(K.mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 24).rotateX(Math.PI / 2), K.mat('#5b6b73')), sx + K.gs * 1.0, 0.47, fz - 0.94));
  }
  // Fassadengrün an der Seitenwand
  if (L >= 4) {
    const leaves = [], r = rng(hs.seed);
    for (let y = 0.4; y < H - 0.3; y += 0.45) for (let z = -D / 2 + 0.5; z < fz - 0.5; z += 0.45) {
      if (r() < 0.25 + 0.5 * (1 - y / H)) leaves.push(K.boxGeo(0.12, 0.42 + r() * 0.2, 0.42 + r() * 0.2, sx + K.gs * 0.07, y, z));
    }
    add(g, merged(leaves, K.mat('#3b8455', { roughness: 0.9 })));
  }
  // Regenspeicher an der Ecke
  if (L >= 5) g.add(at(K.mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 20), K.mat('#1f5a3d')), sx + K.gs * 0.6, 0.55, fz + 0.5));
  // E-Ladesäule im Vorgarten
  if (L >= 6) {
    g.add(K.box(0.32, 1.4, 0.22, K.mat('#fbfcfa'), sx - K.gs * 0.9, 0.7, fz + 2.0));
    g.add(K.box(0.2, 0.08, 0.02, K.mat('#3b8455', { emissive: '#3b8455', emissiveIntensity: 1 }), sx - K.gs * 0.9, 1.15, fz + 2.12));
  }
  // Effizienzklassen-Schild an der Tür: G … A, die aktuelle Klasse hervorgehoben
  g.add(at(picture(`eff:${L}`, 0.75, 0.95, (c, cv) => {
    const w = cv.width, h = cv.height;
    c.fillStyle = '#fbfcfa'; c.fillRect(0, 0, w, h);
    const rowH = (h - 12) / 7;
    // Zeilen von oben A (grün, kurz) bis unten G (rot, lang)
    for (let i = 0; i < 7; i++) {
      const y = 6 + i * rowH;
      c.fillStyle = EFF_COLORS[6 - i];
      c.fillRect(4, y, w * (0.36 + 0.07 * i), rowH - 3);
      c.fillStyle = '#ffffff'; c.font = `700 ${rowH * 0.72}px Nunito, system-ui, sans-serif`;
      c.fillText(EFFIZIENZ[6 - i], 8, y + rowH * 0.72);
    }
    const y = 6 + (6 - L) * rowH + (rowH - 3) / 2; // Pfeil auf der aktuellen Klasse
    c.fillStyle = '#111111';
    c.beginPath(); c.moveTo(w - 3, y - 10); c.lineTo(w - 3, y + 10); c.lineTo(w - 22, y); c.fill();
  }, 160), 1.2, 1.6, fz + 0.05));
  return {};
}

// ---------- 9 CO-Emissionsrechner: Swiss Style, pastellgrüne Wand, Nadelbäume als CO₂-Speicher ----------
function swiss(g, p, hs) {
  const { W, D, H, fz } = dims(hs);
  const white = K.mat('#ffffff', { roughness: 0.95 });
  const green = K.mat('#b7d7b0', { roughness: 0.95 });
  const mats = [white, white, white, white, white, white];
  mats[K.gs > 0 ? 0 : 1] = green;
  const b = K.mesh(new THREE.BoxGeometry(W, H, D), mats);
  b.position.y = H / 2;
  g.add(b);
  windows(g, hs, { ww: 1.25, wh: 1.25, frame: K.mat('#000000'), frameW: 0.12, dark: K.mat('#26303a', { roughness: 0.3 }) });
  K.addDoor(g, fz, K.plateTex);
  flatRoof(g, W, D, H, green, { over: 0.1, t: 0.25, line: '#000000' });
  // pro Verdopplung ein Nadelbaum, wie in ihrer Landschaftsgrafik
  const light = K.mat('#9fc393', { flatShading: true }), dark = K.mat('#527b59', { flatShading: true });
  const trunk = K.mat('#6b4f3a');
  for (let k = 0; k < hs.floors; k++) {
    const x = K.gs * (W / 2 + 1.5 + (k % 2) * 1.5), z = fz - 0.4 - k * 1.6;
    const s = 0.85 + ((k * 37) % 10) / 25;
    g.add(at(K.mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 6), trunk), x, 0.3, z));
    g.add(at(K.mesh(new THREE.ConeGeometry(0.95 * s, 2.0 * s, 7), k % 2 ? dark : light), x, 0.6 + s, z));
    g.add(at(K.mesh(new THREE.ConeGeometry(0.7 * s, 1.5 * s, 7), k % 2 ? light : dark), x, 0.6 + 2.0 * s, z));
  }
  return {};
}

// ---------- 10 plan-pruefer: Nachtblau wie die Oberfläche, je Geschoss ein Prüfhaken ----------
function planpruefer(g, p, hs) {
  const { W, D, H, fz } = dims(hs);
  const navy = K.mat('#1e2f4f', { roughness: 0.8 });
  const steel = K.mat('#a7b6d0', { roughness: 0.6 });
  g.add(K.box(W + 0.3, 0.3, D + 0.3, K.mat('#0f1e3a'), 0, 0.15, 0));
  body(g, W, H, D, navy);
  const lines = [];
  for (let f = 1; f < hs.floors; f++) lines.push(K.boxGeo(W + 0.04, 0.05, D + 0.04, 0, f * FLOOR_H, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lines.push(K.boxGeo(0.06, H, 0.06, sx * W / 2, H / 2, sz * D / 2));
  add(g, merged(lines, K.mat('#3c5072'), { cast: false }));
  windows(g, hs, { frame: steel, frameW: 0.12, dark: K.mat('#0f1e3a', { roughness: 0.3 }) });
  K.addDoor(g, fz, K.plateTex);
  flatRoof(g, W, D, H, K.mat('#263a5f'), { over: 0.15, t: 0.35, line: '#a7b6d0' });
  // weißer Nordpfeil
  g.add(at(badge('nord-white', 1.0, (c, s) => {
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(s / 2, s * 0.08); c.lineTo(s * 0.7, s * 0.62); c.lineTo(s / 2, s * 0.5); c.lineTo(s * 0.3, s * 0.62); c.closePath(); c.fill();
    c.font = `700 ${s * 0.26}px system-ui, sans-serif`; c.textAlign = 'center'; c.fillText('N', s / 2, s * 0.92);
  }), -K.gs * (W / 2 - 0.75), H - 0.75, fz + 0.03));
  // Prüfhaken je Geschoss, das oberste noch mit Befund (rosa)
  for (let f = 0; f < hs.floors; f++) {
    const ok = f < hs.floors - 1;
    g.add(at(badge(ok ? 'check' : 'befund', 0.5, (c, s) => {
      c.fillStyle = ok ? '#a7b6d0' : '#b06a8a';
      c.beginPath(); c.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ffffff'; c.fillStyle = '#ffffff'; c.lineWidth = s * 0.11; c.lineCap = 'round'; c.lineJoin = 'round';
      if (ok) { c.beginPath(); c.moveTo(s * 0.28, s * 0.52); c.lineTo(s * 0.44, s * 0.68); c.lineTo(s * 0.73, s * 0.34); c.stroke(); }
      else { c.font = `800 ${s * 0.62}px system-ui, sans-serif`; c.textAlign = 'center'; c.fillText('!', s / 2, s * 0.74); }
    }), K.gs * (W / 2 - 0.35), f * FLOOR_H + 1.75, fz + 0.03));
  }
  return {};
}

// ---------- 12 15-min-stadt-scanner: Milchglas-Pavillon, 15-Minuten-Ringe, ein Ziel-Pin pro Verdopplung ----------
function glas(g, p, hs) {
  const { W, D, H, fz } = dims(hs);
  const white = K.mat('#f2f2f7', { roughness: 0.6 });
  const slabs = [];
  for (let f = 0; f <= hs.floors; f++) slabs.push(K.boxGeo(W, 0.3, D, 0, Math.max(0.15, f * FLOOR_H), 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) slabs.push(K.boxGeo(0.22, H, 0.22, sx * (W / 2 - 0.11), H / 2, sz * (D / 2 - 0.11)));
  add(g, merged(slabs, white));
  // Kern mit Licht, wenn das Team gerade aktiv ist
  body(g, W * 0.42, H, D * 0.36, K.mat('#e5e5ea', { roughness: 0.7 }));
  const lit = [];
  for (let f = 0; f < hs.floors; f++) if (K.active && K.r() < 0.6) lit.push(K.boxGeo(W * 0.32, 1.7, 0.04, 0, f * FLOOR_H + 1.6, D * 0.18 + 0.02));
  add(g, merged(lit, K.litMat, { cast: false }));
  const frost = texMat('frost', () => new THREE.MeshStandardMaterial({ color: '#cfdbeb', transparent: true, opacity: 0.62, roughness: 0.2, metalness: 0.15, depthWrite: false }));
  g.add(at(K.mesh(new THREE.BoxGeometry(W - 0.06, H - 0.02, D - 0.06), frost, { cast: false, receive: false }), 0, H / 2, 0));
  // Glastür und Hausnummer
  g.add(K.box(1.6, 2.5, 0.06, white, 0, 1.4, fz + 0.01, { cast: false }));
  g.add(K.box(1.3, 2.3, 0.08, K.mat('#9fb3c8', { roughness: 0.2, metalness: 0.3 }), 0, 1.3, fz + 0.02, { cast: false }));
  K.numberPlate(g, 0, 2.85, fz + 0.06);
  // 15-Minuten-Ringe auf dem Boden
  const r1 = Math.max(W, D) / 2 + 1.0;
  const ringMat = texMat('ring', () => new THREE.MeshStandardMaterial({ color: '#007aff', transparent: true, opacity: 0.55, roughness: 0.6 }));
  for (const [r, w] of [[r1, 0.12], [r1 + 0.9, 0.08]]) {
    g.add(at(K.mesh(new THREE.RingGeometry(r - w, r, 96).rotateX(-Math.PI / 2), ringMat, { cast: false }), 0, 0.035, 0));
  }
  // Ziel-Pins in den Kategoriefarben: ÖPNV, Versorgung, Bildung, Grün, Blau
  const colors = ['#30b0c7', '#ff9500', '#af52de', '#34c759', '#007aff'];
  const angles = [28, 152, 58, 122, 8, 172, 40, 140];
  for (let k = 0; k < Math.min(hs.floors, angles.length); k++) {
    const a = (angles[k] * Math.PI) / 180;
    const x = Math.cos(a) * r1, z = Math.sin(a) * r1;
    const m = K.mat(colors[k % colors.length], { roughness: 0.35 });
    const pin = mergeGeometries([
      new THREE.ConeGeometry(0.26, 0.75, 16).rotateX(Math.PI).translate(0, 0.42, 0),
      new THREE.SphereGeometry(0.33, 20, 14).translate(0, 0.95, 0),
    ]);
    g.add(at(K.mesh(pin, m), x, 0, z));
    g.add(at(K.mesh(new THREE.SphereGeometry(0.12, 12, 10), K.mat('#ffffff')), x, 0.98, z + 0.26));
  }
  return { hedges: false };
}

// ---------- 13 fassaden-tool: Arbeitsmodell, jedes Geschoss ein anderes Fassadenmaterial ----------
function musterfassade(g, p, hs) {
  const { W, D, H, fz } = dims(hs);
  const grey = K.mat('#eeeeec', { roughness: 1 });
  const b = body(g, W, H, D, grey);
  g.add(edges(b.geometry, '#1f1f1f', 0, H / 2, 0));
  const colors = { klinker: '#a3563d', holz: '#b98654', putz: '#e8e2d4', beton: '#b8b5ae', metall: '#a3abb2' };
  for (let f = 0; f < hs.floors; f++) {
    const [key, name] = SWATCHES[f % SWATCHES.length];
    body(g, W, FLOOR_H, 0.04, K.facadeMaterial(key, colors[key]), 0, f * FLOOR_H, fz + 0.02);
    g.add(at(textPlate(name, 1.15, 0.3, { color: '#1f3a68', bg: '#ffffff', size: 0.55 }), -W / 2 + 0.75, f * FLOOR_H + 0.35, fz + 0.05));
  }
  windows(g, hs, { frame: K.mat('#1f3a68'), frameW: 0.14, dark: K.mat('#5b7db3', { roughness: 0.2, metalness: 0.2 }), out: 0.08 });
  K.addDoor(g, fz + 0.04, K.plateTex);
  flatRoof(g, W, D, H, grey, { over: 0.1, t: 0.25, line: '#1f1f1f' });
  return {};
}

// ---------- 14 treppenplaner: weiße Linienzeichnung, außen eine Treppe, die mit jeder Verdopplung einen Lauf höher führt ----------
function treppe(g, p, hs) {
  const { W, D, H, fz } = dims(hs);
  const white = K.mat('#ffffff', { roughness: 1 });
  const black = K.mat('#151515', { roughness: 0.7 });
  const b = body(g, W, H, D, white);
  g.add(edges(b.geometry, '#000000', 0, H / 2, 0));
  const lines = [];
  for (let f = 1; f < hs.floors; f++) lines.push(K.boxGeo(W + 0.02, 0.03, D + 0.02, 0, f * FLOOR_H, 0));
  add(g, merged(lines, black, { cast: false }));
  const xs = windows(g, hs, { frame: black, frameW: 0.08, dark: K.mat('#2a2a2a', { roughness: 0.3 }), sides: -K.gs });
  // ein einziger roter Strich: Signalrot nur an einem Fenster
  if (hs.floors > 1) {
    const x = xs[0], y = (hs.floors - 1) * FLOOR_H + 1.75, red = K.mat('#e2001a', { roughness: 0.6 });
    const fr = [K.boxGeo(1.5, 0.06, 0.06, x, y + 0.86, fz + 0.06), K.boxGeo(1.5, 0.06, 0.06, x, y - 0.86, fz + 0.06),
      K.boxGeo(0.06, 1.78, 0.06, x - 0.72, y, fz + 0.06), K.boxGeo(0.06, 1.78, 0.06, x + 0.72, y, fz + 0.06)];
    add(g, merged(fr, red, { cast: false }));
  }
  K.addDoor(g, fz, K.plateTex);
  flatRoof(g, W, D, H, white, { over: 0.08, t: 0.25, line: '#000000' });
  // Außentreppe an der Seite ohne Schild, Läufe im Zickzack
  const flights = hs.floors - 1;
  if (flights < 1) return {};
  const x0 = K.gs * (W / 2 + 0.65), Lr = Math.min(D - 2.8, 5.6), zA = fz - 1.3, zB = zA - Lr;
  const N = 16, rise = FLOOR_H / N, run = Lr / N, ang = Math.atan2(FLOOR_H, Lr), len = Math.hypot(FLOOR_H, Lr);
  const parts = [];
  for (let k = 0; k < flights; k++) {
    const y0 = k * FLOOR_H, dir = k % 2 ? 1 : -1, start = k % 2 ? zB : zA, end = start + dir * Lr;
    for (let i = 0; i < N; i++) parts.push(K.boxGeo(1.1, 0.07, run + 0.02, x0, y0 + rise * (i + 1) - 0.035, start + dir * run * (i + 0.5)));
    const mid = start + (dir * Lr) / 2, th = -dir * ang;
    for (const [dx, dy, h] of [[0.55, 1.5 - 0.15, 0.28], [-0.55, 1.5 - 0.15, 0.28], [0.55, 1.5 + 0.9, 0.05]]) {
      parts.push(new THREE.BoxGeometry(0.06, h, len).rotateX(th).translate(x0 + K.gs * dx, y0 + dy, mid));
    }
    for (const z of [start, end]) parts.push(K.boxGeo(0.05, 0.95, 0.05, x0 + K.gs * 0.55, y0 + (z === start ? 0 : FLOOR_H) + 0.47, z));
    const zl = end + dir * 0.55;
    parts.push(K.boxGeo(1.1, 0.14, 1.1, x0, (k + 1) * FLOOR_H - 0.07, zl));
    parts.push(K.boxGeo(0.05, 0.95, 1.1, x0 + K.gs * 0.55, (k + 1) * FLOOR_H + 0.47, zl));
    parts.push(K.boxGeo(0.05, 2.0, 0.9, K.gs * (W / 2 + 0.03), (k + 1) * FLOOR_H + 1.0, zl));
  }
  add(g, merged(parts, black));
  return {};
}

// ---------- 15 Map2Model: Sperrholzmodell mit Fingerzinken auf einer Kartenplatte ----------
function plywoodTex() {
  return tex('plywood', 256, 256, (g) => {
    g.fillStyle = '#e3cc9f';
    g.fillRect(0, 0, 256, 256);
    const r = rng(15);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(170,128,70,${0.12 + r() * 0.15})`;
      g.lineWidth = 1 + r() * 2;
      const y = r() * 256;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x / 40 + i) * 4);
      g.stroke();
    }
  }, { repeat: true });
}
function mapTex(key, w, h, draw) {
  return tex(`map:${key}`, w, h, draw);
}
function sperrholz(g, p, hs) {
  const { W, D, H, fz } = dims(hs);
  const PW = W + 3, PD = D + 2.6, pz = 0.1;
  const plate = mapTex('m2m', 512, Math.round((512 * PD) / PW), (c, cv) => {
    c.fillStyle = '#e9ece4'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#cfdcc0'; c.fillRect(0, 0, cv.width * 0.25, cv.height * 0.3); c.fillRect(cv.width * 0.8, cv.height * 0.6, cv.width * 0.2, cv.height * 0.4);
    c.strokeStyle = '#ffffff'; c.lineWidth = 14;
    for (const f of [0.12, 0.88]) { c.beginPath(); c.moveTo(cv.width * f, 0); c.lineTo(cv.width * f, cv.height); c.stroke(); }
    c.beginPath(); c.moveTo(0, cv.height * 0.08); c.lineTo(cv.width, cv.height * 0.08); c.stroke();
    c.strokeStyle = '#b9bfb2'; c.lineWidth = 1;
    for (let x = 0; x < cv.width; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, cv.height); c.stroke(); }
    for (let y = 0; y < cv.height; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(cv.width, y); c.stroke(); }
  });
  const edge = K.mat('#d8d4c8');
  const top = texMat('m2m-top', () => new THREE.MeshStandardMaterial({ map: plate, roughness: 0.95 }));
  g.add(at(K.mesh(new THREE.BoxGeometry(PW, 0.1, PD), [edge, edge, top, edge, edge, edge], { cast: false }), 0, 0.05, pz));
  const ply = texMat('ply', () => new THREE.MeshStandardMaterial({ map: plywoodTex(), roughness: 0.9 }));
  body(g, W, H, D, ply);
  // Fingerzinken an den Ecken: Stirnholz abwechselnd hell und dunkel
  const a = [], b = [];
  for (let y = 0, i = 0; y < H - 0.01; y += 0.5, i++) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) (i % 2 ? a : b).push(K.boxGeo(0.2, 0.5, 0.2, sx * W / 2, y + 0.25, sz * D / 2));
  }
  add(g, merged(a, K.mat('#c49a62')), merged(b, K.mat('#ecd8b0')));
  // gelaserte Fensterschlitze
  windows(g, hs, { ww: 0.34, wh: 1.7, frame: null, dark: K.mat('#3a2a18', { roughness: 1 }), cols: Math.max(3, Math.floor(W / 1.2)) });
  K.addDoor(g, fz, K.plateTex);
  g.add(at(K.mesh(new THREE.BoxGeometry(W + 0.4, 0.18, D + 0.4), ply), 0, H + 0.09, 0));
  return { hedges: false };
}

// ---------- 16 Workflow_App: Gantt-Balken als Geschosse, rote Jetzt-Linie wandert mit der Uhrzeit ----------
function kacheln(g, p, hs) {
  const { W, D, H } = dims(hs);
  const core = new RoundedBoxGeometry(W * 0.5, H, D * 0.8, 3, 0.45);
  g.add(at(K.mesh(core, K.mat('#f2f2f7', { roughness: 0.5 })), 0, H / 2, 0));
  const cats = ['#378add', '#1d9e75', '#d85a30', '#8e8e93'];
  const tile = K.mat('#fbfbfd', { roughness: 0.4 });
  const tiles = [], litTiles = [];
  const r = rng(hs.seed + 16);
  const bars = hs.floors - 1;
  for (let f = 1; f <= bars; f++) {
    const len = Math.min(W, W * (0.5 + 0.5 * r()));
    const t = bars > 1 ? (f - 1) / (bars - 1) : 0.5;
    const cx = -W / 2 + len / 2 + (W - len) * t;
    const bar = new RoundedBoxGeometry(len, 2.5, D * 0.9, 3, 0.4);
    g.add(at(K.mesh(bar, K.mat(cats[(f - 1) % cats.length], { roughness: 0.45 })), cx, f * FLOOR_H + 1.5, 0));
    const n = Math.max(1, Math.floor((len - 0.6) / 1.5));
    for (let i = 0; i < n; i++) {
      const x = cx - ((n - 1) * 1.5) / 2 + i * 1.5;
      (K.active && K.r() < 0.55 ? litTiles : tiles).push(K.boxGeo(0.9, 0.9, 0.04, x, f * FLOOR_H + 1.5, D * 0.45 + 0.01));
    }
  }
  add(g, merged(tiles, tile, { cast: false }), merged(litTiles, K.litMat, { cast: false }));
  K.addDoor(g, D * 0.4, K.plateTex);
  // Jetzt-Linie: rotes Band ums Haus, auf der Höhe der aktuellen Tageszeit (0 Uhr unten, 24 Uhr oben)
  const red = K.mat('#e24b4a', { emissive: '#e24b4a', emissiveIntensity: 0.5, roughness: 0.5 });
  const rw = W + 0.5, rd = D * 0.9 + 0.5;
  const ring = mergeGeometries([
    K.boxGeo(rw, 0.1, 0.06, 0, 0, rd / 2), K.boxGeo(rw, 0.1, 0.06, 0, 0, -rd / 2),
    K.boxGeo(0.06, 0.1, rd, rw / 2, 0, 0), K.boxGeo(0.06, 0.1, rd, -rw / 2, 0, 0),
    new THREE.SphereGeometry(0.18, 16, 12).translate(-rw / 2, 0, rd / 2),
  ]);
  const now = K.mesh(ring, red, { cast: false });
  g.add(now);
  const place = () => {
    const d = new Date();
    now.position.y = Math.max(0.15, (H * (d.getHours() + d.getMinutes() / 60)) / 24);
  };
  place();
  K.onTick(place);
  return { hedges: false };
}

// ---------- 17 Detailpruefer: Holzrahmenbau mit aufgeschnittener Ecke und Prüfmarken ----------
function insulationTex() {
  return tex('daemmung', 128, 128, (c) => {
    c.fillStyle = '#e8c547'; c.fillRect(0, 0, 128, 128);
    c.strokeStyle = 'rgba(120,90,10,0.55)'; c.lineWidth = 3;
    for (let row = 0; row < 2; row++) {
      c.beginPath();
      for (let i = 0; i <= 8; i++) c.lineTo(i * 16, row * 64 + (i % 2 ? 8 : 56));
      c.stroke();
    }
  }, { repeat: true });
}
function holzrahmen(g, p, hs) {
  const { W, D, H, fz } = dims(hs);
  const wood = K.facadeMaterial('holz', '#c8a36a');
  const SW = 1.6, cutD = 1.4, gs = K.gs;
  // Hauskörper ohne die aufgeschnittene Ecke
  body(g, W, H, D - cutD, wood, 0, 0, -cutD / 2);
  body(g, W - SW, H, cutD, wood, -gs * SW / 2, 0, fz - cutD / 2);
  // Wandaufbau von außen nach innen, jede Schicht weiter zurückgesetzt
  const layers = [
    [0.1, K.mat('#8b6a3e')],                                                   // Lattung
    [0.2, K.mat('#2f3b47')],                                                   // Winddichtung
    [0.25, texMat('daemmung', () => new THREE.MeshStandardMaterial({ map: insulationTex(), roughness: 1 }))], // Dämmung
    [0.62, K.mat('#d4b483')],                                                  // OSB
    [0.74, K.mat('#f0ede6')],                                                  // Gipskarton
  ];
  const sw = SW / layers.length;
  layers.forEach(([d, m], j) => {
    const depth = cutD - d;
    body(g, sw, H, depth, m, gs * (W / 2 - SW + sw * (j + 0.5)), 0, fz - cutD + depth / 2);
  });
  const cols = Math.max(2, Math.floor((W - 1) / 2));
  const xs = Array.from({ length: cols }, (_, c) => -W / 2 + (W * (c + 0.5)) / cols).filter((x) => Math.abs(x - gs * W / 2) > SW + 0.75);
  windows(g, hs, { xs, frame: K.mat('#6d5434'), frameW: 0.14 });
  K.addDoor(g, fz, K.plateTex);
  roofOn(g, hs, wood, K.mat('#4a4743', { roughness: 0.8 }), H);
  // Prüfmarken an Details: neueste Befunde rot/orange/blau, ältere schon grün korrigiert
  const spots = [
    [gs * (W / 2 - 0.8), 0.7], [-gs * (W / 2 - 0.7), H - 0.6], [gs * (W / 2 - 0.8), H * 0.5], [-gs * (W / 2 - 0.7), 0.7],
    [0, H - 0.5], [gs * (W / 2 - 0.8), H - 0.6], [-gs * (W / 2 - 0.7), H * 0.5],
  ];
  const n = Math.min(spots.length, hs.floors);
  const finding = ['#c62828', '#e07b00', '#1f6fb2'];
  for (let k = 0; k < n; k++) {
    const age = n - 1 - k; // 0 = neuester
    const color = age < finding.length ? finding[age] : '#15803d';
    const done = age >= finding.length;
    g.add(at(badge(`marke:${k + 1}:${color}`, 0.7, (c, s) => {
      c.globalAlpha = 0.92;
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2); c.fill();
      c.strokeStyle = color; c.lineWidth = s * 0.1; c.stroke();
      c.globalAlpha = 1;
      c.fillStyle = color; c.strokeStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
      if (done) { c.lineWidth = s * 0.1; c.beginPath(); c.moveTo(s * 0.3, s * 0.52); c.lineTo(s * 0.45, s * 0.67); c.lineTo(s * 0.72, s * 0.36); c.stroke(); }
      else { c.font = `700 ${s * 0.5}px Helvetica, Arial, sans-serif`; c.textAlign = 'center'; c.fillText(String(k + 1), s / 2, s * 0.68); }
    }), spots[k][0], spots[k][1], fz + 0.08));
  }
  return {};
}

// ---------- 18 Standortanalyse: Weißmodell auf einer Platte, bemalt wie die Karte (ein Layer mehr pro Verdopplung) ----------
function kartenplatte(g, p, hs) {
  const { W, D, H, fz } = dims(hs);
  const PW = W + 5, PD = D + 3.4, pz = -0.2;
  const n = mapLayerCount(hs);
  const cw = 640, ch = Math.round((cw * PD) / PW);
  const px = (x) => ((x + PW / 2) / PW) * cw, pzc = (z) => ((z - (pz - PD / 2)) / PD) * ch;
  const map = mapTex(`sta:${n}:${W}x${D}`, cw, ch, (c) => {
    const r = rng(18);
    c.fillStyle = '#f6f4ee'; c.fillRect(0, 0, cw, ch);
    const line = (pts, color, w, dash = []) => {
      c.strokeStyle = color; c.lineWidth = w; c.setLineDash(dash); c.lineCap = 'round';
      c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x * cw, y * ch) : c.moveTo(x * cw, y * ch))); c.stroke(); c.setLineDash([]);
    };
    if (n >= 1) { // Grünflächen und Spielplatz
      c.fillStyle = '#94b98a'; c.fillRect(0, 0, cw * 0.22, ch * 0.45); c.fillRect(cw * 0.8, ch * 0.05, cw * 0.2, ch * 0.35);
      c.fillStyle = '#bccb72'; c.fillRect(cw * 0.04, ch * 0.55, cw * 0.12, ch * 0.18);
    }
    if (n >= 2) line([[0, 0.05], [1, 0.05]], '#6a8caf', 22);
    if (n >= 3) { line([[0, 0.05], [1, 0.05]], '#e3c46b', 6, [18, 10]); c.fillStyle = '#c9a43a'; for (const x of [0.3, 0.7]) { c.beginPath(); c.arc(x * cw, 0.05 * ch, 9, 0, Math.PI * 2); c.fill(); } }
    if (n >= 4) line([[0.92, 1], [0.92, 0.12], [1, 0.12]], '#cf7fb0', 7);
    if (n >= 5) { c.fillStyle = '#557d4f'; for (let i = 0; i < 14; i++) { c.beginPath(); c.arc((r() < 0.5 ? 0.03 + r() * 0.15 : 0.82 + r() * 0.15) * cw, (0.15 + r() * 0.8) * ch, 7, 0, Math.PI * 2); c.fill(); } }
    if (n >= 6) { const uses = ['#d9625f', '#e9c24f', '#dcd0ec', '#b49fdc', '#dde7ee']; for (let i = 0; i < 6; i++) { c.fillStyle = uses[i % uses.length]; c.fillRect((i % 2 ? 0.84 : 0.02) * cw, (0.45 + Math.floor(i / 2) * 0.17) * ch, cw * 0.12, ch * 0.12); } }
    if (n >= 7) line([[0.5, 1], [0.5, 0.8]], '#efc6df', 6, [4, 8]);
    // Hausfläche frei lassen
    c.fillStyle = '#ffffff'; c.fillRect(px(-W / 2 - 0.2), pzc(-D / 2 - 0.2), ((W + 0.4) / PW) * cw, ((D + 0.4) / PD) * ch);
  });
  const edge = K.mat('#e9e6df');
  const top = texMat(`sta-top:${n}`, () => new THREE.MeshStandardMaterial({ map, roughness: 0.95 }));
  g.add(at(K.mesh(new THREE.BoxGeometry(PW, 0.1, PD), [edge, edge, top, edge, edge, edge], { cast: false }), 0, 0.05, pz));
  const white = K.mat('#ffffff', { roughness: 0.95 });
  body(g, W, FLOOR_H, D, K.mat('#e9c24f', { roughness: 0.9 })); // Erdgeschoss in der Nutzungsfarbe
  if (hs.floors > 1) body(g, W, H - FLOOR_H, D, white, 0, FLOOR_H);
  windows(g, hs, { frame: null, dark: K.mat('#4a4a4a', { roughness: 0.4 }) });
  K.addDoor(g, fz, K.plateTex);
  flatRoof(g, W, D, H, white, { over: 0.1, t: 0.25, line: '#c8c8c8' });
  return { hedges: false };
}

// ---------- 19 Kaufcheck: Stadthaus wie ein steigendes Balkendiagramm, Ampel nach Aktivität ----------
function rendite(g, p, hs) {
  const { W, D, fz } = dims(hs);
  const plaster = K.facadeMaterial('putz', '#f4f4f2');
  const dark = K.mat('#262624', { roughness: 0.6 });
  const steps = renditeSteps(hs.floors);
  const sw = W / 3;
  const order = K.gs > 0 ? steps : steps.slice().reverse(); // niedrig auf der Schildseite, hoch zum Garten
  const frames = [], glassG = [], litG = [];
  order.forEach((fl, j) => {
    const cx = -W / 2 + sw * (j + 0.5), h = fl * FLOOR_H;
    body(g, sw, h, D, plaster, cx, 0, 0);
    g.add(K.box(sw + 0.14, 0.22, D + 0.14, dark, cx, h + 0.11, 0));
    for (let f = 0; f < fl; f++) {
      const y = f * FLOOR_H + 1.8;
      if (!(f === 0 && Math.abs(cx) < 1.3)) {
        frames.push(K.boxGeo(1.24, 2.0, 0.08, cx, y, fz + 0.02));
        (K.active && K.r() < 0.55 ? litG : glassG).push(K.boxGeo(1.0, 1.76, 0.12, cx, y, fz + 0.02));
      }
      const outer = j === 0 ? -1 : j === 2 ? 1 : 0;
      if (outer) for (const z of [-D / 4, D / 4]) {
        frames.push(K.boxGeo(0.08, 2.0, 1.24, outer * (W / 2 + 0.02), y, z));
        (K.active && K.r() < 0.55 ? litG : glassG).push(K.boxGeo(0.12, 1.76, 1.0, outer * (W / 2 + 0.02), y, z));
      }
    }
  });
  add(g, merged(frames, dark, { cast: false }), merged(glassG, K.glassMat, { cast: false }), merged(litG, K.litMat, { cast: false }));
  // Sockel mit Fugen
  const fugen = [];
  for (const y of [0.75, 1.5, 2.25]) fugen.push(K.boxGeo(W + 0.02, 0.03, 0.02, 0, y, fz + 0.01));
  add(g, merged(fugen, K.mat('#bdbab2'), { cast: false }));
  K.addDoor(g, fz, K.plateTex);
  // Ampel neben der Tür: Urteil nach der letzten Aktivität
  const state = ampelFor(p.pushedAt);
  const ax = 1.15;
  g.add(K.box(0.34, 0.95, 0.18, dark, ax, 1.65, fz + 0.1));
  [['rot', '#d04a4a', 0.28], ['gelb', '#e0a030', 0], ['gruen', '#2e9e5b', -0.28]].forEach(([k, col, dy]) => {
    const on = k === state;
    const m = K.mat(on ? col : '#3a3a37', on ? { emissive: col, emissiveIntensity: 1.1, roughness: 0.4 } : { roughness: 0.5 });
    g.add(at(K.mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 20).rotateX(Math.PI / 2), m, { cast: false }), ax, 1.65 + dy, fz + 0.2));
  });
  return {};
}

const BUILDERS = {
  hoehenmodell, karton, plankopf, schwarzplan, laserplatte, passivhaus, swiss, planpruefer,
  glas, musterfassade, treppe, sperrholz, kacheln, holzrahmen, kartenplatte, rendite,
};
export const STYLED = new Set(Object.keys(BUILDERS));
