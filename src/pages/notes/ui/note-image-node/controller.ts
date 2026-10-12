import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";
import type { NoteImageElement, NotePositionedElement } from "@/entities/note";
import type { TranslationKey } from "@/shared/lib/i18n";
import { isTauriRuntime } from "@/shared/lib/tauri";
import { createEdgeAutoScroll } from "../../model/edge-auto-scroll";
import { readImageSource } from "../../model/media-import";

type Point = { x: number; y: number; width: number; height: number };
type Interaction = {
	kind: "move" | "resize";
	pointerX: number;
	pointerY: number;
	currentPointerX: number;
	currentPointerY: number;
	initialScrollTop: number;
	scrollViewport?: HTMLElement;
	initial: Point;
	aspect: number;
};

export type NoteImageNodeProps = {
	element: Accessor<NoteImageElement>;
	pageWidth: number;
	pageHeight: number;
	editable: boolean;
	activePositioningId?: string;
	t: (key: TranslationKey) => string;
	onChange: (element: NoteImageElement) => void;
	onPreview: (element?: NotePositionedElement) => void;
	onContextMenu: (elementId: string, event: MouseEvent) => void;
	onInteractionStart: () => void;
};

export const useNoteImageNodeController = (props: NoteImageNodeProps) => {
	const [source, setSource] = createSignal("");
	const [preview, setPreview] = createSignal<Point>();
	const [active, setActive] = createSignal(false);
	const sourceKey = createMemo(() => {
		const element = props.element();
		return element.dataUrl ?? element.imageId ?? "";
	});
	let interaction: Interaction | undefined;
	let nodeRoot: HTMLDivElement | undefined;
	const getScrollViewport = (): HTMLElement | undefined =>
		nodeRoot?.closest<HTMLElement>("[data-omega-scroll-viewport]") ?? undefined;
	const edgeAutoScroll = createEdgeAutoScroll(getScrollViewport);
	const updateInteraction = (): void => {
		if (!interaction) return;
		const deltaX = interaction.currentPointerX - interaction.pointerX;
		const deltaY =
			interaction.currentPointerY -
			interaction.pointerY +
			(interaction.scrollViewport?.scrollTop ?? interaction.initialScrollTop) -
			interaction.initialScrollTop;
		const initial = interaction.initial;
		if (interaction.kind === "move") {
			const next = {
				...initial,
				x: Math.max(0, Math.min(props.pageWidth - initial.width, initial.x + deltaX)),
				y: Math.max(0, initial.y + deltaY),
			};
			setPreview(next);
			props.onPreview({ ...props.element(), ...next });
			return;
		}

		const aspect = interaction.aspect || 1;
		const maxWidth = Math.max(48, Math.min(props.pageWidth - initial.x, (props.pageHeight - initial.y) * aspect));
		const width = Math.max(48, Math.min(maxWidth, initial.width + deltaX));
		const next = { ...initial, width, height: width / aspect };
		setPreview(next);
		props.onPreview({ ...props.element(), ...next });
	};

	createEffect(() => {
		const key = sourceKey();
		setSource("");
		if (key.startsWith("data:")) {
			setSource(key);
			return;
		}
		if (!key || !isTauriRuntime()) return;

		let active = true;
		let objectUrl: string | undefined;
		void readImageSource(key)
			.then((value) => {
				objectUrl = value;
				if (active) setSource(value);
				else URL.revokeObjectURL(value);
			})
			.catch(console.error);
		onCleanup(() => {
			active = false;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		});
	});

	const currentPoint = (): Point => {
		const value = preview();
		if (value) return value;
		const { x, y, width, height } = props.element();
		return { x, y, width, height };
	};

	const begin = (
		event: PointerEvent & { currentTarget: HTMLImageElement | HTMLButtonElement },
		kind: Interaction["kind"],
	): void => {
		if (!props.editable || event.button !== 0) return;
		if (props.activePositioningId !== props.element().id) {
			event.preventDefault();
			return;
		}
		props.onInteractionStart();
		event.preventDefault();
		event.stopPropagation();
		const element = props.element();
		const scrollViewport = getScrollViewport();
		interaction = {
			kind,
			pointerX: event.clientX,
			pointerY: event.clientY,
			currentPointerX: event.clientX,
			currentPointerY: event.clientY,
			initialScrollTop: scrollViewport?.scrollTop ?? 0,
			scrollViewport,
			initial: { x: element.x, y: element.y, width: element.width, height: element.height },
			aspect: element.height > 0 ? element.width / element.height : 1,
		};
		if (kind === "move") {
			scrollViewport?.addEventListener("scroll", updateInteraction, { passive: true });
			edgeAutoScroll.updatePointer(event.clientY);
		}
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const move = (event: PointerEvent): void => {
		if (!interaction) return;
		interaction.currentPointerX = event.clientX;
		interaction.currentPointerY = event.clientY;
		updateInteraction();
		if (interaction.kind === "move") edgeAutoScroll.updatePointer(event.clientY);
	};

	const finish = (): void => {
		const currentInteraction = interaction;
		edgeAutoScroll.stop();
		currentInteraction?.scrollViewport?.removeEventListener("scroll", updateInteraction);
		const next = preview();
		if (
			next &&
			(next.x !== props.element().x ||
				next.y !== props.element().y ||
				next.width !== props.element().width ||
				next.height !== props.element().height)
		) {
			props.onChange({ ...props.element(), ...next });
		}
		interaction = undefined;
		setPreview(undefined);
		props.onPreview();
		setActive(Boolean(nodeRoot?.matches(":hover") || nodeRoot?.contains(document.activeElement)));
	};

	const resizeWithKeyboard = (event: KeyboardEvent): void => {
		if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
		event.preventDefault();
		const element = props.element();
		const aspect = element.height > 0 ? element.width / element.height : 1;
		const amount = event.shiftKey ? 10 : 1;
		const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -amount : amount;
		const maximum = Math.max(48, Math.min(props.pageWidth - element.x, (props.pageHeight - element.y) * aspect));
		const width = Math.max(48, Math.min(maximum, element.width + delta));
		props.onChange({ ...element, width, height: width / aspect });
	};

	const setNaturalSize = (event: Event & { currentTarget: HTMLImageElement }): void => {
		const element = props.element();
		if (element.height > 0) return;
		const image = event.currentTarget;
		if (!image.naturalWidth || !image.naturalHeight) return;
		const x = Math.max(0, Math.min(props.pageWidth - 48, element.x));
		const y = Math.max(0, Math.min(props.pageHeight - 48, element.y));
		const aspect = image.naturalWidth / image.naturalHeight;
		const width = Math.min(element.width, props.pageWidth - x, (props.pageHeight - y) * aspect);
		const height = width / aspect;
		props.onChange({ ...element, x, y, width, height });
	};

	const handleContextMenu = (event: MouseEvent): void => {
		if (props.activePositioningId && props.activePositioningId !== props.element().id) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		props.onContextMenu(props.element().id, event);
	};

	const onPointerEnter = (): void => {
		setActive(true);
	};
	const onPointerLeave = (): void => {
		if (!interaction && !nodeRoot?.contains(document.activeElement)) setActive(false);
	};
	const onFocusIn = (): void => {
		setActive(true);
	};
	const onFocusOut = (event: FocusEvent & { currentTarget: HTMLDivElement }): void => {
		if (!nodeRoot?.contains(event.relatedTarget as Node | null)) setActive(false);
	};

	onCleanup(() => {
		edgeAutoScroll.stop();
		interaction?.scrollViewport?.removeEventListener("scroll", updateInteraction);
	});

	return {
		source,
		active,
		currentPoint,
		begin,
		move,
		finish,
		resizeWithKeyboard,
		setNaturalSize,
		handleContextMenu,
		onPointerEnter,
		onPointerLeave,
		onFocusIn,
		onFocusOut,
		setNodeRoot: (element: HTMLDivElement) => (nodeRoot = element),
	};
};
