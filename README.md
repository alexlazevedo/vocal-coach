# Canto · treino vocal

PWA pessoal para treinar canto: o app toca a frase, você repete, e ele mede afinação, ataque, estabilidade, fôlego e quebras de registro.

- **Treinar:** sessão rápida (~4–7 min) e exercícios avulsos (nota sustentada, escala de 5 notas, intervalos, arpejo, sirene), todos montados dentro da sua faixa de trabalho.
- **Afinador:** nota e cents ao vivo, linha da voz e nota de referência.
- **Progresso:** extensão ao longo do tempo, afinação por sessão, onde você desafina, acerto por intervalo.
- **Guia:** sinal → causa → ação, inclusive para o que o app não mede (garganta, queixo, nasalidade).
- **Modo carro:** voz guia, telas grandes, nenhum toque necessário.

Os dados ficam só no aparelho (localStorage). "Copiar resumo para o Claude" gera um texto para colar numa conversa.

## Estrutura

| Arquivo | O quê |
|---|---|
| `js/audio.js` | Microfone, detecção de pitch (YIN), tons de referência, voz, wake lock |
| `js/analysis.js` | Segmentação, alinhamento nota a nota, métricas, quebras, extremos da extensão |
| `js/exercises.js` | Catálogo de exercícios e geradores de frases |
| `js/guide.js` | Guia de observação e regras que ligam dados → dicas |
| `js/app.js` | Interface, sessão, relatório, progresso, ajustes |
| `sw.js` | Cache offline (aumente `VERSION` a cada publicação) |

Critérios: afinada = até 25 cents; perto = até 50 cents.
