import * as THREE from 'three';
import { RULES, step, randomSoup, unkey } from './life.js';

// ---------- Ajustes ----------
const ZONE = { minX: -20, maxX: 20, minY: 0, maxY: 29, minZ: -20, maxZ: 20 };
const MAX_CELLS = (ZONE.maxX - ZONE.minX + 1) * (ZONE.maxY - ZONE.minY + 1) * (ZONE.maxZ - ZONE.minZ + 1);
const SPEEDS = [{ label: '1×', ms: 600 }, { label: '2×', ms: 300 }, { label: '4×', ms: 140 }];
const START_POS = new THREE.Vector3(0, 9, 36);
const SKY_TOP = new THREE.Color('#4f8fe0');
const SKY_HORIZON = new THREE.Color('#bcdcf5');
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (isTouch) document.body.classList.add('touch');

const $ = (id) => document.getElementById(id);

// ---------- Escena ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = SKY_HORIZON;
scene.fog = new THREE.Fog(SKY_HORIZON, 35, 170);

const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 600);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight('#ffffff', '#6a7f5a', 0.9));
const sun = new THREE.DirectionalLight('#fff6e0', 1.4);
sun.position.set(40, 80, 25);
scene.add(sun);

// Cielo con degradado (no le afecta la niebla).
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(500, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, h), 1.0); }',
  })
);
scene.add(sky);

// Texturas pixeladas dibujadas en un lienzo (estética de bloques).
function pixelTexture(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  paint(g, size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noise(g, size, base, spread) {
  for (let x = 0; x < size; x++)
    for (let y = 0; y < size; y++) {
      const v = base + Math.floor((Math.random() - 0.5) * spread);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 1, 1);
    }
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
const FLOOR_SIZE = 800;
floorTex.repeat.set(FLOOR_SIZE, FLOOR_SIZE);
floorTex.offset.set(0.5, 0.5); // líneas entre bloques (los cubos están centrados en enteros)
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
  new THREE.MeshLambertMaterial({ map: floorTex, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })
);
floor.rotation.x = -Math.PI / 2;
floor.renderOrder = -1;
scene.add(floor);

// Recuadro de la zona de vida.
const zoneBox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(ZONE.maxX - ZONE.minX + 1, ZONE.maxY - ZONE.minY + 1, ZONE.maxZ - ZONE.minZ + 1)),
  new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 })
);
zoneBox.position.set((ZONE.minX + ZONE.maxX) / 2, (ZONE.minY + ZONE.maxY + 1) / 2, (ZONE.minZ + ZONE.maxZ) / 2);
scene.add(zoneBox);

// Nubes de bloques planas.
const CLOUD_N = 60;
const clouds = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }),
  CLOUD_N
);
const cloudData = [];
for (let i = 0; i < CLOUD_N; i++) {
  cloudData.push({ x: (Math.random() - 0.5) * 400, z: (Math.random() - 0.5) * 400, w: 8 + Math.floor(Math.random() * 20), d: 6 + Math.floor(Math.random() * 14) });
}
scene.add(clouds);
const tmpM = new THREE.Matrix4();
function updateClouds(dt) {
  for (let i = 0; i < CLOUD_N; i++) {
    const c = cloudData[i];
    c.x += dt * 1.5;
    // Las nubes dan la vuelta alrededor del jugador para parecer infinitas.
    const px = camera.position.x, pz = camera.position.z;
    if (c.x - px > 200) c.x -= 400; else if (c.x - px < -200) c.x += 400;
    if (c.z - pz > 200) c.z -= 400; else if (c.z - pz < -200) c.z += 400;
    tmpM.makeScale(c.w, 2, c.d).setPosition(c.x, 75, c.z);
    clouds.setMatrixAt(i, tmpM);
  }
  clouds.instanceMatrix.needsUpdate = true;
}

// Cubos vivos: una sola malla instanciada.
const cubeTex = pixelTexture(16, (g, s) => {
  noise(g, s, 225, 40);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 0, s, 1); g.fillRect(0, s - 1, s, 1); g.fillRect(0, 0, 1, s); g.fillRect(s - 1, 0, 1, s);
});
const cubes = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshLambertMaterial({ map: cubeTex }),
  MAX_CELLS
);
cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
cubes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CELLS * 3), 3);
cubes.instanceColor.setUsage(THREE.DynamicDrawUsage);
cubes.frustumCulled = false;
cubes.count = 0;
scene.add(cubes);

