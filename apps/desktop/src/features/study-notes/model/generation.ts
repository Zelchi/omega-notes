import { parseStudyJson, StudyInsufficientContentError, StudyItemCountError, type StudyDeck, type StudyItem, type StudyKind } from "@/entities/study";
import { createSourceReferences, decodeGeneratedItem } from "./ai-response";
import { expandFocusedStudyPlan, replaceStudyAssignments, type StudyAssignment } from "./context";
import { studyPrompt } from "./study-prompt";
import type { StudyEnvironment } from "./environment";

const BATCH_SIZE = 5;
const MAX_ROUNDS = 3;
type Issue = "missing-item" | "invalid-item" | "duplicate-item" | "insufficient-content";
type Accepted = { item: StudyItem; primaryNoteId: string };
const questionKey = (question: string) => question.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();

/** IDs, rather than response positions, bind partial or reordered output to its source scope. */
const parseBatch = (output: string, kind: StudyKind, batch: StudyAssignment[]) => {
	const data = parseStudyJson(output);
	const issues = new Map<string, Issue>(batch.map(item => [item.itemId, "missing-item"]));
	const values = new Map<string, StudyItem>();
	const references = createSourceReferences(batch.flatMap(item => [...item.sourceIds]));
	const title = typeof data.title === "string" && data.title.trim() && data.title.length <= 200 ? data.title.trim() : undefined;
	if (!Array.isArray(data.items) || data.items.length > 30) throw Error("STUDY_INVALID_RESPONSE");
	const byId = new Map<string, Record<string, unknown>[]>();
	for (const raw of data.items) {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
		const row = raw as Record<string, unknown>;
		if (typeof row.itemId !== "string" || !issues.has(row.itemId)) continue;
		byId.set(row.itemId, [...(byId.get(row.itemId) ?? []), row]);
	}
	for (const assignment of batch) {
		const rows = byId.get(assignment.itemId);
		if (!rows) continue;
		if (rows.length !== 1) { issues.set(assignment.itemId, "duplicate-item"); continue; }
		const row = rows[0];
		if (row.error === "STUDY_INSUFFICIENT_CONTENT") { issues.set(assignment.itemId, "insufficient-content"); continue; }
		try {
			const item = decodeGeneratedItem(row, kind, references, assignment.sourceIds);
			if (!item.sources.includes(assignment.noteId)) throw Error("STUDY_INVALID_RESPONSE");
			item.sources = [assignment.noteId, ...item.sources.filter(id => id !== assignment.noteId)];
			values.set(assignment.itemId, item); issues.delete(assignment.itemId);
		} catch { issues.set(assignment.itemId, "invalid-item"); }
	}
	return { values, issues, title };
};

/** Three rounds total; accepted items leave the plan, so each slot is requested at most three times. */
export const generateStudyMaterial = async (options: StudyEnvironment, settings: {
	plan: StudyAssignment[]; kind: StudyKind; focused: boolean; signal: AbortSignal; active: () => boolean;
}): Promise<Pick<StudyDeck, "title" | "items">> => {
	let plan = settings.plan, title: string | undefined;
	const accepted = new Map<string, Accepted>(), questions = new Set<string>(), rejectedNotes = new Set<string>();
	const issues = new Map<string, Issue>();
	const ensureActive = () => { if (settings.signal.aborted || !settings.active()) throw Error("AI_CANCELLED"); };
	for (let round = 0; round < MAX_ROUNDS; round++) {
		ensureActive();
		const pending = plan.filter(item => !accepted.has(item.itemId));
		if (!pending.length) break;
		for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
			ensureActive();
			const batch = pending.slice(offset, offset + BATCH_SIZE);
			const primaryIds = new Set(batch.map(item => item.noteId));
			const avoid = [...accepted.values()].filter(value => primaryIds.has(value.primaryNoteId)).map(value => value.item.question.slice(0, 200));
			let parsed: ReturnType<typeof parseBatch>;
			const output = await options.requestText(studyPrompt(settings.kind, options.t("locale"), batch, {
				avoid, issues: batch.flatMap(item => issues.has(item.itemId) ? [{ itemId: item.itemId, reason: issues.get(item.itemId)! }] : []),
			}), settings.signal, { items: batch.map(item => ({
				itemId: item.itemId, noteId: item.noteId, sourceIds: [...item.sourceIds], supportingNoteIds: [...(item.supportingNoteIds ?? [])],
			})) }, "study-generation");
			ensureActive();
			try { parsed = parseBatch(output, settings.kind, batch); }
			catch (failure) {
				if (!(failure instanceof SyntaxError) && !(failure instanceof Error && failure.message === "STUDY_INVALID_RESPONSE")) throw failure;
				for (const item of batch) issues.set(item.itemId, "invalid-item");
				continue;
			}
			if (parsed.title && !title) title = parsed.title;
			for (const assignment of batch) {
				const item = parsed.values.get(assignment.itemId);
				if (!item) {
					const issue = parsed.issues.get(assignment.itemId) ?? "missing-item";
					issues.set(assignment.itemId, issue);
					if (issue === "insufficient-content") rejectedNotes.add(assignment.noteId);
					continue;
				}
				const key = questionKey(item.question);
				if (questions.has(key)) { issues.set(assignment.itemId, "duplicate-item"); continue; }
				questions.add(key); accepted.set(assignment.itemId, { item, primaryNoteId: assignment.noteId }); issues.delete(assignment.itemId);
			}
		}
		const remaining = plan.filter(item => !accepted.has(item.itemId));
		if (!remaining.length || round === MAX_ROUNDS - 1) break;
		const insufficientIds = new Set(remaining.filter(item => issues.get(item.itemId) === "insufficient-content").map(item => item.itemId));
		if (insufficientIds.size) {
			const replacement = settings.focused ? await expandFocusedStudyPlan(options.notes(), plan, settings.signal)
				: replaceStudyAssignments(options.notes(), plan, rejectedNotes, insufficientIds);
			ensureActive();
			if (replacement) plan = replacement;
			else if (insufficientIds.size === remaining.length) throw new StudyInsufficientContentError([...rejectedNotes]);
		}
	}
	ensureActive();
	if (accepted.size !== plan.length) {
		const pendingIssues = plan.filter(item => !accepted.has(item.itemId)).map(item => issues.get(item.itemId));
		if (pendingIssues.includes("insufficient-content")) throw new StudyInsufficientContentError([...rejectedNotes]);
		if (pendingIssues.some(issue => issue === "invalid-item" || issue === "duplicate-item")) throw Error("STUDY_INVALID_RESPONSE");
		throw new StudyItemCountError(plan.length, accepted.size);
	}
	return { title: title ?? "Study", items: settings.plan.map(assignment => accepted.get(assignment.itemId)!.item) };
};
