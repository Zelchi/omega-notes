# Modo Gambiarra: terminal no vault

Ao habilitar o modo, o aplicativo instala um manual `AGENTS.md` na raiz do vault
ativo, com os formatos de notas, links por ID, mídia e sessões dos cinco métodos
de estudo. Esse é o único manual instalado pelo aplicativo para os quatro CLIs.
Para leitura automática pelo Claude Code, use a versão 2.1.277 ou mais recente,
com suporte a AGENTS.md habilitado e sem instruções de projeto que tenham precedência.
A instalação ocorre
mesmo sem abrir o Chat, e o terminal aguarda sua conclusão antes de iniciar.
Trocar de vault remove as instruções gerenciadas do anterior e instala as do novo;
desabilitar Gambiarra remove as instruções. Fechar apenas o Chat não as remove.
Arquivos existentes recebem uma seção delimitada: ao desativar, o texto do usuário
é preservado e arquivos contendo somente a seção gerenciada são apagados.
O trabalho de disco ocorre em `spawn_blocking`, com atualizações serializadas.

O manual orienta a edição direta dos arquivos e o protocolo de estudos por arquivos.
O terminal não recebe continuamente qual nota está aberta na interface; os pedidos
de estudo incluem apenas as fontes selecionadas para aquela tarefa.

### Sincronização de arquivos e retomada

Com Gambiarra habilitado, a interface verifica as revisões dos arquivos a cada
2 segundos e ao recuperar o foco. Uma revisão estável em duas verificações permite
reler o vault sem restaurar backups ou limpar mídias durante a sincronização.
Notas sem alterações locais são atualizadas, e criações/exclusões externas são
refletidas na biblioteca. Ao trocar de vault, o app relê os arquivos em vez de
reaproveitar o cache antigo.

O editor conserva a versão carregada de cada nota. Antes de salvar, o backend
confere o vault, o título e o documento dessa versão contra o arquivo atual.
Quando divergem, bloqueia o salvamento e mantém a edição local: o usuário pode
carregar a versão do arquivo ou guardar a edição como nova nota. Essa é uma
checagem otimista de conteúdo; um CLI que escreve diretamente não participa de
uma transação de salvamento com o app.

Os callbacks de retomada do Antigravity usam um bloqueio de arquivo do sistema
operacional, compartilhado pela preparação do terminal e pelos processos helpers.
O bloqueio é liberado ao encerrar o processo, inclusive em falhas. SessionStart e
PreInvocation atualizam a conversa principal; parentConversationId e
rootConversationId identificam callbacks delegados, que são ignorados. O runId
impede que callbacks de uma execução antiga substituam a execução seguinte.
Não são copiados históricos nem armazenadas as mensagens dos callbacks.

O modo continua experimental. O fluxo autenticado e o comportamento de processos
no Windows requerem validação manual nas plataformas de destino.

Há testes de regressão da biblioteca de notas em `test/notes-external.test.mjs`
(frontend), incluindo leitura atrasada após salvar, cópia de conflito, descarte
de rascunho, mudanças externas e retorno ao vault. Testes Rust verificam gravação
com revisão esperada, preservação de backup, troca da conversa principal e rejeição
de callbacks antigos. O bloqueio de sessão também é exercitado com dois processos
separados. Esses testes não iniciam uma conversa autenticada com o provedor.

Nas configurações de IA, o Modo Gambiarra aparece abaixo de Recursos de IA. Ao
solicitar a ativação, o app abre um modal de aviso sobre as configurações; o modo
só é ativado após a confirmação. O aviso informa que o modo é experimental e que
o CLI escolhido pode alterar arquivos do vault ativo. A preferência é salva nesta
instalação. Os modos são mutuamente exclusivos: ativar Recursos de IA desativa o
Modo Gambiarra.

