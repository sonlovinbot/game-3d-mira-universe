import * as T from 'three';
import { ENEMY_TYPES, OBSTACLES, resolveCollisions, ARENA_R } from './logic.js';

/* ---------- Procedural monster meshes (original designs, built from primitives) ---------- */
const G = {
  slimeBody: new T.SphereGeometry(0.62, 28, 18),
  eye: new T.SphereGeometry(0.085, 10, 8),
  horn: new T.ConeGeometry(0.09, 0.32, 6),
  wispCloak: (() => {
    const g = new T.ConeGeometry(0.5, 1.4, 14, 4, true);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -0.6) p.setY(i, y + Math.sin(i * 2.7) * 0.18); }
    g.computeVertexNormals(); return g;
  })(),
  wispHead: new T.SphereGeometry(0.34, 18, 12),
  rock: new T.DodecahedronGeometry(1, 0),
  orb: new T.SphereGeometry(0.32, 14, 10),
  spike: new T.ConeGeometry(0.25, 0.9, 5),
};
const mat = (o) => new T.MeshStandardMaterial({ roughness: 0.55, ...o });

function makeSlime() {
  const g = new T.Group(), body = new T.Group(); g.add(body);
  const skin = mat({ color: '#3a1f63', emissive: '#6a2bb0', emissiveIntensity: 0.45, roughness: 0.25, metalness: 0.1 });
  const b = new T.Mesh(G.slimeBody, skin); b.position.y = 0.55; b.scale.set(1, 0.85, 1); b.castShadow = true; body.add(b);
  const eyeM = mat({ color: '#ffd1f2', emissive: '#ff4fc8', emissiveIntensity: 3.5 });
  for (const s of [-1, 1]) { const e = new T.Mesh(G.eye, eyeM); e.position.set(0.2 * s, 0.7, 0.5); e.scale.set(1, 1.4, 0.6); body.add(e); }
  for (const s of [-1, 0, 1]) { const h = new T.Mesh(G.horn, mat({ color: '#231238' })); h.position.set(0.22 * s, 1.08 - Math.abs(s) * 0.08, -0.05); h.rotation.z = -s * 0.35; body.add(h); }
  return { group: g, body, flash: [skin] };
}

function makeWisp() {
  const g = new T.Group(), body = new T.Group(); g.add(body);
  const cloak = mat({ color: '#171329', emissive: '#3b1c5e', emissiveIntensity: 0.5, side: T.DoubleSide, roughness: 0.8 });
  const c = new T.Mesh(G.wispCloak, cloak); c.position.y = 1.05; c.castShadow = true; body.add(c);
  const flame = mat({ color: '#ffd0ea', emissive: '#ff3d8b', emissiveIntensity: 3.2 });
  const h = new T.Mesh(G.wispHead, flame); h.position.y = 1.75; body.add(h);
  const eyeM = mat({ color: '#1a0b1f', emissive: '#000000' });
  for (const s of [-1, 1]) { const e = new T.Mesh(G.eye, eyeM); e.position.set(0.12 * s, 1.78, 0.29); body.add(e); }
  return { group: g, body, flash: [cloak], head: h };
}

