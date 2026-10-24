# Alinhamento de texto

## Ciclo de vida

O usuário seleciona um trecho em um bloco de texto e escolhe alinhamento à esquerda, centro, justificado ou direita. A seleção é convertida no intervalo de parágrafos tocados; o estado de cada parágrafo é atualizado no documento da nota e segue pelo salvamento automático normal.

Uma seleção com mais de um alinhamento não mostra um único valor atual. Seleção vazia afeta o parágrafo sob o cursor.

## Estado e limites

O alinhamento fica no documento da nota, em `paragraphAlignments`, com o alinhamento do bloco como fallback. Não há estado independente da nota nem teste dedicado.

## Código

- [Cálculo da seleção e atualização](../../apps/desktop/frontend/src/features/align-text/model/paragraph-alignment.ts)
- [Editor da nota](../../apps/desktop/frontend/src/pages/notes/ui/note-text-node/controller.ts)
