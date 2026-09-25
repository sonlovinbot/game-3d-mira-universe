import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTIONS, gait, mix } from '../src/anim/motions.js';

const finitePose = (p) => Object.values(p.bones).every((b) => [b.x, b.y, b.z].every(Number.isFinite)) && ['x', 'y', 'z'].every((k) => Number.isFinite(p.hips[k]));

test('every motion samples finite poses across its duration', () => {
  for (const m of MOTIONS) {
    for (let i = 0; i <= 20; i++) assert.ok(finitePose(m.sample((m.duration * i) / 20)), m.id);
  }
});

test('looping motions start and end on the same pose', () => {
  for (const m of MOTIONS.filter((x) => x.loop)) {
    const a = m.sample(0), b = m.sample(m.duration - 1e-6);
    for (const [bone, r] of Object.entries(a.bones)) {
      const q = b.bones[bone];
      assert.ok(Math.abs(r.x - q.x) < 1.5 && Math.abs(r.y - q.y) < 1.5 && Math.abs(r.z - q.z) < 1.5, `${m.id}.${bone}`);
    }
  }
});

test('gait legs alternate: half a cycle later the legs swap', () => {
  const a = gait(0.25, { run: 0 }), b = gait(0.75, { run: 0 });
  assert.ok(a.bones.LeftUpLeg.x < 0 && a.bones.RightUpLeg.x > 0, 'left leg forward at 0.25');
  assert.ok(b.bones.LeftUpLeg.x > 0 && b.bones.RightUpLeg.x < 0, 'right leg forward at 0.75');
});

test('mix blends halfway', () => {
  const a = gait(0.25, { run: 0 }), b = gait(0.25, { run: 1 });
  const m = mix(a, b, 0.5);
  assert.ok(Math.abs(m.bones.LeftUpLeg.x - (a.bones.LeftUpLeg.x + b.bones.LeftUpLeg.x) / 2) < 1e-9);
});
