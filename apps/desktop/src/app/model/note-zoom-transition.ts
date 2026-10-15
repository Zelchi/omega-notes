import { createEffect, onCleanup, type Accessor } from "solid-js";
import type { NavigationTransition } from "./navigation-history";

type FocusPoint = { x: number; y: number };
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const ZOOM = 3.2;

export const useNoteZoomTransition = (surface: () => HTMLElement | undefined, vaultId: Accessor<string | undefined>) => {
	const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
	let animation: Animation | undefined;
	let lastFocus: FocusPoint = { x: 0.5, y: 0.5 };
	let disposed = false;
	createEffect(() => { vaultId(); lastFocus = { x: 0.5, y: 0.5 }; });
	const finish = () => { animation?.finish(); };
	const visibility = () => { if (document.hidden) finish(); };
	preference.addEventListener("change", finish);
	document.addEventListener("visibilitychange", visibility);
	window.addEventListener("resize", finish);
	onCleanup(() => {
		disposed = true;
		animation?.cancel();
		preference.removeEventListener("change", finish);
		document.removeEventListener("visibilitychange", visibility);
		window.removeEventListener("resize", finish);
	});

	const focusOn = (element: HTMLElement, noteId: string): FocusPoint => {
		const bounds = element.getBoundingClientRect();
		const node = [...element.querySelectorAll<HTMLElement>("[data-canvas-note-id]")]
			.find((node) => node.dataset.canvasNoteId === noteId);
		if (!node || !bounds.width || !bounds.height) return lastFocus;
		const target = node.getBoundingClientRect();
		const x = (target.left + target.width / 2 - bounds.left) / bounds.width;
		const y = (target.top + target.height / 2 - bounds.top) / bounds.height;
		return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : lastFocus;
	};
	const zoomed = (element: HTMLElement, focus: FocusPoint): string =>
		`translate(${element.clientWidth * (0.5 - focus.x)}px, ${element.clientHeight * (0.5 - focus.y)}px) scale(${ZOOM})`;
	const play = async (element: HTMLElement, frames: Keyframe[], duration: number): Promise<void> => {
		if (disposed || document.hidden || preference.matches || typeof element.animate !== "function") return;
		animation = element.animate(frames, { duration, easing: EASING, fill: "forwards" });
		try { await animation.finished; } catch { /* Disposing the view cancels its animation. */ }
		finally { animation?.cancel(); animation = undefined; }
	};
	const run: NavigationTransition = async (from, to, commit) => {
		const element = surface();
		if (!element || document.hidden || preference.matches) { commit(); return; }
		const entering = from.route === "canvas" && to.route === "note";
		const leaving = from.route === "note" && to.route === "canvas";
		if (!entering && !leaving) { commit(); return; }
		const previousOrigin = element.style.transformOrigin;
		const previousInert = element.inert;
		const previousScrollbarVisibility = element.style.getPropertyValue("--omega-scrollbar-visibility");
		try {
			element.style.setProperty("--omega-scrollbar-visibility", "hidden");
			element.inert = true;
			if (entering) {
				lastFocus = focusOn(element, to.noteId);
				element.style.transformOrigin = `${lastFocus.x * 100}% ${lastFocus.y * 100}%`;
				await play(element, [{ transform: "none", opacity: 1 }, { transform: zoomed(element, lastFocus), opacity: 0 }], 120);
			} else {
				element.style.transformOrigin = "50% 50%";
				await play(element, [{ transform: "none", opacity: 1 }, { transform: "scale(0.94)", opacity: 0 }], 65);
			}
			if (disposed) return;
			// Release inert before mounting the editor so its normal autofocus works.
			element.inert = previousInert;
			commit();
			if (leaving) {
				lastFocus = focusOn(element, from.noteId);
				element.style.transformOrigin = `${lastFocus.x * 100}% ${lastFocus.y * 100}%`;
				await play(element, [{ transform: zoomed(element, lastFocus), opacity: 0 }, { transform: "none", opacity: 1 }], 130);
			} else {
				// Keep editor geometry stable while autofocus and text measurements run.
				await play(element, [{ opacity: 0 }, { opacity: 1 }], 60);
			}
		} finally {
			if (previousScrollbarVisibility) element.style.setProperty("--omega-scrollbar-visibility", previousScrollbarVisibility);
			else element.style.removeProperty("--omega-scrollbar-visibility");
			element.inert = previousInert;
			element.style.transformOrigin = previousOrigin;
		}
	};
	return { run };
};
