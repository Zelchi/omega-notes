import Button from "@/shared/ui/button";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { createEffect, onCleanup, onMount, Show, type Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { useGambiarraTerminal } from "../model/controller";
import { terminalStyles } from "./style.css.ts";

const TerminalView: Component<{ session: ReturnType<typeof useGambiarraTerminal>; visible: boolean; t: (key: TranslationKey) => string }> = props => {
	let host!: HTMLDivElement, terminal: Terminal | undefined, fit: FitAddon | undefined, frame = 0;
	const fitToHost = () => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			if (!props.visible || !host.clientWidth || !host.clientHeight) return;
			fit?.fit();
			terminal?.focus();
		});
	};
	onMount(() => {
		const colors = () => {
			const style = getComputedStyle(host);
			const color = (key: string, fallback: string) => style.getPropertyValue(key).trim() || fallback;
			return {
				background: color("--surface-panel", "#1c1c1c"), foreground: color("--ink", "#dedede"),
				cursor: color("--ink", "#dedede"), selectionBackground: "#6688aa66", overviewRulerBorder: "transparent",
				scrollbarSliderBackground: "#99999966", scrollbarSliderHoverBackground: "#aaaaaa99", scrollbarSliderActiveBackground: "#ccccccaa",
			};
		};
		terminal = new Terminal({
			fontFamily: "monospace", fontSize: 12, cursorBlink: true, cursorStyle: "bar",
			scrollback: 3000, overviewRuler: { width: 5 }, theme: colors(), disableStdin: false, allowProposedApi: false,
		});
		fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(host);
		const detach = props.session.attach(terminal);
		const data = terminal.onData(value => props.session.write(new TextEncoder().encode(value)));
		const binary = terminal.onBinary(value => props.session.write(Uint8Array.from(value, character => character.charCodeAt(0))));
		const resized = terminal.onResize(({ cols, rows }) => props.session.resize(cols, rows));
		const observer = new ResizeObserver(fitToHost); observer.observe(host);
		const theme = new MutationObserver(() => { if (terminal) terminal.options.theme = colors(); });
		theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
		onCleanup(() => { detach(); data.dispose(); binary.dispose(); resized.dispose(); observer.disconnect(); theme.disconnect(); });
	});
	createEffect(() => { props.visible; props.session.connecting(); fitToHost(); });
	onCleanup(() => { cancelAnimationFrame(frame); terminal?.dispose(); terminal = undefined; });
	return <>
		<div ref={host} class={terminalStyles.host} data-omega-terminal role="region" aria-label={props.t("gambiarraTerminal")}
			onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()} />
		<Show when={props.session.connecting()}><p class={terminalStyles.status} role="status">{props.t("gambiarraTerminalStarting")}</p></Show>
		<Show when={props.session.error()}>{key => <p class={terminalStyles.status} role="alert">{props.t(key())}</p>}</Show>
		<Show when={props.session.outputTruncated()}><p class={terminalStyles.status} role="status">{props.t("gambiarraTerminalHistoryTrimmed")}</p></Show>
		<Show when={props.session.exited()}><p class={terminalStyles.status} role="status">{props.t("gambiarraTerminalExited")}</p></Show>
		<Show when={props.session.error() || props.session.exited()}><Button class={terminalStyles.restart} type="button" onClick={props.session.restart}>{props.t("gambiarraTerminalRestart")}</Button></Show>
	</>;
};
export default TerminalView;
