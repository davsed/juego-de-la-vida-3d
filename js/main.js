import * as THREE from 'three';
import { PRESETS, makeRule, randomSoup, key, ruleSignature } from './life.js';

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
const SKY_TOP = new THREE.Color('#4f8fe0');
const SKY_HORIZON = new THREE.Color('#bcdcf5');

const store = {
  get(k, d) { try { const v = localStorage.getItem('jv3d-' + k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('jv3d-' + k, JSON.stringify(v)); } catch (_) {} },
};
const plainRule = (r) => ({ type: r.type, survive: [...r.survive], born: [...r.born], bNeed: r.bNeed, sNeed: r.sNeed });
const settings = Object.assign(
  { preset: 'hervidero', rule: plainRule(PRESETS.hervidero.rule), start: 'random', zone: 'm', color: 'fate' },
  store.get('settings', {})
);
const saveSettings = () => store.set('settings', settings);
const zone = () => ZONES[settings.zone] || ZONES.m;
const bounds = () => { const z = zone(); return { minX: -z.half, maxX: z.half, minY: 0, maxY: z.h - 1, minZ: -z.half, maxZ: z.half }; };

// ---------- Escena ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = SKY_HORIZON;
scene.fog = new THREE.Fog(SKY_HORIZON, 40, 200);
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 900);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight('#ffffff', '#6a7f5a', 0.9));
const sun = new THREE.DirectionalLight('#fff6e0', 1.4);
sun.position.set(40, 80, 25);
scene.add(sun);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(700, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, h), 1.0); }',
  })
);
scene.add(sky);

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

// Suelo infinito translúcido: un plano grande que acompaña al jugador.
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
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
  new THREE.MeshLambertMaterial({ map: floorTex, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })
);
floor.rotation.x = -Math.PI / 2;
floor.renderOrder = -1;
scene.add(floor);

// Recuadro de la zona de vida.
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
const clouds = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }), CLOUD_N);
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

