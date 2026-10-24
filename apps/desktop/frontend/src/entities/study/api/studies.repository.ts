import { Channel, invoke } from "@/shared/lib/desktop";
import { isDesktopRuntime } from "@/shared/lib/desktop";
import { decodeStudyDeck, type StudyDeck, type StudyKind } from "../model/study";
import { decodeStudySummary, studySummary, type StudySummary } from "../model/summary";
const prefix = (vaultId: string) => `omega-notes.studies.${vaultId}/`;
const key = (vaultId: string, kind: StudyKind, id: string) => `${prefix(vaultId)}${kind}/${id}.json`;
export type InvalidStudyItem = { id: string; kind: StudyKind };
type ReadOptions = { signal?: AbortSignal; onItem?: (item: StudySummary) => void; onInvalidItem?: (item: InvalidStudyItem) => void };
type StudyEvent = { kind: "item"; item: unknown } | { kind: "invalidItem"; id: string; studyKind: StudyKind } | { kind: "complete"; total: number };
const cancelled = () => Error("STUDY_READ_CANCELLED");

/** Decodifique no máximo uma questão/card salvo por tarefa, para que uma biblioteca grande não monopolize o WebView. */
const streamStudies = (vaultId: string, options: ReadOptions): Promise<StudySummary[]> => new Promise((resolve, reject) => {
	if (options.signal?.aborted) { reject(cancelled()); return; }
	const items: StudySummary[] = [], ids = new Set<string>(), queue: StudyEvent[] = [];
	const channel = new Channel<StudyEvent>();
	let done = false, invoked = false, complete = false, received = 0;
	let task: ReturnType<typeof setTimeout> | undefined;
	const cleanup = () => {
		clearTimeout(timeout); clearTimeout(task); queue.length = 0;
		channel.onmessage = () => undefined;
		options.signal?.removeEventListener("abort", abort);
	};
	const fail = (failure: Error) => { if (!done) { done = true; cleanup(); reject(failure); } };
	const abort = () => fail(cancelled());
	const timeout = setTimeout(() => fail(Error("STUDY_STORAGE_FAILED")), 120_000);
	const finish = () => { if (!done && invoked && complete && !queue.length) { done = true; cleanup(); resolve(items); } };
	const drain = () => {
		task = undefined;
		if (done) return;
		try {
			const event = queue.shift();
			if (!event || complete) throw Error("STUDY_STORAGE_FAILED");
			if (event.kind === "item") {
				const item = decodeStudySummary(event.item);
				if (items.length >= 1000 || ids.has(item.id)) throw Error("STUDY_STORAGE_FAILED");
				ids.add(item.id); items.push(item); options.onItem?.(item);
			} else if (event.kind === "invalidItem") {
				assertIdentity(event.studyKind, event.id);
				if (ids.size >= 1000 || ids.has(event.id)) throw Error("STUDY_STORAGE_FAILED");
				ids.add(event.id); options.onInvalidItem?.({ id: event.id, kind: event.studyKind });
			} else if (event.kind === "complete" && Number.isInteger(event.total) && event.total === ids.size) complete = true;
			else throw Error("STUDY_STORAGE_FAILED");
			if (queue.length) task = setTimeout(drain, 0);
			else finish();
		} catch { fail(Error("STUDY_STORAGE_FAILED")); }
	};
	channel.onmessage = event => {
		if (done) return;
		if (++received > 1001 || !event || typeof event !== "object" || complete) { fail(Error("STUDY_STORAGE_FAILED")); return; }
		queue.push(event);
		if (task === undefined) task = setTimeout(drain, 0);
	};
	options.signal?.addEventListener("abort", abort, { once: true });
	void Promise.resolve().then(() => invoke<void>("read_studies", { vaultId, onItem: channel })).then(() => { invoked = true; finish(); }, () => fail(Error("STUDY_STORAGE_FAILED")));
});

