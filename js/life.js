// Lógica del juego de la vida en 3D (sin dependencias, válida en navegador y Node).
// El mundo es infinito: solo se guardan las celdas vivas, empaquetadas en un número.

const OFFSET = 65536;          // permite coordenadas entre -65536 y 65535
const SIZE = 131072;           // 2^17
const SIZE2 = SIZE * SIZE;     // 2^34 (cabe de sobra en un entero seguro de JS)

export function key(x, y, z) {
  return (x + OFFSET) * SIZE2 + (y + OFFSET) * SIZE + (z + OFFSET);
}

export function unkey(k) {
  const z = (k % SIZE) - OFFSET;
  const rest = Math.floor(k / SIZE);
  const y = (rest % SIZE) - OFFSET;
  const x = Math.floor(rest / SIZE) - OFFSET;
  return [x, y, z];
}

// Desplazamientos de las 26 vecinas, ya convertidos a diferencias de clave.
const NEIGHBOR_DELTAS = [];
for (let dx = -1; dx <= 1; dx++)
  for (let dy = -1; dy <= 1; dy++)
    for (let dz = -1; dz <= 1; dz++)
      if (dx || dy || dz) NEIGHBOR_DELTAS.push(dx * SIZE2 + dy * SIZE + dz);

export const NEIGHBOR_COUNT = NEIGHBOR_DELTAS.length; // 26

// Una regla: listas de recuentos de vecinas para sobrevivir y para nacer.
// type 'total': cuenta las 26 vecinas.
// type 'planes': juego clásico 2D en cada uno de los 3 planos que pasan por la celda
//   (8 vecinas por plano). Una celda nace si la regla se cumple en al menos `bNeed` planos
//   y sobrevive si se cumple en al menos `sNeed` planos (de 1 a 3).
export function makeRule(survive, born, { type = 'total', bNeed = 1, sNeed = 3 } = {}) {
  const s = new Array(27).fill(false);
  const b = new Array(27).fill(false);
  survive.forEach((n) => (s[n] = true));
  born.forEach((n) => (b[n] = true));
  return { type, bNeed, sNeed, survive: [...survive].sort((a, c) => a - c), born: [...born].sort((a, c) => a - c), s, b };
}

// Reglas con nombre. `desc` se muestra en el menú.
export const PRESETS = {
  hervidero: { name: 'Hervidero', rule: makeRule([5, 6, 7], [5]),
    desc: 'Crece desde la semilla, llena el recinto y se queda burbujeando sin parar.' },
  planos: { name: 'Clásico en 3 planos', rule: makeRule([2, 3], [3], { type: 'planes', bNeed: 1, sNeed: 3 }),
    desc: 'El juego de la vida de siempre (sobrevive con 2 o 3, nace con 3) jugado a la vez en los 3 planos que cruzan cada cubo: el horizontal y los dos verticales. Nace si lo consigue en algún plano; sobrevive solo si lo consigue en los tres.' },
  bays: { name: 'Clásica de Bays', rule: makeRule([4, 5], [5]),
    desc: 'La versión 3D más conocida (Carter Bays, 1987). Muy exigente: casi siempre se apaga pronto. Ideal para el reto de aguantar el máximo de generaciones.' },
  cristal: { name: 'Cristal', rule: makeRule([0, 1, 2, 3, 4, 5, 6], [1, 3]),
    desc: 'Desde un solo cubo crece un cristal geométrico que se expande en todas direcciones. Empieza con «un solo cubo».' },
  piroclasto: { name: 'Lava', rule: makeRule([4, 5, 6, 7], [6, 7, 8]),
    desc: 'La semilla se hincha y se derrama por el recinto en ebullición, como lava.' },
};

export const RULES = Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.rule]));

// Comprueba si una clave cae dentro de unos límites {minX, maxX, minY, maxY, minZ, maxZ}.
export function inBounds(k, b) {
  const [x, y, z] = unkey(k);
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ;
}

// Cuenta cuántas vecinas vivas tiene una celda concreta.
export function countNeighbors(alive, x, y, z) {
  const k = key(x, y, z);
  let n = 0;
  for (const d of NEIGHBOR_DELTAS) if (alive.has(k + d)) n++;
  return n;
}

// Pesos para contar vecinas por planos: XY (dz=0) en unidades, XZ (dy=0) en 16s, YZ (dx=0) en 256s.
const PLANE_DELTAS = [];
for (let dx = -1; dx <= 1; dx++)
  for (let dy = -1; dy <= 1; dy++)
    for (let dz = -1; dz <= 1; dz++) {
      if (!(dx || dy || dz)) continue;
      const w = (dz === 0 ? 1 : 0) + (dy === 0 ? 16 : 0) + (dx === 0 ? 256 : 0);
      if (w) PLANE_DELTAS.push([dx * SIZE2 + dy * SIZE + dz, w]);
    }

function planeVerdict(rule, alive, packed) {
  const table = alive ? rule.s : rule.b;
  const v = (table[packed & 15] ? 1 : 0) + (table[(packed >> 4) & 15] ? 1 : 0) + (table[(packed >> 8) & 15] ? 1 : 0);
  return v >= (alive ? rule.sNeed : rule.bNeed);
}

// Firma corta de una regla (para guardar récords).
export function ruleSignature(rule) {
  const base = `${rule.survive.join(',')}/${rule.born.join(',')}`;
  return rule.type === 'planes' ? `P${rule.bNeed}${rule.sNeed}:${base}` : base;
}

// Huella de un estado: sirve para detectar si el mundo se ha quedado quieto o repite un ciclo.
export function stateHash(alive) {
  let a = 0, b = 0;
  for (const k of alive) { a += k % 2147483629; b = (b ^ (k % 4294967291)) | 0; }
  return `${alive.size}:${a}:${b}`;
}

