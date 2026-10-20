# IA no Ômega Notes

## Usar o chat

O Chat oferece integração com Codex, Claude Code, OpenCode e Antigravity CLI, usando os CLIs
instalados na máquina. Cada provedor mantém seu próprio histórico em cada vault.

1. Instale uma versão recente do CLI escolhido e configure a conta ou o modelo nele.
   Para Claude, é necessário Claude Code 2.1.248 ou mais recente; use
   `claude auth login`. Para provedores online do OpenCode, use
   `opencode auth login` e conecte sua conta OpenCode Go ou Zen (Console).
   Para Antigravity, instale Antigravity CLI 1.4.2 ou mais recente, execute `agy` e
   entre na sua conta Google antes de conectar pelo aplicativo.
2. Abra um vault no Ômega Notes.
3. Ative **IA Features** nas configurações (vem desativado por padrão) e use o ícone de conversa na barra superior.
4. Clique em **Codex**, **Claude**, **OpenCode** ou **Antigravity**. A autenticação existente no CLI é reaproveitada.
5. Se necessário, use **Entrar**. No Codex, o login abre no navegador; no Claude,
   abre em um terminal. Depois do login do Claude, clique em atualizar a conta.
6. Escolha o modelo e as opções disponíveis no provedor. Envie sua mensagem.

Para escolher outro provedor, desative e ative novamente Recursos de IA nas
configurações e use o botão da IA desejada no Chat. Desativar o recurso encerra
as conexões e apaga os históricos de todos os provedores, conforme descrito abaixo.

Após a primeira conexão, o aplicativo lembra o provedor escolhido e reconecta
automaticamente ao abrir um vault, quando Recursos de IA estiver ativado.
O login existente do CLI escolhido é reaproveitado. Isso não abre o painel nem envia
mensagens. Se a conexão falhar, o botão Conectar permite tentar novamente.
Desativar Recursos de IA encerra a conexão, apaga os históricos, rascunhos e
preferências de chat de todos os provedores em todos os vaults e esquece o provedor
salvo para reconexão. Ao reativar, conecte novamente pelo botão.
Somente o identificador do provedor é salvo nas preferências locais, sem credenciais.

Os CLIs são localizados pelo PATH e por pastas comuns de instalação. No Windows,
as instalações globais por npm são procuradas nos prefixos do PATH e em
`%APPDATA%\npm`. O executável nativo `opencode-ai/bin/opencode.exe` é reconhecido
sem depender do Node no PATH. Para lançadores JavaScript, o Node precisa estar no PATH.
Caso o provedor não seja encontrado, confira a instalação e reinicie o Ômega Notes.
Ao abrir a tela Conectar IA, o aplicativo verifica os executáveis usando os mesmos
caminhos da conexão e desativa os botões dos CLIs não encontrados. Essa verificação
não inicia os provedores nem faz login. Reabrir o Chat atualiza a disponibilidade.

Erros de envio aparecem por três segundos acima da linha inferior do Chat.
Para OpenCode, o aviso inclui o motivo retornado pela CLI quando disponível,
com credenciais comuns ocultadas. Esses detalhes não são salvos na conversa.
O aviso distingue falha local do CLI de uma resposta de erro do serviço.
Assinatura Go ausente ou expirada só é indicada quando a resposta informa isso
explicitamente para um modelo Go. Erros de autenticação ou HTTP 403, por si só,
não confirmam falta de assinatura; o motivo original é preservado no aviso.
Saldo, pendências de cobrança, limites de uso, modelo indisponível e falhas de
rede ou do serviço também recebem mensagens específicas quando identificados.

