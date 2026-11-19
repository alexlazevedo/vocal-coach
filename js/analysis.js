// Turns a stream of pitch frames into per-note measurements.
// Frame: {t: ms, midi: float|null, level, clarity}

export const GOOD = 25, NEAR = 50;   // cents
export const rate = c => c == null ? 'miss' : Math.abs(c) <= GOOD ? 'good' : Math.abs(c) <= NEAR ? 'near' : 'off';

export const median = a => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const pct = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };

/* ---------- segmentation: voiced frames -> note-like segments ---------- */
export function segment(frames, { gapMs = 110, jump = 0.75, minMs = 110 } = {}) {
  const segs = [];
  let cur = null, pending = [];
  const close = () => {
    if (cur && cur.frames.length) {
      cur.start = cur.frames[0].t; cur.end = cur.frames[cur.frames.length - 1].t;
      if (cur.end - cur.start >= minMs) {
        const n = cur.frames.length;
        const core = cur.frames.slice(Math.floor(n * 0.25), Math.max(Math.floor(n * 0.25) + 1, Math.ceil(n * 0.9)));
        cur.midi = median(core.map(f => f.midi));
        segs.push(cur);
      }
    }
    cur = null; pending = [];
  };
  for (const fr of frames) {
    if (fr.midi == null) { if (cur && fr.t - cur.frames[cur.frames.length - 1].t > gapMs) close(); continue; }
    if (cur && fr.t - cur.frames[cur.frames.length - 1].t > gapMs) close();
    if (!cur) { cur = { frames: [fr] }; continue; }
    const recent = cur.frames.slice(-5).map(f => f.midi);
    const ref = median(recent);
    if (Math.abs(fr.midi - ref) > jump) {
      pending.push(fr);
      const pm = pending.map(f => f.midi);
      if (pending.length >= 3 && Math.max(...pm) - Math.min(...pm) < 0.8) {
        const carry = pending; close(); cur = { frames: carry };
      } else if (pending.length >= 6) pending = []; // erratic: drop
    } else {
      if (pending.length) { cur.frames.push(...pending); pending = []; }
      cur.frames.push(fr);
    }
  }
  close();
  return segs;
}

/* distance to a target allowing an octave error (flagged) */
function octaveAware(m, target) {
  const d = m - target;
  let best = { d, oct: 0 };
  for (const k of [-12, 12]) {
    const dk = d - k;
    if (Math.abs(dk) + 0.6 < Math.abs(best.d)) best = { d: dk, oct: k };
  }
  return best;
}

/* ---------- align target notes with sung segments (edit-distance DP) ---------- */
export function align(targets, segs) {
  const n = targets.length, m = segs.length;
  const INF = 1e9;
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(INF));
  const back = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
  cost[0][0] = 0;
  const SKIP_SEG = 0.6, SKIP_TGT = 3.2;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    const c = cost[i][j]; if (c >= INF) continue;
    if (i < n && j < m) {
      const oa = octaveAware(segs[j].midi, targets[i]);
      const mc = Math.min(Math.abs(oa.d), 4) + (oa.oct ? 0.5 : 0);
      if (c + mc < cost[i + 1][j + 1]) { cost[i + 1][j + 1] = c + mc; back[i + 1][j + 1] = 1; }
    }
    if (j < m && c + SKIP_SEG < cost[i][j + 1]) { cost[i][j + 1] = c + SKIP_SEG; back[i][j + 1] = 2; }
    if (i < n && c + SKIP_TGT < cost[i + 1][j]) { cost[i + 1][j] = c + SKIP_TGT; back[i + 1][j] = 3; }
  }
  const match = new Array(n).fill(-1);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const b = back[i][j];
    if (b === 1) { match[i - 1] = j - 1; i--; j--; }
    else if (b === 2) j--;
    else if (b === 3) i--;
    else break;
  }
  return match;
}

/* ---------- measurements for one sung note ---------- */
export function noteMetrics(seg, target) {
  const oa = octaveAware(seg.midi, target);
  const t = target + oa.oct;
  const fr = seg.frames;
  const errs = fr.map(f => (f.midi - t) * 100);
  // attack: first frame that stays within 35 cents for 3 frames
  let settle = -1;
  for (let k = 0; k + 2 < errs.length; k++) {
    if (Math.abs(errs[k]) <= 35 && Math.abs(errs[k + 1]) <= 35 && Math.abs(errs[k + 2]) <= 35) { settle = k; break; }
  }
  const startErr = mean(errs.slice(0, 2));
  const attackMs = settle >= 0 ? fr[settle].t - fr[0].t : null;
  let scoop = null;
  if (startErr < -60 && (attackMs == null || attackMs > 60)) scoop = 'below';
  else if (startErr > 60 && (attackMs == null || attackMs > 60)) scoop = 'above';
  // steady part: after settling (or 25%) up to 90%
  const a = settle >= 0 ? settle : Math.floor(errs.length * 0.25);
  const b = Math.max(a + 1, Math.ceil(errs.length * 0.9));
  const steady = errs.slice(a, b);
  const err = median(steady.length ? steady : errs);
  // stability: spread after removing the linear trend (a slow drift is reported separately)
  let stab = 0;
  if (steady.length > 4) {
    const n = steady.length, xm = (n - 1) / 2, ym = mean(steady);
    let num = 0, den = 0;
    steady.forEach((y, x) => { num += (x - xm) * (y - ym); den += (x - xm) ** 2; });
    const slope = den ? num / den : 0;
    stab = std(steady.map((y, x) => y - (ym + slope * (x - xm))));
  }
  const thirds = Math.floor(steady.length / 3);
  const drift = thirds >= 3 ? median(steady.slice(-thirds)) - median(steady.slice(0, thirds)) : 0;
  return {
    target, err: Math.round(err) || 0, stab: Math.round(stab) || 0, attackMs: attackMs == null ? null : Math.round(attackMs),
    scoop, drift: Math.round(drift) || 0, dur: Math.round(seg.end - seg.start), octave: oa.oct
  };
}

