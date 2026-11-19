import { AudioEngine, midiToHz } from './audio.js';
import { analyzePhrase, analyzeGlide, stableExtreme, findBreaks, summarizeNotes, rate, median, mean, GOOD, NEAR } from './analysis.js';
import { EXERCISES, QUICK, exById, buildPlan, estimateMin, noteName, setNotation, intervalName, INTERVALS, DEFAULT_RANGE } from './exercises.js';
import { GUIDE, guideById, tipsFor } from './guide.js';

const VERSION = '1.0.0';

/* =========================================================
   Storage (this device only)
   ========================================================= */
const store = {
  get(k, d) { try { const v = localStorage.getItem('vc:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('vc:' + k, JSON.stringify(v)); return true; } catch (e) { toast('Não foi possível salvar neste aparelho.'); return false; } }
};
const S = {
  settings: Object.assign({ notation: 'cifra', voice: 'carro', carMode: false, tempo: 'normal', micMode: 'continuous', volume: 0.8 }, store.get('settings', {})),
  profile: store.get('profile', { range: null }),
  sessions: store.get('sessions', []),
  rangeTests: store.get('rangeTests', []),
  reps: store.get('reps', {}),
  lastTips: store.get('lastTips', [])
};
const saveSettings = () => store.set('settings', S.settings);
const saveProfile = () => store.set('profile', S.profile);
const saveSessions = () => store.set('sessions', S.sessions.slice(-250));
setNotation(S.settings.notation);

const curRange = () => S.profile.range ? { lo: S.profile.range.lo, hi: S.profile.range.hi } : { ...DEFAULT_RANGE };

/* =========================================================
   Helpers
   ========================================================= */
const $ = id => document.getElementById(id);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const COL = { good: '#38ffa0', near: '#ffb340', off: '#ff5ccf', miss: '#4a5070', ref: '#38d6ff', you: '#b48cff' };
const fmtDate = iso => { const d = new Date(iso); return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', ''); };
const signC = c => (c > 0 ? '+' : '') + c;
const semisText = s => { const o = Math.floor(s / 12), r = s % 12; return (o ? o + (o > 1 ? ' oitavas' : ' oitava') : '') + (o && r ? ' e ' : '') + (r || !o ? r + (r === 1 ? ' semitom' : ' semitons') : ''); };
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>',
  mic: '<svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  speaker: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>'
};
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3800); }
const speaks = () => S.settings.voice === 'sempre' || (S.settings.voice === 'carro' && S.settings.carMode);

/* =========================================================
   Audio + frame loop
   ========================================================= */
const engine = new AudioEngine();
engine.setVolume(S.settings.volume);
const live = [];                 // last ~10 s of frames
let rec = null;                  // {frames:[], start}
let lastRead = 0;

function displayPitch() {
  const now = performance.now();
  const v = [];
  for (let i = live.length - 1; i >= 0 && v.length < 4; i--) {
    if (now - live[i].t > 140) break;
    if (live[i].midi != null) v.push(live[i].midi);
  }
  return v.length >= 2 ? median(v) : null;
}

/* =========================================================
   Background: slow star field (same language as the Carrossel)
   ========================================================= */
const bg = $('bg'), bctx = bg.getContext('2d');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const STARS = Array.from({ length: 150 }, () => ({
  x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, tw: Math.random() * 6.28,
  tint: Math.random() < .18 ? ['#38ffa0', '#ff5ccf', '#ffb340', '#38d6ff', '#b48cff'][Math.floor(Math.random() * 5)] : null
}));
function sizeBg() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  bg.width = Math.round(innerWidth * dpr); bg.height = Math.round(innerHeight * dpr);
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function drawBg(t) {
  const w = innerWidth, hh = innerHeight;
  bctx.clearRect(0, 0, w, hh);
  const lvl = displayPitch() != null ? 1 : 0;
  for (const s of STARS) {
    const x = ((s.x + t * 0.000004 * s.z) % 1) * w, y = s.y * hh;
    const a = (0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.0016 + s.tw))) * s.z * (0.8 + 0.4 * lvl);
    bctx.fillStyle = s.tint ? rgba(s.tint, a) : `rgba(215,225,255,${a})`;
    const r = s.z * 1.5;
    bctx.fillRect(x - r / 2, y - r / 2, r, r);
  }
}

function tick(t) {
  requestAnimationFrame(tick);
  if (engine.micOn && t - lastRead >= 22) {
    lastRead = t;
    const fr = engine.read();
    if (fr) {
      live.push(fr);
      while (live.length && fr.t - live[0].t > 10000) live.shift();
      if (rec) rec.frames.push(fr);
    }
  }
  if ($('ov').hidden) {
    if (!reduce || !tick.drawn) { drawBg(t); tick.drawn = true; }
    if (curView === 'tuner') drawTuner(t);
  } else {
    drawSessionCanvas(t);
  }
}

/* =========================================================
   Piano-roll canvas (shared by tuner, session and range test)
   ========================================================= */
function fitCanvas(c) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const r = c.getBoundingClientRect();
  if (!r.width) return null;
  const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}
function drawLanes(g, lo, hi, labels) {
  const { ctx, w, h: H } = g;
  const LEFT = 34;
  const y = m => H - 8 - (m - lo) / (hi - lo) * (H - 16);
  const per = (H - 16) / (hi - lo);
  ctx.clearRect(0, 0, w, H);
  ctx.font = '600 9.5px "Chakra Petch", sans-serif';
  ctx.textBaseline = 'middle';
  for (let m = Math.ceil(lo); m <= Math.floor(hi); m++) {
    const pc = ((m % 12) + 12) % 12, black = [1, 3, 6, 8, 10].includes(pc);
    if (black && per > 6) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(LEFT, y(m) - per / 2, w - LEFT, per); }
    ctx.strokeStyle = pc === 0 ? 'rgba(170,180,255,.22)' : 'rgba(170,180,255,.06)';
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(LEFT, y(m)); ctx.lineTo(w, y(m)); ctx.stroke();
    const want = labels && labels.has(m);
    if (want || pc === 0 || (!black && per >= 11)) {
      ctx.fillStyle = want ? '#38d6ff' : 'rgba(141,147,176,.85)';
      ctx.fillText(noteName(m), 4, y(m));
    }
  }
  return { y, LEFT, per };
}
function traceColor(m, targets) {
  if (!targets || !targets.length) return COL.you;
  let d = Infinity;
  for (const t of targets) d = Math.min(d, Math.abs(m - t));
  return d * 100 <= GOOD ? COL.good : d * 100 <= NEAR ? COL.near : COL.off;
}
function drawTrace(ctx, frames, x, y, targetsFor, w) {
  ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let prev = null;
  for (const f of frames) {
    if (f.midi == null) { prev = null; continue; }
    const px = x(f.t), py = y(f.midi);
    if (px < 30 || px > w) { prev = null; continue; }
    if (prev && f.t - prev.t < 90 && Math.abs(f.midi - prev.midi) < 2.5) {
      const c = traceColor(f.midi, targetsFor(f.t));
      ctx.strokeStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(x(prev.t), y(prev.midi)); ctx.lineTo(px, py); ctx.stroke();
    }
    prev = f;
  }
  ctx.shadowBlur = 0;
}
function drawBars(ctx, notes, x0, msToX, y, color, alpha, per) {
  let t = x0;
  ctx.fillStyle = rgba(color, alpha); ctx.strokeStyle = rgba(color, Math.min(1, alpha * 2.2));
  for (const n of notes) {
    const a = msToX(t), b = msToX(t + n.d * 1000 - 40);
    const hh = Math.max(6, Math.min(14, per * 0.8));
    ctx.beginPath(); ctx.roundRect(a, y(n.m) - hh / 2, Math.max(4, b - a), hh, 4); ctx.fill(); ctx.stroke();
    t += n.d * 1000;
  }
}

/* =========================================================
   Views
   ========================================================= */
let curView = 'train';
const TITLES = { train: 'Treinar', tuner: 'Afinador', progress: 'Progresso', guide: 'Guia' };
function show(view, opts = {}) {
  curView = view;
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === view)));
  ['train', 'tuner', 'progress', 'guide'].forEach(v => { $('v-' + v).hidden = v !== view; });
  $('viewTitle').textContent = TITLES[view];
  if (view === 'train') renderTrain();
  if (view === 'tuner') renderTuner();
  if (view === 'progress') renderProgress();
  if (view === 'guide') renderGuide(opts.open);
  if (view !== 'tuner' && tunerOn && $('ov').hidden) stopTuner();
  if (!opts.keepScroll) $('v-' + view).scrollTop = 0;
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));

function renderRangeChip() {
  const r = S.profile.range;
  $('rangeTxt').textContent = r ? noteName(r.lo) + '–' + noteName(r.hi) : 'Testar';
}
$('rangeChip').addEventListener('click', () => S.profile.range ? show('progress') : startRangeTest());

