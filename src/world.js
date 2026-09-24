import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OBSTACLES, PORTALS, mulberry32 } from './logic.js';

const rand = mulberry32(20260924);
const R = (a, b) => a + (b - a) * rand();

function noise2(x, z) {
  return Math.sin(x * 0.43 + z * 0.21) * 0.5 + Math.sin(x * 1.13 - z * 0.77) * 0.3 + Math.sin(-x * 2.1 + z * 1.9) * 0.2;
}

/** Collect meshes into a scratch group, then merge per material to cut draw calls. */
class Batch {
  constructor() { this.byMat = new Map(); }
  add(geo, mat, matrix, { cast = false } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new T.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const key = mat.uuid + cast;
    if (!this.byMat.has(key)) this.byMat.set(key, { mat, cast, list: [] });
    this.byMat.get(key).list.push(g);
  }
  flush(scene) {
    for (const { mat, cast, list } of this.byMat.values()) {
      const m = new T.Mesh(mergeGeometries(list), mat);
      m.castShadow = cast; m.receiveShadow = true;
      scene.add(m);
      list.forEach((g) => g.dispose());
    }
  }
}
const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz));

function runeTexture(color = '#bff8ff') {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.translate(256, 256);
  g.strokeStyle = color; g.fillStyle = color; g.lineCap = 'round';
  g.shadowColor = color; g.shadowBlur = 12;
  const circle = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  circle(244, 5); circle(226, 2); circle(150, 3); circle(136, 1.5);
  // glyph band
  for (let i = 0; i < 36; i++) {
    g.save(); g.rotate((i / 36) * Math.PI * 2); g.translate(0, -188);
    g.lineWidth = 3; g.beginPath();
    const t = i % 4;
    if (t === 0) { g.moveTo(0, -13); g.lineTo(9, 0); g.lineTo(0, 13); g.lineTo(-9, 0); g.closePath(); }
    else if (t === 1) { g.arc(0, 0, 7, 0, Math.PI * 2); g.moveTo(0, -15); g.lineTo(0, -8); g.moveTo(0, 8); g.lineTo(0, 15); }
    else if (t === 2) { g.arc(0, 4, 10, Math.PI * 1.1, Math.PI * 1.9); g.moveTo(0, -12); g.lineTo(0, 12); }
    else { g.arc(0, 0, 2.5, 0, Math.PI * 2); g.moveTo(-10, -10); g.lineTo(-4, -4); g.moveTo(10, -10); g.lineTo(4, -4); g.moveTo(-10, 10); g.lineTo(-4, 4); g.moveTo(10, 10); g.lineTo(4, 4); }
    g.stroke(); g.restore();
  }
  // star
  g.lineWidth = 3; g.beginPath();
  for (let i = 0; i <= 8; i++) { const a = (i * 3 / 8) * Math.PI * 2; g.lineTo(Math.sin(a) * 136, -Math.cos(a) * 136); }
  g.stroke();
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createWorld(scene, { low = false } = {}) {
  const time = { value: 0 };
  const updaters = [];
  const batch = new Batch();

  /* ---------- Sky: dusk gradient, moon, stars ---------- */
  const sky = new T.Mesh(new T.SphereGeometry(220, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new T.Color('#060a22') }, mid: { value: new T.Color('#251c52') }, hor: { value: new T.Color('#b85f78') }, glow: { value: new T.Color('#ffb27a') } },
    vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform vec3 top,mid,hor,glow; varying vec3 vP;
      void main(){ float h=vP.y;
        vec3 c=mix(hor,mid,smoothstep(-.02,.28,h)); c=mix(c,top,smoothstep(.28,.85,h));
        float sun=pow(max(0.,dot(normalize(vec3(.35,.05,-1.)),vP)),6.);
        c+=glow*sun*.55*(1.-smoothstep(0.,.4,h));
        c=mix(c,mid*.55,smoothstep(0.,-.35,h));
        gl_FragColor=vec4(c,1.); }`,
  }));
  scene.add(sky);

  const moon = new T.Mesh(new T.CircleGeometry(10, 48), new T.MeshBasicMaterial({ color: new T.Color(2.4, 2.2, 1.9), fog: false }));
  moon.position.set(-70, 70, -150); moon.lookAt(0, 0, 0); scene.add(moon);
  const halo = new T.Mesh(new T.CircleGeometry(26, 48), new T.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: T.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec2 vUv; void main(){ float r=length(vUv-.5)*2.; float a=pow(1.-clamp(r,0.,1.),2.2)*.55; gl_FragColor=vec4(vec3(1.,.85,.75)*a,a); }',
  }));
  halo.position.copy(moon.position).multiplyScalar(1.01); halo.lookAt(0, 0, 0); scene.add(halo);

  {
    const n = 900, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = rand() * Math.PI * 2, ph = R(0.08, 1.45);
      p[i * 3] = Math.cos(th) * Math.cos(ph) * 200; p[i * 3 + 1] = Math.sin(ph) * 200; p[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * 200;
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3));
    scene.add(new T.Points(g, new T.PointsMaterial({ color: '#e9e4ff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })));
  }

  /* ---------- Floating island ---------- */
  const groundGeo = new T.RingGeometry(0, 16, 128, 28);
  groundGeo.rotateX(-Math.PI / 2);
  {
    const pos = groundGeo.attributes.position, col = [];
    const a = new T.Color('#24483d'), b = new T.Color('#4a7349'), rim = new T.Color('#4b456f'), path = new T.Color('#8c8171');
    const c = new T.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), d = Math.hypot(x, z);
      const n = noise2(x, z) * 0.5 + 0.5;
      c.copy(a).lerp(b, n * 0.8);
      c.lerp(rim, THREE_smooth(12.5, 16, d) * 0.65);
      // worn stone path ring around the shrine and toward portals
      const pathRing = Math.exp(-Math.pow((d - 3.1) / 0.45, 2));
      const ang = Math.atan2(x, z); const spoke = Math.pow(Math.abs(Math.cos(ang * 2)), 40) * THREE_smooth(3, 4, d) * (1 - THREE_smooth(11.5, 12.5, d));
      c.lerp(path, Math.min(0.85, pathRing * 0.8 + spoke * 0.55));
      col.push(c.r, c.g, c.b);
      pos.setY(i, d > 15.2 ? -(d - 15.2) * 0.5 : noise2(x * 2, z * 2) * 0.03);
    }
    groundGeo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    groundGeo.computeVertexNormals();
  }
  const ground = new T.Mesh(groundGeo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const cliffGeo = new T.CylinderGeometry(15.6, 4, 11, 56, 8, true);
  {
    const p = cliffGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + noise2(x * 1.7 + y, z * 1.7 - y) * 0.09 + (y < 5 ? (rand() - 0.5) * 0.08 : 0);
      p.setXYZ(i, x * k, y, z * k);
    }
    cliffGeo.computeVertexNormals();
  }
  const rockMat = new T.MeshStandardMaterial({ color: '#4d4263', roughness: 0.9, flatShading: true });
  const cliff = new T.Mesh(cliffGeo, rockMat); cliff.position.y = -5.75; scene.add(cliff);

  // Hanging roots + tip rock
  const rootMat = new T.MeshStandardMaterial({ color: '#3a2f4a', roughness: 1 });
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, r = R(8, 14.6), len = R(2, 6);
    batch.add(new T.CylinderGeometry(0.05, 0.12, len, 5), rootMat, M4(Math.sin(a) * r * (1 - (len / 30)), -len / 2 - R(0.5, 3), Math.cos(a) * r, R(-0.1, 0.1), 0, R(-0.1, 0.1)));
  }

  /* ---------- Clouds far below and distant floating islets ---------- */
  const sea = new T.Mesh(new T.CircleGeometry(260, 64), new T.MeshBasicMaterial({ color: '#3d2d63' }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -22; scene.add(sea);

  const canopyMats = ['#2f6f6a', '#3b8a78', '#5b5aa6', '#7a5ca8'].map((c) => new T.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true }));
  const trunkMat = new T.MeshStandardMaterial({ color: '#4a3342', roughness: 1, flatShading: true });
  const fruitMat = new T.MeshStandardMaterial({ color: '#ffe3a0', emissive: '#ffb347', emissiveIntensity: 3.2 });
  const stoneMat = new T.MeshStandardMaterial({ color: '#8f89a6', roughness: 0.85, flatShading: true });
  const darkStone = new T.MeshStandardMaterial({ color: '#4b4760', roughness: 0.9, flatShading: true });
  const runeMat = new T.MeshStandardMaterial({ color: '#0e2230', emissive: '#6ff3ff', emissiveIntensity: 2.4 });
  const warmGlow = new T.MeshStandardMaterial({ color: '#ffcf8a', emissive: '#ffae4a', emissiveIntensity: 3 });

  function tree(x, z, s = 1, target = batch) {
    const h = R(2.2, 3.2) * s;
    target.add(new T.CylinderGeometry(0.16 * s, 0.3 * s, h, 6), trunkMat, M4(x, h / 2, z, R(-0.06, 0.06), 0, R(-0.06, 0.06)), { cast: true });
    const mat = canopyMats[Math.floor(rand() * canopyMats.length)];
    for (let k = 0; k < 3; k++) {
      const r = (1.25 - k * 0.28) * s * R(0.9, 1.1);
      target.add(new T.IcosahedronGeometry(r, 0), mat, M4(x + R(-0.3, 0.3) * s, h + k * 0.85 * s - 0.2, z + R(-0.3, 0.3) * s, rand(), rand(), rand()), { cast: true });
    }
    if (rand() < 0.55) for (let k = 0; k < 4; k++) {
      const a = rand() * Math.PI * 2;
      target.add(new T.SphereGeometry(0.09 * s, 8, 6), fruitMat, M4(x + Math.sin(a) * 1.1 * s, h + R(-0.4, 0.6) * s, z + Math.cos(a) * 1.1 * s));
    }
  }

  const islets = new T.Group(); scene.add(islets);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + R(-0.2, 0.2), r = R(34, 62);
    if (Math.cos(a) > 0.75) continue; // keep the camera-side horizon clear
    const g = new T.Group();
    const s = R(1.6, 4);
    const top = new T.Mesh(new T.CylinderGeometry(s, s * 0.9, 0.5, 10), new T.MeshStandardMaterial({ color: '#436b55', flatShading: true }));
    const bot = new T.Mesh(new T.ConeGeometry(s * 0.9, s * 2.4, 9), rockMat);
    bot.position.y = -s * 1.45; bot.rotation.x = Math.PI;
    g.add(top, bot);
    const b = new Batch(); tree(0, 0, s * 0.45, b); b.flush(g);
    g.position.set(Math.sin(a) * r, R(-4, 8), Math.cos(a) * r);
    g.userData.phase = rand() * 6;
    islets.add(g);
  }
  updaters.push((t) => islets.children.forEach((g, i) => { g.position.y += Math.sin(t * 0.4 + g.userData.phase) * 0.004; g.rotation.y = Math.sin(t * 0.05 + i) * 0.2; }));

  /* ---------- Trees on the rim (kept off the camera side) ---------- */
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + R(-0.08, 0.08);
    const r = R(14.1, 15.4);
    if (Math.cos(a) > 0.35) continue; // south (camera) side stays open
    tree(Math.sin(a) * r, Math.cos(a) * r, R(0.9, 1.35));
  }
  // Low bushes on the camera side
  for (let i = 0; i < 14; i++) {
    const a = R(-1.1, 1.1), r = R(13.8, 15.2);
    batch.add(new T.IcosahedronGeometry(R(0.4, 0.75), 0), canopyMats[i % 2], M4(Math.sin(a) * r, 0.25, Math.cos(a) * r, rand(), rand(), 0, 1, 0.7, 1));
  }

  /* ---------- Shrine at the centre ---------- */
  batch.add(new T.CylinderGeometry(2.3, 2.55, 0.28, 40), stoneMat, M4(0, 0.1, 0));
  batch.add(new T.CylinderGeometry(1.5, 1.6, 0.16, 32), darkStone, M4(0, 0.3, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    batch.add(new T.BoxGeometry(0.28, 0.9, 0.28), stoneMat, M4(Math.sin(a) * 2.2, 0.55, Math.cos(a) * 2.2, 0, a, 0), { cast: true });
    batch.add(new T.OctahedronGeometry(0.12, 0), runeMat, M4(Math.sin(a) * 2.2, 1.15, Math.cos(a) * 2.2));
  }
  const runeTex = runeTexture();
  const shrineRune = new T.Mesh(new T.PlaneGeometry(3.1, 3.1), new T.MeshBasicMaterial({ map: runeTex, color: new T.Color(1.0, 1.5, 1.7), transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
  shrineRune.rotation.x = -Math.PI / 2; shrineRune.position.y = 0.395; scene.add(shrineRune);
  const bigRune = new T.Mesh(new T.PlaneGeometry(8.2, 8.2), new T.MeshBasicMaterial({ map: runeTex, color: new T.Color(0.35, 0.8, 0.95), transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false }));
  bigRune.rotation.x = -Math.PI / 2; bigRune.position.y = 0.03; scene.add(bigRune);
  updaters.push((t) => { shrineRune.rotation.z = t * 0.25; bigRune.rotation.z = -t * 0.06; });

  /* ---------- Rune pillars (colliders) ---------- */
  for (const o of OBSTACLES) {
    const tilt = R(-0.07, 0.07), yaw = Math.atan2(o.x, o.z);
    batch.add(new T.CylinderGeometry(o.r + 0.25, o.r + 0.45, 0.35, 8), darkStone, M4(o.x, 0.12, o.z, 0, rand(), 0));
    const pil = M4(o.x, 1.7, o.z, tilt, yaw, tilt * 0.5);
    batch.add(new T.BoxGeometry(1.0, 3.4, 0.75), stoneMat, pil, { cast: true });
    batch.add(new T.BoxGeometry(1.2, 0.3, 0.95), stoneMat, M4(o.x, 3.45, o.z, tilt, yaw, tilt * 0.5), { cast: true });
    for (const side of [1, -1]) {
      const m = pil.clone().multiply(M4(0, 0.1, side * 0.385, 0, side > 0 ? 0 : Math.PI, 0));
      batch.add(new T.PlaneGeometry(0.22, 2.4), runeMat, m);
    }
    for (let k = 0; k < 4; k++) {
      const a = rand() * Math.PI * 2;
      batch.add(new T.DodecahedronGeometry(R(0.15, 0.32), 0), darkStone, M4(o.x + Math.sin(a) * 1.2, 0.1, o.z + Math.cos(a) * 1.2, rand(), rand(), rand()));
    }
  }

  /* ---------- Stone lanterns ---------- */
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + (i - 2.5) * 0.42, r = 13.4;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    batch.add(new T.CylinderGeometry(0.22, 0.32, 1.1, 6), stoneMat, M4(x, 0.55, z), { cast: true });
    batch.add(new T.BoxGeometry(0.55, 0.45, 0.55), warmGlow, M4(x, 1.3, z));
    batch.add(new T.ConeGeometry(0.55, 0.45, 4), darkStone, M4(x, 1.75, z, 0, Math.PI / 4, 0), { cast: true });
  }

  batch.flush(scene);

  /* ---------- Grass with wind sway (instanced) ---------- */
  {
    const n = low ? 2200 : 5200;
    const blade = new T.ConeGeometry(0.06, 0.55, 3); blade.translate(0, 0.27, 0);
    const mat = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3][0], 0., instanceMatrix[3][2]);
        float sway = sin(uTime*1.8 + ip.x*.45 + ip.z*.3)*.5 + sin(uTime*3.1 + ip.x*1.3)*.2;
        transformed.x += sway * .16 * position.y * 2.;
        transformed.z += sway * .08 * position.y * 2.;`);
    };
    const grass = new T.InstancedMesh(blade, mat, n);
    const d = new T.Object3D(), c = new T.Color();
    let i = 0;
    while (i < n) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 15.3;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (r < 2.7 || Math.abs(r - 3.1) < 0.35) continue;
      if (OBSTACLES.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 0.5)) continue;
      d.position.set(x, 0, z); d.rotation.set(R(-0.25, 0.25), rand() * 6.3, R(-0.25, 0.25));
      d.scale.setScalar(R(0.55, 1.35)); d.updateMatrix();
      grass.setMatrixAt(i, d.matrix);
      c.setHSL(R(0.3, 0.45), R(0.3, 0.5), R(0.13, 0.26)); grass.setColorAt(i, c);
      i++;
    }
    grass.receiveShadow = true;
    scene.add(grass);
  }

  /* ---------- Glowing mushrooms (instanced, HDR instance colour so they bloom) ---------- */
  {
    const n = 70;
    const stems = new T.InstancedMesh(new T.CylinderGeometry(0.035, 0.05, 0.3, 5).translate(0, 0.15, 0), new T.MeshStandardMaterial({ color: '#d9d2e6' }), n);
    const capG = new T.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.28, 0);
    const caps = new T.InstancedMesh(capG, new T.MeshBasicMaterial({ color: '#ffffff' }), n);
    const d = new T.Object3D();
    for (let i = 0; i < n; i++) {
      const cluster = Math.floor(i / 5);
      const ca = cluster * 2.39, cr = cluster % 2 ? R(12, 13.8) : R(9.5, 11);
      const x = Math.sin(ca) * cr + R(-0.6, 0.6), z = Math.cos(ca) * cr + R(-0.6, 0.6);
      d.position.set(x, 0, z); d.rotation.set(R(-0.2, 0.2), 0, R(-0.2, 0.2)); d.scale.setScalar(R(0.7, 1.8)); d.updateMatrix();
      stems.setMatrixAt(i, d.matrix); caps.setMatrixAt(i, d.matrix);
      caps.setColorAt(i, cluster % 3 === 0 ? new T.Color(1.5, 0.45, 1.4) : new T.Color(0.3, 1.3, 1.6));
    }
    scene.add(stems, caps);
  }

  /* ---------- Fireflies ---------- */
  {
    const n = low ? 120 : 240, p = new Float32Array(n * 3), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 17;
      p[i * 3] = Math.sin(a) * r; p[i * 3 + 1] = R(0.4, 4); p[i * 3 + 2] = Math.cos(a) * r; ph[i] = rand() * 100;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(p, 3));
    g.setAttribute('phase', new T.BufferAttribute(ph, 1));
    const m = new T.ShaderMaterial({
      uniforms: { uTime: time, uScale: { value: 600 } }, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: `attribute float phase; uniform float uTime, uScale; varying float vA;
        void main(){ vec3 p=position; p.x+=sin(uTime*.35+phase)*1.2; p.y+=sin(uTime*.6+phase*1.7)*.5; p.z+=cos(uTime*.3+phase*.8)*1.2;
          vA=.35+.65*pow(.5+.5*sin(uTime*2.2+phase*3.),3.);
          vec4 mv=modelViewMatrix*vec4(p,1.); gl_PointSize=.22*uScale/-mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,d); a*=a;
        gl_FragColor=vec4(vec3(1.6,2.,.9)*a*vA, a*vA); }`,
    });
    const pts = new T.Points(g, m); pts.frustumCulled = false; scene.add(pts);
    updaters.push(() => { m.uniforms.uScale.value = innerHeight * 0.9; });
  }

  /* ---------- Portals ---------- */
  const portals = PORTALS.map((P) => {
    const g = new T.Group();
    g.position.set(P.x, 0, P.z);
    g.rotation.y = P.angle;
    const ringMat = new T.MeshStandardMaterial({ color: '#2a2440', roughness: 0.6, emissive: '#b04dff', emissiveIntensity: 0.4 });
    const ring = new T.Mesh(new T.TorusGeometry(1.35, 0.16, 10, 36), ringMat); ring.position.y = 1.6; ring.castShadow = true;
    const discMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
      uniforms: { uTime: time, uI: { value: 0.35 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform float uTime, uI; varying vec2 vUv;
        void main(){ vec2 p=vUv-.5; float r=length(p)*2.; if(r>1.) discard; float a=atan(p.y,p.x);
          float sw=sin(a*3.+r*9.-uTime*4.)*.5+.5; float core=pow(1.-r,1.5);
          vec3 c=mix(vec3(.35,.05,.6),vec3(1.2,.3,1.6),sw)*(.4+core*1.4);
          gl_FragColor=vec4(c*uI*2.,(.35+sw*.4)*uI*smoothstep(1.,.85,r)); }`,
    });
    const disc = new T.Mesh(new T.CircleGeometry(1.25, 40), discMat); disc.position.y = 1.6;
    const base1 = new T.Mesh(new T.BoxGeometry(0.6, 0.5, 0.6), darkStone); base1.position.set(-1.35, 0.25, 0);
    const base2 = base1.clone(); base2.position.x = 1.35;
    g.add(ring, disc, base1, base2);
    scene.add(g);
    let level = 0.35, target = 0.35;
    updaters.push((t, dt) => { level += (target - level) * Math.min(1, dt * 3); discMat.uniforms.uI.value = level; ringMat.emissiveIntensity = 0.3 + level * 2.2; ring.rotation.z = t * 0.2; });
    return { x: P.x, z: P.z, angle: P.angle, setActive: (on) => { target = on ? 1 : 0.35; } };
  });

  /* ---------- Linh Tinh (the glowing collectible) ---------- */
  const crystal = new T.Group(); scene.add(crystal);
  const gem = new T.Mesh(new T.OctahedronGeometry(0.42, 0), new T.MeshStandardMaterial({ color: '#fff2c4', emissive: '#ffbf40', emissiveIntensity: 2.2, roughness: 0.15, metalness: 0.1, flatShading: true }));
  gem.scale.y = 1.7; gem.position.y = 1.65; crystal.add(gem);
  const core = new T.Mesh(new T.SphereGeometry(0.75, 16, 12), new T.MeshBasicMaterial({ color: new T.Color(1.4, 0.9, 0.35), transparent: true, opacity: 0.1, blending: T.AdditiveBlending, depthWrite: false }));
  core.position.y = 1.65; crystal.add(core);
  const orbiters = [];
  for (let i = 0; i < 3; i++) {
    const o = new T.Mesh(new T.OctahedronGeometry(0.11, 0), new T.MeshStandardMaterial({ color: '#dffcff', emissive: '#6ff3ff', emissiveIntensity: 3 }));
    crystal.add(o); orbiters.push(o);
  }
  const beam = new T.Mesh(new T.CylinderGeometry(0.45, 0.9, 16, 24, 1, true), new T.ShaderMaterial({
    transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, uniforms: { uTime: time },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){ float f=pow(1.-vUv.y,1.6); float s=.75+.25*sin(vUv.x*40.+uTime*3.-vUv.y*10.);
      gl_FragColor=vec4(vec3(1.,.78,.35)*f*s*.55, f*s*.35); }`,
  }));
  beam.position.y = 8; crystal.add(beam);
  const crystalLight = new T.PointLight('#ffcf6b', 0, 11, 1.6); crystalLight.position.set(0, 2.2, 0); scene.add(crystalLight);
  let crystalOn = false, crystalFade = 0;
  crystal.visible = false;
  updaters.push((t, dt) => {
    crystalFade += ((crystalOn ? 1 : 0) - crystalFade) * Math.min(1, dt * 4);
    crystal.visible = crystalFade > 0.02;
    crystal.scale.setScalar(0.4 + crystalFade * 0.6);
    crystalLight.intensity = crystalFade * 16;
    gem.rotation.y = t * 1.2; gem.position.y = 1.65 + Math.sin(t * 2) * 0.12;
    core.position.y = gem.position.y; core.scale.setScalar(1 + Math.sin(t * 3.3) * 0.08);
    orbiters.forEach((o, i) => { const a = t * 1.8 + (i * Math.PI * 2) / 3; o.position.set(Math.cos(a) * 0.85, gem.position.y + Math.sin(t * 2 + i) * 0.3, Math.sin(a) * 0.85); o.rotation.y = t * 3; });
    shrineRune.material.color.setRGB(1.0 + crystalFade * 1.0, 1.5 + crystalFade * 0.4, 1.7 - crystalFade * 0.6);
  });

  return {
    time,
    portals,
    crystal: { show() { crystalOn = true; }, hide() { crystalOn = false; }, get on() { return crystalOn; }, pos: new T.Vector3(0, 1.6, 0) },
    update(t, dt) { time.value = t; for (const u of updaters) u(t, dt); },
  };
}

function THREE_smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
