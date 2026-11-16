import { createSignal, onCleanup, onMount, Show, type Component } from "solid-js";
import { getDocument, GlobalWorkerOptions, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import Icon from "@/shared/ui/icon";
import { getPdfDocumentStreamUrl, type PdfDocument } from "../api/pdfs.repository";
import { styles } from "./pdf-panel/style.css.ts";

GlobalWorkerOptions.workerSrc = workerUrl;

type Props = { vaultId?: string; document: PdfDocument };

const coverCache = new Map<string, string>();
const maxCachedCovers = 64;
const coverQueue: Array<{ cancelled: boolean; run: () => Promise<void> }> = [];
const maxConcurrentCovers = 2;
let activeCovers = 0;

const drainCoverQueue = (): void => {
	while (activeCovers < maxConcurrentCovers && coverQueue.length) {
		const job = coverQueue.shift()!;
		if (job.cancelled) continue;
		activeCovers++;
		void job.run().finally(() => {
			activeCovers--;
			drainCoverQueue();
		});
	}
};

const enqueueCover = (run: () => Promise<void>): (() => void) => {
	const job = { cancelled: false, run };
	coverQueue.push(job);
	drainCoverQueue();
	return () => { job.cancelled = true; };
};

const destroyTask = (task: ReturnType<typeof getDocument> | undefined): void => {
	if (task) void task.destroy().catch(() => {});
};

const staticAssetUrl = (directory: string): string => import.meta.env.VITE_DESKTOP_RUNTIME !== "tauri"
	? `omega-image://static/pdfjs/${directory}/`
	: new URL(`${import.meta.env.BASE_URL}pdfjs/${directory}/`, window.location.href).href;

const PdfCoverThumbnail: Component<Props> = props => {
	const [source, setSource] = createSignal<string>();
	let host: HTMLSpanElement | undefined;
	let observer: IntersectionObserver | undefined;
	let cancelQueued: (() => void) | undefined;
	let loadingTask: ReturnType<typeof getDocument> | undefined;
	let renderTask: RenderTask | undefined;
	let canvas: HTMLCanvasElement | undefined;
	let cancelled = false;

	const renderCover = async () => {
		const vaultId = props.vaultId;
		if (!vaultId || cancelled) return;
		const cacheKey = `${vaultId}/${props.document.id}`;
		const cached = coverCache.get(cacheKey);
		if (cached) {
			setSource(cached);
			return;
		}
		try {
			const url = await getPdfDocumentStreamUrl(vaultId, props.document.id);
			if (cancelled) return;
			loadingTask = getDocument({
				url,
				rangeChunkSize: 128 * 1024,
				disableStream: true,
				disableAutoFetch: true,
				cMapUrl: staticAssetUrl("cmaps"),
				cMapPacked: true,
				iccUrl: staticAssetUrl("iccs"),
				standardFontDataUrl: staticAssetUrl("standard_fonts"),
				wasmUrl: staticAssetUrl("wasm"),
			});
			const pdf = await loadingTask.promise;
			if (cancelled) return;
			const page = await pdf.getPage(1);
			if (cancelled) return;
			const baseViewport = page.getViewport({ scale: 1 });
			const scale = Math.min(108 / baseViewport.width, 144 / baseViewport.height);
			const viewport = page.getViewport({ scale });
			canvas = window.document.createElement("canvas");
			canvas.width = Math.max(1, Math.ceil(viewport.width));
			canvas.height = Math.max(1, Math.ceil(viewport.height));
			const context = canvas.getContext("2d", { alpha: false });
			if (!context) return;
			renderTask = page.render({ canvas, canvasContext: context, viewport, background: "#fff" });
			await renderTask.promise;
			if (cancelled) return;
			const thumbnail = canvas.toDataURL("image/webp", 0.82);
			if (coverCache.size >= maxCachedCovers) {
				const oldest = coverCache.keys().next().value;
				if (oldest) coverCache.delete(oldest);
			}
			coverCache.set(cacheKey, thumbnail);
			setSource(thumbnail);
		} catch {
			// Keep the file icon as a fallback if the PDF cannot be rendered.
		} finally {
			renderTask = undefined;
			if (canvas) {
				canvas.width = 0;
				canvas.height = 0;
				canvas = undefined;
			}
			const task = loadingTask;
			loadingTask = undefined;
			destroyTask(task);
		}
	};

	onMount(() => {
		if (!props.vaultId) return;
		const cached = coverCache.get(`${props.vaultId}/${props.document.id}`);
		if (cached) {
			setSource(cached);
			return;
		}
		if (typeof IntersectionObserver === "undefined") {
			void renderCover();
			return;
		}
		observer = new IntersectionObserver(entries => {
			if (!entries.some(entry => entry.isIntersecting)) return;
			observer?.disconnect();
			observer = undefined;
			cancelQueued = enqueueCover(renderCover);
		}, { rootMargin: "96px" });
		if (host) observer.observe(host);
	});

	onCleanup(() => {
		cancelled = true;
		cancelQueued?.();
		observer?.disconnect();
		renderTask?.cancel();
		const task = loadingTask;
		loadingTask = undefined;
		destroyTask(task);
	});

	return (
		<span class={styles.cover} ref={element => { host = element; }}>
			<Show when={source()} fallback={<Icon name="file" size={18} />}>
				{thumbnail => <img class={styles.coverImage} src={thumbnail()} />}
			</Show>
		</span>
	);
};

export default PdfCoverThumbnail;
