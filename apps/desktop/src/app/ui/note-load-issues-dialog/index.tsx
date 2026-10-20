import { vaultErrorKey } from "@/shared/lib/vault-errors";
import Button from "@/shared/ui/button";
import { registerExitSnapshot } from "@/shared/ui/exit-snapshot";
import { createBackdropDismiss } from "@/shared/ui/backdrop-dismiss";
import { For, Show, type Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { NoteLoadIssue } from "@/entities/note";
import Icon from "@/shared/ui/icon";
import { useNoteLoadIssuesDialogController } from "./controller";
import { styles } from "./style.css.ts";

type Props = {
	issues: NoteLoadIssue[];
	t: (key: TranslationKey) => string;
	onClose: () => void;
};

const NoteLoadIssuesDialog: Component<Props> = (props) => {
	const backdropDismiss = createBackdropDismiss(() => props.onClose());
	const dialog = useNoteLoadIssuesDialogController();

	return (
		<Show when={props.issues.length > 0}>
			<div
				class={styles.backdrop}
				ref={(element) => registerExitSnapshot(element, { kind: "dialog", key: "note-load-issues-dialog" })}
				{...backdropDismiss}
			>
				<section class={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="load-issues-heading">
					<header class={styles.header}>
						<h2 class={styles.title} id="load-issues-heading">
							{props.t("noteLoadIssues")}
						</h2>
						<Button
							class={styles.close}
							type="button"
							aria-label={props.t("close")}
							onClick={props.onClose}
						>
							<Icon name="close" size={16} />
						</Button>
					</header>
					<For each={props.issues}>
						{(issue) => (
							<article class={styles.issue}>
								<h3 class={styles.fileName}>{issue.fileName}</h3>
								<Show when={issue.recovered}>
									<p class={styles.recovery}>{props.t("noteRecovered")}</p>
								</Show>
								<p class={styles.message}>{vaultErrorKey(issue.message) ? props.t(vaultErrorKey(issue.message)!) : issue.message}</p>
								<Show when={issue.recoveryPath}>
									{(path) => (
										<div class={styles.recovery}>
											<span>{props.t("recoveryCopy")}</span>
											<code class={styles.path}>{path()}</code>
											<Button
												class={styles.copy}
												type="button"
												onClick={() => void dialog.copyPath(path())}
											>
												{props.t(dialog.copiedPath() === path() ? "pathCopied" : "copyPath")}
											</Button>
										</div>
									)}
								</Show>
							</article>
						)}
					</For>
				</section>
			</div>
		</Show>
	);
};

export default NoteLoadIssuesDialog;
