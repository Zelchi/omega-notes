import { createContext, createEffect, createSignal, onCleanup, onMount, useContext, type Accessor, type Component, type JSX, type Setter } from "solid-js";
import { isNoteMediaPlaying } from "@/shared/lib/note-media-playback";
import { getMusicStreamUrl } from "../api/music.repository";
import { buildMusicSources, nextUnattemptedSourceIndex, parseSomaFmFluid, somaFmSource } from "./sources";
import { styles } from "../ui/lofi-player-panel/style.css";

type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "failed";
type Player = {
	volume: Accessor<number>;
	setVolume: Setter<number>;
	muted: Accessor<boolean>;
	status: Accessor<PlayerStatus>;
	isActive: () => boolean;
	sourceName: () => string;
	trackName: () => string | undefined;
	toggleMute: () => void;
	togglePlayback: () => void;
	nextSource: () => void;
};

const PlayerContext = createContext<Player>();
const radioBrowserUrl = "https://all.api.radio-browser.info/json/stations/search?tag=lofi&hidebroken=true&order=clickcount&reverse=true&limit=20";
const somaFmUrl = "https://api.somafm.com/channels.json";

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
	const response = await fetch(url, { headers: { Accept: "application/json" }, signal });
	if (!response.ok) throw Error(`HTTP ${response.status}`);
	return response.json();
}

