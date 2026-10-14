import { Show, type Component } from "solid-js";
import DynamicGraph from "../dynamic-graph";
import type { CanvasLayout } from "@/features/change-preferences";
import GraphCanvas from "../graph-canvas";
import type { GraphCanvasProps } from "../graph-canvas/types";
import { styles } from "./style.css.ts";

type CanvasProps = GraphCanvasProps & {
	ready: boolean;
	layout: CanvasLayout;
};

const Canvas: Component<CanvasProps> = (props) => {
	return (
		<div class={styles.canvasScroll} inert={props.busy}>
			<Show when={props.ready} fallback={<div aria-busy="true" />}>
				<Show when={props.layout === "static"} fallback={<DynamicGraph {...props} />}>
					<GraphCanvas {...props} />
				</Show>
				<Show when={props.notes.length === 0}>
					<p class={styles.empty}>{props.t(props.mode === "edit" ? "emptyCanvasMessage" : "emptyCanvasReadMessage")}</p>
				</Show>

			</Show>
		</div>
	);
};

export default Canvas;
