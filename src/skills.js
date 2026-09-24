import * as T from 'three';
import { SKILLS, inArc, damageRoll } from './logic.js';

/** Mira's four skills + ultimate. Auto-aims at the nearest monster so touch play feels good. */
export class Skills {
  constructor(ctx) {
    this.ctx = ctx; // {scene, fx, particles, enemies, player, sfx, game, cds}
    this.bolts = [];
    this.meteors = [];
    this.flip = false;
    this.boltGeo = new T.SphereGeometry(0.2, 12, 10);
    this.boltMat = new T.MeshBasicMaterial({ color: new T.Color(1.1, 1.9, 2.1) });
    this.meteorGeo = new T.IcosahedronGeometry(0.45, 1);
    this.meteorMat = new T.MeshBasicMaterial({ color: new T.Color(3.4, 2.4, 1.0) });
  }

  nearest(maxDist = 9, preferYaw = null) {
    const { enemies, player } = this.ctx;
    let best = null, bestScore = Infinity;
    for (const e of enemies.list) {
      if (e.state === 'dying' || e.state === 'spawn') continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) - e.r;
      if (d > maxDist) continue;
      let score = d;
      if (preferYaw !== null) {
        let diff = Math.atan2(e.pos.x - player.pos.x, e.pos.z - player.pos.z) - preferYaw;
        diff = Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff)));
        score += diff * 2.2;
      }
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  aimAt(e) { const p = this.ctx.player.pos; return Math.atan2(e.pos.x - p.x, e.pos.z - p.z); }

  slash() {
    const { player, enemies, fx, sfx, game } = this.ctx;
    const t = this.nearest(3.8, player.yaw);
    if (t) player.face(this.aimAt(t), true);
    const yaw = player.yaw, S = SKILLS.slash;
    this.flip = !this.flip;
    player.play('slash', 0.3); player.action.flip = this.flip;
    fx.slash(player.pos, yaw, '#ffd76a', this.flip);
    sfx.slash();
    let hits = 0;
    for (const e of [...enemies.list]) {
      if (!inArc(player.pos.x, player.pos.z, yaw, e.pos.x, e.pos.z, S.range, S.arc, e.r)) continue;
      const r = damageRoll(S.dmg, game.dmgMul);
      const dir = new T.Vector3(e.pos.x - player.pos.x, 0, e.pos.z - player.pos.z).normalize();
      if (enemies.hit(e, r.amount, dir, S.knock, r.crit) !== null) hits++;
    }
    if (hits) game.hitstop(0.045);
  }

  bolt() {
    const { player, scene, sfx } = this.ctx;
    const t = this.nearest(14, player.yaw);
    if (t) player.face(this.aimAt(t), true);
    const yaw = player.yaw;
    player.play('bolt', 0.3);
    const m = new T.Mesh(this.boltGeo, this.boltMat);
    const dir = new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    m.position.set(player.pos.x + dir.x * 0.7, 1.2, player.pos.z + dir.z * 0.7);
    scene.add(m);
    this.bolts.push({ m, dir, life: SKILLS.bolt.life, target: t });
    this.ctx.fx.flashSphere(m.position, { color: '#3fb8c8', to: 0.6, dur: 0.15 });
    sfx.bolt();
  }

  nova() {
    const { player, enemies, fx, particles, sfx, game } = this.ctx, S = SKILLS.nova;
    player.play('nova', 0.55);
    sfx.nova();
    // Damage lands as she touches down
    game.after(0.42, () => {
      fx.ring(player.pos, { color: '#7ff0ff', to: S.radius, dur: 0.55, soft: 0.45 });
      fx.ring(player.pos, { color: '#ffd76a', from: 0.5, to: S.radius * 1.15, dur: 0.75, soft: 0.2 });
      particles.emit({ pos: { x: player.pos.x, y: 0.3, z: player.pos.z }, count: 90, color: '#9ff6ff', intensity: 2.2, size: 0.35, sizeEnd: 0.05, speed: 14, life: 0.6, flat: true, drag: 3 });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        particles.emit({ pos: { x: player.pos.x + Math.sin(a) * 1.2, y: 0.2, z: player.pos.z + Math.cos(a) * 1.2 }, count: 2, color: '#ffe38a', intensity: 2.5, size: 0.3, up: 5, life: 0.8, gravity: 4 });
      }
      game.shake(0.35);
      for (const e of [...enemies.list]) {
        const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z, d = Math.hypot(dx, dz);
        if (d - e.r > S.radius) continue;
        const r = damageRoll(S.dmg, game.dmgMul);
        enemies.hit(e, r.amount, new T.Vector3(dx, 0, dz).normalize(), S.knock, r.crit);
        if (!e.boss) e.stun = 0.6;
      }
      game.hitstop(0.06);
    });
  }

  dash(moveX, moveZ) {
    const { player, sfx, particles, game } = this.ctx;
    let yaw = player.yaw;
    if (Math.hypot(moveX, moveZ) > 0.1) yaw = Math.atan2(moveX, moveZ);
    player.face(yaw, true);
    player.play('dash', SKILLS.dash.time);
    game.dash = { t: SKILLS.dash.time, dx: Math.sin(yaw), dz: Math.cos(yaw), ghost: 0 };
    game.invul = Math.max(game.invul, SKILLS.dash.time + 0.12);
    particles.emit({ pos: { x: player.pos.x, y: 0.2, z: player.pos.z }, count: 18, color: '#bfefff', intensity: 1.2, size: 0.45, speed: 3, life: 0.5, flat: true });
    sfx.dash();
  }

  ult() {
    const { player, sfx, fx, game, enemies } = this.ctx, S = SKILLS.ult;
    player.play('ult', 0.8);
    sfx.ult();
    fx.pillar(player.pos, { color: '#ffd76a', radius: 1.4, height: 14, dur: 0.9 });
    fx.ring(player.pos, { color: '#ffd76a', to: S.area, dur: 1.0, soft: 0.15 });
    game.announce('Mưa Sao Băng', '', 1.1, 'ult');
    const targets = enemies.list.filter((e) => e.state !== 'dying');
    for (let i = 0; i < S.count; i++) {
      let x, z;
      const e = targets.length ? targets[i % targets.length] : null;
      if (e && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < S.area * 1.6) { x = e.pos.x + (Math.random() - 0.5) * 1.2; z = e.pos.z + (Math.random() - 0.5) * 1.2; }
      else { const a = Math.random() * 6.28, r = 1.5 + Math.random() * S.area * 0.8; x = player.pos.x + Math.sin(a) * r; z = player.pos.z + Math.cos(a) * r; }
      const delay = 0.45 + i * 0.11;
      game.after(delay, () => this.spawnMeteor(x, z));
    }
  }

  spawnMeteor(x, z) {
    const m = new T.Mesh(this.meteorGeo, this.meteorMat);
    const from = new T.Vector3(x - 5, 16, z - 7);
    m.position.copy(from);
    this.ctx.scene.add(m);
    this.ctx.fx.telegraph({ x, z }, SKILLS.ult.radius, 0.45).material.uniforms.uColor.value.set('#ffcf5a');
    this.meteors.push({ m, from, to: new T.Vector3(x, 0.2, z), t: 0, dur: 0.45 });
  }

  update(dt) {
    const { enemies, particles, fx, sfx, game } = this.ctx;
    // bolts (light homing)
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      if (b.target && b.target.state !== 'dying' && enemies.list.includes(b.target)) {
        const want = new T.Vector3(b.target.pos.x - b.m.position.x, 0, b.target.pos.z - b.m.position.z).normalize();
        b.dir.lerp(want, Math.min(1, dt * 6)).normalize();
      }
      b.m.position.addScaledVector(b.dir, SKILLS.bolt.speed * dt);
      particles.emit({ pos: b.m.position, count: 2, color: '#7ff0ff', intensity: 1.6, size: 0.28, sizeEnd: 0.02, life: 0.3, spread: 0.1, speed: 0.6 });
      let hit = null;
      for (const e of enemies.list) {
        if (e.state === 'dying' || e.state === 'spawn') continue;
        if (Math.hypot(e.pos.x - b.m.position.x, e.pos.z - b.m.position.z) < e.r + SKILLS.bolt.radius) { hit = e; break; }
      }
      if (hit || b.life <= 0 || Math.hypot(b.m.position.x, b.m.position.z) > 16) {
        if (hit) {
          const r = damageRoll(SKILLS.bolt.dmg, game.dmgMul);
          enemies.hit(hit, r.amount, b.dir.clone(), SKILLS.bolt.knock, r.crit);
          sfx.boltHit();
        }
        fx.flashSphere(b.m.position, { color: '#3fb8c8', to: 1.0, dur: 0.2 });
        particles.emit({ pos: b.m.position, count: 18, color: '#9ff6ff', intensity: 2.2, size: 0.25, speed: 6, life: 0.35 });
        this.ctx.scene.remove(b.m);
        this.bolts.splice(i, 1);
      }
    }
    // meteors
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      m.m.position.lerpVectors(m.from, m.to, k * k);
      particles.emit({ pos: m.m.position, count: 4, color: '#ffb347', intensity: 2.5, size: 0.6, sizeEnd: 0.1, life: 0.4, spread: 0.3 });
      if (k >= 1) {
        this.ctx.scene.remove(m.m);
        this.meteors.splice(i, 1);
        fx.flashSphere(m.to, { color: '#ffd76a', to: 2.6, dur: 0.3 });
        fx.ring(m.to, { color: '#ffb347', to: SKILLS.ult.radius * 1.3, dur: 0.45 });
        particles.emit({ pos: m.to, count: 40, color: '#ffc26a', intensity: 2.5, size: 0.4, sizeEnd: 0.05, speed: 9, life: 0.6, gravity: 6, up: 3 });
        sfx.meteor(); game.shake(0.25);
        for (const e of [...enemies.list]) {
          const dx = e.pos.x - m.to.x, dz = e.pos.z - m.to.z;
          if (Math.hypot(dx, dz) - e.r > SKILLS.ult.radius) continue;
          const r = damageRoll(SKILLS.ult.dmg, game.dmgMul);
          enemies.hit(e, r.amount, new T.Vector3(dx, 0, dz).normalize(), 6, r.crit);
        }
      }
    }
  }

  clear() {
    for (const b of this.bolts) this.ctx.scene.remove(b.m);
    for (const m of this.meteors) this.ctx.scene.remove(m.m);
    this.bolts.length = 0; this.meteors.length = 0;
  }
}
