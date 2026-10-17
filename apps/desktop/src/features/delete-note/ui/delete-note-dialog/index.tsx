import { createMemo, createUniqueId, onCleanup, onMount, Show, type Component } from "solid-js";
import { createPresence } from "@/shared/lib/presence";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { StudyNote } from "@/entities/note";
import { createBackdropDismiss } from "@/shared/ui/backdrop-dismiss";
import { registerVisibilityAnimation } from "@/shared/ui/visibility-animation";
import Button from "@/shared/ui/button";
import { cx } from "@/shared/lib/classes";
import { styles } from "./style.css.ts";

type Props = {
	note?: StudyNote;
	pending: boolean;
	error: boolean;
	t: (key: TranslationKey) => string;
	onClose: () => void;
	onConfirm: () => Promise<void>;
};
const DeleteNoteDialog: Component<Props> = (props) => {
	const presence = createPresence(() => Boolean(props.note), 210);
	const title = createMemo<string>(previous => props.note?.title ?? previous ?? "");
	const headingId = createUniqueId(), messageId = createUniqueId();
	const backdrop = createBackdropDismiss(() => props.onClose());
	onMount(() => {
		const escape = (event: KeyboardEvent) => {
			if (!props.note || event.key !== "Escape") return;
			event.preventDefault(); event.stopImmediatePropagation(); props.onClose();
		};
		window.addEventListener("keydown", escape, true);
		onCleanup(() => window.removeEventListener("keydown", escape, true));
	});
	return <Show when={presence.present()}>
		<div class={styles.backdrop} inert={presence.exiting()} aria-hidden={presence.exiting() || undefined}
			ref={element => registerVisibilityAnimation(element, presence.exiting, "fade")} {...backdrop}>
			<section class={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={messageId}
				ref={element => registerVisibilityAnimation(element, presence.exiting, "dialog")}>
				<h2 class={styles.title} id={headingId}>{props.t("deleteNote")}</h2>
				<strong class={styles.name}>{title()}</strong>
				<p class={styles.message} id={messageId}>{props.t("deleteNoteConfirmation")}</p>
				<Show when={props.error}><p class={styles.error} role="alert">{props.t("deleteNoteFailed")}</p></Show>
				<div class={styles.actions}>
					<Button class={styles.button} type="button" disabled={props.pending} onClick={props.onClose}
						ref={button => { const frame = requestAnimationFrame(() => button.focus({ preventScroll: true })); onCleanup(() => cancelAnimationFrame(frame)); }}>{props.t("cancel")}</Button>
					<Button class={cx(styles.button, styles.delete)} type="button" disabled={props.pending} onClick={() => void props.onConfirm()}>{props.t("delete")}</Button>
				</div>
			</section>
		</div>
	</Show>;
};
export default DeleteNoteDialog;
