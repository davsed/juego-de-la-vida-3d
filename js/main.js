import * as THREE from 'three';
import { PRESETS, PATTERNS, randomSoup, key, ruleSignature } from './life.js?v=5';

const $ = (id) => document.getElementById(id);
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (isTouch) document.body.classList.add('touch');

// ---------- Ajustes ----------
const ZONES = {
  s: { half: 20, h: 30, seed: 12 },
  m: { half: 40, h: 50, seed: 16 },
  l: { half: 60, h: 64, seed: 20 },
};
const SPEEDS = [{ label: '1×', ms: 600 }, { label: '2×', ms: 300 }, { label: '4×', ms: 120 }, { label: '8×', ms: 30 }];
const MAX_INSTANCES = 260000;

const store = {
  get(k, d) { try { const v = localStorage.getItem('jv3d-' + k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('jv3d-' + k, JSON.stringify(v)); } catch (_) {} },
};
const plainRule = (r) => ({ type: r.type, survive: [...r.survive], born: [...r.born], bNeed: r.bNeed, sNeed: r.sNeed });
const settings = Object.assign(
  { preset: 'hervidero', rule: plainRule(PRESETS.hervidero.rule), start: 'random', zone: 'm', color: 'fate', sky: 'day' },
  store.get('settings', {})
);
const saveSettings = () => store.set('settings', settings);
// Durante un reto se usan sus propias reglas y recinto sin tocar los ajustes de la partida libre.
let active = { rule: settings.rule, zone: settings.zone, preset: settings.preset };
const zone = () => ZONES[active.zone] || ZONES.m;
const bounds = () => { const z = zone(); return { minX: -z.half, maxX: z.half, minY: 0, maxY: z.h - 1, minZ: -z.half, maxZ: z.half }; };

// ---------- Retos ----------
const GOALS = [
  { id: 'g1', name: 'Primer aliento', preset: 'bays', zone: 's', max: 12,
    text: 'Con las exigentes reglas de Bays y 12 cubos como mucho, consigue que algo siga vivo en la generación 20.',
    live: (s) => s.gen >= 20 && s.n > 0 },
  { id: 'g2', name: 'El viajero', preset: 'bays', zone: 'm', max: 10,
    text: 'Con 10 cubos o menos, que algo siga vivo en la generación 60. Pista: 🧩 Figuras → Planeador, ponlo cerca del centro y síguelo (si choca con la pared, muere).',
    live: (s) => s.gen >= 60 && s.n > 0 },
  { id: 'g3', name: 'Escultura', preset: 'planos', zone: 's', max: 60,
    text: 'Clásico en 3 planos: crea una figura de al menos 20 cubos que se quede totalmente quieta.',
    end: (r) => r.kind === 'cycle' && r.period === 1 && r.n >= 20 },
  { id: 'g4', name: 'Latido', preset: 'bays', zone: 's', max: 20,
    text: 'Reglas de Bays: crea algo que se repita en bucle (un ciclo de 2 o más pasos). Pista: grupos pequeños de 2 capas.',
    end: (r) => r.kind === 'cycle' && r.period >= 2 },
  { id: 'g5', name: 'Rascacielos', preset: 'piroclasto', zone: 's', max: 10,
    text: 'Lava: con 10 cubos o menos, haz que algún cubo toque el techo del recinto.',
    live: (s, g) => g.maxY >= zone().h - 1 },
  { id: 'g6', name: 'Superviviente', preset: 'planos', zone: 's', max: 15,
    text: 'Clásico en 3 planos: con 15 cubos o menos, sigue vivo en la generación 100.',
    live: (s) => s.gen >= 100 && s.n > 0 },
  { id: 'g7', name: 'Big Bang', preset: 'hervidero', zone: 's', max: 15,
    text: 'Hervidero: con 15 cubos o menos, llega a 500 cubos. ¡Difícil! Busca formas compactas.',
    live: (s) => s.n >= 500 },
];
const doneGoals = () => store.get('goals', {});

// ---------- Escena ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
const fogColor = new THREE.Color('#bcdcf5');
scene.background = fogColor;
scene.fog = new THREE.Fog(fogColor, 40, 200);
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 900);
camera.rotation.order = 'YXZ';
const hemi = new THREE.HemisphereLight('#ffffff', '#6a7f5a', 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff6e0', 1.4);
scene.add(sun);

const skyUniforms = { top: { value: new THREE.Color('#4f8fe0') }, horizon: { value: new THREE.Color('#bcdcf5') } };
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(700, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, h), 1.0); }',
  })
);
scene.add(sky);

// Estrellas para la noche.
const starPos = [];
for (let i = 0; i < 1600; i++) {
  const u = Math.random() * Math.PI * 2, v = Math.random() * 0.95 + 0.03;
  const r = 650, y = v * r, rr = Math.sqrt(r * r - y * y);
  starPos.push(Math.cos(u) * rr, y, Math.sin(u) * rr);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, fog: false }));
stars.visible = false;
scene.add(stars);

function pixelTexture(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Suelo infinito translúcido.
const floorTex = pixelTexture(16, (g, s) => {
  for (let x = 0; x < s; x++)
    for (let y = 0; y < s; y++) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? '#6fbf4a' : v < 0.85 ? '#5daa3c' : '#7fd35a';
      g.fillRect(x, y, 1, 1);
    }
  g.fillStyle = 'rgba(20,50,10,0.55)';
  g.fillRect(0, 0, s, 1);
  g.fillRect(0, 0, 1, s);
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
const FLOOR_SIZE = 1000;
floorTex.repeat.set(FLOOR_SIZE, FLOOR_SIZE);
floorTex.offset.set(0.5, 0.5);
const floorMat = new THREE.MeshLambertMaterial({ map: floorTex, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.renderOrder = -1;
scene.add(floor);

let zoneBox = null;
function buildZoneBox() {
  if (zoneBox) { scene.remove(zoneBox); zoneBox.geometry.dispose(); }
  const z = zone();
  zoneBox = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(z.half * 2 + 1, z.h, z.half * 2 + 1)),
    new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4 })
  );
  zoneBox.position.set(0, z.h / 2, 0);
  scene.add(zoneBox);
  scene.fog.far = Math.max(200, z.half * 4.5);
  scene.fog.near = scene.fog.far * 0.2;
}

// Nubes de bloques.
const CLOUD_N = 70;
const cloudMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 });
const clouds = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cloudMat, CLOUD_N);
const cloudData = Array.from({ length: CLOUD_N }, () => ({
  x: (Math.random() - 0.5) * 500, z: (Math.random() - 0.5) * 500, w: 8 + Math.floor(Math.random() * 20), d: 6 + Math.floor(Math.random() * 14),
}));
scene.add(clouds);
const tmpM = new THREE.Matrix4();
function updateClouds(dt) {
  const px = camera.position.x, pz = camera.position.z;
  cloudData.forEach((c, i) => {
    c.x += dt * 1.5;
    if (c.x - px > 250) c.x -= 500; else if (c.x - px < -250) c.x += 500;
    if (c.z - pz > 250) c.z -= 500; else if (c.z - pz < -250) c.z += 500;
    tmpM.makeScale(c.w, 2, c.d).setPosition(c.x, 90, c.z);
    clouds.setMatrixAt(i, tmpM);
  });
  clouds.instanceMatrix.needsUpdate = true;
}

