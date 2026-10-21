import { documentText, parseNoteTextLinks, createNoteTitleIndex, normalizeNoteTitle, resolveNoteReference, type StudyNote } from "@/entities/note";
import { mapTextOutsideCode } from "@/shared/lib/formatted-text";

export const hasStudyText = (note: StudyNote) => note.document.elements.some(element => element.type === "text" && element.text.trim());

/** Reuse the title/ID indexes when preparing several items from a large vault. */
export const createStudySourceResolver = (notes: StudyNote[]) => {
	const ids = new Map(notes.map(note => [normalizeNoteTitle(note.id), note])), titles = createNoteTitleIndex(notes);
	return (current: StudyNote): StudyNote[] => {
		const result = new Map([[current.id, current]]);
		mapTextOutsideCode(documentText(current.document), prose => {
			for (const link of parseNoteTextLinks(prose)) {
				if (link.kind !== "note") continue;
				const note = resolveNoteReference(link.target, ids, titles);
				if (note && hasStudyText(note)) result.set(note.id, note);
			}
			return prose;
		});
		return [...result.values()];
	};
};

export type StudyAssignment = { itemId: string; noteId: string; sourceIds: ReadonlySet<string>; supportingNoteIds?: readonly string[] };
export const createStudyPlan = (notes: StudyNote[], count: number, excluded: ReadonlySet<string> = new Set()): StudyAssignment[] => {
	const candidates = notes.filter(note => hasStudyText(note) && !excluded.has(note.id));
	if (!candidates.length) return [];
	const resolve = createStudySourceResolver(notes), scopes = new Map<string, ReadonlySet<string>>();
	let pool: StudyNote[] = [];
	return Array.from({ length: count }, () => {
		if (!pool.length) pool = [...candidates];
		const index = Math.floor(Math.random() * pool.length), note = pool[index];
		pool[index] = pool[pool.length - 1]; pool.pop();
		let sourceIds = scopes.get(note.id);
		if (!sourceIds) { sourceIds = new Set(resolve(note).map(source => source.id)); scopes.set(note.id, sourceIds); }
		return { itemId: crypto.randomUUID(), noteId: note.id, sourceIds };
	});
};

export const replaceStudyAssignments = (notes: StudyNote[], plan: StudyAssignment[], rejected: ReadonlySet<string>, pendingIds: ReadonlySet<string>): StudyAssignment[] | undefined => {
	const positions = plan.flatMap((assignment, index) => rejected.has(assignment.noteId) && pendingIds.has(assignment.itemId) ? [index] : []);
	if (!positions.length) return;
	const excluded = new Set([...rejected, ...plan.filter((_, index) => !positions.includes(index)).map(item => item.noteId)]);
	let replacements = createStudyPlan(notes, positions.length, excluded);
	if (!replacements.length) replacements = createStudyPlan(notes, positions.length, rejected);
	if (!replacements.length) return;
	const next = [...plan];
	positions.forEach((position, index) => { next[position] = { ...replacements[index], itemId: plan[position].itemId }; });
	return next;
};
