import { defineConfig } from "vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import { fileURLToPath, URL } from "node:url";
import solid from "vite-plugin-solid";

export default defineConfig({
	plugins: [vanillaExtractPlugin(), solid()],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	clearScreen: false,
	server: {
		host: "127.0.0.1",
		port: 1420,
		strictPort: true,
	},
	envPrefix: ["VITE_", "TAURI_ENV_*"],
	build: {
		target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
		minify: !process.env.TAURI_ENV_DEBUG ? "oxc" : false,
		sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
	},
});
