const KEYMAP = {
  KeyJ: 'slash', Digit1: 'slash', Numpad1: 'slash',
  KeyK: 'bolt', Digit2: 'bolt', Numpad2: 'bolt',
  KeyL: 'nova', Digit3: 'nova', Numpad3: 'nova',
  Space: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash',
  KeyU: 'ult', KeyI: 'ult', Digit4: 'ult', Numpad4: 'ult',
};
const MOVE = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
const BUFFER = 0.22; // seconds a tapped skill stays queued while on cooldown

export class Input {
  constructor({ canvas, stickZone, stick, knob, skillButtons }) {
    this.keys = new Set();
    this.held = new Set();
    this.queued = new Map();
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.enabled = true;
    this.touchMode = matchMedia('(pointer: coarse)').matches;
    this.onTouchMode = null;

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLButtonElement && (e.code === 'Space' || e.code === 'Enter')) return;
      if (MOVE[e.code] || KEYMAP[e.code]) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = KEYMAP[e.code];
      if (a) this.press(a);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); const a = KEYMAP[e.code]; if (a) this.held.delete(a); });
    addEventListener('blur', () => this.clear());

    // Left mouse on the canvas = slash
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) { this.press('slash'); canvas.setPointerCapture(e.pointerId); }
    });
    canvas.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') this.held.delete('slash'); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Floating virtual joystick
    const setKnob = () => { knob.style.transform = `translate(${this.stick.x * 46}px, ${this.stick.y * 46}px)`; };
    stickZone.addEventListener('pointerdown', (e) => {
      if (this.stick.id !== null) return;
      e.preventDefault();
      this.setTouchMode(true);
      stickZone.setPointerCapture(e.pointerId);
      const r = stickZone.getBoundingClientRect();
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      stick.style.left = `${e.clientX - r.left}px`; stick.style.top = `${e.clientY - r.top}px`;
      stick.classList.add('on'); setKnob();
    });
    stickZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.id) return;
      let dx = (e.clientX - this.stick.ox) / 46, dy = (e.clientY - this.stick.oy) / 46;
      const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      this.stick.x = dx; this.stick.y = dy; setKnob();
    });
    const end = (e) => { if (e.pointerId !== this.stick.id) return; this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; stick.classList.remove('on'); setKnob(); };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) stickZone.addEventListener(ev, end);

    // Skill buttons (hold = repeat when ready)
    for (const b of skillButtons) {
      const a = b.dataset.skill;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (e.pointerType !== 'mouse') this.setTouchMode(true); b.setPointerCapture(e.pointerId); b.classList.add('held'); this.press(a); });
      const rel = () => { b.classList.remove('held'); this.held.delete(a); };
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, rel);
    }
    addEventListener('touchstart', () => this.setTouchMode(true), { passive: true, once: true });
  }

  setTouchMode(v) { if (this.touchMode !== v) { this.touchMode = v; this.onTouchMode?.(v); } }

  press(a) { this.held.add(a); this.queued.set(a, performance.now()); }

  /** True if the skill is held or was tapped within the buffer window. */
  wants(a) {
    if (!this.enabled) return false;
    if (this.held.has(a)) return true;
    const t = this.queued.get(a);
    if (t === undefined) return false;
    if (performance.now() - t > BUFFER * 1000) { this.queued.delete(a); return false; }
    return true;
  }
  consume(a) { this.queued.delete(a); }

  move() {
    if (!this.enabled) return { x: 0, z: 0 };
    let x = 0, z = 0;
    for (const k of this.keys) { const m = MOVE[k]; if (m) { x += m[0]; z += m[1]; } }
    x = Math.max(-1, Math.min(1, x)); z = Math.max(-1, Math.min(1, z));
    if (this.stick.id !== null) {
      const l = Math.hypot(this.stick.x, this.stick.y);
      if (l > 0.15) { const k = Math.min(1, (l - 0.15) / 0.75) / l; x += this.stick.x * k; z += this.stick.y * k; }
    }
    return { x, z };
  }

  clear() { this.keys.clear(); this.held.clear(); this.queued.clear(); }
}
