# Histórico de atualizações

## v0.3.0

### Chat com IA

- Claude valida a versão mínima do CLI (2.1.248), distingue erros de autenticação, cobrança e limites, preserva os detalhes das falhas e evita exibi-los como respostas da IA. Falhas explícitas ao conectar às ferramentas de notas interrompem a solicitação com um aviso próprio. A descoberta do executável reconhece também o pacote nativo das instalações npm no Windows.
- Atalho configurável do Chat abaixo de Recursos de IA, visível quando Recursos de IA está ativado. O padrão é Ctrl+J e a escolha permanece ao desativar e reativar o recurso. Ctrl+A continua selecionando todo o texto. Ao abrir, o campo de mensagem recebe foco quando disponível; ao fechar, o foco não é restaurado na nota.

### Limitações conhecidas

- A integração com Claude ainda precisa de validação de uma conversa autenticada e da conexão MCP em um ambiente real. A revisão e os testes isolados não cobrem essa etapa.

## v0.2.9

### Chat com IA

- Integração com OpenCode atualizada para a CLI v2, corrigindo falhas no envio e o aviso incorreto que pedia atualizar uma CLI já compatível.
- Seletor de modelos do OpenCode mostra Go e os modelos pagos do Zen, ocultando os modelos gratuitos da categoria OpenCode e a opção Default artificial.
- No OpenCode, o topo do Chat mostra apenas o modelo, com CustomScrollbar no dropdown e altura ajustada ao espaço disponível.
- A tela Conectar IA verifica os CLIs instalados e desativa os provedores não encontrados. No Linux, também confere permissão de execução.
- Erros distinguem falhas do CLI, autenticação, acesso ao modelo, assinatura Go exigida, saldo, cobrança, limites de uso e problemas de rede ou do serviço. O motivo original é mostrado com credenciais comuns ocultadas, sem ser salvo no histórico. Erros genéricos de acesso não são tratados como prova de assinatura ausente.
- Corrigido o recebimento de respostas do OpenCode em partes. Falhas ao atualizar o catálogo descartam modelos antigos, e falhas de limpeza da sessão não escondem o erro original da solicitação.
- Sessões do OpenCode usam configuração isolada por vault; o registro de limpeza é mantido quando a exclusão falha para permitir uma nova tentativa antes do próximo envio.

## v0.2.8

### Chat com IA

- Suporte ao Claude Code e ao OpenCode pelos CLIs instalados, com conexão pelo Chat, histórico separado por provedor e vault e reconexão ao último provedor escolhido.
- Claude e OpenCode consultam notas pelas ferramentas do Ômega Notes via MCP, com referências por ID e acesso restrito ao vault ativo.
- Respostas podem ser interrompidas; os processos são encerrados ao desativar Recursos de IA. As opções de modelo e pensamento respeitam o adaptador escolhido.
- Para escolher outra IA, desative e ative novamente Recursos de IA nas configurações. O cabeçalho do Chat mantém apenas o título e o botão de fechar.
- Avisos de erro aparecem acima da linha inferior do Chat e desaparecem após três segundos; uma nova ocorrência reinicia o tempo.

### Interface

- A janela principal passa a conter o transbordamento do layout, evitando barras de rolagem nativas no canvas.

### Site

- Página de divulgação apresenta os canvases, a edição de texto, links, mídias e as integrações de IA. O guia inclui colagem de URLs, destaque de código, atalhos de Tab e configuração dos CLIs.

## v0.2.7

### Notas e chat com IA

- Corrigida a inicialização TLS da busca de títulos de URLs, evitando o encerramento da tarefa ao colar links.
- Colar uma URL nas notas ou nas células de tabelas busca o título da página e cria um link com esse nome. Em caso de falha, a URL é preservada; respostas atrasadas respeitam alterações no texto.
- Envolver vários parágrafos em `[[ ]]` preserva seus alinhamentos individuais, inclusive ao desfazer e refazer.
- Tab insere quatro espaços nas notas ou indenta as linhas selecionadas; Shift+Tab remove um nível, com suporte a desfazer/refazer.
- Blocos de código com linguagem após as crases recebem destaque de sintaxe em leitura, na prévia com Alt e no chat, com cores para os temas claro e escuro.
- Negrito, itálico, texto riscado e marca-texto agrupados numa subbarra de formatação, como os títulos H1–H6.
- Ícone de link na barra de edição insere `[[]]` ou envolve a seleção em `[[texto]]`, incluindo células de tabelas, com suporte a desfazer/refazer.
- Selecionar um texto na nota e digitar `[[` envolve a seleção em `[[texto]]`, preservando o conteúdo e deixando o cursor antes dos colchetes de fechamento.
- Links externos aceitam nomes personalizados, como `[GitHub](https://github.com)`, exibindo apenas o nome clicável na leitura, na prévia com Alt, nas tabelas e no chat.

