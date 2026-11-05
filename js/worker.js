// Calcula las generaciones en segundo plano para que la imagen no se trabe.
import { makeRule, step, unkey, key, countNeighbors, stateHash } from './life.js';

let alive = new Set();
let ages = new Map();
let next = new Set();
let rule = makeRule([5, 6, 7], [5]);
let bounds = null;
let gen = 0;
let wantNeighbors = false;

function recomputeNext() {
  next = step(alive, rule, bounds);
}

function snapshot(reason) {
  const n = alive.size;
  const coords = new Int16Array(n * 3);
  const ageArr = new Uint16Array(n);
  const fate = new Uint8Array(n);
  const nbr = new Uint8Array(n);
  let i = 0;
  for (const k of alive) {
    const [x, y, z] = unkey(k);
    coords[i * 3] = x; coords[i * 3 + 1] = y; coords[i * 3 + 2] = z;
    ageArr[i] = Math.min(ages.get(k) || 1, 65535);
    fate[i] = next.has(k) ? 1 : 0;
    if (wantNeighbors) nbr[i] = countNeighbors(alive, x, y, z);
    i++;
  }
  postMessage({ reason, gen, n, coords, ages: ageArr, fate, nbr, hash: stateHash(alive) },
    [coords.buffer, ageArr.buffer, fate.buffer, nbr.buffer]);
}

onmessage = (e) => {
  const m = e.data;
  if (m.rule) {
    const r = m.rule;
    rule = makeRule(r.survive, r.born, { type: r.type, bNeed: r.bNeed, sNeed: r.sNeed });
  }
  if (m.bounds !== undefined) bounds = m.bounds;
  if (m.wantNeighbors !== undefined) wantNeighbors = m.wantNeighbors;

  if (m.type === 'set') {
    // Sustituye el mundo entero (inicio de partida o reinicio).
    alive = new Set(m.cells);
    ages = new Map();
    for (const k of alive) ages.set(k, 1);
    gen = m.gen || 0;
  } else if (m.type === 'edit') {
    for (const c of m.add || []) { const k = key(c[0], c[1], c[2]); alive.add(k); ages.set(k, 1); }
    for (const c of m.remove || []) { const k = key(c[0], c[1], c[2]); alive.delete(k); ages.delete(k); }
  } else if (m.type === 'step') {
    const nextAges = new Map();
    for (const k of next) nextAges.set(k, (ages.get(k) || 0) + 1);
    alive = next;
    ages = nextAges;
    gen++;
  } else if (m.type === 'get') {
    postMessage({ reason: 'cells', id: m.id, cells: [...alive] });
    return;
  }
  recomputeNext();
  snapshot(m.type);
};
