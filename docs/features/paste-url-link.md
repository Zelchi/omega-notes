# Colar URL como link

## Ciclo de vida

Ao colar uma URL em um bloco de texto elegível, a feature consulta o título da página e substitui a URL por um link Markdown com esse título. A URL é preservada como destino; caracteres que quebrariam Markdown são escapados ou codificados. Se a consulta falhar ou não houver título utilizável, o texto colado original permanece.

Links dentro de código ou em trechos onde a substituição alteraria outro link não são tratados como URL simples.

## Falhas e cobertura

A consulta de título é assíncrona e pode falhar por rede, redirecionamento ou resposta sem título; essa falha não deve bloquear a edição. Não há teste dedicado do fluxo de colagem.

## Código

- [Reconhecimento e resolução](../../apps/desktop/src/features/paste-url-link/model/pasted-link.ts)
- [Busca do título no backend](../../apps/desktop/tauri/src/web/title.rs)
- [Integração no editor](../../apps/desktop/src/pages/notes/ui/note-text-node/controller.ts)
