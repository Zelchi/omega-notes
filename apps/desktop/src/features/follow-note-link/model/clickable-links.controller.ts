import { createEffect, createMemo, createSignal, onCleanup, onMount, type Accessor } from "solid-js";
import { createNoteTitleIndex, normalizeNoteTitle, parseNoteTextLinks, resolveNoteReference,
	type NoteTextLink, type StudyNote } from "@/entities/note";

export type ClickableLinkArea = {
	key: string;
	left: number;
	top: number;
	width: number;
	height: number;
	link: NoteTextLink;
	note?: StudyNote;
};

export const useClickableNoteLinks = (options: {
	editable: Accessor<boolean>;
	text: Accessor<string>;
	notes: Accessor<StudyNote[]>;
	root: Accessor<HTMLElement | undefined>;
	surface: () => HTMLElement | undefined;
	layout: Accessor<unknown>;
}) => {
	const [controlPressed, setControlPressed] = createSignal(false);
	const [areas, setAreas] = createSignal<ClickableLinkArea[]>([]);
	const enabled = () => options.editable() && controlPressed();
	let frame: number | undefined;
	const links = createMemo(() => {
		if (!enabled()) return [];
		const parsed = parseNoteTextLinks(options.text());
		if (!parsed.some((link) => link.kind === "note")) return parsed.map((link) => ({ link, note: undefined }));
		const notes = options.notes();
		const byTitle = createNoteTitleIndex(notes);
		const byId = new Map(notes.map((note) => [normalizeNoteTitle(note.id), note]));
		return parsed.flatMap<{ link: NoteTextLink; note?: StudyNote }>((link) => {
			if (link.kind === "external") return [{ link, note: undefined }];
			const note = resolveNoteReference(link.target, byId, byTitle);
			return note ? [{ link, note }] : [];
		});
	});
	const measure = () => {
		const root = options.root();
		const surface = options.surface();
		if (!enabled() || !root?.isConnected || !surface) { setAreas([]); return; }
		const bounds = surface.getBoundingClientRect();
		const fragments = [...root.querySelectorAll<HTMLElement>("[data-text-fragment]")];
		const next: ClickableLinkArea[] = [];
		for (const { link, note } of links()) {
			for (const fragment of fragments) {
				const node = fragment.firstChild;
				if (!(node instanceof Text)) continue;
				const start = Number(fragment.dataset.start);
				const end = Number(fragment.dataset.end);
				const from = Math.max(start, link.start);
				const to = Math.min(end, link.end);
				if (from >= to) continue;
				const prefix = node.data.startsWith("\u200B") ? 1 : 0;
				const range = document.createRange();
				range.setStart(node, Math.min(node.length, from - start + prefix));
				range.setEnd(node, Math.min(node.length, to - start + prefix));
				for (const rect of range.getClientRects()) {
					if (!rect.width || !rect.height) continue;
					next.push({ key: `${link.start}:${next.length}`, link, note,
						left: rect.left - bounds.left, top: rect.top - bounds.top, width: rect.width, height: rect.height });
				}
			}
		}
		setAreas(next);
	};
	const scheduleMeasure = () => {
		if (!enabled() || frame !== undefined) return;
		frame = requestAnimationFrame(() => { frame = undefined; measure(); });
	};
	createEffect(() => {
		const active = enabled();
		links();
		options.layout();
		options.root();
		if (active) scheduleMeasure();
		else setAreas([]);
	});
	onMount(() => {
		const isControl = (event: KeyboardEvent) =>
			event.key === "Control" || event.code === "ControlLeft" || event.code === "ControlRight";
		const release = () => {
			setControlPressed(false);
			if (frame !== undefined) cancelAnimationFrame(frame);
			frame = undefined;
			setAreas([]);
		};
		const keyDown = (event: KeyboardEvent) => setControlPressed(isControl(event) || event.ctrlKey);
		const keyUp = (event: KeyboardEvent) => {
			if (isControl(event) || !event.ctrlKey) release();
		};
		const visibilityChange = () => { if (document.hidden) release(); };
		window.addEventListener("keydown", keyDown, true);
		window.addEventListener("keyup", keyUp, true);
		document.addEventListener("scroll", scheduleMeasure, true);
		document.addEventListener("visibilitychange", visibilityChange);
		window.addEventListener("blur", release);
		window.addEventListener("resize", scheduleMeasure);
		onCleanup(() => {
			window.removeEventListener("keydown", keyDown, true);
			window.removeEventListener("keyup", keyUp, true);
			document.removeEventListener("scroll", scheduleMeasure, true);
			document.removeEventListener("visibilitychange", visibilityChange);
			window.removeEventListener("blur", release);
			window.removeEventListener("resize", scheduleMeasure);
		});
	});
	onCleanup(() => { if (frame !== undefined) cancelAnimationFrame(frame); });
	return { areas: () => enabled() ? areas() : [] };
};
