import { createEffect, createSignal, onCleanup, untrack, type Accessor } from "solid-js";

/** Mantenha o conteúdo montado enquanto a animação de saída termina. */
export const createPresence = (visible: Accessor<boolean>, exitDuration: number) => {
	const [present, setPresent] = createSignal(visible());
	const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
	let timer: ReturnType<typeof setTimeout> | undefined;
	const finishReducedMotion = () => {
		if (preference.matches && !visible()) {
			clearTimeout(timer);
			setPresent(false);
		}
	};
	preference.addEventListener("change", finishReducedMotion);

	createEffect(() => {
		const open = visible();
		clearTimeout(timer);
		if (open) setPresent(true);
		else if (untrack(present)) {
			if (preference.matches) setPresent(false);
			else timer = setTimeout(() => setPresent(false), exitDuration);
		}
	});
	onCleanup(() => {
		clearTimeout(timer);
		preference.removeEventListener("change", finishReducedMotion);
	});

	return { present, exiting: () => present() && !visible() };
};
