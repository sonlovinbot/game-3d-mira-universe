/**
 * Mira's motion library.
 *
 * Each motion is a function of time that returns a pose in character space (see rig.js for the
 * sign conventions). They are sampled every frame, so walk and run can share one phase, stride
 * length can follow the real movement speed, and any motion can be layered on the upper body.
 *
 * To add a motion: push an entry to MOTIONS. It shows up in the in-game "Chuyển động" viewer
 * automatically. A keyframed clip from a GLB with the same name (public/anims/) replaces it.
 */

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const lerp = (a, b, t) => a + (b - a) * t;
/** Smooth periodic bump centred on c (0..1 phase), width w. */
const bump = (p, c, w) => { let d = Math.abs(((p - c + 1.5) % 1) - 0.5); return d > w ? 0 : 0.5 + 0.5 * Math.cos((d / w) * Math.PI); };

export function emptyPose() { return { bones: {}, hips: { x: 0, y: 0, z: 0 }, fingers: { Left: 0.25, Right: 0.25 } }; }

function set(p, bone, x = 0, y = 0, z = 0) {
  const b = p.bones[bone] || (p.bones[bone] = { x: 0, y: 0, z: 0 });
  b.x += x; b.y += y; b.z += z;
  return p;
}

/** Relaxed stance shared by everything: arms down from the A-pose, soft elbows and knees. */
function stance(p, k = 1) {
  set(p, 'LeftArm', -6 * k, 0, -24 * k);
  set(p, 'RightArm', -6 * k, 0, 24 * k);
  set(p, 'LeftForeArm', -14 * k, 0, 0);
  set(p, 'RightForeArm', -14 * k, 0, 0);
  set(p, 'LeftHand', 0, 0, -6 * k); set(p, 'RightHand', 0, 0, 6 * k);
  set(p, 'LeftLeg', 3 * k); set(p, 'RightLeg', 3 * k);
  set(p, 'LeftFoot', -3 * k); set(p, 'RightFoot', -3 * k);
  // The model was built in a wide A-pose; bring the legs in so the feet sit under the hips.
  set(p, 'LeftUpLeg', 0, 0, -LEG_IN); set(p, 'RightUpLeg', 0, 0, LEG_IN);
  set(p, 'LeftFoot', 0, 0, LEG_IN); set(p, 'RightFoot', 0, 0, -LEG_IN);
  return p;
}
const LEG_IN = 5;

/* ---------------------------------------------------------------- idle */
function idle(t) {
  const p = stance(emptyPose());
  const br = Math.sin(t * TAU / 3.6);            // breath
  const sway = Math.sin(t * TAU / 7.2);           // weight shift
  set(p, 'Spine1', 1.2 * br); set(p, 'Spine2', 1.4 * br);
  set(p, 'LeftShoulder', 0, 0, -1.2 * br); set(p, 'RightShoulder', 0, 0, 1.2 * br);
  set(p, 'Hips', 0, 2 * sway, 1.6 * sway);
  set(p, 'Spine', 0, -1.5 * sway, -1.2 * sway);
  set(p, 'LeftUpLeg', 0, 0, -1.6 * sway); set(p, 'RightUpLeg', 0, 0, -1.6 * sway);
  set(p, 'LeftLeg', 2 + 2 * Math.max(0, -sway)); set(p, 'RightLeg', 2 + 2 * Math.max(0, sway));
  set(p, 'Head', -1.5 * br + 2, 5 * Math.sin(t * TAU / 7.2 + 1), 1.5 * Math.sin(t * TAU / 3.6 + 0.5));
  set(p, 'LeftArm', 1.5 * br, 0, -1.5 * br); set(p, 'RightArm', 1.5 * br, 0, 1.5 * br);
  p.hips.x = 0.012 * sway; p.hips.y = -0.004 + 0.003 * br;
  return p;
}

