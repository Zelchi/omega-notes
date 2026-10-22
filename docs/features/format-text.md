# Formatar texto

## Ciclo de vida

Com o cursor ou uma seleção no texto da nota, os comandos de formatação transformam o intervalo selecionado em Markdown e atualizam o elemento de texto. A formatação de seleção vazia insere a sintaxe no ponto do cursor; indentação trata os blocos selecionados. A edição continua pelo autosave normal e pelo histórico local de desfazer/refazer.

A análise de Markdown também converte o texto salvo em blocos formatados para exibição; imagens, áudio e vídeo são elementos separados do documento.

## Estado e cobertura

O formato persistido é texto Markdown, não uma árvore de rich text independente. Não há teste dedicado para a integração de formatação com a interface.

## Código

- [Transformações de seleção](../../apps/desktop/src/features/format-text/model/formatting.ts)
- [Indentação](../../apps/desktop/src/features/format-text/model/indentation.ts)
- [Parser de Markdown](../../apps/desktop/src/features/format-text/model/markdown.ts)
- [Editor de texto](../../apps/desktop/src/pages/notes/ui/note-text-node/controller.ts)
