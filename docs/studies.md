# Estudos

A barra de estudos aparece no modo leitura, no mesmo lugar e com os mesmos estilos
compartilhados da barra de edição. A barra principal oferece nota aleatória,
sem depender de IA, e, apenas com Recursos de IA ativados, o botão **Estudar**,
que abre uma subbarra com:

1. Cartas de memorização: gera perguntas e respostas para revisão manual ou espaçada.
2. Questionário: gera quatro alternativas, uma resposta correta e explicação.
3. Redação: perguntas abertas para responder com as próprias palavras.
4. Lacunas: trechos com termos ocultos para completar, avaliados pela IA em fila.
5. Correção: textos com erros factuais para identificar selecionando os trechos.

Cartas de memorização e questionários aparecem apenas com Recursos de IA ativados,
mesmo quando já há conjuntos salvos. Gerar novos materiais exige conexão com IA. A conexão é a
mesma do Chat, incluindo provedor, modelo, pensamento e velocidade. Sem um provedor
conectado e autenticado, clicar em qualquer um dos cinco exercícios abre diretamente
o painel lateral do Chat, reutilizando sua tela de conexão. Nenhuma conexão é
iniciada automaticamente. Após conectar, o usuário pode abrir o exercício desejado.
Conjuntos já salvos podem ser usados sem uma nova geração. A geração e o Chat não enviam pedidos simultâneos.
Todos os métodos de estudo compartilham uma fila de solicitações de IA, incluindo
novas tentativas de geração e avaliações. A fila aguarda a disponibilidade do
provedor usado pelo Chat, remove pedidos cancelados e invalida pedidos de outro
vault ou com Recursos de IA desativados.

## Contexto

- Dentro de uma nota, todos os itens usam a nota aberta como fonte principal e
  suas referências diretas como contexto.
- No canvas, o sorteio é feito somente ao gerar o material e separadamente para
  cada carta ou questão. Notas com texto de todo o vault ativo participam do
  sorteio. O aplicativo esgota as candidatas antes de repetir um assunto; se a
  quantidade pedida for maior que a de notas, começa outro ciclo de sorteios.
- Cada item considera sua própria nota sorteada e as referências diretas dela.
  A IA recebe a atribuição por posição, e a resposta é validada por item: precisa
  citar a nota atribuída e só pode citar fontes do contexto daquela nota. A fonte
  principal fica na primeira posição de `sources`.
- As referências diretas sempre fazem parte do contexto, sem opção de desativar.
  Não há expansão recursiva para referências das referências. Links dentro de
  código não ampliam o contexto.
- No canvas, a configuração de cartas e questionários não mostra uma nota única
  como contexto: cada item terá sua própria fonte. Conjuntos gerados pelo canvas
  não ficam associados a uma única nota; dentro de uma nota, essa associação é
  preservada.
- Cada item deve conter IDs de fontes válidas do contexto. A resposta é validada
  como dados JSON; não é executada nem injetada como HTML.

Essa validação garante formato e referências, não a correção factual da resposta
produzida pelo modelo. A janela permite abrir as notas citadas para consultar o
material original.
Durante uma atividade ou relatório, o cabeçalho usa a nota de origem da sessão,
ou Geral quando ela foi gerada no canvas. Abrir uma referência e retomar a sessão
não muda essa origem. Na configuração inicial, usa a localização atual.

### Contexto preparado para geração e avaliação

Antes de enviar o pedido de geração, o aplicativo salva as alterações pendentes e
prepara no host um snapshot das fontes atribuídas aos exercícios. Cada nota é lida
uma única vez, mesmo se aparecer em várias questões ou como referência de mais de
uma nota principal. O snapshot conserva texto, título e os números dos exercícios
autorizados a usar cada fonte; as atribuições também identificam a nota principal
e as notas de apoio. A resolução das referências usa o plano do aplicativo, sem
expansão recursiva.

A IA consulta `read_study_context`:

- Sem `sourceId`: recebe as atribuições e até 50 fontes por página, com título,
  `usedByItems`, tamanho do texto e `nextOffset` para continuar o manifesto.
- Com `sourceId`, como `N1`: recebe até 16 mil caracteres Unicode do conteúdo daquela fonte.
  `offset` e `nextOffset` permitem continuar até o fim; `nextOffset: null` indica
  que não há mais conteúdo. Notas vazias continuam identificadas como vazias.

O pedido instrui a IA a consultar somente esse snapshot, reutilizar fontes já
lidas e dispensar a descoberta de conexões. A validação final das citações por
exercício permanece ativa. O snapshot é entregue pelas ferramentas: não é
concatenado ao prompt inicial, cujo limite continua sendo 32 KB em UTF-8.

O Codex acessa o contexto pelo despachante do host. Os subprocessos MCP do Claude
e do OpenCode o consultam pelo bridge local autenticado, vinculado ao turno real.
A ferramenta só fornece as fontes registradas para aquela solicitação e aquele
vault. Não é possível escolher o identificador de outra tarefa pelos argumentos.

Os snapshots ficam apenas em memória e são liberados ao concluir, falhar ou
cancelar o pedido. Uma preparação que termine após o cancelamento também é
descartada. A leitura e a liberação são coordenadas com a solicitação; o preparo e
a liberação rodam fora da thread da janela. Há expiração adicional de dez minutos,
limite de oito snapshots registrados e orçamento de 64 MB por snapshot. Exceder
o orçamento gera falha, sem truncar silenciosamente o conteúdo ou as referências.

