# Canvas

## Ciclo de vida

O Canvas parte da biblioteca de resumos do vault ativo. O layout Estático permite posicionar nós manualmente; o Dinâmico calcula posições por força e mantém um limite de 60 quadros por segundo enquanto a simulação está ativa. Ambos guardam posições e visão por vault no `localStorage`.

O layout Arquivo apresenta listas encadeadas de notas e pastas; sua estrutura também fica no `localStorage`, separada por vault. A opção e a visualização estão disponíveis em builds de produção. As preferências de layout são preservadas no armazenamento local da instalação.

Atalhos e controles de navegação alteram a visualização; criar, mover e excluir notas registra ações para desfazer/refazer enquanto o app está aberto. O histórico não é persistido após reiniciar.

## Falhas e cobertura

Falhas de gravação de posições mantêm o Canvas utilizável em memória, mas o estado pode sumir ao remontar. No Arquivo, a falha de `localStorage` é mostrada com uma ação de nova tentativa; a alteração permanece na memória enquanto a visualização está aberta. Testes de grafo, estado, histórico e persistência do Arquivo estão em [graph.test.mjs](../../apps/desktop/test/graph.test.mjs), [canvas-state.test.mjs](../../apps/desktop/test/canvas-state.test.mjs), [canvas-history.test.mjs](../../apps/desktop/test/canvas-history.test.mjs) e [archive.test.mjs](../../apps/desktop/test/archive.test.mjs).

## Código

- [Seleção de layout](../../apps/desktop/src/pages/canvas/ui/canvas/index.tsx)
- [Canvas Estático](../../apps/desktop/src/pages/canvas/ui/graph-canvas/)
- [Grafo Dinâmico](../../apps/desktop/src/pages/canvas/ui/dynamic-graph/)
- [Arquivo](../../apps/desktop/src/pages/canvas/ui/archive-view/)
- [Armazenamento de posições](../../apps/desktop/src/pages/canvas/api/graph.repository.ts)
