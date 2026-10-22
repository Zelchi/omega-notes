# Preferências

## Ciclo de vida

Ao iniciar, as preferências são lidas do `localStorage`; valores inválidos ou indisponibilidade do armazenamento usam padrões. Alterações atualizam o estado em memória e, quando aplicável, os atributos do documento imediatamente. A gravação é local à instalação, não ao vault.

Recursos de IA e Gambiarra são mutuamente exclusivos. Idioma, tema, cursor, volume, atalhos, layout do Canvas, centralização e controles do Canvas têm chaves próprias. O painel de configurações direciona seus grupos para os controles correspondentes.

## Limites observados

O layout Arquivo pode ser selecionado e salvo em builds de produção. A leitura preserva uma preferência `archive` já existente. O contrato de persistência está coberto por [preferences.test.mjs](../../apps/desktop/test/preferences.test.mjs).

Falhas de gravação de preferências são registradas no console, mas a interface continua usando o valor em memória até reiniciar. Não há teste dedicado.

## Código

- [Controlador](../../apps/desktop/src/features/change-preferences/model/preferences.controller.ts)
- [Leitura e gravação](../../apps/desktop/src/features/change-preferences/api/preferences.repository.ts)
- [Configurações](../../apps/desktop/src/features/change-preferences/ui/settings-dialog/index.tsx)
