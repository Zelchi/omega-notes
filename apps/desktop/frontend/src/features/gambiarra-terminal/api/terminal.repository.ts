import { Channel, invoke } from "@/shared/lib/desktop";
import type { AiProviderId } from "@/entities/ai";

let instructionUpdates: Promise<void> = Promise.resolve();
let terminalLifecycle: Promise<void> = Promise.resolve();
const queueLifecycle = (operation: () => Promise<void>) => {
    const pending = terminalLifecycle.catch(() => undefined).then(operation);
    terminalLifecycle = pending;
    return pending;
};
export const syncTerminalInstructions = (vaultId: string | undefined, enabled: boolean) => {
    instructionUpdates = instructionUpdates.catch(() => undefined).then(() =>
        invoke<void>("terminal_sync_instructions", { vaultId: vaultId ?? null, enabled }));
    return instructionUpdates;
};

export type TerminalEvent = { kind: "data"; bytes: number[]; sequence: number } | { kind: "exit" | "cliExit"; code: number | null } | { kind: "error" };
export const openTerminal = (vaultId: string, sessionId: string, providerId: AiProviderId, cols: number, rows: number, receive: (event: TerminalEvent) => void) => {
    const output = new Channel<TerminalEvent>();
    output.onmessage = receive;
    return queueLifecycle(async () => {
        await instructionUpdates;
        await invoke<void>("terminal_open", { vaultId, sessionId, providerId, cols, rows, output });
    });
};
export const writeTerminal = (vaultId: string, sessionId: string, data: number[]) => invoke<void>("terminal_write", { vaultId, sessionId, data });
export const resizeTerminal = (vaultId: string, sessionId: string, cols: number, rows: number) => invoke<void>("terminal_resize", { vaultId, sessionId, cols, rows });
export const acknowledgeTerminal = (vaultId: string, sessionId: string, sequence: number) => invoke<void>("terminal_ack", { vaultId, sessionId, sequence });
export const closeTerminal = (sessionId: string) => queueLifecycle(() => invoke<void>("terminal_close", { sessionId }));
