import { createSignal, onCleanup, onMount } from "solid-js";

type Axis = "vertical" | "horizontal";
type Metrics = {
	top: number;
	left: number;
	scrollHeight: number;
	scrollWidth: number;
	clientHeight: number;
	clientWidth: number;
	rootHeight: number;
	rootWidth: number;
};
type Drag = { axis: Axis; pointerStart: number; scrollStart: number; travel: number };

const emptyMetrics: Metrics = {
	top: 0,
	left: 0,
	scrollHeight: 0,
	scrollWidth: 0,
	clientHeight: 0,
	clientWidth: 0,
	rootHeight: 0,
	rootWidth: 0,
};

export const useCustomScrollArea = () => {
	let root!: HTMLDivElement;
	let viewport!: HTMLDivElement;
	let content!: HTMLDivElement;
	const [metrics, setMetrics] = createSignal<Metrics>(emptyMetrics);
	const [drag, setDrag] = createSignal<Drag>();

	const updateMetrics = (): void => {
		if (!viewport || !root) return;
		setMetrics({
			top: viewport.scrollTop,
			left: viewport.scrollLeft,
			scrollHeight: viewport.scrollHeight,
			scrollWidth: viewport.scrollWidth,
			clientHeight: viewport.clientHeight,
			clientWidth: viewport.clientWidth,
			rootHeight: root.clientHeight,
			rootWidth: root.clientWidth,
		});
	};

	const thumb = (axis: Axis): { length: number; offset: number; trackLength: number; maxScroll: number } => {
		const value = metrics();
		const client = axis === "vertical" ? value.clientHeight : value.clientWidth;
		const scrollLength = axis === "vertical" ? value.scrollHeight : value.scrollWidth;
		const trackLength = Math.max(0, (axis === "vertical" ? value.rootHeight : value.rootWidth) - 28);
		const maxScroll = Math.max(0, scrollLength - client);
		const length = Math.min(trackLength, Math.max(28, (trackLength * client) / Math.max(client, scrollLength)));
		const scroll = axis === "vertical" ? value.top : value.left;
		const offset = maxScroll > 0 ? (scroll / maxScroll) * Math.max(0, trackLength - length) : 0;
		return { length, offset, trackLength, maxScroll };
	};

	const onTrackPointerDown = (event: PointerEvent & { currentTarget: HTMLDivElement }, axis: Axis): void => {
		if (event.target !== event.currentTarget) return;
		event.preventDefault();
		const bounds = event.currentTarget.getBoundingClientRect();
		const geometry = thumb(axis);
		const pointer = axis === "vertical" ? event.clientY - bounds.top : event.clientX - bounds.left;
		const offset = Math.max(0, Math.min(geometry.trackLength - geometry.length, pointer - geometry.length / 2));
		const ratio = geometry.trackLength > geometry.length ? offset / (geometry.trackLength - geometry.length) : 0;
		if (axis === "vertical") viewport.scrollTop = ratio * geometry.maxScroll;
		else viewport.scrollLeft = ratio * geometry.maxScroll;
	};

	const beginDrag = (event: PointerEvent & { currentTarget: HTMLDivElement }, axis: Axis): void => {
		event.preventDefault();
		event.stopPropagation();
		const geometry = thumb(axis);
		const pointerStart = axis === "vertical" ? event.clientY : event.clientX;
		const scrollStart = axis === "vertical" ? viewport.scrollTop : viewport.scrollLeft;
		setDrag({ axis, pointerStart, scrollStart, travel: Math.max(1, geometry.trackLength - geometry.length) });
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const moveThumb = (event: PointerEvent): void => {
		const current = drag();
		if (!current) return;
		const pointer = current.axis === "vertical" ? event.clientY : event.clientX;
		const delta = (pointer - current.pointerStart) / current.travel;
		const next = current.scrollStart + delta * thumb(current.axis).maxScroll;
		if (current.axis === "vertical") viewport.scrollTop = next;
		else viewport.scrollLeft = next;
	};

	const finishDrag = (): void => {
		setDrag(undefined);
	};

	const onScrollbarKeyDown = (event: KeyboardEvent, axis: Axis): void => {
		const vertical = axis === "vertical";
		const step = 40;
		const page = vertical ? metrics().clientHeight : metrics().clientWidth;
		const maximum = thumb(axis).maxScroll;
		let next: number | undefined;
		if ((vertical && event.key === "ArrowDown") || (!vertical && event.key === "ArrowRight"))
			next = (vertical ? viewport.scrollTop : viewport.scrollLeft) + step;
		else if ((vertical && event.key === "ArrowUp") || (!vertical && event.key === "ArrowLeft"))
			next = (vertical ? viewport.scrollTop : viewport.scrollLeft) - step;
		else if (event.key === "PageDown") next = (vertical ? viewport.scrollTop : viewport.scrollLeft) + page;
		else if (event.key === "PageUp") next = (vertical ? viewport.scrollTop : viewport.scrollLeft) - page;
		else if (event.key === "Home") next = 0;
		else if (event.key === "End") next = maximum;
		if (next === undefined) return;
		event.preventDefault();
		if (vertical) viewport.scrollTop = Math.max(0, Math.min(maximum, next));
		else viewport.scrollLeft = Math.max(0, Math.min(maximum, next));
	};

	onMount(() => {
		const observer = new ResizeObserver(updateMetrics);
		observer.observe(root);
		observer.observe(viewport);
		observer.observe(content);
		viewport.addEventListener("scroll", updateMetrics, { passive: true });
		addEventListener("resize", updateMetrics);
		requestAnimationFrame(updateMetrics);
		onCleanup(() => {
			observer.disconnect();
			viewport.removeEventListener("scroll", updateMetrics);
			removeEventListener("resize", updateMetrics);
		});
	});

	return {
		metrics,
		thumb,
		updateMetrics,
		onTrackPointerDown,
		beginDrag,
		moveThumb,
		finishDrag,
		onScrollbarKeyDown,
		setRoot: (element: HTMLDivElement) => (root = element),
		setViewport: (element: HTMLDivElement) => (viewport = element),
		setContent: (element: HTMLDivElement) => (content = element),
	};
};
