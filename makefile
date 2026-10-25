.PHONY: install dev typecheck test test-backend test-electron build build-desktop

install:
	yarn install --frozen-lockfile

dev:
	yarn dev:desktop

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