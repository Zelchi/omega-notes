import Button from "@/shared/ui/button";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { createEffect, createSignal, onCleanup, onMount, Show, type Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import { isTauriRuntime } from "@/shared/lib/tauri";
import type { AiProviderId } from "@/entities/ai";
import { openTerminal, closeTerminal, writeTerminal, resizeTerminal, acknowledgeTerminal, type TerminalEvent } from "../api/terminal.repository";
import { terminalStyles } from "./style.css.ts";

const TerminalView: Component<{ vaultId: string; providerId: AiProviderId; visible: boolean; onRestart: () => void; onCliExit: () => void; t: (key: TranslationKey) => string }> = props => {
    const vaultId = props.vaultId, providerId = props.providerId, sessionId = crypto.randomUUID();
    const [error, setError] = createSignal(false), [exited, setExited] = createSignal(false), [connecting, setConnecting] = createSignal(true);
    let host!: HTMLDivElement, terminal: Terminal | undefined, fit: FitAddon | undefined;
    let disposed = false, ready = false, requested = false, frame = 0;
    let input: Uint8Array[] = [], inputBytes = 0, sending = false;
    const encoder = new TextEncoder();
    let pendingSize: { cols: number; rows: number } | undefined, resizing = false;
    let pendingFocus = false;
    const sendResize = async () => {
        if (resizing || !ready || disposed) return;
        resizing = true;
        try {
            while (pendingSize && ready && !disposed) {
                const size = pendingSize; pendingSize = undefined;
                await resizeTerminal(vaultId, sessionId, size.cols, size.rows);
            }
        } catch { report(); }
        finally { resizing = false; }
    };
    const report = () => { if (!disposed) setError(true); };
    const fitToHost = (focus = false) => {
        pendingFocus ||= focus;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            if (disposed || !props.visible || !host.clientWidth || !host.clientHeight) return;
            fit?.fit();
            if (pendingFocus) { pendingFocus = false; terminal?.focus(); }
        });
    };
    const sendInput = async () => {
        if (sending || !ready || disposed) return;
        sending = true;
        try {
            while (input.length && ready && !disposed) {
                const data = input.shift()!; inputBytes -= data.byteLength;
                await writeTerminal(vaultId, sessionId, Array.from(data));
            }
        } catch { report(); input = []; inputBytes = 0; }
        finally { sending = false; }
    };
    onMount(() => {
        if (!isTauriRuntime()) { setConnecting(false); setError(true); return; }
        const colors = () => {
            const style = getComputedStyle(host);
            const color = (key: string, fallback: string) => style.getPropertyValue(key).trim() || fallback;
            return {
                background: color("--surface-panel", "#1c1c1c"), foreground: color("--ink", "#dedede"),
                cursor: color("--ink", "#dedede"), selectionBackground: "#6688aa66", overviewRulerBorder: "transparent",
                scrollbarSliderBackground: "#99999966", scrollbarSliderHoverBackground: "#aaaaaa99", scrollbarSliderActiveBackground: "#ccccccaa"
            };
        };
        terminal = new Terminal({
            fontFamily: "monospace", fontSize: 12, cursorBlink: true, cursorStyle: "bar",
            scrollback: 3000, overviewRuler: { width: 5 }, theme: colors(), disableStdin: true, allowProposedApi: false
        });
        fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(host);
        const enqueue = (value: Uint8Array) => {
            if (disposed || exited()) return;
            if (inputBytes + value.byteLength > 1_000_000) { report(); return; }
            for (let offset = 0; offset < value.byteLength; offset += 4096) input.push(value.subarray(offset, offset + 4096));
            inputBytes += value.byteLength;
            void sendInput();
        };
        const data = terminal.onData(value => enqueue(encoder.encode(value)));
        const binary = terminal.onBinary(value => enqueue(Uint8Array.from(value, character => character.charCodeAt(0))));
        const resized = terminal.onResize(({ cols, rows }) => {
            if (!ready || disposed) return;
            pendingSize = { cols, rows };
            queueMicrotask(() => { void sendResize(); });
        });
        const observer = new ResizeObserver(() => fitToHost()); observer.observe(host);
        const theme = new MutationObserver(() => { if (terminal) terminal.options.theme = colors(); });
        theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        const receive = (event: TerminalEvent) => {
            if (disposed || !terminal) return;
            if (event.kind === "data") {
                terminal.write(new Uint8Array(event.bytes), () => {
                    if (!disposed) void acknowledgeTerminal(vaultId, sessionId, event.sequence).catch(() => undefined);
                });
            } else if (event.kind === "cliExit") {
                ready = false; terminal.options.disableStdin = true; setConnecting(false); setExited(true);
                if (!error() && (event.code === 0 || event.code === 130 || event.code === 0xc000013a)) props.onCliExit();
                else report();
            } else if (event.kind === "exit") {
                ready = false; terminal.options.disableStdin = true; setConnecting(false); setExited(true);
            } else report();
        };
        void (async () => {
            if (disposed) return;
            if (props.visible && host.clientWidth && host.clientHeight) fit?.fit();
            requested = true;
            await openTerminal(vaultId, sessionId, providerId, Math.max(2, terminal!.cols), Math.max(1, terminal!.rows), receive);
            if (disposed) return;
            if (!exited()) {
                ready = true; terminal!.options.disableStdin = false;
                pendingSize = { cols: terminal!.cols, rows: terminal!.rows };
                void sendResize(); void sendInput();
            }
            setConnecting(false); fitToHost(true);
        })().catch(() => { if (!disposed) { setConnecting(false); report(); } });
        onCleanup(() => { data.dispose(); binary.dispose(); resized.dispose(); observer.disconnect(); theme.disconnect(); });
    });
    createEffect(() => { if (props.visible) fitToHost(true); });
    onCleanup(() => {
        disposed = true; ready = false; input = []; inputBytes = 0; cancelAnimationFrame(frame);
        terminal?.dispose(); terminal = undefined;
        if (requested) void closeTerminal(sessionId).catch(() => undefined);
    });
    return <>
        <div ref={host} class={terminalStyles.host} data-omega-terminal role="region" aria-label={props.t("gambiarraTerminal")}
            onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()} />
        <Show when={connecting()}><p class={terminalStyles.status} role="status">{props.t("gambiarraTerminalStarting")}</p></Show>
        <Show when={error()}><p class={terminalStyles.status} role="alert">{props.t("gambiarraTerminalFailed")}</p></Show>
        <Show when={exited()}><p class={terminalStyles.status} role="status">{props.t("gambiarraTerminalExited")}</p></Show>
        <Show when={error() || exited()}><Button class={terminalStyles.restart} type="button" onClick={props.onRestart}>{props.t("gambiarraTerminalRestart")}</Button></Show>
    </>;
};
export default TerminalView;
