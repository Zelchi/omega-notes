import { For, Show, type Component } from "solid-js";
import { cx } from "@/shared/lib/classes";
import Icon from "@/shared/ui/icon";
import type { GraphCanvasProps } from "../graph-canvas/types";
import { styles as menuStyles } from "../graph-canvas/style.css.ts";
import { styles } from "./style.css.ts";
import { useDynamicGraph } from "./controller";

const NODE_HIT_MARGIN = 20;

const hitsNodeCircle = (event: MouseEvent & { currentTarget: HTMLButtonElement }): boolean => {
	const bounds = event.currentTarget.getBoundingClientRect();
	const x = (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2);
	const y = (event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2);
	return x * x + y * y <= 1;
};

const DynamicGraph: Component<GraphCanvasProps> = (props) => {
	let board!: HTMLElement;
	const graph = useDynamicGraph(props, () => board);
	return <section ref={board} class={styles.root} aria-label={props.t("canvasLabel")}
		style={{
			"background-position": `${graph.view().x}px ${graph.view().y}px`,
			"background-size": `${21 * graph.view().scale}px ${21 * graph.view().scale}px`,
		}}
		onPointerDown={(event) => graph.begin(event)} onPointerMove={graph.move} onPointerUp={graph.end}
		onPointerCancel={graph.finish} onLostPointerCapture={graph.finish} onWheel={graph.wheel}
		onContextMenu={(event) => event.preventDefault()}>
		<div class={styles.world} style={{ transform: `translate(${graph.view().x}px, ${graph.view().y}px) scale(${graph.view().scale})` }}>
			<svg class={styles.edges} aria-hidden="true">
				<For each={graph.edges()}>{(edge) => {
					const source = () => graph.positions()[edge.source.id] ?? { x: 0, y: 0 };
					const target = () => graph.positions()[edge.target.id] ?? { x: 0, y: 0 };
					const highlighted = () => graph.hoveredId() === edge.source.id || graph.hoveredId() === edge.target.id;
					return <line x1={source().x} y1={source().y} x2={target().x} y2={target().y}
						class={cx(styles.edge, highlighted() && styles.highlightedEdge, graph.hoveredId() && !highlighted() && styles.dimmedEdge)} />;
				}}</For>
			</svg>
			<For each={props.notes}>{(note) => {
				const point = () => graph.positions()[note.id] ?? { x: 0, y: 0 };
				const diameter = () => 12 + Math.min(12, Math.sqrt(graph.degrees().get(note.id) ?? 0) * 3);
				const hitDiameter = () => diameter() + NODE_HIT_MARGIN * 2;
				return <div class={cx(styles.node, graph.hoveredId() && !graph.neighbors().has(note.id) && styles.dimmedNode)}
					style={{ translate: `${point().x}px ${point().y}px` }}>
					<button type="button" aria-label={note.title}
						class={styles.hitTarget}
						style={{ width: `${hitDiameter()}px`, height: `${hitDiameter()}px`, left: `${-hitDiameter() / 2}px`, top: `${-hitDiameter() / 2}px` }}
					onPointerDown={(event) => graph.begin(event, hitsNodeCircle(event) ? note.id : undefined)}
					onContextMenu={(event) => { if (hitsNodeCircle(event)) graph.openMenu(event, note.id); else event.preventDefault(); }}
					onPointerEnter={(event) => { if (hitsNodeCircle(event)) graph.setHoveredId(note.id); }}
					onPointerMove={(event) => {
						if (graph.draggedId()) return;
						if (hitsNodeCircle(event)) graph.setHoveredId(note.id);
						else if (graph.hoveredId() === note.id) graph.setHoveredId(undefined);
					}}
					onPointerLeave={() => graph.setHoveredId(undefined)}
					onFocus={() => graph.setHoveredId(note.id)} onBlur={() => graph.setHoveredId(undefined)}
					onClick={(event) => { if (!graph.shouldIgnoreClick() && (event.detail === 0 || hitsNodeCircle(event))) props.onOpenNote(note); }}>
						<span aria-hidden="true" class={cx(styles.dot, graph.neighbors().has(note.id) && styles.highlightedDot, graph.draggedId() === note.id && styles.draggedDot)}
							style={{ width: `${diameter()}px`, height: `${diameter()}px` }} />
					</button>
					<span class={styles.label} aria-hidden="true" style={{ top: `${diameter() / 2 + 8}px` }}>{note.title}</span>
				</div>;
			}}</For>
		</div>
		<Show when={!props.hideCanvasControls}>
			<div class={styles.controls} onPointerDown={(event) => event.stopPropagation()}>
				<Show when={props.mode === "edit"}>
					<button type="button" class={styles.button} aria-label={props.t("createCanvasNote")}
						onClick={() => { graph.setContextMenu(undefined); void props.onCreateNote(); }}><Icon name="add" size={16} /></button>
				</Show>
				<button type="button" class={styles.button} aria-label={props.t("fitCanvas")} onClick={graph.fit}><Icon name="maximize" size={15} /></button>
				<button type="button" class={styles.button} aria-label={props.t("zoomOut")} onClick={() => graph.zoomBy(1 / 1.2)}>−</button>
				<button type="button" class={styles.button} aria-label={props.t("zoomIn")} onClick={() => graph.zoomBy(1.2)}>+</button>
			</div>
		</Show>
		<Show when={graph.contextMenu()}>{(menu) => {
			const note = () => props.notes.find((item) => item.id === menu().noteId);
			return <div class={cx(menuStyles.contextMenu, "graph-context-menu")} style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
				onPointerDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
				<button type="button" class={menuStyles.menuButton} onClick={() => { const current = note(); graph.setContextMenu(undefined); if (current) props.onRequestRename(current); }}>{props.t("rename")}</button>
				<button type="button" class={cx(menuStyles.menuButton, menuStyles.dangerButton)} onClick={() => { const current = note(); graph.setContextMenu(undefined); if (current) void props.onDeleteNote(current); }}>{props.t("delete")}</button>
			</div>;
		}}</Show>
	</section>;
};

export default DynamicGraph;
