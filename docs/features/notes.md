# Ciclo de vida das notas

## Abrir e carregar

Ao selecionar um vault, `useNotes` pede ao backend um fluxo de resumos: ID, título, referências, datas e métricas de conteúdo. A lista do Canvas não carrega todos os documentos. O corpo completo é lido sob demanda ao abrir uma nota; documentos já abertos ficam em cache enquanto o vault está ativo.

## Editar e salvar

Edições atualizam o documento em memória e entram numa fila de autosave. Antes de navegar, trocar vault, excluir ou encerrar, o app descarrega o título e a fila. No desktop, o Rust compara o documento atual do disco com a versão esperada; conflito externo bloqueia a sobrescrita até a pessoa escolher como resolver. Gravações usam arquivo temporário/backup e atualização do índice de resumos.

Com Gambiarra habilitada, o app também observa alterações externas e reconcilia os documentos carregados. Ao desabilitar o modo ou trocar vault, a observação anterior deixa de valer.

## Áudio e vídeo

O desktop importa áudio `aac`, `flac`, `m4a`, `mp3`, `oga`, `ogg`, `opus` e `wav`, além de vídeo `mp4`, `ogv` e `webm`. O backend guarda cópias com UUID nas pastas `audios/` e `videos/` da raiz do vault. A interface usa os players do Chromium e recebe os dados por streaming HTTP local com suporte a solicitações por faixa, sem mandar o arquivo inteiro pela bridge e sem transcodificação. O preview web mantém os dados como `dataUrl`.

Elementos A/V antigos continuam sendo lidos e salvos com seus IDs, extensão, volume e posição. Abrir um vault não remove esses elementos nem suas pastas. A disponibilidade de reprodução depende dos codecs incluídos na versão do Electron.

## Excluir, restaurar e mídia

Excluir arquiva a nota para permitir recuperação/desfazer. Referências e métricas são reconstruídas pelo repositório. A limpeza remove imagens, áudios e vídeos sem referências em notas ativas, backups, snapshots de renomeação, cópias de recuperação e notas excluídas. A reutilização entre notas usa o [catálogo de mídias](media-catalog.md), que consulta metadados das referências sem carregar todos os documentos completos.

## Cobertura

Os contratos de autosave, mudanças externas e leituras concorrentes estão em [autosave.test.mjs](../../apps/desktop/frontend/test/autosave.test.mjs), [notes-external.test.mjs](../../apps/desktop/frontend/test/notes-external.test.mjs) e [notes-read-concurrency.test.mjs](../../apps/desktop/frontend/test/notes-read-concurrency.test.mjs). Exclusão e recuperação são exercitadas em [deletion.test.mjs](../../apps/desktop/frontend/test/deletion.test.mjs). Não há teste dedicado para o novo extrator do catálogo de mídias.

## Código

- [Estado/cache de notas](../../apps/desktop/frontend/src/entities/note/model/notes-library.ts)
- [Interface do repositório](../../apps/desktop/frontend/src/entities/note/api/notes.repository.ts)
- [Persistência e concorrência Rust](../../apps/desktop/backend/src/notes/repository.rs)
- [Comandos](../../apps/desktop/backend/src/notes/commands.rs)