/* -------------------------------------------------------- walk / run */
/** One gait generator, parameterised so walk and run can blend on a shared phase. */
function gait(phase, g) {
  const p = stance(emptyPose(), 1 - g.run * 0.3);
  const s = Math.sin(phase * TAU), c = Math.cos(phase * TAU);
  const A = lerp(26, 44, g.run);                    // thigh swing
  // thighs: left forward when s > 0
  const thL = -A * s - g.run * 6, thR = A * s - g.run * 6;
  // narrower track while moving: each foot lands close to the centre line
  const track = lerp(3, 4, g.run);
  set(p, 'LeftUpLeg', thL, 0, -track); set(p, 'RightUpLeg', thR, 0, track);
  set(p, 'LeftFoot', 0, 0, track); set(p, 'RightFoot', 0, 0, -track);
  // knees bend through the swing phase, a little at contact
  const kneeSwing = lerp(48, 95, g.run), kneeLoad = lerp(8, 22, g.run);
  const kL = kneeLoad * bump(phase, 0.3, 0.18) + kneeSwing * Math.pow(Math.max(0, c), 1.4) + 4;
  const kR = kneeLoad * bump(phase, 0.8, 0.18) + kneeSwing * Math.pow(Math.max(0, -c), 1.4) + 4;
  set(p, 'LeftLeg', kL); set(p, 'RightLeg', kR);
  // feet stay roughly level, heel strike, toe-off
  const toeOffL = lerp(18, 30, g.run) * bump(phase, 0.9, 0.12), toeOffR = lerp(18, 30, g.run) * bump(phase, 0.4, 0.12);
  const heelL = -10 * bump(phase, 0.25, 0.08), heelR = -10 * bump(phase, 0.75, 0.08);
  set(p, 'LeftFoot', -(thL + kL) * 0.8 + toeOffL + heelL);
  set(p, 'RightFoot', -(thR + kR) * 0.8 + toeOffR + heelR);
  set(p, 'LeftToeBase', -toeOffL * 0.6); set(p, 'RightToeBase', -toeOffR * 0.6);
  // pelvis: twist with the stride, drop on the swing side
  set(p, 'Hips', lerp(0, 5, g.run), -lerp(6, 9, g.run) * s, lerp(3, 4, g.run) * c);
  // torso counter-rotates, leans into a run
  set(p, 'Spine', lerp(2, 6, g.run), lerp(3, 5, g.run) * s, -1.5 * c);
  set(p, 'Spine1', lerp(1, 5, g.run), lerp(2, 4, g.run) * s, 0);
  set(p, 'Spine2', lerp(0, 3, g.run), lerp(2, 5, g.run) * s, 0);
  set(p, 'Neck', -lerp(1, 6, g.run), -lerp(2, 5, g.run) * s, 0);
  set(p, 'Head', -lerp(1, 5, g.run), -lerp(2, 4, g.run) * s, 1.5 * c);
  // arms swing opposite to legs, elbows bend more when running
  const AA = lerp(20, 40, g.run);
  set(p, 'LeftArm', AA * s + g.run * 6, -g.run * 6, lerp(0, 6, g.run));
  set(p, 'RightArm', -AA * s + g.run * 6, g.run * 6, -lerp(0, 6, g.run));
  const elbow = lerp(12, 62, g.run);
  set(p, 'LeftForeArm', -elbow - lerp(10, 20, g.run) * Math.max(0, -s), 0, 0);
  set(p, 'RightForeArm', -elbow - lerp(10, 20, g.run) * Math.max(0, s), 0, 0);
  p.fingers.Left = p.fingers.Right = lerp(0.3, 0.75, g.run);
  // bounce: walking peaks mid-stance, running dips mid-stance and floats between steps
  const b2 = Math.cos(phase * TAU * 2);
  p.hips.y = lerp(0.018 * b2 - 0.012, -0.045 * b2 - 0.05, g.run);
  p.hips.x = lerp(0.012, 0.006, g.run) * c;
  p.hips.z = lerp(0, 0.02, g.run);
  p.air = g.run > 0.5;
  return p;
}

/* ---------------------------------------------------- keyframed one-shots */
/** Build a motion from key poses: [[time, (p) => {...}], ...] eased with smoothstep. */
function keyed(keys) {
  return (t) => {
    let i = 0;
    while (i < keys.length - 1 && t > keys[i + 1][0]) i++;
    const [t0, f0] = keys[i], [t1, f1] = keys[Math.min(i + 1, keys.length - 1)];
    const k = t1 > t0 ? smooth((t - t0) / (t1 - t0)) : 0;
    return mix(f0(stance(emptyPose())), f1(stance(emptyPose())), k);
  };
}

