import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { DEFAULT_AUDIO_VOLUME } from "@/entities/note";

const clampVolume = (volume: number): number =>
	Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : DEFAULT_AUDIO_VOLUME;

const formatTime = (value: number): string => {
	const totalSeconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const formattedMinutes = hours ? String(minutes).padStart(2, "0") : String(minutes);
	const formattedSeconds = String(seconds).padStart(2, "0");
	return hours ? `${hours}:${formattedMinutes}:${formattedSeconds}` : `${formattedMinutes}:${formattedSeconds}`;
};

export const useMediaPlayerController = (
	initialVolume: Accessor<number>,
	onVolumeChange: (volume: number) => void,
) => {
	const [currentTime, setCurrentTime] = createSignal(0);
	const [duration, setDuration] = createSignal(0);
	const [volume, setVolume] = createSignal(clampVolume(initialVolume()));
	const [muted, setMuted] = createSignal(volume() === 0);
	const [playing, setPlaying] = createSignal(false);
	const [failed, setFailed] = createSignal(false);
	const [volumeControlOpen, setVolumeControlOpen] = createSignal(false);
	let media: HTMLMediaElement | undefined;

	createEffect(() => {
		const storedVolume = clampVolume(initialVolume());
		setVolume(storedVolume);
		setMuted(storedVolume === 0);
		if (!media) return;
		media.volume = storedVolume;
		media.muted = storedVolume === 0;
	});

	const sync = (): void => {
		if (!media) return;
		setCurrentTime(media.currentTime);
		setDuration(Number.isFinite(media.duration) ? media.duration : 0);
		setVolume(media.volume);
		setMuted(media.muted);
	};

	const togglePlayback = (): void => {
		if (!media) return;
		if (media.paused) {
			void media.play().catch((error) => {
				setFailed(true);
				console.error(error);
			});
		}
		else media.pause();
	};

	const seek = (event: InputEvent & { currentTarget: HTMLInputElement }): void => {
		if (!media) return;
		const time = Number(event.currentTarget.value);
		media.currentTime = time;
		setCurrentTime(time);
	};

	const setPlayerVolume = (event: InputEvent & { currentTarget: HTMLInputElement }): void => {
		if (!media) return;
		const nextVolume = Number(event.currentTarget.value);
		media.volume = nextVolume;
		media.muted = nextVolume === 0;
		setVolume(nextVolume);
		setMuted(media.muted);
	};

	const commitPlayerVolume = (event: Event & { currentTarget: HTMLInputElement }): void => {
		onVolumeChange(Number(event.currentTarget.value));
	};

	onCleanup(() => media?.pause());

	return {
		failed,
		setFailed,
		reset: () => {
			setCurrentTime(0);
			setDuration(0);
			setPlaying(false);
			setFailed(false);
		},
		currentTime,
		duration,
		volume,
		muted,
		playing,
		volumeControlOpen,
		formatTime,
		setMedia: (element: HTMLMediaElement) => {
			media = element;
			const storedVolume = clampVolume(initialVolume());
			media.volume = storedVolume;
			media.muted = storedVolume === 0;
			setVolume(storedVolume);
			setMuted(storedVolume === 0);
		},
		sync,
		togglePlayback,
		seek,
		setPlayerVolume,
		commitPlayerVolume,
		toggleVolumeControl: () => setVolumeControlOpen((open) => !open),
		setPlaying,
	};
};
