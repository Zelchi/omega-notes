# Kanban

## Ciclo de vida

O painel é aberto pelo botão da barra ou pelo atalho `Ctrl+Shift+B`; abrir outro painel principal o oculta, sem desmontar o controlador. Cada vault tem itens em cinco colunas (`Backlog`, `To Do`, `In progress`, `Review`, `Finish`). Criar, editar, apagar ou arrastar um cartão atualiza o estado em memória e enfileira uma gravação.

Cada cartão guarda título, etapa, posição, data de criação e data da última troca de etapa. Soltar um cartão sobre outro troca as posições; em colunas diferentes, os cartões também trocam de etapa. Soltar em um espaço vazio move o cartão para aquela posição. A data de movimentação fica vazia até o primeiro movimento entre etapas; editar o título ou reordenar na mesma coluna não a altera. Dados antigos que repetiam a data de criação em `updatedAt` são normalizados como ainda não movidos. As cinco colunas começam expandidas, podem ser minimizadas individualmente e mostram ao menos cinco espaços. O limite de 1.000 cartões é igual ao limite do armazenamento.

## Persistência e risco

No desktop, os cartões ficam em `.kanban.json` dentro do vault; no fallback web, em `localStorage`. O repositório valida IDs, títulos, etapas, posições e tamanho. A fila serializa gravações por vault; fechamento e operações de vault aguardam `flushSave` antes de continuar.

Se uma gravação pendente falhar, `flushSave` retorna `false` e o fluxo que fecharia o app ou alteraria o vault é interrompido. O painel mantém o erro visível; uma nova edição tenta salvar novamente o estado completo.

Os testes de regressão estão em [kanban.test.mjs](../../apps/desktop/test/kanban.test.mjs).

## Código

- [Controlador e fila de gravação](../../apps/desktop/src/features/manage-kanban/model/controller.ts)
- [Validação do repositório web](../../apps/desktop/src/features/manage-kanban/api/kanban.repository.ts)
- [Persistência desktop](../../apps/desktop/tauri/src/vaults/kanban.rs)
- [Painel e arraste](../../apps/desktop/src/features/manage-kanban/ui/kanban-panel/index.tsx)
