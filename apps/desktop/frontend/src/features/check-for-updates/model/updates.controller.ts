import { createSignal, onCleanup, onMount, type Accessor } from "solid-js";
import type { Update } from "../api/updates.repository";

type Status = "idle" | "checking" | "current" | "available" | "downloading" | "installing" | "failed" | "unavailable";

export const useUpdatesController = (beforeInstall: () => Promise<boolean>, canInstall: Accessor<boolean>) => {
	const [status, setStatus] = createSignal<Status>("idle");
	const [version, setVersion] = createSignal("");
	const [progress, setProgress] = createSignal<number>();
	let update: Update | undefined;
	let active = true;
	let busy = false;
	let downloadedUpdate: Update | undefined;
	let noticeTimeout: ReturnType<typeof setTimeout> | undefined;

	const install = async () => {
		if (busy || !update || !active || !canInstall()) return;
		busy = true;
		const candidate = update;
		try {
			setStatus("downloading");
			setProgress(undefined);
			let downloaded = 0;
			let total: number | undefined;
			const repository = await import("../api/updates.repository");
			if (!active) return;
			if (downloadedUpdate !== candidate) await repository.downloadUpdate(candidate, (event) => {
				if (!active) return;
				if (event.event === "Started") total = event.data.contentLength;
				else if (event.event === "Progress") downloaded += event.data.chunkLength;
				if (total) setProgress(Math.min(100, Math.floor(downloaded / total * 100)));
			});
			if (!active) return;
			downloadedUpdate = candidate;
			if (!canInstall()) { setStatus("available"); return; }
			setStatus("installing");
			if (!(await beforeInstall())) throw new Error("UPDATE_SAVE_FAILED");
			if (!active) return;
			await repository.installUpdate(candidate);
		} catch (error) {
			console.error(error);
			if (active) setStatus("failed");
		} finally {
			busy = false;
		}
	};

	const check = async () => {
		if (busy || !active) return;
		busy = true;
		clearTimeout(noticeTimeout);
		try {
			setStatus("checking");
			const repository = await import("../api/updates.repository");
			if (!active) return;
			if (!(await repository.updatesConfigured())) {
				if (active) {
					setStatus("unavailable");
					noticeTimeout = setTimeout(() => { if (active) setStatus("idle"); }, 2_000);
				}
				return;
			}
			const candidate = await repository.checkForUpdates();
			if (!active) return;

			update = candidate ?? undefined;
			downloadedUpdate = undefined;
			setVersion(candidate?.version ?? "");
			setStatus(candidate ? "available" : "current");
		} catch (error) {
			console.error(error);
			if (active) setStatus("failed");
		} finally {
			busy = false;
		}
	};

	onMount(() => {
		if (!import.meta.env.PROD) return;
		const idleWindow = window as Window & {
			requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
			cancelIdleCallback?: (handle: number) => void;
		};
		if (idleWindow.requestIdleCallback) {
			const handle = idleWindow.requestIdleCallback(() => void check(), { timeout: 4_000 });
			onCleanup(() => idleWindow.cancelIdleCallback?.(handle));
		} else {
			const timer = setTimeout(() => void check(), 1_200);
			onCleanup(() => clearTimeout(timer));
		}
	});
	onCleanup(() => {
		active = false;
		clearTimeout(noticeTimeout);

	});

	return {
		status, version, progress,
		installing: () => status() === "installing",
		busy: () => ["checking", "downloading", "installing"].includes(status()),
		activate: () => status() === "available" ? install() : check(),
	};
};

export type UpdatesController = ReturnType<typeof useUpdatesController>;
