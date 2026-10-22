# Gerenciar vaults

## Ciclo de vida

Na inicialização, o app carrega a biblioteca e o vault ativo. Se não houver vault ativo ou a leitura falhar, o diálogo abre para permitir seleção ou nova tentativa. Selecionar outro vault salva o estado editável antes da troca e reinicia a navegação no Canvas; criar, renomear, reordenar e excluir atualizam a biblioteca a partir do resultado do repositório.

Os diálogos preservam rascunhos enquanto são apenas ocultados. Uma troca de vault limpa rascunhos que dependem do vault anterior. Excluir o último vault reabre o diálogo para criar ou escolher outro.

## Dados e limites

O desktop mantém registro, diretórios e notas isolados por vault. A exclusão remove os dados do vault; erros de limpeza são comunicados separadamente quando o registro já foi atualizado. A implementação de fallback web tem seu próprio armazenamento. Não há teste dedicado.

## Código

- [Controlador](../../apps/desktop/src/features/manage-vault/model/vaults.controller.ts)
- [Entidade e repositórios](../../apps/desktop/src/entities/vault/)
- [Comandos desktop](../../apps/desktop/tauri/src/vaults/commands.rs)
