import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './style.css';
import {
  PLAYER, SKILLS, WAVES, UPGRADE, PORTALS, SHRINE, ENEMY_TYPES,
  Cooldowns, moveVector, resolveCollisions, buildSpawnQueue, waveTotal,
} from './logic.js';
import { createWorld } from './world.js';
import { Particles, Effects, Overlay } from './fx.js';
import { Enemies } from './enemies.js';
import { Player } from './player.js';
import { Skills } from './skills.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { Studio } from './studio.js';

const $ = (s) => document.querySelector(s);
const DEBUG = new URLSearchParams(location.search).has('debug');
const low = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
const storage = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

/* ---------- Renderer, scene, post ---------- */
const canvas = $('#scene');
const renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1.5 : 2));
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.info.autoReset = false;
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;

const scene = new T.Scene();
scene.fog = new T.FogExp2('#231c46', 0.013);
const pmrem = new T.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.32;

const camera = new T.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 500);

scene.add(new T.HemisphereLight('#aab8ff', '#2e2540', 1.05));
const moon = new T.DirectionalLight('#c9d6ff', 2.3);
moon.castShadow = true;
moon.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
Object.assign(moon.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.04;
scene.add(moon, moon.target);
const rim = new T.DirectionalLight('#ff9fb8', 1.1); rim.position.set(18, 8, -20); scene.add(rim);
const flash = new T.PointLight('#ffd9a0', 0, 14, 1.4); scene.add(flash);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new T.Vector2(innerWidth, innerHeight), 0.48, 0.42, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const world = createWorld(scene, { low });
const particles = new Particles(scene, low ? 1600 : 2600);
const fx = new Effects(scene, particles);
const overlay = new Overlay($('#overlay-layer'), camera);
const sfx = new Sfx(`${import.meta.env.BASE_URL}audio/`);
const player = new Player(scene);
player.onStep = () => {
  if (G.state === 'title') return;
  sfx.step();
  particles.emit({ pos: { x: player.pos.x, y: 0.06, z: player.pos.z }, count: 3, color: '#9c93c9', intensity: 0.5, size: 0.3, speed: 0.7, life: 0.45, up: 0.3, flat: true });
};
player.reset();
const enemies = new Enemies(scene, fx, particles, overlay, sfx);
const cds = new Cooldowns(SKILLS);
const input = new Input({ canvas, stickZone: $('#stick-zone'), stick: $('#stick'), knob: $('#knob'), skillButtons: [...document.querySelectorAll('.skill')] });
const setTouch = (v) => document.body.classList.toggle('touch', v);
setTouch(input.touchMode); input.onTouchMode = setTouch;

/* ---------- Game state ---------- */
const G = {
  state: 'title', // title | explore | countdown | wave | cleared | victory | dead
  paused: false,
  wave: -1, hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, energy: 0, dmgMul: 1,
  kills: 0, score: 0, time: 0, invul: 0, dash: null, hitstopT: 0, shakeT: 0,
  queue: [], spawnT: 0, spawned: 0, portal: 0, timers: [], countdown: 0,
  get playing() { return !this.paused && ['explore', 'countdown', 'wave', 'cleared'].includes(this.state); },
  get playerAlive() { return this.state !== 'dead'; },
  after(sec, fn) { this.timers.push({ t: sec, fn }); },
  shake(a) { this.shakeT = Math.max(this.shakeT, a); },
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); },
  announce, damagePlayer, spawnEnemy,
};
const skills = new Skills({ scene, fx, particles, enemies, player, sfx, game: G, cds });

enemies.onKill = (e) => {
  G.kills++;
  G.score += e.def.score * (G.wave + 1);
  // soul motes that fly to Mira and charge the ultimate
  for (let i = 0; i < e.def.souls; i++) souls.push({ p: new T.Vector3(e.pos.x + (Math.random() - 0.5), 1, e.pos.z + (Math.random() - 0.5)), v: new T.Vector3((Math.random() - 0.5) * 5, 4 + Math.random() * 3, (Math.random() - 0.5) * 5), t: 0 });
  if (e.boss) { G.shake(1); G.hitstop(0.25); flash.position.set(e.pos.x, 3, e.pos.z); flashT = 1; }
};
const souls = [];
let flashT = 0;

