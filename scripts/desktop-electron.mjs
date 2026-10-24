import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const desktop = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const frontend = join(desktop, 'frontend');
const manifest = fileURLToPath(new URL('../apps/desktop/backend/Cargo.toml', import.meta.url));
const command = process.argv[2] || 'dev';
process.env.VITE_DESKTOP_RUNTIME = 'electron';
const run = (executable, args, options = {}) => new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: desktop, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`${executable} exited (${signal || code})`)));
});
try {
    if (!['dev', 'build'].includes(command)) throw new Error('Use: desktop-electron.mjs dev|build [electron-builder arguments]');
    await run('cargo', ['build', '--manifest-path', manifest, '--locked', ...(command === 'build' ? ['--release'] : [])]);
    if (command === 'dev') {
        const server = await createServer({ root: frontend, configFile: join(frontend, 'vite.config.ts') });
        await server.listen();
        const electron = spawn(require('electron'), ['.'], { cwd: desktop, stdio: 'inherit', detached: process.platform === 'linux', env: { ...process.env, OMEGA_DEV_URL: 'http://127.0.0.1:1420/' } });
        const stop = () => electron.kill('SIGTERM');
        process.once('SIGINT', stop); process.once('SIGTERM', stop);
        const code = await new Promise((resolve, reject) => { electron.once('error', reject); electron.once('close', resolve); });
        await server.close();
        process.exitCode = code ?? 1;
    } else {
        await run(process.execPath, [require.resolve('typescript/bin/tsc'), '--project', 'frontend/tsconfig.json', '--noEmit']);
        await run(process.execPath, [join(dirname(require.resolve('vite/package.json')), 'bin/vite.js'), 'build', frontend, '--config', join(frontend, 'vite.config.ts')]);
        await run(process.execPath, [require.resolve('electron-builder/cli.js'), '--config', 'bridge/electron/electron-builder.yml', ...process.argv.slice(3)]);
    }
} catch (error) { console.error(error); process.exitCode = 1; }
