WEBKIT_DISABLE_DMABUF_RENDERER ?= 1

.PHONY: dev dev-native

dev:
	WEBKIT_DISABLE_DMABUF_RENDERER=$(WEBKIT_DISABLE_DMABUF_RENDERER) npm run tauri -- dev

dev-native:
	npm run tauri -- dev