/* ---------------- Treinar ---------------- */
function renderTrain() {
  const v = $('v-train'); v.textContent = '';
  const range = curRange();
  if (!S.profile.range) {
    const hero = h(`<div class="panel hero grid" style="--c:${COL.you}">
      <span class="kind">Primeiro passo · 1 min</span>
      <div class="p-title">Descubra sua extensão</div>
      <p class="p-desc">Duas sirenes: uma descendo até a nota mais grave, outra subindo até a mais aguda. Os exercícios passam a ser montados dentro da sua faixa, e o progresso da extensão fica registrado.</p>
      <div style="height:14px"></div>
      <button class="btn block" style="--c:${COL.you}">${ICON.mic} Fazer o teste</button>
    </div>`);
    hero.querySelector('.btn').addEventListener('click', startRangeTest);
    v.append(hero);
  }
  const quickPlan = buildPlan(QUICK, range, S.settings.tempo);
  const hero = h(`<div class="panel hero grid" style="--c:${COL.ref}">
    <span class="kind">Sessão rápida · ~${estimateMin(quickPlan)} min</span>
    <div class="p-title">Treino completo</div>
    <p class="p-desc">Um pouco de cada exercício, em ordem de aquecimento: sustentar, escala, intervalos, arpejo e sirene.</p>
    <div class="chips">${QUICK.map(([id, n]) => { const e = exById(id); return `<span class="chip" style="--c:${e.color}"><i></i>${esc(e.name)}<em>×${n}</em></span>`; }).join('')}</div>
    <button class="switch" role="switch" aria-checked="${S.settings.carMode}" id="carSwitch">
      <span class="txt"><b>Modo carro</b><small>Voz guia e telas grandes. Nenhum toque necessário durante o treino.</small></span><span class="tog"></span>
    </button>
    <button class="btn block" id="quickStart">${ICON.play} Começar</button>
    ${S.profile.range ? '' : `<p class="small muted" style="margin-top:10px">Sem o teste de extensão, uso uma faixa padrão (${noteName(range.lo)}–${noteName(range.hi)}).</p>`}
  </div>`);
  hero.querySelector('#carSwitch').addEventListener('click', e => {
    S.settings.carMode = !S.settings.carMode; saveSettings();
    e.currentTarget.setAttribute('aria-checked', String(S.settings.carMode));
  });
  hero.querySelector('#quickStart').addEventListener('click', () => startSession(QUICK, 'Treino completo', 'quick'));
  v.append(hero);

  v.append(h(`<div class="sec-title"><h2>Exercícios avulsos</h2><span></span><em>${noteName(range.lo)}–${noteName(range.hi)}</em></div>`));
  const list = el('div', 'ex-list');
  for (const ex of EXERCISES) {
    const reps = S.reps[ex.id] || ex.defaultReps;
    const row = h(`<div class="ex-row" style="--c:${ex.color}">
      <span class="bar"></span>
      <div><h3>${esc(ex.name)}</h3><p>${esc(ex.desc)}</p><div class="tags">Mede: ${ex.measures.map(esc).join(' · ')}</div></div>
      <div class="ex-side">
        <button class="play" aria-label="Iniciar ${esc(ex.name)}">${ICON.play}</button>
        <div class="stepper" aria-label="Repetições"><button aria-label="Menos">−</button><span>${reps}</span><button aria-label="Mais">+</button></div>
      </div></div>`);
    const [minus, plus] = row.querySelectorAll('.stepper button'), out = row.querySelector('.stepper span');
    const setReps = n => { n = Math.max(1, Math.min(12, n)); S.reps[ex.id] = n; store.set('reps', S.reps); out.textContent = n; };
    minus.addEventListener('click', () => setReps((S.reps[ex.id] || ex.defaultReps) - 1));
    plus.addEventListener('click', () => setReps((S.reps[ex.id] || ex.defaultReps) + 1));
    row.querySelector('.play').addEventListener('click', () => startSession([[ex.id, S.reps[ex.id] || ex.defaultReps]], ex.name, ex.id));
    list.append(row);
  }
  v.append(list);

  if (S.profile.range) {
    v.append(h(`<div class="sec-title"><h2>Sua extensão</h2><span></span></div>`));
    const p = h(`<div class="panel" style="--c:${COL.you}"></div>`);
    p.append(keysStrip(S.profile.range));
    const r = S.profile.range;
    p.append(h(`<p class="small muted">Testada em ${fmtDate(r.date)}. Faixa de trabalho ${noteName(r.lo)}–${noteName(r.hi)}; alcance ${noteName(r.low)}–${noteName(r.high)}.</p>`));
    const b = h(`<button class="btn alt sm" style="--c:${COL.you};margin-top:10px">Refazer teste</button>`);
    b.addEventListener('click', startRangeTest);
    p.append(b);
    v.append(p);
  }
}

/* keyboard strip showing reach / comfort / breaks */
function keysStrip(r) {
  const lo = Math.min(r.low ?? r.lo, r.lo) - 2, hi = Math.max(r.high ?? r.hi, r.hi) + 2;
  const from = Math.floor(lo / 12) * 12, to = Math.ceil((hi + 1) / 12) * 12;
  const span = to - from, pc = m => ((m % 12) + 12) % 12, X = m => ((m - from) / span * 100).toFixed(2) + '%';
  const wrap = el('div');
  const k = el('div', 'keys');
  for (let m = from; m < to; m++) {
    const d = el('div', 'k' + ([1, 3, 6, 8, 10].includes(pc(m)) ? ' blk' : ''));
    d.style.left = X(m); d.style.width = (100 / span).toFixed(2) + '%'; k.append(d);
  }
  if (r.low != null && r.high != null) { const z = el('div', 'zone reach'); z.style.left = X(r.low); z.style.width = ((r.high - r.low + 1) / span * 100).toFixed(2) + '%'; k.append(z); }
  const c = el('div', 'zone comfort'); c.style.left = X(r.lo); c.style.width = ((r.hi - r.lo + 1) / span * 100).toFixed(2) + '%'; k.append(c);
  (r.breaks || []).forEach(b => { const d = el('div', 'brk'); d.style.left = `calc(${X(b + 0.5)} - 1px)`; k.append(d); });
  const lbl = el('div', 'keys-lbl');
  for (let m = from; m <= to; m += 12) lbl.append(el('span', null, noteName(m)));
  wrap.append(k, lbl);
  wrap.append(h(`<div class="legend"><span><i style="background:${rgba(COL.good, .5)};border:1px solid ${COL.good}"></i>Faixa de trabalho</span><span><i style="border:1px dashed ${COL.you}"></i>Alcance</span>${(r.breaks || []).length ? `<span><i style="background:${COL.off}"></i>Quebra</span>` : ''}</div>`));
  return wrap;
}

/* ---------------- Afinador ---------------- */
let tunerOn = false;
const tuner = { target: null, showTarget: false };
function renderTuner() {
  const v = $('v-tuner'); v.textContent = '';
  if (tuner.target == null) { const r = curRange(); tuner.target = Math.round((r.lo + r.hi) / 2); }
  const p = h(`<div class="panel grid" style="--c:${COL.ref}">
    <span class="kind">Ao vivo</span>
    <div class="tuner-note"><b id="tnNote">—</b><sub id="tnOct"></sub></div>
    <p class="tuner-read" id="tnRead">${tunerOn ? 'Cante uma nota' : 'Ligue o microfone para começar'}</p>
    <div class="gauge"><div class="track"></div><div class="mid"></div><div class="needle" id="tnNeedle" style="opacity:0"></div></div>
    <div class="gauge-lbl"><span>−50</span><span>afinado</span><span>+50</span></div>
  </div>`);
  v.append(p);
  v.append(h(`<canvas class="roll" id="tnRoll" aria-label="Linha da sua voz nos últimos segundos"></canvas>`));
  const tg = h(`<div class="panel" style="--c:${COL.you}">
    <span class="kind">Nota de referência</span>
    <div class="row" style="margin-top:10px">
      <div class="stepper"><button aria-label="Meio tom abaixo">−</button><span id="tgName" style="min-width:52px;font-family:var(--f-display);font-weight:600">${noteName(tuner.target)}</span><button aria-label="Meio tom acima">+</button></div>
      <button class="btn alt sm" id="tgPlay" style="--c:${COL.ref}">${ICON.speaker} Tocar</button>
      <span class="spacer"></span>
      <button class="switch" role="switch" id="tgShow" aria-checked="${tuner.showTarget}" style="width:auto;margin:0;padding:6px 8px"><span class="txt"><b style="font-size:12.5px">Alvo</b></span><span class="tog"></span></button>
    </div>
    <p class="small muted" style="margin-top:8px">Com o alvo ligado, o medidor compara sua voz com a referência em vez da nota mais próxima. A linha azul no gráfico marca o alvo.</p>
  </div>`);
  const [minus, plus] = tg.querySelectorAll('.stepper button');
  const upd = d => { tuner.target += d; tg.querySelector('#tgName').textContent = noteName(tuner.target); };
  minus.addEventListener('click', () => upd(-1)); plus.addEventListener('click', () => upd(1));
  tg.querySelector('#tgPlay').addEventListener('click', async () => {
    await engine.ensure();
    const wasOn = tunerOn && S.settings.micMode === 'turn';
    if (wasOn) engine.stopMic();
    await engine.playPhrase([{ m: tuner.target, d: 1.6 }]);
    if (wasOn) await micStart();
  });
  tg.querySelector('#tgShow').addEventListener('click', e => { tuner.showTarget = !tuner.showTarget; e.currentTarget.setAttribute('aria-checked', String(tuner.showTarget)); });
  v.append(tg);
  const mb = h(`<button class="btn block" id="tnMic" style="--c:${tunerOn ? COL.off : COL.good}">${ICON.mic} ${tunerOn ? 'Desligar microfone' : 'Ligar microfone'}</button>`);
  mb.addEventListener('click', () => tunerOn ? stopTuner() : startTuner());
  v.append(mb);
  v.append(h(`<p class="small muted">Dica: o afinador serve para explorar sozinho — achar sua nota mais confortável, testar uma vogal, ou segurar uma nota contra a referência.</p>`));
}
async function micStart() {
  try { await engine.startMic(); return true; }
  catch (e) {
    toast('Sem acesso ao microfone. No iPhone: Ajustes › Safari › Microfone › Permitir.');
    return false;
  }
}
async function startTuner() {
  await engine.ensure();
  if (!(await micStart())) return;
  tunerOn = true; engine.keepAwake(true);
  renderTuner();
}
function stopTuner() {
  tunerOn = false; engine.stopMic(); engine.keepAwake(false);
  if (curView === 'tuner') renderTuner();
}
let lastTunerDom = 0;
function drawTuner(t) {
  const c = $('tnRoll'); if (!c) return;
  const g = fitCanvas(c); if (!g) return;
  const r = curRange();
  const lo = r.lo - 5, hi = r.hi + 6;
  const lanes = drawLanes(g, lo, hi, tuner.showTarget ? new Set([tuner.target]) : null);
  const now = performance.now(), span = 8000;
  const x = tt => lanes.LEFT + (tt - (now - span)) / span * (g.w - lanes.LEFT);
  if (tuner.showTarget) {
    g.ctx.strokeStyle = rgba(COL.ref, .7); g.ctx.lineWidth = 2; g.ctx.setLineDash([6, 5]);
    g.ctx.beginPath(); g.ctx.moveTo(lanes.LEFT, lanes.y(tuner.target)); g.ctx.lineTo(g.w, lanes.y(tuner.target)); g.ctx.stroke(); g.ctx.setLineDash([]);
  }
  drawTrace(g.ctx, live, x, lanes.y, () => tuner.showTarget ? [tuner.target] : null, g.w);
  if (t - lastTunerDom < 66) return;
  lastTunerDom = t;
  const m = displayPitch();
  const nn = $('tnNote'), oct = $('tnOct'), rd = $('tnRead'), nd = $('tnNeedle');
  if (!nn) return;
  if (m == null) { nd.style.opacity = '0'; if (tunerOn) rd.textContent = 'Cante uma nota'; return; }
  const ref = tuner.showTarget ? tuner.target : Math.round(m);
  const cents = Math.round((m - ref) * 100);
  const name = noteName(Math.round(m));
  nn.textContent = name.replace(/-?\d+$/, ''); oct.textContent = name.match(/-?\d+$/)?.[0] || '';
  const cl = Math.abs(cents) <= GOOD ? COL.good : Math.abs(cents) <= NEAR ? COL.near : COL.off;
  nn.style.color = cl; nn.style.textShadow = `0 0 26px ${rgba(cl, .6)}`;
  rd.textContent = `${midiToHz(m).toFixed(1)} Hz · ${signC(cents)} cents${tuner.showTarget ? ' do alvo ' + noteName(tuner.target) : ''}`;
  nd.style.opacity = '1'; nd.style.left = (50 + Math.max(-50, Math.min(50, cents))) + '%';
}

