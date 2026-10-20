import type { StudyKind } from "@/entities/study";

type StudyPreferences = { count: number; seconds: number; lives: number };
const key = (kind: StudyKind) => `omega-notes.settings.studies.${kind}`;
const generationTimesKey = "omega-notes.study-generation-times.v1";
const studyKinds: StudyKind[] = ["flashcards", "quiz", "written", "cloze", "correction"];
const generationHistoryLimit = 10;
const decode = (value: unknown): StudyPreferences => {
	const data = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<StudyPreferences> : {};
	return {
		count: [5, 10, 20, 30].includes(data.count!) ? data.count! : 10,
		seconds: [30, 60, 300].includes(data.seconds!) ? data.seconds! : 30,
		lives: [1, 3, 5].includes(data.lives!) ? data.lives! : 3,
	};
};

/** Interface choices belong to this installation, independently of vault materials. */
export const readStudyPreferences = (kind: StudyKind): StudyPreferences => {
	try { return decode(JSON.parse(localStorage.getItem(key(kind)) ?? "null")); }
	catch { return decode(undefined); }
};
export const saveStudyPreferences = (kind: StudyKind, value: StudyPreferences): void => {
	try { localStorage.setItem(key(kind), JSON.stringify(decode(value))); }
	catch { console.warn("Could not save study preferences."); }
};

type GenerationTimes = Partial<Record<StudyKind, number[]>>;
const readGenerationTimes = (): GenerationTimes => {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(generationTimesKey) ?? "null");
		if (!value || typeof value !== "object" || Array.isArray(value)) return {};
		const data = value as Record<string, unknown>;
		return Object.fromEntries(studyKinds.map(kind => {
			const times = data[kind];
			return [kind, Array.isArray(times)
				? times.filter((time): time is number => typeof time === "number" && Number.isFinite(time) && time > 0).slice(-generationHistoryLimit)
				: []];
		}));
	} catch { return {}; }
};

/** Keeps a rolling local history so each study method can estimate its own generation time. */
export const readStudyGenerationTimes = (kind: StudyKind): number[] => readGenerationTimes()[kind] ?? [];
export const saveStudyGenerationTime = (kind: StudyKind, duration: number): void => {
	if (!Number.isFinite(duration) || duration <= 0) return;
	const times = readGenerationTimes();
	times[kind] = [...(times[kind] ?? []), Math.round(duration)].slice(-generationHistoryLimit);
	try { localStorage.setItem(generationTimesKey, JSON.stringify(times)); }
	catch { console.warn("Could not save study generation timing."); }
};
