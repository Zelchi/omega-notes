# Catálogo e reutilização de mídia

## Ciclo de vida

Ao abrir o catálogo na nota atual, o frontend pede uma lista de referências de mídia das notas do vault. No desktop, o backend varre arquivos `.omega`, extrai apenas referências de imagem, áudio e vídeo e não desserializa os demais elementos completos. Arquivos inválidos, inacessíveis ou sem um formato/ID compatível são ignorados. O fallback web lê o armazenamento JSON próprio.

Referências repetidas ao mesmo ID são agrupadas e mostram os títulos das notas que usam aquela mídia. Imagens são carregadas em grupos de até quatro; áudio e vídeo mostram ícones. Selecionar uma mídia reutiliza seu ID na nota atual. Importar cria uma cópia gerenciada no armazenamento do vault. A limpeza de órfãos exige confirmação e considera referências, backups e notas excluídas.

## Falhas e cobertura

Enquanto a lista carrega, o catálogo mostra o estado de carregamento. Uma falha de leitura ou troca de vault aparece como erro com opção de tentar novamente; resultados atrasados de outro contexto são descartados. Erros ao carregar uma imagem ainda ficam somente no console.

`media-catalog.test.mjs` cobre falha/repetição, troca de contexto, tipos de mídia e agrupamento de referências compartilhadas. O teste Rust em `repository.rs` cobre a extração de imagem, áudio e vídeo entre notas e ignora formatos de áudio não suportados.

## Código

- [Controlador do catálogo](../../apps/desktop/src/pages/notes/ui/media-catalog-dialog/controller.ts)
- [Lista de referências no frontend](../../apps/desktop/src/entities/note/api/notes.repository.ts)
- [Extração no backend](../../apps/desktop/tauri/src/notes/repository.rs)
- [Carregamento/limpeza da mídia](../../apps/desktop/src/pages/notes/api/media.repository.ts)
