import * as T from 'three';

/* ---------- GPU point particles (one draw call for every spark, dust puff and soul) ---------- */
export class Particles {
  constructor(scene, max = 2400) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.cursor = 0;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('color', new T.BufferAttribute(this.col, 3).setUsage(T.DynamicDrawUsage));
    g.setAttribute('size', new T.BufferAttribute(this.size, 1).setUsage(T.DynamicDrawUsage));
    g.setAttribute('alpha', new T.BufferAttribute(this.alpha, 1).setUsage(T.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 600 } };
    const m = new T.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float size; attribute float alpha; attribute vec3 color;
        uniform float uScale; varying vec3 vC; varying float vA;
        void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.);
          gl_PointSize = size*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: /* glsl */`
        varying vec3 vC; varying float vA;
        void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,.0,d); a*=a;
          if(vA<=0.001) discard; gl_FragColor=vec4(vC*a*vA, a*vA); }`,
    });
    this.points = new T.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
  }
  emit(o) {
    const n = o.count ?? 1;
    const c = o.color instanceof T.Color ? o.color : new T.Color(o.color ?? '#ffffff');
    const k = o.intensity ?? 1;
    for (let i = 0; i < n; i++) {
      const p = this.cursor; this.cursor = (this.cursor + 1) % this.max;
      const sp = o.spread ?? 0;
      this.pos[p * 3] = o.pos.x + (Math.random() - 0.5) * sp;
      this.pos[p * 3 + 1] = o.pos.y + (Math.random() - 0.5) * (o.spreadY ?? sp);
      this.pos[p * 3 + 2] = o.pos.z + (Math.random() - 0.5) * sp;
      const sd = o.speed ?? 0, dir = o.dir;
      let vx = (Math.random() - 0.5), vy = (Math.random() - 0.5), vz = (Math.random() - 0.5);
      const l = Math.hypot(vx, vy, vz) || 1; vx /= l; vy /= l; vz /= l;
      const r = sd * (0.35 + Math.random() * 0.65);
      this.vel[p * 3] = vx * r + (dir?.x ?? 0);
      this.vel[p * 3 + 1] = vy * r * (o.flat ? 0.15 : 1) + (dir?.y ?? 0) + (o.up ?? 0);
      this.vel[p * 3 + 2] = vz * r + (dir?.z ?? 0);
      const life = (o.life ?? 0.6) * (0.6 + Math.random() * 0.6);
      this.life[p] = life; this.maxLife[p] = life;
      this.s0[p] = (o.size ?? 0.3) * (0.7 + Math.random() * 0.6);
      this.s1[p] = o.sizeEnd ?? 0;
      this.grav[p] = o.gravity ?? 0;
      this.drag[p] = o.drag ?? 1.5;
      const jitter = o.jitter ?? 0.12;
      this.col[p * 3] = c.r * k * (1 - jitter + Math.random() * jitter * 2);
      this.col[p * 3 + 1] = c.g * k * (1 - jitter + Math.random() * jitter * 2);
      this.col[p * 3 + 2] = c.b * k * (1 - jitter + Math.random() * jitter * 2);
    }
  }
  update(dt) {
    for (let p = 0; p < this.max; p++) {
      if (this.life[p] <= 0) { this.alpha[p] = 0; continue; }
      this.life[p] -= dt;
      const t = 1 - Math.max(0, this.life[p]) / this.maxLife[p];
      const dr = Math.exp(-this.drag[p] * dt);
      this.vel[p * 3] *= dr; this.vel[p * 3 + 1] = this.vel[p * 3 + 1] * dr - this.grav[p] * dt; this.vel[p * 3 + 2] *= dr;
      this.pos[p * 3] += this.vel[p * 3] * dt;
      this.pos[p * 3 + 1] += this.vel[p * 3 + 1] * dt;
      this.pos[p * 3 + 2] += this.vel[p * 3 + 2] * dt;
      this.size[p] = this.s0[p] + (this.s1[p] - this.s0[p]) * t;
      this.alpha[p] = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
  }
}

/* ---------- Shared geometry/material helpers for short-lived effects ---------- */
const additive = (color, opacity = 1, side = T.DoubleSide) =>
  new T.MeshBasicMaterial({ color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, side, fog: false });

// Radial-gradient ring material driven by a progress uniform.
function ringMaterial(color, softness = 0.35) {
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    uniforms: { uColor: { value: new T.Color(color) }, uAlpha: { value: 1 }, uSoft: { value: softness } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha, uSoft; varying vec2 vUv;
      void main(){ float r=length(vUv-.5)*2.; float edge=smoothstep(1.,1.-uSoft,r)*smoothstep(1.-uSoft*2.2,1.-uSoft,r);
        gl_FragColor=vec4(uColor*edge*uAlpha*2.2, edge*uAlpha); }`,
  });
}

function telegraphMaterial() {
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide,
    uniforms: { uP: { value: 0 }, uColor: { value: new T.Color('#ff3b5c') } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float uP; uniform vec3 uColor; varying vec2 vUv;
      void main(){ float r=length(vUv-.5)*2.; if(r>1.) discard;
        float rim=smoothstep(.9,.97,r)*(1.-smoothstep(.97,1.,r));
        float fill=step(r,uP)*.32 + smoothstep(uP-.06,uP,r)*step(r,uP)*.6;
        float a=rim*.95+fill; gl_FragColor=vec4(uColor*(1.4+rim), a*.85); }`,
  });
}

