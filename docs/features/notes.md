# Ciclo de vida das notas

## Abrir e carregar

Ao selecionar um vault, `useNotes` pede ao backend um fluxo de resumos: ID, título, referências, datas e métricas de conteúdo. A lista do Canvas não carrega todos os documentos. O corpo completo é lido sob demanda ao abrir uma nota; documentos já abertos ficam em cache enquanto o vault está ativo.

## Editar e salvar

Edições atualizam o documento em memória e entram numa fila de autosave. Antes de navegar, trocar vault, excluir ou encerrar, o app descarrega o título e a fila. No desktop, o Rust compara o documento atual do disco com a versão esperada; conflito externo bloqueia a sobrescrita até a pessoa escolher como resolver. Gravações usam arquivo temporário/backup e atualização do índice de resumos.

Com Gambiarra habilitada, o app também observa alterações externas e reconcilia os documentos carregados. Ao desabilitar o modo ou trocar vault, a observação anterior deixa de valer.

## Excluir, restaurar e mídia

Excluir arquiva a nota para permitir recuperação/desfazer. Referências e métricas são reconstruídas pelo repositório. A limpeza de imagens só remove arquivos sem referências em notas, backups e notas excluídas. A reutilização de imagens entre notas usa o [catálogo de mídias](media-catalog.md), que consulta metadados de referências sem chamar uma operação geral de carregar todos os documentos. Na primeira inicialização após remover áudio e vídeo, o desktop apaga as pastas antigas `audios/` e `videos/` e remove esses elementos de notas e cópias de recuperação.

## Cobertura

Os contratos de autosave, mudanças externas e leituras concorrentes estão em [autosave.test.mjs](../../apps/desktop/test/autosave.test.mjs), [notes-external.test.mjs](../../apps/desktop/test/notes-external.test.mjs) e [notes-read-concurrency.test.mjs](../../apps/desktop/test/notes-read-concurrency.test.mjs). Exclusão e recuperação são exercitadas em [deletion.test.mjs](../../apps/desktop/test/deletion.test.mjs). Não há teste dedicado para o novo extrator do catálogo de mídias.

## Código

- [Estado/cache de notas](../../apps/desktop/src/entities/note/model/notes-library.ts)
- [Interface do repositório](../../apps/desktop/src/entities/note/api/notes.repository.ts)
- [Persistência e concorrência Rust](../../apps/desktop/tauri/src/notes/repository.rs)
- [Comandos](../../apps/desktop/tauri/src/notes/commands.rs)
