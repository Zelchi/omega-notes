import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

const isCanonicalUuid = value => typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const imageTypes = new Map([
    ['png', 'image/png'], ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['gif', 'image/gif'],
    ['webp', 'image/webp'], ['bmp', 'image/bmp'], ['avif', 'image/avif'],
]);

const response = (status, message) => new Response(message, {
    status,
    headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Type': 'text/plain; charset=utf-8',
    },
});

export async function serveNoteImage(request, resolveImagePath) {
    if (request.method !== 'GET') return response(405, 'Method not allowed');
    try {
        const url = new URL(request.url);
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
