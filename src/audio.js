/**
 * Game audio: recorded samples (Mixkit game pack, trimmed + peak-normalised to MP3) on three buses —
 * music, effects, interface — into a soft limiter. Synthesis is only used for a few low, clean
 * sounds the pack doesn't have (footsteps, the boss's ground slam) and never for held tones.
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

const MUSIC = {
  // One loop, shaped per game state (a darker filter at rest, full band in battle).
  title: { vol: 0.32, cutoff: 700, rate: 1 },
  explore: { vol: 0.42, cutoff: 1400, rate: 1 },
  battle: { vol: 0.62, cutoff: 16000, rate: 1 },
  boss: { vol: 0.7, cutoff: 16000, rate: 0.95 },
  studio: { vol: 0.28, cutoff: 900, rate: 1 },
  end: { vol: 0.0, cutoff: 800, rate: 1 },
};

export class Sfx {
  constructor(base = './audio/') {
    this.base = base;
    this.ctx = null;
    this.muted = false;
    this.buffers = {};
    this.voices = {};
    this.last = {};
    this.levels = { music: 0.8, sfx: 0.9 };
    this.musicState = 'title';
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
      this.bus.music.gain.value = this.levels.music;
      this.bus.sfx.gain.value = this.levels.sfx;
      this.bus.ui.gain.value = 0.8;
      // music chain: source → filter → duck → state gain → bus
      this.mFilter = c.createBiquadFilter(); this.mFilter.type = 'lowpass'; this.mFilter.Q.value = 0.4;
      this.mDuck = c.createGain(); this.mGain = c.createGain(); this.mGain.gain.value = 0;
      this.mFilter.connect(this.mDuck); this.mDuck.connect(this.mGain); this.mGain.connect(this.bus.music);
      this.loadAll();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  async loadAll() {
    const names = [...Object.keys(SOUNDS), 'music_battle'];
    await Promise.all(names.map(async (n) => {
      try {
        const res = await fetch(`${this.base}${n}.mp3`);
        this.buffers[n] = await this.ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) { console.warn('audio', n, e); }
    }));
    if (this.buffers.music_battle) this.startMusic(makeSeamless(this.ctx, this.buffers.music_battle, 1.2));
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }
  setLevel(bus, v) {
    this.levels[bus] = v;
    if (this.bus?.[bus]) this.bus[bus].gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Play a sample with light pitch/volume variation, per-sound voice cap and minimum gap. */
  play(name, { vol = 1, rate = 1, delay = 0 } = {}) {
    const def = SOUNDS[name] || {};
    const buf = this.buffers[name];
    if (!this.ctx || this.muted || !buf) return;
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

  startMusic(buf) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    src.connect(this.mFilter); src.start();
    this.mSrc = src;
    this.music(this.musicState, true);
  }

  /** Move the music to a game state: title, explore, battle, boss, studio, end. */
  music(state, instant = false) {
    this.musicState = state;
    if (!this.mGain) return;
    const m = MUSIC[state] || MUSIC.explore, t = this.ctx.currentTime, tc = instant ? 0.3 : 0.9;
    this.mGain.gain.setTargetAtTime(m.vol, t, tc);
    this.mFilter.frequency.setTargetAtTime(m.cutoff, t, tc);
    if (this.mSrc) this.mSrc.playbackRate.setTargetAtTime(m.rate, t, 1.5);
  }

  /* ----- clean synthesis for the few sounds the pack lacks ----- */
  thump({ f0 = 110, f1 = 45, dur = 0.3, gain = 0.4, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
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
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now - (this.last.step || 0) < 120) return;
    this.last.step = now;
    this.thump({ f0: 90 + Math.random() * 30, f1: 55, dur: 0.09, gain: 0.07 });
  }
}

/** Return a copy of `buf` whose tail is cross-faded into its head so it loops without a click. */
function makeSeamless(ctx, buf, fade) {
  const n = Math.floor(fade * buf.sampleRate);
  if (buf.length < n * 3) return buf;
  const len = buf.length - n;
  const out = ctx.createBuffer(buf.numberOfChannels, len, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch), dst = out.getChannelData(ch);
    dst.set(src.subarray(0, len));
    for (let i = 0; i < n; i++) {
      const k = i / n;
      dst[i] = src[i] * Math.sin(k * Math.PI / 2) + src[len + i] * Math.cos(k * Math.PI / 2);
    }
  }
  return out;
}
