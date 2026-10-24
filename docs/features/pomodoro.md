# Pomodoro e To Do

## Ciclo de vida

O timer é global à instalação: foco, pausa curta, pausa longa, ciclos, restante e prazo absoluto ficam no estado nativo do app. Ao iniciar, o backend persiste o prazo; ao reabrir, calcula o tempo restante e avança a fase se o prazo expirou. A interface consulta o timer enquanto está rodando e a bandeja pode iniciar, pausar, reiniciar ou avançar a fase.

A lista To Do é independente do timer e pertence ao vault. Criar, concluir, renomear, reordenar e remover itens salvam uma lista validada por vault. Ocultar o painel preserva timer e tarefas.

## Disponibilidade e riscos

O botão da barra abre o painel em builds de desenvolvimento e produção. A lista To Do continua vinculada ao vault ativo, enquanto o timer permanece global à instalação. A disponibilidade em produção é coberta por [production-features.test.mjs](../../apps/desktop/frontend/test/production-features.test.mjs).

O teste protege o contrato de montagem da interface; a abertura da janela nativa em instaladores ainda requer smoke test manual no Windows e no Linux.

Configurações do timer ficam no armazenamento local da instalação, estado do timer em `.pomodoro-state.json` no diretório de dados do app e tarefas em `.pomodoro-tasks.json` no vault.

## Código

- [Controlador](../../apps/desktop/frontend/src/features/pomodoro/model/controller.ts)
- [Armazenamento de tarefas](../../apps/desktop/frontend/src/features/pomodoro/api/tasks.repository.ts)
- [Estado nativo do timer](../../apps/desktop/backend/src/pomodoro.rs)
- [Tarefas por vault](../../apps/desktop/backend/src/vaults/pomodoro_tasks.rs)
- [Acesso pela bandeja](../../apps/desktop/backend/src/tray.rs)
