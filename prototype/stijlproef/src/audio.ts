// Pure WebAudio synthesis: UI sounds, ambience that follows parkeerdruk, ship horn, gulls, generative music.
import { clamp, lerp } from './util';

const PENTA = [0, 2, 4, 7, 9]; // C major pentatonic degrees
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  muted = false;
  started = false;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private cityGain!: GainNode;
  private trafficGain!: GainNode;
  private rainGain!: GainNode;
  private crowdGain!: GainNode;
  private crowdF!: BiquadFilterNode;
  private crowd = 0;
  private crowdSwell = 0;
  private noiseBuf!: AudioBuffer;
  private pressure = 0.5;
  private rain = 0;
  private night = 0;
  private nextHorn = 22;
  private nextGull = 6;
  private nextBeat = 0;
  private beat = 0;
  private chordIdx = 0;
  private nextChord = 0;
  private timer: number | null = null;
  private lastTick = 0;

  /** Must be called from a user gesture (iOS: touchend/click). Safe to call repeatedly; resumes a suspended context. */
  start() {
    if (this.started) { this.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.started = true;
    const ctx = (this.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.3;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.55; this.musicBus.connect(this.master);

    // generated reverb impulse
    const len = Math.floor(ctx.sampleRate * 2.6);
    const imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = imp.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb = ctx.createConvolver(); this.reverb.buffer = imp;
    this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0.5;
    this.reverbSend.connect(this.reverb); this.reverb.connect(this.master);

    // looping noise
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < nd.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      const pink = (b0 + b1 + b2 + w * 0.1848) * 0.18;
      last = (last + 0.02 * w) / 1.02; // brown-ish
      nd[i] = pink * 0.6 + last * 3.2;
    }
    const loopNoise = (type: BiquadFilterType, freq: number, q = 0.7) => {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      src.loopStart = Math.random() * 1.5;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { g, f };
    };
    this.cityGain = loopNoise('lowpass', 420).g;
    this.trafficGain = loopNoise('bandpass', 1100, 0.5).g;
    const rn = loopNoise('highpass', 1500, 0.4);
    this.rainGain = rn.g;
    const cr = loopNoise('bandpass', 620, 0.9);
    this.crowdGain = cr.g; this.crowdF = cr.f;
    // slow formant-ish wobble makes the noise sound like a stadium crowd
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.35;
    const lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg).connect(cr.f.frequency); lfo.start();

    this.nextBeat = ctx.currentTime + 0.5;
    this.nextChord = ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => this.schedule(), 90);
  }

  /** iOS Safari suspends/interrupts the context; resume it and play one silent buffer inside the gesture. */
  resume() {
    const ctx = this.ctx; if (!ctx) return;
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => {});
      try { const b = ctx.createBuffer(1, 1, 22050); const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(0); } catch { /* noop */ }
    }
  }
  /** 0..1 stadium crowd level (match day) */
  setCrowd(level: number) { this.crowd = level; }
  /** a short swelling cheer */
  swell() { this.crowdSwell = 1; }
  whistle() { this.tone('sine', 2900, 2900, 0.5, 0.05, 0, 0.3); this.tone('sine', 3050, 3050, 0.5, 0.04, 0.02, 0.3); }
  roar() { this.tone('sawtooth', 130, 70, 0.7, 0.07, 0, 0.3); this.noiseBurst(0.6, 600, 200, 0.16, 0.8); this.tone('sawtooth', 150, 80, 0.6, 0.06, 0.25, 0.3); }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.08);
  }
  setState(pressure: number, rain: number, night: number) { this.pressure = pressure; this.rain = rain; this.night = night; }

  // ----------------------------------------------------------- one-shots
  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, at = 0, wet = 0.15, bus?: AudioNode) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); this.env(g, t, 0.004, peak, dur);
    o.connect(g).connect(bus ?? this.sfx);
    if (wet > 0) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s).connect(this.reverbSend); }
    o.start(t); o.stop(t + dur + 0.05);
  }
  private noiseBurst(dur: number, f0: number, f1: number, peak: number, q = 1, at = 0, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); this.env(g, t, 0.01, peak, dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  click() { this.tone('triangle', 640, 330, 0.09, 0.2, 0, 0.1); this.noiseBurst(0.03, 3000, 2000, 0.05, 1); }
  tick() {
    const now = performance.now();
    if (now - this.lastTick < 40) return;
    this.lastTick = now;
    this.tone('sine', 1900, 1500, 0.035, 0.06, 0, 0);
  }
  sliderTick(v: number) { this.tone('sine', 700 + v * 900, 650 + v * 900, 0.03, 0.05, 0, 0); }
  plop() {
    this.tone('sine', 520, 120, 0.2, 0.55, 0, 0.2);
    this.tone('sine', 110, 55, 0.3, 0.5, 0, 0.05);
    this.noiseBurst(0.22, 900, 250, 0.18, 0.8);
  }
  coin() {
    this.tone('triangle', 1318.5, 1318.5, 0.28, 0.2, 0.12, 0.3);
    this.tone('triangle', 1760, 1760, 0.5, 0.22, 0.2, 0.35);
    this.tone('sine', 3520, 3520, 0.35, 0.05, 0.2, 0.3);
  }
  whoosh() { this.noiseBurst(0.35, 250, 1600, 0.12, 0.6); }
  error() { this.tone('square', 190, 150, 0.12, 0.08, 0, 0); this.tone('square', 170, 120, 0.16, 0.08, 0.1, 0); }
  chime() { [659.3, 830.6, 987.8].forEach((f, i) => this.tone('triangle', f, f, 0.6, 0.12, i * 0.09, 0.4)); }
  horn() {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.35);
    g.gain.setValueAtTime(0.1, t + 1.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    for (const f of [98, 123.5, 196.6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = f > 150 ? 0.25 : 1;
      o.connect(og).connect(lp); o.start(t); o.stop(t + 3.3);
    }
    lp.connect(g); g.connect(this.sfx);
    const s = ctx.createGain(); s.gain.value = 1.4; g.connect(s).connect(this.reverbSend);
  }
  gull() {
    const ctx = this.ctx; if (!ctx) return;
    const n = 2 + Math.floor(Math.random() * 3);
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(this.sfx);
    const base = 1500 + Math.random() * 500;
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * 0.26;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(base * 0.8, t);
      o.frequency.linearRampToValueAtTime(base * 1.5, t + 0.08);
      o.frequency.linearRampToValueAtTime(base * 0.9, t + 0.22);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 38;
      const lg = ctx.createGain(); lg.gain.value = 60; lfo.connect(lg).connect(o.frequency);
      const g = ctx.createGain(); this.env(g, t, 0.02, 0.05, 0.22);
      o.connect(g).connect(pan);
      const s = ctx.createGain(); s.gain.value = 0.5; g.connect(s).connect(this.reverbSend);
      o.start(t); lfo.start(t); o.stop(t + 0.3); lfo.stop(t + 0.3);
    }
  }
  honk() {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    const f = 340 + Math.random() * 80;
    for (const m of [1, 1.26]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * m;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const g = ctx.createGain(); this.env(g, t, 0.01, 0.018, 0.22);
      o.connect(lp).connect(g).connect(this.sfx);
      const s = ctx.createGain(); s.gain.value = 0.6; g.connect(s).connect(this.reverbSend);
      o.start(t); o.stop(t + 0.3);
    }
  }

  // ----------------------------------------------------------- scheduler
  private schedule() {
    const ctx = this.ctx; if (!ctx) return;
    const now = ctx.currentTime;
    // ambience levels
    const p = this.pressure;
    this.cityGain.gain.setTargetAtTime((0.05 + 0.2 * p) * (1 - this.rain * 0.3), now, 0.5);
    this.trafficGain.gain.setTargetAtTime(0.004 + 0.032 * p * p, now, 0.5);
    this.rainGain.gain.setTargetAtTime(this.rain * 0.075, now, 0.8);
    this.crowdSwell = Math.max(0, this.crowdSwell - 0.09 / 3);
    this.crowdGain.gain.setTargetAtTime(this.crowd * 0.12 + this.crowdSwell * 0.2, now, 0.35);
    this.crowdF.frequency.setTargetAtTime(520 + this.crowd * 420 + this.crowdSwell * 500, now, 0.5);
    // random events
    if (now > this.nextHorn) { this.horn(); this.nextHorn = now + 45 + Math.random() * 45; }
    if (now > this.nextGull) {
      if (this.night < 0.5 && this.rain < 0.4) this.gull();
      this.nextGull = now + 7 + Math.random() * 12;
    }
    if (p > 0.55 && Math.random() < 0.004 + 0.012 * (p - 0.55)) this.honk();
    // music
    const musicVol = 0.5 * (1 - this.rain * 0.3);
    this.musicBus.gain.setTargetAtTime(musicVol, now, 1);
    while (this.nextChord < now + 0.3) { this.playChord(this.nextChord); this.nextChord += 6; this.chordIdx++; }
    const beatLen = lerp(0.62, 0.5, p) * (1 + this.night * 0.25);
    while (this.nextBeat < now + 0.3) {
      this.pluck(this.nextBeat);
      this.nextBeat += beatLen; this.beat++;
    }
  }

  private playChord(t: number) {
    const ctx = this.ctx!;
    const chords = [
      [48, 55, 64, 67], // C  G  E  G
      [45, 52, 60, 64], // A  E  C  E
      [50, 57, 62, 67], // D  A  D  G (sus)
      [43, 50, 57, 62], // G  D  A  D
    ];
    const ch = chords[this.chordIdx % chords.length];
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lerp(700, 1300, this.pressure * 0.6);
    lp.connect(this.musicBus);
    const rv = ctx.createGain(); rv.gain.value = 0.9; lp.connect(rv).connect(this.reverbSend);
    for (const n of ch) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(n); o.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.045, t + 2.2);
        g.gain.linearRampToValueAtTime(0.03, t + 4.5);
        g.gain.linearRampToValueAtTime(0.0001, t + 7.5);
        o.connect(g).connect(lp);
        o.start(t); o.stop(t + 7.6);
      }
    }
  }

  private pluck(t: number) {
    const ctx = this.ctx!;
    const dens = lerp(0.34, 0.5, this.pressure);
    if (Math.random() > dens) return;
    const deg = PENTA[Math.floor(Math.random() * 5)];
    const oct = Math.random() < 0.7 ? 72 : 84;
    const f = mtof(oct + deg);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2).connect(g);
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.2 - 0.6;
    g.connect(pan).connect(this.musicBus);
    // feedback delay for sparkle
    const dly = ctx.createDelay(1); dly.delayTime.value = 0.375;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 1800;
    pan.connect(dly); dly.connect(dl).connect(fb).connect(dly); dl.connect(this.musicBus);
    const s = ctx.createGain(); s.gain.value = 0.7; pan.connect(s).connect(this.reverbSend);
    o.start(t); o2.start(t); o.stop(t + 1.4); o2.stop(t + 1.4);
    window.setTimeout(() => { try { dly.disconnect(); dl.disconnect(); fb.disconnect(); } catch { /* noop */ } }, 6000);
  }
}
export const audio = new AudioEngine();
void clamp;
