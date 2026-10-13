import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const desktopDirectory = fileURLToPath(new URL("../apps/desktop/", import.meta.url));
const tauriCli = fileURLToPath(new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url));

const child = spawn(process.execPath, [tauriCli, ...process.argv.slice(2)], {
    cwd: desktopDirectory,
    stdio: "inherit",
    env: process.env,
});
child.on("error", (error) => {
    console.error("Não foi possível iniciar o Tauri:", error.message);
    process.exitCode = 1;
});
child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
});