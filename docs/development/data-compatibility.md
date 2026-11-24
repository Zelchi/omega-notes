# Compatibilidade de dados persistidos

Inventário conferido no código e nos testes do checkout em 23/11/2026. Nenhum vault real de usuário foi inspecionado; os formatos abaixo são evidências de leitores e fixtures mantidos no repositório, não uma afirmação de quais versões ainda estão em uso.

## Formatos ainda aceitos

- **Kanban:** `.kanban.json` aceita o objeto atual `{ items, wipLimits }` e o formato antigo que contém apenas uma lista de itens. Campos acrescentados aos cartões recebem valores padrão quando ausentes. A leitura também normaliza `updatedAt` igual a `createdAt` como cartão ainda não movido. Os testes Rust cobrem defaults e arrays antigos; `frontend/test/kanban.test.mjs` cobre defaults, normalização e a migração dos limites WIP antigos.
- **Limites WIP no navegador:** a chave antiga `omega-notes.kanban.wip.v1.<vaultId>` é copiada para os dados do vault quando estes ainda não têm limites; a chave antiga só é removida após a gravação bem-sucedida. Se o formato atual já contém limites, ele prevalece e a chave antiga é descartada. Há testes para migração no fallback web e pelo comando desktop.
- **Notas no fallback web:** `browser-notes.repository.ts` remove o campo legado `preview` ao ler e regrava a nota normalizada. Elementos de áudio e vídeo são preservados em notas ativas e excluídas; `frontend/test/legacy-media-migration.test.mjs` cobre ambos os casos.
- **Índice de resumos:** `.note-summaries.json` é cache reconstruível, não fonte de dados. O formato atual é versão 7, limitado a 64 MiB; índices ausentes, inválidos ou de outra versão são ignorados e reconstruídos a partir das notas.
- **Recuperação de notas:** quando uma nota está corrompida, o carregamento tenta restaurar a cópia anterior e preservar os bytes danificados para recuperação. Testes do backend cobrem a cópia danificada, o backup e a reindexação posterior.

## Medição do fallback no navegador

Em 23/11/2026, o fallback foi exercitado no HeadlessChrome 157.0.8103.50 e no Firefox 160.0, ambos em Linux, servidos pelo Vite e com perfis temporários. Os ensaios criaram notas sintéticas pelo modelo atual, gravaram o array JSON no `localStorage` e mediram três chamadas aquecidas a `streamNoteSummaries`:

| Notas | JSON aproximado | Chrome — mediana | Firefox — mediana |
| ---: | ---: | ---: | ---: |
| 100 | 84 KB | 19 ms | 23 ms |
| 1.000 | 840 KB | 195 ms | 182 ms |
| 3.000 | 2,52 MB | 484 ms | 488 ms |
| 6.000 | 5,05 MB | 860 ms | 970 ms |

Nos dois navegadores, gravar 7.000 notas (~5,89 MB) falhou com `QuotaExceededError`; a sondagem isolada aceitou cerca de 5,11 milhões de caracteres ASCII. São referências sintéticas headless no mesmo host: o tempo inclui leitura e processamento do repositório, não renderização da interface. Os ensaios não mediram armazenamento persistente de um perfil de usuário nem tamanhos reais de vaults; não fundamentam sozinhos um limite de produto ou remoção do fallback.

### Renderização sintética no canvas

Com a mesma fixture, o app foi recarregado após gravar as notas e forçado ao layout estático, que renderiza todos os cartões do canvas. Cada linha é uma única medição headless; o tempo vai do início da navegação até todos os elementos `data-note-id` estarem no DOM e passarem por dois frames de `requestAnimationFrame`. O tempo para gravar o fixture no armazenamento foi separado e não está incluído:

| Notas | JSON | Chrome — render | Firefox — render |
| ---: | ---: | ---: | ---: |
| 100 | 84 KB | 425 ms | 650 ms |
| 1.000 | 840 KB | 522 ms | 686 ms |
| 3.000 | 2,52 MB | 1.605 ms | 1.495 ms |
| 6.000 | 5,05 MB | 3.820 ms | 3.093 ms |

Essa medição é do layout estático com todos os cartões presentes, não uma comparação entre layouts nem uma avaliação visual em dispositivo real. Continua sem evidência sobre os tamanhos de vaults em uso, renderização em outros dispositivos, perfis persistentes ou interação manual; não define limite de produto.

## Decisão de manutenção

Este levantamento não remove nem altera decodificadores. Como não há evidência sobre a presença desses formatos em vaults reais nem uma política de descontinuação aprovada, mantê-los é a opção conservadora. Qualquer remoção futura exige decisão explícita sobre suporte, uma migração que preserve os dados e testes de leitura dos formatos afetados.
