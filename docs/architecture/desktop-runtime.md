# Arquitetura desktop

```text
SolidJS compartilhado
        ↓
contrato `window.omegaDesktop`
      ↙                 ↘
Electron no Linux    Tauri no Windows
      ↘                 ↙
    crate Rust compartilhado
```

## Interface e bridge

`apps/desktop/frontend/src` contém a interface SolidJS e o contrato `DesktopApi`, definido em `apps/desktop/frontend/src/shared/lib/desktop-contract.ts`. Os recursos chamam `apps/desktop/frontend/src/shared/lib/desktop.ts`; não importam APIs do Electron ou do Tauri diretamente.

No Linux, `apps/desktop/bridge/electron/preload.cjs` implementa o contrato por IPC. O processo principal inicia `apps/desktop/backend` como subprocesso Rust e encaminha respostas, eventos e canais por stdin/stdout.

No Windows, `apps/desktop/bridge/tauri` implementa o mesmo contrato com APIs Tauri e chama `DesktopBackend` do crate compartilhado em processo. O crate contém os serviços de notas, vaults, estudos, IA, timer, terminal e updates. O host fornece diretórios e eventos; a lógica de domínio permanece no backend.

O app valida comandos, argumentos e URLs na fronteira da bridge. O WebView não recebe acesso Node. Navegação externa, seletores de arquivo, comandos de janela e bandeja são responsabilidade do host.

## Atualizações

Linux usa o atualizador Rust existente: manifesto `native-latest.json`, pacotes `.deb` e `.rpm`, assinatura Minisign e instalação por APT/DNF com Polkit. O gerenciador de pacotes mantém o registro do sistema.

Windows usa o plugin updater do Tauri. A instalação inicial e as atualizações usam o mesmo NSIS `.exe`, cuja assinatura é gerada em `.exe.sig`. Ambos os hosts usam o manifesto estático `native-latest.json`; `platforms.windows-x86_64` serve o Tauri e `packages.linux-x86_64` serve o atualizador Linux.

O workflow de release só publica após validação gráfica explicitamente habilitada. Builds locais não publicam nem enviam pacotes.

## Desenvolvimento e builds

`yarn dev:desktop` e `yarn build:desktop` selecionam o host pelo sistema: Electron no Linux e Tauri no Windows. Há comandos explícitos `dev:desktop:electron`, `build:desktop:electron`, `dev:desktop:tauri` e `build:desktop:tauri` para cada host.

O renderer usa a mesma saída Vite. O build Tauri define `VITE_DESKTOP_RUNTIME=tauri` e ativa o adapter Tauri antes do bootstrap SolidJS. A API pública da interface permanece comum.
