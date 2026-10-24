# Processo de documentação e regressão das features

**Status:** padrão de manutenção
**Objetivo:** tornar o comportamento das features fácil de entender e reduzir regressões sem criar documentação ou testes de manutenção cara.

## Contexto atual

- O desktop tem 19 pastas em `apps/desktop/frontend/src/features`; o inventário e os testes conhecidos estão no [índice da documentação](../readme.md).
- `.github/workflows/quality.yml` executa typecheck, testes desktop e testes Rust em pull requests e pushes para `main`; release e publicação do site permanecem em workflows próprios.
- A documentação está separada entre features, arquitetura e desenvolvimento. Cada feature tem um arquivo Markdown plano `docs/features/<slug>.md`, usando o slug de `apps/desktop/frontend/src/features/`; não criar `README.md` nem subpastas por feature.

## Princípios

1. Registrar comportamento observável, decisões de estado, persistência, efeitos e falhas relevantes; não repetir a implementação linha a linha.
2. Manter um memo curto para cada feature, descrevendo seu ciclo de vida atual. Não criar um documento por botão ou componente interno.
3. Testar contratos e regressões concretas. Não perseguir uma porcentagem global de cobertura nem criar snapshots frágeis de interface.
4. Reutilizar `node:test`, os testes Rust existentes e os comandos do projeto. Não adicionar dependências ou outro framework sem uma necessidade demonstrada.
5. Priorizar risco de perda ou corrupção de dados, isolamento entre vaults, processos externos e concorrência antes de ajustes visuais de baixo impacto.

## Documentação

Manter um índice em `docs/readme.md` com uma entrada para cada feature e os fluxos relevantes de `entities` e `pages`. O memo correspondente fica em `docs/features/<slug-da-feature>.md`; comportamentos compartilhados ficam em `docs/architecture/` e instruções de desenvolvimento em `docs/development/`. Cada memo segue a estrutura abaixo, ajustada ao tamanho e ao risco do fluxo:

- propósito e ponto de entrada;
- etapas do ciclo de vida e transições de estado;
- dados persistidos, escopo (vault/instalação) e limpeza;
- falhas, cancelamento e diferenças de plataforma relevantes;
- arquivos de código e regressões que protegem o comportamento.

O memo descreve o comportamento observado no código. Marcar explicitamente quando um fluxo não tem teste dedicado, é exclusivo de desenvolvimento ou depende de validação manual. O índice aponta para os memos e testes sem duplicar seu conteúdo.

## Testes de regressão e revisão

Revisar uma feature por ciclo:

1. Mapear o fluxo pelos chamadores, estado, dados e efeitos externos.
2. Escrever o contrato atual e identificar comportamentos que podem causar regressão.
3. Criar ou ajustar testes para os casos relevantes antes da correção ou refatoração, sempre que o comportamento puder ser exercitado fora de uma GUI real.
4. Corrigir/refatorar somente o necessário para os casos encontrados.
5. Atualizar a documentação para refletir o comportamento confirmado.
6. Executar os testes relacionados, a suíte completa e as verificações de tipo antes de concluir uma correção. Auditorias sem mudança de comportamento registram quais verificações foram executadas e o que ficou sem validação.

Os casos de regressão devem cobrir o fluxo principal e os limites que realmente importam para aquela feature, como entrada vazia, cancelamento, falha, repetição, operação atrasada após troca de vault, salvamento/reabertura e caminhos específicos do sistema operacional. Testes de GUI real ou integração com CLIs ficam fora da primeira etapa, exceto quando um bug não puder ser reproduzido por testes de unidade ou de controlador.

## CI

Adicionar uma verificação de qualidade para pull requests e atualizações da branch principal. Ela deve instalar dependências com lockfile congelado e executar:

- `yarn typecheck`;
- `yarn test:desktop`;
- `cargo test --locked --manifest-path apps/desktop/backend/Cargo.toml` para o backend Rust.

O workflow que implementa essa verificação é [quality.yml](../../.github/workflows/quality.yml). Ele não empacota instaladores; isso continua no workflow de release.

A CI roda em Linux. Smoke tests de janela nativa e validação do instalador Windows continuam manuais; registre essa limitação no `TASK.md` quando fizer parte da correção.

Quando uma feature depender de comportamento específico de Windows ou Linux, seus testes devem ser executados num runner do sistema correspondente. O workflow de release continua responsável pelo empacotamento; não substitui a verificação rápida de pull requests.

## Ordem inicial

1. Notas, vaults, persistência e mídias: integridade dos arquivos, concorrência, troca de vault e referências de mídia.
2. Integrações de IA: descoberta e inicialização de CLIs, Windows, UTF-8, sessões e cancelamento.
3. Métodos de estudo: seleção de fontes, geração/repetição, timer, fila e progresso.
4. Ciclo de vida de painéis e modais: ocultar/reabrir, operações em andamento e invalidação por contexto.
5. Demais features, ordenadas pelo impacto do erro e pela dificuldade de recuperação.

## Critérios de conclusão

- O índice cobre todas as features atuais e aponta para documentos e testes existentes.
- Cada fluxo de alto risco tem comportamento, efeitos e falhas documentados e testes que protegem as regressões conhecidas.
- Pull requests são bloqueados quando testes, typecheck ou testes Rust falham.
- Features simples podem permanecer sem página detalhada quando o índice e o código deixam seu comportamento claro e não há risco relevante sem cobertura.

## Fora de escopo

- Reescrever ou reorganizar todas as features antes de entender seus fluxos.
- Criar um guia longo para cada feature, componente ou função.
- Definir uma meta de cobertura percentual.
- Introduzir automação visual ou um novo framework de testes sem uma falha concreta que justifique o custo.
