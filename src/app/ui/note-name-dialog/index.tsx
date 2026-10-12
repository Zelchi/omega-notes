import { createEffect, createMemo, onCleanup, Show, type Component } from "solid-js";
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
	let titleInput: HTMLInputElement | undefined;
	const presence = createPresence(() => Boolean(props.mode), 210);
	const displayedMode = createMemo<Props["mode"]>((previous) => props.mode ?? previous);

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
				onClick={(event) => {
					if (event.target === event.currentTarget) props.onClose();
				}}
			>
				<form
					ref={(element) => registerVisibilityAnimation(element, presence.exiting, "dialog")}
					class={styles.dialog}
					role="dialog"
					aria-modal="true"
					aria-labelledby="note-name-heading"
					onSubmit={(event) => void props.onSubmit(event)}
				>
					<h2 class={styles.title} id="note-name-heading">
						{props.t(displayedMode() === "create" ? "newNote" : "renameNote")}
					</h2>
					<input
						ref={(element) => (titleInput = element)}
						class={styles.input}
						value={props.title}
						onInput={(event) => props.onTitleChange(event.currentTarget.value)}
						placeholder={props.t("noteName")}
						aria-label={props.t("noteName")}
						disabled={props.saving}
					/>
					<Show when={props.error}>
						<p class={styles.error} role="alert">
							{props.error}
						</p>
					</Show>
					<div class={styles.actions}>
						<button
							class={cx(styles.action, styles.cancel)}
							type="button"
							onClick={props.onClose}
							disabled={props.saving}
						>
							{props.t("cancel")}
						</button>
						<button
							class={cx(styles.action, styles.confirm)}
							type="submit"
							disabled={!props.title.trim() || props.saving}
						>
							{props.t(displayedMode() === "create" ? "create" : "save")}
						</button>
					</div>
				</form>
			</div>
		</Show>
	);
};

export default NoteNameDialog;
