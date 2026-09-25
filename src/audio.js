/**
 * Game audio: recorded effects (Mixkit game pack, trimmed + peak-normalised to MP3) and a generated
 * music box, on three buses — music, effects, interface — into a soft limiter. Music and effects
 * have separate on/off switches.
 *
 * Why the old version sounded "rè": four detuned triangle drones ran for the whole game, square and
 * sawtooth oscillators were unfiltered, and dozens of overlapping hits drove a compressor into
 * pumping. Here every sound has a voice cap and a minimum gap, and nothing sustains on its own.
 */

const SOUNDS = {
  slash: { vol: 0.42, pitch: 0.08, max: 3, gap: 60 },
  hit: { vol: 0.5, pitch: 0.1, max: 4, gap: 45 },
  crit: { vol: 0.45, pitch: 0.05, max: 2, gap: 60 },
  hurt: { vol: 0.62, pitch: 0.05, max: 1, gap: 200 },
  bolt: { vol: 0.4, pitch: 0.06, max: 2, gap: 80 },
  nova: { vol: 0.55, pitch: 0.03, max: 1, gap: 200 },
  dash: { vol: 0.38, pitch: 0.06, max: 1, gap: 150 },
  kill: { vol: 0.42, pitch: 0.12, max: 3, gap: 50 },
  bosskill: { vol: 0.8, max: 1 },
  soul: { vol: 0.16, pitch: 0.15, max: 2, gap: 70 },
  pickup: { vol: 0.6, max: 1, duck: 1.4 },
  upgrade: { vol: 0.5, max: 1, gap: 300 },
  ultready: { vol: 0.45, max: 1, gap: 1000, bus: 'ui' },
  crystal: { vol: 0.45, max: 1, gap: 500 },
  wave: { vol: 0.55, max: 1, duck: 2.6 },
  clear: { vol: 0.6, max: 1, duck: 2.6 },
  win: { vol: 0.7, max: 1, duck: 3.5 },
  lose: { vol: 0.65, max: 1, duck: 3 },
  click: { vol: 0.35, max: 2, gap: 40, bus: 'ui' },
  open: { vol: 0.35, max: 1, gap: 200, bus: 'ui' },
};

/**
 * Background music is generated, not a sample: a soft "night music box" — sine plucks on a
 * pentatonic scale with a quiet bass and a gentle echo. No drums, no sustained drones.
 * Each game state only changes tempo, density, scale and level.
 */
