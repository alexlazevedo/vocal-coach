// Observation guide: what to notice -> probable cause -> what to do.
// "medido": the app can detect a sign of it. "observar": only you can feel/hear it.

export const GUIDE = [
  {
    id: 'flat', kind: 'medido', title: 'Cantando abaixo da nota',
    signal: 'O app mostra a maioria das notas em azul-baixo, ou você sente a voz "pesada" e sem brilho.',
    cause: 'Pouca energia de ar, voz cansada, ou você não está se ouvindo bem (ruído do carro, fone abafando).',
    actions: [
      'Pense na nota "por cima": mire um fio acima do que ouviu.',
      'Use um leve sorriso interno (bochechas altas): dá mais brilho ao som.',
      'Confira se consegue se ouvir. Se o carro estiver barulhento, baixe a referência e cante um pouco mais forte.'
    ],
    detect: 'Média das notas mais de 20 cents abaixo.'
  },
  {
    id: 'sharp', kind: 'medido', title: 'Cantando acima da nota',
    signal: 'Notas sistematicamente acima, mais comum nos agudos e quando você canta forte.',
    cause: 'Excesso de pressão de ar e tensão para "garantir" a nota.',
    actions: [
      'Cante mais baixo (volume): a afinação costuma cair no lugar.',
      'Solte o ar como um suspiro, não como um empurrão.'
    ],
    detect: 'Média das notas mais de 20 cents acima.'
  },
  {
    id: 'scoop', kind: 'medido', title: 'Deslizando até a nota',
    signal: 'Cada nota começa abaixo e "sobe" até o lugar. No gráfico aparece uma rampa no início.',
    cause: 'A nota não está "pensada" antes de sair; a voz procura o alvo depois de começar.',
    actions: [
      'Antes de cantar, ouça a nota por dentro (audição interna) por um segundo.',
      'Faça o exercício Staccato do app: "ha" curto em cada nota, acertando de primeira. O relatório mostra quantas notas ainda deslizaram.',
      'Comece a nota um pouco mais leve; volume alto no ataque favorece a rampa.'
    ],
    detect: 'Mais de 35% das notas começam 50 cents ou mais abaixo e levam tempo para assentar.'
  },
  {
    id: 'wobble', kind: 'medido', title: 'Nota oscilando',
    signal: 'A linha da sua voz treme ou ondula de forma irregular numa nota longa.',
    cause: 'Falta de apoio (o ar sai irregular) ou tensão na garganta. Vibrato regular e leve é normal e bem-vindo.',
    actions: [
      'Sustente em volume médio-baixo e mantenha as costelas abertas enquanto o ar sai.',
      'Exercício do "sss": solte o ar num "s" constante por 10 segundos, depois cante a nota com a mesma sensação.'
    ],
    detect: 'Oscilação típica acima de 25 cents nas notas sustentadas.'
  },
  {
    id: 'endflat', kind: 'medido', title: 'Caindo no fim da nota',
    signal: 'A nota começa no lugar e afunda no final da frase ou da sustentação.',
    cause: 'O ar está acabando e o apoio relaxa antes da hora.',
    actions: [
      'Respire antes de precisar, sem encher demais.',
      'Pense em "crescer" a energia no final da nota, não em economizar.',
      'Encurte a nota por enquanto e aumente aos poucos.'
    ],
    detect: 'Queda de mais de 25 cents entre o início e o fim da nota.'
  },
  {
    id: 'breath', kind: 'medido', title: 'Fôlego curto',
    signal: 'Você não consegue sustentar os 4 segundos sem perder a nota.',
    cause: 'Respiração alta (ombros/peito) ou ar gasto logo no ataque.',
    actions: [
      'Respire "para os lados": costelas e cintura expandem, ombros parados.',
      'Ataque a nota com pouco ar e mantenha um fluxo constante.'
    ],
    detect: 'Notas sustentadas mais curtas que 70% do tempo pedido.'
  },
  {
    id: 'break', kind: 'medido', title: 'Voz quebrando na passagem',
    signal: 'A voz "salta" ou falha sempre na mesma região ao subir. O app marca o ponto.',
    cause: 'Passagem de registro (voz de peito para voz de cabeça) com muito peso ou volume. Todo mundo tem essa região; o objetivo é suavizá-la.',
    actions: [
      'Diminua o volume ao se aproximar da nota da quebra.',
      'Sirenes leves em "u" ou com lábios vibrando (brrr) passando pela região, várias vezes.',
      'Deixe a voz ficar mais leve antes de chegar lá, em vez de carregar o peso do grave para cima.'
    ],
    detect: 'Salto brusco de mais de 1,8 semitom ou falha curta durante a sirene ou o teste de extensão.'
  },
  {
    id: 'high', kind: 'medido', title: 'Desafinando mais no agudo',
    signal: 'Seu acerto cai bastante no terço superior da sua extensão.',
    cause: 'Tensão para alcançar as notas (laringe sobe, garganta aperta).',
    actions: [
      'Trabalhe essa região em volume baixo e com "u" ou lábios vibrando.',
      'Veja também os itens "Garganta apertando" e "Queixo subindo".'
    ],
    detect: 'Erro médio no terço superior 1,5× maior que no resto.'
  },
  {
    id: 'tight', kind: 'observar', title: 'Garganta apertando',
    signal: 'Sensação de esforço, aperto ou "arranhar" nos agudos; a voz fica estridente.',
    cause: 'Constrição na garganta e laringe subindo para alcançar a nota.',
    actions: [
      'Pense no começo de um bocejo: espaço atrás da língua, laringe confortável.',
      'Cante a mesma frase num canudo (ou com lábios vibrando); depois repita com a boca aberta mantendo a sensação.',
      'Se doer, pare. Desconforto não é sinal de progresso.'
    ]
  },
  {
    id: 'neck', kind: 'observar', title: 'Queixo e pescoço subindo',
    signal: 'Você estica o pescoço ou levanta o queixo para alcançar as notas altas.',
    cause: 'Tentativa física de "chegar" na nota; aumenta a tensão.',
    actions: [
      'Mantenha o olhar à frente e o queixo neutro, como se segurasse um ovo leve sob ele.',
      'No carro: encoste a cabeça no apoio e mantenha o contato enquanto sobe.'
    ]
  },
  {
    id: 'nasal', kind: 'observar', title: 'Som anasalado',
    signal: 'A voz soa "pelo nariz". Teste: tape o nariz cantando "a"; se o som mudar muito, está anasalado.',
    cause: 'Palato mole (céu da boca no fundo) baixo, deixando o ar escapar pelo nariz.',
    actions: [
      'Cante "ng" (como em "sangue") e abra para "a", sentindo o céu da boca subir.',
      'Sensação de bocejo leve ou de surpresa.'
    ]
  },
  {
    id: 'breathy', kind: 'observar', title: 'Som soproso',
    signal: 'Muito ar no som, voz "sussurrada", fôlego acaba rápido.',
    cause: 'As pregas vocais não fecham bem; o ar escapa sem virar som.',
    actions: [
      'Comece as notas com "m" ou "n" (mum, nuh): ajudam o fechamento sem forçar.',
      'Cante em volume médio, não sussurrado.'
    ]
  },
  {
    id: 'hardattack', kind: 'observar', title: 'Ataque duro (clique no início)',
    signal: 'A nota começa com um "clique" ou golpe na garganta.',
    cause: 'Ataque glótico forte: as pregas fecham com força antes do ar.',
    actions: [
      'Comece com um "h" bem leve antes da vogal, depois tire o "h" mantendo a suavidade.',
      'Ou comece com "m".'
    ]
  },
  {
    id: 'hoarse', kind: 'observar', title: 'Rouquidão ou cansaço depois de praticar',
    signal: 'Voz rouca, garganta dolorida ou cansada depois da prática.',
    cause: 'Excesso de volume, tempo ou tensão. Também desidratação.',
    actions: [
      'Pare por hoje e beba água. Sessões curtas e frequentes rendem mais que longas.',
      'Se a rouquidão durar mais de duas semanas, procure um otorrino ou fonoaudiólogo.'
    ]
  },
  {
    id: 'car', kind: 'observar', title: 'Cantando no carro',
    signal: 'Postura e atenção ao dirigir.',
    cause: 'Sentado e concentrado na estrada, é fácil afundar no banco e perder o apoio.',
    actions: [
      'Costas apoiadas, peito aberto, sem afundar.',
      'A estrada vem primeiro: o app não exige toque nem tela; ignore o resultado até parar.',
      'Feche as janelas: menos ruído, leitura de afinação melhor.'
    ]
  }
];
export const guideById = id => GUIDE.find(g => g.id === id);

/* Which guide items does a session's data point to? Returns [{id, why}] */
export function tipsFor(sum, extra = {}) {
  const out = [];
  if (!sum || !sum.sung) return out;
  if (sum.bias != null && sum.bias < -20) out.push({ id: 'flat', why: `Média ${sum.bias} cents.` });
  if (sum.bias != null && sum.bias > 20) out.push({ id: 'sharp', why: `Média +${sum.bias} cents.` });
  if (sum.scoopPct > 35) out.push({ id: 'scoop', why: `${sum.scoopPct}% das notas começaram por baixo.` });
  if (sum.stab != null && sum.stab > 25) out.push({ id: 'wobble', why: `Oscilação típica de ${sum.stab} cents.` });
  if (extra.drift != null && extra.drift < -25) out.push({ id: 'endflat', why: `Queda média de ${-extra.drift} cents nas sustentadas.` });
  if (extra.shortHolds) out.push({ id: 'breath', why: `${extra.shortHolds} nota(s) sustentada(s) curta(s).` });
  if (extra.breaks && extra.breaks.length) out.push({ id: 'break', why: 'Quebra perto de ' + extra.breaks.join(', ') + '.' });
  if (extra.highWorse) out.push({ id: 'high', why: extra.highWorse });
  return out;
}
