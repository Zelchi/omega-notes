import type { TranslationKey } from "./i18n";

const errorKeys: Record<string, TranslationKey> = {
    AI_INVALID_VAULT: "aiInvalidVault",
    AI_NO_ACTIVE_VAULT: "aiNoActiveVault",
    NO_ACTIVE_VAULT: "aiNoActiveVault",
    AI_VAULT_NOT_FOUND: "aiVaultNotFound",
    AI_VAULT_PATH_UNAVAILABLE: "aiVaultPathUnavailable",
    AI_VAULT_PATH_UNSAFE: "aiVaultPathUnsafe",
    NOTE_LOAD_VAULT_MISMATCH: "noteLoadVaultMismatch",
    NOTE_LOAD_VAULT_CHANGED: "noteLoadVaultChanged",
    NOTE_SCAN_VAULT_CHANGED: "noteScanVaultChanged",
    NOTE_SAVE_VAULT_CHANGED: "noteSaveVaultChanged",
    AI_STUDY_VAULT_MISMATCH: "aiStudyVaultMismatch",
    AI_CONVERSATION_VAULT_MISMATCH: "aiConversationVaultMismatch",
    AI_CONNECTION_CHANGED: "aiConnectionChanged",
    AI_STUDY_CONTEXT_UNAVAILABLE: "aiStudyContextUnavailable",
    AI_VAULT_NOT_ACTIVE: "aiVaultNotActive",
    AI_CHAT_PREPARATION_VAULT_CHANGED: "aiChatPreparationVaultChanged",
    AI_CHAT_STEER_VAULT_CHANGED: "aiChatSteerVaultChanged",
    AI_CHAT_SEND_VAULT_CHANGED: "aiChatSendVaultChanged",
    AI_STUDY_VAULT_CHANGED: "aiStudyVaultChanged",
    AI_STUDY_PREPARATION_VAULT_CHANGED: "aiStudyPreparationVaultChanged",
    AI_STUDY_VALIDATION_VAULT_CHANGED: "aiStudyValidationVaultChanged",
    NOTE_LINK_VAULT_CHANGED: "noteLinkVaultChanged",
    NOTE_UNDO_LINKS_VAULT_CHANGED: "noteUndoLinksVaultChanged",
};

export const vaultErrorKey = (code: string): TranslationKey | undefined => errorKeys[code];
