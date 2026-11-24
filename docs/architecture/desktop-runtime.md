# Arquitetura desktop

```text
SolidJS compartilhado
        ↓
contrato `window.omegaDesktop`
      ↙                 ↘
Electron no Linux    Tauri no Windows
      ↘                 ↙
    crate Rust compartilhado
```

## Interface e bridge

`apps/desktop/frontend/src` contém a interface SolidJS e o contrato `DesktopApi`, definido em `apps/desktop/frontend/src/shared/lib/desktop-contract.ts`. Os recursos chamam `apps/desktop/frontend/src/shared/lib/desktop.ts`; não importam APIs do Electron ou do Tauri diretamente.

No Linux, `apps/desktop/bridge/electron/preload.cjs` implementa o contrato por IPC. O processo principal inicia `apps/desktop/backend` como subprocesso Rust e encaminha respostas, eventos e canais por stdin/stdout.

No Windows, `apps/desktop/bridge/tauri` implementa o mesmo contrato com APIs Tauri e chama `DesktopBackend` do crate compartilhado em processo. O crate contém os serviços de notas, vaults, estudos, IA, timer, terminal e updates. O host fornece diretórios e eventos; a lógica de domínio permanece no backend.

Os nomes e campos de argumentos dos 90 comandos do backend são conferidos entre os consumidores frontend, `backend/src/dispatch.rs` e `bridge/electron/backend-commands.json`. O Electron aplica a lista como allowlist; o caminho padrão do Tauri encaminha comando e argumentos sem tradução a `desktop_dispatch`. `desktop-command-contract.test.mjs` cobre esse contrato, e `desktop-channel-contract.test.mjs` cobre os streams persistentes e seus transports. Comandos específicos do host continuam implementados nos respectivos adapters.

Os canais de `terminal_open`, `stream_note_summaries` e `read_studies` podem continuar emitindo eventos depois da resposta RPC; `shared/lib/desktop.ts` os mantém registrados até o evento `exit`. Electron e Tauri encaminham esses eventos pelo contrato `omega:channel`, e `backend/src/dispatch.rs` associa cada comando ao argumento de canal correspondente.

O app valida comandos, argumentos e URLs na fronteira da bridge. O WebView não recebe acesso Node. Navegação externa, seletores de arquivo, comandos de janela e bandeja são responsabilidade do host.

## Fronteiras internas

No frontend, `app/controller.ts` compõe os recursos e delega o carregamento sob demanda a `app/model/lazy-controller.ts`; a ordem dos salvamentos prévios a pedidos de IA e ao encerramento fica em `app/model/save-checkpoints.ts`.

No chat de IA, `features/chat-with-ai/model/message-scroll.ts` mantém o seguimento do fim das mensagens em mudanças de conteúdo/estado ocupado, sem tornar a posição de rolagem uma dependência reativa do próprio efeito.

No Kanban, `features/manage-kanban/model/wip-editor.ts` centraliza a confirmação do limite WIP ao sair do campo e a interpretação de zero/valor vazio como limite ilimitado; `details-editor.ts` prepara os rascunhos editáveis dos cartões, `card-drag.ts` calcula o limiar de ativação e a posição de inserção, e `card-drag-listeners.ts` registra e remove listeners globais de ponteiro/blur; a view mantém a integração com DOM, pointer events e persistência.

No canvas, `pages/canvas/model/startup-view.ts` calcula a translação inicial da câmera para centralizar notas ou a área vazia sem alterar as posições persistidas dos nós; `zip-tie-gesture.ts` concentra a combinação de modificadores e a distinção entre clique em nó e traço de zip tie.

O diálogo compartilhado de exclusão mantém a mensagem da confirmação durante a animação de saída por meio de `shared/ui/delete-confirmation-dialog/message.ts`; a view conserva apenas a integração com o memo e o conteúdo renderizado.

O fundo animado compartilhado usa `shared/ui/ascii-backdrop/rendering.ts` para a conversão das coordenadas globais da chuva Matrix para o canvas local e para o limite de densidade das marcas.

O editor de texto mantém em `pages/notes/ui/note-text-node/controller.ts` a coordenação entre DOM, eventos e histórico. Os módulos `caret-dom.ts`, `text-replacement.ts`, `protected-table.ts`, `clipboard.ts`, `text-formatting.ts` e `task-toggle.ts` isolam operações de caret, substituição/remapeamento, proteção de tabelas, leitura dos formatos de clipboard, preparação da formatação e atualização de checkboxes Markdown. O histórico permanece na feature compartilhada `undo-note-edit`.

