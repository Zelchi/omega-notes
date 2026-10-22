# Desfazer edição de texto

## Ciclo de vida

Cada editor de texto mantém seu próprio histórico em memória. Ao registrar uma mudança, o conteúdo e a seleção anteriores e posteriores são guardados; digitação e exclusão adjacentes podem ser agrupadas por até 750 ms, e colagem de URL por até 15 segundos. Uma nova edição limpa a pilha de refazer. O histórico limita-se a 100 entradas.

Desfazer ou refazer restaura texto, alinhamentos de parágrafo, seleção e posição de rolagem. Fechar/desmontar o editor descarta esse histórico; o conteúdo salvo continua no documento normal da nota.

## Falhas e cobertura

O histórico não persiste após reinício e não há teste dedicado. A lógica pura está separada do DOM e é candidata direta a teste de regressão.

## Código

- [Histórico de texto](../../apps/desktop/src/features/undo-note-edit/model/text-history.ts)
- [Integração no editor](../../apps/desktop/src/pages/notes/ui/note-text-node/controller.ts)