// Cubos vivos: una sola malla instanciada.
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
const cubeMat = new THREE.MeshLambertMaterial({ map: cubeTex });
let cubes = null;
function buildCubes() {
  const z = zone();
  const cap = Math.min(MAX_INSTANCES, (z.half * 2 + 1) ** 2 * z.h);
  if (cubes && cubes.userData.cap === cap) return;
  if (cubes) { scene.remove(cubes); cubes.dispose(); }
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
function colorFor(i, snap) {
  switch (settings.color) {
    case 'age': return AGES[ageIdx(snap.ages[i])];
    case 'nbr': return tmpC.setHSL((1 - Math.min(snap.nbr[i], 14) / 14) * 0.62, 0.75, 0.52);
    case 'height': return tmpC.setHSL(Math.min(snap.coords[i * 3 + 1] / (zone().h - 1), 1) * 0.8, 0.72, 0.56);
    default: return FATE[snap.fate[i]];
  }
}

// ---------- Simulación en segundo plano ----------
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let snap = null;
let waiting = false;
let aliveKeys = null; // copia de las celdas vivas para apuntar al dibujar (se crea solo cuando hace falta)

function send(msg) {
  waiting = true;
  worker.postMessage(Object.assign({ rule: settings.rule, bounds: bounds(), wantNeighbors: settings.color === 'nbr' }, msg));
}

worker.onmessage = (e) => {
  const m = e.data;
  waiting = false;
  snap = m;
  aliveKeys = null;
  drawSnapshot();
  if (m.reason === 'set') game.history = [{ hash: m.hash, gen: 0 }];
  if (m.reason === 'step') checkEnd();
};

function drawSnapshot() {
  if (!snap) return;
  const arr = cubes.instanceMatrix.array, col = cubes.instanceColor.array;
  const n = Math.min(snap.n, cubes.userData.cap);
  for (let i = 0; i < n; i++) {
    const o = i * 16;
    arr[o] = 1; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
    arr[o + 4] = 0; arr[o + 5] = 1; arr[o + 6] = 0; arr[o + 7] = 0;
    arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = 1; arr[o + 11] = 0;
    arr[o + 12] = snap.coords[i * 3]; arr[o + 13] = snap.coords[i * 3 + 1] + 0.5; arr[o + 14] = snap.coords[i * 3 + 2]; arr[o + 15] = 1;
    const c = colorFor(i, snap);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  cubes.count = n;
  cubes.instanceMatrix.needsUpdate = true;
  cubes.instanceColor.needsUpdate = true;
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

// ---------- Estado de la partida ----------
const game = {
  active: false, phase: 'menu', paused: false, speedIdx: 0, timer: 0,
  initial: [], maxN: 0, history: [], ended: false, tool: 'add',
};

function seedCells(mode) {
  const z = zone();
  if (mode === 'draw') return [];
  if (mode === 'one') return [key(0, 10, 0)];
  return [...randomSoup({ cx: 0, cy: Math.ceil(z.seed / 2) + 2, cz: 0, size: z.seed, density: 0.3 })];
}

function setWorld(cells) {
  game.history = [];
  game.ended = false;
  game.maxN = cells.length;
  game.timer = 0;
  send({ type: 'set', cells, gen: 0 });
}

function startGame() {
  buildCubes();
  buildZoneBox();
  game.active = true;
  game.speedIdx = 0;
  $('btn-speed').querySelector('span').textContent = SPEEDS[0].label;
  game.initial = seedCells(settings.start);
  setWorld(game.initial);
  const z = zone();
  if (settings.start === 'draw') placeCamera(0, 6, 14, -0.4);
  else if (settings.start === 'one') placeCamera(0, 12, 22, -0.1);
  else placeCamera(0, z.seed / 2 + 4, z.seed + 22, -0.12);
  showGame();
  if (settings.start === 'draw') enterEdit(true);
  else { setPaused(false); setPhase('play'); hintOnce('move', isTouch ? 'Mueve el joystick para andar y arrastra el dedo para mirar' : 'Haz clic en la escena para mirar con el ratón · WASD para andar'); }
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
  ghost.visible = false;
}

function setPaused(v) {
  game.paused = v;
  const b = $('btn-pause');
  b.querySelector('i').textContent = v ? '▶' : '⏸';
  b.querySelector('span').textContent = v ? 'Seguir' : 'Pausa';
}

function cycleSpeed() {
  game.speedIdx = (game.speedIdx + 1) % SPEEDS.length;
  $('btn-speed').querySelector('span').textContent = SPEEDS[game.speedIdx].label;
}

function stepOnce() {
  setPaused(true);
  if (!waiting) send({ type: 'step' });
}

// Fin de partida: todo muerto, quieto o repitiendo un ciclo.
function checkEnd() {
  if (!game.active || game.ended || game.phase !== 'play') return;
  let kind = null, from = snap.gen, period = 0;
  if (snap.n === 0) kind = 'extinct';
  else {
    const prev = game.history.find((h) => h.hash === snap.hash);
    if (prev) { kind = 'cycle'; from = prev.gen; period = snap.gen - prev.gen; }
    game.history.push({ hash: snap.hash, gen: snap.gen });
    if (game.history.length > 30) game.history.shift();
  }
  if (kind) showResult(kind, from, period);
}

function showResult(kind, from, period) {
  game.ended = true;
  setPaused(true);
  releasePointer();
  const score = from;
  const sig = ruleSignature(settings.rule);
  const records = store.get('records', {});
  const old = records[sig] || 0;
  let title, text;
  if (kind === 'extinct') { title = '💀 Se ha extinguido'; text = `Todas las células murieron en la generación ${from}.`; }
  else if (period === 1) { title = '🧊 Se ha quedado quieta'; text = `Desde la generación ${from} ya no cambia nada: ${snap.n.toLocaleString('es-ES')} cubos inmóviles.`; }
  else { title = '🔁 Se repite en bucle'; text = `Desde la generación ${from} repite un ciclo de ${period} pasos.`; }
  text += ` Población máxima: ${game.maxN.toLocaleString('es-ES')} cubos.`;
  let rec = '';
  if (score > old) { records[sig] = score; store.set('records', records); rec = old ? `🏆 ¡Nuevo récord con estas reglas! ${score} generaciones (antes ${old}).` : `🏆 Récord con estas reglas: ${score} generaciones. ¿Puedes superarlo?`; }
  else rec = `Récord con estas reglas: ${old} generaciones. Tú: ${score}.`;
  $('res-title').textContent = title;
  $('res-text').textContent = text;
  $('res-record').textContent = rec;
  $('result').classList.remove('hidden');
}
function closeResult() { $('result').classList.add('hidden'); }

// ---------- Modo dibujo ----------
function enterEdit(fresh) {
  closeResult();
  setPaused(true);
  setPhase('edit');
  setTool('add');
  if (fresh) toast(isTouch ? 'Toca el suelo o un cubo para poner un cubo encima. Cuando acabes, pulsa «¡Listo!»' : 'Clic izquierdo pone un cubo, clic derecho lo quita. Pulsa «¡Listo!» (o Intro) al acabar', 6000);
  else if (snap && snap.gen > 0) toast(`Dibujando sobre la generación ${snap.gen}`);
  else hintOnce('draw', isTouch ? 'Toca el suelo o un cubo para poner un cubo encima' : 'Clic izquierdo pone, clic derecho quita');
}
function exitEdit() {
  if (snap && snap.gen === 0) game.initial = [...getAliveKeys()];
  game.history = snap ? [{ hash: snap.hash, gen: snap.gen }] : [];
  game.ended = false;
  setPhase('play');
  setPaused(false);
  if (snap && snap.n === 0) toast('No hay cubos: pulsa ✏️ Dibujar para poner algunos');
}
function setTool(t) {
  game.tool = t;
  const b = $('btn-tool');
  b.className = t === 'add' ? 'tool-add' : 'tool-del';
  b.querySelector('i').textContent = t === 'add' ? '➕' : '➖';
  b.querySelector('span').textContent = t === 'add' ? 'Poner' : 'Quitar';
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
function editAt(clientX, clientY, tool) {
  const hit = aim(clientX, clientY);
  if (!hit) return;
  if (tool === 'del') {
    if (!hit.cell) return;
    getAliveKeys().delete(key(...hit.cell));
    worker.postMessage({ type: 'edit', remove: [hit.cell] });
  } else {
    if (!inZone(hit.place)) { toast('Fuera del recinto: dibuja dentro de las líneas blancas'); return; }
    getAliveKeys().add(key(...hit.place));
    worker.postMessage({ type: 'edit', add: [hit.place] });
  }
  waiting = true;
}
function updateGhost() {
  ghost.visible = false;
  if (game.phase !== 'edit' || isTouch || !playing()) return;
  const hit = aim();
  if (!hit) return;
  const del = game.tool === 'del';
  const c = del ? hit.cell : hit.place;
  if (!c) return;
  ghost.position.set(c[0], c[1] + 0.5, c[2]);
  ghost.material.color.set(del ? '#ff5544' : inZone(c) ? '#ffffff' : '#888888');
  ghost.visible = true;
}

// ---------- Movimiento en primera persona ----------
let yaw = 0, pitch = 0;
const keys = new Set();
const joy = { x: 0, y: 0 };
let flyUp = false, flyDown = false;
function placeCamera(x, y, z, p) { camera.position.set(x, y, z); yaw = 0; pitch = p; }
function applyLook(dx, dy, sens) {
  yaw -= dx * sens;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - dy * sens));
}
const fwd = new THREE.Vector3(), right = new THREE.Vector3();
function move(dt) {
  let f = 0, s = 0, u = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  if (keys.has('Space') || flyUp) u += 1;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight') || flyDown) u -= 1;
  f += -joy.y; s += joy.x;
  const speed = 12;
  fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  camera.position.addScaledVector(fwd, f * speed * dt);
  camera.position.addScaledVector(right, s * speed * dt);
  camera.position.y = Math.max(1.2, Math.min(200, camera.position.y + u * speed * dt));
}
const playing = () => game.active && $('menu').classList.contains('hidden') && $('result').classList.contains('hidden');
const releasePointer = () => { if (document.pointerLockElement) document.exitPointerLock(); };
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
  else if (c === 'KeyM') openMenu();
  else if (c === 'KeyR') restart();
  else if (game.phase === 'play') {
    if (c === 'KeyP') setPaused(!game.paused);
    else if (c === 'KeyN') stepOnce();
    else if (c === 'KeyV') cycleSpeed();
  }
  if (c === 'Space' || c.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); flyUp = flyDown = false; });

