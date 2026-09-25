import * as T from 'three';
import { Rig, canonicalName } from './rig.js';
import { MOTION, MOTIONS, UPPER, gait, mix, emptyPose } from './motions.js';

/**
 * Drives Mira's skeleton every frame.
 *  - Locomotion: idle ↔ walk ↔ run blended by speed on ONE shared phase, advanced by the distance
 *    actually travelled (speed / stride), so feet don't skate and switching gaits never pops.
 *  - Stop: a short braking motion when she halts from a run.
 *  - Actions: one-shot motions (slash, cast, jump, hit, death…) that fade in/out; 'upper' actions
 *    only override the torso and arms so she can attack while running.
 *  - External clips: a keyframed AnimationClip whose name matches a motion id replaces the built-in.
 *  - Events: onStep(side) fires on each foot contact (for footstep sounds and dust).
 */
export class Animator {
  constructor(model) {
    this.rig = new Rig(model);
    this.ok = this.rig.valid;
    this.phase = 0;
    this.speed = 0; this.smoothSpeed = 0;
    this.time = 0;
    this.actions = [];         // {m, t, w, fadeIn, fadeOut, speed}
    this.stopT = -1;
    this.forced = null;        // viewer override: {m, t}
    this.lean = 0;             // turning lean, degrees
    this.clips = {};           // external AnimationClip samplers by motion id
    this.onStep = null;
    this.ground = true;
    this._q = new T.Quaternion();
    this._v = new T.Vector3();
  }

  /** Register keyframed clips (e.g. from a GLB exported with animations). */
  addClips(clips) {
    for (const clip of clips) {
      const id = clip.name.toLowerCase().replace(/^.*\|/, '').replace(/[^a-z]/g, '');
      const tracks = [];
      for (const tr of clip.tracks) {
        const [node, prop] = tr.name.split('.');
        const bone = canonicalName(node);
        if (!this.rig.bones[bone] || (prop !== 'quaternion' && !(prop === 'position' && bone === 'Hips'))) continue;
        tracks.push({ bone, prop, interp: tr.createInterpolant() });
      }
      if (tracks.length) this.clips[id] = { duration: clip.duration, tracks };
    }
    return Object.keys(this.clips);
  }

  play(id, { speed = 1, fadeIn = 0.06, fadeOut = 0.12 } = {}) {
    const m = MOTION[id]; if (!m) return;
    this.actions = this.actions.filter((a) => a.m.layer !== m.layer || a.fading);
    this.actions.push({ m, t: 0, w: 0, fadeIn, fadeOut, speed });
  }
  isPlaying(id) { return this.actions.some((a) => a.m.id === id); }
  clearActions() { this.actions.length = 0; }

  /** Viewer: show one motion on its own, looping. */
  force(id) { this.forced = id ? { m: MOTION[id], t: 0 } : null; this.actions.length = 0; }

  update(dt, { speed = 0, turnRate = 0, timeScale = 1 } = {}) {
    if (!this.ok) return;
    dt *= timeScale;
    this.time += dt;
    const prevSmooth = this.smoothSpeed;
    this.smoothSpeed += (speed - this.smoothSpeed) * Math.min(1, dt * 10);
    const s = this.smoothSpeed;
    this.lean += ((Math.max(-1, Math.min(1, turnRate / 6)) * Math.min(1, s / 4) * 7) - this.lean) * Math.min(1, dt * 6);

    let pose;
    this.extLayers = [];
    if (this.forced) {
      const f = this.forced; f.t += dt;
      const m = f.m, t = m.loop ? f.t % m.duration : Math.min(f.t, m.duration + 0.6);
      if (!m.loop && f.t > m.duration + 0.9) f.t = 0; // replay one-shots in the viewer
      pose = this.sampleMotion(m, Math.min(t, m.duration));
      if (!m.loop && t > m.duration) pose = mix(pose, this.sampleMotion(MOTION.idle, this.time), Math.min(1, (t - m.duration) / 0.3));
      this.ext(m.id, Math.min(t, m.duration) / m.duration, 1);
    } else {
      // --- locomotion on a shared phase
      const walk = MOTION.walk, run = MOTION.run;
      const runK = clamp01((s - walk.speed) / (run.speed - walk.speed));
      const moveK = clamp01(s / 0.9);
      const stride = walk.stride + (run.stride - walk.stride) * runK;
      const prevPhase = this.phase;
      this.phase = (this.phase + (s / stride) * dt) % 1;
      if (moveK > 0.3) this.stepEvents(prevPhase, this.phase);
      const g = gait(this.phase, { run: runK });
      pose = moveK >= 1 ? g : mix(this.sampleMotion(MOTION.idle, this.time), g, smooth(moveK));
      const mk = smooth(moveK);
      this.ext('idle', (this.time % 7.2) / 7.2, 1);
      this.ext('walk', this.phase, mk * (1 - runK));
      this.ext('run', this.phase, mk * runK);

      // --- stop: triggered when a run collapses to standing
      if (prevSmooth > 4.2 && speed < 0.3 && this.stopT < 0) this.stopT = 0;
      if (this.stopT >= 0) {
        if (speed > 1.5) this.stopT = -1;
        else {
          this.stopT += dt;
          const st = MOTION.stop, k = this.stopT < 0.08 ? this.stopT / 0.08 : 1;
          pose = mix(pose, this.sampleMotion(st, Math.min(this.stopT, st.duration)), smooth(k));
          if (this.stopT > st.duration) this.stopT = -1;
        }
      }
      // turning lean
      if (Math.abs(this.lean) > 0.05) { add(pose, 'Hips', 0, 0, -this.lean); add(pose, 'Spine', 0, 0, this.lean * 0.4); }
    }

    // --- one-shot actions
    for (let i = this.actions.length - 1; i >= 0; i--) {
      const a = this.actions[i];
      a.t += dt * a.speed;
      const d = a.m.duration;
      if (a.m.hold) a.w = Math.min(1, a.t / a.fadeIn);
      else a.w = Math.min(1, a.t / a.fadeIn, Math.max(0, (d - a.t) / a.fadeOut));
      const ap = this.sampleMotion(a.m, Math.min(a.t, d));
      if (a.m.layer === 'upper') {
        for (const b of UPPER) if (ap.bones[b]) pose.bones[b] = lerp3(pose.bones[b], ap.bones[b], a.w);
        pose.fingers.Right = lerpN(pose.fingers.Right, ap.fingers.Right, a.w);
        pose.fingers.Left = lerpN(pose.fingers.Left, ap.fingers.Left, a.w);
        // let the hips follow a little so the twist reads through the whole body
        if (ap.bones.Spine) pose.bones.Spine = lerp3(pose.bones.Spine, ap.bones.Spine, a.w * 0.8);
      } else pose = mix(pose, ap, a.w);
      this.ext(a.m.id, Math.min(a.t, d) / d, a.w, a.m.layer === 'upper');
      if (!a.m.hold && a.t >= d) this.actions.splice(i, 1);
    }

    this.apply(pose);
  }

