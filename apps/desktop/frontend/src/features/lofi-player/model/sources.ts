export type MusicSource = {
	id: string;
	name: string;
	url: string;
	provider: "somafm";
	somaFmChannelId?: string;
};

export type SomaFmChannel = { id: string; title: string; lastPlaying?: string };

const fixedSomaFmSources: MusicSource[] = [
	{
		id: "somafm-lush",
		name: "Lush",
		url: "https://ice5.somafm.com/lush-128-mp3",
		provider: "somafm",
		somaFmChannelId: "lush",
	},
	{
		id: "somafm-groove-salad",
		name: "Salad",
		url: "https://ice5.somafm.com/groovesalad-128-mp3",
		provider: "somafm",
		somaFmChannelId: "groovesalad",
	},
	{
		id: "somafm-beat-blender",
		name: "Blender",
		url: "https://ice5.somafm.com/beatblender-128-mp3",
		provider: "somafm",
		somaFmChannelId: "beatblender",
	},
];

export const somaFmSource: MusicSource = {
	id: "somafm-fluid",
	name: "Fluid",
	url: "https://ice5.somafm.com/fluid-128-mp3",
	provider: "somafm",
	somaFmChannelId: "fluid",
};

export const nextUnattemptedSourceIndex = (start: number, count: number, attempted: ReadonlySet<number>): number | undefined => {
	if (!Number.isInteger(count) || count <= 0 || attempted.size >= count) return undefined;
	const first = ((start % count) + count) % count;
	for (let offset = 0; offset < count; offset += 1) {
		const index = (first + offset) % count;
		if (!attempted.has(index)) return index;
	}
	return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const parseSomaFmChannels = (value: unknown): SomaFmChannel[] => {
	if (!isRecord(value) || !Array.isArray(value.channels)) return [];
	return value.channels.flatMap((entry): SomaFmChannel[] => {
		if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id.trim()
			|| typeof entry.title !== "string" || !entry.title.trim()) return [];
		return [{
			id: entry.id,
			title: entry.title.trim(),
			...(typeof entry.lastPlaying === "string" && entry.lastPlaying.trim() ? { lastPlaying: entry.lastPlaying.trim() } : {}),
		}];
	});
};

export const buildMusicSources = (): MusicSource[] => [...fixedSomaFmSources, somaFmSource];
