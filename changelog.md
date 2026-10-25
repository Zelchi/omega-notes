# Histórico de atualizações

## Unreleased

## v0.5.0

### Conversa com IA

- A aplicação de vínculos entre notas se recupera de conflitos de edição relendo as notas e recalculando os trechos antes de tentar novamente, com limite de três tentativas e sem expor erros técnicos na conversa.

### Notas e mídias

- Notas aceitam imagens, GIFs, áudio e vídeo.
- O desktop aceita áudio `aac`, `flac`, `m4a`, `mp3`, `oga`, `ogg`, `opus` e `wav`, e vídeo `mp4`, `ogv` e `webm`.
- O catálogo compartilhado encontra mídias de outras notas sem carregar todos os documentos completos; os itens podem ser reposicionados e as contagens são separadas por vault.
- O backend mantém cópias gerenciadas em `audios/` e `videos/` e transmite os arquivos localmente para os players, sem transcodificação.
- Notas e mídias antigas são preservadas; a limpeza remove somente arquivos sem referências em notas, backups, journals de renomeação, recuperação ou notas excluídas.

### Janela e interface

- A barra personalizada permite arrastar, redimensionar pelas bordas e maximizar com duplo clique.
- O fundo nativo acompanha o canvas durante o redimensionamento da janela.
- O painel Pomodoro e a lista de tarefas receberam ajustes de interação e apresentação.

## v0.4.9

### Arquivo e organização

- O modo Arquivo e o painel Pomodoro com To Do independente ficam disponíveis nas versões de produção.
- O Kanban conclui salvamentos pendentes antes de fechar o aplicativo.
- Falhas ao salvar a organização do modo Arquivo agora são informadas e podem ser tentadas novamente.

### Notas e mídias

- O catálogo encontra mídias de outras notas sem carregar os documentos completos, incluindo imagens, áudios e vídeos.
- Falhas ao carregar o catálogo de mídias agora mostram uma opção para tentar novamente.

### Qualidade e documentação

- Documentação reorganizada por feature, com páginas de arquitetura e desenvolvimento.
- Workflow de qualidade e testes de regressão adicionados para Kanban, Arquivo, preferências, catálogo de mídias e recursos de produção.

## v0.4.8

### Pomodoro e tarefas

- Novo painel Pomodoro com ciclos de foco e pausa configuráveis e uma lista To Do independente, salva por vault.
- O timer mantém o andamento ao ocultar a janela e restaura o estado salvo ao reabrir o aplicativo.
- A bandeja do sistema permite mostrar ou ocultar o aplicativo e controlar o Pomodoro.

### Métodos de estudo

- A seleção de fontes filtra notas sem conteúdo suficiente antes do sorteio e considera referências encadeadas até três níveis antes de enviar o pedido à IA.
- O índice de notas registra as métricas de texto usadas nessa filtragem.

### Integrações e interface

- A sessão da CLI continua ativa quando o painel é ocultado, e o histórico do terminal reaparece ao abri-lo novamente.
- No Windows, a execução das CLIs usa a chamada direta do programa, e a detecção do OpenCode inclui outro pacote v2 antes do fallback v1.
- Painéis e diálogos preservam o estado ao alternar entre eles.

## v0.4.7

### Organização

- A visualização Arquivo apresenta notas e pastas em colunas encadeadas, permite criar pastas aninhadas e reorganizar itens por arraste.
- Kanban vertical por vault, com cinco etapas. Cartões podem ser criados, editados, movidos e reorganizados; as datas registram a criação e a mudança de etapa.
- Títulos repetidos de notas são aceitos e recebem sufixos numerados na interface.

### Integrações de IA

- No Windows, a detecção procura primeiro a CLI v2 do OpenCode e tenta a v1 como fallback.

## v0.4.6

### Estudos

