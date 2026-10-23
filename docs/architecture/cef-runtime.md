# Runtime CEF no Tauri 3 desktop

## Estado

Escopo revisado: CEF no Linux e Wry com WebView2 no Windows, usando Tauri 3
alpha. O suporte a macOS não faz parte do produto. Artefatos de teste podem ser
gerados, mas nada pode ser publicado antes de cumprir os critérios de aceitação
deste documento.

O pin solicitado é Tauri `3.0.0-alpha.5` com `tauri-runtime-cef`
`3.0.0-alpha.6`. As notas oficiais da alpha.6 declaram dependência de Tauri
alpha.5, runtime alpha.4 e CEF `154.5.0+154.0.34`.

O app aceita imagens estáticas e GIFs. Importação e reprodução de áudio e vídeo
foram removidas; os critérios de CEF não incluem codecs ou streaming de mídia.

## Objetivo

Usar Chromium/CEF como runtime WebView no Linux e o runtime Wry/WebView2 no
Windows. Manter os formatos de pacote atuais: `.deb`/`.rpm` no Linux e
instalador NSIS no Windows. macOS e mobile ficam fora do escopo.

## Desenho

- Usar `tauri-runtime-cef` apenas no Linux e `tauri-runtime-wry` no Windows;
  não adicionar `cef-rs` diretamente nem manter um runtime CEF próprio.
- Baixar no Linux a distribuição CEF oficial pré-compilada correspondente à
  versão do runtime, fixada por versão e checksum. Não compilar Chromium/CEF do
  código-fonte.
- Selecionar CEF nos builds Linux e Wry/WebView2 nos builds Windows, em
  `tauri dev` e nos pacotes finais. macOS não é um alvo suportado.
- Aplicar o despachante dos processos auxiliares do CEF apenas à entrada
  Linux de `main.rs`. Manter a API dinâmica do Tauri para compartilhar comandos,
  plugins e estado entre runtimes; adaptar tipos que nomeiem `tauri::Wry`, como
  o menu da bandeja.
- Atualizar Tauri, CLI, API e os plugins oficiais `dialog`, `opener`, `updater`
  e `process` para versões compatíveis com Tauri 3 alpha. A toolchain precisa de
  Rust 1.95 ou superior.
- Remover do build experimental o plugin NVIDIA específico de Tauri 2/GTK3 e os
  ajustes de ambiente específicos do WebKit. No Linux, CEF usa GTK4; GTK3 e GTK4
  não podem ser inicializados juntos no mesmo processo.
- Manter `tray-icon` sem a feature `linux-libappindicator`: no Tauri 3 o tray usa
  KSNI por padrão e não depende da versão GTK do runtime. Habilitar
  `linux-libappindicator` introduziria o backend GTK3 incompatível com CEF/GTK4.
- Desativar os recursos padrão de `tauri-plugin-dialog` no build CEF e usar
  `xdg-portal`, pois o padrão habilita GTK3 no processo. Empacotar `zenity` para
  mensagens e fallback quando o backend XDG não estiver disponível; o backend
  XDG, quando disponível, é fornecido pelo ambiente desktop. GTK3 pode existir
  no processo auxiliar, mas não pode ser carregado pelo app ou por `libcef`.
- Atualizar configuração e CI para Linux e Windows. No Linux, remover a
  dependência explícita de WebKitGTK e conferir o helper setuid do sandbox nos
  pacotes. No Windows, manter Wry/WebView2 e não baixar nem empacotar CEF.
- Manter a publicação bloqueada durante a experiência. A CI pode compilar e
  guardar artefatos de teste sem criar releases. Manter os formatos Linux atuais
  e os identificadores do atualizador após o aceite.

Usar a distribuição CEF `154.0.34+g14c5a08` compatível com o crate travado,
Chromium `154.0.8037.98` (branch 8037), para Linux x64 e Windows x64. O build
baixa automaticamente os arquivos oficiais, verifica o checksum e mantém a
distribuição no cache do CEF, fora do Git. A ABI precisa corresponder à versão
do crate `cef` travado.

