# Revisão de código — 16/10/2026

## Escopo

Revisão dos fluxos de salvamento, exclusão, navegação e referências do frontend,
com verificações de compilação do aplicativo e do site, testes Rust existentes e
Clippy. A revisão não comprova ausência de bugs em todo o projeto.

## Problemas reproduzidos e corrigidos

| Prioridade | Problema | Correção e evidência |
| --- | --- | --- |
| Alta | Uma gravação antiga falhava depois de uma edição nova já ter saído da lista de pendências. A falha recolocava a versão antiga na fila, e um flush posterior podia gravá-la depois da nova. | `notes-library.ts` acompanha a edição mais recente também durante a fila de escrita. O teste reproduzia `old → new → old`; agora grava somente `old → new`. |
| Média | O flush copiava várias pendências e ainda gravava a cópia antiga de uma nota alterada enquanto outra era salva. | Descarta entradas do snapshot que já foram substituídas. O teste de duas notas verifica que `b1` é substituída por `b2` antes de ser gravada. |
| Alta | Uma nota vazia podia receber texto enquanto `beforeDelete` aguardava e ser apagada sem confirmação. | A exclusão reconsulta o conteúdo depois da espera e abre a confirmação quando necessário. Também revalida bloqueios e o encerramento do controlador. |
| Média | `hasLoadedVault` continuava verdadeiro ao desmarcar ou começar a carregar outro vault. | Reinicializa o estado a cada mudança e invalida respostas de carregamento após a desmontagem. |
| Média | O canvas criava conexões para referências em código e aceitava referências atravessando linhas. | Reutiliza `mapTextOutsideCode`, restringe referências a uma linha e protege blocos com crases ou tildes. |
| Média | O estado persistido aceitava zoom zero, negativo e fora dos limites da interface. | Rejeita câmeras inválidas, evitando divisões por zero e áreas visíveis incoerentes. Também rejeita arrays no lugar do mapa de posições. |

Removido o `catch` em `notes-library.remove` que apenas registrava e relançava o
mesmo erro. O tratamento permanece nos chamadores responsáveis por mostrar a falha.

## Correções adicionais concluídas

### 1. Estado do canvas por vault

O repositório agora exige o ID do vault e grava chaves independentes para cada
vault e modo. O componente é remontado quando o ID muda. Os callbacks de movimento,
criação e encerramento carregam o ID do canvas que os originou, impedindo que uma
operação adiada de A escreva em B.

As chaves globais antigas não são atribuídas automaticamente a um vault. Não há
migração nem leitura de compatibilidade: posições e câmera começam uma organização
independente por vault no novo formato. O conteúdo das notas não é alterado.

### 2. Posição ao desfazer exclusão dentro da nota

`CanvasSnapshotStore` guarda cópias das posições por vault e modo. A desmontagem
conserva o último snapshot e remove o leitor do componente. Uma rotina de limpeza
antiga não pode remover um leitor novo. A exclusão registra antes/depois mesmo
sem um canvas montado; Ctrl+Z e refazer recuperam esses estados.

A restauração no modo dinâmico também pausa a física, preservando a posição
recuperada até uma nova alteração do grafo ou arraste.

### 3. Carregamentos concorrentes de histórico

O indicador de carregamento identifica cada pedido pelo vault e pela instância de
histórico. Respostas antigas não liberam carregamentos novos nem exibem erros em
outro vault. O bloqueio de mutações é separado do carregamento; um carregamento
antigo não pode liberar um desfazer ou exclusão ainda em andamento. Respostas após
a desmontagem são ignoradas. Uma falha de carregamento permite repetir a consulta
na próxima visita ao vault.

## Refatorações ainda propostas

### Módulos grandes e parsers repetidos

- `note-text-node/controller.ts` concentra seleção, composição, teclado, tabelas
  e formatação em aproximadamente 1.400 linhas. Extrair uma responsabilidade por
  vez, com testes de seleção, Enter, Backspace, Tab e desfazer antes de alterar o DOM.
- `ai-chat.controller.ts` reúne persistência, conexão, catálogo, eventos e envio.
  Separar sessão, armazenamento e mensagens, mantendo o isolamento por vault.
- As referências são interpretadas em diversos módulos do frontend e no Rust.
  Criar casos compartilhados para ID, título, alias, código, URLs e notas apagadas.
- Exclusão passa por verificações de salvamento no aplicativo e na biblioteca.
  Um resultado explícito de sucesso/falha no histórico evitaria inferir sucesso
  procurando novamente a nota e reduziria duplicação de tratamento de erros.

## Verificações realizadas

- **63 testes de frontend**, todos aprovados. Cobrem autosave, exclusão, grafo,
  navegação, estado por vault, snapshots e carregamentos concorrentes de histórico.
- **21 testes Rust existentes**, todos aprovados. Cobrem ferramentas MCP,
  permissões, limites, referências e isolamento dos vaults.
- Clippy com `--all-targets -- -D warnings`: aprovado.
- TypeScript, incluindo `noUnusedLocals` e `noUnusedParameters`: aprovado.
- Build do aplicativo e build/check do Astro: aprovados.
- Fluxo visual em Chromium headless, build de produção e vault fictício: abertura
  da confirmação pela lixeira, cancelamento, exclusão confirmada com retorno ao
  canvas e exclusão direta de nota vazia. Também foram validados desfazer exclusão
  feita dentro da nota nos modos estático/dinâmico e alternância A → B → A no modo
  estático, com posições preservadas. Sem exceções JavaScript nesses cenários.

Os testes de modelo usam IPC simulado e não acessam os vaults reais. O fluxo visual
não substitui validação no WebKitGTK/Fedora ou WebView2/Windows. Áudio, serviços
reais de IA, desempenho maximizado e edição rica completa não foram validados.

## Comandos

```sh
yarn test:desktop
yarn build
yarn build:web
cargo test --locked --manifest-path apps/desktop/tauri/Cargo.toml
cargo clippy --locked --manifest-path apps/desktop/tauri/Cargo.toml --all-targets -- -D warnings
```

Os testes de frontend ficam separados em `apps/desktop/test/` e não adicionam
bibliotecas de testes às dependências do aplicativo.
