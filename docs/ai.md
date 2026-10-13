# IA no Ômega Notes

## Usar o chat

O Chat tem uma estrutura comum para provedores de IA. Atualmente, a integração
disponível é o Codex; Claude e OpenCode ainda não estão implementados.

1. Instale uma versão recente do Codex CLI e entre com sua conta ChatGPT.
2. Abra um vault no Ômega Notes.
3. Ative **IA Features** nas configurações (vem desativado por padrão) e use o ícone de conversa na barra superior.
4. Clique em o botão **Codex**. A conta já autenticada no CLI é reaproveitada.
5. Se necessário, use **Entrar** e conclua o login no navegador.
6. Escolha o modelo, o nível de pensamento e, quando disponível, Fast. Envie sua mensagem.

Após a primeira conexão, o aplicativo lembra o provedor escolhido e reconecta
automaticamente ao abrir um vault, quando Recursos de IA estiver ativado.
O login existente do Codex é reaproveitado. Isso não abre o painel nem envia
mensagens. Se a conexão falhar, o botão Conectar permite tentar novamente.
Desativar Recursos de IA encerra a conexão, apaga os históricos, rascunhos e
preferências de chat de todos os provedores em todos os vaults e esquece o provedor
salvo para reconexão. Ao reativar, conecte novamente pelo botão.
Somente o identificador do provedor é salvo nas preferências locais, sem credenciais.

O Codex é localizado automaticamente pelo PATH e pelas pastas comuns de
instalação. Caso não seja encontrado, confira a instalação do Codex CLI e
reinicie o Ômega Notes.

Enter envia a mensagem; Shift+Enter insere uma linha. O botão de interrupção
cancela a resposta. No cabeçalho, o X oculta o painel.

Referências como `[[Nome da nota]]` aparecem como links sublinhados no chat.
Clique para abrir a nota do vault atual mantendo o chat ao lado. Também são aceitas
referências por ID e com um nome de exibição, como `[[ID|Nome da nota]]`.

O chat entra e sai pela direita. Clique novamente no ícone da barra, no botão de
fechar ou use Escape para ocultá-lo. As notas e o canvas continuam acessíveis
enquanto o painel está aberto.

## Contexto separado por vault

- Cada ID de vault possui uma thread própria no App Server e um histórico próprio
  na interface. Renomear o vault preserva essa associação.
- Trocar de vault solicita a interrupção da resposta anterior. Eventos atrasados
  continuam associados ao vault, à conexão e à solicitação de origem.
- As ferramentas recebem a pasta autorizada pelo Rust. A IA não pode fornecer
  outro vault nem um caminho de arquivo.
- Antes de cada leitura, o Rust verifica se o vault continua registrado e ativo.
- O host oferece `list_notes`, `search_notes` e `read_note`, com paginação.
  As consultas não executam recuperação, limpeza ou gravação de notas.
- O acesso a ambientes do Codex é desativado (`environments: []`). Shell,
  integrações externas, plugins, memórias e outras ferramentas de ambiente também
  são desativados para essas threads. Solicitações de aprovação são recusadas.

O histórico, o rascunho e as escolhas de modelo, pensamento e velocidade são
salvos em `vaults/<ID>/ia/<provedor>.json` (por exemplo, `codex.json`). Ocultar o painel ou fechar o aplicativo
preserva esse arquivo. Desativar Recursos de IA remove os arquivos de histórico
`codex.json`, `claude.json` e `opencode.json` de todos os vaults registrados.
A pasta `ia`, as notas e as credenciais da `.key` são mantidas.
Cada vault mantém seus próprios dados enquanto Recursos de IA está ativado.

As threads do Codex continuam temporárias. Ao iniciar uma nova conexão, a primeira
mensagem inclui o histórico recente do vault: até 40 mensagens e 60 mil caracteres.
O histórico mantém até 50 mensagens, contando mensagens do usuário e respostas
da IA separadamente. Ao exceder esse total, as mais antigas são apagadas da
interface e do arquivo; arquivos maiores também são reduzidos ao serem carregados.
Tokens e chaves de API
não são guardados nessa pasta.

## Dados e conta

Dados comuns do Chat ficam em `vaults/<ID>/ia`. A pasta `.key`, na raiz de dados
do aplicativo, ao lado de `vaults` e `vaults.json`, fica reservada a credenciais
que o próprio aplicativo venha a administrar. No Linux, seu acesso é restrito
ao usuário proprietário (`0700`). O nome oculto da pasta não implica criptografia.

O Codex administra a autenticação. O Ômega Notes não copia os tokens nem armazena
chaves de API.
O processamento usa o serviço online do Codex e os limites da conta ChatGPT.
Mensagens e textos consultados são enviados ao serviço; mídia não é enviada por
essas ferramentas. As notas são salvas antes de enviar uma pergunta.

Esta integração consulta textos e produz respostas. Criar ou editar notas por IA
exigirá um fluxo próprio de revisão e confirmação das alterações.

## Código

- `src/entities/ai`: tipos comuns de modelos, provedores e conversas.
- `src/features/chat-with-ai`: estado das conversas e painel lateral genérico.
- `src/features/chat-with-ai/api/ai-provider.ts`: contrato para integrações de IA.
- `src/features/chat-with-ai/api/providers/codex.ts`: adaptador específico do Codex.
- `src/features/chat-with-ai/api/chat.repository.ts`: armazenamento comum dos dados do Chat.
- `src/app`: compõe a feature com o vault ativo e o salvamento pendente.
- `tauri/src/ai/commands.rs`: comandos IPC; trabalho bloqueante fora da interface.
- `tauri/src/ai/state.rs`: estado e encerramento da conexão de IA.
- `tauri/src/ai/providers/codex.rs`: processo `codex app-server`, JSON-RPC, threads e eventos.
- `tauri/src/ai/repository.rs`: leitura e gravação atômica dos dados de IA por vault.
- `tauri/src/ai/tools.rs`: resolução do vault e consultas de notas.

Não é aberto um servidor HTTP. As ferramentas são registradas diretamente no
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
