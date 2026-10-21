# Questionário: layout aprovado

Este documento registra o layout do modal de configuração do Questionário aprovado pelo usuário em 2026-10-21. Trate os screenshots aprovados nessa conversa como referência visual.

**Não altere o tamanho, o alinhamento, os paddings, os gaps, a quantidade por página ou o comportamento da rolagem deste modal sem um pedido explícito do usuário.** Mudanças genéricas no `CustomScrollArea` também podem afetar outras telas; não as use para ajustar o Questionário.

## Referência visual

- **Imagem 1 aprovada:** em uma janela com espaço suficiente, os controles, a busca, os oito itens e a paginação aparecem juntos, sem scrollbar. O conjunto fica centralizado horizontal e verticalmente na área entre o cabeçalho e o rodapé, com espaço visual equilibrado acima e abaixo.
- **Imagens 2 e 3 aprovadas:** em janelas mais baixas, a área central rola quando necessário. O cabeçalho e o rodapé com os botões permanecem visíveis; a lista pode ficar parcialmente fora da área visível. A scrollbar deve continuar funcional e acompanhar o início e o fim reais da trilha.
- Quando o conteúdo rola, a busca permanece presa ao topo da área central, logo abaixo da divisória superior.
- O modal mantém a altura definida pelo layout do Questionário entre configuração e estudo; não reduza a área central para esconder espaço livre nem para evitar a rolagem em janelas menores.
- A busca fica acima da lista. A distância entre busca e itens, o intervalo entre os itens e a posição dos controles de paginação são intencionais.
- O modo de debug foi removido. Não reintroduza contornos, fundos de diagnóstico ou atributos `data-study-debug-region`.

## Valores que formam esse layout

- `libraryPageSize` é `8` em `study-dialog.tsx`. A busca aparece quando há mais de oito itens salvos; a paginação aparece quando há mais de oito resultados filtrados.
- `quizContent` mantém a área central com `min(580px, 72dvh)`.
- `centerContentVertically` centraliza o conteúdo quando ele cabe; `zeroVerticalPadding` remove o padding vertical padrão do viewport.
- `quizSetupBody` zera a margem vertical e o padding direito reservado pelo corpo genérico, para manter o conjunto centralizado quando não há scrollbar.
- A biblioteca usa `gap: 8px`; o invólucro da busca tem padding superior de `18px` e inferior de `8px`; cada botão de item mantém altura mínima de `36px`.
- A scrollbar padrão usa trilha vertical com `8px` no topo e embaixo. O cálculo correspondente em `controller.ts` desconta `16px`. Na horizontal, os insets são `8px` e `20px`, totalizando `28px`. No modo compacto, os insets são `2px` por lado, totalizando `4px`. Se qualquer inset mudar, atualize em conjunto a geometria calculada; não esconda a scrollbar para disfarçar divergências.

## Código relacionado

- `apps/desktop/src/features/study-notes/ui/study-dialog.tsx`
- `apps/desktop/src/features/study-notes/ui/style.css.ts`
- `apps/desktop/src/shared/ui/custom-scroll-area/index.tsx`
- `apps/desktop/src/shared/ui/custom-scroll-area/style.css.ts`
- `apps/desktop/src/shared/ui/custom-scroll-area/controller.ts`
