# Organização do repositório

```text
apps/desktop/
  frontend/                  SolidJS, componentes, recursos, assets e traduções
  backend/                   Serviços Rust, protocolo, armazenamento e atualizador
  bridge/
    electron/                Main, preload, transporte, ícones e chave pública
    tauri/                   Host Windows Tauri e configuração do updater
apps/web/                    Site Astro independente
scripts/                     Desenvolvimento, build e preparação de releases
docs/                        Documentação do produto e desenvolvimento
```

Use Node.js 22.12+, Yarn 1, Rust 1.95+ e Tauri CLI 2.12.3. O frontend continua em SolidJS; não existe backend Node para os dados do usuário. Linux usa Electron e um processo backend Rust; Windows usa Tauri e o mesmo crate Rust em processo.

```sh
yarn install --frozen-lockfile
yarn dev:desktop
```

`yarn dev:desktop` escolhe Electron no Linux e Tauri no Windows. Os comandos `dev:desktop:electron` e `dev:desktop:tauri` selecionam um host explicitamente. A interface tem HMR; alterações Rust exigem reiniciar o host. `yarn dev:frontend` abre somente o frontend no navegador, com os fallbacks existentes.

| Comando | Função |
| --- | --- |
| `yarn typecheck` | Tipos do frontend |
| `yarn test:desktop` | Testes Solid/TypeScript |
| `yarn test:backend` | Testes dos serviços Rust |
| `yarn test:electron` | Build Rust e testes reais de RPC/bridge |
| `yarn build` | Build do frontend |
| `yarn build:desktop` | Seleciona o host e empacota para o sistema atual |
| `yarn build:desktop:electron --dir` | Empacota Electron sem instalador |
| `yarn build:desktop:tauri --no-bundle` | Compila o host Tauri sem instalador |

As saídas Electron ficam em `apps/desktop/release` e incluem .deb/.rpm. O Tauri gera NSIS .exe e artefatos de atualização em `apps/desktop/bridge/tauri/target/release/bundle/nsis`. A versão precisa coincidir em `apps/desktop/package.json`, nos dois `Cargo.toml` e em `bridge/tauri/tauri.conf.json`; cada crate Rust mantém seu lock Cargo e o lock Yarn é único na raiz.

O site Astro mantém seus comandos `yarn dev:web`, `check:web`, `build:web` e `preview:web`. Sua publicação pelo workflow Pages é independente do desktop.

Veja [arquitetura desktop](../architecture/desktop-runtime.md) e [releases](releases.md).