export function mix(a, b, k) {
  const out = emptyPose();
  const names = new Set([...Object.keys(a.bones), ...Object.keys(b.bones)]);
  for (const n of names) {
    const x = a.bones[n] || ZERO, y = b.bones[n] || ZERO;
    out.bones[n] = { x: lerp(x.x, y.x, k), y: lerp(x.y, y.y, k), z: lerp(x.z, y.z, k) };
  }
  for (const ax of ['x', 'y', 'z']) out.hips[ax] = lerp(a.hips[ax], b.hips[ax], k);
  out.fingers.Left = lerp(a.fingers.Left, b.fingers.Left, k);
  out.fingers.Right = lerp(a.fingers.Right, b.fingers.Right, k);
  out.air = (a.air && k < 0.7) || (b.air && k > 0.3);
  return out;
}
const ZERO = { x: 0, y: 0, z: 0 };

const slash = keyed([
  [0, (p) => p],
  [0.13, (p) => { // wind-up: twist right, sword hand high and back
    set(p, 'Spine', 2, -14, 0); set(p, 'Spine1', 2, -12, 0); set(p, 'Spine2', 0, -10, 0);
    set(p, 'RightArm', 30, -10, -70); set(p, 'RightForeArm', -55, 0, 0);
    set(p, 'LeftArm', -30, 0, -8); set(p, 'LeftForeArm', -30);
    set(p, 'Head', 0, 8, 0); set(p, 'Hips', 0, -6, 0);
    set(p, 'LeftUpLeg', -8); set(p, 'RightUpLeg', 6); set(p, 'LeftLeg', 8); set(p, 'RightLeg', 6);
    p.fingers.Right = 0.9; p.hips.y = -0.03; return p; }],
  [0.26, (p) => { // strike: unwind across the body
    set(p, 'Spine', 6, 16, 0); set(p, 'Spine1', 4, 14, 0); set(p, 'Spine2', 2, 12, 0);
    set(p, 'RightArm', -75, 40, -10); set(p, 'RightForeArm', -8, 0, 0);
    set(p, 'LeftArm', 20, 0, -10); set(p, 'LeftForeArm', -40);
    set(p, 'Head', 4, -8, 0); set(p, 'Hips', 2, 8, 0);
    set(p, 'LeftUpLeg', -14); set(p, 'RightUpLeg', 10); set(p, 'LeftLeg', 14); set(p, 'RightLeg', 4);
    p.fingers.Right = 0.9; p.hips.y = -0.05; p.hips.z = 0.03; return p; }],
  [0.5, (p) => p],
]);

const cast = keyed([
  [0, (p) => p],
  [0.1, (p) => { // gather energy at the chest
    set(p, 'Spine', -3); set(p, 'Spine2', -4);
    set(p, 'LeftArm', -30, 0, 6); set(p, 'RightArm', -30, 0, -6);
    set(p, 'LeftForeArm', -70); set(p, 'RightForeArm', -70); p.fingers.Left = p.fingers.Right = 0.6; return p; }],
  [0.2, (p) => { // thrust both palms forward
    set(p, 'Spine', 5); set(p, 'Spine1', 4); set(p, 'Spine2', 3); set(p, 'Head', -4);
    set(p, 'LeftArm', -72, -18, 10); set(p, 'RightArm', -72, 18, -10);
    set(p, 'LeftForeArm', -6); set(p, 'RightForeArm', -6);
    set(p, 'LeftHand', -20); set(p, 'RightHand', -20);
    set(p, 'LeftUpLeg', -10); set(p, 'LeftLeg', 10); set(p, 'RightUpLeg', 8);
    p.fingers.Left = p.fingers.Right = 0; p.hips.z = 0.02; return p; }],
  [0.44, (p) => p],
]);

