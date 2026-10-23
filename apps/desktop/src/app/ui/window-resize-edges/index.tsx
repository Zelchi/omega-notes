import { Show, type Component } from "solid-js";
import { startWindowResizeDrag, type WindowResizeDirection } from "@/app/api/window.repository";
import { isTauriRuntime } from "@/shared/lib/tauri";
import { styles } from "./style.css.ts";

type Props = { maximized: boolean };

const edges: { direction: WindowResizeDirection; class: string }[] = [
	{ direction: "North", class: styles.north },
	{ direction: "South", class: styles.south },
	{ direction: "East", class: styles.east },
	{ direction: "West", class: styles.west },
	{ direction: "NorthWest", class: styles.northWest },
	{ direction: "NorthEast", class: styles.northEast },
	{ direction: "SouthWest", class: styles.southWest },
	{ direction: "SouthEast", class: styles.southEast },
];

const WindowResizeEdges: Component<Props> = (props) => (
	<Show when={isTauriRuntime() && !props.maximized}>
		<div class={styles.container} aria-hidden="true">
			{edges.map(({ direction, class: className }) => (
				<div class={className} onPointerDown={(event) => {
					if (event.button !== 0) return;
					event.preventDefault();
					void startWindowResizeDrag(direction, event.clientX, event.clientY).catch(console.error);
				}} />
			))}
		</div>
	</Show>
);

export default WindowResizeEdges;