const kinds: StudyKind[] = ["flashcards", "quiz", "written", "cloze", "correction"];
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const assertIdentity = (kind: StudyKind, id: string) => {
	if (!kinds.includes(kind) || !idPattern.test(id)) throw Error("STUDY_STORAGE_FAILED");
};
const browserEntries = (vaultId: string) => {
	const entries: { key: string; kind: StudyKind; id: string; raw: string; bytes: number }[] = [], ids = new Set<string>();
	let total = 0;
	for (let index = 0; index < localStorage.length; index++) {
		const name = localStorage.key(index);
		if (!name?.startsWith(prefix(vaultId))) continue;
		const parts = name.slice(prefix(vaultId).length).split("/");
		if (parts.length !== 2 || !parts[1].endsWith(".json")) throw Error("STUDY_STORAGE_FAILED");
		const kind = parts[0] as StudyKind, id = parts[1].slice(0, -5);
		assertIdentity(kind, id);
		const raw = localStorage.getItem(name);
		if (raw === null || ids.has(id)) throw Error("STUDY_STORAGE_FAILED");
		const bytes = new TextEncoder().encode(raw).length;
		total += bytes; ids.add(id);
		if (total > 4_000_000 || entries.length >= 1000) throw Error("STUDY_STORAGE_FAILED");
		entries.push({ key: name, kind, id, raw, bytes });
	}
	return entries;
};
export const readStudies = async (vaultId: string, options: ReadOptions = {}): Promise<StudySummary[]> => {
	if (isDesktopRuntime()) return streamStudies(vaultId, options);
	try {
		if (options.signal?.aborted) throw cancelled();
		const entries = browserEntries(vaultId), items: StudySummary[] = [];
		for (const entry of entries) {
			await new Promise<void>(resolve => setTimeout(resolve, 0));
			if (options.signal?.aborted) throw cancelled();
			let item: StudyDeck;
			try {
				item = decodeStudyDeck(JSON.parse(entry.raw));
				if (item.id !== entry.id || item.kind !== entry.kind) throw Error("STUDY_STORAGE_FAILED");
			} catch { options.onInvalidItem?.({ id: entry.id, kind: entry.kind }); continue; }
			const summary = studySummary(item);
			items.push(summary); options.onItem?.(summary);
		}
		return items;
	} catch { throw options.signal?.aborted ? cancelled() : Error("STUDY_STORAGE_FAILED"); }
};
export const readStudy = async (vaultId: string, studyId: string, kind: StudyKind): Promise<StudyDeck> => {
	try {
		assertIdentity(kind, studyId);
		const value: unknown = isDesktopRuntime() ? await invoke("read_study", { vaultId, studyId, kind }) : (() => {
			const raw = localStorage.getItem(key(vaultId, kind, studyId));
			if (!raw || new TextEncoder().encode(raw).length > 4_000_000) throw Error("STUDY_STORAGE_FAILED");
			return JSON.parse(raw);
		})();
		const material = decodeStudyDeck(value);
		if (material.id !== studyId || material.kind !== kind) throw Error("STUDY_STORAGE_FAILED");
		return material;
	} catch { throw Error("STUDY_STORAGE_FAILED"); }
};
const writeBrowserStudy = (vaultId: string, study: StudyDeck, existingOnly: boolean) => {
	assertIdentity(study.kind, study.id);
	decodeStudyDeck(study);
	const entries = browserEntries(vaultId), previous = entries.find(entry => entry.id === study.id);
	if (existingOnly && !previous || previous && previous.kind !== study.kind) throw Error("STUDY_STORAGE_FAILED");
	if (!previous && entries.length >= 1000) throw Error("STUDY_LIMIT_REACHED");
	const value = JSON.stringify(study);
	if (entries.reduce((total, entry) => total + entry.bytes, 0) - (previous?.bytes ?? 0) + new TextEncoder().encode(value).length > 4_000_000) throw Error("STUDY_STORAGE_FAILED");
	localStorage.setItem(key(vaultId, study.kind, study.id), value);
};
export const saveStudy = async (vaultId: string, study: StudyDeck): Promise<void> => {
	try {
		if (isDesktopRuntime()) { await invoke("save_study", { vaultId, study }); return; }
		writeBrowserStudy(vaultId, study, false);
	} catch (failure) { throw Error(String(failure instanceof Error ? failure.message : failure) === "STUDY_LIMIT_REACHED" ? "STUDY_LIMIT_REACHED" : "STUDY_STORAGE_FAILED"); }
};
export const deleteStudy = async (vaultId: string, studyId: string, kind: StudyKind): Promise<void> => {
	try {
		assertIdentity(kind, studyId);
		if (isDesktopRuntime()) { await invoke("delete_study", { vaultId, studyId, kind }); return; }
		localStorage.removeItem(key(vaultId, kind, studyId));
	} catch { throw Error("STUDY_STORAGE_FAILED"); }
};
export const deleteBrowserStudiesForVault = (vaultId: string): void => {
	const names: string[] = [];
	for (let index = 0; index < localStorage.length; index++) {
		const name = localStorage.key(index);
		if (name?.startsWith(prefix(vaultId))) names.push(name);
	}
	for (const name of names) localStorage.removeItem(name);
};
/** Atualize um item salvo; uma gravação tardia do progresso nunca deve recriar um item excluído. */
export const saveStudyProgress = async (vaultId: string, studyId: string, kind: StudyKind, progress: import("../model/progress").StudyProgress): Promise<void> => {
	try {
		if (isDesktopRuntime()) { await invoke("save_study_progress", { vaultId, studyId, kind, progress }); return; }
		const material = await readStudy(vaultId, studyId, kind);
		material.progress = progress;
		writeBrowserStudy(vaultId, material, true);
	} catch { throw Error("STUDY_STORAGE_FAILED"); }
};
