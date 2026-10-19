# Testes do frontend

Execute `yarn test:desktop` na raiz, com Node.js 24 ou superior.
A suíte usa o executor nativo do Node, sem um framework adicional.

- `autosave.test.mjs`: revisões concorrentes, falhas, repetição, agrupamento e flush.
- `deletion.test.mjs`: confirmação por conteúdo, mídias, cancelamento, falhas e mudanças durante a operação.
- `canvas-state.test.mjs`: isolamento por vault/modo, snapshots e restauração da física.
- `canvas-history.test.mjs`: exclusão dentro da nota, desfazer/refazer e carregamentos fora de ordem.
- `graph.test.mjs`: referências fora de código, zoom persistido e histórico de navegação.
- `study-generation.test.mjs`: cinco métodos, lotes, recuperação parcial, limites de tentativas, contexto, aliases e invalidação do cache.
- `study-session.test.mjs`: integração dos cinco métodos com armazenamento em memória, pausa/retomada do cronômetro, geração oculta, cancelamento e relatórios de Redação/Lacunas em fila.
- `study-queue.test.mjs`: fila compartilhada, cancelamento, troca de vault, IA desabilitada, avaliação em segundo plano e repetição após falha sem duplicar pontuação.

`register.mjs` resolve os aliases e imports TypeScript usados pelo Vite. A condição
`browser` ativa as primitivas reativas do Solid nos testes. Os comandos IPC são
simulados; o worklet recebe uma URL fictícia e não executa áudio. Nenhum teste
acessa os vaults do usuário ou serviços de IA.

Esses testes verificam modelos e regras. Não substituem a validação do WebView,
renderização, áudio ou funcionamento dos CLIs reais.
