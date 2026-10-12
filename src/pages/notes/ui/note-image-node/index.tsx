import { Show, type Component } from "solid-js";
import { cx } from "@/shared/lib/classes";
import { useNoteImageNodeController, type NoteImageNodeProps } from "./controller";
import { styles } from "./style.css.ts";

const NoteImageNode: Component<NoteImageNodeProps> = (props) => {
	const image = useNoteImageNodeController(props);

	return (
		<div
			class={cx(
				styles.node,
				Boolean(props.activePositioningId && props.activePositioningId !== props.element().id) &&
					styles.lockedDuringPositioning,
			)}
			ref={image.setNodeRoot}
			data-omega-element="image"
			style={{
				left: `${image.currentPoint().x}px`,
				top: `${image.currentPoint().y}px`,
				width: `${image.currentPoint().width}px`,
				height: image.currentPoint().height > 0 ? `${image.currentPoint().height}px` : "auto",
			}}
			onPointerEnter={image.onPointerEnter}
			onPointerLeave={image.onPointerLeave}
			onFocusIn={image.onFocusIn}
			onFocusOut={image.onFocusOut}
			onPointerMove={image.move}
			onPointerUp={image.finish}
			onPointerCancel={image.finish}
			onContextMenu={image.handleContextMenu}
		>
			<img
				class={styles.image}
				src={image.source()}
				alt=""
				draggable={false}
				onLoad={image.setNaturalSize}
				onPointerDown={(event) => image.begin(event, "move")}
				style={{
					height: image.currentPoint().height > 0 ? "100%" : "auto",
					cursor: props.editable && props.activePositioningId === props.element().id ? "move" : "default",
				}}
			/>
			<Show when={props.editable && image.active() && props.activePositioningId === props.element().id}>
				<button
					class={styles.resizeHandle}
					type="button"
					aria-label={props.t("resizeImage")}
					onPointerDown={(event) => image.begin(event, "resize")}
					onKeyDown={image.resizeWithKeyboard}
					style={{
						right: "0px",
						bottom: "0px",
					}}
				/>
			</Show>
		</div>
	);
};

export default NoteImageNode;
