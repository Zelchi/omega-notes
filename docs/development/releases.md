# Publicação e atualização desktop

O desktop compartilha SolidJS e o crate Rust de backend. Linux x64 usa Electron e publica `.deb`/`.rpm`; Windows x64 usa Tauri e publica o instalador NSIS `.exe`. macOS e AppImage não fazem parte do produto.

## Desenvolvimento e builds

`yarn dev:desktop` e `yarn build:desktop` escolhem o host pelo sistema operacional. No Fedora/Ubuntu, o fluxo usa Electron; no Windows, Tauri. Os comandos `*:electron` e `*:tauri` permitem selecionar o host manualmente.

As saídas Electron ficam em `apps/desktop/release`. O Tauri gera o instalador e seu pacote updater em `apps/desktop/bridge/tauri/target/release/bundle/nsis`.

## Atualizações

Os dois hosts consultam `native-latest.json`, mas cada um instala seu formato:

- Linux: o backend baixa o `.deb` ou `.rpm` do gerenciador instalado, valida a assinatura Minisign e instala via APT/DNF com Polkit.
- Windows: o plugin updater do Tauri valida e instala o `.nsis.zip` assinado. O `.exe` NSIS continua disponível para a instalação inicial.

O manifesto mantém `packages.linux-x86_64` para o updater Rust e `platforms.windows-x86_64` para o updater Tauri. O Tauri exige HTTPS e assinatura; a chave pública embutida fica em `bridge/tauri/tauri.conf.json` e é sincronizada por `yarn release:prepare`. Nenhuma chave privada entra nos pacotes.

No Linux, o fluxo segue o Techdoro: assinatura verificada antes e depois do download e instalação pelo gerenciador do sistema. No Windows, o Tauri verifica a assinatura e encerra o app ao iniciar o instalador; o frontend espera os salvamentos antes de chamar a instalação.

## CI e publicação

Ao enviar uma tag `vX.Y.Z`, o GitHub Actions compila os pacotes Linux e Windows, assina os instaladores, gera o manifesto do updater e publica a release. O workflow não executa testes nem exige aceite manual.

Atualize a versão em `apps/desktop/package.json`, nos dois `Cargo.toml` e em `bridge/tauri/tauri.conf.json`; acrescente `## vX.Y.Z` em `changelog.md` e envie uma nova tag. O workflow:

1. Gera `.deb`/`.rpm` com Electron no Linux e NSIS `.exe`/`.nsis.zip` com Tauri no Windows.
2. Assina os pacotes Linux com `cargo-packager`; verifica também a assinatura Tauri do `.nsis.zip` usando o backend.
3. Gera um manifesto comum com os campos Linux e Windows.
4. Cria uma release em rascunho, envia os instaladores, assinaturas e manifesto, e publica ao final.

Use `CARGO_PACKAGER_SIGN_PRIVATE_KEY` para assinar os pacotes Linux e `TAURI_SIGNING_PRIVATE_KEY` para criar o artefato updater Windows. Ambos podem apontar para a mesma chave Minisign. As variáveis `*_PASSWORD` correspondentes são opcionais. A chave deve corresponder a `apps/desktop/bridge/electron/updater-public-key.txt`; `OMEGA_UPDATER_PUBLIC_KEY` pode substituir a chave pública no build coordenado.

Uma release publicada não deve receber pacotes novos. Crie uma versão maior; o workflow permite repetir uma release que ainda esteja em rascunho.

## Checklist manual opcional

Este checklist fica fora do workflow de publicação. Se quiser validar a experiência manualmente, confira edição e salvamento, seleção de vault, importação/drag-drop/clipboard de imagens e GIFs, estudos e IA, terminal e cancelamento, timer, bandeja, janela, teclado, mudança de monitor, escala e retomada de suspensão. Também valide atualização com Polkit no Fedora/Ubuntu e com o updater Tauri no Windows, incluindo cancelamento de senha e falha de salvamento.
