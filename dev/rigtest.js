import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Animator } from '../src/anim/animator.js';
import { MOTION } from '../src/anim/motions.js';
const W = 1500, H = 560;
const r = new T.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true });
r.setSize(W, H); r.outputColorSpace = T.SRGBColorSpace; r.setScissorTest(true);
const scene = new T.Scene(); scene.background = new T.Color('#2a2d44');
scene.add(new T.HemisphereLight('#fff', '#556', 2.2)); const d = new T.DirectionalLight('#fff', 2); d.position.set(2, 4, 3); scene.add(d);
const grid = new T.GridHelper(4, 16, '#667', '#445'); scene.add(grid);
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
const g = await loader.loadAsync('/mira-rigged.glb');
const model = g.scene; const box = new T.Box3().setFromObject(model); const s = 1.95 / box.getSize(new T.Vector3()).y;
model.scale.setScalar(s); scene.add(model);
const anim = new Animator(model);
const helper = new T.SkeletonHelper(model); helper.visible = new URLSearchParams(location.search).has('bones'); scene.add(helper);
const cams = [[0, 1.1, 4.2], [4.2, 1.1, 0], [3, 2.2, 3]].map((p) => { const c = new T.PerspectiveCamera(30, (W / 3) / H, 0.1, 50); c.position.set(...p); c.lookAt(0, 0.95, 0); return c; });
window.show = (id, t, params = {}) => {
  if (id === 'gaitAt') { const { gait } = window.__m; anim.rig && anim.apply(gait(t, { run: params.run ?? 0 })); }
  else if (id === 'raw') { anim.apply(params.pose); }
  else { anim.apply(MOTION[id].sample(t)); }
  model.updateMatrixWorld(true);
  cams.forEach((c, i) => { r.setViewport(i * W / 3, 0, W / 3, H); r.setScissor(i * W / 3, 0, W / 3, H); r.render(scene, c); });
  return true;
};
import * as M from '../src/anim/motions.js'; window.__m = M;
window.ready = anim.ok; window.bones = Object.keys(anim.rig.bones);
