import { invoke } from "@/shared/lib/desktop";
import type { AiProviderId, StoredChat } from "@/entities/ai";

export const readAiChat = (vaultId: string, providerId: AiProviderId): Promise<StoredChat> => invoke("read_ai_chat", { vaultId, providerId });
export const saveAiChat = (vaultId: string, providerId: AiProviderId, chat: StoredChat): Promise<void> => invoke("save_ai_chat", { vaultId, providerId, chat });
export const clearAiChats = (): Promise<void> => invoke("clear_ai_chats");
