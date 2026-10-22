# Atualizações

## Ciclo de vida

Em produção, o controlador agenda uma verificação depois que a janela fica ociosa (ou após um atraso curto, se o navegador não oferece `requestIdleCallback`). O botão também pode iniciar uma verificação manual. O estado passa por verificação, disponível/atual, download, instalação ou falha.

Ao instalar, o app baixa a versão, espera o salvamento das notas e dos estados registrados pelo fechamento e então chama o instalador Tauri. A atualização disponível é mantida se a instalação não puder começar naquele momento.

## Falhas e limites

Sem fonte de atualização configurada, a verificação volta ao estado neutro depois de mostrar indisponibilidade. Falhas são registradas no console e ficam visíveis como estado de falha; tentar novamente inicia outra verificação. Não há teste dedicado do controlador. Empacotamento e manifesto estão em [Publicação e atualizações](../development/releases.md).

## Código

- [Controlador](../../apps/desktop/src/features/check-for-updates/model/updates.controller.ts)
- [Botão](../../apps/desktop/src/features/check-for-updates/ui/check-for-updates-button.tsx)
- [Configuração Tauri](../../apps/desktop/tauri/src/app/updates.rs)
