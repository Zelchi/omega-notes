# Publicação e atualizações

## Plataformas

- Windows 10/11 x64: instalador NSIS (`.exe`).
- Ubuntu 22.04 ou mais recente x64: pacote `.deb`.
- Fedora x64: pacote `.rpm`.

Os pacotes Linux são nativos e declaram as dependências de GTK, WebKitGTK, GStreamer e autenticação do sistema. O build usa Ubuntu 22.04 como base para os dois formatos. O nome técnico do pacote é `omega-notes`; o nome exibido no menu e no aplicativo é Ômega Notes. A execução em Ubuntu e Fedora ainda precisa ser conferida com os instaladores produzidos pelo GitHub.

## Configuração inicial do GitHub

1. Envie este projeto para um repositório público do GitHub. As versões publicadas devem permitir download público.
2. Abra **Settings → Secrets and variables → Actions → New repository secret**.
3. Cadastre `TAURI_SIGNING_PRIVATE_KEY` com o conteúdo completo do arquivo local `.keys/updater.key`.
4. A chave criada nesta configuração não tem senha. Nesse caso, deixe `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` ausente. Se gerar outra chave com senha, cadastre também esse segredo.
5. Guarde uma cópia da chave privada fora do projeto. Ela assina as próximas versões aceitas pelos aplicativos já instalados. A chave pública está em `tauri/tauri.conf.json` e deve ser enviada ao GitHub.

A pasta `.keys/` está ignorada pelo Git. Não envie a chave privada para o repositório. A assinatura do atualizador é distinta de um certificado de assinatura de código do Windows.

O workflow identifica o próprio repositório e configura `https://github.com/<dono>/<repositorio>/releases/latest/download/latest.json` durante o build. Não é necessário colocar token ou endereço de atualização no frontend.

## Publicar uma versão

1. Use a mesma versão em `package.json`, `tauri/Cargo.toml` e `tauri/tauri.conf.json`.
2. Atualize os arquivos de lock junto com as dependências e a versão do pacote Rust.
3. Faça commit, crie uma tag com essa versão e envie ao GitHub. Atualmente o projeto está em `0.1.0`:

```sh
git add .
git commit -m "Prepare release 0.1.0"
git tag v0.1.0
git push origin HEAD
git push origin v0.1.0
```

Uma tag publicada deve apontar para o commit completo da versão. Para outra versão, substitua `0.1.0` nos três arquivos e nos comandos. A preparação recusa uma tag que não corresponda aos arquivos do projeto.

O workflow `.github/workflows/release.yml`:

1. Confere a versão e a presença da chave privada nos secrets.
2. Cria um release em rascunho.
3. Compila e assina os pacotes `.deb`, `.rpm` e o instalador Windows.
4. Agrega `linux-x86_64-deb`, `linux-x86_64-rpm` e `windows-x86_64-nsis` no `latest.json`.
5. Publica somente quando os dois builds, os três instaladores e o manifesto estão completos.

Em caso de falha, a versão permanece em rascunho. Corrija o problema e execute novamente o workflow para a mesma tag. Para uma versão já publicada, crie uma nova tag com versão maior.

Também é possível executar **Actions → Publicar versão → Run workflow**, informando uma tag existente.

## Atualização do aplicativo

No aplicativo empacotado, a verificação ocorre ao iniciar. Quando há uma versão mais recente, o pacote é baixado e sua assinatura é verificada pelo Tauri. O aplicativo bloqueia a edição durante a instalação, conclui os salvamentos pendentes, instala e reinicia. Se o salvamento falhar, a instalação é interrompida. Se o diálogo de nome de nota ou o gestor de Vaults estiver aberto, o download é mantido e a instalação automática aguarda o fechamento do diálogo.

O botão no final das configurações continua permitindo conferir uma versão e instalar uma atualização disponível. O texto indica verificação, versão disponível, download, instalação ou falha. O aviso “Verificação indisponível” dura dois segundos.

No navegador, em `make dev` e em builds sem endpoint de release, a atualização permanece indisponível. No Linux, o atualizador seleciona o mesmo formato em que o aplicativo foi instalado: `.deb` usa `dpkg`, e `.rpm` usa `rpm`. A instalação pode solicitar autenticação do sistema por `pkexec`. A versão instalada do plugin já implementa esses dois formatos. A detecção usa o tipo do pacote gravado pelo Tauri no executável.

## Builds locais com atualização habilitada

Depois de configurar a versão e o repositório, no Linux:

```sh
GITHUB_REPOSITORY=dono/repositorio RELEASE_TAG=v0.1.0 node scripts/prepare-release.mjs
TAURI_SIGNING_PRIVATE_KEY="$PWD/.keys/updater.key" yarn tauri build --bundles deb,rpm --config tauri/tauri.release.conf.json -- --locked
```

O arquivo `tauri/tauri.release.conf.json` é gerado e está ignorado pelo Git. Para Windows, use `--bundles nsis` em uma máquina Windows e forneça `TAURI_SIGNING_PRIVATE_KEY` no ambiente.

Referências: [atualizador do Tauri](https://v2.tauri.app/plugin/updater/), [tauri-action](https://github.com/tauri-apps/tauri-action) e [pacotes Debian](https://v2.tauri.app/distribute/debian/), [pacotes RPM](https://v2.tauri.app/distribute/rpm/) e [implementação dos instaladores Linux do atualizador](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/updater/src/updater.rs).

## Primeira instalação no Linux

No Ubuntu, baixe o `.deb` do release e instale pelo aplicativo de pacotes ou por `sudo apt install ./arquivo.deb`. No Fedora, baixe o `.rpm` e instale pelo aplicativo de pacotes ou por `sudo dnf install ./arquivo.rpm`. Esses gestores resolvem as dependências declaradas no pacote. Depois da primeira instalação, o aplicativo verifica as próximas versões ao iniciar.