- Os limites de quantidade, vidas e tempo aceitam "Infinito"; quantidade infinita inclui todos os itens salvos na prática.
- É possível encerrar uma prática antes de responder todos os itens. Avaliações de respostas em andamento terminam antes da exibição do resultado parcial.
- A biblioteca de questões e cards ganhou busca sem distinção de acentos e paginação de oito itens.
- O Questionário centraliza o conteúdo quando ele cabe e usa rolagem responsiva em janelas menores, mantendo cabeçalho e ações visíveis.

## v0.4.5

### Estudos

- Questões e cards gerados são salvos como itens individuais. A pessoa escolhe quando gerar cada item e monta a própria prática selecionando quantos quer responder.
- A geração contínua pode ser ligada ou desligada durante o processo. Cada nova questão é gerada em uma chamada separada, com até três tentativas quando falta conteúdo.
- O estudo prioriza itens errados, mantém progresso por item e mostra revisão de erros no método inteiro. O temporizador estima o tempo usando até as dez últimas gerações de cada método.
- O contexto para a IA identifica seções por títulos e tabelas, resume notas extensas e desconsidera imagens, vídeos e áudios ao preparar conteúdo para estudo.

### Notas e ferramentas de IA

- Leituras de notas extensas podem ser direcionadas a seções e tabelas, com resumos reutilizáveis e limites de leitura para reduzir o contexto enviado à IA.
- Operações de leitura, edição e renomeação de notas coordenam alterações concorrentes e detectam mudanças externas com mais segurança.
- A busca e as referências a notas foram aprimoradas, e o carregamento de recursos de IA passa a ocorrer sob demanda.

### Interface e compatibilidade

- Atalhos de busca configuráveis e configurações reorganizadas, com a versão do aplicativo na seção de preferências.
- Em NVIDIA proprietária + Wayland, o aplicativo desativa o renderer DMA-BUF do WebKitGTK antes de inicializar a janela; as animações da interface permanecem ativas.
- Removido o código e as dependências da exportação PDF que estava desativada.

## v0.4.4

### Estudos com IA

- Cada método de estudo guarda o tempo das últimas dez gerações concluídas no modo normal e usa a média para estimar a duração da próxima geração. O indicador mostra uma contagem regressiva dentro do anel e continua em 00:00 caso a geração ultrapasse a média; sem histórico, o anel gira e o relógio mostra `--:--`.

## v0.4.3

### Confiabilidade e armazenamento

- Criação, renomeação e exclusão de notas e vaults agora coordenam operações concorrentes e recuperam operações interrompidas.
- Leituras e alterações pesadas de arquivos saíram da thread assíncrona do Tauri; detecção de alterações externas compara também o conteúdo das notas.
- O catálogo de mídias permite remover arquivos órfãos com confirmação, verificando notas, backups e itens na lixeira.
- O servidor local de mídia limita conexões, tempo de leitura e tamanho de cabeçalhos.

### Ferramentas de IA

- Chamadas MCP reutilizam a biblioteca e o grafo de conexões em cache, com invalidação após mudanças locais ou externas.
- Estudos serializam o acesso aos arquivos e executam operações de armazenamento fora da thread principal.
- O Antigravity deixa de receber o hook de execução do Omega; configurações antigas de hooks são removidas ao conectar, evitando a falha de codificação associada ao hook no Windows.

## v0.4.2

### Integrações com IA

- Claude e Antigravity passam a reutilizar um processo de streaming durante a conversa, evitando iniciar o CLI a cada mensagem.
- OpenCode v2 usa um servidor persistente e eventos em streaming, reutilizando a sessão do Chat entre mensagens.
- Cancelamento e encerramento das solicitações acompanham as sessões persistentes dos provedores.

### Chat e correções

- Texto das mensagens enviadas e das respostas da IA pode ser selecionado e copiado no Chat.
- Ajustada a chamada dos hooks do Antigravity no Windows para evitar falhas com executáveis entre aspas e solicitar UTF-8 à shell quando disponível. Falhas de codificação do CLI recebem uma mensagem específica.

