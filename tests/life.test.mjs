import test from 'node:test';
import assert from 'node:assert/strict';
import { key, unkey, step, makeRule, RULES, countNeighbors, randomSoup, rng, inBounds, NEIGHBOR_COUNT } from '../js/life.js';

test('key y unkey son inversas, también con negativos', () => {
  for (const c of [[0, 0, 0], [-1, 2, -3], [500, -700, 65535], [-65536, 0, 12]]) {
    assert.deepEqual(unkey(key(...c)), c);
  }
});

test('hay 26 vecinas', () => {
  assert.equal(NEIGHBOR_COUNT, 26);
  const all = new Set();
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) all.add(key(x, y, z));
  all.delete(key(0, 0, 0));
  assert.equal(countNeighbors(all, 0, 0, 0), 26);
});

test('nace una celda con exactamente 5 vecinas (regla hervidero)', () => {
  const alive = new Set([key(1, 0, 0), key(-1, 0, 0), key(0, 1, 0), key(0, -1, 0), key(0, 0, 1)]);
  const next = step(alive, RULES.hervidero);
  assert.ok(next.has(key(0, 0, 0)));
});

test('no nace con 4 vecinas y una celda aislada muere', () => {
  const alive = new Set([key(1, 0, 0), key(-1, 0, 0), key(0, 1, 0), key(0, -1, 0), key(10, 10, 10)]);
  const next = step(alive, RULES.hervidero);
  assert.ok(!next.has(key(0, 0, 0)));
  assert.ok(!next.has(key(10, 10, 10)));
});

test('supervivencia según la regla', () => {
  const r = makeRule([5, 6, 7], [5]);
  const ring = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[1,1,0],[1,1,1]];
  for (let n = 0; n <= 8; n++) {
    const alive = new Set([key(0, 0, 0), ...ring.slice(0, n).map((c) => key(...c))]);
    assert.equal(step(alive, r).has(key(0, 0, 0)), [5, 6, 7].includes(n), `con ${n} vecinas`);
  }
});

test('los límites impiden nacimientos fuera de la zona', () => {
  const b = { minX: -1, maxX: 1, minY: 0, maxY: 5, minZ: -1, maxZ: 1 };
  assert.ok(inBounds(key(0, 0, 0), b));
  assert.ok(!inBounds(key(0, -1, 0), b));
  const alive = new Set([key(1, -1, 0), key(-1, -1, 0), key(0, -2, 0), key(0, -1, 1), key(0, -1, -1)]);
  assert.ok(!step(alive, RULES.hervidero, b).has(key(0, -1, 0)));
  assert.ok(step(alive, RULES.hervidero).has(key(0, -1, 0)));
});

test('la regla hervidero no se apaga ni se desborda dentro de la zona', () => {
  const b = { minX: -20, maxX: 20, minY: 0, maxY: 29, minZ: -20, maxZ: 20 };
  let a = randomSoup({ cy: 8, size: 12, density: 0.3, random: rng(7) });
  for (let g = 0; g < 120; g++) a = step(a, RULES.hervidero, b);
  assert.ok(a.size > 2000, `vivas: ${a.size}`);
  assert.ok(a.size <= 41 * 41 * 30);
});
