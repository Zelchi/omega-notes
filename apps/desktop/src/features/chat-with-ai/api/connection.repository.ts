import type { AiProviderId } from "@/entities/ai";

const CONNECTED_PROVIDER_KEY = "omega-notes.ai.connected-provider";

export const readConnectedProvider = (): AiProviderId | undefined => {
    try {
        const value = localStorage.getItem(CONNECTED_PROVIDER_KEY);
        return value === "codex" || value === "claude" || value === "opencode" || value === "antigravity" ? value : undefined;
    } catch {
        return undefined;
    }
};

export const saveConnectedProvider = (provider: AiProviderId): void => {
    try {
        localStorage.setItem(CONNECTED_PROVIDER_KEY, provider);
    } catch (error) {
        console.error("Could not remember the connected AI provider.", error);
    }
};

export const forgetConnectedProvider = (): void => {
    try { localStorage.removeItem(CONNECTED_PROVIDER_KEY); }
    catch (error) { console.error("Could not forget the connected AI provider.", error); }
};