const jump = keyed([
  [0, (p) => p],
  [0.14, (p) => { // crouch
    set(p, 'Hips', 12); set(p, 'Spine', 10); set(p, 'Spine1', 6); set(p, 'Head', -10);
    set(p, 'LeftUpLeg', -42); set(p, 'RightUpLeg', -42); set(p, 'LeftLeg', 70); set(p, 'RightLeg', 70);
    set(p, 'LeftFoot', -26); set(p, 'RightFoot', -26);
    set(p, 'LeftArm', 30); set(p, 'RightArm', 30); p.hips.y = -0.22; return p; }],
  [0.3, (p) => { // launch, arms flung up
    set(p, 'Spine', -4); set(p, 'Head', 4);
    set(p, 'LeftArm', -35, 0, 100); set(p, 'RightArm', -35, 0, -100);
    set(p, 'LeftForeArm', -10); set(p, 'RightForeArm', -10);
    set(p, 'LeftUpLeg', -10); set(p, 'RightUpLeg', -18); set(p, 'LeftLeg', 30); set(p, 'RightLeg', 45);
    set(p, 'LeftFoot', 25); set(p, 'RightFoot', 25); p.fingers.Left = p.fingers.Right = 0; p.air = true; return p; }],
  [0.42, (p) => { // land
    set(p, 'Hips', 8); set(p, 'Spine', 8);
    set(p, 'LeftUpLeg', -34); set(p, 'RightUpLeg', -34); set(p, 'LeftLeg', 58); set(p, 'RightLeg', 58);
    set(p, 'LeftFoot', -22); set(p, 'RightFoot', -22);
    set(p, 'LeftArm', -10, 0, 30); set(p, 'RightArm', -10, 0, -30); p.hips.y = -0.17; return p; }],
  [0.6, (p) => p],
]);

const hit = keyed([
  [0, (p) => p],
  [0.08, (p) => {
    set(p, 'Spine', -10, 0, 4); set(p, 'Spine1', -8); set(p, 'Spine2', -6); set(p, 'Head', -16, 8, 6);
    set(p, 'LeftArm', 18, 0, 20); set(p, 'RightArm', 18, 0, -20); set(p, 'LeftForeArm', -35); set(p, 'RightForeArm', -35);
    set(p, 'LeftUpLeg', 10); set(p, 'LeftLeg', 14); p.hips.z = -0.04; p.hips.y = -0.03; return p; }],
  [0.34, (p) => p],
]);

const death = keyed([
  [0, (p) => p],
  [0.25, (p) => {
    set(p, 'Spine', -12); set(p, 'Head', -20, 12, 0);
    set(p, 'LeftArm', 20, 0, 34); set(p, 'RightArm', 20, 0, -34);
    set(p, 'LeftUpLeg', -20); set(p, 'RightUpLeg', -30); set(p, 'LeftLeg', 45); set(p, 'RightLeg', 60);
    p.hips.y = -0.18; return p; }],
  [0.8, (p) => {
    set(p, 'Spine', -18); set(p, 'Spine1', -8); set(p, 'Head', -12, 25, 0);
    set(p, 'LeftArm', 10, 0, 55); set(p, 'RightArm', 10, 0, -50); set(p, 'LeftForeArm', -20); set(p, 'RightForeArm', -30);
    set(p, 'LeftUpLeg', -40); set(p, 'RightUpLeg', -20); set(p, 'LeftLeg', 70); set(p, 'RightLeg', 30);
    p.fingers.Left = p.fingers.Right = 0.5; p.hips.y = -0.3; return p; }],
  [1.2, (p) => {
    set(p, 'Spine', -18); set(p, 'Spine1', -8); set(p, 'Head', -12, 25, 0);
    set(p, 'LeftArm', 10, 0, 55); set(p, 'RightArm', 10, 0, -50); set(p, 'LeftForeArm', -20); set(p, 'RightForeArm', -30);
    set(p, 'LeftUpLeg', -40); set(p, 'RightUpLeg', -20); set(p, 'LeftLeg', 70); set(p, 'RightLeg', 30);
    p.fingers.Left = p.fingers.Right = 0.5; p.hips.y = -0.3; return p; }],
]);

