# Excluir nota

## Ciclo de vida

Ao pedir exclusão, notas com conteúdo exigem confirmação; notas vazias podem ser removidas diretamente. Antes da mutação, o controlador salva o título e descarrega a fila de salvamento. A operação é bloqueada durante navegação, conflito, outra exclusão, atualização ou mutação do Canvas.

O backend move a nota para o armazenamento de excluídas, em vez de apagar imediatamente. O histórico do Canvas registra a exclusão para desfazer; a restauração recupera a nota. Se a nota deixa a biblioteca durante uma operação, o diálogo é fechado.

## Falhas e cobertura

Erro de salvamento ou exclusão mantém a nota e permite nova tentativa. [deletion.test.mjs](../../apps/desktop/frontend/test/deletion.test.mjs) cobre a regressão da exclusão; o histórico é exercitado em [canvas-history.test.mjs](../../apps/desktop/frontend/test/canvas-history.test.mjs).

## Código

- [Controlador](../../apps/desktop/frontend/src/features/delete-note/model/controller.ts)
- [Confirmação](../../apps/desktop/frontend/src/features/delete-note/ui/delete-note-dialog/index.tsx)
- [Mutação e recuperação](../../apps/desktop/backend/src/app/library/mutations.rs)
