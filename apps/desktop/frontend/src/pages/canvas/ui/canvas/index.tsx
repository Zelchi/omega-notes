import { lazy, Show, Suspense, Switch, Match, type Component } from "solid-js";
import type { CanvasLayout } from "@/features/change-preferences";
import GraphCanvas from "../graph-canvas";
import type { GraphCanvasProps } from "../graph-canvas/types";
import Button from "@/shared/ui/button";
import Icon from "@/shared/ui/icon";
import { styles } from "./style.css.ts";

const DynamicGraph = lazy(() => import("../dynamic-graph"));

type CanvasProps = GraphCanvasProps & {
	ready: boolean;
	loading: boolean;
	onReload: () => void;
	layout: CanvasLayout;
};

const Canvas: Component<CanvasProps> = (props) => {
	return (
		<div class={styles.canvasScroll} inert={props.busy}>
			<Show when={props.ready ? props.vaultId : undefined} keyed fallback={
				<div class={styles.loadState}>
					<Show when={!props.loading && props.vaultId} fallback={<Icon name="clock" size={24} />}>
						<Button class={styles.retryButton} type="button" data-omega-vault-retry onClick={props.onReload}>
							<Icon name="reset" size={18} />{props.t("retry")}
						</Button>
					</Show>
				</div>
			}>
				{(vaultId) => <>
				<Switch>
					<Match when={props.layout === "static"}><GraphCanvas {...props} vaultId={vaultId} /></Match>
					<Match when={props.layout === "dynamic"}>
						<Suspense fallback={<div aria-busy="true" />}>
							<DynamicGraph {...props} vaultId={vaultId} />
						</Suspense>
					</Match>
				</Switch>
				<Show when={props.notes.length === 0}>
					<p class={styles.empty}>{props.t(props.mode === "edit" ? "emptyCanvasMessage" : "emptyCanvasReadMessage")}</p>
				</Show>

				</>}
			</Show>
		</div>
	);
};

export default Canvas;