/* ---------- Flow ---------- */
function resetRun() {
  enemies.clear(); skills.clear();
  souls.length = 0; G.timers.length = 0;
  Object.assign(G, { state: 'explore', paused: false, wave: -1, hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, energy: 0, dmgMul: 1, kills: 0, score: 0, time: 0, invul: 0, dash: null, queue: [], spawned: 0 });
  player.reset(); player.face(Math.PI);
  cds.reset(); input.clear();
  world.crystal.show();
  world.portals.forEach((p) => p.setActive(false));
  $('#boss-bar').classList.add('hidden');
  setWaveUI('KHỞI ĐẦU', 'Tế đàn Linh Quang', '', 0);
  objective('Đi tới tế đàn và nhặt Linh Tinh', true);
}

function startGame() {
  sfx.unlock();
  $('#screen-title').classList.add('hidden');
  $('#screen-end').classList.add('hidden');
  document.body.classList.add('ingame');
  $('#hud').classList.remove('hidden');
  $('#skills').classList.remove('hidden');
  $('#key-hint').classList.remove('hidden');
  resetRun();
  sfx.music('explore');
  announce('Nhặt Linh Tinh', 'KHỞI ĐẦU', 2);
  canvas.focus();
}

function collectCrystal() {
  world.crystal.hide();
  sfx.pickup();
  fx.pillar(new T.Vector3(0, 0, 0), { color: '#ffd76a', radius: 1.6, height: 18, dur: 1.1 });
  fx.ring({ x: 0, z: 0 }, { color: '#ffd76a', to: 7, dur: 1.0, soft: 0.2 });
  particles.emit({ pos: { x: 0, y: 1.6, z: 0 }, count: 120, color: '#ffe38a', intensity: 2.4, size: 0.35, sizeEnd: 0.04, speed: 8, life: 1.1, drag: 2 });
  flash.position.set(0, 3, 0); flashT = 1;
  if (G.wave >= 0) {
    // power-up for surviving a wave
    G.dmgMul += UPGRADE.dmg;
    G.maxHp += UPGRADE.maxHp;
    const heal = Math.round(G.maxHp * UPGRADE.heal);
    G.hp = Math.min(G.maxHp, G.hp + heal);
    overlay.number(player.pos, `+${heal}`, 'heal');
    sfx.upgrade();
    toast(`Linh Tinh: sát thương +${Math.round(UPGRADE.dmg * 100)}% · máu tối đa +${UPGRADE.maxHp} · hồi ${heal} máu`);
  } else toast('Linh Tinh thức tỉnh — yêu quái đang kéo đến!');
  if (G.wave + 1 >= WAVES.length) return victory();
  beginCountdown(G.wave + 1);
}

function beginCountdown(i) {
  G.state = 'countdown'; G.wave = i; G.countdown = 2.6;
  const w = WAVES[i];
  setWaveUI(`ĐỢT ${i + 1} / ${WAVES.length}`, w.name, `0 / ${waveTotal(i)}`, 0);
  objective('Chuẩn bị! Yêu quái sắp tràn ra từ các cổng');
  announce(w.name, `ĐỢT ${i + 1}`, 2.4, w.boss ? 'danger' : '');
  world.portals.forEach((p) => p.setActive(true));
  sfx.wave();
  sfx.music(w.boss ? 'boss' : 'battle');
}

function startWave() {
  G.state = 'wave';
  G.queue = buildSpawnQueue(G.wave);
  G.spawned = 0; G.spawnT = 0.2;
  objective(`Tiêu diệt yêu quái`);
}

function waveCleared() {
  G.state = 'cleared';
  world.portals.forEach((p) => p.setActive(false));
  world.crystal.show();
  $('#boss-bar').classList.add('hidden');
  const last = G.wave + 1 >= WAVES.length;
  announce(last ? 'Bóng tối tan biến' : 'Đợt tấn công đã bị đẩy lùi', `ĐỢT ${G.wave + 1} HOÀN THÀNH`, 2.2);
  objective(last ? 'Nhặt Linh Tinh cuối cùng để đón bình minh' : 'Linh Tinh đã hiện ra — nhặt để mạnh hơn', true);
  G.score += 150 * (G.wave + 1);
  sfx.clear(); sfx.crystalAppear(); sfx.music('explore');
}

