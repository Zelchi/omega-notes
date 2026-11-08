# Biblioteca de PDFs

## Uso

O botão de arquivo na barra abre o painel de PDFs do Vault ativo. A coleção pode
conter vários documentos, mas o leitor abre um por vez. Na importação, escolha um
arquivo `.pdf` e informe o título que será exibido; o nome de origem não vira
título. A biblioteca também permite renomear e apagar documentos.

O leitor mostra uma página por vez, ajusta a escala à área disponível e permite
navegar entre páginas e alterar o zoom. Redimensionar o painel recalcula a página
sem mudar a posição. O progresso e o total de páginas são salvos no Vault e a
leitura reabre na última página concluída.

Para marcar um trecho, selecione o texto na página e clique com o botão direito.
O menu de contexto permite copiar, realçar a seleção ou pesquisá-la no Google.
Para apagar uma marcação, clique com o botão direito sobre ela e escolha remover.
As marcações reaparecem ao reabrir o documento.

## Armazenamento e limites

Cada Vault mantém um catálogo versionado em `vaults/<id>/.pdfs.json` e arquivos
com nomes internos em `vaults/<id>/pdfs/<uuid>.pdf`. O título é metadado; não é
usado como caminho. Vaults antigos sem catálogo começam com uma coleção vazia.
Como os arquivos ficam dentro da pasta do Vault, acompanham cópias, recuperação e
exclusão dessa pasta.
As marcações ficam em arquivos `vaults/<id>/pdfs/<uuid>.highlights.json`, separados
do conteúdo original do PDF; cada retângulo usa coordenadas normalizadas por página.

- Tamanho máximo: 512 MiB por PDF.
- Máximo de 1.000 documentos por Vault.
- Título obrigatório, limitado a 500 caracteres.
- O catálogo guarda tamanho, data de importação, última página e total conhecido.
- A validação de importação exige arquivo regular, extensão `.pdf` e assinatura
  `%PDF-` no início do conteúdo; não é uma validação criptográfica completa do
  documento.

## Leitura local

O frontend usa PDF.js (`pdfjs-dist`) e carrega seu worker sob demanda. CMaps,
fontes padrão, perfis ICC e módulos WASM são empacotados com o frontend. Electron
serve esses assets por uma rota estática allowlistada do protocolo
`omega-image://static`; Tauri e o Vite de desenvolvimento os carregam por URLs
locais relativas. O PDF em si nunca é enviado por IPC ou Base64: o backend serve
somente um documento presente no catálogo, identificado por IDs canônicos, por
um servidor local em `127.0.0.1` com token e suporte a `Range`.

A leitura e o armazenamento não dependem da internet. PDFs são conteúdo não
confiável: o leitor renderiza páginas e não executa scripts ou ações embutidas.

## Verificações

```sh
yarn typecheck
yarn test:desktop
cargo test --manifest-path apps/desktop/backend/Cargo.toml
```

Os assets estáticos também são verificados nos builds de produção dos frontends
Electron e Tauri. Builds do host Tauri/Windows devem ser executados em Windows.
