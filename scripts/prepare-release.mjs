import { readFile, writeFile } from "node:fs/promises";

const desktopDirectory = new URL("../apps/desktop/", import.meta.url);
const desktopFile = (path) => new URL(path, desktopDirectory);

const repository = process.env.GITHUB_REPOSITORY;
const tag = process.env.RELEASE_TAG;
if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("GITHUB_REPOSITORY deve usar o formato dono/repositorio.");
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error("RELEASE_TAG deve usar o formato v0.1.9.");
const packageJson = JSON.parse(await readFile(desktopFile("package.json"), "utf8"));
const config = JSON.parse(await readFile(desktopFile("tauri/tauri.conf.json"), "utf8"));
const cargo = await readFile(desktopFile("tauri/Cargo.toml"), "utf8");
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1];
const version = tag.slice(1);
if ([packageJson.version, config.version, cargoVersion].some((value) => value !== version)) {
	throw new Error("A tag e os arquivos package.json, tauri.conf.json e Cargo.toml de apps/desktop devem ter a mesma versão.");
}
if (!config.plugins?.updater?.pubkey?.trim()) throw new Error("A chave pública do atualizador não está configurada.");
const endpoint = `https://github.com/${repository}/releases/latest/download/latest.json`;
await writeFile(desktopFile("tauri/tauri.release.conf.json"), JSON.stringify({
	bundle: { createUpdaterArtifacts: true },
	plugins: { updater: { endpoints: [endpoint] } },
}, null, 2) + "\n");
console.log(`Versão ${version}; fonte de atualizações: ${endpoint}`);