function victory() {
  G.state = 'victory';
  sfx.win(); sfx.music('end');
  player.anim?.force('cheer');
  input.clear();
  G.after(1.4, () => showEnd(true));
  for (let i = 0; i < 6; i++) G.after(i * 0.2, () => fx.ring({ x: player.pos.x, z: player.pos.z }, { color: i % 2 ? '#ffd76a' : '#7ff0ff', to: 6 + i, dur: 1 }));
}

function showEnd(won) {
  const best = Math.max(Number(storage.get('mira-best') || 0), G.score);
  storage.set('mira-best', String(best));
  $('#end-eyebrow').textContent = won ? 'CHIẾN THẮNG' : 'THẤT BẠI';
  $('#end-title').textContent = won ? 'Bình minh đã trở lại hòn đảo' : 'Mira đã gục ngã';
  $('#end-score').textContent = G.score.toLocaleString('vi-VN');
  $('#end-kills').textContent = G.kills;
  $('#end-wave').textContent = `${Math.max(1, G.wave + 1)}/${WAVES.length}`;
  $('#end-time').textContent = fmtTime(G.time);
  $('#end-best').textContent = `Kỷ lục: ${best.toLocaleString('vi-VN')} điểm`;
  $('#banner').className = ''; $('#toast').classList.remove('show');
  $('#screen-end').classList.remove('hidden');
  $('#btn-again').focus();
}

function damagePlayer(amount, src) {
  if (G.invul > 0 || G.state === 'dead' || G.state === 'victory') return;
  amount = Math.round(amount);
  G.hp = Math.max(0, G.hp - amount);
  G.invul = PLAYER.invul;
  player.hurt();
  overlay.number(player.pos, `-${amount}`, 'hurt');
  sfx.hurt(); G.shake(0.3);
  $('#hurt-vignette').style.opacity = '1';
  setTimeout(() => ($('#hurt-vignette').style.opacity = '0'), 180);
  if (src) { const dx = player.pos.x - src.pos.x, dz = player.pos.z - src.pos.z, d = Math.hypot(dx, dz) || 1; knock.set((dx / d) * 7, 0, (dz / d) * 7); }
  if (G.hp <= 0) {
    G.state = 'dead';
    player.die();
    input.clear();
    sfx.lose(); sfx.music('end');
    announce('Mira đã gục ngã', '', 1.6, 'danger');
    G.after(1.6, () => showEnd(false));
  }
}
const knock = new T.Vector3();

function spawnEnemy(type, x, z) {
  const w = WAVES[Math.max(0, G.wave)];
  const e = enemies.spawn(type, x, z, { hpMul: w.hpMul, spdMul: w.spdMul });
  if (e.boss) { $('#boss-bar').classList.remove('hidden'); G.boss = e; announce('Hắc Nguyệt Thú', 'TRÙM XUẤT HIỆN', 2.2, 'danger'); G.shake(0.8); }
  return e;
}

function spawnFromQueue() {
  const type = G.queue.shift();
  // prefer the portal furthest from the player
  let best = PORTALS[0], bd = -1;
  for (let k = 0; k < PORTALS.length; k++) {
    const p = PORTALS[(G.portal + k) % PORTALS.length];
    const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z) + Math.random() * 5;
    if (d > bd) { bd = d; best = p; }
  }
  G.portal++;
  const inward = type === 'boss' ? 3.5 : 1.2;
  const x = best.x - Math.sin(best.angle) * inward + (Math.random() - 0.5) * 1.5;
  const z = best.z - Math.cos(best.angle) * inward + (Math.random() - 0.5) * 1.5;
  spawnEnemy(type, x, z);
  G.spawned++;
}

