import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const requested = process.argv[2] || 'dev';
const explicitRuntime = ['electron', 'tauri'].includes(requested);
const runtime = explicitRuntime ? requested : process.platform === 'linux' ? 'electron' : process.platform === 'win32' ? 'tauri' : null;
const command = explicitRuntime ? process.argv[3] || 'dev' : requested;
const args = explicitRuntime ? process.argv.slice(4) : process.argv.slice(3);

if (!runtime) throw new Error(`Runtime desktop não configurado para ${process.platform}.`);
if (!['dev', 'build'].includes(command)) throw new Error('Use: desktop.mjs [electron|tauri] dev|build [argumentos]');

let child;
if (runtime === 'tauri') {
	if (process.platform !== 'win32') throw new Error('O host Tauri está configurado para Windows; no Linux, use Electron.');
	child = spawn('cargo', ['tauri', command, ...args], { cwd: fileURLToPath(new URL('../apps/desktop/bridge/tauri/', import.meta.url)), stdio: 'inherit' });
} else {
	child = spawn(process.execPath, [fileURLToPath(new URL('./desktop-electron.mjs', import.meta.url)), command, ...args], { stdio: 'inherit' });
}

child.once('error', error => { console.error(error); process.exitCode = 1; });
child.once('close', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
