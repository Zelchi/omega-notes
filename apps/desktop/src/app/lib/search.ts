import type { StudyNote } from "@/entities/note";

type IndexedNote = {
	note: StudyNote;
	title: string;
	titleWords: string[];
};

export type SearchIndex = {
	locale: string;
	notes: IndexedNote[];
};

type Match = {
	score: number;
	distance: number;
};

const normalize = (value: string, locale: string): string => {
	return value
		.toLocaleLowerCase(locale)
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
};

const words = (value: string): string[] => {
	return [...new Set(value.split(/\s+/).filter(Boolean))];
};

const maximumEditDistance = (value: string): number => {
	if (value.length < 4) return 0;
	if (value.length < 8) return 1;
	return 2;
};

const damerauLevenshtein = (left: string, right: string): number => {
	const distances = Array.from({ length: left.length + 1 }, () => Array.from({ length: right.length + 1 }, () => 0));

	for (let row = 0; row <= left.length; row += 1) distances[row]![0] = row;
	for (let column = 0; column <= right.length; column += 1) distances[0]![column] = column;

	for (let row = 1; row <= left.length; row += 1) {
		for (let column = 1; column <= right.length; column += 1) {
			const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
			distances[row]![column] = Math.min(
				distances[row - 1]![column]! + 1,
				distances[row]![column - 1]! + 1,
				distances[row - 1]![column - 1]! + substitutionCost,
			);

			if (row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) {
				distances[row]![column] = Math.min(distances[row]![column]!, distances[row - 2]![column - 2]! + 1);
			}
		}
	}

	return distances[left.length]![right.length]!;
};

const matchWord = (query: string, word: string): Match | undefined => {
	if (word === query) return { score: 100, distance: 0 };
	if (word.startsWith(query)) return { score: 78, distance: 0 };
	if (word.includes(query)) return { score: 62, distance: 0 };

	const limit = maximumEditDistance(query);
	if (limit === 0 || Math.abs(query.length - word.length) > limit) return undefined;

	const distance = damerauLevenshtein(query, word);
	if (distance > limit) return undefined;
	return { score: 48 - distance * 10, distance };
};

const bestTitleWordMatch = (query: string, note: IndexedNote): Match | undefined => {
	let best: Match | undefined;

	for (const word of note.titleWords) {
		const match = matchWord(query, word);
		if (match && (!best || match.score * 2.4 > best.score)) {
			best = { score: match.score * 2.4, distance: match.distance };
		}
	}

	return best;
};

export const createSearchIndex = (notes: StudyNote[], locale: string, previous?: SearchIndex): SearchIndex => {
	const previousNotes =
		previous?.locale === locale ? new Map(previous.notes.map((entry) => [entry.note.id, entry])) : undefined;
	return {
		locale,
		notes: notes.map((note) => {
			const cached = previousNotes?.get(note.id);
			if (cached && cached.note.title === note.title) {
				return cached.note === note ? cached : { ...cached, note };
			}
			const title = normalize(note.title, locale);
			return {
				note,
				title,
				titleWords: words(title),
			};
		}),
	};
};

export const searchNotes = (index: SearchIndex, value: string): StudyNote[] => {
	const query = normalize(value, index.locale);
	if (!query) return [];

	const queryWords = words(query);
	return index.notes
		.map((entry) => {
			let score = 0;
			let distance = 0;

			for (const queryWord of queryWords) {
				const match = bestTitleWordMatch(queryWord, entry);
				if (!match) return undefined;
				score += match.score;
				distance += match.distance;
			}

			if (entry.title === query) score += 180;
			else if (entry.title.includes(query)) score += 45;

			return { note: entry.note, score, distance };
		})
		.filter((result): result is { note: StudyNote; score: number; distance: number } => result !== undefined)
		.sort((left, right) => {
			return (
				right.score - left.score || left.distance - right.distance || right.note.updatedAt - left.note.updatedAt
			);
		})
		.map((result) => result.note);
};
