# Catálogo e reutilização de mídia

## Ciclo de vida

Ao abrir o catálogo na nota atual, o frontend pede as referências de imagens, áudios e vídeos do vault. No desktop, o backend varre arquivos `.omega` e extrai os IDs e extensões necessários sem desserializar os demais elementos completos. Arquivos inválidos, inacessíveis ou sem IDs/extensões compatíveis são ignorados. O fallback web lê o armazenamento JSON próprio.

Referências repetidas ao mesmo tipo e ID são agrupadas e mostram os títulos das notas que usam aquela mídia. Imagens são carregadas em grupos de até quatro; áudio e vídeo aparecem com seus ícones no catálogo. Selecionar qualquer item reutiliza seu ID na nota atual. Importar cria uma cópia gerenciada em `images/`, `audios/` ou `videos/`. Os players de áudio e vídeo recebem uma URL do servidor local Rust, que permite busca por faixa. Ao salvar alterações ou excluir notas, arquivos de mídia candidatos só são removidos se não forem referenciados por notas, backups, snapshots de renomeação, cópias de recuperação ou notas excluídas.

## Falhas e cobertura

Enquanto a lista carrega, o catálogo mostra o estado de carregamento. Uma falha de leitura ou troca de vault aparece como erro com opção de tentar novamente; resultados atrasados de outro contexto são descartados. Falhas de reprodução de áudio ou vídeo aparecem no player.

`media-catalog.test.mjs` cobre falha/repetição, troca de contexto e agrupamento de referências compartilhadas de imagem, áudio e vídeo. O teste Rust em `repository.rs` cobre a extração dos três tipos e a rejeição de extensões não suportadas.

## Código

- [Controlador do catálogo](../../apps/desktop/frontend/src/pages/notes/ui/media-catalog-dialog/controller.ts)
- [Lista de referências no frontend](../../apps/desktop/frontend/src/entities/note/api/notes.repository.ts)
- [Extração no backend](../../apps/desktop/backend/src/notes/repository.rs)
- [Carregamento/limpeza da mídia](../../apps/desktop/frontend/src/pages/notes/api/media.repository.ts)
