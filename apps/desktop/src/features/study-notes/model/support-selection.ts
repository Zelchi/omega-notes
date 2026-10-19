import { normalizeNoteTitle, type StudyNote } from "@/entities/note";

const STOPWORDS = new Set(`a ao aos as ate com como da das de dela dele do dos e ela ele em entre era essa esse esta este eu foi ha isso isto ja mais mas meu minha muito na nas nao no nos o os ou para pela pelo por que qual quando se sem ser seu sua sobre tem ter um uma umas uns voce nos eles elas sao tambem nota notas teste exemplo parte titulo texto the a an and are as at be been being but by can could did do does for from had has have how i if in into is it its may more my no not of on or our out she should so some than that their them then there these they this those to too under up us was we were what when where which who why will with would you your note notes test example part title text`.split(/\s+/));
const SHORT_TERMS = new Set(["ia", "ai", "go", "ui", "ux", "vr", "ar", "js", "ts", "c#", "c++"]);
const TEXT_LIMIT = 16_000;
const BODY_TERMS = 32;

/** Only ranking uses an excerpt. The AI's source snapshot still contains the complete notes. */
const excerpt = (note: StudyNote): string => {
	let remaining = TEXT_LIMIT, result = "";
	for (const element of note.document.elements) {
		if (element.type !== "text") continue;
		const text = element.text.slice(0, remaining);
		result += `${text}\n`; remaining -= text.length;
		if (!remaining) break;
	}
	return result;
};
const terms = (value: string): string[] => {
	const text = normalizeNoteTitle(value)
		.replace(/https?:\/\/\S+|www\.\S+/g, " ")
		.replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/g, " ");
	return [...text.matchAll(/[\p{L}\p{N}]+(?:[+#]+)?/gu)].map(match => match[0])
		.filter(term => !STOPWORDS.has(term) && !/^\d+$/.test(term) && (term.length >= 3 || SHORT_TERMS.has(term)));
};
const frequencies = (values: string[]) => {
	const result = new Map<string, number>();
	for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
	return result;
};
type Candidate = { note: StudyNote; incoming: boolean; titleMatches: string[]; bodyMatches: string[] };

/** Lexical evidence is deliberately conservative; the model still checks whether a source supports facts. */
export const rankFocusedStudySupport = async (notes: StudyNote[], primary: StudyNote, excluded: ReadonlySet<string>,
	referencesPrimary: (note: StudyNote) => boolean, signal: AbortSignal): Promise<StudyNote[]> => {
	const ensureActive = () => { if (signal.aborted) throw Error("AI_CANCELLED"); };
	ensureActive();
	const titleTerms = new Set(terms(primary.title).slice(0, 16));
	const bodyFrequency = frequencies(terms(excerpt(primary)));
	const bodyTerms = [...bodyFrequency].sort(([a, countA], [b, countB]) => countB - countA || (a < b ? -1 : a > b ? 1 : 0)).slice(0, BODY_TERMS).map(([term]) => term);
	const query = new Set([...titleTerms, ...bodyTerms]);
	const candidates: Candidate[] = [], documentFrequency = new Map<string, number>();
	let sliceStarted = performance.now();
	for (const note of notes) {
		if (performance.now() - sliceStarted >= 8) {
			await new Promise<void>(resolve => setTimeout(resolve, 0)); ensureActive(); sliceStarted = performance.now();
		}
		if (note.id === primary.id || excluded.has(note.id) || !note.document.elements.some(element => element.type === "text" && element.text.trim())) continue;
		const title = new Set(terms(note.title)), body = new Set(terms(excerpt(note)));
		const titleMatches = [...query].filter(term => title.has(term)), bodyMatches = [...query].filter(term => body.has(term));
		for (const term of new Set([...titleMatches, ...bodyMatches])) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
		candidates.push({ note, incoming: referencesPrimary(note), titleMatches, bodyMatches });
	}
	ensureActive();
	const weight = (term: string) => 1 + Math.log((candidates.length + 1) / ((documentFrequency.get(term) ?? 0) + 1));
	const ranked: { note: StudyNote; incoming: boolean; relatedTitle: boolean; score: number }[] = [];
	for (const candidate of candidates) {
		if (performance.now() - sliceStarted >= 8) {
			await new Promise<void>(resolve => setTimeout(resolve, 0)); ensureActive(); sliceStarted = performance.now();
		}
		const sharedTitle = candidate.titleMatches.filter(term => titleTerms.has(term));
		const relatedTitle = sharedTitle.length > 0 && (titleTerms.size === 1 || sharedTitle.length / titleTerms.size >= 0.5 || sharedTitle.length >= 2);
		const bodyScore = candidate.bodyMatches.reduce((score, term) => score + weight(term), 0);
		const namesSubject = titleTerms.size === 1 && candidate.bodyMatches.some(term => titleTerms.has(term));
		const relatedBody = namesSubject || candidate.bodyMatches.length >= 2 && (bodyScore >= 4 || candidate.bodyMatches.length / query.size >= 0.6);
		if (!candidate.incoming && !relatedTitle && !relatedBody) continue;
		ranked.push({ note: candidate.note, incoming: candidate.incoming, relatedTitle,
			score: 3 * candidate.titleMatches.reduce((score, term) => score + weight(term), 0) + bodyScore });
	}
	ensureActive();
	return ranked.sort((a, b) => Number(b.incoming) - Number(a.incoming) || Number(b.relatedTitle) - Number(a.relatedTitle)
		|| b.score - a.score || (a.note.id < b.note.id ? -1 : a.note.id > b.note.id ? 1 : 0)).map(value => value.note);
};