O script de desenvolvimento não define `CEF_PATH`: no Linux, o Tauri usa o
cache padrão `~/.cache/tauri-cef`. O Windows usa Wry/WebView2 e não baixa CEF. O
workflow Linux restaura o cache do GitHub Actions. O teste Rust direto na CI
aponta `CEF_PATH` para o cache Linux padrão porque não passa pelo Tauri CLI.
Uma variável `CEF_PATH` definida manualmente ainda pode substituir o caminho
padrão no Linux.

## Wayland no runtime CEF Linux

O runtime `tauri-runtime-cef 3.0.0-alpha.6` ainda usa X11 no Linux: inicializa
Chromium com `--ozone-platform=x11`, define `GDK_BACKEND=x11` e cria um host
CEF a partir de um XID, onde reparenta as WebViews. Em uma sessão Wayland isso
roda por XWayland; não é uma janela Wayland nativa. O fallback em
`src/window_drag.rs` que chama a API de redimensionamento do Tauri para handles
que não sejam X11 não muda essa seleção de backend e não é alcançado pelo
runtime atual.

A cor de fundo acompanha o tema e a tela ativa através do comando
`set_window_background_color`. No Linux, além do fundo GTK, o comando configura
o fundo nativo da janela e dos filhos X11 diretos, incluindo o host do CEF.
Isso permite preencher as regiões expostas durante o redimensionamento com a
cor do canvas enquanto o Chromium atualiza seus limites. As superfícies
internas do Chromium não são alteradas. No Windows, o frontend usa a API de
cor de fundo do Tauri/WebView2.

### Spike OSR em GTK Wayland

O spike local é opt-in com `OMEGA_CEF_WAYLAND_OSR=1`. Ele mantém o Ozone do CEF
em X11, inicia a janela GTK em Wayland e cria o navegador CEF como windowless,
sem o host X11 filho. Os frames de CPU de `OnPaint` são exibidos em uma área
Cairo do GTK; a superfície é reaproveitada e só as regiões alteradas pelo CEF
são copiadas. Eventos básicos de mouse e teclado são encaminhados ao CEF. A
janela principal é criada manualmente para definir os atributos offscreen do
runtime. O modo usa o perfil CEF `cef-wayland-osr`, separado do perfil normal,
para permitir testar enquanto a sessão padrão estiver aberta; cookies e
armazenamento local do WebView ficam separados nesse modo.

Na validação interativa em dois monitores, o usuário confirmou que o conteúdo
renderiza, aceita interação e a piscada desapareceu ao maximizar/restaurar no
monitor DP. Isso demonstra que manter a janela GTK nativa em Wayland evita o
problema observado, mesmo com o CEF usando Ozone X11 para renderizar offscreen.

