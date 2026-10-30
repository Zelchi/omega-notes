import { invoke } from "@/shared/lib/desktop";
import { listen } from "@/shared/lib/desktop";
import type { NoteLinkPatch } from "@/entities/note";

export type LinkRequest = { ticket: string; connectionId: string; vaultId: string; requestId: string; patch: NoteLinkPatch };
export const subscribeLinkRequests = (receive: (request: LinkRequest) => void) =>
    listen<LinkRequest>("ai-link-request", (event) => receive(event.payload));
export const completeLinkRequest = (request: LinkRequest, approved: boolean, error?: string): Promise<void> =>
    invoke("complete_ai_link_request", {
        ticket: request.ticket, connectionId: request.connectionId, vaultId: request.vaultId,
        requestId: request.requestId, approved, error: error ?? null,
    });
