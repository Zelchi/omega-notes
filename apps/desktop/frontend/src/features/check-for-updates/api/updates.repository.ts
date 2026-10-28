import { invoke, isDesktopRuntime, isTauriRuntime, listen } from '@/shared/lib/desktop';
export type Update = { version: string; body?: string };
export type DownloadEvent =
    | { event: 'Started'; data: { contentLength?: number } }
    | { event: 'Progress'; data: { chunkLength: number } }
    | { event: 'Finished' };
type TauriUpdate = NonNullable<Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>>>;
const tauriUpdates = new Map<string, TauriUpdate>();
export const updatesConfigured = (): Promise<boolean> => isTauriRuntime()
    ? Promise.resolve(import.meta.env.PROD)
    : isDesktopRuntime() ? invoke('updater_ready') : Promise.resolve(false);
export const checkForUpdates = async (): Promise<Update | null> => {
    if (!isTauriRuntime()) return invoke('updater_check');
    const candidate = await (await import('@tauri-apps/plugin-updater')).check();
    if (!candidate) return null;
    tauriUpdates.set(candidate.version, candidate);
    return { version: candidate.version, body: candidate.body ?? undefined };
};
export const downloadUpdate = async (update: Update, onEvent: (event: DownloadEvent) => void): Promise<void> => {
    if (isTauriRuntime()) {
        const candidate = tauriUpdates.get(update.version);
        if (!candidate) throw new Error('UPDATE_NOT_FOUND');
        await candidate.download(onEvent);
        return;
    }
    const unlisten = await listen<DownloadEvent>('update-download', event => onEvent(event.payload));
    try { await invoke('updater_download', { version: update.version }); } finally { unlisten(); }
};
export const installUpdate = async (update: Update): Promise<void> => {
    if (isTauriRuntime()) {
        const candidate = tauriUpdates.get(update.version);
        if (!candidate) throw new Error('UPDATE_NOT_FOUND');
        await candidate.install();
        await invoke('relaunch_app');
        return;
    }
    return invoke('updater_install', { version: update.version });
};
