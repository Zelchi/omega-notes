import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/shared/lib/tauri";

export const fetchPageTitle = async (url: string): Promise<string | undefined> => {
    if (isTauriRuntime()) return (await invoke<string | null>("fetch_url_title", { url })) ?? undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
        const type = response.headers.get("content-type") ?? "";
        if (!response.ok || !/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(type) || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder(type.match(/charset=["']?([^\s;"']+)/i)?.[1] ?? "utf-8");
        let html = "", count = 0;
        try {
            while (count < 512 * 1024) {
                const { value, done } = await reader.read();
                if (done) break;
                const part = value.subarray(0, 512 * 1024 - count);
                count += part.length;
                html += decoder.decode(part, { stream: true });
                if (/<\/title\s*>/i.test(html)) break;
            }
            html += decoder.decode();
        } finally { await reader.cancel(); }
        return new DOMParser().parseFromString(html, "text/html").title || undefined;
    } finally { clearTimeout(timer); controller.abort(); }
};
