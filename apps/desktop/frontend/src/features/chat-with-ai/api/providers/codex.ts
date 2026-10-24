import { vaultErrorKey } from "@/shared/lib/vault-errors";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { AiProvider } from "../ai-provider";
import { invoke } from "@/shared/lib/desktop";
import { listen } from "@/shared/lib/desktop";
import { openUrl } from "@/shared/lib/desktop";
import type { AiEvent, AiModel, AiStatus, AiTaskPurpose } from "@/entities/ai";

const connectCodex = (): Promise<AiStatus> => invoke("ai_connect");
const readCodexStatus = (): Promise<AiStatus> => invoke("ai_status");
const disconnectCodex = (): Promise<void> => invoke("ai_disconnect");
const listCodexModels = (): Promise<AiModel[]> => invoke("ai_models");
const signInCodex = async (): Promise<void> => {
    const url = await invoke<string>("ai_login");
    await openUrl(url);
};
const sendCodexMessage = (vaultId: string, requestId: string, text: string, model?: string, effort?: string, fast = false, purpose: AiTaskPurpose = "chat"): Promise<{ threadId: string }> =>
    invoke("ai_send", { vaultId, requestId, text, model: model || null, effort: effort || null, fast, purpose });
const cancelCodexTurn = (vaultId: string, clear = false, requestId?: string): Promise<void> => invoke("ai_cancel", { vaultId, clear, requestId: requestId ?? null });
const steerCodexTurn = (vaultId: string, requestId: string, text: string): Promise<{ turnId: string }> => invoke("ai_steer", { vaultId, requestId, text });
const subscribeCodex = (handler: (event: AiEvent) => void): Promise<() => void> =>
    listen<AiEvent>("ai-event", (event) => handler(event.payload));

const errorKeys: Record<string, TranslationKey> = {
    AI_EMPTY_RESPONSE: "aiEmptyResponse", AI_INVALID_MESSAGE: "aiInvalidResponse",
    AI_PROTOCOL_ERROR: "aiCliUpdateRequired",
    AI_CODEX_CONTEXT_LIMIT: "aiCodexContextLimit", AI_CODEX_LIMIT_REACHED: "aiCodexLimitReached",
    AI_CODEX_CONNECTION_FAILED: "aiCodexConnectionFailed", AI_CODEX_REQUEST_REJECTED: "aiCodexRequestRejected",
    AI_CODEX_SERVICE_FAILED: "aiCodexServiceFailed",
    AI_NOT_FOUND: "aiNotFound", AI_START_FAILED: "aiStartFailed",
    AI_DISCONNECTED: "aiDisconnected", AI_TIMEOUT: "aiTimeout",
    AI_SIGN_IN_REQUIRED: "aiSignInRequired",
    AI_BUSY: "aiBusy",
};

export const codexProvider: AiProvider = {
    id: "codex", name: "Codex",
    labels: { connect: "aiConnect", signInRequired: "aiSignInRequired", signIn: "aiSignIn" },
    connect: connectCodex, status: readCodexStatus, disconnect: disconnectCodex,
    models: listCodexModels, signIn: signInCodex, send: sendCodexMessage, steer: steerCodexTurn,
    cancel: cancelCodexTurn, subscribe: subscribeCodex,
    errorKey: (failure) => vaultErrorKey(failure) ?? errorKeys[failure] ?? "aiRequestFailed",
};
