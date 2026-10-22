# Buscar na nota

## Ciclo de vida

`Ctrl+F` ou `⌘F` abre a busca quando uma nota está ativa e não há diálogo/modal ou terminal recebendo foco. O texto visível dos blocos e das células de tabela é indexado no DOM; ocorrências são destacadas, contadas e navegadas circularmente. Alterações no DOM, redimensionamento e rolagem atualizam as posições.

`Escape` fecha a busca. Trocar de nota limpa a consulta e os destaques. A indexação é limitada a 1.000 ocorrências para manter o custo previsível.

## Estado e cobertura

A busca não altera nem persiste a nota. O estado existe enquanto o controlador da nota está montado. Não há teste dedicado; seleção de texto, tabelas e renderização dependem de verificação visual.

## Código

- [Indexação e navegação](../../apps/desktop/src/features/find-in-note/model/controller.ts)
- [Barra de busca](../../apps/desktop/src/features/find-in-note/ui/find-bar.tsx)
