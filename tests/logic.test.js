import test from 'node:test';
import assert from 'node:assert/strict';
import {
  moveVector, resolveCollisions, inArc, buildSpawnQueue, waveTotal, WAVES, OBSTACLES, ARENA_R,
  Cooldowns, SKILLS, mulberry32, damageRoll,
} from '../src/logic.js';

test('diagonal movement is not faster than straight', () => {
  const d = moveVector(1, 1), s = moveVector(1, 0);
  assert.ok(Math.abs(Math.hypot(d.x, d.z) - Math.hypot(s.x, s.z)) < 1e-9);
  const analog = moveVector(0.3, 0);
  assert.equal(analog.len, 0.3);
});

test('player is pushed out of pillars and kept inside arena', () => {
  const o = OBSTACLES[0];
  const p = resolveCollisions({ x: o.x + 0.1, z: o.z }, 0.4);
  assert.ok(Math.hypot(p.x - o.x, p.z - o.z) >= o.r + 0.4 - 1e-9);
  const q = resolveCollisions({ x: 50, z: 0 }, 0.4);
  assert.ok(Math.hypot(q.x, q.z) <= ARENA_R - 0.4 + 1e-9);
});

test('arc hit test respects facing and range', () => {
  assert.equal(inArc(0, 0, 0, 0, 2, 2.7, 2.3), true);      // straight ahead (+z)
  assert.equal(inArc(0, 0, 0, 0, -2, 2.7, 2.3), false);    // behind
  assert.equal(inArc(0, 0, 0, 0, 5, 2.7, 2.3), false);     // too far
  assert.equal(inArc(0, 0, Math.PI / 2, 2, 0, 2.7, 2.3), true); // facing +x
});

test('spawn queues match wave config, boss first, difficulty rises', () => {
  const rand = mulberry32(7);
  for (let i = 0; i < WAVES.length; i++) {
    const q = buildSpawnQueue(i, rand);
    assert.equal(q.length, waveTotal(i));
    if (WAVES[i].boss) assert.equal(q[0], 'boss');
  }
  for (let i = 1; i < WAVES.length - 1; i++) {
    assert.ok(waveTotal(i) > waveTotal(i - 1), 'more enemies each wave');
    assert.ok(WAVES[i].hpMul >= WAVES[i - 1].hpMul);
  }
});

test('cooldowns gate skills', () => {
  const c = new Cooldowns(SKILLS);
  assert.ok(c.ready('nova'));
  c.trigger('nova');
  assert.ok(!c.ready('nova'));
  c.tick(SKILLS.nova.cd + 0.01);
  assert.ok(c.ready('nova'));
});

test('damage roll stays in a sane band', () => {
  const rand = mulberry32(3);
  for (let i = 0; i < 200; i++) {
    const r = damageRoll(20, 1, rand);
    assert.ok(r.amount >= 18 && r.amount <= 40);
  }
});
