import { vaultErrorKey } from "@/shared/lib/vault-errors";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AiEvent, AiModel, AiStatus } from "@/entities/ai";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { AiProvider } from "../ai-provider";

const errorKeys: Record<string, TranslationKey> = {
    AI_EMPTY_RESPONSE: "aiEmptyResponse", AI_INVALID_MESSAGE: "aiInvalidResponse",
    AI_NOT_FOUND: "aiNotFound", AI_START_FAILED: "aiStartFailed", AI_DISCONNECTED: "aiDisconnected",
    AI_TIMEOUT: "aiTimeout", AI_SIGN_IN_REQUIRED: "aiSignInRequired",
    AI_BUSY: "aiBusy", AI_PROTOCOL_ERROR: "aiCliUpdateRequired",
    AI_LOGIN_TERMINAL_UNAVAILABLE: "aiCliLoginRequired", AI_HISTORY_CLEAR_FAILED: "aiHistoryClearFailed",
    AI_OPENCODE_V2_REQUIRED: "aiOpenCodeV2Required",
    AI_OPENCODE_CONFIG_FAILED: "aiOpenCodeConfigFailed",
    AI_OPENCODE_FREE_TIER_REJECTED: "aiOpenCodeFreeTierRejected",
    AI_OPENCODE_MODELS_UNAVAILABLE: "aiOpenCodeModelsUnavailable",
    AI_CLAUDE_VERSION_REQUIRED: "aiClaudeVersionRequired",
    AI_CLAUDE_AUTH_CHECK_FAILED: "aiClaudeAuthCheckFailed",
    AI_CLAUDE_AUTH_FAILED: "aiClaudeAuthFailed",
    AI_CLAUDE_BILLING_FAILED: "aiClaudeBillingFailed",
    AI_CLAUDE_LIMIT_REACHED: "aiClaudeLimitReached",
    AI_CLAUDE_SERVICE_FAILED: "aiClaudeServiceFailed",
    AI_CLAUDE_REQUEST_FAILED: "aiClaudeRequestFailed",
    AI_CLAUDE_CLI_FAILED: "aiClaudeCliFailed",
    AI_CLAUDE_SEND_FAILED: "aiClaudeSendFailed",
    AI_CLAUDE_EMPTY_RESPONSE: "aiClaudeEmptyResponse",
    AI_CLAUDE_MCP_FAILED: "aiClaudeMcpFailed",
    AI_ANTIGRAVITY_VERSION_REQUIRED: "aiAntigravityVersionRequired",
    AI_ANTIGRAVITY_AUTH_FAILED: "aiAntigravityAuthFailed",
    AI_ANTIGRAVITY_LIMIT_REACHED: "aiAntigravityLimitReached",
    AI_ANTIGRAVITY_ACCESS_DENIED: "aiAntigravityAccessDenied",
    AI_ANTIGRAVITY_MCP_FAILED: "aiAntigravityMcpFailed",
    AI_ANTIGRAVITY_MODEL_UNAVAILABLE: "aiAntigravityModelUnavailable",
    AI_ANTIGRAVITY_CONNECTION_FAILED: "aiAntigravityConnectionFailed",
    AI_ANTIGRAVITY_SEND_FAILED: "aiAntigravitySendFailed",
    AI_ANTIGRAVITY_EMPTY_RESPONSE: "aiAntigravityEmptyResponse",
    AI_ANTIGRAVITY_REQUEST_FAILED: "aiAntigravityRequestFailed",
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

const cliProvider = (id: "claude" | "opencode" | "antigravity", name: string): AiProvider => ({
    id, name, labels: { connect: "aiConnect", signInRequired: "aiSignInRequired", signIn: "aiSignIn" },
    connect: () => invoke<AiStatus>("ai_cli_connect", { providerId: id }),
    status: () => invoke<AiStatus>("ai_cli_status", { providerId: id }),
    models: () => invoke<AiModel[]>("ai_cli_models", { providerId: id }),
    signIn: () => invoke("ai_cli_login", { providerId: id }),
    disconnect: () => invoke("ai_cli_disconnect", { providerId: id }),
    send: (vaultId, requestId, text, model, effort, _fast, purpose = "chat") => invoke("ai_cli_send", {
        providerId: id, vaultId, requestId, text, model: model || null, effort: effort || null, purpose,
    }),
    cancel: (vaultId, _clear, requestId) => invoke("ai_cli_cancel", { providerId: id, vaultId, requestId: requestId ?? null }),
    subscribe: (handler) => listen<AiEvent>("ai-event", (event) => handler(event.payload)),
    errorKey: (failure) => (id === "opencode" ? openCodeErrorKeys[failure] : undefined) ?? vaultErrorKey(failure) ?? errorKeys[failure] ?? "aiRequestFailed",
});

export const claudeProvider = cliProvider("claude", "Claude");
export const opencodeProvider = cliProvider("opencode", "OpenCode");
export const antigravityProvider = cliProvider("antigravity", "Antigravity");