/* ---------- UI helpers ---------- */
let bannerTimer = 0;
function announce(title, sub = '', dur = 2, kind = '') {
  const b = $('#banner');
  $('#banner-title').textContent = title; $('#banner-sub').textContent = sub;
  b.className = `show ${kind}`;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => (b.className = kind), dur * 1000);
}
let toastTimer = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200); }
function objective(text, glow = false) { const o = $('#objective'); o.textContent = text; o.classList.toggle('glow', glow); }
function setWaveUI(label, name, count, pct) { $('#wave-label').textContent = label; $('#wave-name').textContent = name; $('#wave-count').textContent = count; $('#wave-fill').style.width = `${pct}%`; }
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const skillEls = Object.fromEntries([...document.querySelectorAll('.skill')].map((b) => [b.dataset.skill, b]));
const wasReady = {};
let hudT = 0;
function updateHUD() {
  $('#hp-fill').style.width = `${(G.hp / G.maxHp) * 100}%`;
  $('#hp-text').textContent = `${Math.ceil(G.hp)} / ${G.maxHp}`;
  $('#en-fill').style.width = `${G.energy}%`;
  $('#en-text').textContent = G.energy >= 100 ? 'Tuyệt kỹ sẵn sàng · U' : `Tuyệt kỹ ${Math.floor(G.energy)}%`;
  $('.bar.en').classList.toggle('full', G.energy >= 100);
  if (G.energy >= 100 && !G.ultWasReady) sfx.ultReady();
  G.ultWasReady = G.energy >= 100;
  $('#lvl').textContent = `Sát thương ×${G.dmgMul.toFixed(2)}`;
  $('#score').textContent = G.score.toLocaleString('vi-VN');
  for (const k in skillEls) {
    const el = skillEls[k];
    const ratio = k === 'ult' ? 1 - G.energy / 100 : cds.ratio(k);
    el.querySelector('.cd').style.setProperty('--p', `${ratio * 100}%`);
    const ready = ratio <= 0;
    if (ready && wasReady[k] === false) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    wasReady[k] = ready;
    el.classList.toggle('ready', ready);
    if (k === 'ult') el.classList.toggle('charged', ready);
  }
  if (G.state === 'wave') {
    const total = waveTotal(G.wave);
    const done = G.spawned - enemies.alive;
    setWaveUI(`ĐỢT ${G.wave + 1} / ${WAVES.length}`, WAVES[G.wave].name, `${Math.max(0, done)} / ${total}`, (Math.max(0, done) / total) * 100);
  }
  if (G.boss && enemies.list.includes(G.boss)) $('#boss-fill').style.width = `${Math.max(0, G.boss.hp / G.boss.maxHp) * 100}%`;
}

/* ---------- Loop ---------- */
const camPos = new T.Vector3(0, 12, 16), camLook = new T.Vector3();
let camFar = 1;
function resize() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  camera.aspect = aspect;
  camera.fov = aspect < 0.8 ? 58 : aspect < 1.2 ? 52 : 46;
  camFar = aspect < 0.8 ? 1.45 : aspect < 1.2 ? 1.2 : 1;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  particles.uniforms.uScale.value = h * 0.9 * renderer.getPixelRatio() / Math.tan((camera.fov * Math.PI) / 360) * 0.5;
}
addEventListener('resize', resize);
resize();

