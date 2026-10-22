# Janelas internas persistentes

## Estado

A implementação guarda os fluxos de trabalho nos controladores do app e desmonta as interfaces depois da animação de saída.

## Objetivo

Fechar uma janela ou modal de trabalho deve escondê-la como uma janela minimizada. Reabri-la deve restaurar o mesmo ponto de trabalho, enquanto timers, geração, respostas de IA, processos de terminal e operações iniciadas continuam ativos durante a execução do app.

O escopo é a interface interna do Ômega Notes. Fechar a janela principal mantém o comportamento atual de encerramento do app; este documento não propõe execução em bandeja nem persistência de processos entre reinicializações.

## Comportamento

- Fechar pelo botão X, Escape, clique no fundo ou abrir outro painel apenas esconde a superfície. O controlador, o conteúdo, os rascunhos, filtros e seleção permanecem disponíveis para reabrir.
- Abrir outra janela interna oculta a janela visível anterior, preservando seu estado e suas operações. As janelas continuam mutuamente exclusivas na tela.
- Ao fechar, a interface pode ser desmontada depois da animação. O estado de trabalho fica nos controladores do app, que vivem enquanto o processo estiver aberto; reabrir cria a interface novamente a partir desse estado.
- Ao reabrir, o fluxo volta ao ponto salvo no controlador. Rascunhos, item selecionado, etapa e outras informações necessárias para retomar não dependem de manter componentes ou elementos DOM montados.
- Timers continuam contando enquanto a superfície está oculta. Uma expiração pode avançar o fluxo em segundo plano; o resultado aparece quando a janela é reaberta.
- A troca de vault, a desativação da IA ou a troca de modo continuam aplicando as regras de invalidação e limpeza já existentes. Esses atos mudam o contexto ou encerram explicitamente uma funcionalidade; não são simples minimizações.
- Encerrar o aplicativo continua salvando o que for possível e destruindo as janelas e processos, incluindo a sessão do terminal.

## Ações explícitas

Fechar e cancelar são ações diferentes. Botões como **Cancelar**, **Parar**, **Excluir** e **Concluir** continuam com seu significado atual e podem descartar ou terminar o fluxo correspondente. Escape, clique fora e X apenas ocultam a janela. Selecionar um vault ou uma mídia conclui a ação e fecha o seletor; uma nova abertura começa uma nova seleção.

Alertas informativos que só apresentam um aviso e são encerrados por **Fechar/Entendi** continuam sendo dispensáveis. Eles não são superfícies de trabalho minimizadas.

## Superfícies incluídas

- Chat normal e terminal CLI do modo Gambiarra.
- Métodos de estudo, incluindo geração, avaliação, timer e resultado.
- Kanban e Pomodoro.
- Configurações e gerenciamento de vault.
- Catálogo de mídia aberto pelo editor de notas.
- Formulários e confirmações de criação, renomeação e exclusão enquanto o fluxo estiver pendente; a ação explícita **Cancelar** continua descartando a operação.

Controles transitórios, como menus suspensos, menus de contexto e toolbars que desaparecem por navegação, não são janelas de trabalho e mantêm o ciclo de montagem atual. Alternar entre Canvas e Nota também continua sendo navegação, não minimização de uma janela.

## Implementação

As janelas são remontadas a partir dos controladores de longa duração criados por `useAppController`. O catálogo de mídia mantém seu controlador no editor da nota, o chat mantém a posição de leitura por vault e o terminal reconstrói a tela a partir da saída recente da sessão.

O estado de visibilidade é separado do estado do fluxo. Fechar um modal não limpa alvo, rascunho ou progresso; Cancelar e conclusão continuam sendo ações explícitas. Operações iniciadas continuam depois de a janela ser escondida.

Os pontos principais de integração são `App` e seus controladores, o helper de presença compartilhado e as superfícies de diálogo/painel dos recursos listados acima. Cada superfície deve usar seu acionador já existente para reabrir; não será criado um gerenciador global de janelas minimizadas.

## Critérios de aceitação

1. Fechar e reabrir cada janela incluída restaura o conteúdo e o estado de trabalho necessário para continuar; a árvore de interface pode ser criada novamente.
2. Ocultar Chat, Gambiarra, Pomodoro ou Estudo não cancela, pausa ou reinicia o trabalho em andamento.
3. A interface oculta não recebe foco, teclado ou interação acessível e continua respeitando `prefers-reduced-motion`.
4. Cancelar, parar, concluir, selecionar, trocar vault/modo, desativar IA e fechar o app preservam as respectivas regras explícitas de encerramento e limpeza.
5. Menus e toolbars transitórios continuam fechando e limpando seu estado como hoje.

## Risco e limite

O estado de trabalho fica em memória durante a execução; reiniciar o aplicativo encerra processos e operações, conforme o comportamento atual. Cada fluxo ainda precisa distinguir esconder a interface de cancelar ou concluir a operação.