  sampleMotion(m, t) { return m.sample(t); }

  /** Queue a keyframed clip (if one was loaded for this motion) to override the built-in. */
  ext(id, t01, w, upper = false) {
    const c = this.clips[id];
    if (c && w > 0.001) this.extLayers.push({ c, t: t01 * c.duration, w, upper });
  }

  stepEvents(a, b) {
    if (!this.onStep) return;
    const crossed = (x) => (a < x && b >= x) || (a > b && (x > a || x <= b));
    if (crossed(0.25)) this.onStep('Left');
    if (crossed(0.75)) this.onStep('Right');
  }

  apply(pose) {
    const r = this.rig;
    for (const name in r.bones) {
      const bone = r.bones[name];
      if (name === 'Hips') { r.hipsLocal(pose.hips, bone.position); }
      r.localFor(name, pose.bones[name], bone.quaternion);
    }
    r.curlFingers('Left', pose.fingers.Left);
    r.curlFingers('Right', pose.fingers.Right);
    for (const L of this.extLayers || []) this.applyClip(L);
    if (this.ground) this.snapToGround(pose.air);
  }

  /** Keep the lowest sole on the floor (or let it rise when the motion is airborne). */
  snapToGround(air) {
    const r = this.rig, root = r.root;
    root.updateMatrixWorld(true);
    if (!this._feet) {
      // bind heights of the ankle/toe joints above the soles
      this._feet = ['LeftFoot', 'LeftToeBase', 'RightFoot', 'RightToeBase'].filter((n) => r.bones[n]).map((n) => ({ n, h: r.bindY[n] }));
    }
    const inv = this._inv || (this._inv = new T.Matrix4());
    inv.copy(root.matrixWorld).invert();
    let clear = Infinity;
    for (const f of this._feet) {
      const y = this._v.setFromMatrixPosition(r.bones[f.n].matrixWorld).applyMatrix4(inv).y;
      clear = Math.min(clear, y - f.h);
    }
    if (!isFinite(clear) || (air && clear > 0)) return;
    const shift = -clear / r.hipHeight;
    r.hipsLocal({ x: 0, y: shift, z: 0 }, this._v2 || (this._v2 = new T.Vector3()));
    r.bones.Hips.position.add(this._v2.sub(r.bind.Hips.pos));
    r.bones.Hips.updateMatrixWorld(true);
  }

  applyClip({ c, t, w, upper }) {
    for (const tr of c.tracks) {
      if (upper && !UPPER.has(tr.bone)) continue;
      const v = tr.interp.evaluate(t);
      const bone = this.rig.bones[tr.bone];
      if (tr.prop === 'quaternion') bone.quaternion.slerp(this._q.fromArray(v), w);
      else bone.position.lerp(this._v.fromArray(v), w);
    }
  }

  get motions() { return MOTIONS; }
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerpN = (a, b, t) => a + (b - a) * t;
function lerp3(a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 }, t) { return { x: lerpN(a.x, b.x, t), y: lerpN(a.y, b.y, t), z: lerpN(a.z, b.z, t) }; }
function add(p, bone, x, y, z) { const b = p.bones[bone] || (p.bones[bone] = { x: 0, y: 0, z: 0 }); b.x += x; b.y += y; b.z += z; }
