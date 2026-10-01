import type { ScoreKey } from "../game/types";

interface Track {
  bpm: number;
  root: number; // MIDI note of the tonic
  scale: number[];
  /** Chord roots as scale degrees (0-based), one per bar. */
  chords: number[];
  pluck: "bell" | "pluck" | "keys";
  drums: 0 | 1 | 2;
  pad: number;
  /** How often (in bars) the promise motif comes back; 0 = never. */
  motifEvery: number;
  ambience: "room" | "sea" | "city" | "rain" | "evening";
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

const TRACKS: Record<string, Track> = {
  "first-light": { bpm: 76, root: 65, scale: MAJOR, chords: [0, 5, 3, 4], pluck: "bell", drums: 0, pad: 0.5, motifEvery: 8, ambience: "room" },
  harbour: { bpm: 104, root: 60, scale: MAJOR, chords: [0, 3, 4, 0, 5, 3, 1, 4], pluck: "pluck", drums: 1, pad: 0.35, motifEvery: 8, ambience: "sea" },
  coast: { bpm: 116, root: 67, scale: MAJOR, chords: [0, 4, 5, 3], pluck: "pluck", drums: 2, pad: 0.3, motifEvery: 8, ambience: "sea" },
  city: { bpm: 98, root: 62, scale: MAJOR, chords: [0, 5, 1, 4], pluck: "keys", drums: 1, pad: 0.4, motifEvery: 16, ambience: "city" },
  climb: { bpm: 120, root: 69, scale: MAJOR, chords: [0, 3, 5, 4], pluck: "keys", drums: 2, pad: 0.3, motifEvery: 16, ambience: "city" },
  storm: { bpm: 84, root: 62, scale: MINOR, chords: [0, 5, 2, 6], pluck: "keys", drums: 1, pad: 0.7, motifEvery: 8, ambience: "rain" },
  golden: { bpm: 88, root: 63, scale: MAJOR, chords: [0, 3, 0, 4, 5, 3, 4, 4], pluck: "bell", drums: 0, pad: 0.55, motifEvery: 8, ambience: "evening" },
  promise: { bpm: 68, root: 60, scale: MAJOR, chords: [0, 4, 5, 3], pluck: "bell", drums: 0, pad: 0.7, motifEvery: 4, ambience: "sea" },
  title: { bpm: 72, root: 60, scale: MAJOR, chords: [0, 5, 3, 4], pluck: "bell", drums: 0, pad: 0.6, motifEvery: 4, ambience: "sea" },
};

/** The promise leitmotif: scale degrees and lengths in beats. */
const MOTIF: [number, number][] = [
  [4, 1], [2, 0.5], [1, 0.5], [0, 1], [1, 1], [2, 1.5], [4, 0.5], [5, 2],
];

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** What the ground under a footstep sounds like. */
export type Surface = "wood" | "grass" | "cobble" | "stone" | "dirt";

/** Footstep colour per surface: a filtered noise tick (band centre, Q, length) and a body thump. */
const STEP_SOUND: Record<Surface, { freq: number; q: number; len: number; thump: number; gain: number }> = {
  wood: { freq: 1400, q: 1.2, len: 0.05, thump: 150, gain: 0.5 },
  grass: { freq: 3200, q: 0.7, len: 0.09, thump: 0, gain: 0.35 },
  cobble: { freq: 2200, q: 1.6, len: 0.035, thump: 120, gain: 0.45 },
  stone: { freq: 1500, q: 1.1, len: 0.04, thump: 110, gain: 0.4 },
  dirt: { freq: 900, q: 0.8, len: 0.08, thump: 90, gain: 0.45 },
};

export class Audio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private musicBus?: GainNode;
  private sfxBus?: GainNode;
  private ambienceBus?: GainNode;
  private noise?: AudioBuffer;
  private track?: Track;
  private trackId = "";
  private nextBar = 0;
  private bar = 0;
  private timer?: number;
  private ambienceNodes: AudioNode[] = [];
  private quietBar = -1;
  volume = 0.7;
  musicOn = true;

