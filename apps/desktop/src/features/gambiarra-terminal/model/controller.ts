import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js";
import type { Terminal } from "@xterm/xterm";
import type { AiProviderId } from "@/entities/ai";
import { vaultErrorKey } from "@/shared/lib/vault-errors";
import type { TranslationKey } from "@/shared/lib/i18n";
import { acknowledgeTerminal, closeTerminal, openTerminal, resizeTerminal, writeTerminal, type TerminalEvent } from "../api/terminal.repository";

// shortcut: Limita a saída mantida em memória a 16 MiB; aumente se sessões longas precisarem restaurar mais histórico.
const maxOutputHistory = 16 * 1024 * 1024;

export const useGambiarraTerminal = (options: {
	vaultId: Accessor<string | undefined>;
	enabled: Accessor<boolean>;
	onCliExit: () => void;
}) => {
	const [provider, setProvider] = createSignal<AiProviderId>();
	const [error, setError] = createSignal<TranslationKey>();
	const [connecting, setConnecting] = createSignal(false);
	const [exited, setExited] = createSignal(false);
	const [outputTruncated, setOutputTruncated] = createSignal(false);
	let sessionId: string | undefined, sessionVault: string | undefined, ready = false, revision = 0;
	let history: Uint8Array[] = [], historyBytes = 0, outputTerminal: Terminal | undefined;
	let input: Uint8Array[] = [], inputBytes = 0, sending = false;
	const encoder = new TextEncoder();

	const report = (failure?: unknown) => {
		const code = failure instanceof Error ? failure.message : String(failure ?? "");
		setError(vaultErrorKey(code) ?? "gambiarraTerminalFailed");
	};
	const rememberOutput = (bytes: Uint8Array) => {
		let retained = bytes;
		if (retained.byteLength > maxOutputHistory) {
			retained = retained.subarray(retained.byteLength - maxOutputHistory);
			setOutputTruncated(true);
		}
		history.push(retained);
		historyBytes += retained.byteLength;
		while (historyBytes > maxOutputHistory) {
			const removed = history.shift();
			if (!removed) break;
			historyBytes -= removed.byteLength;
			setOutputTruncated(true);
		}
		outputTerminal?.write(retained);
	};
	const sendInput = async () => {
		if (sending || !ready || !sessionId || !sessionVault) return;
		sending = true;
		try {
			while (input.length && ready && sessionId && sessionVault) {
				const data = input.shift()!; inputBytes -= data.byteLength;
				await writeTerminal(sessionVault, sessionId, Array.from(data));
			}
		} catch (failure) { report(failure); input = []; inputBytes = 0; }
		finally { sending = false; }
	};
	const write = (data: Uint8Array) => {
		if (!sessionId || exited()) return;
		if (inputBytes + data.byteLength > 1_000_000) { report(); return; }
		for (let offset = 0; offset < data.byteLength; offset += 4096) input.push(data.subarray(offset, offset + 4096));
		inputBytes += data.byteLength;
		void sendInput();
	};
	const disposeSession = (clearProvider: boolean) => {
		const current = sessionId;
		++revision; sessionId = undefined; sessionVault = undefined; ready = false;
		setConnecting(false); setExited(false); setError(undefined); setOutputTruncated(false);
		history = []; historyBytes = 0; input = []; inputBytes = 0;
		if (clearProvider) setProvider(undefined);
		if (current) void closeTerminal(current).catch(() => undefined);
	};
	const start = async (value: AiProviderId) => {
		const vaultId = options.vaultId();
		if (!vaultId || !options.enabled()) return;
		if (provider() === value && sessionId && !exited() && !error()) return;
		const previous = sessionId;
		const request = ++revision;
		sessionId = undefined; sessionVault = undefined; ready = false;
		if (previous) await closeTerminal(previous).catch(() => undefined);
		if (request !== revision || !options.enabled() || vaultId !== options.vaultId()) return;
		const current = crypto.randomUUID();
		sessionId = current; sessionVault = vaultId;
		setProvider(value); setConnecting(true); setExited(false); setError(undefined); setOutputTruncated(false);
		history = []; historyBytes = 0; input = []; inputBytes = 0;
		try {
			await openTerminal(vaultId, current, value, 80, 24, (event: TerminalEvent) => {
				if (request !== revision || sessionId !== current) return;
				if (event.kind === "data") {
					rememberOutput(Uint8Array.from(event.bytes));
					void acknowledgeTerminal(vaultId, current, event.sequence).catch(report);
				} else if (event.kind === "cliExit") {
					ready = false; setConnecting(false); setExited(true);
					if (!error() && (event.code === 0 || event.code === 130 || event.code === 0xc000013a)) options.onCliExit();
					else report();
				} else if (event.kind === "exit") {
					ready = false; setConnecting(false); setExited(true);
				} else report();
			});
			if (request !== revision || sessionId !== current) { await closeTerminal(current).catch(() => undefined); return; }
			ready = true;
			setConnecting(false);
			void sendInput();
		} catch (failure) {
			if (request !== revision) return;
			sessionId = undefined; sessionVault = undefined; ready = false;
			setConnecting(false); setExited(true); report(failure);
		}
	};

	createEffect(on(() => [options.vaultId(), options.enabled()] as const, ([vaultId, enabled]) => {
		if (!enabled || !vaultId || sessionVault && sessionVault !== vaultId) disposeSession(true);
	}));
	onCleanup(() => disposeSession(true));

	return {
		provider, error, connecting, exited, outputTruncated,
		selectProvider: (value: AiProviderId) => { void start(value); },
		restart: () => { const current = provider(); if (current) void start(current); },
		attach: (terminal: Terminal) => {
			outputTerminal = terminal;
			for (const bytes of history) terminal.write(bytes);
			return () => { if (outputTerminal === terminal) outputTerminal = undefined; };
		},
		write,
		resize: (cols: number, rows: number) => {
			if (ready && sessionId && sessionVault) void resizeTerminal(sessionVault, sessionId, cols, rows).catch(report);
		},
	};
};
