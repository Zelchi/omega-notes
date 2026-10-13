# Organização do repositório

```text
apps/
  desktop/          Aplicativo desktop (SolidJS, Vite e Tauri)
    src/            Frontend com Feature-Sliced Design
    tauri/          Backend Rust, configuração e ícones do aplicativo
    lang/           Traduções do aplicativo
    public/         Arquivos públicos do frontend desktop
  web/              Site de divulgação, reservado para implementação futura
    src/            Código do site
    public/         Arquivos públicos do site
docs/               Documentação do repositório
scripts/            Preparação de versões e tarefas do repositório
.github/            GitHub Actions
package.json        Workspaces e comandos da raiz
yarn.lock           Lockfile único para os workspaces
changelog.md        Histórico das versões do aplicativo
readme.md           Apresentação do produto
```

## Dependências e comandos

Execute na raiz do repositório:

```sh
yarn install --frozen-lockfile
make dev
```

Os comandos existentes continuam disponíveis na raiz:

- `npm run dev`: frontend do desktop no Vite.
- `npm run tauri -- dev` ou `npm run dev:desktop`: aplicativo desktop com Tauri.
- `yarn typecheck`: tipos do frontend desktop.
- `yarn build`: build do frontend desktop.
- `npm run build:desktop`: build nativo do desktop.

As dependências pertencem ao `package.json` de cada aplicativo. O Yarn gerencia
os workspaces e usa um lockfile único, com dependências instaladas na raiz.
A versão do aplicativo é definida em `apps/desktop/package.json`,
`apps/desktop/tauri/Cargo.toml`, `apps/desktop/tauri/Cargo.lock` e
`apps/desktop/tauri/tauri.conf.json`.

O site tem pasta e manifest próprios, mas ainda não possui página, servidor,
framework ou build. Eles serão definidos quando o site for implementado.

## Publicação

O workflow de release usa `apps/desktop` como diretório do aplicativo. O script
`scripts/prepare-release.mjs` permanece na raiz e resolve os arquivos do desktop
pelo próprio caminho do script, independentemente do diretório do terminal.

Leia [Publicação e atualizações](releases.md) para gerar uma release.
