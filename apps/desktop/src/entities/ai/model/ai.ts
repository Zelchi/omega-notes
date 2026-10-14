export type AiProviderId = "codex" | "claude" | "opencode";
export const MAX_CHAT_MESSAGES = 50;
export type AiStatus = { connected: boolean; authenticated: boolean; connectionId?: string; email?: string | null; plan?: string | null };
export type AiModel = {
    id: string; name: string; isDefault: boolean; defaultEffort: string;
    efforts: string[]; serviceTiers: string[];
};
export type AiEvent = {
    kind: "delta" | "message" | "completed" | "error" | "account" | "disconnected";
    connectionId?: string;
    vaultId?: string;
    requestId?: string;
    itemId?: string;
    text?: string;
    status?: string;
    failed?: boolean;
    retrying?: boolean;
    success?: boolean;
    errorCode?: string;
};
export type ChatMessage = { id: string; role: "user" | "assistant"; text: string; items?: Record<string, string> };
export type VaultChat = { messages: ChatMessage[]; referenceTitles: Record<string, string>; draft: string; model: string; effort: string; fast: boolean; busy: boolean; requestId?: string; error?: string };

export type StoredChat = Pick<VaultChat, "messages" | "referenceTitles" | "draft" | "model" | "effort" | "fast">;
