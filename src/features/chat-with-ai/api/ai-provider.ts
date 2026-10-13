import type { AiEvent, AiModel, AiProviderId, AiStatus } from "@/entities/ai";
import type { TranslationKey } from "@/shared/lib/i18n";

export type AiProvider = {
    id: AiProviderId;
    name: string;
    labels: { connect: TranslationKey; signInRequired: TranslationKey; signIn: TranslationKey };
    connect: () => Promise<AiStatus>;
    status: () => Promise<AiStatus>;
    disconnect: () => Promise<void>;
    models: () => Promise<AiModel[]>;
    signIn: () => Promise<void>;
    send: (vaultId: string, requestId: string, text: string, model?: string, effort?: string, fast?: boolean) => Promise<{ threadId: string }>;
    cancel: (vaultId: string, clear?: boolean, requestId?: string) => Promise<void>;
    subscribe: (handler: (event: AiEvent) => void) => Promise<() => void>;
    errorKey: (failure: string) => TranslationKey;
};