function makeGolem(scale = 1, boss = false) {
  const g = new T.Group(), body = new T.Group(); g.add(body);
  const stone = mat({ color: boss ? '#1f1a33' : '#4a4658', roughness: 0.9, flatShading: true, emissive: boss ? '#2a0d45' : '#000000', emissiveIntensity: 0.6 });
  const glowC = boss ? '#c04dff' : '#ff7a3d';
  const glow = mat({ color: '#ffe0c0', emissive: glowC, emissiveIntensity: boss ? 1.8 : 3.0 });
  const add = (geo, m, x, y, z, s, r = 0) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.scale.setScalar(s); o.rotation.set(r, r * 2, r); o.castShadow = true; body.add(o); return o; };
  add(G.rock, stone, 0, 1.25, 0, 0.8);
  const head = add(G.rock, stone, 0, 2.15, 0.12, 0.42, 0.4);
  const armL = add(G.rock, stone, -0.95, 1.2, 0.15, 0.42, 1), armR = add(G.rock, stone, 0.95, 1.2, 0.15, 0.42, 2);
  const fistL = add(G.rock, stone, -1.05, 0.55, 0.3, 0.36, 3), fistR = add(G.rock, stone, 1.05, 0.55, 0.3, 0.36, 4);
  add(G.rock, stone, -0.38, 0.35, 0, 0.36, 5); add(G.rock, stone, 0.38, 0.35, 0, 0.36, 6);
  add(G.rock, glow, 0, 1.3, 0.55, 0.2);
  for (const s of [-1, 1]) add(G.eye, glow, 0.15 * s, 2.2, 0.48, 1.1);
  if (boss) {
    for (const s of [-1, 1]) { const h = new T.Mesh(G.spike, stone); h.position.set(0.35 * s, 2.6, 0); h.rotation.z = -s * 0.6; h.scale.set(1, 1.3, 1); body.add(h); }
    for (let i = 0; i < 5; i++) { const s = new T.Mesh(G.spike, stone); s.position.set(0, 1.9 - i * 0.28, -0.55 - i * 0.05); s.rotation.x = -0.9; s.scale.setScalar(0.8 - i * 0.1); body.add(s); }
    const crest = new T.Mesh(new T.TorusGeometry(0.28, 0.05, 6, 20, Math.PI), glow); crest.position.set(0, 2.45, 0.35); body.add(crest);
  }
  g.scale.setScalar(scale);
  return { group: g, body, flash: [stone], arms: [armL, armR, fistL, fistR], head };
}

const BUILDERS = { slime: makeSlime, wisp: makeWisp, golem: () => makeGolem(1), boss: () => makeGolem(1.85, true) };
export const TYPE_COLOR = { slime: '#a34dff', wisp: '#ff4f9e', golem: '#ff8a4a', boss: '#c04dff' };

export class Enemies {
  constructor(scene, fx, particles, overlay, sfx) {
    Object.assign(this, { scene, fx, particles, overlay, sfx });
    this.list = [];
    this.orbs = [];
    this.orbMat = new T.MeshStandardMaterial({ color: '#ffd6ff', emissive: '#c43bff', emissiveIntensity: 3.5 });
    this.tmp = new T.Vector3();
  }

  get alive() { return this.list.filter((e) => e.state !== 'dying').length; }

  spawn(type, x, z, { hpMul = 1, spdMul = 1 } = {}) {
    const def = ENEMY_TYPES[type];
    const parts = BUILDERS[type]();
    const e = {
      type, def, ...parts,
      pos: new T.Vector3(x, 0, z), knock: new T.Vector3(),
      hp: def.hp * hpMul, maxHp: def.hp * hpMul, speed: def.speed * spdMul * (0.9 + Math.random() * 0.2),
      r: def.r, yaw: 0, state: 'spawn', t: 0, atkCd: 0.6 + Math.random(), flashT: 0, anim: Math.random() * 10,
      weave: Math.random() * 6, stun: 0,
      boss: type === 'boss', slamCd: 4, volleyCd: 6.5, summonCd: 11, enraged: false,
    };
    e.flashBase = e.flash.map((m) => ({ c: m.emissive.clone(), i: m.emissiveIntensity }));
    e.group.position.copy(e.pos);
    e.group.scale.multiplyScalar(0.01);
    e.baseScale = type === 'boss' ? 1.85 : 1;
    this.scene.add(e.group);
    e.bar = this.overlay.bar(e.boss);
    e.arrow = this.overlay.arrow();
    this.particles.emit({ pos: { x, y: 0.6, z }, count: 30, color: TYPE_COLOR[type], intensity: 2.5, size: 0.35, speed: 4, life: 0.8, up: 2 });
    this.fx.ring({ x, z }, { color: TYPE_COLOR[type], from: 0.2, to: 2 * e.baseScale, dur: 0.6 });
    this.list.push(e);
    return e;
  }

  hit(e, amount, dir, force, crit) {
    if (e.state === 'dying' || e.state === 'spawn') return null;
    e.hp -= amount;
    e.flashT = 0.12;
    const resist = e.boss ? 0.12 : e.type === 'golem' ? 0.4 : 1;
    if (dir) e.knock.addScaledVector(dir, force * resist);
    if (!e.boss) e.stun = Math.max(e.stun, 0.12 * resist);
    this.overlay.number({ x: e.pos.x, y: e.def.height * (e.boss ? 0.55 : 0.6), z: e.pos.z }, crit ? `${amount}!` : `${amount}`, crit ? 'crit' : '');
    this.particles.emit({ pos: { x: e.pos.x, y: e.def.height * 0.45, z: e.pos.z }, count: crit ? 14 : 8, color: crit ? '#fff2a8' : '#ffe0f6', intensity: 2.5, size: 0.22, speed: 6, life: 0.3 });
    this.sfx.hit(crit);
    if (e.hp <= 0) { this.kill(e); return true; }
    return false;
  }

