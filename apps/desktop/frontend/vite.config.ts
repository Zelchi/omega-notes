import { defineConfig } from "vite";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import { fileURLToPath, URL } from "node:url";
import solid from "vite-plugin-solid";

export default defineConfig({
	base: "./",
	plugins: [vanillaExtractPlugin(), solid(), {
        name: "desktop-csp",
        transformIndexHtml(html, context) {
            if (context.server) return html;
            return [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob: data: http://127.0.0.1:*; font-src 'self' data:; connect-src 'self' https://*.api.radio-browser.info https://api.somafm.com; object-src 'none'; base-uri 'none'; frame-src 'none'" }, injectTo: "head" }];
        },
    }],
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
	envPrefix: ["VITE_"],
	build: { target: "chrome130", minify: "oxc", sourcemap: false },
});