  /** Must be called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.55 : 0;
      this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.8;
      this.sfxBus.connect(this.master);
      this.ambienceBus = this.ctx.createGain();
      this.ambienceBus.gain.value = 0.35;
      this.ambienceBus.connect(this.master);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.timer = window.setInterval(() => this.schedule(), 40);
      if (this.trackId) this.play(this.trackId, true);
    }
    void this.ctx.resume();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.3);
  }

  /** Softens the music under dialogue. */
  duck(on: boolean) {
    if (this.musicBus && this.ctx && this.musicOn) this.musicBus.gain.setTargetAtTime(on ? 0.3 : 0.55, this.ctx.currentTime, 0.4);
  }

  play(id: string, force = false) {
    if (id === this.trackId && !force) return;
    this.trackId = id;
    this.track = TRACKS[id] ?? TRACKS.harbour;
    if (!this.ctx) return;
    this.bar = 0;
    this.nextBar = this.ctx.currentTime + 0.2;
    this.setAmbience(this.track.ambience);
  }

  /** Silence everything while the tab is hidden. */
  setHidden(hidden: boolean) {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private schedule() {
    const ctx = this.ctx;
    const t = this.track;
    if (!ctx || !t || !this.musicBus || ctx.state !== "running") return;
    // After a stall (a chapter load) don't dump the missed bars all at once.
    if (this.nextBar < ctx.currentTime) this.nextBar = ctx.currentTime + 0.05;
    if (!this.musicOn) {
      this.nextBar = ctx.currentTime + 0.1;
      return;
    }
    while (this.nextBar < ctx.currentTime + 0.25) {
      this.playBar(t, this.bar, this.nextBar);
      this.nextBar += (60 / t.bpm) * 4;
      this.bar++;
    }
  }

  private note(freq: number, at: number, dur: number, type: OscillatorType, gain: number, bus: AudioNode, attack = 0.005, cutoff = 0) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let out: AudioNode = g;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = cutoff;
      g.connect(f);
      out = f;
    }
    osc.connect(g);
    out.connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  private bell(freq: number, at: number, dur: number, gain: number, bus: AudioNode) {
    this.note(freq, at, dur, "sine", gain, bus, 0.004);
    this.note(freq * 2.01, at, dur * 0.5, "sine", gain * 0.35, bus, 0.004);
    this.note(freq * 3.98, at, dur * 0.2, "sine", gain * 0.12, bus, 0.002);
  }

  private voice(kind: Track["pluck"], freq: number, at: number, dur: number, gain: number) {
    const bus = this.musicBus!;
    if (kind === "bell") this.bell(freq, at, dur * 2.5, gain, bus);
    else if (kind === "pluck") this.note(freq, at, dur * 1.2, "triangle", gain, bus, 0.003, 2600);
    else {
      this.note(freq, at, dur * 1.6, "sine", gain, bus, 0.01);
      this.note(freq * 2, at, dur * 0.6, "triangle", gain * 0.2, bus, 0.005, 1800);
    }
  }

  private playBar(t: Track, bar: number, at: number) {
    const beat = 60 / t.bpm;
    const degree = t.chords[bar % t.chords.length];
    const tone = (d: number, octave = 0) => {
      const s = t.scale;
      const idx = ((d % 7) + 7) % 7;
      return t.root + s[idx] + 12 * (octave + Math.floor(d / 7));
    };
    const chord = [tone(degree), tone(degree + 2), tone(degree + 4)];
    // Pad
    if (t.pad > 0) {
      for (const m of chord) this.note(midiHz(m - 12), at, beat * 4.2, "sawtooth", 0.018 * t.pad, this.musicBus!, beat * 1.2, 900);
    }
    // Bass on beats 1 and 3
    this.note(midiHz(chord[0] - 24), at, beat * 1.8, "triangle", 0.16, this.musicBus!, 0.01, 600);
    this.note(midiHz(chord[0] - 24 + (bar % 2 ? 7 : 0)), at + beat * 2, beat * 1.6, "triangle", 0.13, this.musicBus!, 0.01, 600);
    // Motif or arpeggio
    const motifBar = t.motifEvery > 0 && bar % t.motifEvery === t.motifEvery - 2;
    if (motifBar) {
      let pos = 0;
      for (const [d, len] of MOTIF) {
        this.voice(t.pluck === "keys" ? "bell" : t.pluck, midiHz(tone(d, 1)), at + pos * beat, len * beat, 0.11);
        pos += len;
        if (pos >= 8) break;
      }
      // The motif spans two bars; the following bar keeps its pad and bass but no arpeggio.
      this.quietBar = bar + 1;
    } else if (bar !== this.quietBar) {
      const steps = t.drums === 2 ? 8 : 6;
      const pattern = [0, 1, 2, 1, 2, 0, 1, 2];
      for (let i = 0; i < steps; i++) {
        const m = chord[pattern[(i + bar) % pattern.length]] + (i % 4 === 3 ? 12 : 0);
        this.voice(t.pluck, midiHz(m + 12), at + (i * beat * 4) / steps, (beat * 4) / steps, 0.06);
      }
    }
    // Soft percussion
    if (t.drums > 0) {
      for (let b = 0; b < 4; b++) {
        if (b % 2 === 0) this.kick(at + b * beat, 0.35);
        this.hat(at + b * beat + beat / 2, t.drums === 2 ? 0.06 : 0.035);
        if (t.drums === 2) this.hat(at + b * beat, 0.03);
      }
    }
  }

