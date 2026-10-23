import Button from "@/shared/ui/button";
import Input from "@/shared/ui/input";
import { registerExitSnapshot } from "@/shared/ui/exit-snapshot";
import { createBackdropDismiss } from "@/shared/ui/backdrop-dismiss";
import { For, Show, type Component } from "solid-js";
import { registerVisibilityAnimation } from "@/shared/ui/visibility-animation";
import { isTauriRuntime } from "@/shared/lib/tauri";
import AsciiBackdrop from "@/shared/ui/ascii-backdrop";
import type { MediaCatalogViewProps } from "./controller";
import { styles } from "./style.css.ts";

const MediaCatalogDialog: Component<MediaCatalogViewProps> = (props) => {
	const backdropDismiss = createBackdropDismiss(() => props.catalog.close());

	return (
		<div
			class={styles.backdrop}
			inert={props.exiting} aria-hidden={props.exiting || undefined}
			ref={(element) => {
				registerExitSnapshot(element, { kind: "dialog", key: "media-catalog-dialog", enabled: () => props.open });
				registerVisibilityAnimation(element, () => props.exiting, "fade");
			}}
			{...backdropDismiss}
		>
			<section
				ref={(element) => registerVisibilityAnimation(element, () => props.exiting, "dialog")}
				class={styles.dialog}
				role="dialog"
				aria-modal="true"
				aria-labelledby="media-catalog-title"
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						props.catalog.close();
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
								disabled={props.catalog.cleaning()}
								onClick={() => void props.catalog.cleanOrphanedMedia()}
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
							onClick={props.catalog.openFilePicker}
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
							onClick={props.catalog.close}
						>
							×
						</Button>
					</div>
				</header>
				<Input
					ref={props.catalog.setFileInput}
					type="file"
					accept=".png,.jpg,.jpeg,.gif,.webp,.bmp,.avif"
					multiple
					style={{ display: "none" }}
					onChange={props.catalog.importFiles}
				/>
				<Input
					class={styles.search}
					value={props.catalog.query()}
					onInput={(event) => props.catalog.setQuery(event.currentTarget.value)}
					placeholder={props.t("searchMedia")}
					aria-label={props.t("searchMedia")}
					autofocus
				/>
				<Show when={props.catalog.cleanupStatus()}>
					{(status) => (
						<p class={status().failed ? styles.cleanupError : styles.cleanupStatus} role="status">
							{status().message}
						</p>
					)}
				</Show>
				<Show when={props.catalog.loadingCatalog()}>
					<p class={styles.cleanupStatus} role="status">{props.t("mediaCatalogLoading")}</p>
				</Show>
				<Show when={props.catalog.loadError()}>
					<div class={styles.loadError} role="alert">
						<span>{props.t("mediaCatalogLoadFailed")}</span>
						<Button class={styles.action} type="button" disabled={props.catalog.loadingCatalog()} onClick={props.catalog.retryLoad}>
							{props.t("retry")}
						</Button>
					</div>
				</Show>
				<div class={styles.grid}>
					<For each={props.catalog.filtered()}>
						{(media) => (
							<Button class={styles.item} type="button" onClick={() => props.catalog.selectMedia(media)}>
								<img
									class={styles.thumb}
									src={props.catalog.sources()[media.id] ?? ("dataUrl" in media.source ? media.source.dataUrl : "")}
									alt=""
								/>
							</Button>
						)}
					</For>
				</div>
			</section>
		</div>
	);
};

export default MediaCatalogDialog;
