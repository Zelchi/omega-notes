import { createNoteTitleIndex, normalizeNoteTitle, resolveNoteReference, type NoteSummary } from "@/entities/note";

const MAX_REFERENCE_DEPTH = 3;
const MAX_REFERENCES_SCANNED = 64;
const MAX_SOURCE_NOTES = 16;
// Mantidos iguais aos limites validados pelo backend em ai/study_context.rs.
const MIN_STUDY_CHARACTERS = 180;
const MIN_STUDY_WORDS = 25;
const MIN_STUDY_LINES = 3;

/** Resolve up to three reference hops; empty notes may still lead to useful sources. */
export const createStudySourceResolver = (notes: NoteSummary[]) => {
	const ids = new Map(notes.map(note => [normalizeNoteTitle(note.id), note])), titles = createNoteTitleIndex(notes);
	return (current: NoteSummary): NoteSummary[] => {
		const result = new Map([[current.id, current]]), visited = new Set([current.id]);
		const visit = (note: NoteSummary, depth: number) => {
			if (depth >= MAX_REFERENCE_DEPTH || result.size >= MAX_SOURCE_NOTES || visited.size >= MAX_REFERENCES_SCANNED) return;
			for (const target of note.links) {
				if (result.size >= MAX_SOURCE_NOTES || visited.size >= MAX_REFERENCES_SCANNED) return;
				const reference = resolveNoteReference(target, ids, titles);
				if (!reference || visited.has(reference.id)) continue;
				visited.add(reference.id);
				if (reference.hasText) result.set(reference.id, reference);
				visit(reference, depth + 1);
			}
		};
		visit(current, 0);
		return [...result.values()];
	};
};

export type StudyAssignment = { itemId: string; candidateId: string; noteId: string; sourceIds: ReadonlySet<string>; supportingNoteIds?: readonly string[] };
export const createStudyPlan = (notes: NoteSummary[], count: number, excluded: ReadonlySet<string> = new Set()): StudyAssignment[] => {
	const resolve = createStudySourceResolver(notes), resolvedSources = new Map<string, NoteSummary[]>();
	const candidates = notes.filter(note => {
		if (excluded.has(note.id)) return false;
		const sources = resolve(note).filter(source => source.hasText);
		const characters = sources.reduce((total, source) => total + source.studyContentCharacters, 0);
		const words = sources.reduce((total, source) => total + source.studyContentWords, 0);
		const lines = sources.reduce((total, source) => total + source.studyContentLines, 0);
		if (characters < MIN_STUDY_CHARACTERS || words < MIN_STUDY_WORDS || lines < MIN_STUDY_LINES) return false;
		resolvedSources.set(note.id, sources);
		return true;
	});
	if (!candidates.length) return [];
	const scopes = new Map<string, ReadonlySet<string>>();
	let pool: NoteSummary[] = [];
	return Array.from({ length: count }, () => {
		if (!pool.length) pool = [...candidates];
		const index = Math.floor(Math.random() * pool.length), note = pool[index];
		pool[index] = pool[pool.length - 1]; pool.pop();
		let sourceIds = scopes.get(note.id);
		const textSources = resolvedSources.get(note.id)!;
		const primary = textSources[0] ?? note;
		if (!sourceIds) {
			const ids = [primary.id, ...textSources.map(source => source.id).filter(id => id !== primary.id)];
			sourceIds = new Set(ids); scopes.set(note.id, sourceIds);
		}
		return { itemId: crypto.randomUUID(), candidateId: note.id, noteId: primary.id, sourceIds,
			supportingNoteIds: [...sourceIds].filter(id => id !== primary.id) };
	});
};

export const replaceStudyAssignments = (notes: NoteSummary[], plan: StudyAssignment[], rejected: ReadonlySet<string>, pendingIds: ReadonlySet<string>): StudyAssignment[] | undefined => {
	const positions = plan.flatMap((assignment, index) => rejected.has(assignment.candidateId) && pendingIds.has(assignment.itemId) ? [index] : []);
	if (!positions.length) return;
	const excluded = new Set([...rejected, ...plan.filter((_, index) => !positions.includes(index)).map(item => item.candidateId)]);
	let replacements = createStudyPlan(notes, positions.length, excluded);
	if (!replacements.length) replacements = createStudyPlan(notes, positions.length, rejected);
	if (!replacements.length) return;
	const next = [...plan];
	positions.forEach((position, index) => { next[position] = { ...replacements[index], itemId: plan[position].itemId }; });
	return next;
};
