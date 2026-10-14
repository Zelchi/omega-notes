# IA no Ômega Notes

## Usar o chat

O Chat oferece integração com Codex, Claude Code e OpenCode, usando os CLIs
instalados na máquina. Cada provedor mantém seu próprio histórico em cada vault.

1. Instale uma versão recente do CLI escolhido e configure a conta ou o modelo nele.
   Para Claude, use `claude auth login`; para provedores online do OpenCode, use
   `opencode auth login`. Modelos gratuitos ou locais do OpenCode podem dispensar login.
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

Enter envia a mensagem; Shift+Enter insere uma linha. Você pode continuar
escrevendo enquanto a IA responde. No Codex, enviar durante uma resposta acrescenta uma
orientação ao trabalho em andamento, usando `turn/steer`. Claude e OpenCode permitem
preparar o rascunho; o envio fica disponível quando a resposta termina. O botão de parar
permanece separado e cancela a resposta. Se a resposta já tiver terminado,
a mensagem inicia uma nova resposta. No cabeçalho, o X oculta o painel.

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
- O host oferece `list_notes`, `search_notes` e `read_note`, com paginação.
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
pelos CLIs continuam sob responsabilidade desses programas.
Tokens e chaves de API não são guardados pelo Ômega Notes nessa pasta.

## Dados e conta

Dados comuns do Chat ficam em `vaults/<ID>/ia`. A pasta `.key`, na raiz de dados
do aplicativo, ao lado de `vaults` e `vaults.json`, fica reservada a credenciais
que o próprio aplicativo venha a administrar. No Linux, seu acesso é restrito
ao usuário proprietário (`0700`). O nome oculto da pasta não implica criptografia.

Cada CLI administra sua autenticação. O Ômega Notes não copia os tokens nem
armazena chaves de API. O Codex usa a conta ChatGPT, o Claude usa a conta
configurada no Claude Code e o OpenCode usa o provedor/modelo configurado nele.
No OpenCode, o processamento pode ser local ou online, conforme o modelo.
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
- `apps/desktop/tauri/src/ai/providers/process.rs`: descoberta dos CLIs e controle dos processos.
- `apps/desktop/tauri/src/ai/providers/protocol.rs`: normalização dos eventos dos provedores.
- `apps/desktop/tauri/src/ai/mcp.rs`: consultas de notas por MCP, restritas ao vault autorizado.
- `apps/desktop/tauri/src/ai/repository.rs`: leitura e gravação atômica dos dados de IA por vault.
- `apps/desktop/tauri/src/ai/tools.rs`: resolução do vault e consultas de notas.

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
modelo resolvido pelo CLI. Default preserva a escolha configurada no Claude Code.
O catálogo do OpenCode vem de `opencode models`, incluindo modelos locais
configurados. Default preserva o modelo configurado no CLI.
Fast fica indisponível nesses dois adaptadores; pensamento fica indisponível
no OpenCode enquanto seu catálogo não fornece essas capacidades à integração.

Claude usa modo restrito (`--restricted`), preservando o login da assinatura,
sem ferramentas nativas e com MCP restrito ao servidor do Ômega Notes. Fontes
de configurações do usuário/projeto, hooks, comandos personalizados e memória
automática são desativados nessa sessão. OpenCode usa um agente próprio, com permissões apenas
para essas ferramentas. A configuração de provedores e modelos é reaproveitada;
instruções, agentes, plugins e outros servidores MCP globais ficam fora da conversa.

Referências: [CLI Claude Code](https://code.claude.com/docs/en/cli-reference),
[CLI OpenCode](https://opencode.ai/docs/cli/) e
[MCP no OpenCode](https://opencode.ai/docs/mcp-servers/).