// Colores según la edad de la célula: recién nacida amarilla, veterana azul.
const AGE_COLORS = ['#ffe45c', '#b6e84f', '#63c442', '#3b9f55', '#2f7f8f', '#3560a8'].map((c) => new THREE.Color(c));
function ageColor(age) {
  const i = age <= 1 ? 0 : age === 2 ? 1 : age <= 4 ? 2 : age <= 8 ? 3 : age <= 16 ? 4 : 5;
  return AGE_COLORS[i];
}

// ---------- Estado del juego ----------
let alive = new Set();
let ages = new Map();
let generation = 0;
let ruleName = 'hervidero';
let paused = false;
let speedIdx = 0;
let started = false;
let stepTimer = 0;

function seed() {
  alive = randomSoup({ cx: 0, cy: 8, cz: 0, size: 12, density: 0.3 });
  ages = new Map();
  for (const k of alive) ages.set(k, 1);
  generation = 0;
  stepTimer = 0;
  refreshCubes();
}

function advance() {
  const next = step(alive, RULES[ruleName], ZONE);
  const nextAges = new Map();
  for (const k of next) nextAges.set(k, (ages.get(k) || 0) + 1);
  alive = next;
  ages = nextAges;
  generation++;
  refreshCubes();
}

function refreshCubes() {
  const m = cubes.instanceMatrix.array;
  const col = cubes.instanceColor.array;
  let i = 0;
  for (const k of alive) {
    if (i >= MAX_CELLS) break;
    const [x, y, z] = unkey(k);
    const o = i * 16;
    m[o] = 1; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = 1; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y + 0.5; m[o + 14] = z; m[o + 15] = 1;
    const c = ageColor(ages.get(k));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    i++;
  }
  cubes.count = i;
  cubes.instanceMatrix.needsUpdate = true;
  cubes.instanceColor.needsUpdate = true;
  $('gen').textContent = `Gen ${generation}`;
  $('count').textContent = `${alive.size.toLocaleString('es-ES')} cubos`;
}

// ---------- Movimiento en primera persona ----------
let yaw = 0, pitch = -0.12;
const keys = new Set();
const joy = { x: 0, y: 0 };
let flyUp = false, flyDown = false;

function resetPlayer() {
  camera.position.copy(START_POS);
  yaw = 0; pitch = -0.12;
}

function applyLook(dx, dy, sens) {
  yaw -= dx * sens;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - dy * sens));
}

const fwd = new THREE.Vector3(), right = new THREE.Vector3();
function move(dt) {
  camera.rotation.set(pitch, yaw, 0);
  let f = 0, s = 0, u = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  if (keys.has('Space') || flyUp) u += 1;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight') || flyDown) u -= 1;
  f += -joy.y; s += joy.x;
  const speed = 10;
  fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  camera.position.addScaledVector(fwd, f * speed * dt);
  camera.position.addScaledVector(right, s * speed * dt);
  camera.position.y = Math.max(1.2, Math.min(120, camera.position.y + u * speed * dt));
  // El suelo y el cielo acompañan al jugador (alineados a bloques enteros).
  floor.position.set(Math.round(camera.position.x), 0, Math.round(camera.position.z));
  sky.position.copy(camera.position);
}

// Teclado
const playing = () => started && $('menu').classList.contains('hidden');
window.addEventListener('keydown', (e) => {
  if (!playing()) return;
  keys.add(e.code);
  if (e.code === 'KeyP') togglePause();
  else if (e.code === 'KeyR') restart();
  else if (e.code === 'KeyN') stepOnce();
  else if (e.code === 'KeyV') cycleSpeed();
  else if (e.code === 'KeyM') openMenu();
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); flyUp = flyDown = false; });

