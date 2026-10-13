# Organização do repositório

```text
apps/
  desktop/          Aplicativo desktop (SolidJS, Vite e Tauri)
    src/            Frontend com Feature-Sliced Design
    tauri/          Backend Rust, configuração e ícones do aplicativo
    lang/           Traduções do aplicativo
    public/         Arquivos públicos do frontend desktop
  web/              Site de divulgação em Astro
    src/            Páginas, layouts, componentes e estilos do site
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

Use Node.js 22.12 ou superior e Yarn 1. Para executar o desktop, também é necessário
ter Rust e as dependências de sistema do Tauri instaladas.

Execute na raiz do repositório:

```sh
yarn install --frozen-lockfile
npm run dev:desktop
```

Os comandos são definidos no `package.json` da raiz. O projeto não usa Makefile.

| Comando | Função |
| --- | --- |
| `npm run dev:desktop` | Inicia o aplicativo Tauri e seu frontend Vite. |
| `yarn dev` | Inicia apenas o frontend desktop em `http://127.0.0.1:1420`. |
| `yarn typecheck` | Confere os tipos do frontend desktop. |
| `yarn build` | Gera o frontend em `apps/desktop/dist`. |
| `npm run build:desktop` | Compila e empacota o aplicativo nativo. |
| `npm run tauri -- <argumentos>` | Executa o CLI do Tauri dentro de `apps/desktop`. |

Os pacotes nativos ficam em `apps/desktop/tauri/target/release/bundle`.
Para gerar pacotes com o atualizador habilitado, siga [Publicação e atualizações](releases.md).

As dependências pertencem ao `package.json` de cada aplicativo. O Yarn gerencia
os workspaces e usa um lockfile único, com dependências instaladas na raiz.
A versão do aplicativo é definida em `apps/desktop/package.json`,
`apps/desktop/tauri/Cargo.toml`, `apps/desktop/tauri/Cargo.lock` e
`apps/desktop/tauri/tauri.conf.json`.

O site usa Astro e possui build estático independente. Na raiz, use:

- `yarn dev:web`: servidor do site na porta 4321.
- `yarn check:web`: tipos e arquivos Astro.
- `yarn build:web`: build do site em `apps/web/dist`.
- `yarn preview:web`: prévia do site gerado.

Ao adicionar dependências, execute `yarn install` na raiz e inclua `yarn.lock`
no commit. Depois disso, instalações reproduzíveis usam `--frozen-lockfile`.

Veja [o guia do site](../apps/web/readme.md) para a estrutura do Astro.

Desktop e web usam `@/` para imports a partir do `src` de cada aplicativo.
As configurações e os componentes pertencem ao respectivo workspace.

## Publicação

O workflow de release usa `apps/desktop` como diretório do aplicativo. O script
`scripts/prepare-release.mjs` permanece na raiz e resolve os arquivos do desktop
pelo próprio caminho do script, independentemente do diretório do terminal.

Leia [Publicação e atualizações](releases.md) para gerar uma release.

O site usa `.github/workflows/pages.yml` e é publicado no GitHub Pages a partir
da branch `main`. A configuração inicial e o endereço estão no
[guia do site](../apps/web/readme.md#publicação-no-github-pages).