## v0.4.1

### Correções

- Normalizados os caminhos das pastas de notas e backups ao ativar o vault. No Windows, caminhos comuns e caminhos com prefixo estendido deixam de ser interpretados como vaults diferentes, corrigindo o bloqueio de carregamento e salvamento que também podia impedir apagar notas.
- Erros de vault passam a identificar a causa e a operação: vault não ativo ou ausente, pasta inacessível, caminho inválido, carregamento, salvamento, envio de mensagens, preparação e validação de estudos, aplicação e desfazer de links.
- Contextos de estudo e conversas vinculados a outra pasta são distinguidos de uma mudança do vault ativo ou da conexão com a IA.
- Mensagens em português e inglês na conexão com IA, no terminal do Gambiarra e no aviso de carregamento das notas.

## v0.4.0

### Integração com IA

- Antigravity CLI disponível como provedor, com detecção da instalação, autenticação existente, seleção de modelos, Chat em streaming e ferramentas MCP do vault. Os cinco métodos de estudo também usam esse provedor.
- Controles de modelo, raciocínio e velocidade posicionados acima do campo de mensagem, conforme os recursos de cada provedor.

### Modo Gambiarra — experimental e não confiável

- Com Recursos de IA desativados, segurar o controle por cinco segundos ativa o modo Gambiarra. A preferência permanece salva ao reabrir o aplicativo.
- O Chat passa a abrir um terminal interativo na raiz do vault. Na primeira abertura, escolha Codex, Claude, OpenCode ou Antigravity; opções sem CLI instalado ficam desativadas.
- Fechar a lateral preserva o terminal. Sair normalmente do CLI fecha a lateral; reabrir retoma a conversa vinculada ao vault e ao provedor. Falhas permitem reiniciar o terminal.
- Conversas vinculadas por ID, mantendo o histórico no armazenamento do próprio CLI. Trocar de vault, desligar o modo ou sair do aplicativo encerra o terminal.
- Manual AGENTS.md gerenciado na raiz do vault, com procedimentos para localizar, criar, editar, conectar e arquivar notas, além dos formatos e limites dos estudos. Desativar o modo remove as instruções gerenciadas e preserva instruções próprias do usuário.
- Os cinco métodos de estudo usam pedidos em arquivos: copie o pedido para o CLI, aguarde a resposta e confirme para voltar ao estudo. O aplicativo valida o material e mantém as sessões, avaliações em fila e relatórios.
- Terminal com redimensionamento sincronizado, controle do fluxo de saída, foco automático e atalhos próprios preservados. Botão de copiar acima e Confirmar no rodapé.

### Notas e confiabilidade

- Alterações externas nas notas são sincronizadas no Gambiarra. Trocar de vault relê os arquivos.
- Salvamentos com versão desatualizada são bloqueados, com opções para carregar a versão do arquivo ou guardar a edição local como nova nota.
- Corrigidas leituras externas atrasadas que podiam reaplicar uma versão anterior após salvar. Resolver conflitos preserva as edições feitas durante a operação.
- Aberturas e fechamentos do terminal são executados em sequência. Desligar o modo invalida aberturas pendentes também no backend.
- Respostas de estudo no Gambiarra aceitam o JSON da tarefa ou o envelope do pedido, mantendo a validação de IDs e conteúdo. O último retorno é preservado para diagnóstico.
- Links das fontes de estudo funcionam também no Gambiarra.

### Site

- Guia de ativação do modo Gambiarra, identificado como experimental e não confiável, com requisitos de instalação e autenticação dos CLIs.

## v0.3.9

### Estudos com IA