Essa preparação é utilizada na geração dos cinco métodos e na avaliação de
Redação e Lacunas. Nas avaliações, o snapshot contém a nota principal, suas
referências diretas e as fontes adicionais citadas pelo exercício. Uma fonte
apagada ou alterada durante a avaliação continua impedindo aceitar o resultado.
Cada pedido mantém seu próprio manifesto, aliases e autorização. O conteúdo
preparado das fontes, porém, é compartilhado em memória entre solicitações quando
os bytes do arquivo continuam iguais. O host relê o arquivo em `spawn_blocking`
para conferir a revisão exata: não depende apenas de data/tamanho, nem evita as
leituras de disco. Reutiliza a interpretação/validação do JSON, o texto montado e
sua contagem de caracteres. O cache é separado pelo caminho completo da nota,
com até 128 entradas e 16 MB de conteúdo bruto mais título/texto preparado;
entradas maiores não ficam no cache. O descarte prioriza as menos recentemente
usadas, com validade de dez minutos desde o último uso, conferida nos acessos.
Snapshots ativos mantêm suas próprias referências até a liberação. Desligar IA
ou encerrar a integração pelo estado global limpa o registro e o cache; uma
preparação anterior não pode repopular o registro após essa limpeza.

No frontend, Redação e Lacunas reutilizam índices, resolução das referências e
texto das fontes enquanto o array imutável de notas não mudar. Trocar esse array
invalida o cache; reset e descarte do controlador também o limpam. Depois da
avaliação, a interface confere título, texto e conjunto de fontes, e o host
confere novamente título/texto dos arquivos. Fonte removida, ilegível ou alterada
impede aceitar a correção. Essa verificação é pontual: não bloqueia editores
externos nem cria uma transação sobre os arquivos durante toda a avaliação.

O cache não compartilha a conversa ou a autorização entre tarefas. A IA ainda
precisa ler o manifesto e as fontes de cada solicitação independente; não há
promessa de reduzir tokens ou de reaproveitar contexto interno do provedor.

O manifesto identifica cada fonte por um alias local, como `N1`, e publica
`primarySourceId` e `supportingSourceIds` nas atribuições. O conteúdo é lido por
esse alias. Os campos `sources` retornados pela IA também usam os aliases;
o aplicativo converte-os para os IDs reais e confere a autorização por exercício
antes da validação e persistência. Aliases desconhecidos ou fora do escopo da
questão não são aceitos; sua resolução usa apenas o contexto do pedido atual.
Arquivos de sessão e relatórios
continuam usando IDs reais, sem salvar referências temporárias como `N1`.

### Solicitações independentes do Chat

Cada envio identifica sua finalidade: conversa (`chat`), geração de material
(`study-generation`) ou avaliação de resposta (`study-evaluation`). Geração e
avaliação têm instruções próprias para retornar dados estruturados, sem a regra
conversacional de transformar menções a notas em links dentro dos campos de IDs.

No Codex, cada tarefa de estudo inicia uma thread temporária independente, sem
restaurar o histórico do vault ou reutilizar a thread do Chat. Seu registro é
removido do host ao concluir, falhar no envio ou cancelar; uma conversa de estudo
nunca é escolhida como thread do Chat. Nos adaptadores de Claude, OpenCode e Antigravity,
as sessões continuam sendo novas por envio e pedidos de estudo não recebem o
histórico recente da conversa. Exercícios e avaliações não são acrescentados às
mensagens persistidas do Chat.

A geração e a avaliação só recebem a ferramenta `read_study_context` e não podem
usar `link_note_mentions` ou consultar outras fontes. O host verifica essas
restrições também na execução das ferramentas. Os subprocessos MCP recebem a
finalidade do pedido, e o bridge mantém sua própria restrição vinculada ao turno.

O provedor, modelo, pensamento e velocidade continuam vindo das configurações
atuais do Chat, quando suportados pelo adaptador. A fila compartilhada e o
cancelamento por solicitação permanecem ativos; separar o contexto da conversa
não libera envios simultâneos ao provedor.

## Sessões

Cada material gerado aparece como uma **Sessão**, identificado pela data e hora de
geração, com os mais recentes primeiro. Os controles ficam abaixo da data;
o título do material não aparece na lista. A taxa de acertos usa o resultado mais recente de
cada item respondido (acertos ÷ itens respondidos), acompanhada da contagem de
itens respondidos/total. Antes da primeira resposta, a taxa aparece como 0%.
Revisões atualizam a sessão existente; gerar outro material cria uma nova sessão.

Sessões de **Redação** têm um botão para abrir o relatório salvo, com perguntas,
respostas do usuário, respostas de referência e avaliações da IA. O botão fica
desabilitado até haver ao menos uma resposta avaliada ou um tempo esgotado.
O relatório conserva a avaliação mais recente de cada pergunta; revisitar o
relatório não envia pedidos à IA. Ele permanece disponível após reabrir o app.


Cartas de memorização mostram a resposta ao pedir e permitem avaliar como **Fácil**,
**Médio** ou **Difícil**. Os botões mostram o intervalo da próxima revisão:

- Fácil: começa em 5 dias; nas próximas revisões, triplica o intervalo anterior.
- Médio: começa em 1 dia; nas próximas revisões, dobra o intervalo anterior.
- Difícil: volta a ficar pendente em 30 minutos e reinicia a sequência de memorização.

Os intervalos longos são limitados a 180 dias. É um agendamento local simples
inspirado em níveis de dificuldade, sem implementar o algoritmo do Anki.
Apenas Fácil conta como acerto na Memorização. Médio e Difícil não aumentam
a taxa de acertos; cada opção mantém seu próprio intervalo de revisão. A biblioteca oferece **Revisar cartões pendentes**, incluindo cartões
nunca respondidos e aqueles cujo prazo venceu. O prazo é salvo por carta e
permanece após reabrir o app. O conjunto completo pode ser estudado antes do prazo.

A IA fornece uma resposta correta em `answer` e três alternativas incorretas em
`distractors`. O aplicativo valida que as quatro opções sejam distintas, embaralha
as posições e calcula `correctIndex`. A sessão salva conserva essa ordem; reabrir
ou estudar novamente não embaralha um material já salvo.