## v0.2.6

### Canvas

- Ctrl+Z desfaz exclusões, criações e movimentos manuais nos canvases Estático e Dinâmico. Ctrl+Shift+Z e Ctrl+Y refazem as ações, com histórico separado por vault.
- Até 100 notas excluídas mais recentemente são preservadas para recuperação, mantendo IDs, conteúdo e mídias. As exclusões também podem ser desfeitas após reabrir o aplicativo; o histórico de posições pertence à sessão atual.

### Chat com IA

- Notas apagadas mantêm o último título conhecido nas referências do histórico, sem exibir o ID nem permitir abrir uma nota inexistente. Restaurar a nota reativa o link; nomes personalizados são preservados.
- Referências do chat passam a ser armazenadas pelo ID da nota, mantendo o destino após renomear. Links sem nome personalizado exibem o título atual; nomes de exibição continuam disponíveis.

### Notas

- Recuperação de gravações interrompidas usa os arquivos `.temp` quando o arquivo principal está ausente.
- Renomear uma nota preserva referências escritas como exemplo dentro de código em linha e em blocos.
- Código em linha preserva crases incompletas e delimitadores de formatação dentro do conteúdo literal.
- Corrigida a preservação de barras invertidas, pipes e referências incompletas ao editar células de tabelas.
- Adicionar uma linha com o cabeçalho selecionado insere a linha logo abaixo dele.
- A renderização acompanha alterações no tipo do bloco e nos marcadores de listas.
- Lista com marcadores disponível por ícone na barra, com estrutura de lista, indentação das linhas e conversão entre listas com marcadores, numeradas e de tarefas.
- A barra de edição inclui ícones para listas numeradas, citações, código em linha e em bloco, texto riscado, marca-texto e listas de tarefas. Os controles aplicam a formatação à seleção e usam o histórico de desfazer/refazer.
- Clicar em uma referência por nome que ainda não existe cria e abre a nota no vault atual. A referência de origem passa a usar o ID da nota, preservando nomes de exibição como `[[nota|apelido]]`.
- Corrigida a navegação com as setas entre linhas vazias: o cursor mantém a posição visual correta, sem saltar para o topo da nota.
- Listas numeradas, citações com `>`, código entre crases e blocos cercados por três crases, texto riscado com `~~texto~~` e marca-texto com `==texto==`. A formatação aparece na leitura, na prévia com Alt e no chat; código é exibido literalmente.
- Listas de tarefas com `- []` ou `- [ ]` para pendentes e `- [x]` para concluídas. Em leitura, clicar no checkbox atualiza a nota, com salvamento automático e histórico de desfazer/refazer. O chat também exibe a marcação.
- Apagar linhas vazias acima de uma tabela permite que ela suba, preservando seu conteúdo e a quebra de linha necessária para separar o texto anterior.
- É possível posicionar o cursor e inserir texto ou linhas antes de uma tabela no início da nota, inclusive quando ela é criada em uma nota vazia.
- Tabelas são protegidas contra exclusão pelo Backspace/Delete no texto e possuem um botão de lixeira nos controles; a exclusão pode ser desfeita com Ctrl+Z.
- Tabelas renderizadas também na edição, com células editáveis e controles abaixo para adicionar/remover linhas e colunas. As alterações usam o salvamento automático e o histórico de desfazer/refazer da nota.
- Tabelas em Markdown, com botão de inserção na barra de edição e visualização em leitura, na prévia com Alt e no chat. As células aceitam negrito, itálico e referências a notas, incluindo nomes de exibição.
- Histórico de desfazer e refazer para texto, formatação e alinhamento dos parágrafos, com Ctrl+Z, Ctrl+Shift+Z e Ctrl+Y. Digitação contínua é agrupada; cursor e rolagem são restaurados junto com a alteração.

### Site

- Guia de primeiros passos, formatação, tabelas, referências, atalhos e uso do chat com IA.
- Vídeo de demonstração com reprodução automática sem som, repetição e controles ocultados quando o mouse sai ou fica parado.

## v0.2.5

### Notas

- Modais só fecham pelo fundo quando o clique começa e termina fora do conteúdo. Arrastar uma seleção de texto para fora não fecha mais o modal.
- Linhas iniciadas com hífen de lista (`- `) aparecem com uma bolinha em leitura e na prévia, mantendo o texto original na edição. A formatação também se aplica às mensagens do chat.
- A prévia temporária de leitura agora usa Alt em vez de Ctrl, preservando cursor e rolagem ao soltar a tecla. Alt também mantém a rolagem acelerada dentro das notas.

## v0.2.4

### Chat com IA

- Mensagens do chat exibem negrito, itálico, títulos de H1 a H6 e separadores com a mesma formatação das notas, preservando as referências clicáveis.