- Barra Estudar no modo leitura com cinco métodos: Memorização, Questionário, Redação, Lacunas e Correção. Os exercícios usam a IA conectada no Chat e ficam disponíveis com Recursos de IA ativados.
- Memorização com cartas, avaliações Fácil/Médio/Difícil e revisão espaçada. Questionário com alternativas; Redação com respostas nas próprias palavras; Lacunas com correção por significado; Correção com trechos incorretos para identificar.
- Na nota aberta, a geração mantém esse assunto como foco e inclui suas referências diretas. No canvas, sorteia uma nota com conteúdo por exercício. Conteúdo insuficiente permite buscar outras notas em até três rodadas; no modo Nicho, o apoio prioriza notas relacionadas ao foco original.
- Quantidade, tempo por pergunta e vidas configuráveis, com preferências lembradas por método. Nota aleatória permanece disponível sem depender de IA.
- Materiais salvos como sessões por data e hora, com taxa de acerto, revisão de erros, revisão de cartas pendentes e opção de limpar o progresso sem apagar o material. Redação e Lacunas incluem relatórios com explicações e fontes clicáveis.
- Redação e Lacunas avaliam respostas em fila enquanto o estudante continua nas próximas questões. Paráfrases, siglas e traduções equivalentes são aceitas; o relatório mostra os resultados individuais das lacunas.
- Fechar um estudo preserva a tela, as respostas e o cronômetro pausado. Gerações e avaliações continuam em segundo plano; Cancelar/Home interrompe as tarefas pendentes. Cada método conserva seu próprio estado.
- O aviso de IA ocupada identifica o método ou o Chat responsável pela solicitação em andamento.

### Integração com IA e armazenamento

- Estudos usam tarefas independentes do histórico do Chat, com fontes preparadas pelo aplicativo, leitura paginada e autorização restrita ao vault e à solicitação atual.
- Geração em lotes de até cinco exercícios, com recuperação dos itens ausentes ou inválidos sem refazer os já aprovados. A sessão só começa depois de completar a quantidade solicitada.
- Fontes inalteradas são reutilizadas nas avaliações. Alterações ou exclusões das fontes impedem aceitar uma correção desatualizada; falhas técnicas permitem tentar novamente sem descontar vidas.
- Sessões armazenadas em arquivos individuais por método, com leitura de resumos e carregamento do material ao abrir. Leitura e gravação executadas fora da thread principal, com carregamento progressivo e proteção contra resultados de outro vault.
- Falhas de geração e avaliação preservam o motivo informado pelo provedor; relatórios grandes deixam de ser limitados pelo tamanho reservado às respostas da IA.
- Corrigida a desativação de MCPs externos no Codex, evitando entradas sem transporte válido. Erros distinguem limites de uso, contexto, conexão e rejeição da solicitação.
- Corrigida a limpeza de tarefas do Codex quando o vault muda durante a criação da thread. Ferramentas de estudo ficam separadas do catálogo do Chat, incluindo as permissões do Claude.

### Interface e preferências

- O último modo de leitura ou escrita é restaurado ao reabrir o aplicativo. O preview temporário com Alt não altera essa preferência.
- Modais respeitam o espaço da barra da janela.
- Tooltips na barra de ferramentas e ajustes nos dropdowns dos estudos.

## v0.3.8

### Notas e canvas

- A lista de vaults permite arrastar pelo nome para reorganizar a ordem, que permanece salva ao reabrir o aplicativo.
- Botão de apagar na barra de edição; notas com texto ou mídia pedem confirmação, e notas vazias são apagadas diretamente.
- Posições e câmera do canvas passam a ser armazenadas separadamente por vault e modo. A organização anterior, que era global, não é migrada; cada vault inicia sua própria organização.
- Desfazer uma exclusão feita dentro da nota recupera a posição anterior no canvas, incluindo o modo dinâmico.
- Carregamentos antigos do histórico não alteram os erros ou o bloqueio de operações de outro vault.
- Corrigida a recuperação de autosave após falhas para preservar as edições mais recentes.
- Referências em código não criam conexões no canvas; zoom inválido no armazenamento é descartado.

## v0.3.7

### Correções

