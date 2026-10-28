# Canvas

## Ciclo de vida

O Canvas parte da biblioteca de resumos do vault ativo. O layout Estático permite posicionar nós manualmente; o Dinâmico calcula posições por força e mantém um limite de 60 quadros por segundo enquanto a simulação está ativa. Ambos guardam posições e visão por vault no `localStorage`.

No layout Estático, o menu de contexto permite bloquear uma nota ou a seleção. Se a seleção tiver estados mistos, a ação bloqueia todas; quando todas já estão bloqueadas, a ação desbloqueia todas. Notas bloqueadas não podem ser arrastadas nem movidas pela separação automática; permanecem como âncoras enquanto as demais evitam sobreposição. O bloqueio fica salvo por vault e pode ser desfeito/refeito.

As conexões se distribuem pela lateral da nota; quando são numerosas, ficam mais próximas para permanecer dentro da altura da borda.

As preferências de layout são preservadas no armazenamento local da instalação.

Atalhos e controles de navegação alteram a visualização; criar, mover e excluir notas registra ações para desfazer/refazer enquanto o app está aberto. O histórico não é persistido após reiniciar.

## Falhas e cobertura

Falhas de gravação de posições mantêm o Canvas utilizável em memória, mas o estado pode sumir ao remontar. Testes de grafo, estado e histórico estão em [graph.test.mjs](../../apps/desktop/frontend/test/graph.test.mjs), [canvas-state.test.mjs](../../apps/desktop/frontend/test/canvas-state.test.mjs) e [canvas-history.test.mjs](../../apps/desktop/frontend/test/canvas-history.test.mjs).

## Código

- [Seleção de layout](../../apps/desktop/frontend/src/pages/canvas/ui/canvas/index.tsx)
- [Canvas Estático](../../apps/desktop/frontend/src/pages/canvas/ui/graph-canvas/)
- [Grafo Dinâmico](../../apps/desktop/frontend/src/pages/canvas/ui/dynamic-graph/)
- [Armazenamento de posições](../../apps/desktop/frontend/src/pages/canvas/api/graph.repository.ts)
