import { createEffect, onCleanup, type Accessor } from "solid-js";

/** Reverse from the current visual state when an entrance or exit is interrupted. */
export const registerVisibilityAnimation = (
	element: HTMLElement, exiting: Accessor<boolean>, kind: "bar" | "dialog" | "fade" | "panel",
): void => {
	const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
	const shownTransform = kind === "bar" ? "translateX(-50%)" : "none";
	const hiddenTransform = kind === "bar" ? "translateX(-50%) translateY(6px)"
		: kind === "dialog" ? "translateY(6px) scale(0.98)"
			: kind === "panel" ? "translateX(calc(100% + 2px))" : "none";
	let animation: Animation | undefined;
	let first = true;
	element.style.animation = "none";
	const finish = () => { if (preference.matches) animation?.finish(); };
	preference.addEventListener("change", finish);
	createEffect(() => {
		const leaving = exiting();
		const current = getComputedStyle(element);
		const from = first ? { opacity: 0, transform: hiddenTransform }
			: { opacity: current.opacity, transform: current.transform };
		first = false;
		animation?.cancel();
		if (preference.matches) {
			element.style.opacity = leaving ? "0" : "1";
			element.style.transform = leaving ? hiddenTransform : shownTransform;
			return;
		}
		animation = element.animate([from, {
			opacity: leaving ? 0 : 1, transform: leaving ? hiddenTransform : shownTransform,
		}], { duration: 180, easing: leaving ? "ease-in" : "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" });
	});
	onCleanup(() => {
		preference.removeEventListener("change", finish);
		animation?.cancel();
	});
};
