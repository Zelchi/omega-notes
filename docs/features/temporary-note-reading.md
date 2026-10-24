# Leitura temporária ao segurar Alt

## Ciclo de vida

Com uma nota em edição e sem campo de texto ou diálogo ativo, segurar `Alt` muda temporariamente o editor para leitura. Ao soltar a tecla, o modo de edição retorna. Se havia foco no texto, a seleção é guardada como offsets e restaurada; a posição de rolagem é preservada durante a troca.

Perder foco, ocultar o documento, trocar de nota, sair do modo de edição ou desabilitar o recurso encerra a leitura temporária sem tentar restaurar foco em outra nota.

## Estado e cobertura

O modo é efêmero e não altera o documento. Não há teste dedicado; a integração é feita pelo controlador do app.

## Código

- [Controlador](../../apps/desktop/frontend/src/features/temporary-note-reading/model/temporary-reading.controller.ts)
- [Integração com o app](../../apps/desktop/frontend/src/app/controller.ts)