As variantes estática e dinâmica do canvas delegam a `pages/canvas/model/preload-note.ts` a regra que pré-carrega a nota no pointer down primário antes de iniciar o gesto.

O leitor de PDF integra controles e interação; `features/manage-pdfs/model/page-renderer.ts` gerencia renderização visível, camadas de texto e cancelamento de tarefas, enquanto `page-preview.ts` cuida do cache e pré-renderização das páginas adjacentes. `page-elements.ts` centraliza a prontidão de canvas e camada de texto das páginas visíveis. `resize-reporter.ts` e `library-page-size-observer.ts` agrupam, respectivamente, o redimensionamento do leitor e a medição da lista da biblioteca; `page-pan.ts` concentra os adapters de movimento e `pointer-lock-pan.ts` o ciclo de vida de Alt/pointer lock; `pdf-suggestion-anchor.ts` posiciona e limpa a observação da lista de sugestões de nota. `zoom-position.ts` preserva a posição de zoom com âncora ou centralização horizontal após renderizar. `panel-presence.ts` mantém o leitor montado enquanto um documento continua aberto, inclusive durante o fechamento do painel; `panel-resize.ts` calcula os limites e adapta eventos de ponteiro da largura do painel PDF. `reader-controls.ts` mantém zoom e transições de navegação; `page-jump-input.ts` compartilha a adaptação de input, blur, Enter e Escape entre os campos de salto do leitor e da biblioteca. `highlight-selection.ts`, `highlight-menu.ts` e `highlight-menu-dismissal.ts` concentram geometria de seleção, hit testing, posicionamento e fechamento do menu; `highlight-actions.ts` mantém persistência das marcações. `library-pagination.ts` mantém busca, salto de página e paginação, e `library-card-actions.ts` trata o toggle das ações no cartão e a distinção entre menu contextual e clique no fundo.

No backend, `app/library/loading.rs` coordena o streaming cancelável, `app/library/loading/full_library.rs` mantém o carregamento completo e a recuperação, e `loading/summary_index.rs` implementa o índice versionado de resumos. `notes/commands.rs` integra operações de notas com `notes/commands/external_snapshot.rs`, que mantém os snapshots de mudanças externas. Nas sessões CLI, `chat_prompt.rs`, `oneshot.rs`, `persistent_session.rs`, `persistent_turn.rs`, `run.rs` e `stream_framing.rs` separam prompt, execução pontual, sessão Claude/Antigravity, turnos, controle de processos e framing; `open_session.rs` mantém o protocolo próprio do OpenCode. `mod.rs` conserva a seleção e coordenação dos provedores.

A coleta de mídia sem referência continua ligada às mutações de notas: recebe os IDs removidos ao salvar ou apagar uma nota e preserva arquivos ainda referenciados em notas, exclusões e backups. Não há comando de varredura global de mídia.

Esses módulos são fronteiras internas: não alteram por si só o contrato público da bridge nem substituem a validação específica de Electron/Linux e Tauri/Windows.

## Atualizações

Linux usa o atualizador Rust existente: manifesto `native-latest.json`, pacotes `.deb` e `.rpm`, assinatura Minisign e instalação por APT/DNF com Polkit. O gerenciador de pacotes mantém o registro do sistema.

Windows usa o plugin updater do Tauri. A instalação inicial e as atualizações usam o mesmo NSIS `.exe`, cuja assinatura é gerada em `.exe.sig`. Ambos os hosts usam o manifesto estático `native-latest.json`; `platforms.windows-x86_64` serve o Tauri e `packages.linux-x86_64` serve o atualizador Linux.

O workflow de release só publica após validação gráfica explicitamente habilitada. Builds locais não publicam nem enviam pacotes.

## Desenvolvimento e builds

`yarn dev:desktop` e `yarn build:desktop` selecionam o host pelo sistema: Electron no Linux e Tauri no Windows. Há comandos explícitos `dev:desktop:electron`, `build:desktop:electron`, `dev:desktop:tauri` e `build:desktop:tauri` para cada host.

O renderer usa a mesma saída Vite. O build Tauri define `VITE_DESKTOP_RUNTIME=tauri` e ativa o adapter Tauri antes do bootstrap SolidJS. A API pública da interface permanece comum.