// Cubos vivos: una malla instanciada con animación de nacer (crecen) y morir (encogen).
const cubeTex = pixelTexture(16, (g, s) => {
  for (let x = 0; x < s; x++)
    for (let y = 0; y < s; y++) {
      const v = 225 + Math.floor((Math.random() - 0.5) * 40);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 1, 1);
    }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 0, s, 1); g.fillRect(0, s - 1, s, 1); g.fillRect(0, 0, 1, s); g.fillRect(s - 1, 0, 1, s);
});
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
const anim = { uProg: { value: 1 }, uGlow: { value: 0 } };
const cubeMat = new THREE.MeshLambertMaterial({ map: cubeTex });
cubeMat.onBeforeCompile = (sh) => {
  sh.uniforms.uProg = anim.uProg;
  sh.uniforms.uGlow = anim.uGlow;
  sh.vertexShader = 'attribute float aAnim;\nuniform float uProg;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float bornF = mod(aAnim, 2.0);
    float dieF = step(1.5, aAnim);
    float sc = mix(1.0, 0.25 + 0.75 * smoothstep(0.0, 0.6, uProg), bornF);
    sc *= mix(1.0, 1.0 - 0.6 * smoothstep(0.55, 1.0, uProg), dieF);
    transformed *= sc;`);
  sh.fragmentShader = 'uniform float uGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
    '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uGlow;');
};
let cubes = null;
function buildCubes() {
  const z = zone();
  const cap = Math.min(MAX_INSTANCES, (z.half * 2 + 1) ** 2 * z.h);
  if (cubes && cubes.userData.cap === cap) return;
  if (cubes) { scene.remove(cubes); cubes.dispose(); }
  cubeGeo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
  cubeGeo.attributes.aAnim.setUsage(THREE.DynamicDrawUsage);
  cubes = new THREE.InstancedMesh(cubeGeo, cubeMat, cap);
  cubes.userData.cap = cap;
  cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cubes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  cubes.instanceColor.setUsage(THREE.DynamicDrawUsage);
  cubes.frustumCulled = false;
  cubes.count = 0;
  scene.add(cubes);
}

// Cubo fantasma que indica dónde se pondrá/quitará al dibujar (ordenador).
const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)),
  new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false }));
ghost.renderOrder = 10;
ghost.visible = false;
scene.add(ghost);

// Corte para ver el interior.
const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
let cutOn = false;
function setCut(v) {
  cutOn = v;
  cubeMat.clippingPlanes = v ? [cutPlane] : null;
  cubeMat.needsUpdate = true;
  setBtn('btn-cut', '✂️', v ? 'Corte sí' : 'Corte no', v);
}

// ---------- Ambientes ----------
const SKIES = {
  day: { icon: '☀️', label: 'Día', top: '#4f8fe0', horizon: '#bcdcf5', hemi: 0.9, hemiColor: '#ffffff', sun: 1.4, sunColor: '#fff6e0', sunPos: [40, 80, 25], glow: 0, stars: false, cloud: 0.85 },
  dusk: { icon: '🌇', label: 'Atardecer', top: '#2b2d6e', horizon: '#f39a5b', hemi: 0.95, hemiColor: '#ffe2c8', sun: 1.0, sunColor: '#ff9a50', sunPos: [90, 18, -40], glow: 0.12, stars: false, cloud: 0.6 },
  night: { icon: '🌙', label: 'Noche', top: '#03050f', horizon: '#14203f', hemi: 0.2, hemiColor: '#8fa6ff', sun: 0.3, sunColor: '#9fb4ff', sunPos: [-30, 60, 40], glow: 0.85, stars: true, cloud: 0.12 },
};
const SKY_ORDER = ['day', 'dusk', 'night'];
function applySky() {
  const s = SKIES[settings.sky] || SKIES.day;
  skyUniforms.top.value.set(s.top);
  skyUniforms.horizon.value.set(s.horizon);
  fogColor.set(s.horizon);
  scene.fog.color.set(s.horizon);
  hemi.intensity = s.hemi; hemi.color.set(s.hemiColor);
  sun.intensity = s.sun; sun.color.set(s.sunColor); sun.position.set(...s.sunPos);
  anim.uGlow.value = s.glow;
  stars.visible = s.stars;
  cloudMat.opacity = s.cloud;
  floorMat.opacity = settings.sky === 'night' ? 0.35 : 0.5;
  setBtn('btn-sky', s.icon, s.label);
  setSeg('sky-mode', settings.sky);
}

// ---------- Colores con significado ----------
const C = (h) => new THREE.Color(h);
const FATE = [C('#e2483a'), C('#46c93a')];
const AGES = [C('#ffe14d'), C('#8fd94a'), C('#2fa88f'), C('#3560c0')];
const ageIdx = (a) => (a <= 1 ? 0 : a <= 4 ? 1 : a <= 15 ? 2 : 3);
const tmpC = new THREE.Color();
const css = (c) => '#' + c.getHexString();
const LEGENDS = {
  fate: () => `<span class="sw" style="background:${css(FATE[1])}"></span>seguirá viva <span class="sw" style="background:${css(FATE[0])}"></span>morirá en el próximo paso`,
  age: () => `Edad: <span class="sw" style="background:${css(AGES[0])}"></span>recién nacida <span class="sw" style="background:${css(AGES[1])}"></span>2-4 <span class="sw" style="background:${css(AGES[2])}"></span>5-15 <span class="sw" style="background:${css(AGES[3])}"></span>16+`,
  nbr: () => `Vecinas vivas: 0 <span class="grad" style="background:linear-gradient(90deg,hsl(225,75%,55%),hsl(120,70%,50%),hsl(55,90%,55%),hsl(0,80%,55%))"></span> 14+`,
  height: () => `Altura: suelo <span class="grad" style="background:linear-gradient(90deg,hsl(0,75%,55%),hsl(60,80%,55%),hsl(140,70%,50%),hsl(220,75%,60%),hsl(285,65%,60%))"></span> techo`,
};
const MENU_LEGENDS = {
  fate: 'Verde: la célula sobrevivirá a la siguiente generación. Rojo: va a morir. Así ves venir los cambios.',
  age: 'Cuántas generaciones lleva viva cada célula: amarillo las recién nacidas, azul las veteranas.',
  nbr: 'Cuántas vecinas vivas tiene cada célula: azul pocas, rojo muchas (agobio).',
  height: 'Color según la altura, como un mapa de relieve: rojo junto al suelo, violeta arriba.',
};
function colorFor(i, s) {
  switch (settings.color) {
    case 'age': return AGES[ageIdx(s.ages[i])];
    case 'nbr': return tmpC.setHSL((1 - Math.min(s.nbr[i], 14) / 14) * 0.62, 0.75, 0.52);
    case 'height': return tmpC.setHSL(Math.min(s.coords[i * 3 + 1] / (zone().h - 1), 1) * 0.8, 0.72, 0.56);
    default: return FATE[s.fate[i]];
  }
}

// ---------- Simulación en segundo plano ----------
const worker = new Worker(new URL('./worker.js?v=5', import.meta.url), { type: 'module' });
let snap = null;
let waiting = false;
let snapTime = 0;
let aliveKeys = null;
const mass = { center: new THREE.Vector3(0, 8, 0), radius: 10 };

function send(msg) {
  waiting = true;
  worker.postMessage(Object.assign({ rule: active.rule, bounds: bounds(), wantNeighbors: settings.color === 'nbr' }, msg));
}

worker.onmessage = (e) => {
  const m = e.data;
  if (m.reason === 'discover') { onDiscover(m.rule); return; }
  waiting = false;
  if (m.reason === 'noback') { toast('No hay más generaciones guardadas para rebobinar'); return; }
  snap = m;
  snapTime = performance.now();
  aliveKeys = null;
  drawSnapshot();
  if (m.reason === 'set') { game.history = [{ hash: m.hash, gen: 0 }]; game.pop = [m.n]; }
  if (m.reason === 'back') { game.history = [{ hash: m.hash, gen: m.gen }]; game.ended = false; game.pop.pop(); }
  if (m.reason === 'step') { game.pop.push(m.n); if (game.pop.length > 240) game.pop.shift(); beep(m.n); checkEnd(); }
  drawChart();
  if (pendingBack > 0) { pendingBack--; goBack(); }
};

function drawSnapshot() {
  if (!snap) return;
  const arr = cubes.instanceMatrix.array, col = cubes.instanceColor.array, an = cubeGeo.attributes.aAnim.array;
  const n = Math.min(snap.n, cubes.userData.cap);
  let sx = 0, sy = 0, sz = 0, maxY = 0, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < n; i++) {
    const o = i * 16, x = snap.coords[i * 3], y = snap.coords[i * 3 + 1], z = snap.coords[i * 3 + 2];
    arr[o] = 1; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
    arr[o + 4] = 0; arr[o + 5] = 1; arr[o + 6] = 0; arr[o + 7] = 0;
    arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = 1; arr[o + 11] = 0;
    arr[o + 12] = x; arr[o + 13] = y + 0.5; arr[o + 14] = z; arr[o + 15] = 1;
    const c = colorFor(i, snap);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    an[i] = (snap.ages[i] <= 1 ? 1 : 0) + (snap.fate[i] ? 0 : 2);
    sx += x; sy += y; sz += z;
    if (y > maxY) maxY = y;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  if (n) {
    mass.center.set(sx / n, sy / n + 0.5, sz / n);
    mass.radius = Math.max(4, (maxX - minX) / 2, (maxZ - minZ) / 2, maxY / 2);
  }
  game.maxY = Math.max(game.maxY || 0, maxY);
  cubes.count = n;
  cubes.instanceMatrix.needsUpdate = true;
  cubes.instanceColor.needsUpdate = true;
  cubeGeo.attributes.aAnim.needsUpdate = true;
  if (game.active) {
    game.maxN = Math.max(game.maxN, snap.n);
    $('gen').textContent = `Generación ${snap.gen}`;
    $('count').textContent = `${snap.n.toLocaleString('es-ES')} cubos`;
    $('best').textContent = `máx ${game.maxN.toLocaleString('es-ES')}`;
  }
}

function getAliveKeys() {
  if (!aliveKeys) {
    aliveKeys = new Set();
    if (snap) for (let i = 0; i < snap.n; i++) aliveKeys.add(key(snap.coords[i * 3], snap.coords[i * 3 + 1], snap.coords[i * 3 + 2]));
  }
  return aliveKeys;
}

// Gráfica de población.
const chart = $('chart'), cctx = chart.getContext('2d');
function drawChart() {
  const p = game.pop || [];
  cctx.clearRect(0, 0, chart.width, chart.height);
  if (p.length < 2) return;
  const max = Math.max(...p, 1);
  cctx.strokeStyle = '#7fe05a';
  cctx.lineWidth = 2;
  cctx.beginPath();
  p.forEach((v, i) => {
    const x = (i / (p.length - 1)) * (chart.width - 4) + 2, y = chart.height - 3 - (v / max) * (chart.height - 8);
    i ? cctx.lineTo(x, y) : cctx.moveTo(x, y);
  });
  cctx.stroke();
}

// Sonido opcional: un tono por generación, más agudo cuantos más cubos hay.
let audio = null, soundOn = false;
const SCALE = [0, 2, 4, 7, 9];
function beep(n) {
  if (!soundOn || !audio || !game.active) return;
  if (game.speedIdx === 3 && snap.gen % 3) return;
  const i = Math.floor(Math.log2(n + 1) * 1.6);
  const f = 130.8 * Math.pow(2, Math.floor(i / 5) + SCALE[i % 5] / 12);
  const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
  o.type = 'triangle';
  o.frequency.value = Math.min(f, 2000);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(n ? 0.06 : 0.02, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  o.connect(g).connect(audio.destination);
  o.start(t);
  o.stop(t + 0.3);
}
function toggleSound() {
  soundOn = !soundOn;
  if (soundOn && !audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { soundOn = false; } }
  if (audio && audio.state === 'suspended') audio.resume();
  setBtn('btn-sound', soundOn ? '🔊' : '🔇', 'Sonido', soundOn);
}

// ---------- Estado de la partida ----------
const game = {
  active: false, phase: 'menu', paused: false, speedIdx: 0, timer: 0,
  initial: [], maxN: 0, maxY: 0, history: [], pop: [], ended: false, tool: 'add',
  brush: 1, mirror: false, stamp: null, undo: [], goal: null, cam: 'fly',
};

function seedCells(mode) {
  const z = zone();
  if (mode === 'draw') return [];
  if (mode === 'one') return [key(0, 10, 0)];
  if (mode === 'sym') {
    // Una semilla al azar en una esquina, repetida en espejo en las cuatro.
    const h = Math.ceil(z.seed / 2), cy = h + 2, out = new Set();
    const r = Math.random;
    for (let x = 0; x < h; x++) for (let y = -h; y < h; y++) for (let zz = 0; zz < h; zz++)
      if (r() < 0.3) for (const [a, c] of [[x, zz], [-x - 1, zz], [x, -zz - 1], [-x - 1, -zz - 1]]) out.add(key(a, cy + y, c));
    return [...out];
  }
  if (mode === 'glider') return PATTERNS.planeador.cells.map(([x, y, zz]) => key(x - 1, y + 1, zz - 1));
  return [...randomSoup({ cx: 0, cy: Math.ceil(z.seed / 2) + 2, cz: 0, size: z.seed, density: 0.3 })];
}

function setWorld(cells) {
  game.history = [];
  game.ended = false;
  game.maxN = cells.length;
  game.maxY = 0;
  game.timer = 0;
  game.undo = [];
  send({ type: 'set', cells, gen: 0 });
}

function startGame(goal = null) {
  game.goal = goal;
  if (goal) active = { rule: plainRule(PRESETS[goal.preset].rule), zone: goal.zone, preset: goal.preset };
  else active = { rule: settings.rule, zone: settings.zone, preset: settings.preset };
  buildCubes();
  buildZoneBox();
  game.active = true;
  game.speedIdx = 0;
  setBtn('btn-speed', '⏩', SPEEDS[0].label);
  const start = goal ? 'draw' : settings.start;
  game.initial = seedCells(start);
  setWorld(game.initial);
  const z = zone();
  setCam('fly', true);
  if (start === 'draw') placeCamera(0, 6, 14, -0.4);
  else if (start === 'one' || start === 'glider') placeCamera(0, 8, 16, -0.2);
  else placeCamera(0, z.seed / 2 + 4, z.seed + 22, -0.12);
  $('goal').classList.toggle('hidden', !goal);
  if (goal) $('goal').textContent = `🎯 ${goal.name}: ${goal.text}`;
  showGame();
  if (start === 'draw') enterEdit(true);
  else {
    setPaused(false);
    setPhase('play');
    hintOnce('move', isTouch ? 'Mueve el joystick para andar y arrastra el dedo para mirar' : 'Haz clic en la escena para mirar con el ratón · WASD para andar');
  }
}

function restart() {
  closeResult();
  setWorld(game.initial);
  if (game.phase === 'edit') return;
  setPaused(false);
  toast('Vuelta al inicio (generación 0)');
}

function setPhase(p) {
  game.phase = p;
  $('playbar').classList.toggle('hidden', p !== 'play');
  $('editbar').classList.toggle('hidden', p !== 'edit');
  $('hud').classList.toggle('editing', p === 'edit');
  ghost.visible = false;
}

function setBtn(id, icon, label, on) {
  const b = $(id);
  if (!b) return;
  b.querySelector('i').textContent = icon;
  b.querySelector('span').textContent = label;
  if (on !== undefined) b.classList.toggle('active', !!on);
}
function setPaused(v) {
  game.paused = v;
  setBtn('btn-pause', v ? '▶' : '⏸', v ? 'Seguir' : 'Pausa');
}
function cycleSpeed() {
  game.speedIdx = (game.speedIdx + 1) % SPEEDS.length;
  setBtn('btn-speed', '⏩', SPEEDS[game.speedIdx].label);
}
let pendingBack = 0;
function goBack() {
  setPaused(true);
  if (waiting) { pendingBack++; return; }
  waiting = true;
  worker.postMessage({ type: 'back' });
}
function throwSeed() {
  if (game.goal) { toast('En los retos no vale lanzar semillas 😉'); return; }
  const hit = aim();
  let base = hit && hit.place;
  if (!base) {
    lookDir(camF);
    const p = camera.position.clone().addScaledVector(camF, 15);
    base = [Math.round(p.x), Math.max(0, Math.floor(p.y)), Math.round(p.z)];
  }
  const cells = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = 0; dy <= 4; dy++) for (let dz = -2; dz <= 2; dz++)
    if (Math.random() < 0.38) cells.push([base[0] + dx, base[1] + dy, base[2] + dz]);
  if (applyEdit(cells, [])) { game.history = []; toast('💣 ¡Semilla lanzada!', 1500); }
  else toast('Apunta dentro del recinto para lanzar la semilla');
}
function onDiscover(rule) {
  $('btn-discover').textContent = '🎰 Descubrir otra regla al azar';
  $('btn-discover').disabled = false;
  if (!rule) { toast('Esta vez no he encontrado ninguna interesante. Prueba otra vez.'); return; }
  settings.rule = { type: 'total', survive: rule.survive, born: rule.born, bNeed: 1, sNeed: 3 };
  settings.preset = 'custom';
  saveSettings();
  renderRules();
  $('rule-desc').innerHTML = `<b>🎰 ¡Regla descubierta!</b> Probada en un recinto pequeño: ni se apaga ni lo llena todo. Sigue viva con <b>${listText(rule.survive)}</b> y nace con <b>${listText(rule.born)}</b> vecinas vivas. Pulsa «Empezar partida» para verla.`;
}
function stepOnce() {
  setPaused(true);
  if (!waiting) send({ type: 'step' });
}

// Fin de partida: todo muerto, quieto o repitiendo un ciclo. Y comprobación de retos.
function checkEnd() {
  if (!game.active || game.ended || game.phase !== 'play') return;
  const g = game.goal;
  if (g && g.live && g.live(snap, game)) return goalDone(g);
  let kind = null, from = snap.gen, period = 0;
  if (snap.n === 0) kind = 'extinct';
  else {
    const prev = game.history.find((h) => h.hash === snap.hash);
    if (prev) { kind = 'cycle'; from = prev.gen; period = snap.gen - prev.gen; }
    game.history.push({ hash: snap.hash, gen: snap.gen });
    if (game.history.length > 30) game.history.shift();
  }
  if (!kind) return;
  if (g && g.end && g.end({ kind, period, n: snap.n })) return goalDone(g);
  showResult(kind, from, period);
}

function openResult() {
  game.ended = true;
  setPaused(true);
  releasePointer();
  $('result').classList.remove('hidden');
}

function showResult(kind, from, period) {
  const sig = ruleSignature(active.rule);
  const records = store.get('records', {});
  const old = records[sig] || 0;
  let title, text;
  if (kind === 'extinct') { title = '💀 Se ha extinguido'; text = `Todas las células murieron en la generación ${from}.`; }
  else if (period === 1) { title = '🧊 Se ha quedado quieta'; text = `Desde la generación ${from} ya no cambia nada: ${snap.n.toLocaleString('es-ES')} cubos inmóviles.`; }
  else { title = '🔁 Se repite en bucle'; text = `Desde la generación ${from} repite un ciclo de ${period} pasos.`; }
  text += ` Población máxima: ${game.maxN.toLocaleString('es-ES')} cubos.`;
  let rec;
  if (from > old) { records[sig] = from; store.set('records', records); rec = old ? `🏆 ¡Nuevo récord con estas reglas! ${from} generaciones (antes ${old}).` : `🏆 Récord con estas reglas: ${from} generaciones. ¿Puedes superarlo?`; }
  else rec = `Récord con estas reglas: ${old} generaciones. Tú: ${from}.`;
  if (game.goal) rec = `🎯 Reto no superado todavía. ${game.goal.text}`;
  $('res-title').textContent = title;
  $('res-text').textContent = text;
  $('res-record').textContent = rec;
  $('res-next').classList.add('hidden');
  openResult();
}

function goalDone(g) {
  const done = doneGoals();
  const first = !done[g.id];
  done[g.id] = true;
  store.set('goals', done);
  $('res-title').textContent = '⭐ ¡Reto superado!';
  $('res-text').textContent = `«${g.name}» conseguido en la generación ${snap.gen}, empezando con ${game.initial.length} cubos.`;
  const total = Object.keys(done).length;
  $('res-record').textContent = first ? `Llevas ${total} de ${GOALS.length} estrellas.` : `Ya lo tenías. Estrellas: ${total} de ${GOALS.length}.`;
  const next = GOALS[GOALS.indexOf(g) + 1];
  $('res-next').classList.toggle('hidden', !next);
  $('res-next').onclick = () => { closeResult(); startGame(next); };
  renderGoals();
  openResult();
}
function closeResult() { $('result').classList.add('hidden'); }

// ---------- Modo dibujo ----------
function enterEdit(fresh) {
  closeResult();
  // En un reto, dibujar siempre vuelve al inicio (para que el resultado cuente).
  if (game.goal && snap && snap.gen > 0) setWorld(game.initial);
  setPaused(true);
  setPhase('edit');
  setTool('add');
  releasePointer();
  if (fresh) toast(isTouch ? 'Toca el suelo o un cubo para poner un cubo encima. Cuando acabes, pulsa «¡Listo!»' : 'Clic izquierdo pone un cubo donde apunta el cursor, clic derecho lo quita. Arrastra para mirar. Pulsa «¡Listo!» (o Intro) al acabar', 6000);
  else if (snap && snap.gen > 0) toast(`Dibujando sobre la generación ${snap.gen}`);
}
function exitEdit() {
  const n = snap ? snap.n : 0;
  if (game.goal && n > game.goal.max) { toast(`Este reto permite como máximo ${game.goal.max} cubos al empezar (tienes ${n}). Quita algunos.`, 4500); return; }
  if (game.goal && n === 0) { toast('Dibuja algo primero'); return; }
  if (snap && snap.gen === 0) game.initial = [...getAliveKeys()];
  game.history = snap ? [{ hash: snap.hash, gen: snap.gen }] : [];
  game.ended = false;
  game.stamp = null;
  setPhase('play');
  setPaused(false);
  if (n === 0) toast('No hay cubos: pulsa ✏️ Dibujar para poner algunos');
}
function setTool(t) {
  game.tool = t;
  game.stamp = null;
  const b = $('btn-tool');
  b.className = t === 'add' ? 'tool-add' : 'tool-del';
  setBtn('btn-tool', t === 'add' ? '➕' : '➖', t === 'add' ? 'Poner' : 'Quitar');
}
const BRUSHES = [{ n: 1, icon: '▪', label: 'Pincel 1' }, { n: 3, icon: '◼', label: 'Pincel 9' }, { n: 27, icon: '🧱', label: 'Pincel 27' }];
function cycleBrush() {
  const i = (BRUSHES.findIndex((b) => b.n === game.brush) + 1) % BRUSHES.length;
  game.brush = BRUSHES[i].n;
  setBtn('btn-brush', BRUSHES[i].icon, BRUSHES[i].label, i > 0);
}
function toggleMirror() {
  game.mirror = !game.mirror;
  setBtn('btn-mirror', '🪞', game.mirror ? 'Espejo sí' : 'Espejo no', game.mirror);
  if (game.mirror) toast('Espejo: lo que dibujes se repetirá en las 4 esquinas, alrededor del centro del recinto');
}

// Recorre la cuadrícula de bloques a lo largo de un rayo (como en los juegos de bloques).
function voxelRay(origin, dir, maxDist = 90) {
  const alive = getAliveKeys();
  const px = origin.x + 0.5, py = origin.y, pz = origin.z + 0.5;
  let x = Math.floor(px), y = Math.floor(py), z = Math.floor(pz);
  const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
  const tdx = sx ? Math.abs(1 / dir.x) : Infinity, tdy = sy ? Math.abs(1 / dir.y) : Infinity, tdz = sz ? Math.abs(1 / dir.z) : Infinity;
  let tmx = sx > 0 ? (x + 1 - px) * tdx : sx < 0 ? (px - x) * tdx : Infinity;
  let tmy = sy > 0 ? (y + 1 - py) * tdy : sy < 0 ? (py - y) * tdy : Infinity;
  let tmz = sz > 0 ? (z + 1 - pz) * tdz : sz < 0 ? (pz - z) * tdz : Infinity;
  let prev = null, t = 0;
  for (let i = 0; i < 600 && t <= maxDist; i++) {
    if (y < 0) return prev ? { cell: null, place: prev } : null;
    if (prev && alive.has(key(x, y, z))) return { cell: [x, y, z], place: prev };
    prev = [x, y, z];
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; }
    else { z += sz; t = tmz; tmz += tdz; }
  }
  return null;
}
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function aim(clientX, clientY) {
  if (clientX === undefined) ndc.set(0, 0);
  else ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return voxelRay(camera.position, raycaster.ray.direction);
}
function inZone([x, y, z]) {
  const b = bounds();
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ;
}
function footprint(base, del) {
  const out = [];
  if (game.stamp) {
    const cells = PATTERNS[game.stamp].cells;
    const cx = Math.floor(Math.max(...cells.map((c) => c[0])) / 2), cz = Math.floor(Math.max(...cells.map((c) => c[2])) / 2);
    for (const [x, y, z] of cells) out.push([base[0] + x - cx, base[1] + y, base[2] + z - cz]);
    return out;
  }
  if (game.brush === 1) return [base];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    if (game.brush === 3) out.push([base[0] + dx, base[1], base[2] + dz]);
    else for (let dy = del ? -1 : 0; dy <= (del ? 1 : 2); dy++) out.push([base[0] + dx, base[1] + dy, base[2] + dz]);
  }
  return out;
}
function withMirror(cells) {
  if (!game.mirror) return cells;
  const seen = new Set(), out = [];
  for (const [x, y, z] of cells)
    for (const [a, b] of [[x, z], [-x, z], [x, -z], [-x, -z]]) {
      const k = `${a},${y},${b}`;
      if (!seen.has(k)) { seen.add(k); out.push([a, y, b]); }
    }
  return out;
}
function applyEdit(add, remove) {
  const alive = getAliveKeys();
  add = add.filter((c) => inZone(c) && !alive.has(key(...c)));
  remove = remove.filter((c) => alive.has(key(...c)));
  if (!add.length && !remove.length) return false;
  for (const c of add) alive.add(key(...c));
  for (const c of remove) alive.delete(key(...c));
  worker.postMessage({ type: 'edit', add, remove });
  waiting = true;
  return { add, remove };
}
function editAt(clientX, clientY, tool) {
  const hit = aim(clientX, clientY);
  if (!hit) return;
  const del = tool === 'del' && !game.stamp;
  const base = del ? hit.cell : hit.place;
  if (!base) return;
  if (!del && !inZone(base)) { toast('Fuera del recinto: dibuja dentro de las líneas blancas'); return; }
  const cells = withMirror(footprint(base, del));
  const done = del ? applyEdit([], cells) : applyEdit(cells, []);
  if (done) {
    game.undo.push(done);
    if (game.undo.length > 60) game.undo.shift();
  }
  if (game.stamp) { toast(`${PATTERNS[game.stamp].name} colocado`); game.stamp = null; }
}
function undo() {
  const u = game.undo.pop();
  if (!u) { toast('Nada que deshacer'); return; }
  applyEdit(u.remove, u.add);
}
function updateGhost() {
  ghost.visible = false;
  if (game.phase !== 'edit' || isTouch || !playing()) return;
  const locked = document.pointerLockElement === canvas;
  if (!locked && lastMouse.x === undefined) return;
  const hit = locked ? aim() : aim(lastMouse.x, lastMouse.y);
  if (!hit) return;
  const del = game.tool === 'del' && !game.stamp;
  const c = del ? hit.cell : hit.place;
  if (!c) return;
  ghost.position.set(c[0], c[1] + 0.5, c[2]);
  ghost.material.color.set(del ? '#ff5544' : inZone(c) ? (game.stamp ? '#ffd84a' : '#ffffff') : '#888888');
  ghost.visible = true;
}

// ---------- Movimiento: volar, andar o cine ----------
let yaw = 0, pitch = 0;
const keys = new Set();
const joy = { x: 0, y: 0 };
let flyUp = false, flyDown = false;
const vel = new THREE.Vector3();
let vy = 0, grounded = false, orbitR = 30;
function placeCamera(x, y, z, p) { camera.position.set(x, y, z); yaw = 0; pitch = p; vel.set(0, 0, 0); }
function applyLook(dx, dy, sens) {
  yaw -= dx * sens;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - dy * sens));
}
const CAMS = { fly: { icon: '🕊️', label: 'Volar' }, walk: { icon: '🚶', label: 'Andar' }, orbit: { icon: '🎬', label: 'Cine' } };
function setCam(m, quiet) {
  game.cam = m;
  setBtn('btn-cam', CAMS[m].icon, CAMS[m].label, m !== 'fly');
  $('up-label').textContent = m === 'walk' ? 'saltar' : m === 'orbit' ? 'subir' : 'subir';
  vy = 0;
  if (m === 'orbit') { orbitR = mass.radius * 2.2 + 14; pitch = Math.min(pitch, -0.3); }
  if (quiet) return;
  if (m === 'walk') toast('Andar: hay gravedad y puedes subirte a los cubos. ▲ / Espacio salta. Si nace un cubo bajo tus pies, te levanta.', 5000);
  if (m === 'orbit') toast('Cine: la cámara gira sola alrededor de la masa. Arrastra para girarla y usa el joystick (o W/S) para acercarte.', 5000);
  if (m === 'fly') toast('Volar: muévete libremente en el aire');
}
function cycleCam() { setCam({ fly: 'walk', walk: 'orbit', orbit: 'fly' }[game.cam]); }
const camF = new THREE.Vector3();
function lookDir(target) {
  target.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  return target;
}
function goCenter() {
  if (game.cam === 'walk') setCam('fly', true);
  pitch = -0.35;
  const r = mass.radius * 1.8 + 10;
  camera.position.copy(mass.center).addScaledVector(lookDir(camF), -r);
  camera.position.y = Math.max(1.5, camera.position.y);
  vel.set(0, 0, 0);
}

const EYE = 1.6;
function solid(x, y, z) {
  if (y < 0) return true;
  return getAliveKeys().has(key(Math.round(x), Math.floor(y), Math.round(z)));
}
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), want = new THREE.Vector3();
function move(dt) {
  let f = 0, s = 0, u = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  if (keys.has('Space') || flyUp) u += 1;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight') || flyDown) u -= 1;
  f += -joy.y; s += joy.x;
  const sprint = keys.has('ControlLeft') || keys.has('ControlRight') || Math.hypot(joy.x, joy.y) > 0.97;
  fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  right.set(Math.cos(yaw), 0, -Math.sin(yaw));

  if (game.cam === 'orbit') {
    yaw += dt * 0.18;
    orbitR = Math.max(6, Math.min(250, orbitR - f * dt * 30));
    pitch = Math.max(-1.35, Math.min(-0.02, pitch + u * dt));
    camF.copy(mass.center);
    orbitTarget.lerp(camF, 1 - Math.exp(-dt * 2));
    camera.position.copy(orbitTarget).addScaledVector(lookDir(camF), -orbitR);
    camera.position.y = Math.max(1.2, camera.position.y);
    return;
  }

  const speed = (game.cam === 'walk' ? 5.5 : 12) * (sprint ? 2.2 : 1);
  want.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, s);
  if (want.lengthSq() > 1) want.normalize();
  want.multiplyScalar(speed);
  if (game.cam === 'fly') want.y = u * speed;
  vel.lerp(want, 1 - Math.exp(-dt * 10));

  if (game.cam === 'fly') {
    camera.position.addScaledVector(vel, dt);
    camera.position.y = Math.max(1.2, Math.min(250, camera.position.y));
    return;
  }

  // Andar: gravedad y choques simples con los cubos.
  const p = camera.position;
  let feet = p.y - EYE;
  let guard = 0;
  while (solid(p.x, feet + 0.05, p.z) && guard++ < 80) { feet = Math.floor(feet + 0.05) + 1; vy = Math.max(vy, 0); }
  const tryAxis = (nx, nz) => {
    const blockedLow = solid(nx, feet + 0.1, nz), blockedHigh = solid(nx, feet + 1.1, nz);
    if (!blockedLow && !blockedHigh) { p.x = nx; p.z = nz; return; }
    if (blockedLow && !blockedHigh && !solid(nx, feet + 2.1, nz) && grounded) { feet = Math.floor(feet + 0.1) + 1; p.x = nx; p.z = nz; }
  };
  tryAxis(p.x + vel.x * dt, p.z);
  tryAxis(p.x, p.z + vel.z * dt);
  vy -= 28 * dt;
  if ((keys.has('Space') || flyUp) && grounded) vy = 9.5;
  let nf = feet + vy * dt;
  grounded = false;
  if (vy <= 0 && solid(p.x, nf, p.z)) { nf = Math.floor(nf) + 1; vy = 0; grounded = true; }
  else if (vy > 0 && solid(p.x, nf + 1.75, p.z)) { vy = 0; nf = feet; }
  p.y = Math.max(EYE, nf + EYE);
}
const orbitTarget = new THREE.Vector3(0, 8, 0);

const playing = () => game.active && $('menu').classList.contains('hidden') && $('result').classList.contains('hidden') && $('shapes').classList.contains('hidden');
const releasePointer = () => { if (document.pointerLockElement) document.exitPointerLock(); };
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) hintOnce('esc', 'Ratón capturado para mirar. Pulsa Esc para soltarlo y usar los botones; clic en la escena para volver.');
});
const lockPointer = () => {
  if (isTouch || !canvas.requestPointerLock || document.pointerLockElement === canvas) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
};

// Teclado
window.addEventListener('keydown', (e) => {
  if (!playing()) return;
  keys.add(e.code);
  const c = e.code;
  if (c === 'KeyE') game.phase === 'edit' ? exitEdit() : enterEdit(false);
  else if (c === 'Enter' && game.phase === 'edit') exitEdit();
  else if (c === 'KeyZ' && game.phase === 'edit') undo();
  else if (c === 'KeyM') openMenu();
  else if (c === 'KeyR') restart();
  else if (c === 'KeyG') cycleCam();
  else if (c === 'KeyT') goCenter();
  else if (c === 'KeyC') setCut(!cutOn);
  else if (c === 'KeyB') cycleSky();
  else if (c === 'KeyF') photo();
  else if (c === 'Backspace' && game.phase === 'play') goBack();
  else if (c === 'KeyX' && game.phase === 'play') throwSeed();
  else if (game.phase === 'play') {
    if (c === 'KeyP') setPaused(!game.paused);
    else if (c === 'KeyN') stepOnce();
    else if (c === 'KeyV') cycleSpeed();
  }
  if (c === 'Space' || c.startsWith('Arrow') || c === 'KeyF' || c === 'Backspace') e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); flyUp = flyDown = false; });

// Ratón: fuera del modo dibujo, clic = capturar el ratón para mirar.
// En modo dibujo con el cursor libre: clic corto pone/quita donde apunta el cursor, arrastrar mira.
let mouseDrag = null;
const lastMouse = { x: undefined, y: undefined };
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (!playing()) return;
  if (e.pointerType === 'mouse') {
    if (document.pointerLockElement === canvas) {
      if (game.phase === 'edit') editAt(undefined, undefined, e.button === 2 ? 'del' : game.tool);
    } else {
      if (game.phase !== 'edit') lockPointer();
      mouseDrag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, button: e.button };
    }
  } else {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
  }
});
window.addEventListener('mousemove', (e) => {
  lastMouse.x = e.clientX; lastMouse.y = e.clientY;
  if (!playing()) return;
  if (document.pointerLockElement === canvas) {
    if (Math.abs(e.movementX) < 150 && Math.abs(e.movementY) < 150) applyLook(e.movementX, e.movementY, 0.0024);
  } else if (mouseDrag && e.buttons) {
    applyLook(e.clientX - mouseDrag.x, e.clientY - mouseDrag.y, 0.005);
    mouseDrag.x = e.clientX; mouseDrag.y = e.clientY;
  }
});
window.addEventListener('mouseup', (e) => {
  const d = mouseDrag;
  mouseDrag = null;
  if (!d || !playing() || game.phase !== 'edit' || document.pointerLockElement === canvas) return;
  if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) editAt(e.clientX, e.clientY, d.button === 2 ? 'del' : game.tool);
});

// Táctil
const touches = new Map();
canvas.addEventListener('pointermove', (e) => {
  const t = touches.get(e.pointerId);
  if (!t) return;
  applyLook(e.clientX - t.x, e.clientY - t.y, Math.PI / Math.max(window.innerWidth, 1));
  t.x = e.clientX; t.y = e.clientY;
});
const endTouch = (e) => {
  const t = touches.get(e.pointerId);
  if (!t) return;
  touches.delete(e.pointerId);
  const moved = Math.hypot(e.clientX - t.x0, e.clientY - t.y0);
  if (e.type === 'pointerup' && game.phase === 'edit' && playing() && moved < 14 && performance.now() - t.t0 < 450) {
    editAt(e.clientX, e.clientY, game.tool);
  }
};
canvas.addEventListener('pointerup', endTouch);
canvas.addEventListener('pointercancel', endTouch);

// Joystick virtual
const joyEl = $('joystick'), stickEl = $('stick');
let joyId = null;
function joyUpdate(e) {
  const r = joyEl.getBoundingClientRect();
  const rad = r.width / 2;
  let dx = (e.clientX - (r.left + rad)) / rad, dy = (e.clientY - (r.top + rad)) / rad;
  const len = Math.hypot(dx, dy);
  if (len > 1) { dx /= len; dy /= len; }
  joy.x = dx; joy.y = dy;
  stickEl.style.transform = `translate(calc(-50% + ${dx * rad * 0.6}px), calc(-50% + ${dy * rad * 0.6}px))`;
}
joyEl.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joyEl.setPointerCapture(e.pointerId); joyUpdate(e); });
joyEl.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) joyUpdate(e); });
const joyEnd = (e) => {
  if (e.pointerId !== joyId) return;
  joyId = null; joy.x = joy.y = 0;
  stickEl.style.transform = 'translate(-50%, -50%)';
};
joyEl.addEventListener('pointerup', joyEnd);
joyEl.addEventListener('pointercancel', joyEnd);

function holdButton(el, set) {
  const on = (e) => { e.preventDefault(); set(true); el.classList.add('on'); };
  const off = () => { set(false); el.classList.remove('on'); };
  el.addEventListener('pointerdown', on);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => el.addEventListener(ev, off));
}
holdButton($('btn-up'), (v) => (flyUp = v));
holdButton($('btn-down'), (v) => (flyDown = v));

// ---------- Foto ----------
function photo() {
  renderer.render(scene, camera);
  canvas.toBlob((b) => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `juego-de-la-vida-3d-gen-${snap ? snap.gen : 0}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('📷 Foto guardada en tus descargas');
  });
}
function cycleSky() {
  settings.sky = SKY_ORDER[(SKY_ORDER.indexOf(settings.sky) + 1) % SKY_ORDER.length];
  saveSettings();
  applySky();
}