### Notas

- Segurar Alt ao rolar dentro de uma nota aumenta o deslocamento em três vezes.

## v0.2.3

### Notas

- Segurar Ctrl durante a edição ativa temporariamente o modo leitura, com links clicáveis. Soltar Ctrl retorna à edição preservando cursor e rolagem; atalhos com Ctrl continuam disponíveis.
- Alternar entre edição e leitura com a nota aberta preserva a rolagem. O posicionamento inicial acontece apenas ao entrar na nota: final do texto em edição e início em leitura.

## v0.2.2

### Notas

- Imagens copiadas e capturas de tela podem ser coladas com Ctrl+V na nota e são armazenadas na pasta de imagens do vault.
- Busca de notas com navegação pelas setas e abertura do resultado selecionado com Enter.

### Repositório

- Site inicializado em Astro em `apps/web`, com página inicial, layout, estilos e comandos próprios de desenvolvimento e build.
- Publicação do site no GitHub Pages em `notes.zelchi.com`, com vídeo de demonstração, player e scrollbar customizados e fundo pontilhado do canvas.
- Aplicativo separado em `apps/desktop`, com `apps/web` reservado ao site de divulgação. Comandos da raiz e publicação no GitHub ajustados à nova estrutura.

## v0.2.1

### Chat com IA

- Campo de mensagem disponível enquanto a IA responde, permitindo preparar a próxima mensagem.
- Enviar durante uma resposta acrescenta uma orientação ao trabalho em andamento. O botão de parar permanece separado.
- Se a resposta terminar antes do envio da orientação, a mensagem inicia uma nova resposta.
- O texto digitado durante o envio anterior é preservado; orientações que não puderem ser enviadas retornam ao campo.
- Bolhas de texto com animação suave de entrada ao enviar e ao iniciar uma resposta, sem repetir a animação a cada trecho recebido. A preferência de movimento reduzido é respeitada.

## v0.2.0

### IA

- Novo Chat lateral para conversar com suas notas usando o Codex CLI instalado no computador e o login da conta ChatGPT.
- Recursos de IA desativados por padrão. Ao ativar, o ícone do Chat aparece na barra superior.
- Conversas e contexto separados por vault, com busca e leitura de notas restritas ao vault atual. Referências sublinhadas abrem a nota correspondente.
- Seleção de modelo, nível de pensamento e velocidade Default/Fast, quando suportada. Respostas em tempo real com opção de interromper.
- Reconexão automática ao provedor previamente conectado, reutilizando o login existente e sem enviar mensagens.
- Histórico, rascunho e preferências salvos em `ia` na raiz de cada vault. O histórico mantém as 50 mensagens mais recentes; mensagens antigas são apagadas automaticamente.
- Desativar Recursos de IA apaga históricos, rascunhos e preferências de Chat de todos os vaults, desconecta a IA e esquece a reconexão automática. Ao reativar, é necessário conectar pelo botão.
- Pasta `.key` na raiz dos dados reservada a credenciais do aplicativo. O login atual continua gerenciado pelo Codex.
- Estrutura comum de IA preparada para novos provedores. Nesta versão, apenas o Codex está disponível.

### Interface

- Dropdowns personalizados no Chat e nas configurações, com navegação por teclado, animações e altura ajustada às opções, sem rolagem.
- Chat usa o cursor de texto e a barra de rolagem personalizados do aplicativo. Scrollbars com 5px de espessura.
- Animações de fechamento dos modais preservam os títulos, valores dos campos e posição das listas.

## v0.1.9

### Interface

- Erros ao criar ou renomear notas e vaults aparecem em uma caixa acima do modal, sem deslocar o formulário.
- Avisos com texto vermelho centralizado, borda padrão e duração de 1,5 segundo; o mesmo erro reaparece a cada nova ocorrência.
- No gerenciador de vaults, a caixa acompanha a região do campo de nome. Ao criar, inclui também a largura do botão de adição.
- O erro do título dentro de uma nota mantém seu formato e desaparece após 3 segundos.

### Canvas

- Mensagem central nos canvases Estático e Dinâmico vazios orienta clicar para criar a primeira nota e começar as anotações.
- No modo de leitura, a mensagem orienta ativar a edição antes de criar uma nota.

## v0.1.8

### Windows

- Corrigido o salvamento de notas existentes: a sincronização da cópia `.temp` agora usa acesso de escrita, exigido pelo Windows. Isso também evita que alterações pendentes bloqueiem operações de vaults.
- Corrigida a sincronização dos arquivos durante a importação de mídias.
- Se o salvamento falhar ao fechar, o aplicativo oferece continuar aberto ou fechar sem salvar após confirmação explícita.

### Canvas

