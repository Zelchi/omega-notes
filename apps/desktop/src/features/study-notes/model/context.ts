import { documentText, parseNoteTextLinks, createNoteTitleIndex, normalizeNoteTitle, resolveNoteReference, type StudyNote } from "@/entities/note";
import { mapTextOutsideCode } from "@/shared/lib/formatted-text";
import { rankFocusedStudySupport } from "./support-selection";

const hasText = (note: StudyNote) => note.document.elements.some(element => element.type === "text" && element.text.trim());

/** Reuse the title/ID indexes when preparing several items from a large vault. */
export const createStudySourceResolver = (notes: StudyNote[]) => {
	const ids = new Map(notes.map(note => [normalizeNoteTitle(note.id), note])), titles = createNoteTitleIndex(notes);
	return (current: StudyNote): StudyNote[] => {
		const result = new Map([[current.id, current]]);
		mapTextOutsideCode(documentText(current.document), prose => {
			for (const link of parseNoteTextLinks(prose)) {
				if (link.kind !== "note") continue;
				const note = resolveNoteReference(link.target, ids, titles);
				if (note) result.set(note.id, note);
			}
			return prose;
		});
		return [...result.values()];
	};
};

export type StudyAssignment = { itemId: string; noteId: string; sourceIds: ReadonlySet<string>; supportingNoteIds?: readonly string[] };
export const createStudyPlan = (notes: StudyNote[], current: StudyNote | undefined, count: number, excluded: ReadonlySet<string> = new Set()): StudyAssignment[] => {
	const candidates = current ? [current] : notes.filter(note => hasText(note) && !excluded.has(note.id));
	if (!candidates.length) return [];
	const resolve = createStudySourceResolver(notes), scopes = new Map<string, ReadonlySet<string>>();
	if (current) {
		const sources = resolve(current);
		if (!sources.some(hasText) && !notes.some(hasText)) return [];
		scopes.set(current.id, new Set(sources.map(source => source.id)));
	}
	let pool: StudyNote[] = [];
	return Array.from({ length: count }, () => {
		// Draw separately for each item, exhausting the pool before repeating a subject.
		if (!pool.length) pool = [...candidates];
		const index = Math.floor(Math.random() * pool.length), note = pool[index];
		pool[index] = pool[pool.length - 1]; pool.pop();
		let sourceIds = scopes.get(note.id);
		if (!sourceIds) { sourceIds = new Set(resolve(note).map(source => source.id)); scopes.set(note.id, sourceIds); }
		return { itemId: crypto.randomUUID(), noteId: note.id, sourceIds };
	});
};
/** Keep unaffected assignments; replace only rejected primary notes, retaining full reference resolution. */
export const replaceStudyAssignments = (notes: StudyNote[], plan: StudyAssignment[], rejected: ReadonlySet<string>, pendingIds: ReadonlySet<string>): StudyAssignment[] | undefined => {
	const positions = plan.flatMap((assignment, index) => rejected.has(assignment.noteId) && pendingIds.has(assignment.itemId) ? [index] : []);
	if (!positions.length) return;
	const excluded = new Set([...rejected, ...plan.filter((_, index) => !positions.includes(index)).map(item => item.noteId)]);
	let replacements = createStudyPlan(notes, undefined, positions.length, excluded);
	if (!replacements.length) replacements = createStudyPlan(notes, undefined, positions.length, rejected);
	if (!replacements.length) return;
	const next = [...plan];
	positions.forEach((position, index) => { next[position] = { ...replacements[index], itemId: plan[position].itemId }; });
	return next;
};
/** Add at most two new supporting notes per retry while retaining the original focus. */
export const expandFocusedStudyPlan = async (notes: StudyNote[], plan: StudyAssignment[], signal: AbortSignal): Promise<StudyAssignment[] | undefined> => {
	if (!plan.length) return;
	const supportingNoteIds = new Set(plan[0].supportingNoteIds ?? []);
	const previousCount = supportingNoteIds.size, additionsAllowed = Math.min(2, 4 - previousCount);
	if (additionsAllowed <= 0) return;
	const primary = notes.find(note => note.id === plan[0].noteId);
	if (!primary || plan.some(item => item.noteId !== primary.id)) return;
	const used = new Set(plan.flatMap(item => [...item.sourceIds]));
	const resolve = createStudySourceResolver(notes);
	const candidates = await rankFocusedStudySupport(notes, primary, used,
		note => note.document.elements.some(element => element.type === "text" && element.text.includes("[["))
			&& resolve(note).some(source => source.id === primary.id), signal);
	if (signal.aborted) throw Error("AI_CANCELLED");
	const sourceIds = new Set(used);
	for (const candidate of candidates) {
		if (sourceIds.has(candidate.id)) continue;
		supportingNoteIds.add(candidate.id);
		for (const source of resolve(candidate)) sourceIds.add(source.id);
		if (supportingNoteIds.size - previousCount >= additionsAllowed) break;
	}
	if (supportingNoteIds.size === previousCount) return;
	return plan.map(item => ({ ...item, sourceIds, supportingNoteIds: [...supportingNoteIds] }));
};
