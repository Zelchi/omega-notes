import { invoke, isDesktopRuntime } from "@/shared/lib/desktop";

export const fetchPageTitle = async (url: string): Promise<string | undefined> => {
    if (!isDesktopRuntime()) return;
    return (await invoke<string | null>("fetch_url_title", { url })) ?? undefined;
};
