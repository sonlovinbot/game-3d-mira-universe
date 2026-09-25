import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MOTIONS } from './anim/motions.js';

/**
 * In-game motion viewer ("Chuyển động"): plays each of Mira's motions on the island, with camera
 * presets, orbit, slow motion and a skeleton overlay. Buttons are generated from the motion
 * registry, so a newly added motion (or a clip dropped into public/anims/) appears here as-is.
 */
const DEMOS = [
  { id: 'demo-walk', label: 'Đi vòng tròn', group: 'Trình diễn' },
  { id: 'demo-run', label: 'Chạy vòng tròn', group: 'Trình diễn' },
  { id: 'demo-stop', label: 'Chạy → dừng → đứng', group: 'Trình diễn' },
];

const VIEWS = {
  front: { label: 'Trước', dir: [0, 0.18, 1] },
  back: { label: 'Sau', dir: [0, 0.18, -1] },
  left: { label: 'Trái', dir: [1, 0.15, 0] },
  right: { label: 'Phải', dir: [-1, 0.15, 0] },
  top: { label: 'Trên', dir: [0.001, 1, 0.12] },
  game: { label: 'Góc game', dir: [0, 1.21, 1] },
};

export class Studio {
  constructor({ camera, canvas, scene, player, panel, sfx, onExit }) {
    Object.assign(this, { camera, scene, player, panel, sfx, onExit });
    this.controls = new OrbitControls(camera, canvas);
    this.controls.enabled = false;
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.6; this.controls.maxDistance = 14;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.target.set(0, 1, 0);
    this.active = false;
    this.timeScale = 1;
    this.view = 'front';
    this.home = new T.Vector3(0, 0, 5.2);
    this.demoT = 0;
    this.helper = null;
    this.build();
  }