O caminho padrão continua em X11. O usuário relatou desempenho muito ruim no
spike, comparável ao Wry com Tauri 2. Reutilizar a superfície e copiar apenas as
regiões alteradas remove alocações e cópias de frame completo, mas o CEF ainda
faz rasterização por CPU; isso não comprova desempenho aceitável. O callback
acelerado do CEF fornece DMA-BUF no Linux, mas o CEF devolve o buffer ao pool
quando o callback termina. Para exibir esses frames com segurança, falta copiá-los
para uma textura própria por GPU. O suporte upstream a OSR acelerado via Ozone
continua aberto no [CEF #3263](https://github.com/chromiumembedded/cef/issues/3263).
O spike ainda não valida IME, popups, drag and drop, consumo de CPU ou sessões
sem XWayland.

Os pacotes Linux CEF do Tauri incluem `libcef`, recursos, locale e o helper de
sandbox. O `.deb`/`.rpm` declara GTK4 e `zenity`; o ambiente desktop fornece o
backend XDG. Os pacotes ainda precisam ser inspecionados e instalados para
validar o conteúdo real.

## Critérios de aceitação

1. Linux compila e inicia com CEF; Windows compila e inicia com Wry/WebView2.
   Apenas o pacote Linux empacota a distribuição CEF pré-compilada.
2. O Linux compila e inicia sem WebKitGTK instalado; `.deb` e `.rpm` contêm
   Chromium, GTK4 e o helper de sandbox esperado. O executável e `libcef` não
   podem carregar GTK3.
3. O instalador Windows não leva CEF e usa Wry/WebView2.
4. Em instalação real, Linux e Windows não mantêm um núcleo de CPU ocupado em
   repouso. Medir os dois sistemas. O issue upstream #16189 relata esse loop no
   runtime CEF Linux alpha.4 e continua aberto; como o alpha.6 não lista essa
   correção, medir o runtime escolhido antes de aceitar. No Linux, testar
   NVIDIA + Wayland e pelo menos uma sessão sem NVIDIA.
5. Importação e exibição de imagens e GIFs continuam funcionando nos dois sistemas.
6. Arrastar arquivos do sistema para notas, reordenar cartões no Kanban, edição
   e navegação por teclado, bandeja, controles de janela e atualizador continuam
   funcionando em Linux e Windows.
7. Validar manualmente `.deb`, `.rpm` e instalador Windows; manter testes
   automatizados existentes para o backend e frontend. A CI compila Linux com
   CEF e Windows com Wry/WebView2. O `cef-dll-sys` valida o checksum ao baixar o
   CEF; nenhum job compila Chromium/CEF.
8. Não integrar ao fluxo de produção nem criar uma release até todos os itens
   acima passarem.

## Riscos conhecidos

- Tauri 3 e CEF continuam em alpha; APIs e empacotamento podem mudar.
- O Tauri CLI `3.0.0-alpha.5` adiciona `libgtk-3-0`/`gtk3` aos metadados de
  pacotes Linux mesmo para CEF. O runtime CEF usa GTK4; a CI permite esse
  requisito extra do pacote, avisa sobre ele e verifica que o executável e
  `libcef` não carreguem GTK3. `zenity` também pode trazer GTK3 como dependência,
  mas roda fora do processo CEF. A instalação dos pacotes ainda precisa ser
  validada.
- O issue upstream [#16189](https://github.com/tauri-apps/tauri/issues/16189)
  descreve a thread principal do CEF Linux presa a um núcleo em repouso por um
  source GLib do Chromium; permanece aberto. O issue
  [#16131](https://github.com/tauri-apps/tauri/issues/16131) relata drag and
  drop HTML5 quebrado no CEF Linux e permanece sem triagem. Testar separadamente
  arrastar arquivos do sistema para notas e reordenar cartões no Kanban.
- O spike GTK Wayland/OSR ainda tem desempenho muito ruim e não valida IME,
  popups, drag and drop, consumo de CPU nem ambientes sem XWayland. O issue
  upstream [#3263](https://github.com/chromiumembedded/cef/issues/3263) trata da
  composição acelerada OSR via Ozone, que não é usada por este spike.
- Uma falha nos critérios mantém `CEF_RUNTIME_ACCEPTED` desativada; o workflow
  de publicação falha antes de criar um rascunho de release.

## Fora de escopo

- Publicar CEF ou migrar a versão de produção para Tauri 3 alpha.
- Suporte ou publicação para macOS.
- Suportar AppImage.
- Reescrever recursos do produto para contornar incompatibilidades do CEF antes
  de identificá-las nos testes.

## Referências

- [Índice oficial de arquivos CEF e checksums](https://cef-builds.spotifycdn.com/index.json)
- [Migração para Tauri 3 alpha](https://v3.tauri.app/de/start/migrate/from-tauri-2/)
- [Tauri 3.0.0-alpha.5](https://github.com/tauri-apps/tauri/releases/tag/tauri-v3.0.0-alpha.5)
- [Runtime CEF 3.0.0-alpha.6](https://github.com/tauri-apps/tauri/releases/tag/tauri-runtime-cef-v3.0.0-alpha.6)
- [Fonte do runtime CEF alpha.6 no Linux](https://docs.rs/tauri-runtime-cef/3.0.0-alpha.6/src/tauri_runtime_cef/runtime.rs.html)
- [CEF: documentação de off-screen rendering](https://github.com/chromiumembedded/cef/blob/master/docs/general_usage.md#off-screen-rendering)
- [CEF #3263 — implementar OSR usando Ozone](https://github.com/chromiumembedded/cef/issues/3263)
- [Runtime CEF e empacotamento](https://v3.tauri.app/develop/cef/)
- [Runtime de Webview e seleção por build](https://v3.tauri.app/develop/webview-runtime/)
- [Tauri #16189 — CPU ociosa no CEF Linux](https://github.com/tauri-apps/tauri/issues/16189)
- [Tauri #16131 — drag and drop no CEF Linux](https://github.com/tauri-apps/tauri/issues/16131)
