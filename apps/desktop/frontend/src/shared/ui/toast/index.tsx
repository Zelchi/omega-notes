import { For, onCleanup, onMount, Show, type Component } from "solid-js";
import Button from "@/shared/ui/button";
import Icon from "@/shared/ui/icon";
import { cx } from "@/shared/lib/classes";
import { styles } from "./style.css";

export type ToastMessage = {
	id: number;
	source: string;
	message: () => string;
	kind: "info" | "error";
	action?: { label: () => string; run: () => void };
};

const Toast: Component<{ toast: ToastMessage; dismiss: (id: number) => void }> = props => {
	onMount(() => {
		const timer = setTimeout(() => props.dismiss(props.toast.id), props.toast.kind === "error" ? 10_000 : 6_000);
		onCleanup(() => clearTimeout(timer));
	});
	return <div class={cx(styles.toast, props.toast.kind === "error" && styles.error)}>
		<span>{props.toast.message()}</span>
		<Show when={props.toast.action}>{action =>
			<Button type="button" class={styles.action} onClick={() => { action().run(); props.dismiss(props.toast.id); }}>{action().label()}</Button>
		}</Show>
		<Button type="button" class={styles.close} onClick={() => props.dismiss(props.toast.id)}>
			<Icon name="close" size={15} />
		</Button>
	</div>;
};

const ToastStack: Component<{ messages: ToastMessage[]; dismiss: (id: number) => void }> = props =>
	<div class={styles.stack}><For each={props.messages}>{toast => <Toast toast={toast} dismiss={props.dismiss} />}</For></div>;

export default ToastStack;