  build() {
    const list = this.panel.querySelector('#studio-motions');
    const groups = {};
    for (const m of [...MOTIONS, ...DEMOS]) (groups[m.group] ||= []).push(m);
    list.innerHTML = '';
    for (const [g, items] of Object.entries(groups)) {
      const sec = document.createElement('section');
      sec.innerHTML = `<h3>${g}</h3>`;
      const row = document.createElement('div'); row.className = 'chips';
      for (const m of items) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'chip'; b.textContent = m.label; b.dataset.motion = m.id;
        b.onclick = () => { this.sfx.click(); this.select(m.id); };
        row.appendChild(b);
      }
      sec.appendChild(row); list.appendChild(sec);
    }
    const views = this.panel.querySelector('#studio-views');
    views.innerHTML = '';
    for (const [k, v] of Object.entries(VIEWS)) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip small'; b.textContent = v.label; b.dataset.view = k;
      b.onclick = () => { this.sfx.click(); this.setView(k); };
      views.appendChild(b);
    }
    this.panel.querySelector('#studio-speed').oninput = (e) => {
      this.timeScale = Number(e.target.value);
      this.panel.querySelector('#studio-speed-val').textContent = `${this.timeScale.toFixed(2)}×`;
    };
    this.panel.querySelector('#studio-orbit').onchange = (e) => { this.controls.autoRotate = e.target.checked; };
    this.panel.querySelector('#studio-bones').onchange = (e) => this.showBones(e.target.checked);
    this.panel.querySelector('#studio-close').onclick = () => { this.sfx.click(); this.exit(); };
  }

  enter() {
    this.active = true;
    this.player.reset();
    this.player.pos.copy(this.home);
    this.player.face(0, true);
    this.controls.enabled = true;
    this.controls.autoRotate = this.panel.querySelector('#studio-orbit').checked;
    this.controls.autoRotateSpeed = 1.2;
    this.panel.classList.remove('hidden');
    this.select('idle');
    this.setView('front', true);
    this.sfx.music('studio');
  }

  exit() {
    this.active = false;
    this.controls.enabled = false;
    this.showBones(false);
    this.panel.querySelector('#studio-bones').checked = false;
    this.player.anim?.force(null);
    this.player.reset();
    this.panel.classList.add('hidden');
    this.onExit?.();
  }

  select(id) {
    this.current = id;
    this.demoT = 0;
    this.player.pos.copy(this.home); this.player.face(0, true);
    this.player.vel.set(0, 0, 0);
    this.panel.querySelectorAll('[data-motion]').forEach((b) => b.classList.toggle('on', b.dataset.motion === id));
    const m = MOTIONS.find((x) => x.id === id);
    const anim = this.player.anim;
    if (m) {
      anim?.force(id);
      const src = anim?.clips[id] ? 'clip keyframe từ file GLB' : 'hoạt ảnh xương dựng trong code';
      this.info(`<b>${m.label}</b> · ${m.duration.toFixed(2)} s · ${m.loop ? 'lặp' : 'một lần'} · ${m.layer === 'upper' ? 'thân trên, chồng lên bước chạy' : 'toàn thân'}<br><span>Nguồn: ${src}</span>`);
    } else {
      anim?.force(null);
      const d = DEMOS.find((x) => x.id === id);
      this.info(`<b>${d.label}</b><br><span>Đi, chạy và dừng thật trên đảo: nhịp bước theo tốc độ di chuyển, tự chuyển đi ↔ chạy, có động tác phanh khi dừng.</span>`);
    }
  }

  info(html) { this.panel.querySelector('#studio-info').innerHTML = html; }

  setView(k, instant = false) {
    this.view = k;
    this.panel.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === k));
    const narrow = innerWidth < 760 && innerHeight > innerWidth;
    const v = VIEWS[k], dist = (k === 'game' ? 11 : k === 'top' ? 6.5 : 4.4) * (narrow ? 1.45 : 1);
    const d = new T.Vector3(...v.dir).normalize().multiplyScalar(dist);
    this.camGoal = d;
    if (instant) this.camera.position.copy(this.controls.target).add(d);
  }

  showBones(on) {
    if (on && !this.helper && this.player.model) {
      this.helper = new T.SkeletonHelper(this.player.model);
      this.helper.material.depthTest = false; this.helper.material.transparent = true; this.helper.renderOrder = 30;
      this.helper.setColors?.(new T.Color(0.4, 2.6, 2.8), new T.Color(2.8, 2.2, 0.8));
      this.scene.add(this.helper);
    }
    if (this.helper) this.helper.visible = on;
  }

  update(dt) {
    const p = this.player, ts = this.timeScale;
    let speed = 0;
    if (this.current?.startsWith('demo')) {
      this.demoT += dt * ts;
      const R = 3.2;
      let v = this.current === 'demo-walk' ? 2.2 : 6.2;
      if (this.current === 'demo-stop') {
        const c = this.demoT % 4.5; // run 2.2 s, stop, stand
        v = c < 2.2 ? 6.2 : 0;
      }
      if (v > 0) {
        this.ang = (this.ang || 0) + (v / R) * dt * ts;
        const x = this.home.x + Math.sin(this.ang) * R - 0, z = this.home.z - R + Math.cos(this.ang) * R;
        const nx = x - p.pos.x, nz = z - p.pos.z;
        p.pos.set(x, 0, z);
        p.face(Math.atan2(nx, nz));
      }
      speed = v;
      p.vel.set(0, 0, 0);
    }
    p.update(dt * ts, Math.min(1, speed / 6.2), speed);
    // camera follows her
    // on phones the panel covers the lower half, so aim below her to lift her into the upper half
    const narrow = innerWidth < 760 && innerHeight > innerWidth;
    const tgt = new T.Vector3(p.pos.x, narrow ? -0.35 : 1.05, p.pos.z);
    const delta = tgt.clone().sub(this.controls.target);
    this.controls.target.add(delta.multiplyScalar(Math.min(1, dt * 6)));
    if (this.camGoal) {
      const want = this.controls.target.clone().add(this.camGoal);
      this.camera.position.lerp(want, 1 - Math.exp(-dt * 4));
      if (this.camera.position.distanceTo(want) < 0.05) this.camGoal = null;
    } else this.camera.position.add(delta);
    this.controls.update();
  }
}
