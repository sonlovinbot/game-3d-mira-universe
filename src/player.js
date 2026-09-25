import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PLAYER_R } from './logic.js';
import { lerpAngle } from './enemies.js';
import { Animator } from './anim/animator.js';

export const MIRA_HEIGHT = 1.95;

/** Game action → skeletal motion. */
const ACTION_MOTION = { slash: 'slash', bolt: 'cast', nova: 'jump', dash: 'dash', ult: 'cast' };

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.root = new T.Group();      // position + facing
    this.rig = new T.Group();       // small whole-body offsets (jump height, fall)
    this.root.add(this.rig);
    scene.add(this.root);
    this.pos = this.root.position;
    this.r = PLAYER_R;
    this.yaw = 0; this.turnRate = 0;
    this.vel = new T.Vector3();
    this.t = 0; this.run = 0;
    this.action = null;
    this.hurtT = 0; this.dead = false; this.deadT = 0;
    this.ghosts = []; this.ghostPool = [];
    this.onStep = null;

    const ring = new T.Mesh(new T.RingGeometry(0.52, 0.6, 48), new T.MeshBasicMaterial({ color: new T.Color(0.6, 2.2, 2.4), transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
    this.ring = ring; this.root.add(ring);
    this.light = new T.PointLight('#ffd9a8', 7, 7, 1.6);
    this.light.position.set(0, 2.6, 1.4);
    this.root.add(this.light);
  }

  /** Loads the rigged model; falls back to the static one if needed. */
  async load(urls, renderer, onProgress) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    let gltf, url;
    for (url of [].concat(urls)) {
      try { gltf = await loader.loadAsync(url, onProgress); break; } catch (e) { console.warn('Không tải được', url, e); }
    }
    if (!gltf) throw new Error('Không tải được nhân vật');
    const model = gltf.scene;
    const box = new T.Box3().setFromObject(model), size = box.getSize(new T.Vector3()), c = box.getCenter(new T.Vector3());
    const s = MIRA_HEIGHT / size.y;
    model.scale.setScalar(s);
    model.position.set(-c.x * s, -box.min.y * s, -c.z * s);
    this.meshes = [];
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        o.frustumCulled = false; // skinned bounds don't follow the pose
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
      let x;
      if (o.isSkinnedMesh) { x = new T.SkinnedMesh(o.geometry, xray); x.bind(o.skeleton, o.bindMatrix); }
      else x = new T.Mesh(o.geometry, xray);
      x.position.copy(o.position); x.quaternion.copy(o.quaternion); x.scale.copy(o.scale);
      x.renderOrder = 1; o.renderOrder = 2; x.frustumCulled = false;
      o.parent.add(x);
    }
    this.rig.add(model);
    this.model = model;

    this.anim = new Animator(model);
    if (this.anim.ok) {
      this.anim.addClips(gltf.animations);
      this.anim.onStep = (side) => this.onStep?.(side);
      this.bones = []; model.traverse((o) => { if (o.isBone) this.bones.push(o); });
    } else this.anim = null;

    this.info = {
      url,
      meshes: this.meshes.length,
      triangles: this.meshes.reduce((n, o) => n + (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3, 0),
      skinned: this.meshes.filter((o) => o.isSkinnedMesh).length,
      bones: this.bones?.length || 0,
      clips: gltf.animations.map((a) => a.name),
      rigged: !!this.anim,
    };
    return this.info;
  }

  /** Extra keyframed clips (e.g. public/anims/*.glb exported from Tripo/Mixamo). */
  async loadClips(urls) {
    if (!this.anim) return [];
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const out = [];
    for (const u of urls) {
      try { const g = await loader.loadAsync(u); out.push(...this.anim.addClips(g.animations)); } catch (e) { console.warn('Bỏ qua clip', u, e); }
    }
    return out;
  }

  play(name, dur) {
    this.action = { name, t: 0, dur };
    const m = ACTION_MOTION[name];
    if (m && this.anim) this.anim.play(m, { speed: name === 'ult' ? 0.7 : 1 });
  }

  face(yaw, instant = false) { this.targetYaw = yaw; if (instant) this.yaw = yaw; }

  hurt() {
    this.hurtT = 0.35;
    this.anim?.play('hit');
  }

  die() { this.dead = true; this.deadT = 0; this.anim?.play('death', { fadeIn: 0.1 }); }

  /** Afterimage used by the dash: a frozen copy of the current pose. */
  ghost(color = '#7ff0ff') {
    if (!this.model) return;
    let g = this.ghostPool.pop();
    if (!g) {
      const mat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: T.AdditiveBlending, depthWrite: false });
      const obj = this.anim ? cloneSkinned(this.model) : this.model.clone();
      const bones = []; obj.traverse((o) => { if (o.isBone) bones.push(o); if (o.isMesh) { o.material = o.material.isMeshBasicMaterial && o.material.depthFunc === T.GreaterDepth ? o.material : mat; o.castShadow = false; o.frustumCulled = false; if (o.material !== mat) o.visible = false; } });
      const holder = new T.Group(); const inner = new T.Group(); holder.add(inner); inner.add(obj);
      g = { holder, inner, obj, bones, mat, t: 0 };
    }
    g.holder.position.copy(this.root.position); g.holder.rotation.y = this.root.rotation.y;
    g.inner.position.copy(this.rig.position); g.inner.rotation.copy(this.rig.rotation);
    if (this.bones) this.bones.forEach((b, i) => { const d = g.bones[i]; if (d) { d.position.copy(b.position); d.quaternion.copy(b.quaternion); } });
    g.t = 0; g.mat.opacity = 0.45;
    this.scene.add(g.holder);
    this.ghosts.push(g);
  }

  update(dt, speed01, speed = speed01 * 6.2) {
    this.t += dt;
    this.run += (speed01 - this.run) * Math.min(1, dt * 10);
    const prevYaw = this.yaw;
    if (this.targetYaw !== undefined) this.yaw = lerpAngle(this.yaw, this.targetYaw, Math.min(1, dt * 14));
    let dy = this.yaw - prevYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.turnRate += (dy / Math.max(dt, 1e-3) - this.turnRate) * Math.min(1, dt * 8);
    this.root.rotation.y = this.yaw;

    if (this.anim) this.updateSkeletal(dt, speed); else this.updateLegacy(dt);

    this.ring.material.opacity = this.dead ? 0 : 0.35 + Math.sin(this.t * 4) * 0.15;
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i]; g.t += dt;
      g.mat.opacity = 0.45 * (1 - g.t / 0.35);
      if (g.t >= 0.35) { this.scene.remove(g.holder); this.ghosts.splice(i, 1); this.ghostPool.push(g); }
    }
  }

  updateSkeletal(dt, speed) {
    let y = 0, rx = 0;
    const a = this.action;
    if (a) {
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      if (a.name === 'nova') y += Math.sin(Math.min(1, Math.max(0, (k - 0.25) / 0.55)) * Math.PI) * 0.7;
      if (a.name === 'ult') y += Math.sin(Math.min(1, k) * Math.PI) * 1.2;
      if (k >= 1) this.action = null;
    }
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.dead) {
      this.deadT += dt;
      const k = Math.min(1, Math.max(0, (this.deadT - 0.35) / 0.6));
      rx = -(1 - Math.pow(1 - k, 3)) * 1.25;
    }
    this.rig.position.y = y; this.rig.rotation.set(rx, 0, 0); this.rig.scale.set(1, 1, 1);
    this.anim.update(dt, { speed: this.dead ? 0 : speed, turnRate: this.turnRate });
  }

  /** Whole-figure animation for a model without a skeleton. */
  updateLegacy(dt) {
    this.phase = (this.phase || 0) + dt * 12.5 * this.run;
    let y = 0, rx = 0, ry = 0, rz = 0;
    const hop = Math.abs(Math.sin(this.phase));
    y += hop * 0.16 * this.run; rx += 0.14 * this.run; rz += Math.sin(this.phase) * 0.07 * this.run;
    const a = this.action;
    if (a) { a.t += dt; const k = Math.min(1, a.t / a.dur); if (a.name === 'nova') y += Math.sin(k * Math.PI) * 0.9; if (k >= 1) this.action = null; }
    if (this.hurtT > 0) { this.hurtT -= dt; rx -= 0.28 * Math.sin((this.hurtT / 0.35) * Math.PI); }
    if (this.dead) { this.deadT += dt; rx = -Math.min(1, this.deadT / 0.7) * 1.45; }
    this.rig.position.y = y; this.rig.rotation.set(rx, ry, rz);
  }

  setTint(amount, color) {
    for (const b of this.baseMats || []) { b.m.emissive.copy(b.e).lerp(color, amount); }
  }

  reset() {
    this.dead = false; this.deadT = 0; this.action = null; this.hurtT = 0;
    this.anim?.clearActions(); this.anim?.force(null);
    this.pos.set(0, 0, 4.2); this.yaw = 0; this.targetYaw = 0;
  }
}
