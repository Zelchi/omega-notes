export type MusicSource = {
	id: string;
	name: string;
	url: string;
	provider: "radio-browser" | "somafm" | "direct";
	somaFmChannelId?: string;
};

export type SomaFmChannel = { id: string; title: string; lastPlaying?: string };

const fallbackRadioSources: MusicSource[] = [
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

const MAX_DISCOVERED_RADIO_SOURCES = 4;

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

const isExcludedRadioSource = (url: string): boolean => {
	const parsed = new URL(url);
	const host = parsed.hostname.toLowerCase();
	const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
	const matchesDomain = (domain: string) => host === domain || host.endsWith(`.${domain}`);
	return (
		(matchesDomain("zeno.fm") && path === "/tabzverz0fctv")
		|| (host === "0nlineradio.radioho.st" && path === "/0r-lo-fi")
		|| matchesDomain("isekoi-radio.com")
		|| matchesDomain("yojosuknam.com")
		|| matchesDomain("chilltrax.com")
	);
};

const isLofiTag = (value: unknown): boolean =>
	typeof value === "string" && value.split(",").some((tag) => {
		const normalized = tag.trim().toLowerCase();
		return normalized === "lofi" || normalized === "lo-fi" || normalized.startsWith("lofi ") || normalized.startsWith("lo-fi ");
	});

const secureUrl = (value: unknown): string | undefined => {
	if (typeof value !== "string") return undefined;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
	} catch {
		return undefined;
	}
};

export const parseRadioBrowserSources = (value: unknown): MusicSource[] => {
	if (!Array.isArray(value)) return [];
	const sources: MusicSource[] = [];
	const urls = new Set<string>();
	for (const entry of value) {
		if (!isRecord(entry) || !(entry.lastcheckok === 1 || entry.lastcheckok === true)
			|| typeof entry.name !== "string" || !entry.name.trim() || !isLofiTag(entry.tags)
			|| typeof entry.codec !== "string" || entry.codec.toUpperCase() !== "MP3") continue;
		const url = secureUrl(entry.url_resolved) ?? secureUrl(entry.url);
		if (!url || isExcludedRadioSource(url) || urls.has(url)) continue;
		urls.add(url);
		sources.push({ id: `radio-browser-${sources.length}`, name: entry.name.trim(), url, provider: "radio-browser" });
		if (sources.length === MAX_DISCOVERED_RADIO_SOURCES) break;
	}
	return sources;
};

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

export const buildMusicSources = (radioBrowserResponse: unknown): MusicSource[] => {
	const discovered = parseRadioBrowserSources(radioBrowserResponse);
	const radioSources = [...discovered, ...fallbackRadioSources]
		.filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index);
	return [...radioSources, somaFmSource];
};