// ---------- Avisos ----------
let toastTimer = 0;
function toast(msg, ms = 3500) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}
function hintOnce(id, msg) {
  const seen = store.get('hints', {});
  if (seen[id]) return;
  seen[id] = true;
  store.set('hints', seen);
  toast(msg, 5500);
}

// ---------- Menú ----------
function showGame() {
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('crosshair').classList.remove('hidden');
  $('touch').classList.toggle('hidden', !isTouch);
  $('legend').innerHTML = LEGENDS[settings.color]();
  lockPointer();
}
function openMenu() {
  releasePointer();
  closeResult();
  if (game.phase === 'play') setPaused(true);
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('touch').classList.add('hidden');
  $('crosshair').classList.add('hidden');
  $('resume').classList.toggle('hidden', !game.active);
  $('play').textContent = game.active ? '▶ Empezar partida nueva' : '▶ Empezar partida';
  renderGoals();
  $('menu').scrollTop = 0;
}

const range = (a) => {
  const out = [];
  for (let i = 0; i < a.length; i++) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    out.push(j > i + 1 ? `${a[i]}-${a[j]}` : j === i + 1 ? `${a[i]},${a[j]}` : `${a[i]}`);
    i = j;
  }
  return out.join(',') || '—';
};
const ruleLabel = (r) => (r.type === 'planes' ? `3 planos · ${range(r.survive)}/${range(r.born)}` : `${range(r.survive)} / ${range(r.born)}`);
const listText = (a) => (a.length === 0 ? 'nunca' : a.length === 1 ? String(a[0]) : a.slice(0, -1).join(', ') + ' o ' + a[a.length - 1]);

