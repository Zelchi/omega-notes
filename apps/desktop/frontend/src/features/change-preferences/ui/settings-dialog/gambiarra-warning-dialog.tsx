import Button from "@/shared/ui/button";
import { createUniqueId, onCleanup, onMount, type Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import { createBackdropDismiss } from "@/shared/ui/backdrop-dismiss";
import { registerExitSnapshot } from "@/shared/ui/exit-snapshot";
import AsciiBackdrop from "@/shared/ui/ascii-backdrop";
import { styles } from "./style.css.ts";

const GambiarraWarningDialog: Component<{
	t: (key: TranslationKey) => string;
	onCancel: () => void;
	onConfirm: () => void;
}> = (props) => {
	const headingId = createUniqueId();
	const messageId = createUniqueId();
	const backdropDismiss = createBackdropDismiss(props.onCancel);
	let cancelButton!: HTMLButtonElement;
	onMount(() => {
		const escape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopImmediatePropagation();
			props.onCancel();
		};
		window.addEventListener("keydown", escape, true);
		const frame = requestAnimationFrame(() => cancelButton.focus({ preventScroll: true }));
		onCleanup(() => {
			window.removeEventListener("keydown", escape, true);
			cancelAnimationFrame(frame);
		});
	});
	return (
		<div class={styles.gambiarraWarningBackdrop}
			ref={(element) => registerExitSnapshot(element, { kind: "dialog", key: "gambiarra-warning-dialog" })}
			{...backdropDismiss}>
			<section class={styles.gambiarraWarningDialog} role="alertdialog" aria-modal="true"
				aria-labelledby={headingId} aria-describedby={messageId}>
				<AsciiBackdrop placement="modal" />
				<h2 class={styles.gambiarraWarningTitle} id={headingId}>{props.t("gambiarra")}</h2>
				<p class={styles.gambiarraWarningText} id={messageId}>{props.t("gambiarraWarning")}</p>
				<div class={styles.gambiarraWarningActions}>
					<Button ref={cancelButton} class={styles.gambiarraWarningButton} type="button" onClick={props.onCancel}>
						{props.t("cancel")}
					</Button>
					<Button class={styles.gambiarraWarningButton} type="button" onClick={props.onConfirm}>
						{props.t("gambiarraActivate")}
					</Button>
				</div>
			</section>
		</div>
	);
};

export default GambiarraWarningDialog;
