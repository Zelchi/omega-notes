import type { StudyKind } from "@/entities/study";

type StudyPreferences = { count: number; seconds: number; lives: number };
const key = (kind: StudyKind) => `omega-notes.settings.studies.${kind}`;
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