export const LofiPlayerProvider: Component<{ children: JSX.Element }> = (props) => {
	const [sources, setSources] = createSignal(buildMusicSources([]));
	const [currentIndex, setCurrentIndex] = createSignal(0);
	const [volume, setVolume] = createSignal(0.4);
	const [muted, setMuted] = createSignal(false);
	const [status, setStatus] = createSignal<PlayerStatus>("idle");
	const [somaFmChannel, setSomaFmChannel] = createSignal<{ title: string; lastPlaying?: string }>();
	let audio: HTMLAudioElement | undefined;
	let playbackIntent = false;
	let requestId = 0;
	let sourceAttemptId = 0;
	let attemptTimer: ReturnType<typeof setTimeout> | undefined;
	let attempted = new Set<number>();

	const currentSource = () => sources()[currentIndex()] ?? somaFmSource;
	const effectiveVolume = () => isNoteMediaPlaying() || muted() ? 0 : volume();
	const isActive = () => status() === "playing" || status() === "loading";
	const sourceName = () => currentSource().provider === "somafm" ? somaFmChannel()?.title ?? currentSource().name : currentSource().name;
	const trackName = () => currentSource().provider === "somafm" ? somaFmChannel()?.lastPlaying : undefined;
	const clearAttemptTimer = () => { clearTimeout(attemptTimer); attemptTimer = undefined; };

	createEffect(() => {
		if (audio) audio.volume = effectiveVolume();
	});

	const finishFailed = (activeRequest: number, activeAttempt = sourceAttemptId) => {
		if (activeRequest !== requestId || activeAttempt !== sourceAttemptId || !playbackIntent) return;
		clearAttemptTimer();
		if (attempted.size >= sources().length) {
			sourceAttemptId += 1;
			playbackIntent = false;
			setStatus("failed");
			audio?.pause();
			return;
		}
		void trySource((currentIndex() + 1) % sources().length, activeRequest);
	};

	const trySource = async (requestedIndex: number, activeRequest: number) => {
		if (!audio || activeRequest !== requestId || !playbackIntent) return;
		const list = sources();
		if (!list.length || attempted.size >= list.length) {
			finishFailed(activeRequest);
			return;
		}
		const index = nextUnattemptedSourceIndex(requestedIndex, list.length, attempted);
		if (index === undefined) { finishFailed(activeRequest); return; }
		attempted.add(index);
		setCurrentIndex(index);
		setStatus("loading");
		const activeAttempt = ++sourceAttemptId;
		audio.pause();
		clearAttemptTimer();
		attemptTimer = setTimeout(() => finishFailed(activeRequest, activeAttempt), 15_000);
		try {
			const streamUrl = await getMusicStreamUrl(list[index]!.url);
			if (activeRequest !== requestId || activeAttempt !== sourceAttemptId || !playbackIntent) return;
			audio.src = streamUrl;
			audio.volume = effectiveVolume();
			audio.load();
			void audio.play().catch((error: unknown) => {
				if (activeRequest !== requestId || activeAttempt !== sourceAttemptId || !playbackIntent) return;
				clearAttemptTimer();
				if (error instanceof DOMException && error.name === "AbortError") return;
				if (error instanceof DOMException && error.name === "NotAllowedError") {
					playbackIntent = false;
					setStatus("failed");
					return;
				}
				finishFailed(activeRequest, activeAttempt);
			});
		} catch {
			finishFailed(activeRequest, activeAttempt);
		}
	};

	const playFrom = (index: number) => {
		if (!audio || !sources().length) return;
		requestId += 1;
		playbackIntent = true;
		attempted = new Set<number>();
		void trySource(index, requestId);
	};

	const togglePlayback = () => {
		if (playbackIntent) {
			playbackIntent = false;
			requestId += 1;
			clearAttemptTimer();
			setStatus("paused");
			audio?.pause();
		} else playFrom(currentIndex());
	};
	const toggleMute = () => setMuted(value => !value);

	const nextSource = () => {
		const next = (currentIndex() + 1) % sources().length;
		if (playbackIntent) playFrom(next);
		else { setCurrentIndex(next); setStatus("idle"); }
	};

	const handleSourceFailure = () => {
		if (playbackIntent) finishFailed(requestId, sourceAttemptId);
	};

	const handleWaiting = () => {
		if (!playbackIntent || status() === "failed") return;
		const activeRequest = requestId;
		setStatus("loading");
		clearAttemptTimer();
		const activeAttempt = sourceAttemptId;
		attemptTimer = setTimeout(() => finishFailed(activeRequest, activeAttempt), 15_000);
	};

	onMount(() => {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 8_000);
		void Promise.allSettled([fetchJson(radioBrowserUrl, controller.signal), fetchJson(somaFmUrl, controller.signal)])
			.then(([radioResult, somaResult]) => {
				if (radioResult.status === "fulfilled" && !playbackIntent) {
					setSources(buildMusicSources(radioResult.value));
					setCurrentIndex(0);
				}
				if (somaResult.status === "fulfilled") setSomaFmChannel(parseSomaFmFluid(somaResult.value));
			})
			.catch((error: unknown) => console.warn("Could not load radio station details", error))
			.finally(() => clearTimeout(timeout));
		onCleanup(() => { controller.abort(); clearTimeout(timeout); });
	});

	onCleanup(() => {
		playbackIntent = false;
		requestId += 1;
		clearAttemptTimer();
		audio?.pause();
	});

	const player: Player = { volume, setVolume, muted, status, isActive, sourceName, trackName, toggleMute, togglePlayback, nextSource };
	return <PlayerContext.Provider value={player}>
		{props.children}
		<audio
			ref={(element) => { audio = element; element.volume = effectiveVolume(); }}
			class={styles.audio}
			preload="none"
			aria-hidden="true"
			tabIndex={-1}
			onPlaying={() => { clearAttemptTimer(); if (playbackIntent) setStatus("playing"); }}
			onPause={() => { if (!playbackIntent && status() !== "failed" && status() !== "idle") setStatus("paused"); }}
			onWaiting={handleWaiting}
			onStalled={handleWaiting}
			onError={handleSourceFailure}
		/>
	</PlayerContext.Provider>;
};

export const useLofiPlayer = (): Player => {
	const player = useContext(PlayerContext);
	if (!player) throw Error("LofiPlayerPanel must be rendered inside LofiPlayerProvider");
	return player;
};