Neste modo, o botão e o atalho do Chat abrem um terminal interativo na lateral.
Ele inicia o shell padrão do sistema na raiz do vault ativo, acima da pasta
`notes`. Na primeira abertura após ativar o modo, escolha Codex, Claude, OpenCode
ou Antigravity. Só depois da escolha a sessão é criada, e o shell inicia o
comando correspondente (`codex`, `claude`, `opencode` ou `agy`). A escolha vale
enquanto o modo estiver ativo, inclusive ao trocar de vault; desligar e ativar
novamente ou reiniciar o aplicativo permite escolher outro CLI.
A tela consulta a mesma detecção de instalação da integração normal e deixa
desativados os botões dos CLIs não encontrados. A consulta é refeita ao reabrir
o Chat enquanto nenhum CLI foi escolhido; durante a consulta, os botões ficam
desativados. Se a consulta falhar, um aviso informa o problema.
O terminal inicia o executável ou ponto de entrada npm encontrado por essa
detecção, com os argumentos escapados para o shell. Assim, instalações localizadas
fora do PATH também podem iniciar. Aberturas e fechamentos compartilham uma fila,
incluindo o período de espera pela instalação do manual do vault.
O backend também exige instruções ativas nesse vault antes de abrir o terminal;
desativar o modo invalida preparações pendentes. Redimensionamentos usam uma fila
com a dimensão mais recente, para que respostas fora de ordem não desajustem o CLI.
Fechar e reabrir a lateral preserva a sessão, sem iniciar o comando novamente.
Ao sair normalmente do CLI, a lateral fecha automaticamente. Reabri-la retoma a
conversa do mesmo CLI escolhido. Falhas de inicialização e encerramentos
com erro permanecem visíveis com a opção de reiniciar.
No Unix, `exec` substitui o shell inicial pelo CLI após carregar seu ambiente;
no Windows, `cmd /S /C call` aguarda inclusive os executáveis instalados via npm.
O aplicativo acompanha o término do processo, sem procurar textos na saída.
A seleção inicia o aplicativo de terminal; a autenticação continua sendo a do
próprio CLI, sem passar pelos adaptadores da integração normal.

O vínculo da conversa fica em `.key/terminal-sessions/<vaultId>/<provedor>.json`
na pasta de dados do aplicativo. São salvos o ID e o diretório do vault, sem copiar
o histórico ou as credenciais do CLI. Ele permanece ao reiniciar o app enquanto
Gambiarra continuar ativado. Desativar Gambiarra apaga os vínculos de todos os
vaults; ao reativar, o Ômega inicia uma conversa nova. Isso esquece a associação
mantida pelo Ômega, mas não apaga o histórico que o próprio CLI eventualmente
salvou. Conversas de provedores ou vaults diferentes usam arquivos separados; o
Chat da integração normal não usa esses arquivos.

Claude inicia uma conversa com `--session-id` e usa `--resume <id>` quando ela
já existe. OpenCode v2 usa `--session <id>`, que também cria a conversa quando
necessário. O Antigravity usa seus eventos SessionStart e PreInvocation para informar o ID real ao
Omega. Um hook gerenciado em `.agents/hooks.json` conserva outros hooks do usuário;
a entrada do Omega é removida ao desligar o modo ou trocar de vault. A retomada
usa `agy --conversation <id>` quando a conversa ainda existe no CLI. O hook
valida o UUID e o diretório do vault antes de persistir o vínculo; não lê a
transcrição da conversa.

Codex recebe um originator próprio do vault. Ao encerrar e antes de reabrir,
uma leitura limitada dos metadados locais identifica o rollout desse originator
e diretório e guarda seu ID. A retomada usa `codex resume <id>`, sem selecionar
a última conversa global. O rollout previamente vinculado também é considerado
quando estiver fora da janela da busca limitada. Se o arquivo deixou de existir,
o terminal inicia uma conversa nova. As operações de disco ficam em workers;
a inicialização valida novamente a revisão do vault antes de abrir a PTY.

O terminal usa xterm.js e uma PTY nativa via `portable-pty` (Unix/ConPTY).
O redimensionamento do painel atualiza as linhas e colunas da PTY. Tab, Ctrl+C,
Escape, Ctrl+F e Ctrl+P permanecem disponíveis para o shell/CLI; o atalho configurado
do Chat continua abrindo e fechando a lateral. Ao abrir, o foco vai ao terminal.

Fechar apenas a lateral preserva a sessão e a saída em memória. Trocar de vault,
desabilitar o modo ou encerrar o aplicativo encerra a sessão; a próxima abre na
pasta do novo vault. Excluir o vault também libera o terminal antes da remoção
do diretório. Se o shell encerrar ou ocorrer falha, o painel oferece reinício.

Esse é um terminal local normal: permissões, autenticação, histórico e regras de
contexto do programa executado seguem o próprio CLI. O diretório inicial e a
separação de sessões são definidos pelo aplicativo; isso não cria um sandbox de
arquivos. O terminal não recebe automaticamente as ferramentas MCP da integração
normal. Os estudos usam a [ponte por arquivos](study-notes.md), sem
adaptador de provedor ou interpretação da saída visual do terminal.

Referências da implementação: [xterm.js](https://xtermjs.org/docs/guides/using-addons/)
e [portable-pty](https://docs.rs/portable-pty/0.9.0/portable_pty/).

