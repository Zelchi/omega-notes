import { Show, type Component } from "solid-js";
import GraphCanvas from "../graph-canvas";
import type { GraphCanvasProps } from "../graph-canvas/types";
import { styles } from "./style.css.ts";

type CanvasProps = GraphCanvasProps & {
	ready: boolean;
};

const Canvas: Component<CanvasProps> = (props) => (
	<div class={styles.canvasScroll}>
		<Show when={props.ready} fallback={<div aria-busy="true" />}>
			<GraphCanvas
				notes={props.notes}
				onCreateNote={props.onCreateNote}
				onOpenNote={props.onOpenNote}
				onRequestRename={props.onRequestRename}
				onDeleteNote={props.onDeleteNote}
				mode={props.mode}
				t={props.t}
				centerOnMount={props.centerOnMount}
				onCanvasMount={props.onCanvasMount}
				hideZoomControls={props.hideZoomControls}
			/>
		</Show>
	</div>
);

export default Canvas;
