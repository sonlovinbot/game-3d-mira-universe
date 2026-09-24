// Every sound is synthesised with WebAudio — no audio files to load or license.
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.last = {}; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp); comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startAmbience();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05); }

  throttle(name, ms) { const now = performance.now(); if (now - (this.last[name] || 0) < ms) return true; this.last[name] = now; return false; }

  tone({ f0, f1 = f0, dur = 0.2, type = 'sine', gain = 0.3, attack = 0.005, delay = 0, q }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = o;
    if (q) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = q; o.connect(f); out = f; }
    out.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.2, f0 = 2000, f1 = f0, type = 'bandpass', Q = 1, gain = 0.3, attack = 0.005, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = Q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  startAmbience() {
    const c = this.ctx, g = c.createGain(); g.gain.value = 0.045;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.08; lg.gain.value = 400; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    for (const fr of [110, 164.8, 220.5, 329.2]) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = fr; o.detune.value = (Math.random() - 0.5) * 12; o.connect(f); o.start(); }
    f.connect(g); g.connect(this.master);
  }

  slash() { this.noise({ dur: 0.18, f0: 4200, f1: 700, Q: 1.4, gain: 0.35 }); this.tone({ f0: 900, f1: 380, dur: 0.12, type: 'triangle', gain: 0.08 }); }
  bolt() { this.tone({ f0: 700, f1: 1900, dur: 0.18, type: 'sawtooth', gain: 0.08, q: 3000 }); this.tone({ f0: 1760, f1: 2640, dur: 0.25, gain: 0.1, delay: 0.03 }); }
  boltHit() { this.noise({ dur: 0.15, f0: 1800, f1: 300, gain: 0.25 }); }
  nova() { this.tone({ f0: 160, f1: 38, dur: 0.6, gain: 0.5 }); this.noise({ dur: 0.5, f0: 900, f1: 120, type: 'lowpass', gain: 0.35 }); [880, 1320, 1760].forEach((f, i) => this.tone({ f0: f, dur: 0.4, gain: 0.06, delay: i * 0.04 })); }
  dash() { this.noise({ dur: 0.22, f0: 900, f1: 5000, Q: 0.8, gain: 0.25 }); }
  hit(crit) { if (this.throttle('hit', 35)) return; this.tone({ f0: crit ? 260 : 190, f1: 70, dur: 0.1, type: 'square', gain: 0.1, q: 1400 }); this.noise({ dur: 0.07, f0: 2500, gain: 0.12 }); }
  kill(boss) { this.tone({ f0: 520, f1: 1040, dur: 0.14, gain: 0.12 }); this.noise({ dur: boss ? 1.2 : 0.25, f0: 1200, f1: 80, type: 'lowpass', gain: boss ? 0.6 : 0.2 }); }
  hurt() { this.tone({ f0: 260, f1: 110, dur: 0.25, type: 'sawtooth', gain: 0.18, q: 1200 }); }
  pickup() { [660, 880, 1320, 1760, 2640].forEach((f, i) => this.tone({ f0: f, dur: 0.5, gain: 0.12, delay: i * 0.07 })); }
  soul() { if (this.throttle('soul', 60)) return; this.tone({ f0: 1300 + Math.random() * 400, f1: 2400, dur: 0.12, gain: 0.05 }); }
  wave() { this.tone({ f0: 110, dur: 1.3, type: 'sawtooth', gain: 0.14, attack: 0.25, q: 700 }); this.tone({ f0: 165, dur: 1.3, type: 'sawtooth', gain: 0.1, attack: 0.3, q: 700, delay: 0.05 }); }
  slam(k = 1) { this.tone({ f0: 90, f1: 30, dur: 0.5, gain: 0.45 * k }); this.noise({ dur: 0.4, f0: 600, f1: 60, type: 'lowpass', gain: 0.4 * k }); }
  warn() { this.tone({ f0: 440, f1: 330, dur: 0.3, type: 'square', gain: 0.07, q: 1500 }); this.tone({ f0: 440, f1: 330, dur: 0.3, type: 'square', gain: 0.07, q: 1500, delay: 0.35 }); }
  volley() { this.tone({ f0: 300, f1: 900, dur: 0.35, type: 'sawtooth', gain: 0.08, q: 2000 }); }
  ult() { this.tone({ f0: 220, f1: 1760, dur: 0.9, type: 'sawtooth', gain: 0.1, q: 2500 }); this.noise({ dur: 0.9, f0: 400, f1: 6000, gain: 0.15 }); }
  meteor() { if (this.throttle('meteor', 50)) return; this.tone({ f0: 120, f1: 40, dur: 0.35, gain: 0.35 }); this.noise({ dur: 0.3, f0: 1500, f1: 100, type: 'lowpass', gain: 0.3 }); }
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ f0: f, dur: 0.9, gain: 0.12, delay: i * 0.12 })); }
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone({ f0: f, dur: 0.7, type: 'triangle', gain: 0.12, delay: i * 0.18 })); }
}
