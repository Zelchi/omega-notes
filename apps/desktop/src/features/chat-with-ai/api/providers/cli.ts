import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AiEvent, AiModel, AiStatus } from "@/entities/ai";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { AiProvider } from "../ai-provider";

const errorKeys: Record<string, TranslationKey> = {
    AI_NOT_FOUND: "aiNotFound", AI_START_FAILED: "aiStartFailed", AI_DISCONNECTED: "aiDisconnected",
    AI_TIMEOUT: "aiTimeout", AI_SIGN_IN_REQUIRED: "aiSignInRequired", AI_VAULT_CHANGED: "aiVaultChanged",
    AI_INVALID_VAULT: "aiVaultChanged", AI_BUSY: "aiBusy", AI_PROTOCOL_ERROR: "aiCliUpdateRequired",
    AI_LOGIN_TERMINAL_UNAVAILABLE: "aiCliLoginRequired", AI_HISTORY_CLEAR_FAILED: "aiHistoryClearFailed",
};

const cliProvider = (id: "claude" | "opencode", name: string): AiProvider => ({
    id, name, labels: { connect: "aiConnect", signInRequired: "aiSignInRequired", signIn: "aiSignIn" },
    connect: () => invoke<AiStatus>("ai_cli_connect", { providerId: id }),
    status: () => invoke<AiStatus>("ai_cli_status", { providerId: id }),
    models: () => invoke<AiModel[]>("ai_cli_models", { providerId: id }),
    signIn: () => invoke("ai_cli_login", { providerId: id }),
    disconnect: () => invoke("ai_cli_disconnect", { providerId: id }),
    send: (vaultId, requestId, text, model, effort) => invoke("ai_cli_send", {
        providerId: id, vaultId, requestId, text, model: model || null, effort: effort || null,
    }),
    cancel: (vaultId, _clear, requestId) => invoke("ai_cli_cancel", { providerId: id, vaultId, requestId: requestId ?? null }),
    subscribe: (handler) => listen<AiEvent>("ai-event", (event) => handler(event.payload)),
    errorKey: (failure) => errorKeys[failure] ?? "aiRequestFailed",
});

export const claudeProvider = cliProvider("claude", "Claude");
export const opencodeProvider = cliProvider("opencode", "OpenCode");
