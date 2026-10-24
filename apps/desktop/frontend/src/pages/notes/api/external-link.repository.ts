import { openUrl } from "@/shared/lib/desktop";

export const openExternalUrl = (url: string): Promise<void> => openUrl(url);