const stop = (t) => {
  // brake with the left foot planted ahead, torso rocks back, then settles into idle
  const brake = gait(0.27, { run: 0.7 });
  set(brake, 'Spine', -12); set(brake, 'Spine1', -6); set(brake, 'Head', 6);
  set(brake, 'LeftArm', -26, 0, 12); set(brake, 'RightArm', -18, 0, -12);
  brake.hips.y -= 0.06;
  if (t < 0.12) return mix(gait(0.2, { run: 0.8 }), brake, smooth(t / 0.12));
  const settle = idle(0);
  const k = easeOut((t - 0.12) / 0.4);
  const over = Math.sin(clamp01((t - 0.12) / 0.4) * Math.PI) * 4; // small forward rebound
  const p = mix(brake, settle, k);
  set(p, 'Spine', over); set(p, 'Spine1', over * 0.6);
  return p;
};

const dash = (t) => {
  const p = gait(0.1 + t * 0.9, { run: 1 });
  set(p, 'Spine', 14); set(p, 'Spine1', 8); set(p, 'Head', -12);
  set(p, 'LeftArm', 40, 0, 20); set(p, 'RightArm', 40, 0, -20);
  set(p, 'LeftForeArm', 30); set(p, 'RightForeArm', 30);
  p.fingers.Left = p.fingers.Right = 0.1;
  return p;
};

const cheer = (t) => {
  const p = idle(t);
  const w = Math.sin(t * TAU * 1.25);
  set(p, 'RightArm', -40, 0, -110 + 8 * w); set(p, 'RightForeArm', -20 - 25 * w, 0, 0);
  set(p, 'LeftArm', 0, 0, 8); set(p, 'LeftForeArm', -40);
  set(p, 'Head', -6, -8, -4); set(p, 'Spine2', -3, -4, -4);
  p.fingers.Right = 0; p.hips.y += 0.02 * Math.abs(Math.sin(t * TAU * 1.25));
  return p;
};

/* ------------------------------------------------------------ registry */
export const MOTIONS = [
  { id: 'idle', label: 'Đứng thở', group: 'Di chuyển', loop: true, duration: 7.2, layer: 'full', sample: idle },
  { id: 'walk', label: 'Đi bộ', group: 'Di chuyển', loop: true, duration: 1.1, layer: 'full', sample: (t) => gait((t / 1.1) % 1, { run: 0 }), speed: 2.4, stride: 2.6 },
  { id: 'run', label: 'Chạy', group: 'Di chuyển', loop: true, duration: 0.72, layer: 'full', sample: (t) => gait((t / 0.72) % 1, { run: 1 }), speed: 6.2, stride: 4.5 },
  { id: 'stop', label: 'Dừng lại', group: 'Di chuyển', loop: false, duration: 0.55, layer: 'full', sample: stop },
  { id: 'slash', label: 'Chém Nguyệt Quang', group: 'Chiêu thức', loop: false, duration: 0.5, layer: 'upper', sample: slash },
  { id: 'cast', label: 'Tia Linh Quang', group: 'Chiêu thức', loop: false, duration: 0.44, layer: 'upper', sample: cast },
  { id: 'jump', label: 'Vòng Tinh Tú (nhảy)', group: 'Chiêu thức', loop: false, duration: 0.6, layer: 'full', sample: jump },
  { id: 'dash', label: 'Lướt Gió', group: 'Chiêu thức', loop: false, duration: 0.24, layer: 'full', sample: dash },
  { id: 'hit', label: 'Trúng đòn', group: 'Phản ứng', loop: false, duration: 0.34, layer: 'upper', sample: hit },
  { id: 'death', label: 'Gục ngã', group: 'Phản ứng', loop: false, duration: 1.2, layer: 'full', sample: death, hold: true },
  { id: 'cheer', label: 'Vẫy chào', group: 'Khác', loop: true, duration: 7.2, layer: 'full', sample: cheer },
];
export const MOTION = Object.fromEntries(MOTIONS.map((m) => [m.id, m]));
export { gait };

/** Bones driven by an upper-body layer (legs keep walking underneath). */
export const UPPER = new Set(['Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand']);
