import { registerHooks } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

const source = fileURLToPath(new URL('../src/', import.meta.url));
// Resolve the same @ alias and extensionless TS imports used by Vite.
// Worklet URLs are not executed in these model tests.
registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('?worker&url')) return { url: 'data:text/javascript,export default "test-worklet.js"', shortCircuit: true };
    let path;
    if (specifier.startsWith('@/')) path = resolvePath(source, specifier.slice(2));
    else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) path = fileURLToPath(new URL(specifier, context.parentURL));
    if (path) {
        const candidate = [path + '.ts', path + '.js', path + '/index.ts'].find(file => existsSync(file) && statSync(file).isFile());
        if (candidate) return nextResolve(pathToFileURL(candidate).href, context);
    }
    return nextResolve(specifier, context);
} });