// Calcula la siguiente generación. `alive` es un Set de claves.
// `bounds` (opcional) limita dónde pueden nacer celdas nuevas.
export function step(alive, rule, bounds = null) {
  const planes = rule.type === 'planes';
  const deltas = planes ? PLANE_DELTAS : NEIGHBOR_DELTAS.map((d) => [d, 1]);
  const counts = new Map();
  for (const k of alive) {
    if (!counts.has(k)) counts.set(k, 0); // así también se evalúan las celdas sin vecinas
    for (const [d, w] of deltas) {
      const nk = k + d;
      counts.set(nk, (counts.get(nk) || 0) + w);
    }
  }
  const next = new Set();
  for (const [k, n] of counts) {
    const isAlive = alive.has(k);
    const ok = planes ? planeVerdict(rule, isAlive, n) : isAlive ? rule.s[n] : rule.b[n];
    if (ok && (isAlive || !bounds || inBounds(k, bounds))) next.add(k);
  }
  return next;
}

// Generador pseudoaleatorio reproducible (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Sopa aleatoria: un bloque de lado `size` centrado en (cx, cy, cz) con cierta densidad.
export function randomSoup({ cx = 0, cy = 0, cz = 0, size = 10, density = 0.3, random = Math.random } = {}) {
  const alive = new Set();
  const h = Math.floor(size / 2);
  for (let x = -h; x < size - h; x++)
    for (let y = -h; y < size - h; y++)
      for (let z = -h; z < size - h; z++)
        if (random() < density) alive.add(key(cx + x, cy + y, cz + z));
  return alive;
}

// ---------- Figuras para colocar de golpe ----------
function box(w, h, d) {
  const out = [];
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) out.push([x, y, z]);
  return out;
}
function shell(r) {
  const out = [];
  for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) {
    const d = Math.sqrt(x * x + y * y + z * z);
    if (d <= r + 0.5 && d > r - 0.5) out.push([x + r, y + r, z + r]);
  }
  return out;
}
function ring(r) {
  const out = new Set();
  for (let a = 0; a < 360; a += 3) out.add(`${Math.round(r + r * Math.cos((a * Math.PI) / 180))},0,${Math.round(r + r * Math.sin((a * Math.PI) / 180))}`);
  return [...out].map((s) => s.split(',').map(Number));
}
function pyramid(n) {
  const out = [];
  for (let y = 0; y < n; y++) for (let x = y; x < 2 * n - 1 - y; x++) for (let z = y; z < 2 * n - 1 - y; z++) out.push([x, y, z]);
  return out;
}
function cross(r) {
  const out = [[r, r, r]];
  for (let i = 1; i <= r; i++) out.push([r + i, r, r], [r - i, r, r], [r, r + i, r], [r, r - i, r], [r, r, r + i], [r, r, r - i]);
  return out;
}

// Coordenadas relativas (x, y, z) con y hacia arriba; la figura se apoya en y = 0.
export const PATTERNS = {
  planeador: { name: 'Planeador', note: 'Reglas de Bays: avanza 1 bloque en diagonal cada 4 generaciones',
    cells: [[0, 1, 1], [1, 0, 0], [1, 0, 1], [0, 2, 1], [2, 1, 0], [2, 1, 1], [2, 2, 0], [2, 2, 1], [1, 3, 0], [1, 3, 1]] },
  bloque: { name: 'Bloque 2×2×2', note: 'Se queda quieto en «Clásico en 3 planos»', cells: box(2, 2, 2) },
  cubo: { name: 'Cubo 3×3×3', note: 'Macizo: estalla con casi todas las reglas', cells: box(3, 3, 3) },
  cruz: { name: 'Cruz 3D', note: 'Tres barras cruzadas', cells: cross(2) },
  anillo: { name: 'Anillo', note: 'Un aro plano de radio 4', cells: ring(4) },
  esfera: { name: 'Esfera hueca', note: 'Una burbuja de radio 3', cells: shell(3) },
  piramide: { name: 'Pirámide', note: 'Base de 7×7', cells: pyramid(4) },
};

// ---------- Descubrir reglas ----------
// Prueba reglas al azar en un recinto pequeño y devuelve una «interesante»:
// que no se apague, que no llene el recinto y que siga cambiando.
export function discoverRule(random = Math.random, { tries = 60, maxMs = 4000 } = {}) {
  const b = { minX: -15, maxX: 15, minY: 0, maxY: 30, minZ: -15, maxZ: 15 };
  const volume = 31 * 31 * 31;
  const pick = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));
  const t0 = Date.now();
  for (let t = 0; t < tries && Date.now() - t0 < maxMs; t++) {
    const s0 = pick(1, 9), s1 = s0 + pick(0, 5);
    const b0 = pick(3, 9), b1 = b0 + pick(0, 2);
    const survive = [], born = [];
    for (let n = s0; n <= s1; n++) survive.push(n);
    for (let n = b0; n <= b1; n++) born.push(n);
    if (random() < 0.3) { const extra = pick(10, 20); if (!born.includes(extra)) born.push(extra); }
    const rule = makeRule(survive, born);
    let a = randomSoup({ cx: 0, cy: 15, cz: 0, size: 10, density: 0.3, random });
    let ok = true, changes = 0;
    for (let g = 0; g < 45; g++) {
      const n = step(a, rule, b);
      if (n.size === 0 || n.size > volume * 0.35) { ok = false; break; }
      if (g === 44) { for (const k of n) if (!a.has(k)) changes++; }
      a = n;
    }
    if (ok && a.size > 60 && changes > a.size * 0.04) return rule;
  }
  return null;
}
