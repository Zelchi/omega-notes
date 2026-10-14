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
    AI_OPENCODE_V2_REQUIRED: "aiOpenCodeV2Required",
    AI_OPENCODE_CONFIG_FAILED: "aiOpenCodeConfigFailed",
    AI_OPENCODE_FREE_TIER_REJECTED: "aiOpenCodeFreeTierRejected",
    AI_OPENCODE_MODELS_UNAVAILABLE: "aiOpenCodeModelsUnavailable",
};

const openCodeErrorKeys: Record<string, TranslationKey> = {
    AI_START_FAILED: "aiOpenCodeCliFailed",
    AI_REQUEST_FAILED: "aiOpenCodeCliFailed",
    AI_PROTOCOL_ERROR: "aiOpenCodeResponseFailed",
    AI_OPENCODE_CLI_FAILED: "aiOpenCodeCliFailed",
    AI_OPENCODE_SEND_FAILED: "aiOpenCodeSendFailed",
    AI_OPENCODE_EMPTY_RESPONSE: "aiOpenCodeEmptyResponse",
    AI_OPENCODE_GO_SUBSCRIPTION_REQUIRED: "aiOpenCodeGoSubscriptionRequired",
    AI_OPENCODE_AUTH_FAILED: "aiOpenCodeAuthFailed",
    AI_OPENCODE_ACCESS_DENIED: "aiOpenCodeAccessDenied",
    AI_OPENCODE_CREDITS_REQUIRED: "aiOpenCodeCreditsRequired",
    AI_OPENCODE_BILLING_REQUIRED: "aiOpenCodeBillingRequired",
    AI_OPENCODE_LIMIT_REACHED: "aiOpenCodeLimitReached",
    AI_OPENCODE_MODEL_UNAVAILABLE: "aiOpenCodeModelUnavailable",
    AI_OPENCODE_SERVICE_FAILED: "aiOpenCodeServiceFailed",
    AI_OPENCODE_CONNECTION_FAILED: "aiOpenCodeConnectionFailed",
    AI_OPENCODE_REQUEST_REJECTED: "aiOpenCodeRequestRejected",
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
    errorKey: (failure) => (id === "opencode" ? openCodeErrorKeys[failure] : undefined) ?? errorKeys[failure] ?? "aiRequestFailed",
});

export const claudeProvider = cliProvider("claude", "Claude");
export const opencodeProvider = cliProvider("opencode", "OpenCode");
