# Leitura temporária ao segurar Alt esquerdo

## Ciclo de vida

Com uma nota em edição e sem campo de texto ou diálogo ativo, segurar o `Alt` esquerdo muda temporariamente o editor para leitura. A captura usa `KeyboardEvent.code === "AltLeft"`; o `Alt` direito não ativa a prévia. Ao soltar `Alt` esquerdo, o modo de edição retorna. Se havia foco no texto, a seleção é guardada como offsets e restaurada; a posição de rolagem é preservada durante a troca.

Perder foco, ocultar o documento, trocar de nota, sair do modo de edição ou desabilitar o recurso encerra a leitura temporária sem tentar restaurar foco em outra nota.

## Estado e cobertura

O modo é efêmero e não altera o documento. A integração é feita pelo controlador do app; a verificação de tecla é estática, sem teste comportamental dedicado.

## Código

- [Controlador](../../apps/desktop/frontend/src/features/temporary-note-reading/model/temporary-reading.controller.ts)
- [Integração com o app](../../apps/desktop/frontend/src/app/controller.ts)