Questionários começam com 10 itens, 3 vidas e 30 segundos por pergunta. Esses
valores são configuráveis: 5, 10, 20 ou 30 itens, 1, 3 ou 5 vidas e três opções de tempo por
pergunta: 30 segundos (padrão), 1 minuto ou 5 minutos.
O cronômetro é sempre por pergunta, sem seletor de modo ou opção de tempo total.
Erro ou tempo esgotado perde uma vida; o cronômetro para enquanto a explicação
aparece e reinicia ao avançar para a próxima pergunta. Ao terminar os itens ou as
vidas, mostra o resultado.

A opção **Revisar erros**, na biblioteca e no resultado, inicia uma sessão apenas
com questões cujo último resultado foi erro ou tempo esgotado. Ao acertar uma
questão, ela sai dessa fila. Questões não respondidas porque as vidas acabaram não contam como erros; a
questão em andamento ao esgotar o tempo é registrada como tempo esgotado. As
configurações de vidas e tempo por pergunta também valem
para sessões de revisão.

Fechar o modal apenas o oculta. Ao reabrir o mesmo método, ele retoma a tela,
pergunta, resposta revelada, alternativa escolhida, vidas, pontuação, rolagem e
configurações anteriores. Cada método mantém seu próprio estado, permitindo
alternar entre Memorização, Questionário, Redação e Lacunas sem reiniciar os exercícios.
O cronômetro guarda os milissegundos restantes e fica pausado enquanto o modal
está fechado. Trocar de nota também fecha e pausa o modal, preservando o estudo.

Gerações e avaliações já iniciadas continuam em segundo plano ao fechar o modal.
Uma geração concluída enquanto o modal está fechado não inicia o cronômetro;
a primeira pergunta aguarda a reabertura. Fechar durante uma Redação mantém o
rascunho, a seleção do texto e a fila de avaliações. Se as vidas acabarem devido
a uma avaliação em segundo plano, a sessão deixa de aceitar respostas e mostra
o resultado ao reabrir, depois de concluir os pedidos e gravações pendentes.

Esse estado de navegação permanece em memória durante a execução do app, no
vault ativo. Trocar de vault, desativar Recursos de IA ou encerrar o app encerra
os exercícios em andamento; materiais e relatórios já salvos são preservados.
Selecionar explicitamente um material na lista, reiniciar ou revisar erros
inicia outra tentativa. Voltar à configuração é uma ação explícita e não ocorre
por simplesmente fechar o modal.

## Redação

Substitui o exercício Lembrar sem olhar. Usa o mesmo modal de configuração,
armazenamento e sessões das cartas de memorização e do questionário de alternativas.
Só aparece com Recursos de IA ativados. Sem provedor conectado e autenticado,
o botão abre a tela de conexão do Chat.

A configuração oferece 5, 10, 20 ou 30 perguntas, 1, 3 ou 5 vidas e 30 segundos,
1 minuto ou 5 minutos por pergunta. O botão **Gerar Material** fica no rodapé,
fora da área de rolagem. Não há um rótulo de contexto no topo deste formato.

No canvas, cada pergunta sorteia sua própria nota ao gerar o material, esgotando
as candidatas antes de repetir. Dentro de uma nota, todas as perguntas usam essa
nota como fonte principal. As referências diretas sempre entram no contexto e
não há expansão recursiva. A atribuição e as citações são validadas por item.

A IA gera enunciados abertos e respostas de referência. O usuário vê uma pergunta
por vez e escreve sua resposta com suas próprias palavras, em um campo de até
4.000 caracteres com cursor e scrollbar personalizados. As notas ao fundo e a
resposta de referência ficam ocultas enquanto responde.

**Enviar resposta** coloca a resposta em uma fila de avaliação e avança imediatamente
para a próxima pergunta, com um novo cronômetro. É possível continuar escrevendo e
enviando enquanto a IA avalia as respostas anteriores. Os pedidos são processados
um por vez, compartilhando o bloqueio do provedor com o Chat. O aviso de IA
ocupada identifica o método responsável pela solicitação ativa (por exemplo,
Memorização ou Redação), mesmo após fechar o modal e abrir outro método. Se a
solicitação ativa vier do Chat, o aviso informa Chat. O nome acompanha a chamada
realmente iniciada, sem atribuir chamadas em espera ao método aberto.

A avaliação recebe a pergunta, a resposta do estudante e a resposta de referência,
além da nota de origem, suas referências diretas e fontes auxiliares citadas.
O gabarito serve como orientação a conferir com as fontes atuais, sem exigir
correspondência literal; divergências devem ser explicadas e as fontes prevalecem.
Pede para aceitar siglas, nomes completos, sinônimos, traduções e paráfrases e julgar conceitos essenciais, sem exigir palavras
idênticas nem penalizar gramática ou pequenas omissões. O formato e os IDs das
fontes são verificados; a correção pedagógica continua dependendo do modelo.
Cada resultado é associado à posição original da pergunta, mesmo que o usuário
já esteja respondendo outra.

Ao esgotar o tempo, a pergunta é marcada como não respondida, perde uma vida e
avança automaticamente, sem revelar a resposta. Acertos aumentam a pontuação;
erros também retiram uma vida. Ao enviar a última resposta ou acabar as vidas,
a sessão aguarda as avaliações pendentes e a gravação do progresso antes de
mostrar o resultado. Respostas de referência e comentários só aparecem nessa
tela final. Respostas já enviadas são avaliadas mesmo se as vidas acabarem.

Falhas de conexão ou avaliação não contam como erro nem retiram vidas. A fila
preserva a resposta para tentar novamente, sem reenviar as já avaliadas, e permite
continuar escrevendo. Se as fontes mudarem durante a avaliação, o resultado é
rejeitado; a nova tentativa consulta o conteúdo atual. Uma fonte principal
apagada impede avaliar a pergunta e é informada ao usuário.

Conjuntos gerados e progresso ficam salvos por vault, como nos demais estudos.
Respostas já avaliadas, incluindo textos não enviados por tempo esgotado, e
comentários da IA ficam salvos no relatório, dentro do progresso da sessão.
Rascunhos e respostas ainda aguardando avaliação permanecem em memória, inclusive
com o modal fechado. São descartados ao reiniciar, trocar de vault, desativar
Recursos de IA ou encerrar o app. Limpar o progresso também remove o relatório.
O texto enviado é recebido pelo CLI do provedor,
cujo contexto de conversa pode retê-lo. Trocar de vault ou desativar Recursos
de IA cancela a solicitação e ignora resultados atrasados.
Nenhuma dessas ações modifica o conteúdo das notas.

