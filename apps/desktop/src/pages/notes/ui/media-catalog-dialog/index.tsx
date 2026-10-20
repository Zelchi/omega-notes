import Button from "@/shared/ui/button";
import Input from "@/shared/ui/input";
import { registerExitSnapshot } from "@/shared/ui/exit-snapshot";
import { createBackdropDismiss } from "@/shared/ui/backdrop-dismiss";
import { For, mergeProps, Show, type Component } from "solid-js";
import { createPresence } from "@/shared/lib/presence";
import { registerVisibilityAnimation } from "@/shared/ui/visibility-animation";
import { isTauriRuntime } from "@/shared/lib/tauri";
import AsciiBackdrop from "@/shared/ui/ascii-backdrop";
import { useMediaCatalogDialogController, type MediaCatalogDialogProps } from "./controller";
import { styles } from "./style.css.ts";

const MediaCatalogDialog: Component<MediaCatalogDialogProps> = (props) => {
	const presence = createPresence(() => props.open, 210);
	const catalog = useMediaCatalogDialogController(mergeProps(props, { get open() { return presence.present(); } }));
	const backdropDismiss = createBackdropDismiss(() => catalog.close());

	return (
		<Show when={presence.present()}>
			<div
				class={styles.backdrop}
				inert={presence.exiting()} aria-hidden={presence.exiting() || undefined}
				ref={(element) => {
					registerExitSnapshot(element, { kind: "dialog", key: "media-catalog-dialog", enabled: () => props.open });
					registerVisibilityAnimation(element, presence.exiting, "fade");
				}}
				{...backdropDismiss}
			>
				<section
					ref={(element) => registerVisibilityAnimation(element, presence.exiting, "dialog")}
					class={styles.dialog}
					role="dialog"
					aria-modal="true"
					aria-labelledby="media-catalog-title"
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.preventDefault();
							event.stopPropagation();
							catalog.close();
						}
					}}
				>
						<AsciiBackdrop placement="modal" />
					<header class={styles.header}>
						<h2 class={styles.title} id="media-catalog-title">
							{props.t("mediaCatalog")}
						</h2>
						<div class={styles.actions}>
							<Show when={isTauriRuntime()}>
								<Button
									class={styles.action}
									type="button"
									aria-label={props.t("cleanupMedia")}
									title={props.t("cleanupMedia")}
									disabled={catalog.cleaning()}
									onClick={() => void catalog.cleanOrphanedMedia()}
								>
									<svg
										aria-hidden="true"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="1.7"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="m3 21 9-9" />
										<path d="M8 16 4 12l6-6 4 4" />
										<path d="m14 8 2-2 4 4-2 2" />
										<path d="m13 5 2-2 6 6-2 2" />
									</svg>
								</Button>
							</Show>
							<Button
								class={styles.action}
								type="button"
								aria-label={props.t("importMedia")}
								onClick={catalog.openFilePicker}
							>
								<svg
									aria-hidden="true"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.7"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M12 15V3m-5 5 5-5 5 5" />
									<path d="M4 14v6h16v-6" />
								</svg>
							</Button>
							<Button
								class={styles.action}
								type="button"
								aria-label={props.t("close")}
								onClick={catalog.close}
							>
								×
							</Button>
						</div>
					</header>
					<Input
						ref={catalog.setFileInput}
						type="file"
						accept="image/*,.aac,.flac,.m4a,.mp3,.oga,.ogg,.opus,.wav,.webm,.mp4,.ogv"
						multiple
						style={{ display: "none" }}
						onChange={catalog.importFiles}
					/>
					<Input
						class={styles.search}
						value={catalog.query()}
						onInput={(event) => catalog.setQuery(event.currentTarget.value)}
						placeholder={props.t("searchMedia")}
						aria-label={props.t("searchMedia")}
						autofocus
					/>
					<Show when={catalog.cleanupStatus()}>
						{(status) => (
							<p class={status().failed ? styles.cleanupError : styles.cleanupStatus} role="status">
								{status().message}
							</p>
						)}
					</Show>
					<div class={styles.grid}>
						<For each={catalog.filtered()}>
							{(media) => (
								<Button class={styles.item} type="button" onClick={() => catalog.selectMedia(media)}>
									<Show
										when={media.source.type === "image"}
										fallback={
											<Show
												when={media.source.type === "video"}
												fallback={
													<div class={styles.mediaIcon} aria-hidden="true">
														<svg
															width="36"
															height="36"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="1.5"
															stroke-linecap="round"
															stroke-linejoin="round"
														>
															<path d="M11 5 6 9H3v6h3l5 4V5Z" />
															<path d="M15.5 8.5a5 5 0 0 1 0 7m2.5-9.5a8 8 0 0 1 0 12" />
														</svg>
													</div>
												}
											>
												<div class={styles.mediaIcon} aria-hidden="true">
													<svg
														width="36"
														height="36"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="1.5"
														stroke-linecap="round"
														stroke-linejoin="round"
													>
														<rect x="3" y="5" width="18" height="14" rx="2" />
														<path d="m10 9 5 3-5 3V9Z" />
													</svg>
												</div>
											</Show>
										}
									>
										<img
											class={styles.thumb}
											src={
												catalog.sources()[media.id] ??
												("dataUrl" in media.source ? media.source.dataUrl : "")
											}
											alt=""
										/>
									</Show>
								</Button>
							)}
						</For>
					</div>
				</section>
			</div>
		</Show>
	);
};

export default MediaCatalogDialog;
