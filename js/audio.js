// Audio engine: microphone capture, pitch detection (YIN), reference tones, voice prompts, wake lock.

export const A4 = 440;
export const midiToHz = m => A4 * Math.pow(2, (m - 69) / 12);
export const hzToMidi = f => 69 + 12 * Math.log2(f / A4);

/* ---------- YIN pitch detector ----------
   Works on a mono Float32 buffer. Returns {f, clarity} or null. */
export function yin(buf, sr, minF = 65, maxF = 1100, threshold = 0.12) {
  const maxTau = Math.min(Math.floor(sr / minF), Math.floor(buf.length / 2));
  const minTau = Math.max(2, Math.floor(sr / maxF));
  const W = buf.length - maxTau;
  if (W < 32) return null;
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const x = buf[i] - buf[i + tau]; s += x * x; }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  d[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= maxTau; tau++) { run += d[tau]; d[tau] = run ? d[tau] * tau / run : 1; }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= maxTau && d[t + 1] < d[t]) t++;
      tau = t; break;
    }
  }
  if (tau < 0) {
    // no dip under the threshold: accept the global minimum only if reasonably clear
    let best = minTau;
    for (let t = minTau; t <= maxTau; t++) if (d[t] < d[best]) best = t;
    if (d[best] > 0.3) return null;
    tau = best;
  }
  // parabolic interpolation
  let better = tau;
  if (tau > 1 && tau < maxTau) {
    const a = d[tau - 1], b = d[tau], c = d[tau + 1];
    const den = a + c - 2 * b;
    if (den > 0) better = tau + (a - c) / (2 * den);
  }
  const f = sr / better;
  if (f < minF || f > maxF) return null;
  return { f, clarity: 1 - d[tau] };
}