## Lacunas

Exercícios gerados por IA a partir dos mesmos contextos dos demais estudos:
dentro de uma nota, a nota aberta e suas referências diretas; no canvas, uma
nota sorteada separadamente para cada exercício, sempre com suas referências.
A ferramenta fica no submenu Estudar, apenas no modo leitura e com Recursos de
IA ativados. Sem conexão, reutiliza a tela de conectar IA do Chat.

Cada exercício contém um trecho com 1 a 5 lacunas, respostas aceitas, explicação
e fontes. A IA fornece `parts`, uma sequência de strings e objetos como
`{"answers":["IA","Inteligência Artificial"]}`. O aplicativo monta a pergunta e
numera os campos; a IA não precisa produzir marcadores nem mantê-los sincronizados
com um array separado. O material interno é validado no frontend e no Rust: marcadores `{{1}}`,
`{{2}}`, etc. devem aparecer exatamente uma vez e em ordem. Cada lacuna admite
1 a 5 respostas equivalentes de até 200 caracteres. O trecho tem limite de 2000
caracteres e a explicação, 4000. A frase completa é construída localmente usando
a primeira resposta aceita de cada lacuna.

As configurações são 5/10/20/30 exercícios, 1/3/5 vidas e 30 segundos/1 minuto/5
minutos por exercício. Cada exercício aparece individualmente. Enter passa ao
próximo campo; no último campo, envia as respostas.

**Enviar resposta** exige preencher todas as lacunas. O texto preenchido entra na
mesma fila de avaliação usada pela Redação, e o usuário avança imediatamente.
Uma solicitação por vez usa o provedor, modelo, pensamento e velocidade do Chat,
sem disputar uma solicitação em andamento. O tempo da avaliação não consome o
tempo do próximo exercício. Na última pergunta, a tela aguarda a fila e as
gravações pendentes antes de mostrar o resultado.

A IA consulta a nota atribuída e suas referências diretas e avalia o significado
de cada lacuna. Aceita siglas, nomes completos, sinônimos e traduções equivalentes,
além de pequenos erros de escrita que não alterem o sentido. As respostas de
referência são exemplos, não uma lista fechada. Conceitos diferentes, valores ou
unidades incorretas não devem ser aceitos. Só conta como acerto se todas as
lacunas estiverem corretas. Cada erro ou tempo esgotado retira uma vida; falhas
técnicas não retiram vidas e permitem tentar a avaliação novamente. Ao acabar o
tempo, a resposta parcial é registrada sem revelar o gabarito, e a sessão avança.
Ao perder todas as vidas, para de receber respostas e termina as avaliações já
enfileiradas, como na Redação.

O relatório final mostra o enunciado, o texto respondido, a resposta de referência,
o resultado, a explicação da IA por lacuna e as fontes. Fica salvo no progresso,
em `ia/studies/cloze/<id-da-sessão>.json`, e pode ser reaberto pelo botão de
relatório da sessão. Reset remove também o relatório; revisar erros preserva a
posição original dos itens e substitui a avaliação anterior de cada item revisto.
Lacunas salvas exigem IA para avaliar novas respostas; consultar um relatório já
salvo não faz outra solicitação.

Fechar o modal preserva campos e pergunta, pausa o cronômetro e mantém a fila
trabalhando em segundo plano. Reset volta ao início e cancela avaliações pendentes;
trocar de vault, desativar Recursos de IA ou desmontar o aplicativo também cancela
solicitações e descarta resultados atrasados. Se as fontes mudarem durante uma
avaliação, ela precisa ser refeita; se a nota principal for apagada, a avaliação
é bloqueada. Rascunhos e avaliações pendentes ficam em memória; respostas já
avaliadas e seus comentários ficam no arquivo da sessão.
Não há agendamento espaçado para esse método.

## Quantidade solicitada

Uma geração só é aceita se retornar exatamente a quantidade escolhida (5, 10, 20
ou 30 exercícios). Atribuições repetidas à mesma nota continuam exigindo exercícios
separados; lacunas, alternativas e referências não contam como exercícios extras.
O material é gerado em lotes de até cinco exercícios. Cada posição tem um `itemId`
estável, publicado no manifesto e copiado na resposta, sem depender da ordem dos
objetos retornados. Itens válidos ficam em memória e não são pedidos novamente.
Itens ausentes, inválidos ou duplicados são recuperados nas rodadas seguintes;
fontes sem conteúdo suficiente podem provocar novo sorteio no modo Geral.
Um JSON ilegível exige recuperar o lote afetado, sem descartar outros lotes.

IDs desconhecidos não são aplicados e IDs duplicados não escolhem um resultado
arbitrariamente. Perguntas iguais após normalizar Unicode, caixa e espaços são
rejeitadas como duplicadas. Prévias de perguntas já aprovadas para a mesma nota
principal ajudam a IA a explorar outros aspectos, sem servirem como fonte factual.
A validação mecânica não detecta todas as repetições semânticas.

A geração tem até três rodadas, cada exercício aparecendo no máximo uma vez por
rodada. Sem falhas, 5/10/20/30 itens usam 1/2/4/6 chamadas; no pior caso, o teto é
3/6/12/18 chamadas sequenciais. Não há novas rodadas independentes por lote.
Só a sessão completa é salva e iniciada. Ao esgotar as tentativas, a interface
informa quantidade insuficiente, formato inválido ou conteúdo insuficiente, conforme
as pendências. Falhas técnicas de conexão ou provedor não são repetidas por esse
mecanismo. Cancelar descarta o material temporário e impede os lotes restantes.
Sessões já salvas mantêm a quantidade com que foram criadas.

