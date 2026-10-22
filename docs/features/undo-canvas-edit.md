# Desfazer alterações no Canvas

## Ciclo de vida

Em modo de edição no Canvas, criação, exclusão e movimentação de notas registram uma ação por vault. `Ctrl+Z` desfaz e `Ctrl+Y` ou `Ctrl+Shift+Z` refaz, exceto quando o foco está em campo editável, diálogo ou Chat. O histórico retém até 100 ações por vault enquanto o controlador permanece montado.

Desfazer uma exclusão restaura a nota do armazenamento de excluídas; refazer a exclui novamente. Movimentações restauram layout e posições. Um snapshot por layout permite recuperar posições quando o Canvas é remontado.

## Estado e limites

O histórico não é persistido entre reinicializações. O armazenamento de exclusões da nota é persistente e separado; falhas de leitura/remoção mantêm a ação no histórico para nova tentativa. Cobertura em [canvas-history.test.mjs](../../apps/desktop/test/canvas-history.test.mjs) e [canvas-state.test.mjs](../../apps/desktop/test/canvas-state.test.mjs).

## Código

- [Controlador](../../apps/desktop/src/features/undo-canvas-edit/model/canvas-history.controller.ts)
- [Snapshots de layouts](../../apps/desktop/src/features/undo-canvas-edit/model/canvas-snapshot-store.ts)
