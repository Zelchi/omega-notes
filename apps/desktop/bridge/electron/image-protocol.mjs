import { createReadStream } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const isCanonicalUuid = value => typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const imageTypes = new Map([
    ['png', 'image/png'], ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['gif', 'image/gif'],
    ['webp', 'image/webp'], ['bmp', 'image/bmp'], ['avif', 'image/avif'],
]);
const pdfAssetFolders = new Set(['cmaps', 'iccs', 'standard_fonts', 'wasm']);

const isWithinDirectory = (directory, candidate) => {
    const pathFromDirectory = relative(directory, candidate);
    return pathFromDirectory !== ''
        && pathFromDirectory !== '..'
        && !pathFromDirectory.startsWith(`..${sep}`)
        && !isAbsolute(pathFromDirectory);
};

const safePdfAssetPath = async (assetRoot, pathname) => {
    if (!assetRoot || typeof pathname !== 'string') return undefined;
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length < 3 || segments[0] !== 'pdfjs' || !pdfAssetFolders.has(segments[1])
        || segments.some(segment => segment === '.' || segment === '..' || !/^[A-Za-z0-9_.-]+$/.test(segment))) return undefined;
    const root = resolve(assetRoot);
    const candidates = [resolve(root, ...segments), resolve(root, ...segments.slice(1))];
    let actualRoot;
    try {
        actualRoot = await realpath(root);
    } catch {
        return undefined;
    }
    for (const candidate of candidates) {
        if (!isWithinDirectory(root, candidate)) continue;
        try {
            const actual = await realpath(candidate);
            if (isWithinDirectory(actualRoot, actual) && (await lstat(actual)).isFile()) return actual;
        } catch {
            continue;
        }
    }
    return undefined;
};

const response = (status, message) => new Response(message, {
    status,
    headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Type': 'text/plain; charset=utf-8',
    },
});

export async function serveNoteImage(request, resolveImagePath, pdfAssetRoot) {
    if (request.method !== 'GET') return response(405, 'Method not allowed');
    try {
        const url = new URL(request.url);
        if (url.protocol === 'omega-image:' && url.hostname === 'static' && !url.username && !url.password && !url.port && !url.search && !url.hash) {
            const path = await safePdfAssetPath(pdfAssetRoot, url.pathname);
            if (!path) return response(404, 'Asset unavailable');
            const contentType = extname(path).toLowerCase() === '.wasm' ? 'application/wasm' : 'application/octet-stream';
            return new Response(Readable.toWeb(createReadStream(path)), {
                status: 200,
                headers: {
                    'Content-Type': contentType,
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-store',
                    'X-Content-Type-Options': 'nosniff',
                },
            });
        }
        const vaultId = url.hostname;
        const imageId = url.pathname.slice(1);
        if (url.protocol !== 'omega-image:' || url.username || url.password || url.port || url.search || url.hash
            || !isCanonicalUuid(vaultId) || !isCanonicalUuid(imageId) || url.pathname !== `/${imageId}`) {
            return response(404, 'Image unavailable');
        }
        const imagePath = await resolveImagePath(vaultId, imageId);
        const contentType = imageTypes.get(imagePath.split('.').at(-1).toLowerCase());
        if (!contentType) return response(404, 'Image unavailable');
        return new Response(Readable.toWeb(createReadStream(imagePath)), {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        if (String(error).includes('NOTE_IMAGE_VAULT_CHANGED')) return response(403, 'Vault changed');
        return response(404, 'Image unavailable');
    }
}