## Progresso

Cartas e alternativas salvam o resultado antes de permitir avançar. Na Redação,
as avaliações são gravadas em sequência enquanto o usuário continua respondendo;
o resultado final aguarda essas gravações. Em caso de falha, a interface
mostra um aviso e permite tentar a mesma gravação novamente sem contar a resposta
duas vezes. Cada resultado é enfileirado imediatamente com seu vault e sessão de
destino, sobrevivendo ao reset do método. Fechar a janela não cancela uma gravação
já enviada. O encerramento, a instalação de atualização e as operações de vault
aguardam as gravações pendentes. A versão mais recente de um progresso que falhou
é preservada para nova tentativa; se continuar falhando, a ação é interrompida.
Isso não persiste rascunhos ou avaliações de IA que ainda não produziram resultado.

O progresso fica separado dos enunciados no campo `progress` do conjunto, no
mesmo arquivo JSON da sessão. Os itens gerados são imutáveis: a identidade de cada um é
composta pelo ID da sessão gerada e sua posição original. Sessões com apenas os erros
ou cartões pendentes preservam essa posição; não renumeram o progresso.

São guardados contadores de tentativas, acertos e tempos esgotados, último
resultado, sequência de acertos, última revisão e próximo vencimento. Os
contadores são limitados a um milhão e não há lista ilimitada de tentativas.
**Limpar progresso** zera contadores e agendamento, mantendo o material salvo.
Apagar um conjunto remove seu progresso; apagar o vault remove ambos.
Desativar Recursos de IA mantém materiais e progresso salvos, mas oculta essas
ferramentas até o recurso ser ativado novamente. A interface apresenta o resumo de acertos acumulados por
conjunto.

Não há edição de itens nesta versão. Uma futura edição deve renovar a identidade
ou invalidar o progresso do item alterado. Apagar uma nota de origem preserva o
material de estudo; seu link fica indisponível e mantém o título conhecido quando
houver. Conjuntos associados a uma nota apagada continuam acessíveis pelo canvas.

## Armazenamento

Cada sessão tem um arquivo próprio, contendo material, data de criação,
progresso e, na Redação e nas Lacunas, relatório:

```text
<vault>/ia/studies/
├── flashcards/<id-da-sessão>.json
├── quiz/<id-da-sessão>.json
├── written/<id-da-sessão>.json
├── cloze/<id-da-sessão>.json
└── correction/<id-da-sessão>.json
```

As pastas são criadas conforme o uso. O nome é o UUID da sessão; data e hora
continuam identificando-a na interface. Não há índice persistido nem conversão
de formatos anteriores. Há limite de 50 sessões e 4 MB somando os arquivos do vault.
Ao atingir o limite, é necessário apagar uma sessão antes de gerar outra;
sessões antigas não são apagadas automaticamente. Os arquivos não contêm credenciais.

Salvar progresso regrava atomicamente apenas o arquivo da sessão correspondente;
apagar remove apenas esse arquivo. O backend verifica UUID, tipo, conteúdo e
caminhos, rejeita links simbólicos e impede que uma gravação tardia de progresso
recrie uma sessão apagada. Para conferir limites, consulta nomes e tamanhos dos
arquivos, sem interpretar os materiais das outras sessões.

No modo navegador, cada sessão tem sua própria chave no localStorage, incluindo
ID do vault, tipo e UUID da sessão. Excluir o vault remove todas essas chaves.
Falhas na listagem impedem gerar materiais a partir de uma biblioteca incompleta.

Desativar Recursos de IA mantém os conjuntos salvos. A limpeza já existente
continua apagando os históricos de Chat e desconectando os provedores.

### Leitura e gravação fora da thread da janela

Os cinco comandos de armazenamento dos estudos são assíncronos e executam
operações de disco, validação e serialização em `spawn_blocking`. O mutex protege
a leitura e a gravação da biblioteca também nessas threads. As gravações
continuam atômicas; o arquivo não fica parcialmente atualizado.

A listagem percorre os arquivos um por vez no Rust, valida cada sessão e envia
apenas seu resumo pelo Channel do Tauri: identidade, tipo, data, nota de origem,
quantidade de itens, contadores/agendamento e indicação de relatório disponível.
Perguntas, respostas e textos dos relatórios não são enviados nessa etapa.
Não há cache ou arquivo de índice separado: os resumos são derivados dos arquivos.
O frontend valida e publica um resumo por tarefa, permitindo que a lista apareça
progressivamente. Um evento final informa a quantidade esperada; o carregamento
só termina após esse evento e a conclusão do comando. Os controles permanecem
bloqueados durante o carregamento.

Ao iniciar uma sessão salva ou abrir seu relatório, `read_study` carrega apenas
o arquivo solicitado. O material completo permanece na memória do método enquanto
sua sessão estiver aberta ou pausada. Resultados atrasados são descartados após
troca de vault, desativação dos Recursos de IA ou desmontagem da interface.

Trocar de vault ou iniciar outra leitura cancela o recebimento anterior no
frontend e descarta mensagens atrasadas. Uma operação de disco já iniciada no
Rust pode terminar, mas seu resultado não é aplicado ao novo vault. Leituras e
gravações compartilham uma fila; se uma avaliação em segundo plano enfileirar
uma gravação durante o carregamento, a biblioteca é relida após essa gravação.
Se o conteúdo de uma sessão não puder ser lido ou validado, ela é identificada
por tipo e ID em uma lista separada. As sessões válidas continuam disponíveis;
o usuário pode corrigir o arquivo e tentar novamente ou removê-lo. O evento final
contabiliza sessões válidas e inválidas, mantendo a verificação de integridade do
stream. Erros na estrutura de diretórios, caminhos inseguros e violações dos
limites globais continuam bloqueando a biblioteca.

O limite de 512 mil caracteres é aplicado somente à resposta da IA. Relatórios
persistidos são validados separadamente, respeitando os limites de campos e de
4 MB por vault, sem serializar e interpretar novamente todo o material no JS.
No modo navegador, localStorage continua síncrono; a validação das sessões é
intercalada com outras tarefas e o limite de armazenamento usa bytes UTF-8.

