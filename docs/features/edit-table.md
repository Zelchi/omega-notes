# Editar tabela

## Ciclo de vida

Ao abrir o editor sobre uma tabela Markdown, o texto é separado em cabeçalho, delimitadores e linhas. A edição atualiza as células na nota; ao fechar ou aplicar, a tabela é serializada novamente no mesmo documento e salva pelo fluxo normal da nota.

Valores de célula com barra vertical recebem escape e quebras de linha viram espaços, preservando a estrutura de colunas. Linhas curtas são completadas com células vazias ao carregar.

## Estado e cobertura

O rascunho da tabela pertence ao editor aberto; o conteúdo persistido continua sendo Markdown dentro da nota. Não há teste dedicado do editor de tabela.

## Código

- [Conversão entre Markdown e células](../../apps/desktop/src/features/edit-table/model/table.ts)
- [Editor](../../apps/desktop/src/features/edit-table/ui/table-editor/index.tsx)
