import { parseStudyJson, StudyInsufficientContentError, StudyItemCountError, type StudyItem, type StudyKind } from "@/entities/study";
import { createSourceReferences, decodeGeneratedItem } from "./ai-response";
import { replaceStudyAssignments, type StudyAssignment } from "./context";
import { studyPrompt } from "./study-prompt";
import type { StudyEnvironment } from "./environment";

const BATCH_SIZE = 1;
const MAX_ROUNDS = 3;
type Issue = "missing-item" | "invalid-item" | "duplicate-item" | "insufficient-content" | "empty-source" | "missing-source";
type Accepted = { item: StudyItem; title: string };
export type GeneratedStudyItem = { assignment: StudyAssignment; item: StudyItem; title: string };
const questionKey = (question: string) => question.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();

/** IDs, rather than response positions, bind partial or reordered output to its source scope. */
const parseBatch = (output: string, kind: StudyKind, batch: StudyAssignment[]) => {
	const data = parseStudyJson(output);
	const issues = new Map<string, Issue>(batch.map(item => [item.itemId, "missing-item"]));
	const values = new Map<string, StudyItem>();
	const references = createSourceReferences(batch.flatMap(item => [...item.sourceIds]));
	const title = typeof data.title === "string" && data.title.trim() && data.title.length <= 200 ? data.title.trim() : undefined;
	if (!Array.isArray(data.items) || data.items.length !== batch.length) throw Error("STUDY_INVALID_RESPONSE");
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
		if (!title) { issues.set(assignment.itemId, "invalid-item"); continue; }
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
	plan: StudyAssignment[]; kind: StudyKind; signal: AbortSignal; active: () => boolean;
	onRequestStart?: (assignment: StudyAssignment) => void;
	onItem?: (material: GeneratedStudyItem) => Promise<void>;
}): Promise<GeneratedStudyItem[]> => {
	let plan = settings.plan;
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
			let parsed: ReturnType<typeof parseBatch>;
			settings.onRequestStart?.(batch[0]);
			let output: string;
			try {
				output = await options.requestText(studyPrompt(settings.kind, options.t("locale"), batch, {
					issues: batch.flatMap(item => issues.has(item.itemId) ? [{ itemId: item.itemId, reason: issues.get(item.itemId)! }] : []),
				}), settings.signal, { items: batch.map(item => ({
					itemId: item.itemId, candidateId: item.candidateId, noteId: item.noteId,
					sourceIds: [...item.sourceIds], supportingNoteIds: [...(item.supportingNoteIds ?? [])],
				})) }, "study-generation");
			} catch (failure) {
				ensureActive();
				const code = failure instanceof Error ? failure.message : String(failure);
				if (code !== "STUDY_INSUFFICIENT_CONTENT" && code !== "AI_STUDY_SOURCE_EMPTY" && code !== "STUDY_SOURCE_MISSING" && code !== "AI_NOTE_NOT_FOUND") throw failure;
				for (const assignment of batch) {
					issues.set(assignment.itemId, code === "AI_STUDY_SOURCE_EMPTY" ? "empty-source" : code === "STUDY_SOURCE_MISSING" || code === "AI_NOTE_NOT_FOUND" ? "missing-source" : "insufficient-content");
					rejectedNotes.add(assignment.candidateId);
				}
				continue;
			}
			ensureActive();
			try { parsed = parseBatch(output, settings.kind, batch); }
			catch (failure) {
				if (!(failure instanceof SyntaxError) && !(failure instanceof Error && failure.message === "STUDY_INVALID_RESPONSE")) throw failure;
				for (const item of batch) issues.set(item.itemId, "invalid-item");
				continue;
			}
			for (const assignment of batch) {
				const item = parsed.values.get(assignment.itemId);
				if (!item) {
					const issue = parsed.issues.get(assignment.itemId) ?? "missing-item";
					issues.set(assignment.itemId, issue);
					if (issue === "insufficient-content") rejectedNotes.add(assignment.candidateId);
					continue;
				}
				const key = questionKey(item.question);
				if (questions.has(key)) { issues.set(assignment.itemId, "duplicate-item"); continue; }
				questions.add(key);
				const material = { item, title: parsed.title! };
				accepted.set(assignment.itemId, material); issues.delete(assignment.itemId);
				await settings.onItem?.({ assignment, item, title: material.title });
				ensureActive();
			}
		}
		const remaining = plan.filter(item => !accepted.has(item.itemId));
		if (!remaining.length || round === MAX_ROUNDS - 1) break;
		const unavailableIds = new Set(remaining.filter(item => ["insufficient-content", "empty-source", "missing-source"].includes(issues.get(item.itemId) ?? "")).map(item => item.itemId));
		if (unavailableIds.size) {
			const replacement = replaceStudyAssignments(options.noteSummaries(), plan, rejectedNotes, unavailableIds);
			ensureActive();
			if (replacement) {
				const previous = new Map(plan.map(item => [item.itemId, item.candidateId]));
				plan = replacement;
				for (const item of plan) if (previous.get(item.itemId) !== item.candidateId) issues.delete(item.itemId);
			}
			else if (remaining.some(item => ["empty-source", "insufficient-content", "missing-source"].includes(issues.get(item.itemId) ?? ""))) {
				throw new StudyInsufficientContentError([...rejectedNotes]);
			}
		}
	}
	ensureActive();
	if (accepted.size !== plan.length) {
		const pendingIssues = plan.filter(item => !accepted.has(item.itemId)).map(item => issues.get(item.itemId));
		if (pendingIssues.some(issue => issue === "insufficient-content" || issue === "empty-source" || issue === "missing-source")) throw new StudyInsufficientContentError([...rejectedNotes]);
		if (pendingIssues.some(issue => issue === "invalid-item" || issue === "duplicate-item")) throw Error("STUDY_INVALID_RESPONSE");
		throw new StudyItemCountError(plan.length, accepted.size);
	}
	return plan.map(assignment => {
		const material = accepted.get(assignment.itemId)!;
		return { assignment, item: material.item, title: material.title };
	});
};