/* ---------------- Progresso ---------------- */
function allNotes(sessions) {
  const out = [];
  for (const s of sessions) for (const b of s.blocks || []) for (const r of b.reps || []) if (r.n) r.n.forEach((n, i) => out.push({ ex: b.ex, t: n[0], e: n.length > 1 ? n[1] : null, iv: r.iv, idx: i, date: s.date }));
  return out;
}
function lineChart(vals, { max = 100, unit = '%', color = COL.good } = {}) {
  const W = 320, H = 150, L = 28, B = 20, T = 10;
  const n = vals.length;
  const x = i => n === 1 ? (L + W) / 2 : L + i / (n - 1) * (W - L - 8);
  const y = v => T + (1 - v / max) * (H - T - B);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução por sessão">`;
  for (const g of [0, 25, 50, 75, 100]) s += `<line x1="${L}" x2="${W}" y1="${y(g)}" y2="${y(g)}" stroke="rgba(170,180,255,${g === 0 ? .2 : .07})"/><text x="${L - 6}" y="${y(g) + 3}" fill="#8d93b0" font-size="9" text-anchor="end" font-family="Chakra Petch, sans-serif">${g}</text>`;
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  s += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" style="filter:drop-shadow(0 0 6px ${color})"/>`;
  vals.forEach((v, i) => { s += `<circle cx="${x(i)}" cy="${y(v)}" r="${i === n - 1 ? 4.5 : 3}" fill="${i === n - 1 ? color : '#04050b'}" stroke="${color}" stroke-width="2"/>`; });
  s += `<text x="${x(n - 1)}" y="${y(vals[n - 1]) - 10}" fill="${color}" font-size="12" font-weight="700" text-anchor="${n > 1 ? 'end' : 'middle'}" font-family="Chakra Petch, sans-serif">${vals[n - 1]}${unit}</text>`;
  s += `<text x="${L}" y="${H - 4}" fill="#8d93b0" font-size="9" font-family="Chakra Petch, sans-serif">mais antiga</text><text x="${W - 8}" y="${H - 4}" fill="#8d93b0" font-size="9" text-anchor="end" font-family="Chakra Petch, sans-serif">mais recente</text>`;
  return s + '</svg>';
}
function heatStrip(notes, lo, hi) {
  const by = {};
  for (const n of notes) if (n.e != null) (by[n.t] = by[n.t] || []).push(Math.abs(n.e));
  const wrap = el('div', 'heat');
  for (let m = lo; m <= hi; m++) {
    const a = by[m], avg = a ? mean(a) : null;
    const c = avg == null ? null : avg <= GOOD ? COL.good : avg <= NEAR ? COL.near : COL.off;
    const cell = el('div', 'cell');
    const sw = el('div', 'sw');
    sw.style.background = c ? rgba(c, .25 + Math.min(.55, (a.length / 12) * .55)) : 'rgba(255,255,255,.03)';
    sw.style.border = '1px solid ' + (c ? c : 'rgba(170,180,255,.1)');
    sw.title = noteName(m) + (avg == null ? ': sem dados' : `: ${Math.round(avg)} cents em média (${a.length} notas)`);
    const lab = (hi - lo) <= 12 || m % 12 === 0 || (m === lo && m % 12 < 10) || (m === hi && m % 12 > 2);
    cell.append(sw, el('span', 'nm', lab ? noteName(m) : ''));
    wrap.append(cell);
  }
  return { wrap, by };
}
function renderProgress() {
  const v = $('v-progress'); v.textContent = '';
  const r = S.profile.range;

  /* 1. range */
  v.append(h(`<div class="sec-title"><h2>Extensão</h2><span></span></div>`));
  const pr = h(`<div class="panel" style="--c:${COL.you}"></div>`);
  if (r) {
    pr.append(keysStrip(r));
    const tests = S.rangeTests.slice(-6).reverse();
    if (tests.length) {
      const tb = h(`<table class="tbl" style="margin-top:12px"><thead><tr><th>Teste</th><th>Grave</th><th>Agudo</th><th>Extensão</th></tr></thead><tbody></tbody></table>`);
      tests.forEach(t => tb.tBodies[0].append(h(`<table><tr><td>${fmtDate(t.date)}</td><td>${noteName(t.low)}</td><td>${noteName(t.high)}</td><td>${t.high - t.low} st</td></tr></table>`).querySelector('tr')));
      pr.append(tb);
      if (S.rangeTests.length >= 2) {
        const first = S.rangeTests[0], last = S.rangeTests[S.rangeTests.length - 1];
        const d = (last.high - last.low) - (first.high - first.low);
        pr.append(h(`<p class="small" style="margin-top:8px">${d > 0 ? `Sua extensão cresceu <b>${d} semiton${d > 1 ? 's' : ''}</b> desde o primeiro teste.` : d < 0 ? `Extensão ${-d} semiton(s) menor que no primeiro teste — normal em dia de voz cansada.` : 'Extensão estável desde o primeiro teste.'}</p>`));
      }
    }
  } else pr.append(h(`<p class="p-desc">Ainda sem teste de extensão.</p>`));
  const rb = h(`<button class="btn alt sm" style="--c:${COL.you};margin-top:12px">${r ? 'Refazer teste' : 'Fazer o teste'}</button>`);
  rb.addEventListener('click', startRangeTest); pr.append(rb);
  v.append(pr);

  const sessions = S.sessions.filter(s => s.sum && s.sum.total);
  if (!sessions.length) {
    v.append(h(`<div class="panel" style="--c:${COL.ref}"><span class="kind">Sem sessões ainda</span><p class="p-desc" style="margin-top:6px">Depois do primeiro treino aparecem aqui: evolução da afinação, as regiões onde você desafina e o acerto por intervalo.</p></div>`));
    v.append(dataPanel());
    return;
  }

  /* 2. tuning over time */
  v.append(h(`<div class="sec-title"><h2>Afinação por sessão</h2><span></span><em>% de notas afinadas</em></div>`));
  const last = sessions.slice(-20);
  const pt = h(`<div class="panel" style="--c:${COL.good}">${lineChart(last.map(s => s.sum.hitPct))}</div>`);
  const l5 = sessions.slice(-5);
  pt.append(h(`<p class="small muted" style="margin-top:6px">Últimas ${l5.length}: <b style="color:var(--ink)">${Math.round(mean(l5.map(s => s.sum.hitPct)))}%</b> afinadas · erro médio <b style="color:var(--ink)">${Math.round(mean(l5.map(s => s.sum.meanAbs ?? 0)))} cents</b> · tendência <b style="color:var(--ink)">${biasWord(Math.round(mean(l5.map(s => s.sum.bias ?? 0))))}</b>. "Afinada" = até ${GOOD} cents da nota.</p>`));
  v.append(pt);

  /* 3. regions */
  const cutoff = Date.now() - 30 * 864e5;
  const recent = allNotes(sessions.filter(s => new Date(s.date).getTime() >= cutoff));
  const rr = curRange();
  v.append(h(`<div class="sec-title"><h2>Onde você desafina</h2><span></span><em>30 dias</em></div>`));
  const ph = h(`<div class="panel" style="--c:${COL.near}"><p class="small muted">Erro médio por nota cantada. Cor mais forte = mais tentativas.</p></div>`);
  const hs = heatStrip(recent, rr.lo - 1, rr.hi + 1);
  ph.append(hs.wrap);
  const ranked = Object.entries(hs.by).filter(([, a]) => a.length >= 3).map(([m, a]) => [+m, mean(a)]).sort((a, b) => a[1] - b[1]);
  if (ranked.length >= 3) ph.append(h(`<p class="small" style="margin-top:10px">Mais firme em <b>${ranked.slice(0, 2).map(x => noteName(x[0])).join(' e ')}</b>; mais instável em <b>${ranked.slice(-2).reverse().map(x => noteName(x[0])).join(' e ')}</b>.</p>`));
  ph.append(h(`<div class="legend"><span><i style="background:${COL.good}"></i>até ${GOOD}¢</span><span><i style="background:${COL.near}"></i>até ${NEAR}¢</span><span><i style="background:${COL.off}"></i>mais de ${NEAR}¢</span></div>`));
  v.append(ph);

  /* 4. intervals */
  const ivNotes = allNotes(sessions).filter(n => n.ex === 'intervals' && n.idx === 1);
  if (ivNotes.length) {
    v.append(h(`<div class="sec-title"><h2>Intervalos</h2><span></span><em>nota de chegada</em></div>`));
    const p = h(`<div class="panel" style="--c:${COL.near}"><table class="tbl"><thead><tr><th>Intervalo</th><th>Tent.</th><th>Afinado</th><th>Erro</th></tr></thead><tbody></tbody></table></div>`);
    for (const iv of INTERVALS) {
      const a = ivNotes.filter(n => n.iv === iv.s); if (!a.length) continue;
      const sung = a.filter(n => n.e != null);
      const hit = Math.round(100 * sung.filter(n => Math.abs(n.e) <= GOOD).length / a.length);
      const err = sung.length ? Math.round(mean(sung.map(n => Math.abs(n.e)))) : null;
      const c = hit >= 70 ? COL.good : hit >= 40 ? COL.near : COL.off;
      p.querySelector('tbody').append(h(`<table><tr><td><span class="dot" style="background:${c};box-shadow:0 0 6px ${c}"></span>${iv.name}</td><td>${a.length}</td><td>${hit}%</td><td>${err == null ? '—' : err + '¢'}</td></tr></table>`).querySelector('tr'));
    }
    v.append(p);
  }

  /* 5. per exercise */
  v.append(h(`<div class="sec-title"><h2>Por exercício</h2><span></span><em>30 dias</em></div>`));
  const pe = h(`<div class="panel" style="--c:${COL.ref}"><table class="tbl"><thead><tr><th>Exercício</th><th>Notas</th><th>Afinadas</th><th>Erro</th></tr></thead><tbody></tbody></table></div>`);
  for (const ex of EXERCISES) {
    if (ex.glide) {
      const gl = sessions.filter(s => new Date(s.date).getTime() >= cutoff).flatMap(s => (s.blocks || []).filter(b => b.ex === ex.id).flatMap(b => b.reps.filter(r => r.g && r.g.hi != null)));
      if (!gl.length) continue;
      const hiM = Math.max(...gl.map(g => g.g.hi)), loM = Math.min(...gl.map(g => g.g.lo));
      pe.querySelector('tbody').append(h(`<table><tr><td><span class="dot" style="background:${ex.color}"></span>${ex.name}</td><td colspan="3">${noteName(loM)}–${noteName(hiM)} · ${gl.length} sirenes</td></tr></table>`).querySelector('tr'));
      continue;
    }
    const a = recent.filter(n => n.ex === ex.id); if (!a.length) continue;
    const sum = summarizeNotes(a.map(n => ({ target: n.t, err: n.e })));
    pe.querySelector('tbody').append(h(`<table><tr><td><span class="dot" style="background:${ex.color}"></span>${ex.name}</td><td>${a.length}</td><td>${sum.hitPct}%</td><td>${sum.meanAbs ?? '—'}¢</td></tr></table>`).querySelector('tr'));
  }
  v.append(pe);

  /* 6. sessions */
  v.append(h(`<div class="sec-title"><h2>Sessões recentes</h2><span></span><em>${sessions.length} no total</em></div>`));
  const ps = h(`<div class="panel" style="--c:${COL.ref}"><table class="tbl"><thead><tr><th>Data</th><th>Treino</th><th>Min</th><th>Afinadas</th></tr></thead><tbody></tbody></table></div>`);
  sessions.slice(-8).reverse().forEach(s => ps.querySelector('tbody').append(h(`<table><tr><td>${fmtDate(s.date)}</td><td>${esc(s.title)}</td><td>${Math.max(1, Math.round(s.dur / 60))}</td><td>${s.sum.hitPct}%</td></tr></table>`).querySelector('tr')));
  v.append(ps);
  v.append(dataPanel());
}
const biasWord = b => b == null ? '—' : Math.abs(b) <= 8 ? 'no centro' : b < 0 ? `${-b}¢ abaixo` : `${b}¢ acima`;

