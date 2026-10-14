# Site de divulgação

Aplicativo Astro do site público do Ômega Notes. Gera arquivos estáticos em `dist/`.

## Executar

Na raiz do repositório, com Node.js 22.12 ou superior:

```sh
yarn install --frozen-lockfile
yarn dev:web
```

O site abre em `http://127.0.0.1:4321`.

- `yarn check:web`: confere os tipos e os arquivos Astro.
- `yarn build:web`: confere os tipos e gera o site em `apps/web/dist`.
- `yarn preview:web`: abre uma prévia do build.

Também é possível executar `yarn dev`, `yarn run check`, `yarn build` e `yarn preview`
diretamente nesta pasta.

## Estrutura

- `src/pages/`: páginas e rotas do site.
- `src/layouts/`: estrutura comum do HTML, título e metadados.
- `src/components/`: player de vídeo e scrollbar customizados, adaptados do desktop para Astro.
- `src/styles/`: estilos do site.
- `src/env.d.ts`: tipos do Astro, incluindo imports de CSS.
- `public/`: ícones e arquivos públicos.
- `astro.config.mjs`: configuração do Astro.
- `tsconfig.json`: tipos e alias `@/` para `src/`.

A página inicial apresenta o aplicativo, aponta para os downloads no GitHub e
exibe a demonstração `public/omega-1.mp4`. O player possui controles de reprodução,
progresso, volume e tela cheia. O enquadramento em 3:2 oculta as barras laterais
embutidas nessa gravação; ajuste `.video-frame` se substituir o vídeo por outro formato.

O vídeo inicia sem som e se repete em loop. No final da página,
`src/components/getting-started-guide.astro` apresenta um tutorial com primeiros
passos e seções expansíveis sobre canvas, formatação, mídias, atalhos, vaults e IA.
O link “Como usar” leva diretamente ao guia.

O fundo usa o mesmo padrão pontilhado do canvas. A rolagem da página usa uma
barra customizada de 5px, com suporte a arraste e teclado.

Use imports como `@/components/video-player.astro` e `@/styles/global.css`.
O desktop permanece em `../desktop`, com seus próprios comandos e dependências.

Ao alterar dependências, execute `yarn install` na raiz e inclua o `yarn.lock`
atualizado no commit. `@astrojs/check` precisa estar instalado para os comandos
de verificação de tipos; o build estático sozinho não substitui essa verificação.

## Publicação no GitHub Pages

O workflow `.github/workflows/pages.yml` publica o site quando alterações na web,
nos arquivos de dependências ou no próprio workflow chegam à branch `main`.
Também pode ser iniciado em **Actions → Publicar site → Run workflow**.

No repositório do GitHub, abra **Settings → Pages → Build and deployment** e
escolha **GitHub Actions** em **Source**. Não é necessário cadastrar secrets
para o site. Envie os arquivos ao GitHub para iniciar a primeira publicação.

Endereço configurado: **https://notes.zelchi.com/**.

Em **Settings → Pages → Custom domain**, cadastre `notes.zelchi.com` e salve.
No provedor DNS, mantenha o CNAME `notes` apontando para `zelchi.github.io`.
Após o GitHub validar o domínio e emitir o certificado, ative **Enforce HTTPS**.
Como a publicação usa Actions, não é necessário um arquivo `CNAME` no projeto.

O Astro usa `site: "https://notes.zelchi.com"` e `base: "/"`.
Ícone e vídeo usam `BASE_URL`. Para conferir o build de publicação localmente:

```sh
yarn build:web
yarn preview:web
```

Abra `http://127.0.0.1:4321/` nessa prévia. Ao mudar de domínio,
atualize `site` em `astro.config.mjs`.

O workflow do site é independente das releases do aplicativo desktop.

Referência: [Instalação e configuração do Astro](https://docs.astro.build/en/install-and-setup/).

Publicação: [Astro no GitHub Pages](https://docs.astro.build/en/guides/deploy/github/).