export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.analyser = null;
    this.raw = null;
    this.half = null;
    this.noise = 0.004;          // ambient RMS floor, updated by calibrate()
    this.volume = 0.8;
    this.wakeLock = null;
    this.voice = null;
    this.isIOS = isIOS;
  }

  /* Must be called from a user gesture the first time (iOS). */
  async ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.unlockSpeech();
    }
    if (this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch (e) {} }
    return this.ctx;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  get micOn() { return !!this.stream; }

  async startMic() {
    await this.ensure();
    if (this.stream) return true;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
    });
    this.stream = stream;
    this.src = this.ctx.createMediaStreamSource(stream);
    // cut road rumble and handling noise below the lowest sung notes
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 60; hp.Q.value = 0.7;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    this.src.connect(hp).connect(this.analyser);
    this.hp = hp;
    this.raw = new Float32Array(this.analyser.fftSize);
    this.half = new Float32Array(this.analyser.fftSize / 2);
    return true;
  }

  stopMic() {
    if (!this.stream) return;
    this.stream.getTracks().forEach(t => t.stop());
    try { this.src.disconnect(); this.hp.disconnect(); } catch (e) {}
    this.stream = null; this.analyser = null;
  }

  /* One analysis frame from the latest microphone samples. */
  read() {
    if (!this.analyser) return null;
    this.analyser.getFloatTimeDomainData(this.raw);
    const sr = this.ctx.sampleRate;
    let buf = this.raw, rate = sr;
    if (sr >= 32000) {
      // decimate by 2 (with a 2-tap average) to quarter the YIN cost
      const h = this.half;
      for (let i = 0; i < h.length; i++) h[i] = 0.5 * (this.raw[2 * i] + this.raw[2 * i + 1]);
      buf = h; rate = sr / 2;
    }
    const level = rms(buf);
    const frame = { t: performance.now(), level, midi: null, f: 0, clarity: 0 };
    if (level < Math.max(0.006, this.noise * 2.5)) return frame;
    const p = yin(buf, rate);
    if (p && p.clarity > 0.8) { frame.f = p.f; frame.midi = hzToMidi(p.f); frame.clarity = p.clarity; }
    return frame;
  }

  /* Measure the ambient level for ms milliseconds (mic must be on). */
  async calibrate(ms = 700) {
    if (!this.analyser) return this.noise;
    const vals = [];
    const end = performance.now() + ms;
    while (performance.now() < end) {
      this.analyser.getFloatTimeDomainData(this.raw);
      vals.push(rms(this.raw));
      await new Promise(r => setTimeout(r, 30));
    }
    vals.sort((a, b) => a - b);
    const med = vals[Math.floor(vals.length / 2)] || 0.004;
    this.noise = Math.min(0.05, Math.max(0.002, med));
    return this.noise;
  }

  /* ---------- reference tones ---------- */
  tone(midi, t0, dur, vel = 0.5) {
    const ctx = this.ctx, f = midiToHz(midi);
    const env = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = Math.min(5000, f * 9); lp.Q.value = 0.4;
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(vel, t0 + 0.018);
    env.gain.exponentialRampToValueAtTime(vel * 0.55, t0 + 0.35);
    env.gain.setValueAtTime(vel * 0.55, Math.max(t0 + 0.35, t0 + dur - 0.09));
    env.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    env.connect(lp).connect(this.master);
    // harmonics carry the pitch on small phone speakers that cannot play low fundamentals
    const partials = [[1, 1], [2, 0.5], [3, 0.28], [4, 0.14], [5, 0.07], [6, 0.04]];
    for (const [h, a] of partials) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f * h;
      g.gain.value = a * 0.32;
      o.connect(g).connect(env);
      o.start(t0); o.stop(t0 + dur + 0.05);
    }
  }

  /* Play a phrase [{m, d}] (d in seconds). Resolves when it has finished. */
  async playPhrase(notes, gap = 0.04) {
    await this.ensure();
    let t = this.ctx.currentTime + 0.08;
    const start = t;
    for (const n of notes) { this.tone(n.m, t, Math.max(0.15, n.d - gap)); t += n.d; }
    const ms = (t - this.ctx.currentTime) * 1000;
    await new Promise(r => setTimeout(r, ms + 60));
    return t - start;
  }

  blip(freq, t0, dur = 0.07, vel = 0.25) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vel, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  /* Short sound cues: 'turn' = your turn, 'ok', 'end' */
  async cue(kind) {
    await this.ensure();
    const t = this.ctx.currentTime + 0.03;
    if (kind === 'turn') { this.blip(1320, t); this.blip(1760, t + 0.09); }
    else if (kind === 'ok') { this.blip(1046, t, 0.09, 0.18); this.blip(1568, t + 0.1, 0.14, 0.18); }
    else if (kind === 'end') { this.blip(1568, t, 0.1, 0.2); this.blip(1046, t + 0.12, 0.1, 0.2); this.blip(784, t + 0.24, 0.2, 0.2); }
    await new Promise(r => setTimeout(r, 260));
  }

  /* ---------- voice prompts (Web Speech, pt-BR) ---------- */
  unlockSpeech() {
    if (!('speechSynthesis' in window)) return;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      this.voice = vs.find(v => /pt[-_]BR/i.test(v.lang) && /Luciana|Felipe|Google/i.test(v.name))
        || vs.find(v => /pt[-_]BR/i.test(v.lang)) || vs.find(v => /^pt/i.test(v.lang)) || null;
    };
    pick();
    speechSynthesis.onvoiceschanged = pick;
  }

  speak(text, rate = 1.05) {
    if (!('speechSynthesis' in window) || !text) return Promise.resolve();
    return new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'pt-BR'; if (this.voice) u.voice = this.voice;
        u.rate = rate; u.volume = 1;
        u.onend = finish; u.onerror = finish;
        speechSynthesis.speak(u);
      } catch (e) { finish(); }
      // iOS sometimes never fires onend
      setTimeout(finish, 1200 + text.length * 75);
    });
  }

  /* ---------- keep the screen on during practice ---------- */
  async keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
      } else if (!on && this.wakeLock) {
        await this.wakeLock.release(); this.wakeLock = null;
      }
    } catch (e) { this.wakeLock = null; }
  }
}