export class Effects {
  constructor(scene, particles) {
    this.scene = scene;
    this.p = particles;
    this.items = [];
    this.geo = {
      plane: new T.PlaneGeometry(1, 1),
      sphere: new T.SphereGeometry(1, 16, 12),
      arc: new T.RingGeometry(1.15, 2.75, 40, 1, -1.25, 2.5),
      arcThin: new T.RingGeometry(2.35, 2.7, 40, 1, -1.3, 2.6),
      beam: new T.CylinderGeometry(1, 1, 1, 16, 1, true),
    };
  }
  add(obj, dur, fn) { this.scene.add(obj); this.items.push({ obj, dur, t: 0, fn }); return obj; }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      it.fn(k, it.obj, dt);
      if (k >= 1) {
        this.scene.remove(it.obj);
        it.obj.traverse((o) => { if (o.material) o.material.dispose(); });
        this.items.splice(i, 1);
      }
    }
  }

  /** Crescent sweep in front of the attacker. */
  slash(pos, yaw, color = '#ffd76a', flip = false) {
    const g = new T.Group();
    g.position.set(pos.x, 1.0, pos.z);
    g.rotation.y = yaw;
    const inner = new T.Mesh(this.geo.arc, additive(new T.Color(color).multiplyScalar(1.6), 0.9));
    const edge = new T.Mesh(this.geo.arcThin, additive(new T.Color(3, 2.8, 2.2), 1));
    for (const m of [inner, edge]) { m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.PI / 2; g.add(m); }
    g.scale.set(flip ? -1 : 1, 1, 1);
    const s = flip ? -1 : 1;
    this.add(g, 0.26, (k, o) => {
      o.rotation.y = yaw + s * (-0.9 + k * 1.3);
      const e = 1 - k;
      inner.material.opacity = 0.75 * e * e;
      edge.material.opacity = e;
      const sc = 0.85 + k * 0.25;
      o.scale.set(s * sc, 1, sc);
    });
    // Sparks trail along the arc
    for (let i = 0; i < 10; i++) {
      const a = yaw - 1.0 + (i / 9) * 2.0;
      this.p.emit({ pos: { x: pos.x + Math.sin(a) * 2.2, y: 1.0, z: pos.z + Math.cos(a) * 2.2 }, count: 2, color, intensity: 2.5, size: 0.22, speed: 2, life: 0.35 });
    }
  }

  ring(pos, { color = '#7ff0ff', from = 0.3, to = 4, dur = 0.5, y = 0.32, soft = 0.3 } = {}) {
    const m = new T.Mesh(this.geo.plane, ringMaterial(color, soft));
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, y, pos.z);
    this.add(m, dur, (k, o) => {
      const e = 1 - Math.pow(1 - k, 3);
      const s = (from + (to - from) * e) * 2;
      o.scale.set(s, s, 1);
      o.material.uniforms.uAlpha.value = 1 - k;
    });
  }

  /** Vertical column of light (meteor impact, crystal pickup). */
  pillar(pos, { color = '#ffd76a', radius = 0.8, height = 9, dur = 0.6 } = {}) {
    const m = new T.Mesh(this.geo.beam, additive(color, 0.6));
    m.position.set(pos.x, height / 2, pos.z);
    this.add(m, dur, (k, o) => {
      o.scale.set(radius * (1 - k * 0.7), height, radius * (1 - k * 0.7));
      o.material.opacity = 0.6 * (1 - k);
    });
  }

  flashSphere(pos, { color = '#ffffff', from = 0.2, to = 2, dur = 0.25 } = {}) {
    const m = new T.Mesh(this.geo.sphere, additive(color, 0.8));
    m.position.copy(pos);
    this.add(m, dur, (k, o) => { o.scale.setScalar(from + (to - from) * k); o.material.opacity = 0.8 * (1 - k); });
  }

  telegraph(pos, radius, dur) {
    const m = new T.Mesh(this.geo.plane, telegraphMaterial());
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.06, pos.z);
    m.scale.set(radius * 2, radius * 2, 1);
    m.renderOrder = 5;
    this.add(m, dur, (k, o) => { o.material.uniforms.uP.value = k; });
    return m;
  }

  burst(pos, color, n = 26, power = 5) {
    this.p.emit({ pos, count: n, color, intensity: 2.2, size: 0.34, sizeEnd: 0.05, speed: power, life: 0.7, gravity: 4, drag: 2.5, spread: 0.4 });
    this.p.emit({ pos, count: 8, color: '#ffffff', intensity: 2, size: 0.5, speed: power * 0.4, life: 0.25 });
  }
}

/* ---------- DOM overlays: damage numbers, enemy HP bars, off-screen arrows ---------- */
export class Overlay {
  constructor(root, camera) {
    this.root = root; this.camera = camera;
    this.v = new T.Vector3();
  }
  project(p, y = 0) {
    this.v.set(p.x, (p.y ?? 0) + y, p.z).project(this.camera);
    return { x: (this.v.x * 0.5 + 0.5) * innerWidth, y: (-this.v.y * 0.5 + 0.5) * innerHeight, behind: this.v.z > 1 };
  }
  number(pos, text, kind = '') {
    const s = this.project(pos, 1.6);
    const el = document.createElement('div');
    el.className = `dmg ${kind}`;
    el.textContent = text;
    el.style.left = `${s.x + (Math.random() - 0.5) * 30}px`;
    el.style.top = `${s.y}px`;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }
  bar(boss = false) {
    const el = document.createElement('div');
    el.className = boss ? 'ebar boss' : 'ebar';
    el.innerHTML = '<i></i>';
    this.root.appendChild(el);
    return el;
  }
  arrow() {
    const el = document.createElement('div');
    el.className = 'edge-arrow';
    this.root.appendChild(el);
    return el;
  }
}