function renderPresets() {
  const box = $('presets');
  box.innerHTML = '';
  const entries = [...Object.entries(PRESETS), ['custom', { name: 'Personalizada', rule: null }]];
  for (const [k, p] of entries) {
    const b = document.createElement('button');
    b.className = settings.preset === k ? 'on' : '';
    b.innerHTML = `${p.name}<small>${p.rule ? ruleLabel(p.rule) : 'a tu gusto'}</small>`;
    b.onclick = () => {
      settings.preset = k;
      if (p.rule) settings.rule = plainRule(p.rule);
      saveSettings();
      renderRules();
    };
    box.appendChild(b);
  }
}
function renderChips(id, list, max) {
  const box = $(id);
  box.innerHTML = '';
  for (let n = 0; n <= max; n++) {
    const b = document.createElement('button');
    b.textContent = n;
    b.className = list.includes(n) ? 'on' : '';
    b.onclick = () => {
      const i = list.indexOf(n);
      if (i >= 0) list.splice(i, 1); else { list.push(n); list.sort((a, c) => a - c); }
      settings.preset = 'custom';
      saveSettings();
      renderRules();
    };
    box.appendChild(b);
  }
}
function renderRules() {
  const r = settings.rule;
  renderPresets();
  renderSummary();
  const planes = r.type === 'planes';
  setSeg('rule-type', r.type);
  renderChips('chips-s', r.survive, planes ? 8 : 26);
  renderChips('chips-b', r.born, planes ? 8 : 26);
  $('plane-opts').classList.toggle('hidden', !planes);
  $('b-need').value = String(r.bNeed || 1);
  $('s-need').value = String(r.sNeed || 3);
  const p = PRESETS[settings.preset];
  const where = planes ? ' en cada plano (de 8 vecinas)' : ' (de 26)';
  $('rule-desc').innerHTML = (p ? p.desc + ' ' : '<b>Tu regla:</b> ') +
    `Sigue viva con <b>${listText(r.survive)}</b> y nace con <b>${listText(r.born)}</b> vecinas vivas${where}.`;
}
function setSeg(id, v) {
  for (const b of $(id).querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === v);
  renderSummary();
}
const START_NAMES = { sym: 'empieza al azar pero simétrico', random: 'empieza al azar', draw: 'lo dibujas tú', one: 'empieza con un solo cubo', glider: 'empieza con un planeador (solo viaja con las reglas de Bays)' };
const ZONE_NAMES = { s: 'recinto pequeño', m: 'recinto mediano', l: 'recinto enorme' };
const COLOR_NAMES = { fate: 'futuro', age: 'edad', nbr: 'vecinas', height: 'altura' };
function renderSummary() {
  const el = $('summary');
  if (!el) return;
  const p = PRESETS[settings.preset];
  el.innerHTML = `<b>Tu partida:</b> reglas ${p ? '«' + p.name + '»' : 'personalizadas'} · ${START_NAMES[settings.start]} · ${ZONE_NAMES[settings.zone]} · colores: ${COLOR_NAMES[settings.color]} · ${SKIES[settings.sky].label.toLowerCase()}`;
}
function bindSeg(id, onPick) {
  for (const b of $(id).querySelectorAll('button')) b.addEventListener('click', () => { onPick(b.dataset.v); setSeg(id, b.dataset.v); saveSettings(); });
}
bindSeg('rule-type', (v) => {
  if (v === settings.rule.type) return;
  settings.rule = v === 'planes' ? plainRule(PRESETS.planos.rule) : plainRule(PRESETS.hervidero.rule);
  settings.preset = 'custom';
  renderRules();
});
bindSeg('start-mode', (v) => (settings.start = v));
bindSeg('zone-size', (v) => (settings.zone = v));
bindSeg('color-mode', (v) => { settings.color = v; $('menu-legend').textContent = MENU_LEGENDS[v]; });
bindSeg('sky-mode', (v) => { settings.sky = v; applySky(); });
bindSeg('tabs', (v) => {
  $('tab-free').classList.toggle('hidden', v !== 'free');
  $('tab-goals').classList.toggle('hidden', v !== 'goals');
});
for (const id of ['b-need', 's-need']) {
  $(id).addEventListener('change', () => {
    settings.rule.bNeed = +$('b-need').value;
    settings.rule.sNeed = +$('s-need').value;
    settings.preset = 'custom';
    saveSettings();
    renderRules();
  });
}
function renderGoals() {
  const done = doneGoals();
  const box = $('goal-list');
  box.innerHTML = '';
  GOALS.forEach((g, i) => {
    const b = document.createElement('button');
    b.className = 'goal-card' + (done[g.id] ? ' done' : '');
    b.innerHTML = `<span class="st">${done[g.id] ? '⭐' : '☆'}</span><b>${i + 1}. ${g.name}</b><small>${g.text}</small><small>Reglas: ${PRESETS[g.preset].name} · máximo ${g.max} cubos al empezar</small>`;
    b.onclick = () => startGame(g);
    box.appendChild(b);
  });
  $('stars-count').textContent = `${Object.keys(done).length}/${GOALS.length} ⭐`;
}
// Figuras
const shapeList = $('shape-list');
for (const [k, p] of Object.entries(PATTERNS)) {
  const b = document.createElement('button');
  b.innerHTML = `${p.name}<small>${p.note}</small>`;
  b.onclick = () => {
    game.stamp = k;
    $('shapes').classList.add('hidden');
    toast(isTouch ? `Toca donde quieras colocar: ${p.name}` : `Haz clic donde quieras colocar: ${p.name}`, 4000);
    lockPointer();
  };
  shapeList.appendChild(b);
}

