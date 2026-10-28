import type { DesktopApi } from './desktop-contract';

export const isDesktopRuntime = (): boolean => typeof window !== 'undefined' && !!window.omegaDesktop;
export const isTauriRuntime = (): boolean => import.meta.env?.VITE_DESKTOP_RUNTIME === 'tauri';
const desktop = (): DesktopApi => {
    if (!isDesktopRuntime()) throw Error('DESKTOP_UNAVAILABLE');
    return window.omegaDesktop!;
};
const channels = new Map<string, Channel<unknown>>();
const subscribed = new WeakMap<DesktopApi, Promise<void>>();
type CancellableRead = { cancel: () => Promise<void> };
const cancellableReads = new Map<string, Set<CancellableRead>>();
const pausedVaultReads = new Set<string>();
function subscribeChannels() {
    const api = desktop();
    let subscription = subscribed.get(api);
    if (subscription) return subscription;
    subscription = Promise.resolve(api.onChannel((id, payload) => {
        const channel = channels.get(id);
        if (!channel) return;
        channel.onmessage(payload);
        if (payload && typeof payload === 'object' && 'kind' in payload && payload.kind === 'exit') channels.delete(id);
    })).then(() => {});
    subscribed.set(api, subscription);
    return subscription;
}
export class Channel<T> {
    readonly id = crypto.randomUUID();
    onmessage: (message: T) => void = () => {};
    close() { channels.delete(this.id); }
}
export async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    const active: Channel<unknown>[] = [];
    const serialize = (value: unknown): unknown => {
        if (value instanceof Channel) {
            subscribeChannels(); channels.set(value.id, value); active.push(value);
            return { __omegaChannel: value.id };
        }
        if (Array.isArray(value)) return value.map(serialize);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
        return value;
    };
    try {
        const serializedArgs = serialize(args) as Record<string, unknown>;
        if (active.length) await subscribeChannels();
        const result = await desktop().invoke<T>(command, serializedArgs);
        // Stream completion can arrive after the RPC response; its consumer closes the channel.
        if (command !== 'terminal_open' && command !== 'stream_note_summaries' && command !== 'read_studies') active.forEach(channel => channel.close());
        return result;
    } catch (error) { active.forEach(channel => channel.close()); throw error; }
}
export function invokeCancellable<T>(command: string, args: Record<string, unknown>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(Error("NOTE_READ_CANCELLED"));
    const vaultId = typeof args.vaultId === 'string' ? args.vaultId : undefined;
    if (vaultId && pausedVaultReads.has(vaultId)) return Promise.reject(Error("NOTE_READ_CANCELLED"));
    const operationId = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        let cancellation: Promise<void> | undefined;
        const reads = vaultId ? cancellableReads.get(vaultId) ?? new Set<CancellableRead>() : undefined;
        const read: CancellableRead = { cancel: () => {
            if (cancellation) return cancellation;
            if (settled) return Promise.resolve();
            settled = true;
            signal.removeEventListener('abort', abort);
            cancellation = invoke<void>('cancel_note_read', { operationId }).then(() => undefined);
            void cancellation.then(
                () => reject(Error("NOTE_READ_CANCELLED")),
                error => reject(error instanceof Error ? error : Error("NOTE_READ_CANCEL_FAILED")),
            ).finally(removeRead);
            return cancellation;
        } };
        const removeRead = () => {
            if (!vaultId || !reads) return;
            reads.delete(read);
            if (!reads.size) cancellableReads.delete(vaultId);
        };
        const abort = () => { void read.cancel().catch(() => undefined); };
        if (vaultId && reads) {
            reads.add(read);
            cancellableReads.set(vaultId, reads);
        }
        const cleanup = () => {
            signal.removeEventListener('abort', abort);
            removeRead();
        };
        signal.addEventListener('abort', abort, { once: true });
        void invoke<T>(command, { ...args, operationId }).then(value => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(value);
        }, error => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
        });
        if (signal.aborted) abort();
    });
}
export function registerCancellableRead(vaultId: string, controller: AbortController): () => void {
    const reads = cancellableReads.get(vaultId) ?? new Set<CancellableRead>();
    const read: CancellableRead = { cancel: async () => { controller.abort(); } };
    reads.add(read);
    cancellableReads.set(vaultId, reads);
    if (pausedVaultReads.has(vaultId)) controller.abort();
    return () => {
        reads.delete(read);
        if (!reads.size) cancellableReads.delete(vaultId);
    };
}
export async function withCancellableReadsPaused<T>(vaultId: string, operation: () => Promise<T>): Promise<T> {
    pausedVaultReads.add(vaultId);
    try {
        const reads = [...(cancellableReads.get(vaultId) ?? [])];
        const cancellations = await Promise.allSettled(reads.map(read => read.cancel()));
        const failure = cancellations.find(result => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
        return await operation();
    } finally {
        pausedVaultReads.delete(vaultId);
    }
}
export async function listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void> {
    return await desktop().onEvent((name, payload) => { if (name === event) handler({ payload: payload as T }); });
}
export const confirm = (message: string, options: { title?: string; kind?: string; okLabel?: string; cancelLabel?: string } = {}): Promise<boolean> => invoke('dialog_confirm', { message, options });
export const open = (options: { title?: string; multiple?: boolean; directory?: boolean; filters?: { name: string; extensions: string[] }[] }): Promise<string | string[] | null> => invoke('dialog_open', { options });
export const openUrl = (url: string): Promise<void> => invoke('open_url', { url });
export const pathForFile = (file: File): Promise<string> => Promise.resolve(desktop().pathForFile(file));

export async function readBinary(command: string, args: Record<string, unknown>): Promise<ArrayBuffer> {
    const chunks: Uint8Array[] = [];
    const channel = new Channel<string>();
    let failure: unknown;
    channel.onmessage = value => {
        try { chunks.push(Uint8Array.from(atob(value), character => character.charCodeAt(0))); }
        catch (error) { failure = error; }
    };
    const length = await invoke<number>(command, { ...args, onChunk: channel });
    if (failure) throw failure;
    if (!Number.isSafeInteger(length) || length < 0) throw Error("Invalid binary response length");
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    if (offset !== length) throw Error('Incomplete binary response');
    return bytes.buffer;
}