// Ratón
let mouseDrag = null;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (!playing()) return;
  if (e.pointerType === 'mouse') {
    if (document.pointerLockElement === canvas) {
      if (game.phase === 'edit') editAt(undefined, undefined, e.button === 2 ? 'del' : game.tool);
    } else {
      lockPointer();
      mouseDrag = { x: e.clientX, y: e.clientY };
    }
  } else {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
  }
});
window.addEventListener('mousemove', (e) => {
  if (!playing()) return;
  if (document.pointerLockElement === canvas) {
    // Algunos navegadores mandan un salto enorme justo al capturar el ratón: lo ignoramos.
    if (Math.abs(e.movementX) < 150 && Math.abs(e.movementY) < 150) applyLook(e.movementX, e.movementY, 0.0024);
  } else if (mouseDrag && e.buttons) {
    applyLook(e.clientX - mouseDrag.x, e.clientY - mouseDrag.y, 0.005);
    mouseDrag = { x: e.clientX, y: e.clientY };
  }
});
window.addEventListener('mouseup', () => (mouseDrag = null));

// Táctil: arrastrar para mirar; un toque corto en modo dibujo pone o quita un cubo.
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
}
function bindSeg(id, onPick) {
  for (const b of $(id).querySelectorAll('button')) b.addEventListener('click', () => { setSeg(id, b.dataset.v); onPick(b.dataset.v); saveSettings(); });
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
for (const id of ['b-need', 's-need']) {
  $(id).addEventListener('change', () => {
    settings.rule.bNeed = +$('b-need').value;
    settings.rule.sNeed = +$('s-need').value;
    settings.preset = 'custom';
    saveSettings();
    renderRules();
  });
}
setSeg('start-mode', settings.start);
setSeg('zone-size', settings.zone);
setSeg('color-mode', settings.color);
$('menu-legend').textContent = MENU_LEGENDS[settings.color];
renderRules();

$('play').addEventListener('click', startGame);
$('resume').addEventListener('click', () => {
  showGame();
  send({ type: 'refresh' }); // por si han cambiado los colores
  if (game.phase === 'play' && !game.ended) setPaused(false);
});
const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); e.currentTarget.blur(); });
tap('btn-pause', () => setPaused(!game.paused));
tap('btn-step', stepOnce);
tap('btn-speed', cycleSpeed);
tap('btn-draw', () => enterEdit(false));
tap('btn-reset', restart);
tap('btn-menu', openMenu);
tap('btn-tool', () => setTool(game.tool === 'add' ? 'del' : 'add'));
tap('btn-rand', () => { setWorld(seedCells('random')); });
tap('btn-clear', () => { setWorld([]); });
tap('btn-done', exitEdit);
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
send({ type: 'set', cells: seedCells('random'), gen: 0, rule: plainRule(PRESETS.hervidero.rule) });
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (playing()) {
    move(dt);
    if (game.phase === 'play' && !game.paused) {
      game.timer += dt * 1000;
      if (game.timer >= SPEEDS[game.speedIdx].ms && !waiting) { game.timer = 0; send({ type: 'step' }); }
    }
    updateGhost();
  } else if (!game.active) {
    game.timer += dt * 1000;
    if (game.timer >= 450 && !waiting) {
      game.timer = 0;
      if (snap && (snap.gen > 90 || snap.n === 0)) send({ type: 'set', cells: seedCells('random'), gen: 0, rule: plainRule(PRESETS.hervidero.rule) });
      else worker.postMessage({ type: 'step', rule: plainRule(PRESETS.hervidero.rule), bounds: bounds() }), (waiting = true);
    }
    const t = clock.elapsedTime * 0.1, r = zone().seed + 30;
    camera.position.set(Math.sin(t) * r, 16, Math.cos(t) * r);
    yaw = t; pitch = -0.2;
  }
  camera.rotation.set(pitch, yaw, 0);
  floor.position.set(Math.round(camera.position.x), 0, Math.round(camera.position.z));
  sky.position.copy(camera.position);
  updateClouds(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Para las pruebas automáticas.
window.__game = { game, get snap() { return snap; }, editAt, aim, settings, enterEdit, exitEdit, camera, setLook: (y, p) => { yaw = y; pitch = p; } };
