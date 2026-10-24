# Vaults e isolamento de dados

## Ciclo de vida

Na inicialização, o app lê o registro de vaults e o ID ativo. Cada vault mantém suas notas, itens/progresso de estudo, cartões Kanban e tarefas To Do em armazenamento separado. O timer Pomodoro e as preferências de interface são globais à instalação.

Antes de trocar, renomear ou excluir um vault, o app tenta descarregar salvamentos ativos de notas, Chat, Kanban, estudos e Pomodoro. A seleção só atualiza a navegação após o backend confirmar a troca; então listas e painéis observam o novo ID e descartam estado visual associado ao anterior.

## Falhas e cobertura

O backend resolve os diretórios a partir do registro e valida vault ativo/ID em comandos de dados. A tela permite repetir uma leitura inicial com falha e apresenta erros de nome duplicado, operação e limpeza. Não há teste dedicado de ciclo completo do vault na suíte atual; mudanças externas e retorno ao vault são cobertos parcialmente por [notes-external.test.mjs](../../apps/desktop/frontend/test/notes-external.test.mjs).

## Código

- [Entidade e repositórios](../../apps/desktop/frontend/src/entities/vault/)
- [Controlador da interface](../../apps/desktop/frontend/src/features/manage-vault/model/vaults.controller.ts)
- [Registro e caminhos](../../apps/desktop/backend/src/vaults/repository.rs)
- [Comandos](../../apps/desktop/backend/src/vaults/commands.rs)
