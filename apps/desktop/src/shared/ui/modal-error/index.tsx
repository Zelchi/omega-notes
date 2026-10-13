import { createEffect, createSignal, onCleanup, Show, type Accessor, type Component, type JSX } from "solid-js";
import { styles } from "./style.css.ts";

type Props = { message?: string; id?: string; alignTo?: Accessor<HTMLElement | undefined> };

/** The dialog remains centered; its error appears above without affecting layout. */
const ModalError: Component<Props> = (props) => {
	const [visible, setVisible] = createSignal(false);
	const [position, setPosition] = createSignal<JSX.CSSProperties>();
	let notice: HTMLParagraphElement | undefined;
	createEffect(() => {
		const message = props.message;
		setVisible(Boolean(message));
		if (!message) return;
		const timer = setTimeout(() => setVisible(false), 1500);
		onCleanup(() => clearTimeout(timer));
	});
	createEffect(() => {
		const anchor = props.alignTo?.();
		if (!anchor || !visible()) return;
		const updatePosition = (): void => {
			const parent = notice?.offsetParent;
			if (!notice || !(parent instanceof HTMLElement) || !anchor.isConnected) return;
			const bounds = parent.getBoundingClientRect();
			const field = anchor.getBoundingClientRect();
			const scale = bounds.width / parent.offsetWidth || 1;
			setPosition({ left: `${(field.left - bounds.left) / scale - parent.clientLeft}px`, right: "auto",
				width: `${anchor.offsetWidth}px`, bottom: "auto",
				top: `${Math.max((8 - bounds.top) / scale, -notice.offsetHeight - 12)}px` });
		};
		const frame = requestAnimationFrame(updatePosition);
		const observer = new ResizeObserver(updatePosition);
		observer.observe(anchor);
		if (notice) observer.observe(notice);
		window.addEventListener("resize", updatePosition);
		onCleanup(() => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", updatePosition); });
	});
	return (
		<Show when={props.message}>
			<p ref={notice} id={props.id} class={styles.notice} style={position()} role="alert" hidden={!visible()}>{props.message}</p>
		</Show>
	);
};

export default ModalError;
