import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { readStudies, readStudy, saveStudy, deleteStudy, saveStudyProgress, type StudyDeck, type StudyKind, type StudySummary, type StudyProgress, type InvalidStudySession } from "@/entities/study";
import type { StudyEnvironment } from "./environment";

/** All study methods share one vault library and serialize writes, including browser storage. */
export const useStudyLibrary = (options: StudyEnvironment) => {
	const [decks, setDecks] = createSignal<StudySummary[]>([]);
	const [invalidSessions, setInvalidSessions] = createSignal<InvalidStudySession[]>([]);
	const [loading, setLoading] = createSignal(false), [storageFailed, setStorageFailed] = createSignal(false);
	const [error, setError] = createSignal<string>();
	let revision = 0, writeRevision = 0, disposed = false, operations = Promise.resolve();
	type ProgressWrite = { vaultId: string; id: string; kind: StudyKind; progress: StudyProgress; failed: boolean };
	const progressWrites = new Map<string, ProgressWrite>();
	const progressKey = (vaultId: string, kind: StudyKind, id: string) => `${vaultId}/${kind}/${id}`;
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
		setDecks([]); setInvalidSessions([]); setStorageFailed(false); setError(undefined);
		if (!vaultId) { setLoading(false); if (reading === token) reading = undefined; return; }
		setLoading(true);
		try {
			while (active()) {
				const observedWrites = writeRevision;
				setDecks([]); setInvalidSessions([]);
				await serialize(async () => {
					if (!active()) return;
					await readStudies(vaultId, { signal: token.signal, onSession: session => {
						if (active()) setDecks(previous => previous.some(value => value.id === session.id) ? previous : [...previous, session]);
					}, onInvalidSession: session => {
						if (active()) setInvalidSessions(previous => [...previous, session]);
					} });
				});
				if (!active() || observedWrites === writeRevision) break;
				// A background result queued a write during this snapshot. Read again after that write.
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
		const request = mutate(() => saveStudyProgress(value.vaultId, value.id, value.kind, value.progress));
		void request.then(() => {
			if (progressWrites.get(key) === value) progressWrites.delete(key);
		}, () => { value.failed = true; });
		return request;
	};
	const flushSave = async (): Promise<boolean> => {
		// Retry the latest failed snapshot only; older snapshots must never overwrite newer ones.
		for (const value of progressWrites.values()) {
			if (value.failed) { value.failed = false; void persistProgress(value).catch(() => undefined); }
		}
		let observed: Promise<void>;
		do { observed = operations; await observed; } while (observed !== operations);
		const saved = progressWrites.size === 0;
		if (!saved) setError(options.t("studyProgressFailed"));
		return saved;
	};
	return {
		decks, setDecks, invalidSessions, loading, storageFailed, error, load, flushSave,
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
			progressWrites.delete(progressKey(vaultId, kind, id));
			if (vaultId === options.vaultId()) setInvalidSessions(previous => previous.filter(session => session.id !== id));
		}),
		saveProgress: (vaultId: string, id: string, kind: StudyKind, progress: StudyProgress) => persistProgress({ vaultId, id, kind, progress, failed: false }),
	};
};
export type StudyLibrary = ReturnType<typeof useStudyLibrary>;