  kill(e) {
    e.state = 'dying'; e.t = 0;
    const p = { x: e.pos.x, y: e.def.height * 0.4, z: e.pos.z };
    this.fx.burst(p, TYPE_COLOR[e.type], e.boss ? 120 : 30, e.boss ? 10 : 6);
    this.fx.ring(e.pos, { color: TYPE_COLOR[e.type], to: e.boss ? 7 : 2.2, dur: 0.5 });
    this.sfx.kill(e.boss);
    this.onKill?.(e);
  }

  update(dt, player, game) {
    const P = player.pos;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.t += dt; e.anim += dt;

      // hit flash
      e.flashT = Math.max(0, e.flashT - dt);
      const f = e.flashT > 0 ? 1 : 0;
      e.flash.forEach((m, k) => { m.emissive.copy(e.flashBase[k].c).lerp(WHITE, f); m.emissiveIntensity = e.flashBase[k].i + f * 2; });

      if (e.state === 'spawn') {
        const k = Math.min(1, e.t / 0.6);
        e.group.scale.setScalar(e.baseScale * (k < 1 ? easeOutBack(k) : 1));
        if (k >= 1) { e.state = 'chase'; e.t = 0; }
        this.place(e); continue;
      }
      if (e.state === 'dying') {
        const k = Math.min(1, e.t / 0.4);
        e.group.scale.setScalar(e.baseScale * (1 - k) + 0.001);
        e.group.position.y = -k * 0.6;
        if (k >= 1) this.remove(i);
        else this.place(e);
        continue;
      }

      const dx = P.x - e.pos.x, dz = P.z - e.pos.z, dist = Math.hypot(dx, dz) || 1e-4;
      const nx = dx / dist, nz = dz / dist;
      e.atkCd -= dt; e.stun = Math.max(0, e.stun - dt);

      if (e.boss) this.bossAI(e, dt, player, game, dist);

      if (e.state === 'chase' && game.playerAlive) {
        let mx = nx, mz = nz;
        if (e.type === 'wisp') { const w = Math.sin(e.anim * 2.6 + e.weave) * 0.75; mx += -nz * w; mz += nx * w; }
        // separation
        for (const o of this.list) {
          if (o === e || o.state === 'dying') continue;
          const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, od = Math.hypot(ox, oz), min = e.r + o.r + 0.15;
          if (od < min && od > 1e-4) { const k = (min - od) / min * 2.2; mx += (ox / od) * k; mz += (oz / od) * k; }
        }
        const ml = Math.hypot(mx, mz) || 1;
        const reach = e.def.reach + player.r;
        const sp = e.stun > 0 ? 0 : e.speed * (dist < reach * 0.85 ? 0.1 : 1);
        e.pos.x += (mx / ml) * sp * dt; e.pos.z += (mz / ml) * sp * dt;
        e.yaw = lerpAngle(e.yaw, Math.atan2(nx, nz), Math.min(1, dt * 8));
        if (dist < reach && e.atkCd <= 0 && e.stun <= 0) { e.state = 'windup'; e.t = 0; }
      } else if (e.state === 'windup') {
        e.yaw = lerpAngle(e.yaw, Math.atan2(nx, nz), Math.min(1, dt * 4));
        if (e.t >= e.def.windup * (e.enraged ? 0.75 : 1)) {
          e.state = 'recover'; e.t = 0; e.atkCd = e.boss ? 1.4 : 1.1 + Math.random() * 0.5;
          if (e.type === 'wisp') { e.knock.x += nx * 9; e.knock.z += nz * 9; }
          if (dist < e.def.reach + player.r + 0.45) game.damagePlayer(e.def.dmg, e);
          this.fx.ring({ x: e.pos.x + nx * e.def.reach * 0.6, z: e.pos.z + nz * e.def.reach * 0.6 }, { color: TYPE_COLOR[e.type], to: e.boss ? 3 : 1.2, dur: 0.3 });
          if (e.type === 'golem' || e.boss) this.sfx.slam(0.5);
        }
      } else if (e.state === 'recover') {
        if (e.t > 0.45) { e.state = 'chase'; e.t = 0; }
      } else if (e.state === 'slam') {
        if (e.t >= e.slamTime) {
          e.state = 'recover'; e.t = 0;
          const R = e.slamR;
          this.fx.ring(e.pos, { color: '#ff4f7a', to: R, dur: 0.45, soft: 0.5 });
          this.fx.ring(e.pos, { color: '#c04dff', to: R * 1.25, dur: 0.7 });
          this.particles.emit({ pos: { x: e.pos.x, y: 0.2, z: e.pos.z }, count: 70, color: '#b98cff', intensity: 1.8, size: 0.45, speed: 12, life: 0.6, flat: true, spread: 1 });
          this.sfx.slam(1); game.shake(0.6);
          if (dist < R + player.r) game.damagePlayer(e.def.dmg * 1.3, e);
        }
      }

      // knockback + collisions
      e.pos.addScaledVector(e.knock, dt);
      e.knock.multiplyScalar(Math.exp(-dt * 7));
      resolveCollisions(e.pos, e.r, OBSTACLES, ARENA_R + 0.4);
      this.place(e);
      this.animate(e, dt);
    }

