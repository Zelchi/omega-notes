export type MusicSource = {
	id: string;
	name: string;
	url: string;
	provider: "radio-browser" | "somafm";
};

export type SomaFmChannel = { title: string; lastPlaying?: string };

const fallbackRadioSources: MusicSource[] = [
	{
		id: "box-lofi",
		name: "BOX: Lofi Radio",
		url: "https://stream.zeno.fm/tabzverz0fctv",
		provider: "radio-browser",
	},
	{
		id: "isekoi-chill-zone",
		name: "ISEKOI Radio | Chill Zone",
		url: "https://public.isekoi-radio.com/listen/chill/radio.mp3",
		provider: "radio-browser",
	},
	{
		id: "0r-lofi",
		name: "0R - LO-FI",
		url: "https://0nlineradio.radioho.st/0r-lo-fi?ref=radio-browser26",
		provider: "radio-browser",
	},
	{
		id: "yojosuknam-lofi",
		name: "yojosuknam Radio",
		url: "https://stream.yojosuknam.com/live.mp3",
		provider: "radio-browser",
	},
];

export const somaFmSource: MusicSource = {
	id: "somafm-fluid",
	name: "SomaFM Fluid",
	url: "https://ice5.somafm.com/fluid-128-mp3",
	provider: "somafm",
};

const somaFmAlternateSource: MusicSource = {
	id: "somafm-fluid-alternate",
	name: "SomaFM Fluid",
	url: "https://ice6.somafm.com/fluid-128-mp3",
	provider: "somafm",
};

const MAX_DISCOVERED_RADIO_SOURCES = 4;
const MAX_RADIO_SOURCES = 5;

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
		if (!url || urls.has(url)) continue;
		urls.add(url);
		sources.push({ id: `radio-browser-${sources.length}`, name: entry.name.trim(), url, provider: "radio-browser" });
		if (sources.length === MAX_DISCOVERED_RADIO_SOURCES) break;
	}
	return sources;
};

export const parseSomaFmFluid = (value: unknown): SomaFmChannel | undefined => {
	if (!isRecord(value) || !Array.isArray(value.channels)) return undefined;
	const channel = value.channels.find((entry) => isRecord(entry) && entry.id === "fluid");
	if (!isRecord(channel) || typeof channel.title !== "string") return undefined;
	return {
		title: channel.title,
		...(typeof channel.lastPlaying === "string" && channel.lastPlaying.trim() ? { lastPlaying: channel.lastPlaying.trim() } : {}),
	};
};

export const buildMusicSources = (radioBrowserResponse: unknown): MusicSource[] => {
	const discovered = parseRadioBrowserSources(radioBrowserResponse);
	const radioSources = [...discovered, ...fallbackRadioSources]
		.filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index)
		.slice(0, MAX_RADIO_SOURCES);
	return [...radioSources, somaFmSource, somaFmAlternateSource];
};
