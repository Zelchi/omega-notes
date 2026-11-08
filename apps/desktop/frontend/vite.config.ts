import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";
import { fileURLToPath, URL } from "node:url";
import { createRequire } from "node:module";
import { createReadStream } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import solid from "vite-plugin-solid";
import { defineConfig, type Plugin } from "vite";

const pdfjsRoot = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

const collectFiles = async (directory: string): Promise<string[]> => {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(entries.map(entry => {
		const path = resolve(directory, entry.name);
		return entry.isDirectory() ? collectFiles(path) : entry.isFile() ? [path] : [];
	}));
	return nested.flat();
};

const pdfjsAssets: Plugin = {
	name: "pdfjs-static-assets",
	configureServer(server) {
		server.middlewares.use((request, response, next) => {
			const requestUrl = request.url;
			if (!requestUrl?.startsWith("/pdfjs/")) return next();
			void (async () => {
				if (request.method !== "GET" && request.method !== "HEAD") {
					response.statusCode = 405;
					response.end();
					return;
				}
				const pathname = new URL(requestUrl, "http://localhost").pathname;
				const segments = decodeURIComponent(pathname).split("/").filter(Boolean);
				const folder = segments[1];
				if (segments[0] !== "pdfjs" || !folder || !["cmaps", "iccs", "standard_fonts", "wasm"].includes(folder)
					|| segments.length < 3 || segments.some(part => part === "." || part === ".." || !/^[A-Za-z0-9_.-]+$/.test(part))) {
					response.statusCode = 404;
					response.end();
					return;
				}
				const root = resolve(pdfjsRoot, folder);
				const file = resolve(root, ...segments.slice(2));
				const pathFromRoot = relative(root, file);
				if (!pathFromRoot || pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === "..") {
					response.statusCode = 404;
					response.end();
					return;
				}
				const actual = await realpath(file);
				const actualRelative = relative(root, actual);
				if (actualRelative.startsWith(`..${sep}`) || actualRelative === ".." || !(await stat(actual)).isFile()) {
					response.statusCode = 404;
					response.end();
					return;
				}
				response.statusCode = 200;
				response.setHeader("Content-Type", extname(actual) === ".wasm" ? "application/wasm" : "application/octet-stream");
				response.setHeader("Cache-Control", "no-store");
				if (request.method === "HEAD") response.end();
				else createReadStream(actual).on("error", () => response.destroy()).pipe(response);
			})().catch(() => {
				if (!response.headersSent) {
					response.statusCode = 404;
					response.end();
				}
			});
		});
	},
	async generateBundle() {
		for (const folder of ["cmaps", "iccs", "standard_fonts", "wasm"]) {
			const directory = resolve(pdfjsRoot, folder);
			for (const file of await collectFiles(directory)) {
				const name = relative(directory, file).split(sep).join("/");
				this.emitFile({ type: "asset", fileName: `pdfjs/${folder}/${name}`, source: await readFile(file) });
			}
		}
	},
};

const imageSource = process.env.VITE_DESKTOP_RUNTIME === "tauri"
	? "http://omega-image.localhost"
	: "omega-image:";

export default defineConfig({
	base: "./",
	plugins: [vanillaExtractPlugin(), solid(), pdfjsAssets, {
		name: "desktop-csp",
		transformIndexHtml(html, context) {
			if (context.server) return html;
			const assetConnectSource = process.env.VITE_DESKTOP_RUNTIME !== "tauri" ? " omega-image:" : "";
			const content = `default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: ${imageSource}; media-src 'self' blob: data: http://127.0.0.1:*; font-src 'self' data:; connect-src 'self' http://127.0.0.1:*${assetConnectSource} https://*.api.radio-browser.info https://api.somafm.com; object-src 'none'; base-uri 'none'; frame-src 'none'`;
			return [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content }, injectTo: "head" }];
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