## Organização do código

- `entities/study`: modelos, validação de respostas e repositório.
- `features/study-notes`: contexto, geração, sessões e interface; a resposta escrita e
  seu parser de avaliação ficam em módulos próprios. Redação e Lacunas compartilham
  `answer-review.controller.ts` para a fila, com prompts próprios por método.
- `entities/note/ui/note-content-text`: renderização de texto formatado e referências
  compartilhada entre o Chat e a comparação de estudos.
- `features/chat-with-ai`: coordena uma resposta de texto fora do histórico visível.
- `shared/ui/toolbar`: estilos comuns das barras de edição e estudos.
- `tauri/src/ai/studies.rs`: armazenamento dos conjuntos no vault.

A geração real depende de um CLI instalado, autenticado e conectado. A compilação
não valida o comportamento dos modelos nem a qualidade das perguntas geradas.

## Correção

A IA gera uma dissertação curta dividida em 3–16 trechos selecionáveis, misturando
informações corretas com erros factuais intencionais. Os erros precisam ser
contraditos pelas notas de origem; ausência de informação não caracteriza erro.
Todos os trechos têm a mesma aparência antes da conferência.

O usuário marca os trechos incorretos e pode desmarcá-los antes de conferir.
Para acertar o exercício, deve identificar todos os erros sem marcar trechos
corretos. A conferência é local e não exige outra chamada à IA. Depois dela,
são mostrados a quantidade de erros identificados, as marcações indevidas,
o texto corrigido, a explicação e as fontes. Revelar a resposta conta como erro;
esgotar o tempo registra tempo esgotado. Os trechos com erros e as marcações
indevidas são destacados após a conferência.

Usa os mesmos presets de quantidade, tempo e vidas dos questionários, contexto
por item com referências diretas obrigatórias, sessões salvas, taxa de acertos,
revisão de erros e reset. Fechar o modal preserva as seleções e pausa o tempo.
O material e o gabarito ficam em `ia/studies/correction/<id-da-sessão>.json`, isolados por vault; os erros
intencionais nunca são escritos nas notas originais.

## Preferências de configuração

Quantidade de itens, tempo por pergunta e vidas são salvos ao alterar a seleção,
separadamente para cada método. Ao reabrir o aplicativo, os dropdowns recuperam as
últimas escolhas. Sem preferência válida, os padrões continuam 10 itens, 30 segundos
e 3 vidas. Valores inválidos são substituídos individualmente pelo padrão.

As preferências usam o localStorage da instalação, na chave
`omega-notes.settings.studies.<tipo>`, como as demais configurações da interface.
São compartilhadas entre vaults e preservadas ao desativar os Recursos de IA,
limpar o progresso ou excluir sessões. Material e progresso permanecem isolados
por vault nos arquivos de sessão. Isso não persiste uma tentativa em andamento.

## Voltar à tela inicial do método

O ícone de reset ao lado do X encerra a tentativa atual e retorna à configuração
e lista de sessões daquele método. Cancela geração ou avaliação em andamento,
limpa respostas temporárias e reinicia o cronômetro, preservando materiais,
resultados já salvos e preferências. Fica desativado na tela inicial e enquanto
há uma gravação de progresso pendente ou com falha. Durante a gravação final do
material gerado, Home e Cancelar ficam temporariamente desativados para não
confirmar um cancelamento depois do início da gravação. Cancelamentos enquanto
a gravação ainda está na fila impedem sua execução; se o ciclo de vida da sessão
for cancelado durante a gravação, a mesma fila remove o arquivo recém-criado antes
de liberar a operação seguinte. Falhas nessa remoção são sinalizadas como erro de
armazenamento.
Durante a geração, o botão inferior **Cancelar** usa esse mesmo retorno ao início
e interrompe a solicitação. O X continua apenas ocultando o modal, mantendo a
geração em segundo plano ou pausando a tentativa para retomá-la depois.

### Pular uma questão de Lacunas

O rodapé traz **Pular** à esquerda de **Enviar resposta**. Pular não exige preencher
os campos nem faz uma solicitação à IA: registra a resposta parcial como questão
pulada, retira uma vida e avança imediatamente. No último item ou ao esgotar as
vidas, aguarda avaliações anteriores e gravações antes do relatório. O relatório
identifica a questão como pulada, sem confundi-la com tempo esgotado. Ela não conta
como acerto e entra na revisão de erros. Se o tempo já tiver acabado no clique,
prevalece o registro de tempo esgotado.

## Consultar referências durante um estudo

Abrir uma referência pelo modal ou relatório fecha o estudo, preservando seu estado
individual. Ao voltar ao canvas no mesmo vault, o método de origem reabre na etapa,
pergunta e rolagem em que estava, retomando o cronômetro quando aplicável. A regra
vale também se o estudo foi aberto originalmente dentro de uma nota. Avaliações
já enviadas continuam em segundo plano durante a consulta.

Esse retorno é temporário: trocar de vault, desativar Recursos de IA ou abrir
manualmente outro estudo descarta o retorno automático. Fechar o modal pelo X
sem seguir uma referência não agenda uma reabertura. Não altera a persistência:
tentativas pausadas e esse retorno ficam apenas na memória do aplicativo.

## Novo sorteio por conteúdo insuficiente

No modo Geral, a IA pode retornar um objeto com `itemId` e
`error: "STUDY_INSUFFICIENT_CONTENT"` no lugar de um exercício, preservando os
demais exercícios do lote. O aplicativo identifica a nota principal dessa posição
e substitui apenas as atribuições pendentes sinalizadas. Não volta a sortear notas rejeitadas durante
a mesma geração. Prioriza outras notas ainda não usadas no plano e, se não houver,
pode reutilizar uma nota não rejeitada. Referências diretas continuam obrigatórias.

