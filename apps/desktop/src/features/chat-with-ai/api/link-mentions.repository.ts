import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { NoteLinkPatch } from "@/entities/note";

export type LinkRequest = { ticket: string; connectionId: string; vaultId: string; requestId: string; patch: NoteLinkPatch };
export const subscribeLinkRequests = (receive: (request: LinkRequest) => void) =>
    listen<LinkRequest>("ai-link-request", (event) => receive(event.payload));
export const completeLinkRequest = (ticket: string, error?: string): Promise<void> =>
    invoke("complete_ai_link_request", { ticket, error: error ?? null });
