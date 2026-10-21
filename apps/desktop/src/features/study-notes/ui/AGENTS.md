# Invariante: layout aprovado do Questionário

O modal de configuração do Questionário tem um layout aprovado pelo usuário. Não altere tamanho, alinhamento, padding vertical, quantidade de itens, espaçamento entre busca e lista, posição da paginação ou comportamento da scrollbar em tarefas não relacionadas. O usuário pediu explicitamente que esse componente não seja ajustado novamente sem solicitação direta.

Leia [`docs/questionnaire-layout.md`](../../../../../../docs/questionnaire-layout.md) antes de qualquer tarefa solicitada que toque nesse layout. Um pedido direto do usuário para alterá-lo substitui esta regra; faça somente o ajuste pedido e preserve os outros comportamentos documentados.

A referência aprovada em janela ampla mostra todos os controles, busca, oito itens salvos e paginação ao mesmo tempo, centralizados na área de conteúdo e sem scrollbar. Em janelas mais baixas, deixe o conteúdo rolar naturalmente; mantenha o cabeçalho e o rodapé visíveis e a scrollbar alinhada à trilha inteira. Nunca esconda o overflow ou altere os intervalos entre itens para imitar a referência de janela ampla.
