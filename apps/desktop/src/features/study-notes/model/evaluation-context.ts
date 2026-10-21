import { documentText, type StudyNote } from "@/entities/note";
import type { StudyItem } from "@/entities/study";
import { createStudySourceResolver, hasStudyText } from "./context";
import { createSourceReferences } from "./ai-response";

export const createEvaluationContextCache = () => {
	let previous: StudyNote[] | undefined;
	let index = new Map<string, StudyNote>();
	let resolve: ReturnType<typeof createStudySourceResolver> | undefined;
	const scopes = new Map<string, ReturnType<typeof prepare>>();
	const revisions = new Map<string, { id: string; title: string; text: string }>();
	const prepare = (item: StudyItem) => {
		const primary = index.get(item.sources[0]);
		if (!primary) throw Error("STUDY_SOURCE_MISSING");
		if (!hasStudyText(primary)) throw Error("AI_STUDY_SOURCE_EMPTY");
		const sources = new Map(resolve!(primary).map(note => [note.id, note]));
		for (const id of item.sources) {
			const note = index.get(id);
			if (!note) throw Error("STUDY_SOURCE_MISSING");
			if (hasStudyText(note)) sources.set(id, note);
		}
		const sourceIds = [...sources.keys()];
		const authorizedSourceIds = new Set(sourceIds);
		return {
			noteId: primary.id, sourceIds,
			supportingNoteIds: item.sources.filter(id => id !== primary.id && authorizedSourceIds.has(id)),
			references: createSourceReferences(sourceIds),
			revisions: [...sources.values()].map(note => {
				let snapshot = revisions.get(note.id);
				if (!snapshot) {
					snapshot = { id: note.id, title: note.title, text: documentText(note.document) };
					revisions.set(note.id, snapshot);
				}
				return snapshot;
			}),
		};
	};
	const clear = () => { previous = undefined; index.clear(); resolve = undefined; scopes.clear(); revisions.clear(); };
	const get = (notes: StudyNote[], item: StudyItem) => {
		if (notes !== previous) {
			clear(); previous = notes;
			index = new Map(notes.map(note => [note.id, note]));
			resolve = createStudySourceResolver(notes);
		}
		const key = JSON.stringify(item.sources);
		let context = scopes.get(key);
		if (!context) { context = prepare(item); scopes.set(key, context); }
		return context;
	};
	return {
		clear, get, unchanged: (before: ReturnType<typeof prepare>, notes: StudyNote[], item: StudyItem) => {
			const current = get(notes, item);
			return before === current || (before.revisions.length === current.revisions.length && before.revisions.every((source, i) => {
				const next = current.revisions[i];
				return source.id === next.id && source.title === next.title && source.text === next.text;
			}));
		}
	};
};