function dataPanel() {
  const p = h(`<div class="panel" style="--c:${COL.you}">
    <span class="kind">Seus dados</span>
    <p class="small muted" style="margin:6px 0 12px">Ficam só neste aparelho. Para eu analisar sua evolução, copie o resumo e cole na conversa com o Claude.</p>
    <div class="row wrap">
      <button class="btn sm" id="copySum" style="--c:${COL.you}">${ICON.copy} Copiar resumo para o Claude</button>
      <button class="btn alt sm" id="expBtn" style="--c:${COL.ref}">Exportar backup</button>
      <button class="btn alt sm" id="impBtn" style="--c:${COL.ref}">Importar</button>
    </div></div>`);
  p.querySelector('#copySum').addEventListener('click', copySummary);
  p.querySelector('#expBtn').addEventListener('click', exportBackup);
  p.querySelector('#impBtn').addEventListener('click', () => $('importFile').click());
  return p;
}

/* ---------------- Guia ---------------- */
let guideFilter = 'all';
function renderGuide(openId) {
  const v = $('v-guide'); v.textContent = '';
  v.append(h(`<div class="panel grid" style="--c:${COL.you}">
    <span class="kind">Como usar</span>
    <p class="p-desc" style="margin-top:6px">Cada item segue: <b>se você nota</b> → <b>provável causa</b> → <b>faça isso</b>. Os marcados "o app mede" aparecem no relatório quando os dados indicam; os outros são para você sentir e ouvir.</p>
  </div>`));
  const seg = h(`<div class="seg" role="radiogroup" aria-label="Filtro"><button role="radio" data-f="all">Todos</button><button role="radio" data-f="medido">O app mede</button><button role="radio" data-f="observar">Você observa</button></div>`);
  seg.querySelectorAll('button').forEach(b => {
    b.setAttribute('aria-checked', String(b.dataset.f === guideFilter));
    b.addEventListener('click', () => { guideFilter = b.dataset.f; renderGuide(); });
  });
  v.append(seg);
  const flagged = new Map(S.lastTips.map(t => [t.id, t.why]));
  const items = GUIDE.filter(g => guideFilter === 'all' || g.kind === guideFilter)
    .sort((a, b) => (flagged.has(b.id) ? 1 : 0) - (flagged.has(a.id) ? 1 : 0));
  for (const g of items) {
    const c = g.kind === 'medido' ? COL.ref : COL.you;
    const d = h(`<details class="g-item" id="g-${g.id}" style="--c:${c}">
      <summary>${flagged.has(g.id) ? '<span class="flag" title="Apareceu na última sessão"></span>' : ''}<h3>${esc(g.title)}</h3><span class="tagk">${g.kind === 'medido' ? 'o app mede' : 'observe'}</span>${ICON.chev}</summary>
      <div class="g-body">
        ${flagged.has(g.id) ? `<p class="why">Na última sessão: ${esc(flagged.get(g.id))}</p>` : ''}
        <div class="g-step"><b>Se você nota</b><span>${esc(g.signal)}</span></div>
        <div class="g-step"><b>Causa</b><span>${esc(g.cause)}</span></div>
        <div class="g-step"><b>Faça isso</b><ul>${g.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>
        ${g.detect ? `<p class="g-detect">Como o app detecta: ${esc(g.detect)}</p>` : ''}
      </div></details>`);
    if (openId === g.id) d.open = true;
    v.append(d);
  }
  if (openId) requestAnimationFrame(() => { const t = $('g-' + openId); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
}

/* =========================================================
   Session overlay
   ========================================================= */
const CANCEL = Symbol('cancel');
let sess = null;   // practice session
let rt = null;     // range test
let roll = null;   // what the session canvas shows

function openOverlay(eyebrow, title) {
  const ov = $('ov');
  ov.hidden = false;
  ov.classList.toggle('car', S.settings.carMode);
  $('ovEyebrow').textContent = eyebrow; $('ovTitle').textContent = title;
  $('ovBody').textContent = ''; $('ovCtrl').textContent = ''; $('ovBlocks').textContent = '';
  engine.keepAwake(true);
}
function closeOverlay() {
  $('ov').hidden = true; roll = null; rec = null; sess = null; rt = null;
  if (!tunerOn) engine.stopMic();
  engine.keepAwake(tunerOn);
  try { speechSynthesis.cancel(); } catch (e) {}
  renderRangeChip(); show(curView, { keepScroll: true });
}
$('ovCar').addEventListener('click', () => {
  S.settings.carMode = !S.settings.carMode; saveSettings();
  $('ov').classList.toggle('car', S.settings.carMode);
  toast(S.settings.carMode ? 'Modo carro ligado' : 'Modo carro desligado');
});
$('ovClose').addEventListener('click', () => {
  if (sess && sess.running) {
    sess.cancelled = true;
    if (sess.results.some(b => b.length)) finishSession(true); else closeOverlay();
  } else if (rt && rt.running) { rt.cancelled = true; closeOverlay(); }
  else closeOverlay();
});

function sessionShell() {
  const body = $('ovBody'); body.textContent = '';
  body.append(
    h(`<div class="phase" id="phase">PREPARANDO</div>`),
    h(`<p class="phase-sub" id="phaseSub"></p>`),
    h(`<p class="live-note" id="liveNote"></p>`),
    h(`<canvas class="roll" id="ovRoll"></canvas>`),
    h(`<div class="fb" id="fb"><div class="dots" id="fbDots"></div><p id="fbText"></p><small id="fbSmall"></small></div>`)
  );
}
const PHASES = {
  prep: ['PREPARANDO', COL.ref], intro: ['PRÓXIMO', COL.ref], listen: ['OUÇA', COL.ref], sing: ['SUA VEZ', COL.you],
  analyze: ['…', COL.ref], pause: ['PAUSADO', COL.near], done: ['FIM', COL.good]
};
function setPhase(kind, sub, label) {
  const p = $('phase'); if (!p) return;
  const [txt, c] = PHASES[kind];
  p.textContent = label || txt; p.style.setProperty('--c', c);
  if (sub != null) $('phaseSub').textContent = sub;
}
function setFeedback(res, text, small) {
  const fb = $('fb'); if (!fb) return;
  const dots = $('fbDots'); dots.textContent = '';
  if (res && res.notes) res.notes.forEach((n, i) => {
    const r = rate(n.err), d = el('i', null, String(i + 1));
    d.style.background = COL[r]; d.style.boxShadow = r === 'miss' ? 'none' : `0 0 8px ${COL[r]}`;
    d.title = n.err == null ? 'não ouvida' : signC(n.err) + ' cents';
    dots.append(d);
  });
  $('fbText').textContent = text || '';
  $('fbSmall').textContent = small || '';
  const all = res && res.notes ? res.notes.map(n => rate(n.err)) : [];
  const c = !all.length ? 'var(--muted)' : all.every(r => r === 'good') ? COL.good : all.some(r => r === 'off' || r === 'miss') ? COL.off : COL.near;
  fb.style.setProperty('--c', c);
}
function setBlocks(n, cur, colors) {
  const b = $('ovBlocks'); b.textContent = '';
  for (let i = 0; i < n; i++) { const s = el('span', i < cur ? 'done' : i === cur ? 'cur' : ''); s.style.setProperty('--c', colors[i]); b.append(s); }
}
function guard(o) { if (!o || o.cancelled) throw CANCEL; }

async function prepAudio(o) {
  await engine.ensure();
  setPhase('prep', 'Pedindo acesso ao microfone…');
  if (!(await micStart())) {
    setPhase('pause', '', 'SEM MICROFONE');
    $('phaseSub').textContent = 'Permita o microfone para este site e tente de novo. No iPhone: Ajustes › Safari › Microfone, ou toque em "aA" na barra de endereço › Ajustes do site.';
    throw CANCEL;
  }
  guard(o);
  setPhase('prep', 'Silêncio por um instante: medindo o ruído do ambiente.');
  await engine.calibrate(800);
  guard(o);
  if (S.settings.micMode === 'turn') engine.stopMic();
}

/* wait for the singer's answer; ends early after a pause in the voice */
async function capture(o, { phraseMs, glide, maxMs, noVoiceMs }) {
  if (S.settings.micMode === 'turn' || !engine.micOn) { if (!(await micStart())) throw CANCEL; }
  rec = { frames: [], start: performance.now(), first: null };
  const max = maxMs || (glide ? 11000 : phraseMs * 1.6 + 2000);
  const noVoice = noVoiceMs || (glide ? 4500 : Math.min(4500, 1800 + phraseMs * 0.5));
  const silence = glide ? 1300 : 900;
  const minAfter = glide ? 1800 : phraseMs * 0.6;
  let lastVoice = null;
  while (true) {
    await sleep(50);
    guard(o);
    if (o.skip) break;
    const now = performance.now(), el_ = now - rec.start;
    for (let i = rec.frames.length - 1; i >= 0; i--) { const f = rec.frames[i]; if (f.midi != null) { lastVoice = f.t; if (!rec.first) rec.first = rec.frames.find(x => x.midi != null).t; break; } if (now - f.t > 200) break; }
    if (!rec.first && el_ > noVoice) break;
    if (rec.first && lastVoice && now - lastVoice > silence && now - rec.first > minAfter) break;
    if (el_ > max) break;
  }
  const out = rec; rec = null;
  if (S.settings.micMode === 'turn') engine.stopMic();
  return out;
}

function repFeedback(rep, res) {
  if (rep.glide) {
    if (!res.voiced) return ['Não ouvi sua voz.', ''];
    const br = res.breaks.filter(b => b.kind === 'salto' || b.count > 0);
    return [`Sirene ${noteName(res.low)} a ${noteName(res.high)}.` + (br.length ? ` Quebra perto de ${noteName(br[0].at)}.` : ' Sem quebras.'),
      br.length ? 'Na próxima, diminua o volume ao chegar nessa região.' : 'Passagem suave.'];
  }
  if (!res.voiced || !res.sung) return ['Não ouvi sua voz.', 'Cante um pouco mais forte ou aproxime o celular.'];
  const parts = [];
  const notes = res.notes;
  if (res.missed) parts.push(res.missed === 1 ? 'Faltou uma nota.' : `Faltaram ${res.missed} notas.`);
  const oct = notes.find(n => n.octave);
  const sung = notes.filter(n => n.err != null);
  const allGood = sung.every(n => Math.abs(n.err) <= GOOD);
  if (allGood && !res.missed) parts.push(notes.length === 1 ? 'Afinado!' : 'Tudo afinado!');
  else if (allGood) parts.push('O resto afinado.');
  else {
    const neg = sung.filter(n => n.err < -GOOD).length, pos = sung.filter(n => n.err > GOOD).length;
    if (Math.abs(res.bias) > GOOD && (neg === 0 || pos === 0)) parts.push(res.bias < 0 ? (res.bias < -NEAR ? 'Baixo.' : 'Um pouco baixo.') : (res.bias > NEAR ? 'Alto.' : 'Um pouco alto.'));
    else {
      let wi = 0; notes.forEach((n, i) => { if (n.err != null && Math.abs(n.err) > Math.abs(notes[wi].err ?? 0)) wi = i; });
      const w = notes[wi];
      parts.push(notes.length === 1 ? (w.err < 0 ? 'Um pouco baixo.' : 'Um pouco alto.') : `A ${wi + 1}ª nota ficou ${w.err < 0 ? 'baixa' : 'alta'}.`);
    }
  }
  if (notes.length === 1 && sung.length) {
    const n = sung[0];
    if (n.stab > 25) parts.push('Nota oscilando.');
    else if (n.drift < -30) parts.push('Caiu no fim.');
    if (n.dur < 2500) parts.push('Segure mais.');
  }
  if (sung.filter(n => n.scoop === 'below').length > sung.length / 2) parts.push('Deslizando até as notas.');
  let small = `Erro médio ${res.meanAbs}¢ · ${biasWord(res.bias)}`;
  if (oct) small += ' · você cantou uma oitava ' + (oct.octave > 0 ? 'acima' : 'abaixo') + ' em alguma nota (conta como certa)';
  return [parts.join(' '), small];
}

async function startSession(items, title, kind) {
  const range = curRange();
  const plan = buildPlan(items, range, S.settings.tempo);
  sess = { items, title, kind, plan, results: plan.map(() => []), cancelled: false, paused: false, redo: false, skip: false, t0: Date.now(), running: true };
  const o = sess;
  openOverlay(title, plan[0].ex.name);
  sessionShell();
  renderSessionCtrl();
  try {
    await prepAudio(o);
    for (let bi = 0; bi < plan.length; bi++) {
      const blk = plan[bi];
      o.bi = bi; o.skip = false;
      setBlocks(plan.length, bi, plan.map(b => b.ex.color));
      $('ovTitle').textContent = blk.ex.name;
      setPhase('intro', blk.ex.desc, plan.length > 1 ? blk.ex.name.toUpperCase() : 'PRONTO?');
      setFeedback(null, 'Observe: ' + blk.ex.watch.map(id => guideById(id).title.toLowerCase()).join(', ') + '.', '');
      roll = { mode: 'idle', ex: blk.ex };
      if (speaks()) await engine.speak((plan.length > 1 ? 'Agora: ' : '') + blk.ex.name + '. ' + blk.ex.desc.split('.')[0] + '.');
      else await sleep(2200);
      for (let ri = 0; ri < blk.reps.length; ri++) {
        guard(o);
        while (o.paused) { setPhase('pause', 'Toque em Continuar quando quiser.'); await sleep(200); guard(o); }
        if (o.skip) break;
        const rep = blk.reps[ri];
        $('ovEyebrow').textContent = `${title} · ${ri + 1} de ${blk.reps.length}`;
        // listen
        if (ri === 0) setFeedback(null, '', '');
        setPhase('listen', rep.glide ? 'Nota de partida. Depois deslize até o agudo e volte.' : rep.label);
        roll = { mode: 'listen', rep, start: performance.now() + 80, range };
        await engine.playPhrase(rep.notes);
        guard(o);
        // sing
        await engine.cue('turn');
        setPhase('sing', rep.glide ? 'Deslize devagar até o agudo e volte.' : 'Repita o que ouviu.');
        const phraseMs = rep.notes.reduce((a, n) => a + n.d, 0) * 1000;
        roll = { mode: 'sing', rep, start: performance.now(), window: rep.glide ? 11000 : phraseMs * 1.6 + 2000, range };
        const cap = await capture(o, { phraseMs, glide: rep.glide });
        roll.frozen = cap;
        guard(o);
        if (o.skip) break;
        // analyse
        setPhase('analyze', '');
        const res = rep.glide ? analyzeGlide(cap.frames) : analyzePhrase(rep.notes.map(n => n.m), cap.frames);
        const [txt, small] = repFeedback(rep, res);
        setFeedback(rep.glide ? null : res, txt, small);
        const entry = { rep, res };
        if (o.redo && o.results[bi].length) { o.results[bi][o.results[bi].length - 1] = entry; } else o.results[bi].push(entry);
        if (speaks()) await engine.speak(txt); else await sleep(1300);
        if (o.redo) { o.redo = false; ri--; continue; }
      }
    }
    guard(o);
    await engine.cue('end');
    finishSession(false);
  } catch (e) {
    if (e !== CANCEL) { console.error(e); toast('Algo deu errado: ' + (e.message || e)); }
    if (sess === o) o.running = false;
  }
}

function renderSessionCtrl() {
  const c = $('ovCtrl'); c.textContent = '';
  const pause = h(`<button class="btn alt" style="--c:${COL.near}">Pausar</button>`);
  const redo = h(`<button class="btn alt" style="--c:${COL.ref}">Repetir</button>`);
  const skip = h(`<button class="btn alt" style="--c:${COL.you}">Pular</button>`);
  pause.addEventListener('click', () => { if (!sess) return; sess.paused = !sess.paused; pause.textContent = sess.paused ? 'Continuar' : 'Pausar'; if (sess.paused) toast('Pausa ao fim desta repetição'); });
  redo.addEventListener('click', () => { if (!sess) return; sess.redo = true; toast('Vou repetir esta'); });
  skip.addEventListener('click', () => { if (!sess) return; sess.skip = true; toast('Pulando para o próximo exercício'); });
  c.append(pause, redo, skip);
}

/* compact storage format for one repetition */
function compactRep(entry) {
  const { rep, res } = entry;
  if (rep.glide) return { l: rep.label, g: { lo: res.low, hi: res.high, br: (res.breaks || []).map(b => b.at) } };
  return {
    l: rep.label, iv: rep.interval,
    n: res.notes.map(n => n.err == null ? [n.target] : [n.target, n.err, n.stab, n.attackMs, n.scoop === 'below' ? 1 : 0, n.drift, n.dur, n.octave ? 1 : 0])
  };
}

function finishSession(partial) {
  const o = sess; if (!o) return;
  o.running = false; o.cancelled = true;
  engine.stopMic(); rec = null; roll = null;
  const blocks = o.plan.map((b, i) => ({ ex: b.ex.id, entries: o.results[i] })).filter(b => b.entries.length);
  const phraseNotes = blocks.flatMap(b => b.entries.filter(e => !e.rep.glide).flatMap(e => e.res.notes.map(n => ({ ...n, ex: b.ex }))));
  const sum = summarizeNotes(phraseNotes);
  // extras for tips
  const sus = phraseNotes.filter(n => n.ex === 'sustain' && n.err != null);
  const extras = {};
  if (sus.length) { extras.drift = Math.round(median(sus.map(n => n.drift))); const sh = sus.filter(n => n.dur < 2500).length; if (sh >= Math.max(1, sus.length / 2)) extras.shortHolds = sh; }
  const brk = blocks.flatMap(b => b.entries.filter(e => e.rep.glide && e.res.breaks).flatMap(e => e.res.breaks.map(x => Math.round(x.at))));
  if (brk.length) extras.breaks = [...new Set(brk)].sort((a, b) => a - b).map(m => noteName(m));
  const range = curRange();
  const third = range.lo + (range.hi - range.lo) * 2 / 3;
  const top = phraseNotes.filter(n => n.err != null && n.target >= third), rest = phraseNotes.filter(n => n.err != null && n.target < third);
  if (top.length >= 4 && rest.length >= 4) {
    const a = mean(top.map(n => Math.abs(n.err))), b = mean(rest.map(n => Math.abs(n.err)));
    if (a > 30 && a > 1.5 * b) extras.highWorse = `Erro de ${Math.round(a)}¢ acima de ${noteName(Math.round(third))} contra ${Math.round(b)}¢ abaixo.`;
  }
  const tips = tipsFor(sum, extras);
  const rec_ = {
    id: Date.now().toString(36), date: new Date().toISOString(), dur: Math.round((Date.now() - o.t0) / 1000),
    title: o.title + (partial ? ' (parcial)' : ''), kind: o.kind, sum, tips: tips.map(t => t.id), breaks: brk,
    blocks: blocks.map(b => ({ ex: b.ex, reps: b.entries.map(compactRep) }))
  };
  if (blocks.length) {
    S.sessions.push(rec_); saveSessions();
    S.lastTips = tips; store.set('lastTips', tips);
  }
  renderReport(o, rec_, blocks, tips);
}

function renderReport(o, s, blocks, tips) {
  $('ovBlocks').textContent = '';
  $('ovEyebrow').textContent = 'Sessão concluída · ' + Math.max(1, Math.round(s.dur / 60)) + ' min';
  $('ovTitle').textContent = s.title;
  $('ov').classList.remove('car');
  const body = $('ovBody'); body.textContent = ''; body.scrollTop = 0;
  if (!blocks.length) { body.append(h(`<p class="p-desc">Nada registrado nesta sessão.</p>`)); }
  else {
    const sm = s.sum;
    if (sm.total) {
      body.append(h(`<div class="sec-title"><h2>Resumo</h2><span></span></div>`));
      body.append(h(`<div class="metrics">
        <div class="metric"><small>Afinadas</small><b style="color:${sm.hitPct >= 70 ? COL.good : sm.hitPct >= 40 ? COL.near : COL.off}">${sm.hitPct}%</b><span>${Math.round(sm.hitPct * sm.total / 100)} de ${sm.total} notas até ${GOOD}¢</span></div>
        <div class="metric"><small>Erro médio</small><b>${sm.meanAbs ?? '—'}<span style="font-size:15px">¢</span></b><span>distância típica da nota</span></div>
        <div class="metric"><small>Tendência</small><b style="font-size:20px;padding:4px 0">${biasWord(sm.bias)}</b><span>${sm.bias == null ? '' : Math.abs(sm.bias) <= 8 ? 'sem viés para cima ou para baixo' : sm.bias < 0 ? 'você tende a cantar baixo' : 'você tende a cantar alto'}</span></div>
        <div class="metric"><small>Estabilidade</small><b>${sm.stab ?? '—'}<span style="font-size:15px">¢</span></b><span>${sm.stab == null ? 'sem notas longas' : sm.stab <= 15 ? 'notas firmes' : sm.stab <= 25 ? 'leve oscilação' : 'nota oscilando'}</span></div>
      </div>`));
    }
    body.append(h(`<div class="sec-title"><h2>Por exercício</h2><span></span></div>`));
    const tb = h(`<div class="panel" style="--c:${COL.ref};padding:10px 14px"><table class="tbl"><thead><tr><th>Exercício</th><th>Afinadas</th><th>Erro</th><th>Observação</th></tr></thead><tbody></tbody></table></div>`);
    for (const b of blocks) {
      const ex = exById(b.ex);
      let cells;
      if (ex.glide) {
        const gs = b.entries.map(e => e.res).filter(r => r.voiced);
        const lo = gs.length ? Math.min(...gs.map(g => g.low)) : null, hi = gs.length ? Math.max(...gs.map(g => g.high)) : null;
        const br = [...new Set(gs.flatMap(g => g.breaks.map(x => Math.round(x.at))))];
        cells = `<td colspan="2">${lo == null ? '—' : noteName(lo) + '–' + noteName(hi)}</td><td>${br.length ? 'quebra ' + br.map(m => noteName(m)).join(', ') : 'sem quebras'}</td>`;
      } else {
        const ns = b.entries.flatMap(e => e.res.notes);
        const su = summarizeNotes(ns);
        const obs = su.scoopPct > 35 ? 'desliza no ataque' : su.stab != null && su.stab > 25 ? 'oscilando' : su.bias != null && su.bias < -20 ? 'tende a baixo' : su.bias != null && su.bias > 20 ? 'tende a alto' : su.hitPct >= 70 ? 'firme' : '—';
        cells = `<td>${su.hitPct}%</td><td>${su.meanAbs ?? '—'}¢</td><td>${obs}</td>`;
      }
      tb.querySelector('tbody').append(h(`<table><tr><td><span class="dot" style="background:${ex.color};box-shadow:0 0 6px ${ex.color}"></span>${ex.name}</td>${cells}</tr></table>`).querySelector('tr'));
    }
    body.append(tb);
    const phraseNotes = blocks.flatMap(b => b.entries.filter(e => !e.rep.glide).flatMap(e => e.res.notes)).map(n => ({ t: n.target, e: n.err }));
    if (phraseNotes.length) {
      const r = curRange();
      const lo = Math.min(...phraseNotes.map(n => n.t)), hi = Math.max(...phraseNotes.map(n => n.t));
      body.append(h(`<div class="sec-title"><h2>Por nota</h2><span></span><em>${noteName(lo)}–${noteName(hi)}</em></div>`));
      const p = h(`<div class="panel" style="--c:${COL.near}"></div>`);
      p.append(heatStrip(phraseNotes, Math.min(lo, r.lo), Math.max(hi, r.hi)).wrap);
      p.append(h(`<div class="legend"><span><i style="background:${COL.good}"></i>até ${GOOD}¢</span><span><i style="background:${COL.near}"></i>até ${NEAR}¢</span><span><i style="background:${COL.off}"></i>mais de ${NEAR}¢</span></div>`));
      body.append(p);
    }
    body.append(h(`<div class="sec-title"><h2>O que observar</h2><span></span></div>`));
    if (!tips.length) body.append(h(`<p class="p-desc">Nada fora do normal nos dados desta sessão. Continue de olho nos itens "você observa" do Guia: garganta, queixo e som anasalado não aparecem nos números.</p>`));
    for (const t of tips) {
      const g = guideById(t.id);
      const card = h(`<div class="panel" style="--c:${COL.off}">
        <span class="kind">${esc(g.title)}</span>
        <p class="why" style="margin:6px 0">${esc(t.why)}</p>
        <p class="small">${esc(g.actions[0])}</p>
        <button class="btn alt sm" style="--c:${COL.you};margin-top:10px">Ver no Guia</button></div>`);
      card.querySelector('button').addEventListener('click', () => { closeOverlay(); show('guide', { open: t.id }); });
      body.append(card);
    }
  }
  const c = $('ovCtrl'); c.textContent = ''; c.style.gridTemplateColumns = '1fr 1fr';
  const again = h(`<button class="btn" style="--c:${COL.ref}">De novo</button>`);
  const close = h(`<button class="btn alt" style="--c:${COL.you}">Fechar</button>`);
  again.addEventListener('click', () => { c.style.gridTemplateColumns = ''; startSession(o.items, o.title, o.kind); });
  close.addEventListener('click', () => { c.style.gridTemplateColumns = ''; closeOverlay(); });
  c.append(again, close);
}

/* ---------- session canvas ---------- */
let lastLiveDom = 0;
function drawSessionCanvas(t) {
  const c = $('ovRoll');
  if (t - lastLiveDom > 90) {
    lastLiveDom = t;
    const ln = $('liveNote');
    if (ln) {
      const m = displayPitch();
      if (rt && rt.running && rt.liveTxt) ln.innerHTML = rt.liveTxt(m);
      else ln.innerHTML = m == null ? '&nbsp;' : `<b>${noteName(Math.round(m))}</b> ${signC(Math.round((m - Math.round(m)) * 100))}¢`;
    }
  }
  if (!c || !roll || $('ov').classList.contains('car')) return;
  const g = fitCanvas(c); if (!g) return;
  const now = performance.now();
  if (roll.mode === 'range') {
    const lanes = drawLanes(g, roll.lo, roll.hi, null);
    const frames = roll.frozen ? roll.frozen.frames : (rec ? rec.frames : []);
    const t0 = frames.length ? frames[0].t : now, span = Math.max(6000, (roll.frozen ? frames[frames.length - 1]?.t ?? now : now) - t0 + 500);
    const x = tt => lanes.LEFT + (tt - t0) / span * (g.w - lanes.LEFT - 6);
    drawTrace(g.ctx, frames, x, lanes.y, () => null, g.w);
    return;
  }
  if (roll.mode === 'idle' || !roll.rep) { drawLanes(g, curRange().lo - 2, curRange().hi + 2, null); return; }
  const rep = roll.rep, notes = rep.notes;
  const ms = notes.map(n => n.m);
  let lo, hi;
  if (rep.glide) { lo = roll.range.lo - 4; hi = roll.range.hi + 8; }
  else { lo = Math.min(...ms) - 3; hi = Math.max(...ms) + 3; if (hi - lo < 10) { const mid = (hi + lo) / 2; lo = mid - 5; hi = mid + 5; } }
  const lanes = drawLanes(g, lo, hi, new Set(ms));
  const phraseMs = notes.reduce((a, n) => a + n.d, 0) * 1000;
  if (roll.mode === 'listen') {
    const span = phraseMs + 400;
    const x = tt => lanes.LEFT + tt / span * (g.w - lanes.LEFT - 6);
    drawBars(g.ctx, notes, 0, x, lanes.y, COL.ref, 0.35, lanes.per);
    const ph = Math.max(0, now - roll.start);
    if (ph <= phraseMs) { g.ctx.strokeStyle = '#fff'; g.ctx.lineWidth = 2; g.ctx.beginPath(); g.ctx.moveTo(x(ph), 6); g.ctx.lineTo(x(ph), g.h - 6); g.ctx.stroke(); }
    return;
  }
  // sing
  const cap = roll.frozen || rec;
  const frames = cap ? cap.frames : [];
  const first = cap ? cap.first || (frames.find(f => f.midi != null) || {}).t : null;
  const span = rep.glide ? roll.window : Math.max(phraseMs * 1.35 + 800, 3000);
  const t0 = first ? first - 300 : roll.start;
  const x = tt => lanes.LEFT + (tt - t0) / span * (g.w - lanes.LEFT - 6);
  if (!rep.glide && first) drawBars(g.ctx, notes, first, x, lanes.y, COL.ref, 0.13, lanes.per);
  drawTrace(g.ctx, frames, x, lanes.y, () => rep.glide ? null : ms, g.w);
}

/* =========================================================
   Range test
   ========================================================= */
async function startRangeTest() {
  if (tunerOn) stopTuner();
  rt = { running: true, cancelled: false };
  const o = rt;
  openOverlay('Teste de extensão', 'Sua extensão');
  setBlocks(2, 0, [COL.ref, COL.you]);
  sessionShell();
  $('fb').hidden = true;
  setPhase('intro', 'Duas etapas. Cante num "a" ou "u" confortável, sem forçar: o objetivo é achar onde a voz sai com controle, não o limite a qualquer custo.', 'EXTENSÃO');
  const c = $('ovCtrl'); c.textContent = ''; c.style.gridTemplateColumns = '1fr';
  const go = h(`<button class="btn" style="--c:${COL.you}">${ICON.mic} Começar</button>`);
  c.append(go);
  // unlock audio inside the tap itself (iOS requires it)
  await new Promise(r => go.addEventListener('click', () => { engine.ensure(); r(); }, { once: true }));
  c.textContent = '';
  const done = h(`<button class="btn alt" style="--c:${COL.good}">Terminei esta etapa</button>`);
  done.addEventListener('click', () => { o.skip = true; });
  c.append(done);
  try {
    await prepAudio(o);
    const runs = {};
    for (const [i, dir] of [[0, -1], [1, 1]]) {
      guard(o);
      setBlocks(2, i, [COL.ref, COL.you]);
      const say = dir < 0
        ? 'Cante um a numa nota confortável e desça devagar até a nota mais grave que sair sem forçar. Segure um segundo lá embaixo.'
        : 'Agora suba devagar até a nota mais aguda que sair sem apertar a garganta. Pode passar para a voz de cabeça ou falsete. Segure um segundo lá em cima.';
      setPhase('sing', say, dir < 0 ? 'GRAVE' : 'AGUDO');
      roll = { mode: 'range', lo: 33, hi: 81 };
      rt.liveTxt = m => {
        const fr = rec ? rec.frames : [];
        const ex = fr.length > 10 ? stableExtreme(fr, dir) : { stable: null };
        return (m == null ? '&nbsp;' : `<b>${noteName(Math.round(m))}</b>`) + (ex.stable != null ? ` · ${dir < 0 ? 'mais grave' : 'mais aguda'} estável: <b>${noteName(ex.stable)}</b>` : '');
      };
      if (speaks()) await engine.speak(say); else await sleep(400);
      await engine.cue('turn');
      o.skip = false;
      const cap = await capture(o, { glide: true, maxMs: 18000, phraseMs: 0, noVoiceMs: 9000 });
      o.skip = false;
      roll.frozen = cap;
      runs[dir] = cap.frames;
      await sleep(400);
    }
    rt.liveTxt = null;
    guard(o);
    const L = stableExtreme(runs[-1], -1), H = stableExtreme(runs[1], 1);
    const low = L.stable ?? L.reach, high = H.stable ?? H.reach;
    if (low == null || high == null || high - low < 5) {
      setPhase('pause', 'Não consegui captar sua voz o suficiente. Tente num lugar mais silencioso, cantando um pouco mais forte.', 'DE NOVO?');
      showRangeRetry(); return;
    }
    const breaks = [...new Set(findBreaks(runs[1]).filter(b => b.at > low + 4 && b.at < high - 1).map(b => Math.round(b.at)))];
    let lo = low + 2, hi = high - 3;
    if (breaks.length) hi = Math.min(hi, breaks[0] + 4);
    if (hi - lo < 7) hi = Math.min(high, lo + 7);
    if (hi - lo < 7) lo = Math.max(low, hi - 7);
    rt.result = { low, high, lo, hi, breaks, stableLow: L.stable != null, stableHigh: H.stable != null, date: new Date().toISOString() };
    rt.running = false;
    renderRangeResult();
    if (speaks()) engine.speak(`Sua extensão vai de ${noteName(low)} a ${noteName(high)}.`);
  } catch (e) {
    if (e !== CANCEL) { console.error(e); toast('Algo deu errado: ' + (e.message || e)); }
    rt && (rt.running = false);
    if (e === CANCEL && $('phase') && $('phase').textContent === 'SEM MICROFONE') showRangeRetry();
  }
}
function showRangeRetry() {
  const c = $('ovCtrl'); c.textContent = ''; c.style.gridTemplateColumns = '1fr 1fr';
  const again = h(`<button class="btn" style="--c:${COL.you}">Tentar de novo</button>`), close = h(`<button class="btn alt" style="--c:${COL.ref}">Fechar</button>`);
  again.addEventListener('click', () => { c.style.gridTemplateColumns = ''; startRangeTest(); });
  close.addEventListener('click', () => { c.style.gridTemplateColumns = ''; closeOverlay(); });
  c.append(again, close);
}
function renderRangeResult() {
  const r = rt.result;
  const body = $('ovBody'); body.textContent = '';
  $('ovBlocks').textContent = '';
  const p = h(`<div class="panel hero grid" style="--c:${COL.you}">
    <span class="kind">Resultado</span>
    <div class="p-title">${noteName(r.low)} – ${noteName(r.high)}</div>
    <p class="p-desc">${semisText(r.high - r.low)} de alcance${(!r.stableLow || !r.stableHigh) ? ' (algum extremo sem nota firme: conta como alcance, não como nota utilizável)' : ''}.</p>
  </div>`);
  body.append(p);
  const ks = el('div'); p.append(ks);
  const draw = () => { ks.textContent = ''; ks.append(keysStrip(r)); $('rLo').textContent = noteName(r.lo); $('rHi').textContent = noteName(r.hi); };
  body.append(h(`<div class="panel" style="--c:${COL.good}">
    <span class="kind">Faixa de trabalho sugerida</span>
    <p class="small" style="margin:6px 0 10px">Os exercícios ficam dentro dela: um pouco acima do grave e abaixo do agudo, para treinar com controle. ${r.breaks.length ? `Quebra detectada perto de <b>${noteName(r.breaks[0])}</b>: limitei o topo a poucos semitons acima dela, onde dá para treinar a passagem.` : 'Nenhuma quebra brusca detectada na subida.'}</p>
    <div class="row wrap">
      <span class="small muted">De</span><div class="stepper"><button data-k="lo" data-d="-1">−</button><span id="rLo" style="min-width:44px"></span><button data-k="lo" data-d="1">+</button></div>
      <span class="small muted">até</span><div class="stepper"><button data-k="hi" data-d="-1">−</button><span id="rHi" style="min-width:44px"></span><button data-k="hi" data-d="1">+</button></div>
    </div></div>`));
  body.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k, d = +b.dataset.d;
    const nv = r[k] + d;
    if (k === 'lo' && (nv < r.low - 2 || nv > r.hi - 5)) return;
    if (k === 'hi' && (nv > r.high + 2 || nv < r.lo + 5)) return;
    r[k] = nv; draw();
  }));
  body.append(h(`<p class="small muted">Extensão não é fixa: com técnica (apoio e passagem de registro), ela costuma crescer. Refaça o teste a cada poucas semanas para acompanhar.</p>`));
  draw();
  const c = $('ovCtrl'); c.textContent = ''; c.style.gridTemplateColumns = '1fr 1fr';
  const again = h(`<button class="btn alt" style="--c:${COL.ref}">Refazer</button>`), save = h(`<button class="btn" style="--c:${COL.good}">Salvar</button>`);
  again.addEventListener('click', () => { c.style.gridTemplateColumns = ''; startRangeTest(); });
  save.addEventListener('click', () => {
    S.profile.range = { ...r }; saveProfile();
    S.rangeTests.push({ date: r.date, low: r.low, high: r.high, lo: r.lo, hi: r.hi, breaks: r.breaks }); store.set('rangeTests', S.rangeTests);
    c.style.gridTemplateColumns = '';
    closeOverlay(); toast('Extensão salva. Exercícios ajustados à sua faixa.');
  });
  c.append(again, save);
}

