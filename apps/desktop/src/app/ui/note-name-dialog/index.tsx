import Input from "@/shared/ui/input";
import Button from "@/shared/ui/button";
import { createEffect, createMemo, createUniqueId, onCleanup, Show, type Component } from "solid-js";
import ModalError from "@/shared/ui/modal-error";
import { createBackdropDismiss } from "@/shared/ui/backdrop-dismiss";
import { createPresence } from "@/shared/lib/presence";
import { registerVisibilityAnimation } from "@/shared/ui/visibility-animation";
import type { TranslationKey } from "@/shared/lib/i18n";
import { cx } from "@/shared/lib/classes";
import { styles } from "./style.css.ts";

type Props = {
	mode: "create" | "rename" | undefined;
	title: string;
	error?: string;
	saving: boolean;
	t: (key: TranslationKey) => string;
	onTitleChange: (value: string) => void;
	onClose: () => void;
	onSubmit: (event: SubmitEvent) => void | Promise<void>;
};

const NoteNameDialog: Component<Props> = (props) => {
	const backdropDismiss = createBackdropDismiss(() => props.onClose());
	let titleInput: HTMLInputElement | undefined;
	const errorId = createUniqueId();
	const presence = createPresence(() => Boolean(props.mode), 210);
	const displayed = createMemo<Pick<Props, "mode" | "title" | "error" | "saving">>((previous) =>
		props.mode ? { mode: props.mode, title: props.title, error: props.error, saving: props.saving }
			: previous ?? { mode: undefined, title: "", error: undefined, saving: false },
	);

	createEffect(() => {
		if (!props.mode) return;

		const frame = requestAnimationFrame(() => titleInput?.focus());
		onCleanup(() => cancelAnimationFrame(frame));
	});

	return (
		<Show when={presence.present()}>
			<div
				ref={(element) => registerVisibilityAnimation(element, presence.exiting, "fade")}
				class={styles.backdrop}
				inert={presence.exiting()}
				aria-hidden={presence.exiting() || undefined}
				{...backdropDismiss}
			>
				<form
					ref={(element) => registerVisibilityAnimation(element, presence.exiting, "dialog")}
					class={styles.dialog}
					role="dialog"
					aria-modal="true"
					aria-labelledby="note-name-heading"
					onSubmit={(event) => void props.onSubmit(event)}
				>
					<ModalError id={errorId} message={displayed().error} />
					<h2 class={styles.title} id="note-name-heading">
						{props.t(displayed().mode === "create" ? "newNote" : "renameNote")}
					</h2>
					<Input
						ref={(element) => (titleInput = element)}
						class={styles.input}
						value={displayed().title}
						onInput={(event) => props.onTitleChange(event.currentTarget.value)}
						placeholder={props.t("noteName")}
						aria-label={props.t("noteName")}
						aria-invalid={Boolean(displayed().error) || undefined}
						aria-describedby={displayed().error ? errorId : undefined}
						disabled={displayed().saving}
					/>
					<div class={styles.actions}>
						<Button
							class={cx(styles.action, styles.cancel)}
							type="button"
							onClick={props.onClose}
							disabled={displayed().saving}
						>
							{props.t("cancel")}
						</Button>
						<Button
							class={cx(styles.action, styles.confirm)}
							type="submit"
							disabled={!displayed().title.trim() || displayed().saving}
						>
							{props.t(displayed().mode === "create" ? "create" : "save")}
						</Button>
					</div>
				</form>
			</div>
		</Show>
	);
};

export default NoteNameDialog;