// Ratón: bloqueo del puntero al hacer clic; si no está disponible, arrastrar.
let mouseDrag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (!playing()) return;
  if (e.pointerType === 'mouse') {
    if (canvas.requestPointerLock && document.pointerLockElement !== canvas) {
      try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
    }
    mouseDrag = { x: e.clientX, y: e.clientY };
  } else {
    lookTouch.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
});
window.addEventListener('mousemove', (e) => {
  if (!playing()) return;
  if (document.pointerLockElement === canvas) {
    // Algunos navegadores mandan un salto enorme justo al capturar el ratón: lo ignoramos.
    if (Math.abs(e.movementX) < 150 && Math.abs(e.movementY) < 150) applyLook(e.movementX, e.movementY, 0.0024);
  }
  else if (mouseDrag && e.buttons) {
    applyLook(e.clientX - mouseDrag.x, e.clientY - mouseDrag.y, 0.005);
    mouseDrag = { x: e.clientX, y: e.clientY };
  }
});
window.addEventListener('mouseup', () => (mouseDrag = null));

// Táctil: arrastrar en cualquier parte para mirar.
const lookTouch = new Map();
canvas.addEventListener('pointermove', (e) => {
  const t = lookTouch.get(e.pointerId);
  if (!t) return;
  const sens = Math.PI / Math.max(window.innerWidth, 1); // un ancho de pantalla ≈ media vuelta
  applyLook(e.clientX - t.x, e.clientY - t.y, sens);
  t.x = e.clientX; t.y = e.clientY;
});
const endLook = (e) => lookTouch.delete(e.pointerId);
canvas.addEventListener('pointerup', endLook);
canvas.addEventListener('pointercancel', endLook);

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

// Botones de subir y bajar (mientras se mantienen pulsados)
function holdButton(el, set) {
  const on = (e) => { e.preventDefault(); set(true); el.classList.add('on'); };
  const off = () => { set(false); el.classList.remove('on'); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
holdButton($('btn-up'), (v) => (flyUp = v));
holdButton($('btn-down'), (v) => (flyDown = v));

// ---------- Botones e interfaz ----------
function togglePause() {
  paused = !paused;
  $('btn-pause').textContent = paused ? '▶' : '⏸';
  $('paused-tag').classList.toggle('hidden', !paused);
}
function stepOnce() {
  if (!paused) togglePause();
  advance();
}
function cycleSpeed() {
  speedIdx = (speedIdx + 1) % SPEEDS.length;
  $('btn-speed').textContent = SPEEDS[speedIdx].label;
}
function restart() {
  seed();
  if (paused) togglePause();
}
function openMenu() {
  if (document.pointerLockElement) document.exitPointerLock();
  if (!paused) togglePause();
  $('play').textContent = '▶ Seguir';
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('touch').classList.add('hidden');
  $('crosshair').classList.add('hidden');
}
function describeRule() {
  const r = RULES[ruleName];
  const list = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' o ' + a[a.length - 1] : String(a[0]));
  $('r-s').textContent = list(r.survive);
  $('r-b').textContent = list(r.born);
}
$('rule').addEventListener('change', (e) => { ruleName = e.target.value; describeRule(); $('play').textContent = '▶ Play'; started = false; });
const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); e.currentTarget.blur(); });
tap('btn-pause', togglePause);
tap('btn-step', stepOnce);
tap('btn-speed', cycleSpeed);
tap('btn-reset', restart);
tap('btn-menu', openMenu);
$('play').addEventListener('click', () => {
  if (!started) { seed(); resetPlayer(); started = true; }
  if (paused) togglePause();
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('crosshair').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  else if (canvas.requestPointerLock) {
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
  }
});

// ---------- Bucle principal ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// Vista de fondo en el menú: semilla girando lentamente.
resetPlayer();
seed();
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (playing()) {
    move(dt);
    if (!paused) {
      stepTimer += dt * 1000;
      if (stepTimer >= SPEEDS[speedIdx].ms) { stepTimer = 0; advance(); }
    }
  } else if (!started) {
    stepTimer += dt * 1000;
    if (stepTimer >= 500) { stepTimer = 0; advance(); if (alive.size === 0) seed(); }
    const t = clock.elapsedTime * 0.12;
    camera.position.set(Math.sin(t) * 36, 12, Math.cos(t) * 36);
    yaw = t; pitch = -0.15;
    camera.rotation.set(pitch, yaw, 0);
    floor.position.set(Math.round(camera.position.x), 0, Math.round(camera.position.z));
    sky.position.copy(camera.position);
  }
  updateClouds(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
describeRule();
requestAnimationFrame(frame);

// Para las pruebas automáticas.
window.__game = { get generation() { return generation; }, get alive() { return alive.size; }, advance, camera };