- Dois modos nas configurações: Estático para organização manual e Dinâmico para distribuir automaticamente as mesmas notas e referências `[[nota]]`.
- Dinâmico com destaque das conexões, fundo pontilhado, zoom, enquadramento e margem circular de clique de 20 px ao redor dos pontos.
- Clique numa área vazia do Dinâmico cria uma nota no modo de edição; clique direito num ponto abre Renomear/Apagar.
- Posições e zoom separados entre os modos, preservando a organização manual. A simulação para quando estabiliza e enquanto a janela está oculta.
- Bolhas do Estático abrem espaço ao criar, arrastar ou alterar o tamanho de uma nota, inclusive no arraste em grupo.
- A opção Ocultar botões esconde todo o conjunto do canto inferior direito nos dois modos.

### Editor

- Digitar `[[` em até 250 ms completa `[[]]`, deixando o cursor no meio para escrever o link.
- Apagar os dois colchetes de abertura remove também o fechamento correspondente, preservando o texto do link.

### Interface

- Corrigido o arraste da barra de rolagem personalizada, preservando o elemento e a captura do mouse durante a rolagem.
- Arraste disponível também pela faixa da barra, com tratamento de perda de captura e foco da janela.
- Inglês como idioma padrão quando nenhuma preferência de idioma está salva.

## v0.1.7

### Canvas

- Borda de seleção preservada quando a bolha recebe foco e durante o arraste.
- Seleção calculada pelas posições das notas no canvas, considerando zoom e deslocamento, sem depender das caixas visuais transformadas.
- Ajustada a camada de desenho e a movimentação das bolhas para evitar rastros de bordas durante o arraste.
- Seleção de várias notas ao arrastar com o botão esquerdo numa área vazia, com destaque visual e movimento em conjunto.
- Ctrl ou Shift permite ajustar a seleção; Escape ou um clique vazio desfaz a seleção.

### Editor

- Alinhamento aplicado ao parágrafo do cursor ou aos parágrafos selecionados, com configurações independentes para cada um.
- A barra de edição acompanha o alinhamento da seleção e indica seleções com alinhamentos diferentes.
- Novos parágrafos herdam o alinhamento do parágrafo de origem; os alinhamentos são preservados ao editar e ao salvar a nota.

## v0.1.6

### Linux

- Restaurada a identificação da janela no lançador para o GNOME associar o Ômega Notes ao ícone do aplicativo.

## v0.1.5

### Interface

- Segurar Ctrl no modo de edição torna os links clicáveis para abrir notas e endereços externos, sem alterar o texto ou a posição do cursor.
- Ao soltar Ctrl, o destaque e as áreas clicáveis dos links são removidos imediatamente.

- Sugestões de notas centralizadas acima do cursor dentro de `[[...]]`, com filtro por título e seleção por mouse, setas, Enter ou Tab.
- Clique direito em imagens, áudios e vídeos agora ativa o reposicionamento, com confirmação, lixeira e redimensionador lado a lado em uma barra centralizada abaixo da mídia.
- Controles de reposicionamento permanecem visíveis mesmo quando o cursor sai da mídia.
- Removido o menu Anexar mídia do clique direito na nota; o catálogo continua disponível pela barra de edição.
- Clique direito na área de escrita preserva a posição do cursor de texto.
- Um segundo clique direito na mídia em reposicionamento confirma a posição.
- Cursor de texto em toda a área de escrita, inclusive nos espaços vazios, com exceção das mídias e controles.

### Desenvolvimento

- Dados das compilações de desenvolvimento separados em `Documentos/Ômega Notes Dev`, incluindo vaults, notas, mídias e arquivos temporários.

## v0.1.3

### Correções

- Atualizações disponíveis agora são informadas no botão das configurações. O download e a instalação só começam após o clique do usuário.

## v0.1.2

### Aparência

- Ícone atualizado com cantos arredondados e símbolo ômega menor.
- Atualizados os ícones da interface e dos instaladores.

## v0.1.1

### Correções

- Corrigida a falha de inicialização no Fedora com Wayland que exibia `Error 71 (Protocol error)`.
- O aplicativo agora desativa o renderizador DMABUF do WebKitGTK por padrão no Linux, permitindo abrir pelo menu ou pelo comando `omega-notes` sem configurar uma variável no terminal.
- Configurações explícitas de `WEBKIT_DISABLE_DMABUF_RENDERER` no ambiente continuam sendo respeitadas.

## v0.1.0

### Primeira versão

- Canvas visual com notas conectadas e bibliotecas separadas em vaults.
- Editor com salvamento automático, títulos, negrito, itálico, separadores e alinhamento de texto.
- Imagens, áudios e vídeos nas notas, com players integrados.
- Temas claro e escuro, idiomas português e inglês e opções de cursor.
- Distribuição para Windows, Ubuntu e Fedora, com atualização pelo GitHub.