let last = performance.now(), elapsed = 0, fps = 60;
function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  if (!G.paused) tick(dt);
  renderer.info.reset();
  composer.render();
}
function tick(dt) {
  elapsed += dt;
  if (G.state === 'studio') {
    studio.update(dt);
    world.update(elapsed, dt); particles.update(dt); fx.update(dt);
    moon.position.set(player.pos.x - 9, 22, player.pos.z + 6); moon.target.position.set(player.pos.x, 0, player.pos.z);
    return;
  }
  if (G.hitstopT > 0) { G.hitstopT -= dt; dt *= 0.08; }

  // timers
  for (let i = G.timers.length - 1; i >= 0; i--) { const t = G.timers[i]; t.t -= dt; if (t.t <= 0) { G.timers.splice(i, 1); t.fn(); } }

  const active = G.playing && G.state !== 'dead';
  const mv = active ? input.move() : { x: 0, z: 0 };
  const m = moveVector(mv.x, mv.z);

  if (active) {
    G.time += dt;
    cds.tick(dt);
    G.invul = Math.max(0, G.invul - dt);

    // skills
    if (input.wants('dash') && cds.ready('dash') && !G.dash) { cds.trigger('dash'); input.consume('dash'); skills.dash(m.x, m.z); }
    if (!G.dash) {
      if (input.wants('ult') && G.energy >= SKILLS.ult.cost) { input.consume('ult'); G.energy = 0; skills.ult(); }
      else if (input.wants('nova') && cds.ready('nova')) { cds.trigger('nova'); input.consume('nova'); skills.nova(); }
      else if (input.wants('bolt') && cds.ready('bolt')) { cds.trigger('bolt'); input.consume('bolt'); skills.bolt(); }
      else if (input.wants('slash') && cds.ready('slash')) { cds.trigger('slash'); input.consume('slash'); skills.slash(); }
    }

    // movement
    if (G.dash) {
      G.dash.t -= dt;
      player.pos.x += G.dash.dx * SKILLS.dash.speed * dt; player.pos.z += G.dash.dz * SKILLS.dash.speed * dt;
      G.dash.ghost -= dt;
      if (G.dash.ghost <= 0) { player.ghost(); G.dash.ghost = 0.045; }
      if (G.dash.t <= 0) G.dash = null;
    } else {
      const slow = player.action && ['slash', 'bolt'].includes(player.action.name) ? 0.55 : player.action?.name === 'nova' ? 0.25 : 1;
      const tx = m.x * PLAYER.speed * slow, tz = m.z * PLAYER.speed * slow;
      const a = Math.min(1, PLAYER.accel * dt / PLAYER.speed);
      player.vel.x += (tx - player.vel.x) * a; player.vel.z += (tz - player.vel.z) * a;
      player.pos.x += player.vel.x * dt; player.pos.z += player.vel.z * dt;
      if (m.len > 0.05 && !(player.action && ['slash', 'bolt'].includes(player.action.name))) player.face(Math.atan2(m.x, m.z));
    }
    player.pos.addScaledVector(knock, dt); knock.multiplyScalar(Math.exp(-dt * 8));
    resolveCollisions(player.pos, player.r);

    // crystal
    if (world.crystal.on && (G.state === 'explore' || G.state === 'cleared') && Math.hypot(player.pos.x - SHRINE.x, player.pos.z - SHRINE.z) < SHRINE.pickupR + player.r) collectCrystal();

    // waves
    if (G.state === 'countdown') { G.countdown -= dt; if (G.countdown <= 0) startWave(); }
    if (G.state === 'wave') {
      G.spawnT -= dt;
      const w = WAVES[G.wave];
      if (G.queue.length && G.spawnT <= 0 && enemies.alive < w.maxAlive) { spawnFromQueue(); G.spawnT = w.interval; }
      if (!G.queue.length && enemies.alive === 0) waveCleared();
    }
  }

  // player invulnerability blink / hurt tint
  const blink = G.invul > 0 && !G.dash && Math.floor(elapsed * 20) % 2 === 0;
  player.setTint(player.hurtT > 0 ? 0.6 : blink ? 0.25 : 0, HURT);
  const moveSpeed = G.dash ? 7 : Math.hypot(player.vel.x, player.vel.z);
  player.update(dt, Math.min(1, moveSpeed / PLAYER.speed), moveSpeed);

  if (G.state !== 'title') enemies.update(dt, player, G);
  skills.update(dt);

  // souls
  for (let i = souls.length - 1; i >= 0; i--) {
    const s = souls[i]; s.t += dt;
    if (s.t < 0.45) { s.v.y -= 12 * dt; s.p.addScaledVector(s.v, dt); if (s.p.y < 0.4) { s.p.y = 0.4; s.v.y *= -0.4; } }
    else {
      const to = new T.Vector3(player.pos.x - s.p.x, 1.1 - s.p.y, player.pos.z - s.p.z);
      const d = to.length();
      s.p.addScaledVector(to.normalize(), Math.min(d, (6 + s.t * 18) * dt));
      if (d < 0.5) { G.energy = Math.min(100, G.energy + (G.boss && enemies.list.includes(G.boss) ? 3 : 5)); sfx.soul(); souls.splice(i, 1); particles.emit({ pos: s.p, count: 5, color: '#ffe38a', intensity: 2, size: 0.25, speed: 2, life: 0.3 }); continue; }
    }
    particles.emit({ pos: s.p, count: 1, color: '#ffe38a', intensity: 2.6, size: 0.4, sizeEnd: 0.1, life: 0.25 });
  }

  world.update(elapsed, dt);
  particles.update(dt);
  fx.update(dt);

  // flash light decays
  flashT = Math.max(0, flashT - dt * 2.5); flash.intensity = flashT * flashT * 60;

  // camera
  const lookAhead = new T.Vector3(player.vel.x * 0.18, 0, player.vel.z * 0.18);
  const title = G.state === 'title';
  const target = title
    ? new T.Vector3(player.pos.x + Math.sin(elapsed * 0.1) * 1.5 - 1.8, 2.6, player.pos.z + 6.8)
    : new T.Vector3(player.pos.x + lookAhead.x, 10.2 * camFar, player.pos.z + 8.4 * camFar + lookAhead.z);
  camPos.lerp(target, 1 - Math.exp(-dt * (title ? 1.5 : 5)));
  const look = title ? new T.Vector3(player.pos.x - 1.4, 1.35, player.pos.z) : new T.Vector3(player.pos.x + lookAhead.x, 0.8, player.pos.z + lookAhead.z - 0.6);
  camLook.lerp(look, 1 - Math.exp(-dt * (title ? 2 : 7)));
  G.shakeT = Math.max(0, G.shakeT - dt * 1.8);
  const sh = G.shakeT * G.shakeT * 0.6;
  camera.position.set(camPos.x + (Math.random() - 0.5) * sh, camPos.y + (Math.random() - 0.5) * sh, camPos.z + (Math.random() - 0.5) * sh);
  camera.lookAt(camLook);

  // shadow camera follows Mira
  moon.position.set(player.pos.x - 9, 22, player.pos.z + 6);
  moon.target.position.set(player.pos.x, 0, player.pos.z);

  hudT -= dt;
  if (hudT <= 0 && G.state !== 'title') { updateHUD(); hudT = 1 / 20; }
}
const HURT = new T.Color('#ff2250');

