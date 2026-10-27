import Button from "@/shared/ui/button";
import Icon from "@/shared/ui/icon";
import { displayNoteTitle } from "@/entities/note";
import { registerExitSnapshot } from "@/shared/ui/exit-snapshot";
import { For, Show, type Component } from "solid-js";
import { HOME_HEIGHT, HOME_WIDTH } from "../../lib/graph";
import { cx } from "@/shared/lib/classes";
import { styles } from "./style.css.ts";
import { useGraphCanvas } from "./controller";
import type { GraphCanvasProps } from "./types";

const GraphCanvas: Component<GraphCanvasProps> = (props) => {
	let board!: HTMLDivElement;
	const graph = useGraphCanvas(props, () => board);

	return (
		<section class={styles.root}>
			<div
				class={styles.board}
				ref={board}
				style={{
					cursor: props.mode === "edit" ? "default" : "grab",
					"background-position": `${graph.view().x}px ${graph.view().y}px`,
					"background-size": `${21 * graph.view().scale}px ${21 * graph.view().scale}px`,
				}}
				onPointerDown={graph.beginPan}
				onPointerMove={graph.moveGesture}
				onPointerUp={graph.endGesture}
				onPointerCancel={graph.cancelGesture}
				onLostPointerCapture={graph.cancelGesture}
				onWheel={graph.zoomWithWheel}
				onContextMenu={(event) => event.preventDefault()}
				aria-label={props.t("canvasLabel")}
			>
				<div
					class={styles.world}
					style={{
						transform: `translate(${graph.view().x}px, ${graph.view().y}px) scale(${graph.view().scale})`,
					}}
				>
					<svg
						class={styles.edges}
						width={HOME_WIDTH}
						height={HOME_HEIGHT}
						viewBox={`0 0 ${HOME_WIDTH} ${HOME_HEIGHT}`}
						aria-hidden="true"
					>
						<For each={graph.edges()}>{(edge) => <path class={styles.edge} d={graph.edgePath(edge)} />}</For>
						<For each={graph.renderedZipTies()}>
							{({ tie, placement }) => <g
								class={props.mode === "edit" ? styles.zipTieInteractive : styles.zipTiePassive}
								transform={`translate(${placement.x} ${placement.y}) rotate(${placement.angle})`}
								onPointerDown={(event) => graph.beginZipTieDrag(tie.id, event)}
								onContextMenu={(event) => graph.releaseZipTie(tie.id, event)}
							>
								<rect class={styles.zipTieBand} x={-placement.width / 2} y={-5} width={placement.width} height={10} rx={3} />
								<rect class={styles.zipTieHead} x={-4} y={-7} width={8} height={14} rx={2} />
								<path class={styles.zipTieTooth} d="M-2 -3h4M-2 0h4M-2 3h4" />
							</g>}
						</For>
					</svg>

					<For each={props.notes}>
						{(note, index) => {
							const point = () => graph.nodePosition(note, index());
							return (
								<Button
									class={cx(styles.bubble, graph.createdNoteId() === note.id && styles.createdBubble, graph.selectedIds().has(note.id) && styles.selectedBubble, graph.isLocked(note.id) && styles.lockedBubble)}
									ref={(element) => {
										graph.registerNode(note.id, element);
										registerExitSnapshot(element, { kind: "card", key: `canvas-card:${note.id}`,
											enabled: () => !props.notes.some((current) => current.id === note.id) });
									}}
									data-note-id={note.id}
									aria-pressed={graph.selectedIds().has(note.id)}
									type="button"
									style={{
										translate: `${point().x}px ${point().y}px`,
										cursor: props.mode === "view" ? "pointer" : graph.isLocked(note.id) ? "default" : "grab",
									}}
									onPointerDown={(event) => graph.beginNodeDrag(event, note)}
									onContextMenu={(event) => graph.openContextMenu(event, note)}
									onClick={(event) => {
										if (graph.shouldIgnoreClick(event)) return;
										graph.clearContextMenu();
										props.onOpenNote(note);
									}}
								>
									<span class={styles.bubbleCopy}>
										<strong class={styles.bubbleTitle}>{displayNoteTitle(note)}</strong>
									</span>
								</Button>
							);
						}}
					</For>
				</div>
				<Show when={graph.zipTieStroke()}>
					{(stroke) => <svg class={styles.zipTieStrokeOverlay}>
						<line class={styles.zipTieStrokeLine} x1={stroke().start.x} y1={stroke().start.y}
							x2={stroke().current.x} y2={stroke().current.y} />
					</svg>}
				</Show>

				<Show when={graph.selectionBox()}>
					{(box) => <div class={styles.selectionBox} aria-hidden="true" style={{
						left: `${box().x}px`, top: `${box().y}px`, width: `${box().width}px`, height: `${box().height}px`,
					}} />}
				</Show>

				<Show when={!props.hideCanvasControls}>
					<div
						class={styles.controls}
						onPointerDown={(event) => {
							event.stopPropagation();
							graph.clearContextMenu();
						}}
					>
						<Button
							class={styles.controlButton}
							type="button"
							aria-label={props.t("zoomOut")}
							onClick={() => graph.zoomBy(-0.1)}
						>
							−
						</Button>
						<Button
							class={styles.controlButton}
							type="button"
							aria-label={props.t("zoomIn")}
							onClick={() => graph.zoomBy(0.1)}
						>
							+
						</Button>
					</div>
				</Show>

				<Show when={graph.contextMenu()}>
					{(menu) => {
						const note = () => props.notes.find((item) => item.id === menu().noteId);
						return (
							<div
								class={cx(styles.contextMenu, "graph-context-menu")}
								ref={(element) => registerExitSnapshot(element, { kind: "menu", key: "canvas-context-menu" })}
								style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
								onPointerDown={(event) => event.stopPropagation()}
								onContextMenu={(event) => event.preventDefault()}
							>
								<Button
									class={styles.menuButton}
									type="button"
									onClick={() => {
										const current = note();
										if (current) {
											graph.clearContextMenu();
											graph.toggleNoteLock(current.id);
										}
									}}
								>
									<Icon name={graph.areLockTargetsLocked(menu().noteId) ? "unlock" : "lock"} size={15} />
									{props.t(graph.areLockTargetsLocked(menu().noteId) ? "canvasUnlockPosition" : "canvasLockPosition")}
								</Button>
								<Button
									class={styles.menuButton}
									type="button"
									onClick={() => {
										const current = note();
										if (current) {
											graph.clearContextMenu();
											props.onRequestRename(current);
										}
									}}
								>
									<Icon name="edit" size={15} />{props.t("rename")}
								</Button>
								<Button
									class={cx(styles.menuButton, styles.dangerButton)}
									type="button"
									onClick={() => {
										const current = note();
										if (current) {
											graph.clearContextMenu();
											void props.onDeleteNote(current);
										}
									}}
								>
									<Icon name="delete" size={15} />{props.t("delete")}
								</Button>
							</div>
						);
					}}
				</Show>
			</div>
		</section>
	);
};

export default GraphCanvas;
