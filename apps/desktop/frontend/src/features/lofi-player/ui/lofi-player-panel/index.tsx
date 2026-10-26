import { Show, type Component } from "solid-js";
import Button from "@/shared/ui/button";
import Icon from "@/shared/ui/icon";
import Input from "@/shared/ui/input";
import { sliderStyles } from "@/shared/ui/slider/style.css";
import type { TranslationKey } from "@/shared/lib/i18n";
import { useLofiPlayer } from "../../model/player";
import { styles } from "./style.css";

type Props = {
	t: (key: TranslationKey) => string;
};

const LofiPlayerPanel: Component<Props> = (props) => {
	const player = useLofiPlayer();
	return <section class={styles.radio}>
		<div class={styles.stationRow}>
			<div class={styles.station}>
				<span class={styles.stationName}>{player.sourceName()}</span>
				<Show when={player.trackName()}>{(track) => <span class={styles.track}>{track()}</span>}</Show>
			</div>
			<div class={styles.controls}>
				<Button class={styles.iconButton} type="button" sound={false} aria-label={props.t("musicPlayerNext")}
					onClick={player.nextSource}>
					<Icon name="skipNext" size={16} />
				</Button>
				<Button class={styles.playButton} type="button" sound={false}
					aria-label={props.t(player.isActive() ? "musicPlayerPause" : "musicPlayerPlay")}
					onClick={player.togglePlayback}>
					<Icon name={player.isActive() ? "pause" : "play"} size={16} />
				</Button>
			</div>
		</div>
		<label class={styles.volume}>
			<Icon name={player.muted() || player.volume() === 0 ? "volumeMuted" : "volume"} size={16} />
			<Input class={`${sliderStyles.slider} ${styles.volumeSlider}`} type="range" min="0" max="1" step="0.01" value={player.volume()}
				aria-label={props.t("musicPlayerVolume")}
				style={{ "--slider-progress": `${player.volume() * 100}%`, "--slider-color": "var(--muted)" }}
				onInput={(event) => player.setVolume(Number(event.currentTarget.value))} />
		</label>
		<Show when={player.status() === "failed"}>
			<p class={styles.error} role="alert">{props.t("musicPlayerFailed")}</p>
		</Show>
	</section>;
};

export default LofiPlayerPanel;