const MUSIC = {
  title: { vol: 0.5, bpm: 64, density: 0.55, minor: false, bass: true },
  explore: { vol: 0.55, bpm: 70, density: 0.6, minor: false, bass: true },
  battle: { vol: 0.5, bpm: 84, density: 0.75, minor: false, bass: true },
  boss: { vol: 0.5, bpm: 78, density: 0.7, minor: true, bass: true },
  studio: { vol: 0.4, bpm: 60, density: 0.45, minor: false, bass: false },
  end: { vol: 0, bpm: 60, density: 0, minor: false, bass: false },
};
const MAJOR = [0, 2, 4, 7, 9];   // D major pentatonic
const MINOR = [0, 3, 5, 7, 10];  // D minor pentatonic
const ROOT = 62;                 // D4
const CHORDS = [0, -5, -3, -7];  // I – V – vi – IV (bass roots, semitones from D)
const CHORDS_MINOR = [0, -2, -4, -5]; // i – VII – VI – v
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Sfx {
  constructor(base = './audio/') {
    this.base = base;
    this.ctx = null;
    this.muted = false;
    this.buffers = {};
    this.voices = {};
    this.last = {};
    this.levels = { music: 0.8, sfx: 0.9 };
    this.musicOn = true; this.sfxOn = true;
    this.musicState = 'title';
    this.seq = { step: 0, next: 0, note: 7, bar: 0 };
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
      const limiter = c.createDynamicsCompressor();
      limiter.threshold.value = -6; limiter.knee.value = 4; limiter.ratio.value = 12;
      limiter.attack.value = 0.003; limiter.release.value = 0.2;
      this.master.connect(limiter); limiter.connect(c.destination);
      this.bus = {};
      for (const b of ['music', 'sfx', 'ui']) { this.bus[b] = c.createGain(); this.bus[b].connect(this.master); }
      // music chain: voices → echo → state gain → bus
      this.mGain = c.createGain(); this.mGain.gain.value = 0;
      this.mDuck = c.createGain();
      this.mIn = c.createGain();
      const echo = c.createDelay(1); echo.delayTime.value = 0.42;
      const fb = c.createGain(); fb.gain.value = 0.28;
      const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1800;
      const wet = c.createGain(); wet.gain.value = 0.35;
      this.mIn.connect(this.mDuck);
      this.mIn.connect(echo); echo.connect(tone); tone.connect(fb); fb.connect(echo); tone.connect(wet); wet.connect(this.mDuck);
      this.mDuck.connect(this.mGain); this.mGain.connect(this.bus.music);
      this.bus.music.gain.value = this.musicOn ? this.levels.music : 0;
      this.bus.sfx.gain.value = this.sfxOn ? this.levels.sfx : 0;
      this.bus.ui.gain.value = this.sfxOn ? 0.8 : 0;
      this.music(this.musicState, true);
      this.timer = setInterval(() => this.schedule(), 50);
      this.loadAll();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  async loadAll() {
    const names = Object.keys(SOUNDS);
    await Promise.all(names.map(async (n) => {
      try {
        const res = await fetch(`${this.base}${n}.mp3`);
        this.buffers[n] = await this.ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) { console.warn('audio', n, e); }
    }));
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }
  setLevel(bus, v) {
    this.levels[bus] = v;
    this.applyBus();
  }
  /** Separate switches for background music and game sound effects. */
  setMusicOn(on) { this.musicOn = on; this.applyBus(); }
  setSfxOn(on) { this.sfxOn = on; this.applyBus(); }
  applyBus() {
    if (!this.bus) return;
    const t = this.ctx.currentTime;
    this.bus.music.gain.setTargetAtTime(this.musicOn ? this.levels.music : 0, t, 0.08);
    this.bus.sfx.gain.setTargetAtTime(this.sfxOn ? this.levels.sfx : 0, t, 0.05);
    this.bus.ui.gain.setTargetAtTime(this.sfxOn ? 0.8 : 0, t, 0.05);
  }

  /** Play a sample with light pitch/volume variation, per-sound voice cap and minimum gap. */
  play(name, { vol = 1, rate = 1, delay = 0 } = {}) {
    const def = SOUNDS[name] || {};
    const buf = this.buffers[name];
    if (!this.ctx || this.muted || !this.sfxOn || !buf) return;
    const now = performance.now();
    if (def.gap && now - (this.last[name] || 0) < def.gap) return;
    const v = this.voices[name] || (this.voices[name] = []);
    if (def.max && v.length >= def.max) { try { v.shift().stop(); } catch { /* already ended */ } }
    this.last[name] = now;
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = buf;
    const p = def.pitch || 0;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * p);
    const g = c.createGain(); g.gain.value = (def.vol ?? 0.5) * vol * (0.92 + Math.random() * 0.08);
    src.connect(g); g.connect(this.bus[def.bus || 'sfx']);
    src.start(t);
    v.push(src);
    src.onended = () => { const i = v.indexOf(src); if (i >= 0) v.splice(i, 1); g.disconnect(); };
    if (def.duck) this.duck(def.duck);
  }

  duck(sec) {
    if (!this.mDuck) return;
    const g = this.mDuck.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setTargetAtTime(0.45, t, 0.08); g.setTargetAtTime(1, t + sec, 0.5);
  }

  /** Move the music to a game state: title, explore, battle, boss, studio, end. */
  music(state, instant = false) {
    this.musicState = state;
    if (!this.mGain) return;
    const m = MUSIC[state] || MUSIC.explore;
    this.mGain.gain.setTargetAtTime(m.vol, this.ctx.currentTime, instant ? 0.2 : 1.2);
  }

  /** Look-ahead scheduler for the music box (runs every 50 ms, plans 200 ms ahead). */
  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running' || !this.musicOn || this.muted) { if (c) this.seq.next = Math.max(this.seq.next, c.currentTime + 0.1); return; }
    const m = MUSIC[this.musicState] || MUSIC.explore;
    if (m.vol === 0) { this.seq.next = c.currentTime + 0.1; return; }
    const q = this.seq, stepDur = 60 / m.bpm / 2; // eighth notes
    if (q.next < c.currentTime) q.next = c.currentTime + 0.05;
    while (q.next < c.currentTime + 0.2) {
      const scale = m.minor ? MINOR : MAJOR;
      const chord = (m.minor ? CHORDS_MINOR : CHORDS)[q.bar % 4];
      const inBar = q.step % 8;
      if (inBar === 0 && m.bass) this.pluck(midi(ROOT - 24 + chord), q.next, 0.1, 3.2, false);
      if (inBar === 4 && m.bass) this.pluck(midi(ROOT - 12 + chord + 7), q.next, 0.035, 1.6, false);
      // melody: a gentle random walk over two octaves of the scale, landing on chord tones on the beat
      const rest = inBar === 7 || Math.random() > m.density;
      if (!rest) {
        q.note += Math.random() < 0.5 ? -1 : 1;
        if (Math.random() < 0.18) q.note += Math.random() < 0.5 ? -2 : 2;
        q.note = Math.max(0, Math.min(9, q.note));
        const deg = q.note % 5, oct = Math.floor(q.note / 5);
        const n = ROOT + scale[deg] + 12 * oct;
        const accent = inBar % 2 === 0 ? 1 : 0.7;
        this.pluck(midi(n), q.next + (Math.random() - 0.5) * 0.012, 0.055 * accent, 1.8, true);
      }
      q.next += stepDur;
      q.step++;
      if (q.step % 8 === 0) q.bar++;
    }
  }

  /** A soft music-box note: sine + a quiet octave partial, fast attack, long natural decay. */
  pluck(freq, t, gain, decay, bright) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = freq; o1.connect(g);
    let o2;
    if (bright) {
      o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
      const g2 = c.createGain(); g2.gain.value = 0.18; o2.connect(g2); g2.connect(g);
      o2.start(t); o2.stop(t + decay + 0.05);
    }
    g.connect(this.mIn);
    o1.start(t); o1.stop(t + decay + 0.05);
    o1.onended = () => g.disconnect();
  }

  /* ----- clean synthesis for the few sounds the pack lacks ----- */
  thump({ f0 = 110, f1 = 45, dur = 0.3, gain = 0.4, delay = 0 } = {}) {
    if (!this.ctx || this.muted || !this.sfxOn) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    lp.type = 'lowpass'; lp.frequency.value = 400;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(lp); lp.connect(g); g.connect(this.bus.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // Named events used by the game
  slash() { this.play('slash'); }
  bolt() { this.play('bolt'); }
  boltHit() { this.play('hit', { vol: 0.8, rate: 1.15 }); }
  nova() { this.play('nova'); this.thump({ f0: 140, f1: 50, dur: 0.45, gain: 0.35, delay: 0.38 }); }
  dash() { this.play('dash'); }
  hit(crit) { this.play('hit'); if (crit) this.play('crit'); }
  kill(boss) { if (boss) { this.play('bosskill'); this.thump({ f0: 90, f1: 30, dur: 1.2, gain: 0.5 }); } else this.play('kill'); }
  hurt() { this.play('hurt'); }
  pickup() { this.play('pickup'); }
  crystalAppear() { this.play('crystal'); }
  upgrade() { this.play('upgrade', { delay: 0.5 }); }
  soul() { this.play('soul'); }
  ultReady() { this.play('ultready'); }
  wave() { this.play('wave'); }
  clear() { this.play('clear'); }
  slam(k = 1) { this.thump({ f0: 95, f1: 32, dur: 0.55, gain: 0.5 * k }); if (k > 0.8) this.play('hit', { vol: 0.9, rate: 0.6 }); }
  warn() { this.thump({ f0: 300, f1: 260, dur: 0.18, gain: 0.12 }); this.thump({ f0: 300, f1: 260, dur: 0.18, gain: 0.12, delay: 0.3 }); }
  volley() { this.play('bolt', { vol: 0.8, rate: 0.62 }); }
  ult() { this.play('nova', { vol: 1, rate: 0.85 }); }
  meteor() { this.play('hit', { vol: 0.7, rate: 0.7 }); this.thump({ f0: 120, f1: 40, dur: 0.35, gain: 0.3 }); }
  win() { this.play('win'); }
  lose() { this.play('lose'); }
  click() { this.play('click'); }
  open() { this.play('open'); }
  step() {
    if (!this.ctx || this.muted || !this.sfxOn) return;
    const now = performance.now();
    if (now - (this.last.step || 0) < 120) return;
    this.last.step = now;
    this.thump({ f0: 90 + Math.random() * 30, f1: 55, dur: 0.09, gain: 0.07 });
  }
}