/* ---------- a whole repetition of a phrase ---------- */
export function analyzePhrase(targets, frames) {
  const segs = segment(frames);
  const match = align(targets, segs);
  const notes = targets.map((tg, i) => match[i] >= 0 ? noteMetrics(segs[match[i]], tg) : { target: tg, err: null });
  const sung = notes.filter(n => n.err != null);
  const errs = sung.map(n => n.err);
  return {
    notes,
    sung: sung.length,
    missed: notes.length - sung.length,
    hit: sung.filter(n => Math.abs(n.err) <= GOOD).length,
    meanAbs: errs.length ? Math.round(mean(errs.map(Math.abs))) : null,
    bias: errs.length ? Math.round(mean(errs)) : null,
    voiced: frames.some(f => f.midi != null)
  };
}

/* ---------- glides (siren) and range runs ---------- */
export function findBreaks(frames) {
  const v = frames.filter(f => f.midi != null);
  const breaks = [];
  for (let k = 1; k < v.length; k++) {
    const dt = v[k].t - v[k - 1].t, dm = v[k].midi - v[k - 1].midi;
    if (dt <= 70 && Math.abs(dm) >= 1.8) {
      // must persist: the next frames stay near the new pitch
      const nxt = v.slice(k, k + 3).map(f => f.midi);
      if (nxt.length >= 3 && Math.max(...nxt) - Math.min(...nxt) < 1.2) breaks.push({ at: Math.min(v[k].midi, v[k - 1].midi), kind: 'salto', dir: Math.sign(dm) });
    } else if (dt > 90 && dt < 450 && Math.abs(dm) < 3 && frames.some(f => f.t > v[k - 1].t && f.t < v[k].t && f.level > 0)) {
      breaks.push({ at: (v[k].midi + v[k - 1].midi) / 2, kind: 'falha', dir: 0 });
    }
  }
  // merge breaks closer than 1.5 semitones
  const out = [];
  for (const b of breaks.sort((x, y) => x.at - y.at)) {
    const last = out[out.length - 1];
    if (last && b.at - last.at < 1.5) last.count++;
    else out.push({ ...b, count: 1 });
  }
  return out.map(b => ({ ...b, at: Math.round(b.at * 10) / 10 }));
}

export function analyzeGlide(frames) {
  const ms = frames.filter(f => f.midi != null).map(f => f.midi);
  if (ms.length < 8) return { voiced: false, low: null, high: null, span: 0, breaks: [] };
  const low = pct(ms, 0.03), high = pct(ms, 0.97);
  return { voiced: true, low: Math.round(low), high: Math.round(high), span: Math.round(high - low), breaks: findBreaks(frames) };
}

/* lowest / highest note held steadily for at least holdMs */
export function stableExtreme(frames, dir, holdMs = 350) {
  const v = frames.filter(f => f.midi != null);
  let best = null;
  for (let a = 0; a < v.length; a++) {
    let b = a;
    while (b + 1 < v.length && v[b + 1].t - v[a].t <= holdMs && v[b + 1].t - v[b].t < 120) b++;
    if (v[b].t - v[a].t < holdMs * 0.85) continue;
    const win = v.slice(a, b + 1).map(f => f.midi);
    if (std(win) > 0.35) continue;
    const m = median(win);
    if (best == null || (dir < 0 ? m < best : m > best)) best = m;
  }
  const ms = v.map(f => f.midi);
  return {
    stable: best == null ? null : Math.round(best),
    reach: ms.length ? Math.round(dir < 0 ? pct(ms, 0.02) : pct(ms, 0.98)) : null
  };
}

/* ---------- session-level aggregation ---------- */
export function summarizeNotes(notes) {
  const sung = notes.filter(n => n.err != null);
  const errs = sung.map(n => n.err);
  const stabs = sung.filter(n => n.dur > 600).map(n => n.stab);
  const atk = sung.filter(n => n.attackMs != null).map(n => n.attackMs);
  return {
    total: notes.length,
    sung: sung.length,
    hitPct: notes.length ? Math.round(100 * sung.filter(n => Math.abs(n.err) <= GOOD).length / notes.length) : 0,
    nearPct: notes.length ? Math.round(100 * sung.filter(n => Math.abs(n.err) <= NEAR).length / notes.length) : 0,
    meanAbs: errs.length ? Math.round(mean(errs.map(Math.abs))) : null,
    bias: errs.length ? Math.round(mean(errs)) : null,
    stab: stabs.length ? Math.round(median(stabs)) : null,
    attack: atk.length ? Math.round(median(atk)) : null,
    scoopPct: sung.length ? Math.round(100 * sung.filter(n => n.scoop === 'below').length / sung.length) : 0,
    octaves: sung.filter(n => n.octave).length
  };
}