/* =========================================================
   Settings sheet
   ========================================================= */
function seg(name, opts, val, onChange) {
  const s = el('div', 'seg'); s.setAttribute('role', 'radiogroup'); s.setAttribute('aria-label', name);
  for (const [v, label] of opts) {
    const b = el('button', null, label); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(v === val));
    b.addEventListener('click', () => { s.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', 'false')); b.setAttribute('aria-checked', 'true'); onChange(v); });
    s.append(b);
  }
  return s;
}
function field(title, ctrl, help) {
  const f = el('div', 'field'); f.append(el('b', null, title), ctrl); if (help) f.append(el('small', null, help)); return f;
}
function openSheet(title, nodes) {
  $('sheetTitle').textContent = title;
  const b = $('sheetBody'); b.textContent = ''; nodes.forEach(n => b.append(n));
  $('sheetWrap').hidden = false;
}
const closeSheet = () => { $('sheetWrap').hidden = true; };
$('sheetClose').addEventListener('click', closeSheet);
$('sheetWrap').addEventListener('click', e => { if (e.target === $('sheetWrap')) closeSheet(); });
$('settingsBtn').addEventListener('click', () => {
  const s = S.settings;
  const vol = el('input'); vol.type = 'range'; vol.min = '0.2'; vol.max = '1'; vol.step = '0.05'; vol.value = String(s.volume);
  vol.addEventListener('input', () => { s.volume = +vol.value; engine.setVolume(s.volume); saveSettings(); });
  const testVol = h(`<button class="btn alt sm" style="--c:${COL.ref};align-self:flex-start">${ICON.speaker} Testar som</button>`);
  testVol.addEventListener('click', () => engine.playPhrase([{ m: curRange().lo + 4, d: 0.5 }, { m: curRange().lo + 7, d: 0.5 }, { m: curRange().lo + 11, d: 0.8 }]));
  const volWrap = el('div'); volWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px'; volWrap.append(vol, testVol);
  let wipeArmed = false;
  const wipe = h(`<button class="btn alt sm" style="--c:${COL.off};align-self:flex-start">Apagar todos os dados</button>`);
  wipe.addEventListener('click', () => {
    if (!wipeArmed) { wipeArmed = true; wipe.textContent = 'Toque de novo para confirmar'; setTimeout(() => { wipeArmed = false; wipe.textContent = 'Apagar todos os dados'; }, 4000); return; }
    ['profile', 'sessions', 'rangeTests', 'reps', 'lastTips'].forEach(k => { try { localStorage.removeItem('vc:' + k); } catch (e) {} });
    S.profile = { range: null }; S.sessions = []; S.rangeTests = []; S.reps = {}; S.lastTips = [];
    closeSheet(); renderRangeChip(); show(curView); toast('Dados apagados.');
  });
  const dataRow = el('div', 'row wrap');
  const exp = h(`<button class="btn alt sm" style="--c:${COL.ref}">Exportar backup</button>`); exp.addEventListener('click', exportBackup);
  const imp = h(`<button class="btn alt sm" style="--c:${COL.ref}">Importar backup</button>`); imp.addEventListener('click', () => $('importFile').click());
  dataRow.append(exp, imp);
  openSheet('Ajustes', [
    field('Notação', seg('Notação', [['cifra', 'Cifra (C4)'], ['solfejo', 'Solfejo (Dó4)']], s.notation, v => { s.notation = v; setNotation(v); saveSettings(); renderRangeChip(); show(curView, { keepScroll: true }); })),
    field('Voz guia', seg('Voz guia', [['carro', 'No modo carro'], ['sempre', 'Sempre'], ['nunca', 'Nunca']], s.voice, v => { s.voice = v; saveSettings(); }), 'Fala o nome do exercício e o resultado de cada repetição.'),
    field('Andamento', seg('Andamento', [['lento', 'Lento'], ['normal', 'Normal']], s.tempo, v => { s.tempo = v; saveSettings(); })),
    field('Microfone', seg('Microfone', [['continuous', 'Sempre ligado'], ['turn', 'Só na sua vez']], s.micMode, v => { s.micMode = v; saveSettings(); }),
      'Se no iPhone a referência sair baixa ou pelo alto-falante de ligação enquanto o microfone está ligado, use "Só na sua vez".'),
    field('Volume da referência', volWrap),
    field('Dados', dataRow, 'Tudo fica salvo só neste aparelho. Faça um backup de vez em quando.'),
    field('Zona de perigo', wipe),
    h(`<p class="small muted">Canto v${VERSION} · feito com o Claude</p>`)
  ]);
});

/* =========================================================
   Summary for Claude + backup
   ========================================================= */
function buildSummary() {
  const L = [];
  const r = S.profile.range;
  L.push('RESUMO DO MEU TREINO VOCAL (app Canto)', 'Gerado em ' + new Date().toLocaleString('pt-BR'), '');
  if (r) L.push(`Extensão: alcance ${noteName(r.low)}–${noteName(r.high)} (${r.high - r.low} semitons); faixa de trabalho ${noteName(r.lo)}–${noteName(r.hi)}${r.breaks?.length ? '; quebra perto de ' + r.breaks.map(m => noteName(m)).join(', ') : ''}.`);
  if (S.rangeTests.length > 1) L.push('Histórico de extensão: ' + S.rangeTests.map(t => `${fmtDate(t.date)} ${noteName(t.low)}–${noteName(t.high)}`).join('; ') + '.');
  const ss = S.sessions.filter(s => s.sum && s.sum.total);
  L.push('', `Sessões: ${S.sessions.length} no total.`);
  for (const s of S.sessions.slice(-15)) {
    const sm = s.sum || {};
    const parts = (s.blocks || []).map(b => {
      const ex = exById(b.ex);
      if (ex.glide) { const g = b.reps.filter(x => x.g && x.g.hi != null); return g.length ? `${ex.name}: ${noteName(Math.min(...g.map(x => x.g.lo)))}–${noteName(Math.max(...g.map(x => x.g.hi)))}${g.some(x => x.g.br.length) ? ', quebras ' + [...new Set(g.flatMap(x => x.g.br.map(m => noteName(Math.round(m)))))].join('/') : ''}` : ex.name + ': sem voz'; }
      const ns = b.reps.flatMap(x => x.n).map(n => ({ target: n[0], err: n.length > 1 ? n[1] : null, stab: n[2], attackMs: n[3], scoop: n[4] ? 'below' : null, dur: n[6] }));
      const su = summarizeNotes(ns);
      return `${ex.name}: ${su.hitPct}% afinadas, erro ${su.meanAbs ?? '-'}¢, viés ${su.bias ?? '-'}¢${su.stab != null ? ', estab. ' + su.stab + '¢' : ''}${su.scoopPct ? ', ' + su.scoopPct + '% deslizando' : ''}`;
    });
    L.push(`- ${new Date(s.date).toLocaleDateString('pt-BR')} · ${s.title} · ${Math.max(1, Math.round(s.dur / 60))} min · ${sm.hitPct ?? 0}% afinadas · ${parts.join(' | ')}${s.tips?.length ? ' · sinais: ' + s.tips.map(id => guideById(id)?.title).join(', ') : ''}`);
  }
  const notes = allNotes(ss.filter(s => Date.now() - new Date(s.date).getTime() < 30 * 864e5));
  if (notes.length) {
    const by = {};
    notes.forEach(n => { if (n.e != null) (by[n.t] = by[n.t] || []).push(Math.abs(n.e)); });
    L.push('', 'Erro médio por nota (30 dias): ' + Object.entries(by).sort((a, b) => a[0] - b[0]).map(([m, a]) => `${noteName(+m)} ${Math.round(mean(a))}¢ (${a.length})`).join(', ') + '.');
    const iv = notes.filter(n => n.ex === 'intervals' && n.idx === 1);
    if (iv.length) L.push('Intervalos (acerto da nota de chegada): ' + INTERVALS.map(i => { const a = iv.filter(n => n.iv === i.s); if (!a.length) return null; return `${i.name} ${Math.round(100 * a.filter(n => n.e != null && Math.abs(n.e) <= GOOD).length / a.length)}% (${a.length})`; }).filter(Boolean).join(', ') + '.');
  }
  L.push('', `Critérios: afinada = até ${GOOD} cents; perto = até ${NEAR} cents. Viés negativo = canta abaixo.`);
  return L.join('\n');
}
async function copySummary() {
  const txt = buildSummary();
  try { await navigator.clipboard.writeText(txt); toast('Resumo copiado. Cole na conversa com o Claude.'); }
  catch (e) {
    openSheet('Resumo', [h(`<p class="small muted">Não consegui copiar automaticamente. Selecione e copie o texto abaixo.</p>`), Object.assign(el('textarea'), { value: txt, rows: 14, style: 'width:100%;background:rgba(0,0,0,.4);color:inherit;border:1px solid var(--line);border-radius:12px;padding:10px;font-size:12px' })]);
  }
}
function exportBackup() {
  const data = { app: 'canto', version: VERSION, exported: new Date().toISOString(), profile: S.profile, sessions: S.sessions, rangeTests: S.rangeTests, settings: S.settings };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = el('a'); a.href = URL.createObjectURL(blob); a.download = `canto-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Backup gerado.');
}
$('importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (d.app !== 'canto' || !Array.isArray(d.sessions)) throw new Error('formato');
    const ids = new Set(S.sessions.map(s => s.id));
    S.sessions = [...S.sessions, ...d.sessions.filter(s => s && s.id && !ids.has(s.id))].sort((a, b) => a.date.localeCompare(b.date));
    const rd = new Set(S.rangeTests.map(t => t.date));
    S.rangeTests = [...S.rangeTests, ...(d.rangeTests || []).filter(t => !rd.has(t.date))].sort((a, b) => a.date.localeCompare(b.date));
    if (!S.profile.range && d.profile && d.profile.range) { S.profile = d.profile; saveProfile(); }
    saveSessions(); store.set('rangeTests', S.rangeTests);
    renderRangeChip(); show(curView); toast('Backup importado.');
  } catch (err) { toast('Arquivo de backup inválido.'); }
});

/* =========================================================
   Lifecycle
   ========================================================= */
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    if (sess && sess.running) sess.paused = true;
    engine.wakeLock = null;
  } else {
    if (!$('ov').hidden || tunerOn) {
      engine.keepAwake(true);
      // iOS ends the mic track when the app goes to the background
      if (engine.stream && engine.stream.getAudioTracks().some(t => t.readyState === 'ended')) { engine.stopMic(); if (tunerOn) await micStart(); }
    }
    if (sess && sess.running && sess.paused) { toast('Sessão pausada. Toque em Continuar.'); const b = $('ovCtrl').querySelector('button'); if (b) b.textContent = 'Continuar'; }
  }
});
addEventListener('resize', sizeBg);

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

sizeBg();
renderRangeChip();
show('train');
requestAnimationFrame(tick);

// test hooks (harmless in production)
window.__canto = { S, engine, buildSummary, get roll() { return roll; }, get rec() { return rec; } };