São no máximo **três rodadas**, incluindo a inicial. Os exercícios aprovados são
preservados, e só os pendentes entram nos lotes das rodadas seguintes. Se todas as
pendências forem por conteúdo insuficiente e não houver substitutas, a geração
termina com aviso. Dentro de uma nota aberta, o foco original é preservado e o
contexto pode ser complementado conforme a regra de Nicho abaixo. Fechar pelo X
mantém a sequência em segundo plano; Cancelar,
reset, troca de vault ou desativação de IA interrompem as solicitações restantes.

### Complemento no modo Nicho

Se a IA indicar conteúdo insuficiente dentro de uma nota, as tentativas restantes
podem adicionar até duas notas com texto do mesmo vault entre rodadas, além de suas
referências diretas. São até quatro notas auxiliares nas duas novas tentativas.
A seleção exclui notas sem texto e fontes já presentes no contexto. Em vez de
sortear apoios sem relação, classifica as candidatas nesta ordem:

1. Notas que referenciam a nota principal, resolvendo os links pelos mesmos IDs e
   títulos usados pelo aplicativo, sem considerar links dentro de código.
2. Notas com termos relevantes compartilhados entre os títulos.
3. Notas com sinais suficientes de assunto compartilhado no conteúdo.

Palavras comuns em português e inglês, URLs, UUIDs e termos puramente numéricos
não aumentam a relevância. Termos frequentes entre as candidatas recebem peso
menor. Os empates são resolvidos pelo ID, mantendo a seleção determinística.
O vocabulário de consulta vem somente da nota principal, sem passar a usar o
assunto dos apoios como novo foco.

Para limitar o trabalho da seleção, a comparação lexical usa até 16 mil caracteres
iniciais de cada nota. Isso não limita o snapshot entregue à IA: as fontes
selecionadas continuam disponíveis por inteiro, com paginação. A classificação
é uma heurística lexical e de conexões; não identifica toda equivalência semântica
ou relação descrita apenas depois desse recorte. A IA ainda precisa verificar se
as fontes realmente sustentam os exercícios.

A análise cede a execução entre notas em fatias aproximadas de 8 ms e pode ser
cancelada. Não usa Web Worker e uma nota individual ainda é processada de forma
síncrona. Se não houver novas candidatas relacionadas, a geração termina com
aviso quando só restarem pendências por conteúdo insuficiente.
Ao adicionar um apoio, suas referências entram imediatamente no conjunto usado;
uma candidata que já tenha entrado por esse caminho não ocupa outra vaga. Isso
não expande referências recursivamente. O limite é de duas raízes de apoio por
expansão e quatro no total.
O limite continua sendo três rodadas, com lotes de até cinco itens pendentes.

A nota original permanece como principal em todos os exercícios e como origem da
sessão. As auxiliares servem para aprofundar seu assunto; a IA deve ignorar conteúdo
sem relação e não transformar a sessão em um estudo Geral. As fontes citadas são
validadas contra esse contexto ampliado. Redação e Lacunas consultam também as
fontes auxiliares citadas ao avaliar respostas, conferindo se foram alteradas ou
apagadas durante a avaliação. Todas as notas continuam pertencendo ao mesmo vault.

### Cores das respostas no relatório

Nas novas avaliações de Lacunas, a IA retorna um resultado por campo, na ordem
original, em `blankResults`. O resultado global é calculado pelo aplicativo:
só há acerto se todos os campos forem corretos. O modelo não precisa retornar
um campo `correct` redundante. O relatório interno salva esse campo calculado,
confere sua consistência com `blankResults` e conserva os textos digitados. Em
**Sua resposta**, apenas os trechos preenchidos recebem cores: verde suave para
os corretos e vermelho suave para os incorretos, permitindo ver acertos parciais
na mesma frase. O texto fixo do enunciado mantém a cor normal. Questões puladas
ou com tempo esgotado não recebem cores de avaliação, pois não foram julgadas.
Relatórios sem esses dados individuais não têm sua avaliação inferida pelo texto.
Na Redação, a resposta completa recebe a cor do resultado da avaliação.


## Contrato das tarefas de IA e revisão final

A seleção das notas fica em `context.ts`. `context-prompt.ts` define o protocolo
comum de leitura do snapshot, paginação, isolamento da tarefa e tratamento de
texto não confiável. `study-prompt.ts` associa os exercícios às fontes e compõe o
pedido com regras de `generation-formats.ts`. Redação e Lacunas compartilham
`evaluation-prompt.ts`, mantendo critérios específicos nos seus módulos.

O pedido inicial é limitado a 32 KB em UTF-8, incluindo configurações e dados da
resposta quando for avaliação. As notas completas seguem pelo contexto paginado.
Entradas que excedem o limite são recusadas; não são truncadas silenciosamente.
A IA deve retornar JSON, que o aplicativo valida antes de salvar ou pontuar.

| Método | Conteúdo retornado pela IA por item | Responsabilidade do aplicativo |
| --- | --- | --- |
| Memorização | `itemId`, `question`, `answer`, `sources` | Associar fontes, salvar cartas e agendar Fácil/Médio/Difícil. |
| Questionário | `itemId`, `question`, `answer`, três `distractors`, `explanation`, `sources` | Validar e embaralhar alternativas, calcular índice correto e corrigir localmente. |
| Redação | `itemId`, `question`, `answer`, `sources` | Guardar gabarito; enfileirar resposta para avaliação semântica com fontes atuais. |
| Lacunas | `itemId`, `parts`, `explanation`, `sources` | Construir marcadores/texto, enfileirar correção e calcular acerto global dos resultados por lacuna. |
| Correção | `itemId`, `segments`, `explanation`, `sources` | Montar textos original/corrigido e comparar a seleção do estudante com os segmentos incorretos. |

Todos os itens usam `sources` com aliases locais, como `N1`. A resposta de geração
é `{title, items}`; um item sem evidência suficiente usa
`{itemId, error: "STUDY_INSUFFICIENT_CONTENT"}` dentro de `items`, preservando os
outros exercícios do lote. IDs desconhecidos, itens duplicados e fontes fora do
escopo são rejeitados. A sessão só começa com a quantidade exata validada.

