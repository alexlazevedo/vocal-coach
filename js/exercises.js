// Exercise catalogue and phrase generators. Everything is built inside the singer's comfortable range.

const CIFRA = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const SOLFEJO = ['Dó', 'Dó#', 'Ré', 'Mib', 'Mi', 'Fá', 'Fá#', 'Sol', 'Láb', 'Lá', 'Sib', 'Si'];
let notation = 'cifra';
export const setNotation = n => { notation = n === 'solfejo' ? 'solfejo' : 'cifra'; };
export const noteName = (m, withOct = true) => {
  const r = Math.round(m), names = notation === 'solfejo' ? SOLFEJO : CIFRA;
  return names[((r % 12) + 12) % 12] + (withOct ? Math.floor(r / 12) - 1 : '');
};
export const pitchClass = m => (notation === 'solfejo' ? SOLFEJO : CIFRA)[((Math.round(m) % 12) + 12) % 12];

export const INTERVALS = [
  { s: 2, name: '2ª maior' }, { s: 3, name: '3ª menor' }, { s: 4, name: '3ª maior' },
  { s: 5, name: '4ª justa' }, { s: 7, name: '5ª justa' }, { s: 9, name: '6ª maior' },
  { s: 12, name: 'Oitava' }
];
export const intervalName = s => (INTERVALS.find(i => i.s === s) || { name: s + ' semitons' }).name;

const TEMPO = { lento: 1.25, normal: 1 };

function spread(lo, hi, n) {
  if (n <= 1 || hi <= lo) return [lo];
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.round(lo + (hi - lo) * i / (n - 1)));
  return [...new Set(out)];
}
function climb(lo, top, n) {
  // roots rising by a semitone, then back down if there is room for more reps
  const up = [];
  for (let r = lo; r <= top && up.length < n; r++) up.push(r);
  if (!up.length) up.push(lo);
  let k = up.length - 2;
  while (up.length < n && k >= 0) up.push(up[k--]);
  while (up.length < n) up.push(up[up.length - 1]);
  return up;
}
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const EXERCISES = [
  {
    id: 'sustain', name: 'Nota sustentada', color: '#38d6ff',
    desc: 'Ouça a nota e sustente por 4 segundos, num "a" ou "u" confortável.',
    measures: ['Afinação', 'Estabilidade', 'Fôlego'], defaultReps: 5,
    watch: ['endflat', 'wobble', 'breathy', 'hardattack'],
    gen(range, reps, tempo) {
      const d = 3.6;
      return spread(range.lo + 1, range.hi - 1, reps).map(m => ({ notes: [{ m, d }], label: noteName(m) }));
    }
  },
  {
    id: 'scale5', name: 'Escala de 5 notas', color: '#38ffa0',
    desc: '1-2-3-4-5-4-3-2-1 num "ma" ou "nu". Sobe meio tom a cada repetição.',
    measures: ['Afinação', 'Ataque', 'Região'], defaultReps: 6,
    watch: ['scoop', 'flat', 'neck'],
    gen(range, reps, tempo) {
      const d = 0.6 * (TEMPO[tempo] || 1), steps = [0, 2, 4, 5, 7, 5, 4, 2, 0];
      return climb(range.lo, Math.max(range.lo, range.hi - 7), reps)
        .map(r => ({ notes: steps.map((s, i) => ({ m: r + s, d: i === steps.length - 1 ? d * 1.8 : d })), label: 'Tônica ' + noteName(r) }));
    }
  },
  {
    id: 'staccato', name: 'Staccato', color: '#ffe45c',
    desc: 'Notas curtas e destacadas num "ha" leve: 1-3-5-3-1. Acerte cada nota de primeira, sem deslizar até ela.',
    measures: ['Ataque', 'Afinação de primeira'], defaultReps: 5,
    watch: ['scoop', 'hardattack'],
    gen(range, reps, tempo) {
      const d = 0.62 * (TEMPO[tempo] || 1), steps = [0, 4, 7, 4, 0];
      return climb(range.lo, Math.max(range.lo, range.hi - 7), reps)
        .map(r => ({ notes: steps.map(s => ({ m: r + s, d, len: 0.24 })), label: 'Tônica ' + noteName(r), staccato: true }));
    }
  },
  {
    id: 'intervals', name: 'Intervalos', color: '#ffb340',
    desc: 'O app toca duas notas; você repete as duas. Treina ouvido e precisão nos saltos.',
    measures: ['Afinação nos saltos', 'Por tipo de intervalo'], defaultReps: 8,
    watch: ['scoop', 'flat', 'sharp'],
    gen(range, reps, tempo) {
      const d = 1.0 * (TEMPO[tempo] || 1);
      const span = range.hi - range.lo;
      const pool = INTERVALS.filter(i => i.s <= span);
      const list = [];
      while (list.length < reps) list.push(...shuffle([...pool]));
      return list.slice(0, reps).map(iv => {
        const root = range.lo + Math.floor(Math.random() * (span - iv.s + 1));
        return { notes: [{ m: root, d }, { m: root + iv.s, d: d * 1.4 }], label: iv.name, interval: iv.s };
      });
    }
  },
  {
    id: 'arpeggio', name: 'Arpejo maior', color: '#ff5ccf',
    desc: '1-3-5-8-5-3-1 num "a" leve. Trabalha saltos e a passagem para o agudo.',
    measures: ['Afinação', 'Passagem de registro'], defaultReps: 5,
    watch: ['break', 'neck', 'tight'],
    gen(range, reps, tempo) {
      const d = 0.58 * (TEMPO[tempo] || 1);
      const full = range.hi - range.lo >= 12;
      const steps = full ? [0, 4, 7, 12, 7, 4, 0] : [0, 4, 7, 4, 0];
      const top = range.hi - steps[Math.floor(steps.length / 2)];
      return climb(range.lo, Math.max(range.lo, top), reps)
        .map(r => ({ notes: steps.map((s, i) => ({ m: r + s, d: i === steps.length - 1 ? d * 1.8 : d })), label: 'Tônica ' + noteName(r) }));
    }
  },
  {
    id: 'siren', name: 'Sirene', color: '#b48cff', glide: true,
    desc: 'Comece na nota tocada e deslize devagar até o agudo e de volta, num "u" ou com os lábios vibrando (brrr).',
    measures: ['Extensão em uso', 'Quebras de registro'], defaultReps: 3,
    watch: ['break', 'tight', 'neck'],
    gen(range, reps) {
      return Array.from({ length: reps }, () => ({ notes: [{ m: range.lo + 2, d: 1.2 }], label: 'Deslize', glide: true }));
    }
  }
];
export const exById = id => EXERCISES.find(e => e.id === id);

/* Quick session: a bit of everything, ~7 minutes */
export const QUICK = [['sustain', 3], ['scale5', 4], ['staccato', 3], ['intervals', 5], ['arpeggio', 3], ['siren', 2]];

export function buildPlan(items, range, tempo) {
  return items.map(([id, reps]) => {
    const ex = exById(id);
    return { ex, reps: ex.gen(range, reps, tempo) };
  });
}

export function estimateMin(plan) {
  let s = 0;
  for (const b of plan) for (const r of b.reps) {
    const ph = r.notes.reduce((a, n) => a + n.d, 0);
    s += r.glide ? ph + 9 : ph * 2.3 + 3.5;
  }
  return Math.max(1, Math.round(s / 60));
}

/* Default working range before the first range test (typical untrained male voice; changed by the test) */
export const DEFAULT_RANGE = { lo: 45, hi: 60 }; // A2 – C4
