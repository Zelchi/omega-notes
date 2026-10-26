# Índice da documentação

## Features

| Feature | Memo | Cobertura de regressão |
| --- | --- | --- |
| Alinhamento de texto | [align-text](features/align-text.md) | Sem teste dedicado. |
| Preferências | [change-preferences](features/change-preferences.md) | [preferences.test.mjs](../apps/desktop/frontend/test/preferences.test.mjs) |
| Chat com IA | [chat-with-ai](features/chat-with-ai.md) | [ai_tools.rs](../apps/desktop/backend/test/ai_tools.rs), [ai_provider_tools.rs](../apps/desktop/backend/test/ai_provider_tools.rs) |
| Atualizações | [check-for-updates](features/check-for-updates.md) | [updater-install.test.mjs](../apps/desktop/bridge/electron/test/updater-install.test.mjs) cobre a instalação Electron, não o controlador da interface. |
| Criar nota por referência | [create-note-from-link](features/create-note-from-link.md) | Sem teste dedicado. |
| Excluir nota | [delete-note](features/delete-note.md) | [deletion.test.mjs](../apps/desktop/frontend/test/deletion.test.mjs), [canvas-history.test.mjs](../apps/desktop/frontend/test/canvas-history.test.mjs) |
| Editar tabelas | [edit-table](features/edit-table.md) | Sem teste dedicado do editor. |
| Buscar na nota | [find-in-note](features/find-in-note.md) | Sem teste dedicado. |
| Formatação de texto | [format-text](features/format-text.md) | Sem teste dedicado da integração com o editor. |
| Terminal Gambiarra | [gambiarra-terminal](features/gambiarra-terminal.md) | Sem teste de uma conversa autenticada com CLI. |
| Player lo-fi | [lofi-player](features/lofi-player.md) | [lofi-player.test.mjs](../apps/desktop/frontend/test/lofi-player.test.mjs), [note-media-playback.test.mjs](../apps/desktop/frontend/test/note-media-playback.test.mjs), [production-features.test.mjs](../apps/desktop/frontend/test/production-features.test.mjs) |
| Kanban | [manage-kanban](features/manage-kanban.md) | [kanban.test.mjs](../apps/desktop/frontend/test/kanban.test.mjs) |
| Gerenciar vaults | [manage-vault](features/manage-vault.md) | [notes-external.test.mjs](../apps/desktop/frontend/test/notes-external.test.mjs) cobre parcialmente mudanças externas. |
| Colar link | [paste-url-link](features/paste-url-link.md) | Sem teste dedicado. |
| Pomodoro e To Do | [pomodoro](features/pomodoro.md) | [production-features.test.mjs](../apps/desktop/frontend/test/production-features.test.mjs) verifica disponibilidade em produção. |
| Notas de estudo | [study-notes](features/study-notes.md) | [study-generation.test.mjs](../apps/desktop/frontend/test/study-generation.test.mjs), [study-items.test.mjs](../apps/desktop/frontend/test/study-items.test.mjs), [study-queue.test.mjs](../apps/desktop/frontend/test/study-queue.test.mjs), [study-toolbar.test.mjs](../apps/desktop/frontend/test/study-toolbar.test.mjs), [study_context.rs](../apps/desktop/backend/test/study_context.rs) |
| Sugerir referência | [suggest-note-link](features/suggest-note-link.md) | Sem teste dedicado. |
| Leitura temporária | [temporary-note-reading](features/temporary-note-reading.md) | Sem teste dedicado. |
| Desfazer edição do canvas | [undo-canvas-edit](features/undo-canvas-edit.md) | [canvas-history.test.mjs](../apps/desktop/frontend/test/canvas-history.test.mjs), [canvas-state.test.mjs](../apps/desktop/frontend/test/canvas-state.test.mjs) |
| Desfazer edição de nota | [undo-note-edit](features/undo-note-edit.md) | Sem teste dedicado. |

## Fluxos de entidades e páginas

| Fluxo | Documentação | Código principal |
| --- | --- | --- |
| Notas e persistência | [notes](features/notes.md) | [`entities/note`](../apps/desktop/frontend/src/entities/note/) |
| Vaults | [vaults](features/vaults.md) | [`entities/vault`](../apps/desktop/frontend/src/entities/vault/) |
| Estudos | [study-notes](features/study-notes.md) | [`entities/study`](../apps/desktop/frontend/src/entities/study/) |
| Provedores de IA | [chat-with-ai](features/chat-with-ai.md) | [`entities/ai`](../apps/desktop/frontend/src/entities/ai/) |
| Canvas, grafo e arquivo | [canvas](features/canvas.md) | [`pages/canvas`](../apps/desktop/frontend/src/pages/canvas/) |
| Editor, players e catálogo de mídias | [notes](features/notes.md), [media-catalog](features/media-catalog.md) | [`pages/notes`](../apps/desktop/frontend/src/pages/notes/) |

## Arquitetura e desenvolvimento

- [Arquitetura desktop e bridges](architecture/desktop-runtime.md)
- [Janelas persistentes](architecture/persistent-windows.md)
- [Processo de qualidade das features](development/feature-quality-process.md)
- [Organização do repositório](development/repository.md)
- [Publicação e atualizações](development/releases.md)