Modelos gratuitos do catálogo OpenCode podem retornar uma recusa de acesso
ao plano gratuito. Há relatos desse erro no próprio OpenCode v2 ao usar agentes
com ferramentas bloqueadas ([relato no repositório oficial](https://github.com/anomalyco/opencode/issues/50081)).
O Ômega Notes mantém essas restrições para limitar as consultas ao vault ativo.
Por isso, o seletor da integração OpenCode mostra modelos OpenCode Go e pagos
do Zen (Console), sem os modelos gratuitos da categoria OpenCode ou de outros
provedores. A presença de um modelo no catálogo não garante acesso pela conta.
Sem modelos elegíveis disponíveis, o envio é
bloqueado com um aviso para conferir a conexão no CLI.

Enter envia a mensagem; Shift+Enter insere uma linha. Você pode continuar
escrevendo enquanto a IA responde. No Codex, enviar durante uma resposta acrescenta uma
orientação ao trabalho em andamento, usando `turn/steer`. Claude, OpenCode e Antigravity permitem
preparar o rascunho; o envio fica disponível quando a resposta termina. O botão de parar
permanece separado e cancela a resposta. Se a resposta já tiver terminado,
a mensagem inicia uma nova resposta. No cabeçalho, o X oculta o painel.

O atalho do Chat vem como Ctrl+J e pode ser alterado nas configurações, abaixo
de Recursos de IA, quando a opção estiver ativada. Clique no campo e
pressione uma tecla isolada ou uma combinação com Ctrl, Alt ou Shift.
Teclas sem Ctrl/Alt que afetam a digitação não acionam o Chat dentro de inputs
ou da edição da nota; teclas F1–F24 podem ser usadas nesses campos.
Escape cancela a escolha e Tab mantém seu comportamento próprio nas notas.
Ctrl+A permanece reservado para
selecionar todo o texto. A escolha é mantida ao desativar e reativar Recursos
de IA e ao reiniciar o aplicativo.
O atalho abre ou fecha o Chat quando Recursos de IA está ativado e há um vault
aberto. Ao abrir, o campo de mensagem recebe foco quando a conexão estiver
pronta. Ao fechar, o foco não é restaurado na nota. O atalho fica suspenso
enquanto um modal ou a instalação de atualização estiver aberto.

As referências são armazenadas como `[[ID]]` e aparecem como links sublinhados
com o título atual da nota. Clique para abrir a nota do vault atual mantendo o
chat ao lado. Renomear a nota não altera o destino do link. Para um nome de
exibição personalizado, use `[[ID|Nome de exibição]]`.
O histórico guarda também o último título conhecido das notas referenciadas.
Apagar uma nota mantém esse nome na conversa, sem link clicável; restaurar a
mesma nota reativa o link. Nomes personalizados são preservados. Esses títulos
ficam no arquivo de chat do respectivo provedor e vault, junto com as mensagens,
e são descartados quando não há mais mensagens que referenciem a nota.
Referências por título que possam ser resolvidas no vault são convertidas para
ID ao carregar ou receber mensagens e antes de salvar o histórico.

Mensagens também exibem listas numeradas, citações, texto riscado, marca-texto e
código. Trechos entre crases e blocos cercados por três crases são literais:
formatação e referências dentro deles não viram links.

O chat entra e sai pela direita. Clique novamente no ícone da barra, no botão de
fechar ou use Escape para ocultá-lo. As notas e o canvas continuam acessíveis
enquanto o painel está aberto.

## Nota aberta no contexto

Cada envio inclui o ID, o título (até 500 caracteres) e a referência da nota aberta.
No canvas, informa explicitamente que nenhuma nota está aberta. O contexto é
capturado ao enviar; trocar de nota depois não altera uma solicitação já enviada.
O título é consultado após o salvamento, para incluir uma renomeação pendente.
Isso também vale para mensagens enviadas durante uma resposta no Codex.

A IA é orientada a usar essa nota quando o pedido não especifica outra, como em
“analise esta nota”. Uma referência explícita tem prioridade. Se o pedido exigir
uma nota e o usuário estiver no canvas, a IA deve perguntar qual nota usar.
O contexto não inclui automaticamente o conteúdo: a IA o lê pelas ferramentas.
Esses dados ficam associados à mensagem no histórico do vault, sem aparecer no
balão, e permitem interpretar mensagens anteriores sem confundir com a nota atual.

## Contexto separado por vault

- No Codex, cada ID de vault possui uma thread própria no App Server. Claude,
  OpenCode e Antigravity iniciam uma sessão nova em cada envio do Chat, com o histórico recente do
  respectivo provedor e vault. Renomear o vault preserva essa associação.
- Trocar de vault solicita a interrupção da resposta anterior. Eventos atrasados
  continuam associados ao vault, à conexão e à solicitação de origem.
- As ferramentas recebem a pasta autorizada pelo Rust. A IA não pode fornecer
  outro vault nem um caminho de arquivo.
- Antes de cada leitura, o Rust verifica se o vault continua registrado e ativo.
- O host oferece dez ferramentas de consulta e uma ferramenta restrita de vinculação, com
  paginação e limites de leitura.
  Claude, OpenCode e Antigravity recebem essas ferramentas por um endpoint MCP via stdio
  do próprio executável do Ômega Notes. Cada consulta verifica novamente o vault ativo.
  As consultas não executam recuperação, limpeza ou gravação de notas.
- O acesso a ambientes do Codex é desativado (`environments: []`). Shell,
  integrações externas, plugins, memórias e outras ferramentas de ambiente também
  são desativados para essas threads. Solicitações de aprovação são recusadas.

O histórico, o rascunho e as escolhas de modelo, pensamento e velocidade são
salvos em `vaults/<ID>/ia/<provedor>.json` (por exemplo, `codex.json`). Ocultar o painel ou fechar o aplicativo
preserva esse arquivo. Desativar Recursos de IA remove os arquivos de histórico
`codex.json`, `claude.json`, `opencode.json` e `antigravity.json` de todos os vaults registrados.
Os diretórios de trabalho `claude-workspace` e `opencode-workspace`, dentro de
`ia`, também são removidos ao desativar Recursos de IA. A pasta `ia`, as notas e
as credenciais da `.key` são mantidas.
Cada vault mantém seus próprios dados enquanto Recursos de IA está ativado.

As threads do Codex continuam temporárias. Ao iniciar uma nova conexão, a primeira
mensagem inclui o histórico recente do vault: até 40 mensagens e 60 mil caracteres.
O histórico mantém até 50 mensagens, contando mensagens do usuário e respostas
da IA separadamente. Ao exceder esse total, as mais antigas são apagadas da
interface e do arquivo; arquivos maiores também são reduzidos ao serem carregados.
Claude usa `--no-session-persistence`. As sessões nativas criadas no banco do
OpenCode são excluídas ao terminar ou interromper a resposta; o identificador
em `opencode-workspace/session.json` permite repetir a limpeza se houver uma
interrupção do aplicativo. Uma falha de limpeza é apresentada no Chat e pode
impedir o próximo envio até ser resolvida. Logs e credenciais já administrados
pelos CLIs continuam sob responsabilidade desses programas. A limpeza usa
configuração isolada e mantém o registro até a CLI confirmar a exclusão.
Tokens e chaves de API não são guardados pelo Ômega Notes nessa pasta.

## Criar vínculos com ajuda da IA

Peça uma análise para receber sugestões, ou peça explicitamente para aplicar os
vínculos. Exemplo: “Analise a nota Teste e vincule as menções a outras notas
existentes neste vault”. A instrução do provedor diferencia sugerir de aplicar;
esta distinção depende da interpretação da IA, não de um classificador de comandos.

`link_note_mentions` é a única ferramenta de edição. Ela recebe `noteId`,
`revision` retornada por `read_note`, `operation` opcional (`link` por padrão,
`unlink` para remover referências) e até 100 `mentions`, cada uma com
`start`, `end` (exclusivo), `text` exato e `targetId`. Os deslocamentos contam
caracteres Unicode no texto completo retornado por `read_note`; páginas lidas com
`offset` precisam somar esse deslocamento. A IA deve ler as notas candidatas
para avaliar o contexto e a ambiguidade antes de escolher os destinos.

O Rust valida os destinos no mesmo vault, a revisão, os trechos exatos e a ausência
de sobreposição. Autorreferências à própria nota de origem são permitidas.
Na inserção, código, links existentes, URLs e partes de palavras são recusados.
Se o trecho for exatamente igual ao título atual do destino, incluindo maiúsculas
e acentos, ele vira `[[ID]]`. Caso contrário, vira `[[ID|texto original]]`,
preservando a escrita original. Títulos, mídias e outros trechos são preservados.
O MCP anuncia essa ferramenta com `readOnlyHint: false`.

A aplicação acontece pela biblioteca de notas no frontend, usando a fila normal
de salvamento. O documento em memória também precisa corresponder ao que foi
analisado: uma revisão antiga ou edição concorrente exige nova leitura e análise.
Codex encaminha a chamada diretamente ao aplicativo. Claude, OpenCode e Antigravity usam uma
ponte temporária em loopback, com porta aleatória e capacidade por solicitação,
apenas em memória. A ponte não grava notas nem aceita caminhos de arquivo.
Pedidos de outra conexão, solicitação cancelada ou vault inativo são recusados.

Após aplicar, aparece um pequeno ícone de desfazer à direita do nome da IA, na
resposta que fez a última vinculação do vault na sessão. Ele desfaz diretamente
quando os blocos afetados continuam iguais. Se houver
edições posteriores, envia um pedido à IA para reler a nota atual e desfazer
somente os vínculos daquela operação, preservando as alterações do usuário.
O balão exibe apenas “Pedido de desfazer” (traduzido conforme o idioma),
enquanto o histórico mantém o pedido completo para a IA. Essa identificação
também é salva para preservar a apresentação ao reabrir o Chat.
O rascunho do Chat é mantido. A IA recebe os destinos e rótulos daquela operação
como contexto; rótulos longos são abreviados, e ambiguidades exigem esclarecimento.
O modo `unlink` só remove uma referência interna completa fora de código,
substituindo-a pelo alias atual ou pelo título atual do destino, sem restaurar
uma cópia antiga do documento. Também exige revisão atual e trecho exato.
Desativar Recursos de IA remove esse estado de desfazer, mas mantém os links já salvos nas notas.

## Ferramentas de consulta

O catálogo e as descrições ficam em `apps/desktop/tauri/src/ai/tools/catalog.rs`.
Codex recebe esse catálogo como ferramentas dinâmicas; Claude, OpenCode e Antigravity o consultam
pelo MCP. As permissões desses dois provedores são geradas a partir do catálogo.
Todas as consultas são de leitura e usam somente o vault autorizado.
Resultados que identificam notas também incluem `reference`, com o link `[[ID]]`
pronto para copiar na resposta; fontes de links sem destino usam `sourceReference`.
As instruções compartilhadas em `ai/instructions.rs` orientam os três provedores
a usar esses links também em listas, resumos e confirmações, em vez de apenas nomes em negrito.

| Ferramenta | Consulta e limites |
|---|---|
| `list_notes` | Lista IDs, títulos e prévias; 100 notas por página. |
| `search_notes` | Busca em títulos e textos; 20 resultados por página, com trecho do conteúdo encontrado e seu deslocamento em caracteres. |
| `read_note` | Lê até 16 mil caracteres de uma nota. |
| `read_notes` | Lê até oito notas distintas; até 4 mil caracteres por nota, com erros individuais e continuação pela leitura de uma nota. |
| `read_study_context` | Consulta o snapshot preparado para geração ou avaliação: manifesto de fontes e atribuições, 50 fontes por página, ou conteúdo de uma fonte em páginas de até 16 mil caracteres Unicode. Usa `sourceId` local, como `N1`, na leitura e nas citações. É anunciada somente nas tarefas de estudo, sem aparecer no Chat comum. Fora de uma solicitação preparada, não disponibiliza contexto. |
| `list_note_connections` | Lista referências de entrada, saída ou ambas, sem duplicatas; 100 notas por página. |
| `get_vault_overview` | Conta notas legíveis, referências direcionadas, conexões únicas, notas isoladas e links sem destino. |
| `get_note_outline` | Lista títulos Markdown h1–h6, com nível, linhas e `sectionId`; 100 títulos por página. |
| `read_note_section` | Lê uma seção pelo `sectionId`, incluindo os subtítulos, até o próximo título de nível igual ou superior; até 16 mil caracteres. O ID zero lê a introdução. |
| `find_unresolved_links` | Lista links para notas ausentes, com ID/título da origem e destino escrito; permite filtrar a origem por `noteId`, com 100 resultados por página. |
| `find_connection_path` | Encontra um caminho mínimo entre duas notas, considerando ambas as direções ou somente as saídas; profundidade padrão de 12 conexões e máxima de 32. |

Consultas paginadas usam `offset` e retornam `nextOffset`; valor nulo indica o fim.
Deslocamentos de texto contam caracteres Unicode. A busca retorna `snippetOffset`
para continuar a leitura perto do resultado. IDs de seção são específicos da versão
atual do texto: consulte novamente o sumário depois de editar uma nota.

Conexões reconhecem destinos por ID ou título e apelidos `[[destino|nome]]`, ignorando
referências dentro de código e a própria nota. Links inexistentes são listados pela
ferramenta de referências sem destino. Consultas do grafo e de listagem informam
`unreadableNotes` quando há arquivos que não puderam ser lidos; os resultados podem
estar incompletos. Na busca de caminhos, `depthLimited` indica que a profundidade
máxima impediu explorar todas as possibilidades.

Rótulos de títulos de seção e destinos sem referência são limitados a 600 caracteres,
com `titleTruncated` ou `targetTruncated` indicando cortes. A leitura da seção ou
da nota de origem permite consultar o conteúdo completo.

Os testes geram vaults temporários e ficam em `apps/desktop/tauri/test/ai_tools.rs`
e `apps/desktop/tauri/test/ai_provider_tools.rs`:

```sh
CCACHE_DIR=/tmp/omega-notes-ccache cargo test --locked --manifest-path apps/desktop/tauri/Cargo.toml --lib
```

## Dados e conta

Dados comuns do Chat ficam em `vaults/<ID>/ia`. A pasta `.key`, na raiz de dados
do aplicativo, ao lado de `vaults` e `vaults.json`, fica reservada a credenciais
que o próprio aplicativo venha a administrar. No Linux, seu acesso é restrito
ao usuário proprietário (`0700`). O nome oculto da pasta não implica criptografia.

Cada CLI administra sua autenticação. O Ômega Notes não pede chaves de API na
interface. O Codex usa a conta ChatGPT, o Claude usa a conta
configurada no Claude Code e o OpenCode usa o provedor/modelo configurado nele.
O Antigravity usa a autenticação existente do `agy`, normalmente pelo keyring
seguro do sistema. Seu runtime temporário fica protegido fora do vault; caches
legados conhecidos, quando presentes, são copiados apenas para esse runtime e
removidos após a solicitação.

Esta integração consulta textos e produz respostas. Criar ou editar notas por IA
exigirá um fluxo próprio de revisão e confirmação das alterações.

## Código

- `apps/desktop/src/entities/ai`: tipos comuns de modelos, provedores e conversas.
- `apps/desktop/src/features/chat-with-ai`: estado das conversas e painel lateral genérico.
- `apps/desktop/src/features/chat-with-ai/api/ai-provider.ts`: contrato para integrações de IA.
- `apps/desktop/src/features/chat-with-ai/api/providers/codex.ts`: adaptador específico do Codex.
- `apps/desktop/src/features/chat-with-ai/api/chat.repository.ts`: armazenamento comum dos dados do Chat.
- `apps/desktop/src/app`: compõe a feature com o vault ativo e o salvamento pendente.
- `apps/desktop/tauri/src/ai/commands.rs`: comandos IPC; trabalho bloqueante fora da interface.
- `apps/desktop/tauri/src/ai/state.rs`: estado e encerramento da conexão de IA.
- `apps/desktop/tauri/src/ai/providers/codex.rs`: processo `codex app-server`, JSON-RPC, threads e eventos.
- `apps/desktop/tauri/src/ai/providers/cli.rs`: conexões Claude/OpenCode/Antigravity, sessões, respostas e cancelamento.
- `apps/desktop/tauri/src/ai/providers/antigravity.rs`: autenticação existente, modelos, configuração isolada, MCP e erros do Antigravity CLI.
- `apps/desktop/tauri/src/ai/providers/claude.rs`: validação de versão, autenticação, comando restrito e identificação dos erros do Claude.
- `apps/desktop/tauri/src/ai/providers/process.rs`: descoberta dos CLIs e controle dos processos.
- `apps/desktop/tauri/src/ai/providers/protocol.rs`: normalização dos eventos dos provedores.
- `apps/desktop/tauri/src/ai/mcp.rs`: consultas de notas por MCP, restritas ao vault autorizado.
- `apps/desktop/tauri/src/ai/repository.rs`: leitura e gravação atômica dos dados de IA por vault.
- `apps/desktop/tauri/src/ai/tools.rs`: resolução do vault, validação e despacho das consultas.
- `apps/desktop/tauri/src/ai/tools/`: catálogo, leitura, seções, consultas ao grafo e validação de vínculos.
- `apps/desktop/tauri/src/ai/link_requests.rs`: aplicação pelo frontend e ponte temporária para processos MCP.

Na integração Codex, não é aberto um servidor HTTP. As ferramentas são registradas diretamente no
App Server por `dynamicTools`, uma API experimental. A implementação segue o
esquema gerado pelo Codex CLI **0.162.1** instalado no ambiente de desenvolvimento.
Versões antigas podem exigir atualização do CLI.

Referência: [Codex App Server](https://learn.chatgpt.com/docs/app-server).

## Modelo, pensamento e Fast

Os controles usam as opções anunciadas pelo Codex para o modelo selecionado.
Cada vault mantém suas próprias escolhas no arquivo de IA. Ao trocar de modelo,
o pensamento volta ao padrão do novo modelo e Fast é desativado.

Fast fica desativado por padrão e só pode ser habilitado quando o modelo anuncia
suporte (`fast` ou `priority` no catálogo do Codex). Esse modo aumenta o consumo dos limites da conta: consulte a
[documentação de velocidade do Codex](https://learn.chatgpt.com/docs/agent-configuration/speed).

### Claude e OpenCode

Claude oferece os aliases Default, Sonnet, Opus e Haiku. Sonnet e Opus oferecem
os níveis low, medium e high; a disponibilidade efetiva depende da conta e do
modelo resolvido pelo CLI. Default não força um modelo; o CLI resolve o padrão
disponível para a conta e o ambiente.
Falhas de conexão ao servidor de ferramentas de notas recebem um aviso
específico e interrompem a solicitação antes de uma resposta sem acesso ao vault.
A listagem de modelos exige OpenCode CLI v2. O catálogo vem de `opencode models --standalone`,
filtrado para incluir IDs `opencode-go/` e os modelos pagos de `opencode/` (Zen).
Modelos `opencode/` com sufixo `-free` e Big Pickle são ocultados. A lista não é limitada aos
primeiros 500 modelos e não contém uma opção Default artificial.
Os envios usam `opencode run --standalone --format json`, com um servidor
privado, configuração v2 e o diretório do vault definido explicitamente.
O agente usa `agents.omega.system`, permissões ordenadas e `mcp.servers.omega`,
com Code Mode desativado para disponibilizar diretamente as ferramentas de consulta de notas.
Fast fica indisponível nesses dois adaptadores. No OpenCode, os seletores de
pensamento e velocidade são ocultados, deixando somente o modelo.

Claude exige CLI 2.1.248 ou mais recente para usar modo restrito (`--restricted`), preservando o login da assinatura,
sem ferramentas nativas e com MCP restrito ao servidor do Ômega Notes. Fontes
de configurações do usuário/projeto, hooks, comandos personalizados e memória
automática são desativados nessa sessão. OpenCode usa um agente próprio, com permissões apenas
para essas ferramentas. A configuração de provedores e modelos é reaproveitada;
instruções, agentes, plugins e outros servidores MCP globais ficam fora da conversa.

Referências: [CLI Claude Code](https://code.claude.com/docs/en/cli-reference),
[CLI OpenCode v2](https://opencode.ai/v2/docs/cli/commands/) e
[MCP no OpenCode v2](https://opencode.ai/v2/docs/mcp-servers).


### Antigravity CLI

O provedor usa o executável nativo `agy` (mínimo 1.4.2). Instale o CLI oficial,
abra `agy` no terminal e autentique sua conta antes de conectar no Omega.
A instalação é detectada pelo PATH e pelos diretórios usuais, incluindo
`~/.local/bin` no Linux e `%LOCALAPPDATA%/agy/bin` no Windows.

O Chat lista os modelos retornados por `agy models`. O item Default deixa o CLI
resolver seu modelo padrão. Se a consulta não estiver disponível, Default continua
selecionável e a solicitação real apresenta o erro de autenticação, cota ou rede.
Assim como no OpenCode, a conexão local não prova a validade da conta: ela é
verificada pelo CLI ao enviar a solicitação. Não é feita uma pergunta de teste.
O modelo escolhido no Chat também vale para gerar e avaliar os cinco estudos.

Cada pedido inicia um processo novo com entrada e saída `stream-json`. O prompt
é enviado como um evento `user` por stdin; `step_update` fornece fragmentos e
`result` fornece a resposta final autoritativa. Status diferentes de SUCCESS,
respostas vazias e streams incompletos não são aceitos como respostas concluídas.
O Chat inclui apenas o histórico recente do próprio provedor/vault; estudos
recebem seus snapshots sem o histórico do Chat.

O runtime fica em `.key/antigravity/<vaultId>/`, com um diretório de estado
exclusivo passado ao CLI pelo argumento nativo de diretório de estado.
Somente o MCP omega é configurado ali. Um agente omega contém as instruções da
finalidade do pedido e não recebe ferramentas nativas; permissões bloqueiam
arquivos, comandos e navegação. Um hook PreToolUse valida o nome de cada ferramenta
e permite apenas o catálogo MCP dessa finalidade. O servidor Rust também valida
vault, solicitação e autorização em cada chamada. Configurações, MCPs, hooks e
históricos pessoais não são importados. A autenticação usa o keyring do sistema;
um cache legado específico do CLI, quando presente, é copiado apenas para o
runtime protegido. Os dados temporários são limpos ao concluir ou cancelar.
O histórico do Chat fica em `ia/antigravity.json` no vault.

Pensamento e velocidade não aparecem no seletor desse provedor.

Referências oficiais: [headless e streaming](https://www.antigravity.google/docs/cli/headless/),
[MCP](https://www.antigravity.google/docs/mcp?tab=cli),
[agentes](https://www.antigravity.google/docs/subagents/) e
[hooks](https://www.antigravity.google/docs/hooks/). Flags e versão também foram
conferidas no binário oficial 1.4.2, baixado apenas para `/tmp`, com SHA-512
verificado pelo manifesto do instalador. Não foi feita uma solicitação de IA
nem um login neste ambiente. A comunicação local do CLI usa sockets, bloqueados
pelo sandbox deste ambiente, portanto o fluxo completo requer validação no app.

## Modo Gambiarra: terminal no vault

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

Com Recursos de IA desativados, segurar o controle por cinco segundos ativa o
modo Gambiarra. A preferência é salva nesta instalação e o controle passa a
mostrar Gambiarra. Desligá-lo retorna a Recursos de IA desativados; o clique curto
no controle original continua habilitando a integração normal.

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
o histórico ou as credenciais do CLI. Esse vínculo permanece ao reiniciar o app
ou alternar o modo Gambiarra. Conversas de provedores ou vaults diferentes usam
arquivos separados; o Chat da integração normal não usa esses arquivos.

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
normal. Os estudos usam a ponte por arquivos descrita abaixo, sem adaptador de
provedor ou interpretação da saída visual do terminal.

### Estudos usando o CLI

Os cinco métodos ficam disponíveis também em Gambiarra. Ao iniciar uma geração,
o app salva as edições, prepara o mesmo snapshot de fontes da integração normal e
cria `ia/gambiarra/requests/<requestId>/` com `request.md`, `manifest.json` e
fontes completas `N1.txt`, `N2.txt` etc. O botão **Copiar pedido para o CLI** copia
uma instrução para a IA ler esses arquivos. No modal, esse botão também abre a
lateral; o usuário cola o pedido no CLI de IA iniciado ali, não no shell.
No terminal, apenas o botão de copiar fica acima da área de texto. O botão
**Confirmar** no rodapé fecha o Chat e reabre o método de estudo responsável pelo
pedido, preservando seu estado. Ele continua disponível após receber a resposta
ou uma falha; confirmar antes da conclusão apenas retorna à tela ainda em espera.

O CLI grava `response.json` com `{requestId, result}` (ou `{requestId, error}`),
usando temporário e renomeação para publicar o arquivo completo. O app consulta
também respostas no formato JSON direto da tarefa, desde que gravadas no diretório
do pedido ativo; um `requestId` explícito diferente é recusado. O último arquivo
recebido fica em `ia/gambiarra/last-response.json`, limitado ao mesmo tamanho, para
diagnosticar respostas rejeitadas depois da limpeza do pedido. O app consulta
a resposta a cada 800 ms, sem sobrepor leituras, por até nove minutos. Cada leitura
e gravação de disco usa `spawn_blocking`; não existe uma thread ocupada esperando
o usuário ou interpretando a tela da PTY. A resposta inteira é limitada a 1.024.000
bytes, precisa corresponder ao pedido e passa pelos validadores atuais do estudo.
Na avaliação, as fontes em disco também são conferidas antes de aceitar o parecer.

A seleção Geral/Nicho, as referências, os lotes de até cinco itens, as três
tentativas e a quantidade exata continuam iguais. Um lote seguinte ou uma nova
avaliação produz outro pedido para copiar; não há envio automático ao CLI aberto.
Redação/Lacunas mantêm a fila de correções e deixam responder às próximas questões;
ao final, aguardam os pareceres e exibem o relatório. Sessões e progresso continuam
no armazenamento normal em `ia/studies/`, gravados pelo app.

Fechar apenas o modal ou o Chat mantém o pedido pendente. Cancelar/Home, mudar de
vault ou desabilitar Gambiarra cancela a espera e remove o pedido temporário. O
cancelamento do pedido não interrompe por si só uma IA que já esteja processando
no CLI; ela deve ignorar um diretório de pedido removido. Os arquivos são excluídos
também ao consumir uma resposta ou expirar a espera. Encerramento forçado do processo
pode deixar arquivos temporários de pedidos antigos; eles não são retomados.

O aplicativo não salva uma transcrição desse terminal; seu buffer visual conserva
até três mil linhas. Arquivos e sessões que o CLI salvar seguem o armazenamento
do próprio programa. A saída usa confirmação de consumo e uma janela de fluxo
limitada para conter o volume de mensagens em espera no WebView. Entrada, leitura,
redimensionamento e liberação de handles de PTY são processados fora da thread da
interface; operações curtas de estado e confirmação de consumo permanecem síncronas.

Referências da implementação: [xterm.js](https://xtermjs.org/docs/guides/using-addons/)
e [portable-pty](https://docs.rs/portable-pty/0.9.0/portable_pty/).