- Corrigida a detecção do OpenCode instalado pelo npm no Windows, reconhecendo o executável nativo do pacote sem depender do Node no PATH.
- A busca por instalações npm também considera os prefixos presentes no PATH, além de `%APPDATA%\npm`.

## v0.3.6

### Chat e vínculos com IA

- A IA recebe o ID e o título da nota aberta em cada mensagem, ou a indicação de que o usuário está no canvas. Esse contexto é usado quando o pedido não especifica outra nota, mantendo a consulta às demais notas do mesmo vault.
- Ferramenta restrita para aplicar vínculos entre menções e notas existentes, incluindo autorreferências, com preservação do texto. Aliases são usados apenas quando o trecho difere do título do destino.
- Validação de revisão, trechos exatos e destinos, com aplicação pela fila de salvamento do aplicativo para evitar sobrescrever edições concorrentes. Código, URLs e links existentes são protegidos na inserção.
- Ícone discreto de desfazer na resposta que aplicou os vínculos. Se os blocos afetados tiverem sido editados, o botão solicita à IA uma nova análise para remover os vínculos preservando as alterações posteriores.
- Pedidos automáticos de desfazer aparecem no Chat como uma mensagem curta e traduzida: “Pedido de desfazer”. O pedido completo continua disponível para a IA e o rascunho é preservado.

### Busca e edição

- Referências a notas apagadas preservam o último título conhecido, com armazenamento por vault e reaproveitamento do histórico de exclusões. O destino por ID é mantido para restaurar o vínculo se a nota voltar.
- Ctrl + F abre e fecha a busca dentro da nota, no espaço da subbarra inferior, com contador, destaques e setas para navegar pelas ocorrências. Funciona em edição e leitura; outras subbarras têm prioridade enquanto abertas.
- Enter e Shift + Enter avançam ou voltam entre os resultados. Escape fecha a busca. A busca exibe até 1.000 ocorrências, com indicação quando esse limite é atingido.
- Ctrl + P foca a busca de notas na barra superior e seleciona o texto existente, tanto no canvas quanto nas notas.
- Botão de vínculo da barra de edição passa a remover a marcação de links já selecionados, preservando o alias quando existir, em vez de criar colchetes aninhados.

## v0.3.5

### Navegação e desempenho

- Histórico das setas à esquerda da busca passa a guardar apenas notas, separado por vault. Os botões ficam desativados no canvas.
- O botão à direita continua alternando entre canvas e última nota, preservando o histórico de voltar e avançar.
- Removidas as animações de entrada e saída entre notas e canvas para evitar lentidão em janelas grandes no Linux. As demais animações da interface continuam disponíveis.
- Removida a ocultação temporária da scrollbar durante a navegação.

## v0.3.4

### Navegação

- Animação de zoom em direção à nota ao abrir pelo canvas estático ou dinâmico, com afastamento ao voltar ao canvas e preservação da posição da câmera.
- Scrollbars ficam ocultas durante a transição e reaparecem ao terminar, sem alterar a posição da rolagem.
- Animações respeitam a preferência de movimento reduzido do sistema. A simulação do canvas dinâmico fica pausada durante a transição.

## v0.3.3

### Chat e ferramentas de IA

- Catálogo com dez ferramentas de consulta: listagem, busca com trechos encontrados, leitura individual ou em lote, conexões de entrada e saída, panorama do vault, sumário, leitura por seção, referências sem destino e caminhos entre notas.
- Consultas mantêm o isolamento por vault, com validação dos argumentos, paginação, limites de leitura e indicação de arquivos ilegíveis. As ferramentas são somente de leitura.
- Ferramentas devolvem referências `[[ID]]` prontas para copiar. Instruções compartilhadas dos três provedores orientam usar links também em listas e confirmações, em vez de apenas nomes em negrito.
- Permissões do Claude e do OpenCode acompanham automaticamente o catálogo de ferramentas.

### Navegação

