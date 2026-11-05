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
export function makeRule(survive, born) {
  const s = new Array(27).fill(false);
  const b = new Array(27).fill(false);
  survive.forEach((n) => (s[n] = true));
  born.forEach((n) => (b[n] = true));
  return { survive: [...survive], born: [...born], s, b };
}

export const RULES = {
  // Recomendada: crece desde la semilla, llena la zona de vida y se queda «hirviendo».
  hervidero: makeRule([5, 6, 7], [5]),
  // Clásica de Carter Bays (4555): elegante pero suele apagarse en pocas generaciones.
  bays: makeRule([4, 5], [5]),
};

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

// Calcula la siguiente generación. `alive` es un Set de claves.
// `bounds` (opcional) limita dónde pueden nacer celdas nuevas.
export function step(alive, rule, bounds = null) {
  const counts = new Map();
  for (const k of alive) {
    for (const d of NEIGHBOR_DELTAS) {
      const nk = k + d;
      counts.set(nk, (counts.get(nk) || 0) + 1);
    }
  }
  const next = new Set();
  for (const [k, n] of counts) {
    if (alive.has(k)) {
      if (rule.s[n]) next.add(k);
    } else if (rule.b[n] && (!bounds || inBounds(k, bounds))) {
      next.add(k);
    }
  }
  // Las celdas vivas sin ninguna vecina no aparecen en `counts`: sobreviven solo si la regla admite 0.
  if (rule.s[0]) for (const k of alive) if (!counts.has(k)) next.add(k);
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