A resposta de avaliação contém `summary`, `strengths`, `gaps` e `corrections`;
cada entrada nas três listas inclui `text` e `sources`. Redação retorna também
`correct`; Lacunas retorna `blankResults`, na ordem dos campos, e o aplicativo
calcula `correct`. Esses formatos de transporte são convertidos para o modelo
interno; arquivos de sessão conservam IDs reais e seus validadores próprios.

### Validação realizada e pendências

A revisão estática abrangeu os cinco métodos, os dois modos de seleção, a fila,
a persistência e o ciclo de vida dos modais. Nos adaptadores, conferiu a finalidade
da tarefa e a restrição de ferramentas no host/MCP/bridge. O Claude também filtra
`--allowedTools` pela finalidade. O Chat comum não anuncia `read_study_context`;
a ferramenta só é oferecida na geração e avaliação de estudos. No Codex, uma troca de vault durante a criação
da thread remove o registro da tarefa de estudo que não chegou a iniciar.

Isso não certifica a qualidade da IA nem substitui a execução no WebView. Não
foram feitas solicitações reais aos provedores. Na continuação desta revisão, os
testes automatizados passaram a cobrir geração, adaptação dos cinco formatos,
cache de fontes e fila de avaliações, usando dados e respostas simulados.
A suíte do frontend chegou a 109 testes: inclui os controladores completos dos
cinco métodos, persistência em memória, pausa/retomada do cronômetro, cancelamento,
conclusão de geração oculta e relatório final de Redação/Lacunas com avaliações
sequenciais enquanto o modal está fechado. Isso não executa componentes no DOM.

A tentativa de validação visual neste ambiente foi impedida pelas restrições de
execução: Vite/WebKitWebDriver não puderam abrir portas locais e o Chrome headless
também encerrou por operação de socket não permitida. Nenhum resultado visual ou
funcionamento real de CLI é inferido dos testes de controladores. Para validar interativamente, usar um vault de teste com notas pequenas,
uma vazia, referências compartilhadas e uma nota cujo conteúdo seja insuficiente:

1. Gerar 5 itens de cada método em Geral e Nicho, conferindo quantidade, fontes,
   ausência de gabaritos nas perguntas e comportamento das respostas.
2. Gerar 10 itens com assuntos repetidos e conteúdo insuficiente; verificar que
   itens bons são mantidos, só pendências são refeitas e não há sessão incompleta.
3. Em Redação/Lacunas, enviar respostas equivalentes, erradas e parcialmente
   corretas; continuar respondendo enquanto a fila avalia e conferir o relatório.
4. Durante uma avaliação, alterar título/texto ou remover uma fonte; conferir o
   aviso, a preservação das vidas e a nova tentativa sem duplicar acertos.
5. Fechar/reabrir durante geração e estudo; verificar estado e pausa do cronômetro.
   Separadamente, cancelar, voltar à Home, trocar de vault e desligar IA, conferindo
   que resultados antigos não reaparecem e arquivos ficam no vault correto.
6. Repetir os fluxos com Codex, Claude, OpenCode e Antigravity disponíveis/autenticados, sem
   herdar conversa do Chat nem acessar ferramentas externas ao contexto.

Para comparar desempenho, usar cópias do mesmo vault, mesmo provedor/modelo,
mesma quantidade e notas de Nicho fixas, sem outros trabalhos no provedor.
Registrar chamadas de geração/avaliação, leituras/páginas de ferramentas, volume
de texto, tokens quando informados, tempo total e falhas, em várias execuções.
Separar cache frio/quente e relatar a variação entre execuções. No Geral, registrar
as notas efetivamente sorteadas: execuções com assuntos diferentes não constituem
uma comparação controlada. Os limites de chamadas são garantias da implementação;
economia efetiva de tempo ou tokens só pode ser afirmada após essa medição.


### Medição local da preparação das fontes

O diagnóstico `measure_source_preparation_cache` fica ignorado na suíte normal,
sem limites de tempo que tornem testes de correção instáveis. Usa somente notas
sintéticas temporárias, sem serviços de IA, e pode ser executado com:

```sh
cargo test --locked --no-default-features --manifest-path apps/desktop/tauri/Cargo.toml measure_source_preparation_cache -- --ignored --nocapture --test-threads=1
```

Resultados brutos e metodologia estão em
[`benchmarks/study-context-preparation.json`](benchmarks/study-context-preparation.json).
Foram cinco rodadas de vinte operações por modo, alternando a ordem dos modos.
Os valores abaixo são medianas das médias por rodada, em milissegundos por fonte:

| Texto da nota | Sem cache | Cache de aplicação vazio | Cache de aplicação reutilizado |
| --- | ---: | ---: | ---: |
| ~16 KiB | 0.335 | 0.356 | 0.021 |
| ~256 KiB | 4.435 | 4.567 | 0.143 |
| ~2048 KiB | 36.003 | 36.364 | 1.186 |

O baseline reconstrói o trabalho equivalente anterior ao cache: validar ID e
arquivo, ler/interpretar/validar a nota, montar texto e contar caracteres para o
manifesto. Não foi executada uma versão anterior completa do aplicativo.
O teste usa build Rust de desenvolvimento sem otimizações e notas sintéticas.
O cache do sistema de arquivos foi aquecido para todos os modos; “vazio” se refere
somente ao cache do aplicativo, removido fora do intervalo medido.

Neste diagnóstico, reutilizar uma fonte custou menos que prepará-la novamente.
Na primeira leitura houve custo adicional de aproximadamente 1% a 6%, dependendo
do tamanho. Isso não demonstra uma redução equivalente no tempo total do estudo:
continuam fora da medição a fila, o IPC, a paginação, a renderização e o provedor.
O resultado também não representa contenção em vaults grandes ou ganhos na versão
otimizada de produção. Não foram medidos tokens ou qualidade pedagógica.
