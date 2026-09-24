import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PLAYER_R } from './logic.js';
import { lerpAngle } from './enemies.js';

export const MIRA_HEIGHT = 1.95;

/**
 * Mira's GLB has no skeleton or clips, so she is animated as a whole figure:
 * hop/lean while running, twist on slash, jump on nova, stretch on dash.
 * If a rigged GLB with clips (idle/run/attack…) is dropped in later, those clips are used instead.
 */
export class Player {
  constructor(scene) {
    this.scene = scene;
    this.root = new T.Group();      // position + facing
    this.rig = new T.Group();       // procedural pose (pivot at the feet)
    this.root.add(this.rig);
    scene.add(this.root);
    this.pos = this.root.position;
    this.r = PLAYER_R;
    this.yaw = 0;
    this.vel = new T.Vector3();
    this.phase = 0; this.run = 0; this.t = 0;
    this.action = null; // {name, t, dur}
    this.hurtT = 0; this.dead = false; this.deadT = 0;
    this.ghosts = [];

    // Selection ring + soft contact shadow under her feet
    const ring = new T.Mesh(new T.RingGeometry(0.52, 0.6, 48), new T.MeshBasicMaterial({ color: new T.Color(0.6, 2.2, 2.4), transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
    this.ring = ring; this.root.add(ring);
    this.light = new T.PointLight('#ffd9a8', 7, 7, 1.6);
    this.light.position.set(0, 2.6, 1.4);
    this.root.add(this.light);
  }

  async load(url, renderer, onProgress) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url, onProgress);
    const model = gltf.scene;
    const box = new T.Box3().setFromObject(model), size = box.getSize(new T.Vector3()), c = box.getCenter(new T.Vector3());
    const s = MIRA_HEIGHT / size.y;
    model.scale.setScalar(s);
    model.position.set(-c.x * s, -box.min.y * s, -c.z * s);
    this.meshes = [];
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        const m = o.material;
        if (m.map) m.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        m.envMapIntensity = 0.9;
        this.meshes.push(o);
      }
    });
    this.baseMats = this.meshes.map((o) => ({ m: o.material, e: o.material.emissive.clone() }));
    // X-ray silhouette: drawn only where something (a pillar, the boss) hides Mira.
    const xray = new T.MeshBasicMaterial({ color: new T.Color(0.35, 1.1, 1.3), blending: T.AdditiveBlending, depthFunc: T.GreaterDepth, depthWrite: false });
    for (const o of this.meshes) {
      const x = new T.Mesh(o.geometry, xray);
      x.position.copy(o.position); x.quaternion.copy(o.quaternion); x.scale.copy(o.scale);
      x.renderOrder = 1; o.renderOrder = 2;
      o.parent.add(x);
    }
    this.rig.add(model);
    this.model = model;
    this.info = {
      meshes: this.meshes.length,
      triangles: this.meshes.reduce((n, o) => n + (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3, 0),
      skinned: this.meshes.filter((o) => o.isSkinnedMesh).length,
      clips: gltf.animations.map((a) => a.name),
    };
    if (gltf.animations.length) {
      this.mixer = new T.AnimationMixer(model);
      const find = (re) => gltf.animations.find((a) => re.test(a.name));
      this.clips = { idle: find(/idle|stand/i), run: find(/run|walk|jog/i), attack: find(/attack|slash|punch|swing/i) };
      this.actions = {};
      for (const k in this.clips) if (this.clips[k]) this.actions[k] = this.mixer.clipAction(this.clips[k]);
      this.actions.idle?.play();
    }
    return this.info;
  }

  play(name, dur) { this.action = { name, t: 0, dur }; if (name === 'slash' && this.actions?.attack) this.actions.attack.reset().setLoop(T.LoopOnce).play(); }

  face(yaw, instant = false) { this.targetYaw = yaw; if (instant) this.yaw = yaw; }

  hurt() {
    this.hurtT = 0.35;
  }

  /** Afterimage used by the dash. */
  ghost(color = '#7ff0ff') {
    if (!this.model) return;
    const g = new T.Group();
    g.position.copy(this.root.position); g.rotation.y = this.root.rotation.y;
    const pose = this.rig.clone(false); pose.position.copy(this.rig.position); pose.rotation.copy(this.rig.rotation); pose.scale.copy(this.rig.scale);
    const mat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: T.AdditiveBlending, depthWrite: false });
    const inner = new T.Group(); inner.position.copy(this.model.position); inner.scale.copy(this.model.scale);
    for (const m of this.meshes) { const c = new T.Mesh(m.geometry, mat); c.position.copy(m.position); c.quaternion.copy(m.quaternion); c.scale.copy(m.scale); inner.add(c); }
    pose.add(inner); g.add(pose);
    this.scene.add(g);
    this.ghosts.push({ g, mat, t: 0 });
  }

  update(dt, speed01) {
    this.t += dt;
    this.mixer?.update(dt);
    this.run += (speed01 - this.run) * Math.min(1, dt * 10);
    this.phase += dt * 12.5 * this.run;
    if (this.targetYaw !== undefined) this.yaw = lerpAngle(this.yaw, this.targetYaw, Math.min(1, dt * 16));
    this.root.rotation.y = this.yaw;

    const r = this.rig;
    let y = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1;
    if (!this.actions) {
      // idle breathing
      const breathe = Math.sin(this.t * 2.3) * 0.012 * (1 - this.run);
      sy += breathe; sx -= breathe * 0.5; sz -= breathe * 0.5;
      rz += Math.sin(this.t * 1.1) * 0.015 * (1 - this.run);
      // running hop
      const hop = Math.abs(Math.sin(this.phase));
      y += hop * 0.16 * this.run;
      rx += 0.14 * this.run;
      rz += Math.sin(this.phase) * 0.07 * this.run;
      ry += Math.sin(this.phase) * 0.06 * this.run;
      const land = 1 - hop;
      sy -= land * 0.05 * this.run; sx += land * 0.025 * this.run; sz += land * 0.025 * this.run;
    } else {
      const want = this.run > 0.2 ? 'run' : 'idle';
      if (this.cur !== want && this.actions[want]) {
        this.actions[want].reset().fadeIn(0.15).play();
        if (this.cur && this.actions[this.cur]) this.actions[this.cur].fadeOut(0.15);
        this.cur = want;
      }
    }

    // one-shot actions
    const a = this.action;
    if (a) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      if (a.name === 'slash') {
        const s = a.flip ? -1 : 1;
        ry += s * (k < 0.35 ? -0.7 * (k / 0.35) : -0.7 + 1.5 * easeOut((k - 0.35) / 0.65)) * (1 - Math.max(0, (k - 0.8) / 0.2));
        rx += 0.12 * Math.sin(k * Math.PI);
      } else if (a.name === 'bolt') {
        rx += k < 0.3 ? -0.18 * (k / 0.3) : -0.18 + 0.4 * Math.sin(((k - 0.3) / 0.7) * Math.PI);
      } else if (a.name === 'nova') {
        y += Math.sin(Math.min(1, k / 0.75) * Math.PI) * 0.9;
        ry += k * Math.PI * 2;
        if (k > 0.75) { const q = (k - 0.75) / 0.25; sy -= Math.sin(q * Math.PI) * 0.18; sx += Math.sin(q * Math.PI) * 0.09; sz += Math.sin(q * Math.PI) * 0.09; }
      } else if (a.name === 'dash') {
        rx += 0.38 * Math.sin(k * Math.PI);
        sz += 0.12 * Math.sin(k * Math.PI); sy -= 0.05 * Math.sin(k * Math.PI);
      } else if (a.name === 'ult') {
        y += Math.sin(Math.min(1, k) * Math.PI) * 1.4;
        rx -= 0.25 * Math.sin(k * Math.PI);
      }
      if (k >= 1) this.action = null;
    }
    if (this.hurtT > 0) { this.hurtT -= dt; rx -= 0.28 * Math.sin((this.hurtT / 0.35) * Math.PI); }
    if (this.dead) {
      this.deadT += dt;
      const k = Math.min(1, this.deadT / 0.7);
      rx = -easeOut(k) * 1.45; y = Math.sin(k * Math.PI) * 0.4;
    }
    r.position.y = y; r.rotation.set(rx, ry, rz); r.scale.set(sx, sy, sz);
    this.ring.material.opacity = this.dead ? 0 : 0.35 + Math.sin(this.t * 4) * 0.15;

    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i]; g.t += dt;
      g.mat.opacity = 0.45 * (1 - g.t / 0.35);
      if (g.t >= 0.35) { this.scene.remove(g.g); g.mat.dispose(); this.ghosts.splice(i, 1); }
    }
  }

  setTint(amount, color) {
    for (const b of this.baseMats || []) { b.m.emissive.copy(b.e).lerp(color, amount); }
  }

  reset() {
    this.dead = false; this.deadT = 0; this.action = null; this.hurtT = 0;
    this.pos.set(0, 0, 4.2); this.yaw = 0; this.targetYaw = 0;
  }
}

function easeOut(x) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3); }
