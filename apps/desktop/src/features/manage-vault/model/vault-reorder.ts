import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { Vault } from "@/entities/vault";

/** Pointer events work in WebViews where native file drag/drop consumes HTML drag events. */
export const useVaultReorder = (options: {
	vaults: () => Vault[];
	enabled: () => boolean;
	getList: () => HTMLElement | undefined;
	onReorder: (ids: string[]) => Promise<boolean>;
}) => {
	const [order, setOrder] = createSignal<string[]>();
	const [draggedId, setDraggedId] = createSignal<string>();
	let gesture: { id: string; pointerId: number; x: number; y: number; currentY: number; original: string[]; moved: boolean } | undefined;
	let scrollFrame: number | undefined;
	let suppressClick = false;
	let disposed = false;
	const vaults = createMemo(() => {
		const current = options.vaults(), ids = order();
		if (!ids) return current;
		const byId = new Map(current.map(vault => [vault.id, vault]));
		return ids.flatMap(id => { const vault = byId.get(id); return vault ? [vault] : []; });
	});
	const clearGesture = () => {
		gesture = undefined; setDraggedId(undefined);
		if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
		scrollFrame = undefined;
	};
	const cancel = () => {
		if (gesture?.moved) suppressClick = true;
		clearGesture(); setOrder(undefined);
	};
	createEffect(() => { if (!options.enabled() && gesture) cancel(); });
	const placeAtPointer = () => {
		if (!gesture?.moved) return;
		const rows = [...(options.getList()?.querySelectorAll<HTMLElement>("[data-vault-row]") ?? [])]
			.filter(row => row.dataset.vaultRow !== gesture!.id);
		const index = rows.findIndex(row => { const rect = row.getBoundingClientRect(); return gesture!.currentY < rect.top + rect.height / 2; });
		const ids = rows.map(row => row.dataset.vaultRow!);
		ids.splice(index < 0 ? ids.length : index, 0, gesture.id);
		if (ids.join("\0") !== order()?.join("\0")) setOrder(ids);
	};
	const scroll = () => {
		scrollFrame = undefined;
		const list = options.getList();
		if (!gesture?.moved || !list) return;
		const rect = list.getBoundingClientRect();
		const delta = gesture.currentY < rect.top + 24 ? -8 : gesture.currentY > rect.bottom - 24 ? 8 : 0;
		if (delta) { list.scrollTop += delta; placeAtPointer(); }
		scrollFrame = requestAnimationFrame(scroll);
	};
	const move = (event: PointerEvent) => {
		if (!gesture || event.pointerId !== gesture.pointerId) return;
		if (!options.enabled() || event.buttons === 0) { cancel(); return; }
		gesture.currentY = event.clientY;
		if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 6) return;
		event.preventDefault();
		if (!gesture.moved) {
			gesture.moved = true; setDraggedId(gesture.id); setOrder(gesture.original);
			scrollFrame = requestAnimationFrame(scroll);
		}
		placeAtPointer();
	};
	const end = (event: PointerEvent) => {
		if (!gesture || event.pointerId !== gesture.pointerId) return;
		const moved = gesture.moved, original = gesture.original, ids = order();
		clearGesture();
		if (!moved) return;
		suppressClick = true;
		if (!ids || ids.join("\0") === original.join("\0") || !options.enabled()) { setOrder(undefined); return; }
		// Keep the preview until persistence completes; failure restores the server's order.
		void options.onReorder(ids).catch(cause => console.error("Could not reorder vaults", cause))
			.finally(() => { if (!disposed) setOrder(undefined); });
	};
	onMount(() => {
		const pointerCancel = (event: PointerEvent) => { if (event.pointerId === gesture?.pointerId) cancel(); };
		const blur = () => { if (gesture) cancel(); };
		const escape = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || !gesture) return;
			event.preventDefault(); event.stopImmediatePropagation(); cancel();
		};
		window.addEventListener("pointermove", move, { passive: false });
		window.addEventListener("pointerup", end);
		window.addEventListener("pointercancel", pointerCancel);
		window.addEventListener("blur", blur);
		window.addEventListener("keydown", escape, true);
		onCleanup(() => {
			disposed = true; clearGesture();
			window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end);
			window.removeEventListener("pointercancel", pointerCancel); window.removeEventListener("blur", blur);
			window.removeEventListener("keydown", escape, true);
		});
	});
	return {
		vaults, draggedId,
		begin: (event: PointerEvent, id: string) => {
			if (event.button !== 0 || !event.isPrimary || !options.enabled() || gesture) return;
			suppressClick = false;
			gesture = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, currentY: event.clientY,
				original: options.vaults().map(vault => vault.id), moved: false };
		},
		consumeClick: (event: MouseEvent): boolean => {
			if (!suppressClick || event.detail === 0) return false;
			suppressClick = false; event.preventDefault(); event.stopPropagation(); return true;
		},
	};
};
