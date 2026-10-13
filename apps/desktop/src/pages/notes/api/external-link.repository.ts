import { openUrl } from "@tauri-apps/plugin-opener";

export const openExternalUrl = (url: string): Promise<void> => openUrl(url);
