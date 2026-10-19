import { Show, createEffect, createSignal, createUniqueId, onCleanup, onMount, type Accessor, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { windowLayout } from "@/shared/ui/window-layout";
import { tooltipStyle } from "./style.css";

/** Labels the buttons inside a root without wrapping them or changing focus/selection. */
const Tooltip: Component<{ root: Accessor<HTMLElement | undefined>; enabled?: boolean; delay?: number }> = props => {
	const id = `tooltip-${createUniqueId()}`;
	const [mounted, setMounted] = createSignal(false);
	const [text, setText] = createSignal("");
	const [position, setPosition] = createSignal({ left: 0, top: 0, ready: false });
	let anchor: HTMLElement | undefined, bubble: HTMLDivElement | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined, frame = 0;
	const removeDescription = () => {
		if (!anchor) return;
		const ids = (anchor.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(value => value && value !== id);
		if (ids.length) anchor.setAttribute("aria-describedby", ids.join(" "));
		else anchor.removeAttribute("aria-describedby");
	};
	const hide = () => {
		clearTimeout(timer); cancelAnimationFrame(frame); removeDescription();
		anchor = undefined; setText(""); setPosition({ left: 0, top: 0, ready: false });
	};
	const available = (element: HTMLElement) => element.isConnected && !element.closest('[inert], [aria-hidden="true"]');
	const reveal = () => {
		if (!anchor || props.enabled === false || !available(anchor)) { hide(); return; }
		const label = anchor.getAttribute("aria-label")?.trim();
		if (!label) { hide(); return; }
		setText(label);
		const descriptions = new Set((anchor.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean));
		descriptions.add(id); anchor.setAttribute("aria-describedby", [...descriptions].join(" "));
		frame = requestAnimationFrame(() => {
			if (!anchor || !bubble || !available(anchor)) { hide(); return; }
			const bounds = anchor.getBoundingClientRect(), tooltip = bubble.getBoundingClientRect();
			const minimumTop = windowLayout.titlebarHeight + 9;
			const above = bounds.top - tooltip.height - 8;
			const top = above >= minimumTop ? above : bounds.bottom + 8;
			setPosition({
				left: Math.max(8, Math.min(innerWidth - tooltip.width - 8, bounds.left + (bounds.width - tooltip.width) / 2)),
				top: Math.max(minimumTop, Math.min(innerHeight - tooltip.height - 8, top)), ready: true,
			});
		});
	};
	const schedule = (element: HTMLElement, immediate = false) => {
		if (anchor === element) return;
		hide(); anchor = element;
		if (immediate) reveal(); else timer = setTimeout(reveal, props.delay ?? 450);
	};
	onMount(() => setMounted(true));
	createEffect(() => {
		if (!mounted() || props.enabled === false) { hide(); return; }
		const root = props.root(); if (!root) return;
		const buttonAt = (target: EventTarget | null) => {
			const element = target instanceof Element ? target.closest<HTMLElement>('button[aria-label], [role="button"][aria-label]') : undefined;
			return element && root.contains(element) ? element : undefined;
		};
		const over = (event: PointerEvent) => {
			if (event.pointerType === "touch" || event.buttons) return;
			const element = buttonAt(event.target); if (element) schedule(element);
		};
		const out = (event: PointerEvent) => { if (anchor && !anchor.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)) hide(); };
		const focus = (event: FocusEvent) => {
			const element = buttonAt(event.target);
			if (element?.matches(":focus-visible")) schedule(element, true);
		};
		const observer = new MutationObserver(() => { if (anchor && !available(anchor)) hide(); });
		observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["inert", "aria-hidden"] });
		root.addEventListener("pointerover", over); root.addEventListener("pointerout", out);
		root.addEventListener("focusin", focus); root.addEventListener("focusout", hide);
		window.addEventListener("pointerdown", hide, true); window.addEventListener("keydown", hide, true);
		window.addEventListener("scroll", hide, true); window.addEventListener("resize", hide); window.addEventListener("blur", hide);
		onCleanup(() => {
			hide(); observer.disconnect();
			root.removeEventListener("pointerover", over); root.removeEventListener("pointerout", out);
			root.removeEventListener("focusin", focus); root.removeEventListener("focusout", hide);
			window.removeEventListener("pointerdown", hide, true); window.removeEventListener("keydown", hide, true);
			window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); window.removeEventListener("blur", hide);
		});
	});
	onCleanup(hide);
	return <Show when={text()}><Portal>
		<div ref={bubble} id={id} role="tooltip" class={tooltipStyle}
			style={{ left: `${position().left}px`, top: `${position().top}px`, visibility: position().ready ? "visible" : "hidden" }}>{text()}</div>
	</Portal></Show>;
};
export default Tooltip;
