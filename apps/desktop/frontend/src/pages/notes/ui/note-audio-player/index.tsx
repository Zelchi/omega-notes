import Button from "@/shared/ui/button";
import Input from "@/shared/ui/input";
import { Show, type Component } from "solid-js";
import { cx } from "@/shared/lib/classes";
import type { TranslationKey } from "@/shared/lib/i18n";
import { useMediaPlayerController } from "../../model/media-player";
import { styles } from "../media-player-controls.css.ts";

type NoteAudioPlayerProps = {
	source: string;
	sourceFailed: boolean;
	volume: number;
	hidden: boolean;
	t: (key: TranslationKey) => string;
	onVolumeChange: (volume: number) => void;
};

const NoteAudioPlayer: Component<NoteAudioPlayerProps> = (props) => {
	const player = useMediaPlayerController(() => props.volume, props.onVolumeChange);
	const progress = () =>
		player.duration() > 0 ? Math.min(100, (player.currentTime() / player.duration()) * 100) : 0;
	const volumeLevel = () => (player.muted() ? 0 : player.volume()) * 100;

	return (
		<div
			class={styles.root}
			onPointerDown={(event) => {
				if (!props.hidden) event.stopPropagation();
			}}
		>
			<audio
				ref={player.setMedia}
				class={styles.source}
				src={props.source || undefined}
				preload="metadata"
				aria-hidden="true"
				tabIndex={-1}
				onLoadedMetadata={player.sync}
				onEmptied={player.reset}
				onDurationChange={player.sync}
				onTimeUpdate={player.sync}
				onError={() => player.setFailed(true)}
				onPlay={() => { player.setPlaying(true); player.setFailed(false); }}
				onPause={() => player.setPlaying(false)}
				onEnded={() => player.setPlaying(false)}
				onVolumeChange={player.sync}
			/>
			<Show when={!props.hidden}>
				<div class={styles.controls}>
					<Button
						class={styles.button}
						type="button"
						aria-label={props.t(player.playing() ? "pauseAudio" : "playAudio")}
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
					</Button>
					<span class={styles.time}>
						{player.formatTime(player.currentTime())} / {player.formatTime(player.duration())}
					</span>
					<Show
						when={!player.volumeControlOpen()}
						fallback={
							<Input
								class={`${styles.slider} ${styles.volumeSlider}`}
								type="range"
								min="0"
								max="1"
								step="0.01"
								value={volumeLevel() / 100}
								aria-label={props.t("audioVolume")}
								style={{
									"--slider-progress": `${volumeLevel()}%`,
									"--slider-color": "var(--muted)",
								}}
								onInput={player.setPlayerVolume}
								onChange={player.commitPlayerVolume}
							/>
						}
					>
						<Input
							class={`${styles.slider} ${styles.seek}`}
							type="range"
							min="0"
							max={player.duration() || 1}
							step="0.1"
							value={player.currentTime()}
							disabled={!player.duration()}
							aria-label={props.t("audioProgress")}
							style={{ "--slider-progress": `${progress()}%` }}
							onInput={player.seek}
						/>
					</Show>
					<Button
						class={cx(styles.button, player.volumeControlOpen() && styles.buttonActive)}
						type="button"
						aria-label={props.t(player.volumeControlOpen() ? "hideAudioVolume" : "showAudioVolume")}
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
					</Button>
				</div>
			</Show>
			<Show when={(player.failed() || props.sourceFailed) && !props.hidden}>
				<span class={styles.error} role="alert">{props.t("audioPlaybackFailed")}</span>
			</Show>
		</div>
	);
};

export default NoteAudioPlayer;
