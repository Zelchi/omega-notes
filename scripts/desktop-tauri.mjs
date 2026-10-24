import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const desktop = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const frontend = join(desktop, 'frontend');
const command = process.argv[2] || 'build';
const env = { ...process.env, VITE_DESKTOP_RUNTIME: 'tauri' };

if (command === 'dev') {
	process.env.VITE_DESKTOP_RUNTIME = 'tauri';
	const server = await createServer({ root: frontend, configFile: join(frontend, 'vite.config.ts') });
	await server.listen();
	const close = () => { void server.close().finally(() => process.exit(0)); };
	process.once('SIGINT', close);
	process.once('SIGTERM', close);
} else if (command === 'build') {
	const run = (executable, args) => new Promise((resolve, reject) => {
		const child = spawn(executable, args, { cwd: desktop, env, stdio: 'inherit' });
		child.once('error', reject);
		child.once('close', code => code === 0 ? resolve() : reject(new Error(`${executable} exited (${code})`)));
	});
	await run(process.execPath, [require.resolve('typescript/bin/tsc'), '--project', 'frontend/tsconfig.json', '--noEmit']);
	await run(process.execPath, [join(dirname(require.resolve('vite/package.json')), 'bin/vite.js'), 'build', frontend, '--config', join(frontend, 'vite.config.ts')]);
} else {
	throw new Error('Use: desktop-tauri.mjs dev|build');
}