setSeg('start-mode', settings.start);
setSeg('zone-size', settings.zone);
setSeg('color-mode', settings.color);
$('menu-legend').textContent = MENU_LEGENDS[settings.color];
renderRules();
renderGoals();
applySky();

$('play').addEventListener('click', () => startGame(null));
$('resume').addEventListener('click', () => {
  showGame();
  send({ type: 'refresh' });
  if (game.phase === 'play' && !game.ended) setPaused(false);
});
const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); e.currentTarget.blur(); });
tap('btn-pause', () => setPaused(!game.paused));
tap('btn-step', stepOnce);
tap('btn-back', goBack);
tap('btn-bomb', throwSeed);
$('btn-discover').addEventListener('click', () => {
  $('btn-discover').textContent = '🎰 Buscando una regla interesante…';
  $('btn-discover').disabled = true;
  worker.postMessage({ type: 'discover' });
});
tap('btn-speed', cycleSpeed);
tap('btn-draw', () => enterEdit(false));
tap('btn-reset', restart);
tap('btn-menu', openMenu);
tap('btn-tool', () => setTool(game.tool === 'add' ? 'del' : 'add'));
tap('btn-brush', cycleBrush);
tap('btn-mirror', toggleMirror);
tap('btn-shapes', () => { releasePointer(); $('shapes').classList.remove('hidden'); });
tap('shapes-close', () => { $('shapes').classList.add('hidden'); lockPointer(); });
tap('btn-undo', undo);
tap('btn-rand', () => {
  if (game.goal) { toast('En los retos tienes que dibujarlo tú'); return; }
  setWorld(seedCells('random'));
});
tap('btn-clear', () => setWorld([]));
tap('btn-done', exitEdit);
tap('btn-cam', cycleCam);
tap('btn-center', goCenter);
tap('btn-cut', () => setCut(!cutOn));
tap('btn-sky', cycleSky);
tap('btn-photo', photo);
tap('btn-sound', toggleSound);
tap('res-retry', () => { restart(); lockPointer(); });
tap('res-edit', () => { closeResult(); setWorld(game.initial); enterEdit(false); lockPointer(); });
tap('res-watch', () => { closeResult(); setPaused(false); lockPointer(); });
tap('res-menu', openMenu);