/* ---------- Buttons ---------- */
function setPaused(v) {
  if (!['explore', 'countdown', 'wave', 'cleared'].includes(G.state)) return;
  G.paused = v; input.clear();
  $('#screen-pause').classList.toggle('hidden', !v);
  $('#btn-pause').textContent = v ? '▶' : 'Ⅱ';
  if (v) $('#btn-resume').focus(); else canvas.focus();
}
$('#btn-start').onclick = startGame;
$('#btn-again').onclick = startGame;
$('#btn-pause').onclick = () => setPaused(!G.paused);
$('#btn-resume').onclick = () => setPaused(false);
$('#btn-quit').onclick = () => {
  setPaused(false); enemies.clear(); skills.clear(); G.state = 'title';
  player.reset(); world.crystal.show();
  $('#hud').classList.add('hidden'); $('#skills').classList.add('hidden'); $('#key-hint').classList.add('hidden');
  $('#screen-title').classList.remove('hidden');
  document.body.classList.remove('ingame');
  sfx.music('title');
};
/* Music and sound effects switch on/off separately; the choice is remembered. */
function syncAudioUI() {
  document.querySelectorAll('.tg-music').forEach((b) => { b.setAttribute('aria-pressed', String(sfx.musicOn)); b.classList.toggle('off', !sfx.musicOn); const s = b.querySelector('span'); if (s) s.textContent = sfx.musicOn ? 'Nhạc nền: bật' : 'Nhạc nền: tắt'; });
  document.querySelectorAll('.tg-sfx').forEach((b) => { b.setAttribute('aria-pressed', String(sfx.sfxOn)); b.classList.toggle('off', !sfx.sfxOn); const s = b.querySelector('span'); if (s) s.textContent = sfx.sfxOn ? 'Hiệu ứng: bật' : 'Hiệu ứng: tắt'; });
}
function toggleMusic() { sfx.unlock(); sfx.setMusicOn(!sfx.musicOn); storage.set('mira-music', sfx.musicOn ? '1' : '0'); syncAudioUI(); }
function toggleSfx() { sfx.unlock(); sfx.setSfxOn(!sfx.sfxOn); storage.set('mira-sfx', sfx.sfxOn ? '1' : '0'); syncAudioUI(); sfx.click(); }
document.querySelectorAll('.tg-music').forEach((b) => (b.onclick = toggleMusic));
document.querySelectorAll('.tg-sfx').forEach((b) => (b.onclick = toggleSfx));
if (storage.get('mira-music') === '0') sfx.musicOn = false;
if (storage.get('mira-sfx') === '0') sfx.sfxOn = false;
syncAudioUI();
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && G.state === 'studio') { studio.exit(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') setPaused(!G.paused);
  if (e.code === 'KeyM') toggleMusic();
  if (e.code === 'KeyN') toggleSfx();
  if (e.code === 'Enter' && G.state === 'title' && !$('#btn-start').disabled && document.activeElement?.tagName !== 'BUTTON') startGame();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
const best = Number(storage.get('mira-best') || 0);
if (best) $('#best').textContent = `Kỷ lục của bạn: ${best.toLocaleString('vi-VN')} điểm`;

/* ---------- Motion viewer ---------- */
const studio = new Studio({
  camera, canvas, scene, player, sfx, panel: $('#screen-studio'),
  onExit: () => { G.state = 'title'; world.crystal.show(); $('#screen-title').classList.remove('hidden'); sfx.music('title'); $('#btn-studio').focus(); },
});
function openStudio() {
  sfx.unlock(); sfx.open();
  G.state = 'studio';
  world.crystal.hide();
  $('#screen-title').classList.add('hidden');
  studio.enter();
}
$('#btn-studio').onclick = openStudio;
for (const b of document.querySelectorAll('.screen button:not(.tg-sfx):not(.tg-music), #btn-pause')) b.addEventListener('click', () => sfx.click());
$('#vol-music').oninput = (e) => { sfx.unlock(); sfx.setLevel('music', Number(e.target.value)); storage.set('mira-vol-music', e.target.value); };
$('#vol-sfx').oninput = (e) => { sfx.unlock(); sfx.setLevel('sfx', Number(e.target.value)); storage.set('mira-vol-sfx', e.target.value); };
for (const [k, id] of [['music', '#vol-music'], ['sfx', '#vol-sfx']]) { const v = storage.get(`mira-vol-${k}`); if (v !== null) { $(id).value = v; sfx.levels[k] = Number(v); } }
addEventListener('pointerdown', () => { if (G.state === 'title') sfx.unlock(); }, { once: true });

/* ---------- Boot ---------- */
world.crystal.show();
renderer.setAnimationLoop(frame);
const BASE = import.meta.env.BASE_URL;
const glbUrls = [`${BASE}mira-rigged.glb`, `${BASE}mira.glb`];
player.load(glbUrls, renderer, (e) => {
  if (!e.total) return;
  const p = Math.round((e.loaded / e.total) * 100);
  $('#load-fill').style.width = `${p}%`;
  $('#load-text').textContent = `Đang tải Mira… ${p}%`;
}).then((info) => {
  $('#load-fill').style.width = '100%';
  $('#load-text').textContent = info.rigged ? `Mira đã sẵn sàng · ${info.bones} xương · ${player.anim.motions.length} chuyển động` : 'Mira đã sẵn sàng';
  $('#btn-start').disabled = false;
  $('#btn-studio').disabled = !info.rigged;
  // Optional keyframed clips: list GLB files in public/anims/manifest.json
  fetch(`${BASE}anims/manifest.json`).then((r) => (r.ok ? r.json() : [])).then((list) => list.length && player.loadClips(list.map((f) => `${BASE}anims/${f}`))).catch(() => {});
  if (location.hash === '#studio' && info.rigged) openStudio();
  $('#btn-start').focus();
  renderer.compile(scene, camera);
}).catch((err) => {
  console.error(err);
  $('#load-text').textContent = 'Không tải được nhân vật. Hãy tải lại trang.';
});

if (DEBUG) {
  window.__MIRA__ = {
    G, player, enemies, cds, world, input,
    info: () => ({ fps: Math.round(fps), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, programs: renderer.info.programs?.length, model: player.info }),
    start: startGame,
    teleport: (x, z) => player.pos.set(x, 0, z),
    killAll: () => { G.queue.length = 0; for (const e of [...enemies.list]) if (e.state !== 'dying') enemies.hit(e, 99999, null, 0, false); },
    energy: (v) => { G.energy = v; },
    god: () => { G.invul = 1e9; },
    skipTo: (i) => { G.wave = i - 1; },
    advance: (sec) => { const n = Math.round(sec * 30); for (let i = 0; i < n; i++) tick(1 / 30); },
    press: (k) => input.press(k),
    studio, openStudio, sfx,
  };
}