  private kick(at: number, gain: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(120, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.15);
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
    osc.connect(g).connect(this.musicBus!);
    osc.start(at);
    osc.stop(at + 0.3);
  }

  private hat(at: number, gain: number, bus: AudioNode = this.musicBus!) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    src.connect(f).connect(g).connect(bus);
    src.start(at, Math.random());
    src.stop(at + 0.08);
  }

  private setAmbience(kind: Track["ambience"]) {
    const ctx = this.ctx;
    if (!ctx || !this.ambienceBus || !this.noise) return;
    for (const n of this.ambienceNodes) {
      try {
        (n as AudioScheduledSourceNode).stop?.();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
    this.ambienceNodes = [];
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const settings = {
      room: { type: "lowpass", freq: 400, gain: 0.03 },
      sea: { type: "lowpass", freq: 700, gain: 0.16 },
      city: { type: "bandpass", freq: 300, gain: 0.08 },
      rain: { type: "highpass", freq: 1800, gain: 0.22 },
      evening: { type: "lowpass", freq: 600, gain: 0.08 },
    }[kind] as { type: BiquadFilterType; freq: number; gain: number };
    f.type = settings.type;
    f.frequency.value = settings.freq;
    g.gain.value = settings.gain;
    // Slow swell for waves.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = kind === "sea" ? 0.12 : 0.05;
    const depth = ctx.createGain();
    depth.gain.value = settings.gain * 0.6;
    lfo.connect(depth).connect(g.gain);
    src.connect(f).connect(g).connect(this.ambienceBus);
    src.start();
    lfo.start();
    this.ambienceNodes.push(src, f, g, lfo, depth);
  }

  // ------------------------------------------------------------------ sfx
  private get sfxReady() {
    return !!(this.ctx && this.sfxBus);
  }

  pickup(score: ScoreKey, streak: number) {
    if (!this.sfxReady) return;
    const at = this.ctx!.currentTime;
    const base = { health: 76, happiness: 81, money: 79 }[score] + Math.min(12, Math.floor(streak / 3));
    this.bell(midiHz(base), at, 0.35, 0.12, this.sfxBus!);
    this.bell(midiHz(base + 7), at + 0.06, 0.3, 0.08, this.sfxBus!);
  }

  point(score: ScoreKey) {
    if (!this.sfxReady) return;
    const at = this.ctx!.currentTime;
    const base = { health: 72, happiness: 76, money: 74 }[score];
    [0, 4, 7, 12].forEach((d, i) => this.bell(midiHz(base + d), at + i * 0.05, 0.4, 0.07, this.sfxBus!));
  }

  hit() {
    if (!this.sfxReady) return;
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(220, at);
    osc.frequency.exponentialRampToValueAtTime(70, at + 0.25);
    g.gain.setValueAtTime(0.12, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    osc.connect(f).connect(g).connect(this.sfxBus!);
    osc.start(at);
    osc.stop(at + 0.35);
    this.hat(at, 0.2, this.sfxBus!);
  }

  jump() {
    if (!this.sfxReady) return;
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(330, at);
    osc.frequency.exponentialRampToValueAtTime(660, at + 0.14);
    g.gain.setValueAtTime(0.08, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    osc.connect(g).connect(this.sfxBus!);
    osc.start(at);
    osc.stop(at + 0.2);
  }

  sparkle() {
    if (!this.sfxReady) return;
    const at = this.ctx!.currentTime;
    [84, 88, 91, 96, 100].forEach((m, i) => this.bell(midiHz(m), at + i * 0.07, 0.6, 0.07, this.sfxBus!));
  }

  chime() {
    if (!this.sfxReady) return;
    const at = this.ctx!.currentTime;
    [72, 79, 84].forEach((m, i) => this.bell(midiHz(m), at + i * 0.09, 0.8, 0.08, this.sfxBus!));
  }

  tap() {
    if (!this.sfxReady) return;
    this.note(midiHz(88), this.ctx!.currentTime, 0.08, "sine", 0.05, this.sfxBus!);
  }

  private lastStep = 0;

  /** A noise burst through a band-pass filter, for ticks, rustles and splashes. */
  private burst(at: number, freq: number, q: number, len: number, gain: number, type: BiquadFilterType = "bandpass") {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    src.connect(f).connect(g).connect(this.sfxBus!);
    src.start(at, Math.random() * 1.5);
    src.stop(at + len + 0.02);
  }

  /**
   * One footstep. `weight` scales it (a crawling baby pats, an adult treads); wet ground adds a
   * splashy hiss. Steps closer than 70 ms apart are skipped (fast-forwarded playtests).
   */
  step(surface: Surface, weight = 1, wet = false) {
    if (!this.sfxReady || !this.noise) return;
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    if (at - this.lastStep < 0.07) return;
    this.lastStep = at;
    const look = STEP_SOUND[surface];
    const vary = 0.85 + Math.random() * 0.3;
    const gain = 0.09 * look.gain * weight * vary;
    this.burst(at, look.freq * vary, look.q, look.len, gain);
    if (look.thump) this.note(look.thump * vary, at, 0.05, "sine", gain * 0.6, this.sfxBus!, 0.002);
    if (wet) this.burst(at + 0.01, 4200, 0.6, 0.12, gain * 0.9, "highpass");
  }

  /** The tip of a cane on the ground: a soft wooden click (filtered noise, not a pitched note). */
  tock() {
    if (!this.sfxReady || !this.noise) return;
    this.burst(this.ctx!.currentTime, 1800, 3, 0.03, 0.018);
  }

  /** Wings clattering as gulls take off, and (sometimes) a squawk. */
  gulls(count: number, squawk: boolean) {
    if (!this.sfxReady || !this.noise) return;
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    for (let i = 0; i < Math.min(6, count * 2 + 2); i++) this.burst(at + i * 0.07 + Math.random() * 0.03, 700, 0.9, 0.06, 0.05);
    if (!squawk) return;
    const osc = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    const t = at + 0.05;
    osc.frequency.setValueAtTime(950, t);
    osc.frequency.exponentialRampToValueAtTime(1500, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(780, t + 0.3);
    f.type = "bandpass";
    f.frequency.value = 1600;
    f.Q.value = 2.5;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    osc.connect(f).connect(g).connect(this.sfxBus!);
    osc.start(t);
    osc.stop(t + 0.36);
  }

  /** Running through a puddle. */
  splash() {
    if (!this.sfxReady || !this.noise) return;
    const at = this.ctx!.currentTime;
    this.burst(at, 1800, 0.5, 0.3, 0.12, "highpass");
    [96, 91, 99].forEach((m, i) => this.note(midiHz(m), at + 0.05 + i * 0.06, 0.05, "sine", 0.02, this.sfxBus!, 0.002));
  }

  whoosh() {
    if (!this.sfxReady) return;
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(300, at);
    f.frequency.exponentialRampToValueAtTime(1600, at + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.25, at + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
    src.connect(f).connect(g).connect(this.sfxBus!);
    src.start(at);
    src.stop(at + 1);
  }

  thunder() {
    if (!this.sfxReady) return;
    const ctx = this.ctx!;
    const at = ctx.currentTime + 0.4 + Math.random() * 0.8;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.9, at + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 2.6);
    src.connect(f).connect(g).connect(this.sfxBus!);
    src.start(at, Math.random());
    src.stop(at + 2.8);
  }

  stinger(kind: "chapter" | "choice" | "sad" | "end") {
    if (!this.sfxReady) return;
    const at = this.ctx!.currentTime;
    const chords = { chapter: [60, 64, 67, 72], choice: [67, 71, 74], sad: [57, 60, 64], end: [60, 64, 67, 71, 74] }[kind];
    chords.forEach((m, i) => this.bell(midiHz(m), at + i * 0.08, 1.4, 0.06, this.sfxBus!));
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    void this.ctx?.close();
  }
}

export const audio = new Audio();
