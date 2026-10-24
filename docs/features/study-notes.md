# Métodos de estudo

## Ciclo de vida normal

Ao abrir um método, o controlador lê os itens individuais e as preferências/progresso do vault. A lista de fontes vem dos resumos das notas; antes do sorteio, o backend filtra notas sem conteúdo estudável. A origem sorteada e as referências são verificadas e podem ser seguidas até três níveis. Só depois da preparação do snapshot o texto é enviado à IA.

Gerar cria um item por solicitação; o modo contínuo repete uma geração individual por vez e pode ser desligado durante o pedido. A pessoa escolhe quantidade, vidas e tempo ao iniciar o estudo; a fila seleciona itens salvos, priorizando os que foram errados. Encerrar mostra o resultado parcial. Questões e cards são itens independentes; o conjunto não é salvo como uma sessão.

Falha por conteúdo insuficiente repete a preparação e geração até três tentativas dentro do mesmo tempo estimado. A IA não recebe conteúdo se as fontes falharem em todas as tentativas.

## Estado e persistência

Itens e progresso pertencem ao vault; preferências de quantidade, vidas e tempo pertencem à instalação. Desligar Recursos de IA limpa históricos e workspaces dos provedores, mas mantém os itens de estudo e seus dados de progresso. Navegar de um estudo para uma nota mantém o controlador montado e retorna ao método anterior.

Cobertura de regressão: [geração](../../apps/desktop/frontend/test/study-generation.test.mjs), [itens](../../apps/desktop/frontend/test/study-items.test.mjs), [fila](../../apps/desktop/frontend/test/study-queue.test.mjs) e [barra](../../apps/desktop/frontend/test/study-toolbar.test.mjs).

## Caminho usando Gambiarra

O modo CLI usa o mesmo preparo de fontes, mas cria um pedido em arquivos e aguarda a pessoa copiá-lo para o CLI e confirmar a resposta. O ciclo específico está descrito a seguir.

Os cinco métodos ficam disponíveis também em Gambiarra. Ao iniciar uma geração,
o app salva as edições, prepara o mesmo snapshot de fontes da integração normal e
cria `ia/gambiarra/requests/<requestId>/` com `request.md`, `manifest.json` e
arquivos por segmento (`N1-S1.txt`, `N1-S2.txt` etc.). O manifesto inclui caminho
de títulos, tipo e contagem de caracteres; tabelas Markdown são segmentos próprios. O botão
**Copiar pedido para o CLI** copia uma instrução para a IA escolher os arquivos
relevantes. No modal, esse botão também abre a lateral; o usuário cola o pedido
no CLI de IA iniciado ali, não no shell.
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

A seleção geral de fontes pelo vault, as referências diretas e as três tentativas
por questão continuam iguais. Cada questão/card e cada nova avaliação produzem
um pedido individual para copiar; não há envio automático ao CLI aberto.
Redação/Lacunas mantêm a fila de correções e deixam responder às próximas questões;
ao final, aguardam os pareceres e exibem o relatório. Os itens e o progresso ficam
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
