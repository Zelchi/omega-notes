import { lazy, Show, Suspense, type Component } from "solid-js";
import type { CanvasLayout } from "@/features/change-preferences";
import GraphCanvas from "../graph-canvas";
import type { GraphCanvasProps } from "../graph-canvas/types";
import { styles } from "./style.css.ts";

const DynamicGraph = lazy(() => import("../dynamic-graph"));

type CanvasProps = GraphCanvasProps & {
	ready: boolean;
	layout: CanvasLayout;
};

const Canvas: Component<CanvasProps> = (props) => {
	return (
		<div class={styles.canvasScroll} inert={props.busy}>
			<Show when={props.ready ? props.vaultId : undefined} keyed fallback={<div aria-busy="true" />}>
				{(vaultId) => <>
				<Show when={props.layout === "static"} fallback={
					<Suspense fallback={<div aria-busy="true" />}>
						<DynamicGraph {...props} vaultId={vaultId} />
					</Suspense>
				}>
					<GraphCanvas {...props} vaultId={vaultId} />
				</Show>
				<Show when={props.notes.length === 0}>
					<p class={styles.empty}>{props.t(props.mode === "edit" ? "emptyCanvasMessage" : "emptyCanvasReadMessage")}</p>
				</Show>

				</>}
			</Show>
		</div>
	);
};

export default Canvas;
