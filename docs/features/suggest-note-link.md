# Sugerir link de nota

## Ciclo de vida

Enquanto o cursor está dentro de `[[...]]`, a feature identifica o trecho e procura títulos normalizados no vault. Sugere até seis notas, priorizando prefixos; setas mudam a escolha e `Enter` ou `Tab` seleciona. Selecionar delega a substituição para o editor, que mantém o alias quando ele já existe. `Escape` fecha as sugestões para o trecho atual.

Ao sair do formato de link, a sugestão dispensada é liberada. Trocar texto, cursor ou conjunto de títulos recalcula a lista.

## Estado e cobertura

As sugestões são derivadas do texto e da biblioteca; não são persistidas. O cache de títulos existe só para evitar renormalizar títulos inalterados. Não há teste dedicado de interface.

## Código

- [Contexto no cursor](../../apps/desktop/src/features/suggest-note-link/model/link-context.ts)
- [Busca e seleção](../../apps/desktop/src/features/suggest-note-link/model/suggestions.controller.ts)
- [Integração com o editor](../../apps/desktop/src/pages/notes/ui/note-text-node/controller.ts)
