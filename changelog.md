# Histórico de atualizações

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
