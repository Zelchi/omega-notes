import { invoke } from "@tauri-apps/api/core";
import { check, type Update, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauriRuntime } from "@/shared/lib/tauri";

export const updatesConfigured = (): Promise<boolean> =>
	isTauriRuntime() ? invoke<boolean>("updater_ready") : Promise.resolve(false);

export const checkForUpdates = (): Promise<Update | null> => check({ timeout: 15_000 });
export const downloadUpdate = (update: Update, onEvent: (event: DownloadEvent) => void): Promise<void> =>
	update.download(onEvent, { timeout: 600_000 });
export const installUpdate = async (update: Update): Promise<void> => {
	await update.install();
	await relaunch();
};
export type { Update };
