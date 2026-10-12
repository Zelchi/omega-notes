import { Show, type Component } from "solid-js";
import { cx } from "@/shared/lib/classes";
import MediaPositioningActions from "../media-positioning-actions";
import { DEFAULT_AUDIO_VOLUME } from "@/entities/note";
import AudioPlayer from "../note-audio-player";
import VideoPlayer from "../note-video-player";
import { useNoteMediaNodeController, type NoteMediaNodeProps } from "./controller";
import { styles } from "./style.css.ts";

const NoteMediaNode: Component<NoteMediaNodeProps> = (props) => {
	const media = useNoteMediaNodeController(props);
	const audioVolume = () => {
		const element = props.element();
		return element.type === "audio" ? element.volume : DEFAULT_AUDIO_VOLUME;
	};

	return (
		<div
			class={cx(
				styles.node,
				Boolean(props.activePositioningId && props.activePositioningId !== props.element().id) &&
					styles.lockedDuringPositioning,
				props.editable && props.activePositioningId === props.element().id && styles.positioning,
			)}
			ref={media.setNodeRoot}
			data-omega-element={props.element().type}
			style={{
				left: `${media.currentPoint().x}px`,
				top: `${media.currentPoint().y}px`,
				width: `${media.currentPoint().width}px`,
				height: `${media.currentPoint().height}px`,
				cursor: props.editable && props.activePositioningId === props.element().id ? "move" : "default",
			}}
			onPointerDown={(event) => media.begin(event, "move")}
			onPointerMove={media.move}
			onPointerUp={media.finish}
			onPointerCancel={media.finish}
			onContextMenu={media.handleContextMenu}
		>
			<Show when={props.element().type === "audio" && props.activePositioningId === props.element().id}>
				<div class={styles.audioPositioning} aria-hidden="true">
					<svg class={styles.audioIcon} viewBox="0 0 24 24">
						<path d="M4 9v6h4l5 4V5L8 9H4Z" />
						<path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a8.5 8.5 0 0 1 0 11" />
					</svg>
					<div class={styles.audioWaveform}>
						{[8, 15, 11, 20, 13, 24, 16, 10, 19, 12, 22, 14, 9, 18, 12, 7].map((height) => (
							<span class={styles.audioWaveformBar} style={{ height: `${height}px` }} />
						))}
					</div>
				</div>
			</Show>
			<Show
				when={props.element().type === "audio"}
				fallback={
					<VideoPlayer
						source={media.source()}
						hidden={props.activePositioningId === props.element().id}
						t={props.t}
						onLoadedMetadata={media.setVideoAspect}
					/>
				}
			>
				<AudioPlayer
					source={media.source()}
					volume={audioVolume()}
					hidden={props.activePositioningId === props.element().id}
					t={props.t}
					onVolumeChange={(volume) => {
						const element = props.element();
						if (element.type === "audio" && element.volume !== volume) {
							props.onChange({ ...element, volume });
						}
					}}
				/>
			</Show>
			<Show when={props.element().type === "video" && props.activePositioningId === props.element().id}>
				<div class={styles.videoPositioning} aria-hidden="true">
					<svg class={styles.videoIcon} viewBox="0 0 24 24">
						<path d="m9 6 10 6-10 6V6Z" />
					</svg>
				</div>
			</Show>
			<Show when={props.editable && props.activePositioningId === props.element().id}>
				<MediaPositioningActions
					x={media.currentPoint().x}
					width={media.currentPoint().width}
					pageWidth={props.pageWidth}
					audio={props.element().type === "audio"}
					t={props.t}
					onConfirm={props.onConfirm}
					onDelete={props.onDelete}
					onResize={(event) => media.begin(event, "resize")}
					onResizeKeyDown={media.resizeWithKeyboard}
				/>
			</Show>
		</div>
	);
};

export default NoteMediaNode;
