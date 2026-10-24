import type { DesktopApi } from './desktop-contract';

export const isDesktopRuntime = (): boolean => typeof window !== 'undefined' && !!window.omegaDesktop;
export const isTauriRuntime = (): boolean => import.meta.env?.VITE_DESKTOP_RUNTIME === 'tauri';
const desktop = (): DesktopApi => {
    if (!isDesktopRuntime()) throw Error('DESKTOP_UNAVAILABLE');
    return window.omegaDesktop!;
};
const channels = new Map<string, Channel<unknown>>();
const subscribed = new WeakMap<DesktopApi, Promise<void>>();
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
        if (command !== 'terminal_open') active.forEach(channel => channel.close());
        return result;
    } catch (error) { active.forEach(channel => channel.close()); throw error; }
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
