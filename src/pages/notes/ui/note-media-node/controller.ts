import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import { MIN_AUDIO_WIDTH, type NoteMediaElement, type NotePositionedElement } from "@/entities/note";
import { isTauriRuntime } from "@/shared/lib/tauri";
import { createEdgeAutoScroll } from "../../model/edge-auto-scroll";
import { readMediaSource } from "../../model/media-import";

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

export type NoteMediaNodeProps = {
	element: Accessor<NoteMediaElement>;
	pageWidth: number;
	pageHeight: number;
	editable: boolean;
	activePositioningId?: string;
	t: (key: TranslationKey) => string;
	onChange: (element: NoteMediaElement) => void;
	onPreview: (element?: NotePositionedElement) => void;
	onContextMenu: (elementId: string, event: MouseEvent) => void;
	onInteractionStart: () => void;
};

export const useNoteMediaNodeController = (props: NoteMediaNodeProps) => {
	const [source, setSource] = createSignal("");
	const [preview, setPreview] = createSignal<Point>();
	const [active, setActive] = createSignal(false);
	const sourceKey = createMemo(() => {
		const element = props.element();
		return element.dataUrl ?? (element.type === "audio" ? element.audioId : element.videoId) ?? "";
	});
	const sourceType = createMemo(() => props.element().type);
	let interaction: Interaction | undefined;
	let nodeRoot: HTMLDivElement | undefined;
	const getScrollViewport = (): HTMLElement | undefined =>
		nodeRoot?.closest<HTMLElement>("[data-omega-scroll-viewport]") ?? undefined;
	const edgeAutoScroll = createEdgeAutoScroll(getScrollViewport);

	createEffect(() => {
		const key = sourceKey();
		const type = sourceType();
		setSource("");
		if (key.startsWith("data:")) {
			setSource(key);
			return;
		}
		if (!key || !isTauriRuntime()) return;

		let active = true;
		void readMediaSource(key, type)
			.then((value) => {
				if (active) setSource(value);
			})
			.catch(console.error);
		onCleanup(() => {
			active = false;
		});
	});

	const currentPoint = (): Point => {
		const value = preview();
		if (value) return value;
		const element = props.element();
		const width = element.type === "audio" ? Math.max(element.width, MIN_AUDIO_WIDTH) : element.width;
		return {
			x: element.type === "audio" ? Math.max(0, Math.min(element.x, props.pageWidth - width)) : element.x,
			y: element.y,
			width,
			height: element.height,
		};
	};

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

		const element = props.element();
		const minWidth = Math.min(element.type === "audio" ? MIN_AUDIO_WIDTH : 48, props.pageWidth - initial.x);
		const maxWidth = Math.max(
			minWidth,
			element.type === "audio"
				? props.pageWidth - initial.x
				: Math.min(props.pageWidth - initial.x, (props.pageHeight - initial.y) * interaction.aspect),
		);
		const width = Math.max(minWidth, Math.min(maxWidth, initial.width + deltaX));
		const next = {
			...initial,
			width,
			height: element.type === "audio" ? initial.height : width / interaction.aspect,
		};
		setPreview(next);
		props.onPreview({ ...element, ...next });
	};

	const begin = (event: PointerEvent, kind: Interaction["kind"]): void => {
		const element = props.element();
		if (!props.editable || event.button !== 0 || props.activePositioningId !== element.id) return;

		props.onInteractionStart();
		event.preventDefault();
		event.stopPropagation();
		const scrollViewport = getScrollViewport();
		interaction = {
			kind,
			pointerX: event.clientX,
			pointerY: event.clientY,
			currentPointerX: event.clientX,
			currentPointerY: event.clientY,
			initialScrollTop: scrollViewport?.scrollTop ?? 0,
			scrollViewport,
			initial: currentPoint(),
			aspect: element.height > 0 ? element.width / element.height : 1,
		};
		if (kind === "move") {
			scrollViewport?.addEventListener("scroll", updateInteraction, { passive: true });
			edgeAutoScroll.updatePointer(event.clientY);
		}
		if (event.currentTarget instanceof HTMLElement) event.currentTarget.setPointerCapture(event.pointerId);
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
		const element = props.element();
		const horizontalKey = event.key === "ArrowLeft" || event.key === "ArrowRight";
		if (
			!props.editable ||
			props.activePositioningId !== element.id ||
			!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) ||
			(element.type === "audio" && !horizontalKey)
		)
			return;

		event.preventDefault();
		const point = currentPoint();
		const minWidth = Math.min(element.type === "audio" ? MIN_AUDIO_WIDTH : 48, props.pageWidth - point.x);
		const aspect = point.height > 0 ? point.width / point.height : 1;
		const maxWidth = Math.max(
			minWidth,
			element.type === "audio"
				? props.pageWidth - point.x
				: Math.min(props.pageWidth - point.x, (props.pageHeight - point.y) * aspect),
		);
		const amount = event.shiftKey ? 10 : 1;
		const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -amount : amount;
		const width = Math.max(minWidth, Math.min(maxWidth, point.width + delta));
		props.onChange({
			...element,
			width,
			height: element.type === "audio" ? element.height : width / aspect,
		});
	};

	const setVideoAspect = (event: Event & { currentTarget: HTMLVideoElement }): void => {
		const element = props.element();
		const video = event.currentTarget;
		if (element.type !== "video" || !video.videoWidth || !video.videoHeight) return;

		const aspect = video.videoWidth / video.videoHeight;
		const width = Math.min(element.width, props.pageWidth - element.x, (props.pageHeight - element.y) * aspect);
		const height = width / aspect;
		if (Math.abs(width - element.width) < 0.5 && Math.abs(height - element.height) < 0.5) return;
		props.onChange({ ...element, width, height });
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
		setVideoAspect,
		handleContextMenu,
		onPointerEnter,
		onPointerLeave,
		onFocusIn,
		onFocusOut,
		setNodeRoot: (element: HTMLDivElement) => (nodeRoot = element),
	};
};