    this.updateOrbs(dt, player, game);
  }

  bossAI(e, dt, player, game, dist) {
    if (!e.enraged && e.hp < e.maxHp * 0.5) {
      e.enraged = true;
      game.announce('Hắc Nguyệt Thú nổi giận!', 'Né vòng đỏ và hạt tối');
      e.flashBase.forEach((b) => { b.c.set('#6a0d4a'); b.i = 1; });
    }
    const m = e.enraged ? 0.7 : 1;
    e.slamCd -= dt; e.volleyCd -= dt; e.summonCd -= dt;
    if (e.state !== 'chase') return;
    if (e.slamCd <= 0 && dist < 7) {
      e.slamCd = 7 * m; e.state = 'slam'; e.t = 0; e.slamTime = 1.15; e.slamR = 4.6;
      this.fx.telegraph(e.pos, e.slamR, e.slamTime);
      this.sfx.warn();
    } else if (e.volleyCd <= 0) {
      e.volleyCd = 7.5 * m;
      const n = e.enraged ? 16 : 11, off = Math.random() * 6;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        this.shoot(e.pos.x + Math.sin(a) * 2, e.pos.z + Math.cos(a) * 2, Math.sin(a), Math.cos(a), 5.5);
      }
      this.sfx.volley();
    } else if (e.summonCd <= 0) {
      e.summonCd = 13 * m;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * 6.28;
        game.spawnEnemy('slime', e.pos.x + Math.sin(a) * 3, e.pos.z + Math.cos(a) * 3);
      }
    }
  }

  shoot(x, z, dx, dz, speed) {
    const m = new T.Mesh(G.orb, this.orbMat);
    m.position.set(x, 1.1, z);
    this.scene.add(m);
    this.orbs.push({ m, vx: dx * speed, vz: dz * speed, life: 4.5 });
  }

  updateOrbs(dt, player, game) {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.life -= dt;
      o.m.position.x += o.vx * dt; o.m.position.z += o.vz * dt;
      o.m.scale.setScalar(1 + Math.sin(o.life * 20) * 0.12);
      if (Math.random() < 0.5) this.particles.emit({ pos: o.m.position, count: 1, color: '#c43bff', intensity: 2, size: 0.3, life: 0.35 });
      const hitP = Math.hypot(o.m.position.x - player.pos.x, o.m.position.z - player.pos.z) < 0.32 + player.r;
      if (hitP && game.playerAlive) game.damagePlayer(11, null);
      if (o.life <= 0 || hitP || Math.hypot(o.m.position.x, o.m.position.z) > 16) {
        this.particles.emit({ pos: o.m.position, count: 10, color: '#c43bff', intensity: 2, size: 0.3, speed: 3, life: 0.3 });
        this.scene.remove(o.m); this.orbs.splice(i, 1);
      }
    }
  }

  animate(e, dt) {
    const t = e.anim, b = e.body;
    const wind = e.state === 'windup' ? Math.min(1, e.t / e.def.windup) : 0;
    const strike = e.state === 'recover' ? Math.max(0, 1 - e.t / 0.25) : 0;
    if (e.type === 'slime') {
      const hop = Math.abs(Math.sin(t * 7));
      b.position.y = hop * 0.35 * (e.state === 'chase' ? 1 : 0.2);
      const sq = 1 + (hop - 0.5) * 0.18 - wind * 0.25 + strike * 0.3;
      b.scale.set(1 / Math.sqrt(sq) + wind * 0.15, sq, 1 / Math.sqrt(sq) + wind * 0.15);
      b.rotation.x = strike * 0.4;
    } else if (e.type === 'wisp') {
      b.position.y = 0.25 + Math.sin(t * 3) * 0.18;
      b.rotation.x = 0.2 + wind * -0.35 + strike * 0.6;
      b.rotation.z = Math.sin(t * 2.3) * 0.12;
      e.head.scale.setScalar(1 + Math.sin(t * 13) * 0.07 + wind * 0.3);
      if (Math.random() < dt * 30) this.particles.emit({ pos: { x: e.pos.x, y: 1.85 + b.position.y, z: e.pos.z }, count: 1, color: '#ff3d8b', intensity: 2, size: 0.28, life: 0.5, up: 1.2 });
    } else {
      const walk = e.state === 'chase' ? 1 : 0;
      b.rotation.z = Math.sin(t * 3.2) * 0.07 * walk;
      b.position.y = Math.abs(Math.sin(t * 3.2)) * 0.08 * walk;
      b.rotation.x = -wind * 0.35 + strike * 0.45;
      const [aL, aR, fL, fR] = e.arms;
      const lift = wind * 1.1 - strike * 0.4;
      fL.position.y = 0.55 + lift + Math.sin(t * 3.2) * 0.12 * walk; fR.position.y = 0.55 + lift - Math.sin(t * 3.2) * 0.12 * walk;
      aL.position.y = 1.2 + lift * 0.5; aR.position.y = 1.2 + lift * 0.5;
      if (e.state === 'slam') { const k = Math.min(1, e.t / e.slamTime); b.position.y = Math.sin(k * Math.PI) * 0.8; fL.position.y = fR.position.y = 0.55 + k * 1.8; }
    }
  }

  place(e) {
    e.group.position.x = e.pos.x; e.group.position.z = e.pos.z;
    e.group.rotation.y = e.yaw;
    const s = this.overlay.project(e.pos, e.def.height * (e.boss ? 1.05 : 1) + 0.25);
    const onScreen = !s.behind && s.x > 0 && s.x < innerWidth && s.y > 0 && s.y < innerHeight;
    const show = e.state !== 'dying' && e.hp < e.maxHp && onScreen && !e.boss;
    e.bar.style.display = show ? 'block' : 'none';
    if (show) {
      e.bar.style.transform = `translate(${s.x}px, ${s.y}px)`;
      e.bar.firstChild.style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;
    }
    // off-screen arrow
    const off = !onScreen && e.state !== 'dying';
    e.arrow.style.display = off ? 'block' : 'none';
    if (off) {
      const cx = innerWidth / 2, cy = innerHeight / 2;
      let vx = s.x - cx, vy = s.y - cy; if (s.behind) { vx = -vx; vy = -vy; }
      const k = Math.min((cx - 26) / Math.abs(vx || 1e-3), (cy - 26) / Math.abs(vy || 1e-3));
      e.arrow.style.transform = `translate(${cx + vx * k}px, ${cy + vy * k}px) rotate(${Math.atan2(vy, vx)}rad)`;
      e.arrow.dataset.type = e.type;
    }
  }

  remove(i) {
    const e = this.list[i];
    this.scene.remove(e.group);
    e.group.traverse((o) => { if (o.material && !o.material.userData.shared) o.material.dispose(); });
    e.bar.remove(); e.arrow.remove();
    this.list.splice(i, 1);
  }

  clear() {
    while (this.list.length) this.remove(this.list.length - 1);
    for (const o of this.orbs) this.scene.remove(o.m);
    this.orbs.length = 0;
  }
}

const WHITE = new T.Color('#ffffff');
function easeOutBack(x) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
export function lerpAngle(a, b, t) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; }
