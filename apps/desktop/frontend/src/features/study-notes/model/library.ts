import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { readStudies, readStudy, saveStudy, deleteStudy, saveStudyProgress, type StudyDeck, type StudyKind, type StudySummary, type StudyProgress, type InvalidStudyItem } from "@/entities/study";
import type { StudyEnvironment } from "./environment";

/** Todos os métodos de estudo compartilham uma biblioteca do vault e serializam gravações, inclusive no armazenamento do navegador. */
export const useStudyLibrary = (options: StudyEnvironment) => {
	const [decks, setDecks] = createSignal<StudySummary[]>([]);
	const [invalidItems, setInvalidItems] = createSignal<InvalidStudyItem[]>([]);
	const [loading, setLoading] = createSignal(false), [storageFailed, setStorageFailed] = createSignal(false);
	const [error, setError] = createSignal<string>();
	let revision = 0, writeRevision = 0, disposed = false, operations = Promise.resolve();
	type ProgressWrite = { vaultId: string; id: string; kind: StudyKind; progress: StudyProgress; failed: boolean; saving: boolean };
	const progressWrites = new Map<string, ProgressWrite>();
	const [progressRevision, setProgressRevision] = createSignal(0);
	const progressKey = (vaultId: string, kind: StudyKind, id: string) => `${vaultId}/${kind}/${id}`;
	const progressForVault = () => {
		progressRevision();
		const vaultId = options.vaultId();
		return [...progressWrites.values()].filter(value => value.vaultId === vaultId);
	};
	const savingProgress = () => progressForVault().some(value => value.saving);
	const progressFailed = () => progressForVault().some(value => value.failed);
	let reading: AbortController | undefined;
	const serialize = <T,>(operation: () => Promise<T>): Promise<T> => {
		const request = operations.then(operation);
		operations = request.then(() => undefined, () => undefined);
		return request;
	};
	const load = async () => {
		reading?.abort();
		const token = new AbortController(); reading = token;
		const vaultId = options.vaultId(), requestRevision = ++revision;
		const active = () => !disposed && !token.signal.aborted && requestRevision === revision && vaultId === options.vaultId();
		setDecks([]); setInvalidItems([]); setStorageFailed(false); setError(undefined);
		if (!vaultId) { setLoading(false); if (reading === token) reading = undefined; return; }
		setLoading(true);
		try {
			while (active()) {
				const observedWrites = writeRevision;
				setDecks([]); setInvalidItems([]);
				await serialize(async () => {
					if (!active()) return;
					await readStudies(vaultId, {
						signal: token.signal, onItem: item => {
							if (active()) setDecks(previous => previous.some(value => value.id === item.id) ? previous : [...previous, item]);
						}, onInvalidItem: item => {
							if (active()) setInvalidItems(previous => [...previous, item]);
						}
					});
				});
				if (!active() || observedWrites === writeRevision) break;
			}
		} catch {
			if (active()) { setDecks([]); setStorageFailed(true); setError(options.t("studyStorageFailed")); }
		} finally { if (active()) setLoading(false); if (reading === token) reading = undefined; }
	};
	createEffect(on(options.vaultId, () => void load()));
	onCleanup(() => { disposed = true; ++revision; reading?.abort(); });
	const mutate = <T,>(operation: () => Promise<T>) => { ++writeRevision; return serialize(operation); };
	const persistProgress = (value: ProgressWrite) => {
		const key = progressKey(value.vaultId, value.kind, value.id);
		progressWrites.set(key, value);
		setProgressRevision(value => value + 1);
		const request = mutate(() => saveStudyProgress(value.vaultId, value.id, value.kind, value.progress));
		void request.then(() => {
			if (progressWrites.get(key) === value) { progressWrites.delete(key); setProgressRevision(version => version + 1); }
		}, () => {
			if (progressWrites.get(key) === value) { value.failed = true; value.saving = false; setProgressRevision(version => version + 1); }
		});
		return request;
	};
	const flushSave = async (vaultId?: string): Promise<boolean> => {
		for (const value of progressWrites.values()) {
			if (value.failed && !value.saving && (vaultId === undefined || value.vaultId === vaultId)) { value.saving = true; void persistProgress(value).catch(() => undefined); }
		}
		let observed: Promise<void>;
		do { observed = operations; await observed; } while (observed !== operations);
		return ![...progressWrites.values()].some(value => vaultId === undefined || value.vaultId === vaultId);
	};
	return {
		decks, setDecks, invalidItems, loading, storageFailed,
		error: () => progressFailed() ? options.t("studyProgressFailed") : error(), savingProgress, progressFailed, load, flushSave,
		save: (vaultId: string, deck: StudyDeck, signal?: AbortSignal) => mutate(async () => {
			if (signal?.aborted) return false;
			await saveStudy(vaultId, deck);
			if (signal?.aborted) {
				try { await deleteStudy(vaultId, deck.id, deck.kind); }
				catch (failure) { setError(options.t("studyStorageFailed")); throw failure; }
				return false;
			}
			return true;
		}),
		read: (vaultId: string, id: string, kind: StudyKind) => serialize(() => readStudy(vaultId, id, kind)),
		remove: (vaultId: string, id: string, kind: StudyKind) => mutate(async () => {
			await deleteStudy(vaultId, id, kind);
			if (progressWrites.delete(progressKey(vaultId, kind, id))) setProgressRevision(version => version + 1);
			if (vaultId === options.vaultId()) setInvalidItems(previous => previous.filter(item => item.id !== id));
		}),
		saveProgress: (vaultId: string, id: string, kind: StudyKind, progress: StudyProgress) => {
			const previous = progressWrites.get(progressKey(vaultId, kind, id));
			return persistProgress({ vaultId, id, kind, progress, failed: previous?.failed ?? false, saving: true });
		},
	};
};
export type StudyLibrary = ReturnType<typeof useStudyLibrary>;
