import { Show, createSignal, onMount, onCleanup, type Component } from "solid-js";
import { cx } from "@/shared/lib/classes";
import type { TranslationKey } from "@/shared/lib/i18n";
import { useMediaPlayerController } from "../../model/media-player";
import { styles } from "../media-player-controls.css.ts";
import { videoStyles } from "./style.css.ts";

type NoteVideoPlayerProps = {
	source: string;
	onLoadedMetadata: (event: Event & { currentTarget: HTMLVideoElement }) => void;
	hidden: boolean;
	t: (key: TranslationKey) => string;
};

const NoteVideoPlayer: Component<NoteVideoPlayerProps> = (props) => {
	const [volume, setVolume] = createSignal(1);
	const player = useMediaPlayerController(volume, setVolume);
	const [fullscreen, setFullscreen] = createSignal(false);
	let root!: HTMLDivElement;
	const syncFullscreen = () => setFullscreen(document.fullscreenElement === root);
	onMount(() => document.addEventListener("fullscreenchange", syncFullscreen));
	onCleanup(() => {
		document.removeEventListener("fullscreenchange", syncFullscreen);
		if (document.fullscreenElement === root) void document.exitFullscreen().catch(console.error);
	});
	const toggleFullscreen = () => {
		const action = document.fullscreenElement === root
			? document.exitFullscreen()
			: root.requestFullscreen();
		void action.catch(console.error);
	};
	const progress = () =>
		player.duration() > 0 ? Math.min(100, (player.currentTime() / player.duration()) * 100) : 0;
	const volumeLevel = () => (player.muted() ? 0 : player.volume()) * 100;

	return (
		<div
			ref={root}
			class={videoStyles.root}
			onPointerDown={(event) => {
				if (!props.hidden) event.stopPropagation();
			}}
		>
			<video
				ref={player.setMedia}
				class={videoStyles.video}
				src={props.source || undefined}
				preload="metadata"
				playsinline
				tabIndex={-1}
				onLoadedMetadata={(event) => { player.sync(); props.onLoadedMetadata(event); }}
				onEmptied={player.reset}
				onError={() => player.setFailed(true)}
				onDurationChange={player.sync}
				onTimeUpdate={player.sync}
				onPlay={() => { player.setPlaying(true); player.setFailed(false); }}
				onPause={() => player.setPlaying(false)}
				onEnded={() => player.setPlaying(false)}
				onVolumeChange={player.sync}
			/>
			<Show when={!props.hidden}>
				<div class={cx(styles.controls, videoStyles.controls)}>
					<button
						class={styles.button}
						type="button"
						aria-label={props.t(player.playing() ? "pauseVideo" : "playVideo")}
						onClick={player.togglePlayback}
					>
						{player.playing() ? (
							<svg class={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
								<path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" />
							</svg>
						) : (
							<svg class={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
								<path d="m8 5 12 7-12 7V5Z" fill="currentColor" />
							</svg>
						)}
					</button>
					<span class={cx(styles.time, videoStyles.time)}>
						{player.formatTime(player.currentTime())} / {player.formatTime(player.duration())}
					</span>
					<Show
						when={!player.volumeControlOpen()}
						fallback={
							<input
								class={`${styles.slider} ${styles.volumeSlider}`}
								type="range"
								min="0"
								max="1"
								step="0.01"
								value={volumeLevel() / 100}
								aria-label={props.t("videoVolume")}
								style={{
									"--slider-progress": `${volumeLevel()}%`,
									"--slider-color": "var(--muted)",
								}}
								onInput={player.setPlayerVolume}
								onChange={player.commitPlayerVolume}
							/>
						}
					>
						<input
							class={`${styles.slider} ${styles.seek}`}
							type="range"
							min="0"
							max={player.duration() || 1}
							step="0.1"
							value={player.currentTime()}
							disabled={!player.duration()}
							aria-label={props.t("videoProgress")}
							style={{ "--slider-progress": `${progress()}%` }}
							onInput={player.seek}
						/>
					</Show>
					<button
						class={cx(styles.button, player.volumeControlOpen() && styles.buttonActive)}
						type="button"
						aria-label={props.t(player.volumeControlOpen() ? "hideVideoVolume" : "showVideoVolume")}
						aria-expanded={player.volumeControlOpen()}
						onClick={player.toggleVolumeControl}
					>
						<svg class={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
							<path d="M4 9v6h4l5 4V5L8 9H4Z" fill="none" stroke="currentColor" stroke-width="1.7" />
							<Show
								when={player.muted()}
								fallback={
									<>
										<path
											d="M16 9a5 5 0 0 1 0 6M18.5 6.5a8.5 8.5 0 0 1 0 11"
											fill="none"
											stroke="currentColor"
											stroke-width="1.7"
										/>
									</>
								}
							>
								<path d="m16 9 5 6m0-6-5 6" fill="none" stroke="currentColor" stroke-width="1.7" />
							</Show>
						</svg>
					</button>
					<Show when={document.fullscreenEnabled}>
						<button class={styles.button} type="button"
							aria-label={props.t(fullscreen() ? "exitFullscreen" : "enterFullscreen")}
							title={props.t(fullscreen() ? "exitFullscreen" : "enterFullscreen")}
							onClick={toggleFullscreen}>
							<svg class={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
								<path d={fullscreen() ? "M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" : "M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"} />
							</svg>
						</button>
					</Show>
				</div>
			</Show>
			<Show when={player.failed() && !props.hidden}>
				<span class={videoStyles.error} role="alert">{props.t("videoPlaybackFailed")}</span>
			</Show>
		</div>
	);
};

export default NoteVideoPlayer;
