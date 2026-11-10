.PHONY: install dev dev\:linux dev\:win typecheck test test-backend test-electron build build-desktop

WINE ?= wine
WINEPREFIX ?= $(HOME)/.local/share/omega-notes-wine64

install:
	yarn install --frozen-lockfile

dev:
	yarn dev:desktop

dev\:linux:
	yarn dev:desktop:electron

dev\:win:
	@command -v "$(WINE)" >/dev/null 2>&1 || { printf '%s\n' 'Wine não encontrado; instale-o ou defina WINE=/caminho/para/wine.'; exit 1; }
	@command -v cargo-xwin >/dev/null 2>&1 || { printf '%s\n' 'Falta cargo-xwin. Instale com: cargo install --locked cargo-xwin'; exit 1; }
	@rustup target list --installed | grep -Fxq 'x86_64-pc-windows-msvc' || { printf '%s\n' 'Falta o target Rust Windows. Instale com: rustup target add x86_64-pc-windows-msvc'; exit 1; }
	@cd apps/desktop/bridge/tauri && WINEPREFIX="$(WINEPREFIX)" CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUNNER="$(WINE)" cargo tauri dev --runner cargo-xwin --target x86_64-pc-windows-msvc

typecheck:
	yarn typecheck

test:
	yarn test:desktop

test-backend:
	yarn test:backend

test-electron:
	yarn test:electron

build:
	yarn build

build-desktop:
	yarn build:desktop