// ---------- Bucle principal ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// De fondo en el menú: una demostración girando despacio.
buildCubes();
buildZoneBox();
const DEMO_RULE = plainRule(PRESETS.hervidero.rule);
send({ type: 'set', cells: seedCells('random'), gen: 0, rule: DEMO_RULE });
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = performance.now();
  if (playing()) {
    move(dt);
    const interval = SPEEDS[game.speedIdx].ms;
    if (game.phase === 'play' && !game.paused) {
      game.timer += dt * 1000;
      if (game.timer >= interval && !waiting) { game.timer = 0; send({ type: 'step' }); }
      anim.uProg.value = Math.min(1, (now - snapTime) / Math.max(interval, 60));
    } else anim.uProg.value = Math.min(0.55, (now - snapTime) / 300);
    updateGhost();
  } else if (!game.active) {
    game.timer += dt * 1000;
    if (game.timer >= 450 && !waiting) {
      game.timer = 0;
      if (snap && (snap.gen > 90 || snap.n === 0)) send({ type: 'set', cells: seedCells('random'), gen: 0, rule: DEMO_RULE });
      else send({ type: 'step', rule: DEMO_RULE });
    }
    anim.uProg.value = Math.min(1, (now - snapTime) / 450);
    const t = clock.elapsedTime * 0.1, r = zone().seed + 30;
    camera.position.set(Math.sin(t) * r, 16, Math.cos(t) * r);
    yaw = t; pitch = -0.2;
  }
  camera.rotation.set(pitch, yaw, 0);
  if (cutOn) {
    camF.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    cutPlane.setFromNormalAndCoplanarPoint(camF, mass.center);
  }
  floor.position.set(Math.round(camera.position.x), 0, Math.round(camera.position.z));
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  updateClouds(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Para las pruebas automáticas.
window.__game = { game, get snap() { return snap; }, editAt, aim, settings, startGame, GOALS, setCam, setCut, applySky, camera, setLook: (y, p) => { yaw = y; pitch = p; } };
