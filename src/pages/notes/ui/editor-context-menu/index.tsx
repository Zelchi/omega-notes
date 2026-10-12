import { registerExitSnapshot } from "@/shared/ui/exit-snapshot";
import { onCleanup, onMount, Show, type Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import { cx } from "@/shared/lib/classes";
import { styles } from "./style.css.ts";

type Props = {
	x: number;
	y: number;
	t: (key: TranslationKey) => string;
	onAttach?: () => void;
	onPosition?: () => void;
	onPlace?: () => void;
	onRemove?: () => void;
	onDelete?: () => void;
	onClose: () => void;
};

const EditorContextMenu: Component<Props> = (props) => {
	let root!: HTMLDivElement;
	const closeOnOutsidePointer = (event: PointerEvent) => {
		if (!(event.target instanceof Node) || !root.contains(event.target)) props.onClose();
	};
	const closeOnEscape = (event: KeyboardEvent) => {
		if (event.key === "Escape") props.onClose();
	};
	onMount(() => {
		addEventListener("pointerdown", closeOnOutsidePointer);
		addEventListener("keydown", closeOnEscape);
	});
	onCleanup(() => {
		removeEventListener("pointerdown", closeOnOutsidePointer);
		removeEventListener("keydown", closeOnEscape);
	});

	return (
		<div
			class={styles.menu}
			ref={(element) => {
				root = element;
				registerExitSnapshot(element, { kind: "menu", key: "editor-context-menu" });
			}}
			style={{ left: `${props.x}px`, top: `${props.y}px` }}
			onPointerDown={(event) => event.stopPropagation()}
			onContextMenu={(event) => {
				event.preventDefault();
				event.stopPropagation();
			}}
		>
			<Show when={props.onAttach}>
				{(onAttach) => (
					<button class={styles.button} type="button" onClick={onAttach()}>
						{props.t("attachMedia")}
					</button>
				)}
			</Show>
			<Show when={props.onPosition}>
				{(onPosition) => (
					<button class={styles.button} type="button" onClick={onPosition()}>
						{props.t("positionElement")}
					</button>
				)}
			</Show>
			<Show when={props.onPlace}>
				{(onPlace) => (
					<button class={styles.button} type="button" onClick={onPlace()}>
						{props.t("placeElement")}
					</button>
				)}
			</Show>
			<Show when={props.onRemove}>
				{(onRemove) => (
					<button class={cx(styles.button, styles.dangerButton)} type="button" onClick={onRemove()}>
						{props.t("removeElement")}
					</button>
				)}
			</Show>
			<Show when={props.onDelete}>
				{(onDelete) => (
					<button class={cx(styles.button, styles.dangerButton)} type="button" onClick={onDelete()}>
						{props.t("delete")}
					</button>
				)}
			</Show>
		</div>
	);
};

export default EditorContextMenu;