- Setas de voltar e avançar à esquerda da busca, com histórico de canvas e notas separado por vault durante a sessão. Notas apagadas são ignoradas; abrir outro destino depois de voltar descarta o caminho de avanço.
- Botão de alternar entre canvas e última nota movido para a direita da alternância de leitura/edição, com seta para cima ou para baixo conforme o destino.

## v0.3.2

### Correções

- Links internos mostram o título da nota no editor, mantendo o vínculo por ID no arquivo, inclusive ao criar uma nota a partir de um link inexistente. Apelidos e conteúdo de código são preservados.
- Importações de mídia deixam de inserir conteúdo quando a nota de origem é fechada ou deixa de estar em edição; lotes interrompidos não continuam importando os arquivos seguintes.
- A conclusão do salvamento aguarda também operações adicionadas à fila enquanto uma gravação anterior estava em andamento.
- No modo navegador, falhas de leitura das notas são informadas e impedem sobrescrever a biblioteca como se estivesse vazia.
- O índice de nomes usado para editar links internos é reaproveitado quando apenas o conteúdo das notas muda. Títulos com delimitadores de código mantêm a referência por ID para evitar uma conversão ambígua.

### Desempenho do canvas dinâmico

- Repulsão entre notas calcula cada par uma única vez, com grade numérica e menos alocações durante a simulação.
- Conexões são desenhadas em três grupos SVG, com renderização apenas das notas e conexões próximas da área visível. A nota arrastada permanece montada mesmo fora dessa área.
- Arraste e movimento da câmera agrupam atualizações por frame. Alterar apenas a ordem da lista de notas não reinicia a simulação, que deixa de consumir frames quando está estabilizada.

## v0.3.1

### Sons e interface

- Efeitos sonoros de bolha/pingo ao criar, restaurar e excluir notas, além de sons de clique nos controles e de digitação nos campos de texto, nas notas, nas tabelas e no Chat.
- Controle de volume dos efeitos nas configurações, com barra de dez blocos. A escolha permanece ao reabrir o aplicativo; volume zero silencia os efeitos.
- Uma nova solicitação do mesmo som interrompe e reinicia a reprodução anterior, sem fila, limite de três reproduções ou intervalo mínimo entre pedidos.
- Interações sonoras são emitidas pelos próprios componentes e pelas ações de criação/exclusão, com sons dessas operações após a conclusão com sucesso.
- Processador fixo de áudio mantém os efeitos em memória e recebe comandos de reprodução, com suavização nas interrupções e proteção dos picos contra distorção.

### Limitações conhecidas

- A estabilidade do áudio durante digitação prolongada no Fedora ainda precisa ser confirmada com o processador final. As verificações de compilação não validam a saída de som no dispositivo.

## v0.3.0

### Chat com IA

- Claude valida a versão mínima do CLI (2.1.248), distingue erros de autenticação, cobrança e limites, preserva os detalhes das falhas e evita exibi-los como respostas da IA. Falhas explícitas ao conectar às ferramentas de notas interrompem a solicitação com um aviso próprio. A descoberta do executável reconhece também o pacote nativo das instalações npm no Windows.
- Atalho configurável do Chat abaixo de Recursos de IA, visível quando Recursos de IA está ativado. O padrão é Ctrl+J e a escolha permanece ao desativar e reativar o recurso. Ctrl+A continua selecionando todo o texto. Ao abrir, o campo de mensagem recebe foco quando disponível; ao fechar, o foco não é restaurado na nota.

### Limitações conhecidas

- A integração com Claude ainda precisa de validação de uma conversa autenticada e da conexão MCP em um ambiente real. A revisão e os testes isolados não cobrem essa etapa.

## v0.2.9

### Chat com IA

- Integração com OpenCode atualizada para a CLI v2, corrigindo falhas no envio e o aviso incorreto que pedia atualizar uma CLI já compatível.
- Seletor de modelos do OpenCode mostra Go e os modelos do Zen, ocultando os modelos gratuitos da categoria OpenCode e a opção Default artificial.
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
