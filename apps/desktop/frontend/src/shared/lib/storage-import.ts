import { invoke, isDesktopRuntime } from './desktop.ts';

export const storageSnapshot = (storage: Storage): Record<string, string> => Object.fromEntries(
    Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => !!key?.startsWith('omega-'))
        .map(key => [key, storage.getItem(key)!]),
);
export const applyStorageSnapshot = (storage: Storage, snapshot: Record<string, string>): void => {
    if (Object.entries(snapshot).some(([key,value]) => !key.startsWith('omega-') || typeof value !== 'string')) throw Error('Invalid settings export');
    const previous = storageSnapshot(storage);
    try {
        for (const [key, value] of Object.entries(snapshot)) storage.setItem(key, value);
    } catch (error) {
        for (const key of Object.keys(snapshot)) storage.removeItem(key);
        for (const [key, value] of Object.entries(previous)) storage.setItem(key, value);
        throw error;
    }
};
export const initializeDesktopStorage = async (): Promise<void> => {
    if (!isDesktopRuntime()) return;
    const snapshot = await invoke<Record<string, string> | null>('storage_import_snapshot');
    if (!snapshot) return;
    await invoke('storage_import_backup', { snapshot: storageSnapshot(localStorage) });
    applyStorageSnapshot(localStorage, snapshot);
    await invoke("storage_import_complete");
};
