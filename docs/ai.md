# IA no Ômega Notes

## Usar o chat

O Chat oferece integração com Codex, Claude Code e OpenCode, usando os CLIs
instalados na máquina. Cada provedor mantém seu próprio histórico em cada vault.

1. Instale uma versão recente do CLI escolhido e configure a conta ou o modelo nele.
   Para Claude, é necessário Claude Code 2.1.248 ou mais recente; use
   `claude auth login`. Para provedores online do OpenCode, use
   `opencode auth login` e conecte sua conta OpenCode Go ou Zen (Console).
2. Abra um vault no Ômega Notes.
3. Ative **IA Features** nas configurações (vem desativado por padrão) e use o ícone de conversa na barra superior.
4. Clique em **Codex**, **Claude** ou **OpenCode**. A autenticação existente no CLI é reaproveitada.
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
as instalações globais por npm também são reconhecidas quando o Node está no PATH.
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
orientação ao trabalho em andamento, usando `turn/steer`. Claude e OpenCode permitem
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

## Contexto separado por vault

- No Codex, cada ID de vault possui uma thread própria no App Server. Claude e
  OpenCode iniciam uma sessão nova em cada envio, com o histórico recente do
  respectivo provedor e vault. Renomear o vault preserva essa associação.
- Trocar de vault solicita a interrupção da resposta anterior. Eventos atrasados
  continuam associados ao vault, à conexão e à solicitação de origem.
- As ferramentas recebem a pasta autorizada pelo Rust. A IA não pode fornecer
  outro vault nem um caminho de arquivo.
- Antes de cada leitura, o Rust verifica se o vault continua registrado e ativo.
- O host oferece as dez ferramentas descritas em **Ferramentas de consulta**, com
  paginação e limites de leitura.
  Claude e OpenCode recebem essas ferramentas por um endpoint MCP via stdio
  do próprio executável do Ômega Notes. Cada consulta verifica novamente o vault ativo.
  As consultas não executam recuperação, limpeza ou gravação de notas.
- O acesso a ambientes do Codex é desativado (`environments: []`). Shell,
  integrações externas, plugins, memórias e outras ferramentas de ambiente também
  são desativados para essas threads. Solicitações de aprovação são recusadas.

O histórico, o rascunho e as escolhas de modelo, pensamento e velocidade são
salvos em `vaults/<ID>/ia/<provedor>.json` (por exemplo, `codex.json`). Ocultar o painel ou fechar o aplicativo
preserva esse arquivo. Desativar Recursos de IA remove os arquivos de histórico
`codex.json`, `claude.json` e `opencode.json` de todos os vaults registrados.
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

## Ferramentas de consulta

O catálogo e as descrições ficam em `apps/desktop/tauri/src/ai/tools/catalog.rs`.
Codex recebe esse catálogo como ferramentas dinâmicas; Claude e OpenCode o consultam
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

Cada CLI administra sua autenticação. O Ômega Notes não copia os tokens nem
armazena chaves de API. O Codex usa a conta ChatGPT, o Claude usa a conta
configurada no Claude Code e o OpenCode usa o provedor/modelo configurado nele.
Na integração OpenCode, os modelos apresentados são do Go e do Zen (Console),
com processamento online.
Mensagens e textos consultados são enviados ao serviço; mídia não é enviada por
essas ferramentas. As notas são salvas antes de enviar uma pergunta.

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
- `apps/desktop/tauri/src/ai/providers/cli.rs`: conexões Claude/OpenCode, sessões, respostas e cancelamento.
- `apps/desktop/tauri/src/ai/providers/claude.rs`: validação de versão, autenticação, comando restrito e identificação dos erros do Claude.
- `apps/desktop/tauri/src/ai/providers/process.rs`: descoberta dos CLIs e controle dos processos.
- `apps/desktop/tauri/src/ai/providers/protocol.rs`: normalização dos eventos dos provedores.
- `apps/desktop/tauri/src/ai/mcp.rs`: consultas de notas por MCP, restritas ao vault autorizado.
- `apps/desktop/tauri/src/ai/repository.rs`: leitura e gravação atômica dos dados de IA por vault.
- `apps/desktop/tauri/src/ai/tools.rs`: resolução do vault, validação e despacho das consultas.
- `apps/desktop/tauri/src/ai/tools/`: catálogo, leitura, seções e consultas ao grafo.

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
