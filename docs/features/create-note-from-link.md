# Criar nota a partir de uma menção

## Ciclo de vida

Ao acionar uma menção interna sem destino resolvido, a feature primeiro pede ao app que salve a nota atual. Depois verifica se a referência corresponde a uma nota existente por ID ou título; se não corresponder, cria uma nota no vault ativo. A referência na nota de origem é vinculada ao ID da nota encontrada ou criada, o salvamento é concluído e a navegação abre o destino.

Uma criação concorrente que falha é resolvida novamente contra a biblioteca para evitar duplicar uma nota que acabou de aparecer. Mudança de vault ou de nota de origem durante a operação cancela as etapas seguintes.

## Falhas e cobertura

Falha ao salvar, criar ou abrir deixa a edição sem navegação e mostra um erro temporário. Não há teste dedicado; persistência e concorrência usam os contratos de [notas](notes.md).

## Código

- [Controlador](../../apps/desktop/src/features/create-note-from-link/model/controller.ts)
- [Normalização e vínculo](../../apps/desktop/src/entities/note/model/editable-note-references.ts)
