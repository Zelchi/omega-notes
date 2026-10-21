import { lazy, Show, Suspense, Switch, Match, type Component } from "solid-js";
import type { CanvasLayout } from "@/features/change-preferences";
import GraphCanvas from "../graph-canvas";
import type { GraphCanvasProps } from "../graph-canvas/types";
import ArchiveView from "../archive-view";
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
				<Switch>
					<Match when={props.layout === "static"}><GraphCanvas {...props} vaultId={vaultId} /></Match>
					<Match when={props.layout === "dynamic" || props.layout === "archive" && !import.meta.env.DEV}>
						<Suspense fallback={<div aria-busy="true" />}>
							<DynamicGraph {...props} vaultId={vaultId} />
						</Suspense>
					</Match>
					<Match when={props.layout === "archive" && import.meta.env.DEV}>
						<ArchiveView vaultId={vaultId} notes={props.notes} mode={props.mode} onCreateNote={props.onCreateNote} onOpenNote={props.onOpenNote} onRequestRename={props.onRequestRename} onDeleteNote={props.onDeleteNote} t={props.t} />
					</Match>
				</Switch>
				<Show when={(props.layout !== "archive" || !import.meta.env.DEV) && props.notes.length === 0}>
					<p class={styles.empty}>{props.t(props.mode === "edit" ? "emptyCanvasMessage" : "emptyCanvasReadMessage")}</p>
				</Show>

				</>}
			</Show>
		</div>
	);
};

export default Canvas;
