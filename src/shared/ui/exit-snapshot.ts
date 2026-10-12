import { onCleanup } from "solid-js";

type ExitKind = "bar" | "menu" | "dialog" | "card";
type ExitOptions = { kind?: ExitKind; key?: string; enabled?: () => boolean };
const activeExits = new Map<string, () => void>();

/** Keep an inert visual copy alive after Solid disposes the interactive UI. */
export const animateExitSnapshot = (
	element: HTMLElement, duration: number, options: ExitOptions = {},
): (() => void) => {
	const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
	if (!element.isConnected || preference.matches) return () => {};
	const bounds = element.getBoundingClientRect();
	if (!bounds.width || !bounds.height) return () => {};
	if (options.key) activeExits.get(options.key)?.();
	const kind = options.kind ?? "bar";
	const opacity = getComputedStyle(element).opacity;
	const snapshot = element.cloneNode(true) as HTMLElement;
	snapshot.inert = true;
	snapshot.setAttribute("aria-hidden", "true");
	snapshot.dataset.omegaExitSnapshot = kind;
	for (const node of [snapshot, ...snapshot.querySelectorAll<HTMLElement>("*")]) {
		node.removeAttribute("id");
		node.style.animation = "none";
		node.style.transition = "none";
	}
	const width = element.offsetWidth;
	const height = element.offsetHeight;
	const scale = bounds.width / width;
	Object.assign(snapshot.style, {
		position: "fixed", left: `${bounds.left}px`, top: `${bounds.top}px`,
		right: "auto", bottom: "auto", width: `${width}px`, height: `${height}px`,
		maxWidth: "none", maxHeight: "none", margin: "0", transform: "none",
		transformOrigin: "top left", pointerEvents: "none", zIndex: kind === "card" ? "4" : getComputedStyle(element).zIndex,
	});
	document.body.append(snapshot);
	const endTransform = kind === "card" ? `scale(${scale * 0.85})`
		: kind === "dialog" ? `scale(${scale})` : `translateY(6px) scale(${scale})`;
	const animations = [snapshot.animate([
		{ opacity, transform: `scale(${scale})` },
		{ opacity: 0, transform: endTransform },
	], { duration, easing: "ease-in", fill: "forwards" })];
	if (kind === "dialog") {
		const panel = snapshot.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
		if (panel) animations.push(panel.animate([
			{ transform: "translateY(0) scale(1)" },
			{ transform: "translateY(6px) scale(0.98)" },
		], { duration, easing: "ease-in", fill: "forwards" }));
	}
	let removed = false;
	const remove = () => {
		if (removed) return;
		removed = true;
		animations.forEach((animation) => animation.cancel());
		snapshot.remove();
		preference.removeEventListener("change", remove);
		if (options.key && activeExits.get(options.key) === remove) activeExits.delete(options.key);
	};
	preference.addEventListener("change", remove);
	if (options.key) activeExits.set(options.key, remove);
	void Promise.all(animations.map((animation) => animation.finished)).then(remove, remove);
	return remove;
};

/** Call from a ref inside conditional content so cleanup runs when it disappears. */
export const registerExitSnapshot = (element: HTMLElement, options: ExitOptions): void => {
	if (options.key) activeExits.get(options.key)?.();
	onCleanup(() => {
		if (options.enabled && !options.enabled()) return;
		animateExitSnapshot(element, 180, options);
	});
};
