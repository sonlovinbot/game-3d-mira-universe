import * as T from 'three';

/**
 * Humanoid rig wrapper for a Mixamo-named skeleton (what Tripo's "Mixamo" preset exports).
 *
 * Every pose in this project is written in CHARACTER SPACE: +Z = forward, +Y = up, +X = the
 * character's left. A rotation {x, y, z} (degrees) on a bone is applied about those axes on top of
 * the bind pose, and children inherit it — like posing a figurine by hand.
 *   legs/arms (pointing down):  x < 0 swings forward, x > 0 swings back
 *   spine/neck/head (up):        x > 0 leans forward
 *   knees (Leg):                 x > 0 bends
 *   feet:                        x > 0 points toes down
 *   any bone:                    y > 0 turns to her left, z > 0 tilts to her right
 *   arms:                        LeftArm z < 0 / RightArm z > 0 lowers the arm toward the body
 */
export const BONES = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
];

const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

export function canonicalName(name) {
  return name.replace(/^mixamorig\d*[:_]?/i, '').replace(/^.*[:|]/, '');
}

export class Rig {
  constructor(root) {
    this.root = root;
    this.bones = {};
    this.fingers = { Left: [], Right: [] };
    root.traverse((o) => {
      if (!o.isBone) return;
      const n = canonicalName(o.name);
      if (BONES.includes(n)) this.bones[n] = o;
      const f = n.match(/^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)(\d)$/);
      if (f && f[3] !== '4') this.fingers[f[1]].push({ bone: o, thumb: f[2] === 'Thumb', joint: +f[3] });
    });
    this.valid = ['Hips', 'Spine', 'Head', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg'].every((b) => this.bones[b]);
    if (!this.valid) return;

    root.updateMatrixWorld(true);
    const rootQ = root.getWorldQuaternion(new T.Quaternion()).invert();
    const rootS = root.getWorldScale(new T.Vector3());
    this.bind = {};
    const all = [...Object.entries(this.bones), ...['Left', 'Right'].flatMap((s) => this.fingers[s].map((f) => [f.bone.name, f.bone]))];
    for (const [name, b] of all) {
      const world = rootQ.clone().multiply(b.getWorldQuaternion(new T.Quaternion()));
      this.bind[name] = { local: b.quaternion.clone(), world, worldInv: world.clone().invert(), pos: b.position.clone() };
    }
    // Heights of the foot joints above the floor at bind (in the root's local units).
    const rootInv = new T.Matrix4().copy(root.matrixWorld).invert();
    this.bindY = {};
    for (const n of ['LeftFoot', 'LeftToeBase', 'RightFoot', 'RightToeBase']) if (this.bones[n]) this.bindY[n] = this.bones[n].getWorldPosition(new T.Vector3()).applyMatrix4(rootInv).y;
    // Height of the hips above the feet in the rig's own units, used to scale hip offsets.
    const hipsW = this.bones.Hips.getWorldPosition(new T.Vector3());
    const footW = this.bones.LeftFoot.getWorldPosition(new T.Vector3());
    this.hipHeight = hipsW.clone().applyMatrix4(rootInv).y - footW.clone().applyMatrix4(rootInv).y;
    // Hip offsets are given in character space; convert through the hips' parent.
    const parent = this.bones.Hips.parent;
    const pq = rootQ.clone().multiply(parent.getWorldQuaternion(new T.Quaternion()));
    const ps = parent.getWorldScale(new T.Vector3()).divide(rootS);
    this.hipsParentInv = { q: pq.invert(), s: ps };
    this._q = new T.Quaternion(); this._e = new T.Euler(0, 0, 0, 'YXZ'); this._v = new T.Vector3();
  }

  /** Local quaternion for a bone given a character-space rotation in degrees. */
  localFor(name, rot, out = new T.Quaternion()) {
    const b = this.bind[name];
    if (!rot) return out.copy(b.local);
    const d = Math.PI / 180;
    this._e.set((rot.x || 0) * d, (rot.y || 0) * d, (rot.z || 0) * d, 'YXZ');
    this._q.setFromEuler(this._e);
    // local' = local * world⁻¹ * R * world
    return out.copy(b.worldInv).multiply(this._q).multiply(b.world).premultiply(b.local);
  }

  /** Hip translation (fractions of hip height, character space) → local position. */
  hipsLocal(off, out = new T.Vector3()) {
    const b = this.bind.Hips;
    if (!off) return out.copy(b.pos);
    const h = this.hipHeight;
    this._v.set((off.x || 0) * h, (off.y || 0) * h, (off.z || 0) * h).applyQuaternion(this.hipsParentInv.q).divide(this.hipsParentInv.s);
    return out.copy(b.pos).add(this._v);
  }

  /** Curl every finger by `amount` (0 open … 1 fist). */
  curlFingers(side, amount, spread = 0) {
    const sign = side === 'Left' ? 1 : -1;
    for (const f of this.fingers[side]) {
      const a = amount * (f.thumb ? 25 : 55 + f.joint * 12);
      // fingers point outward/down along the arm; curl about the forward axis toward the palm
      this.localFor(f.bone.name, f.thumb ? { y: sign * a * 0.6 } : { z: -sign * a, y: sign * spread }, f.bone.quaternion);
    }
  }
}
