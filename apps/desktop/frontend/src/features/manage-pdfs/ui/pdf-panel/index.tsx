import { createSignal, For, onCleanup, onMount, Show, type Component } from "solid-js";
import type { NoteSummary } from "@/entities/note";
import Icon from "@/shared/ui/icon";
import AsciiBackdrop from "@/shared/ui/ascii-backdrop";
import type { TranslationKey } from "@/shared/lib/i18n";
import { clampPdfPanelWidth, getPdfPanelWidthLimits } from "../../model/panel-size";
import type { PdfLibraryController } from "../../model/controller";
import PdfReader from "../pdf-reader";
import { styles } from "./style.css.ts";

type Props = {
	library: PdfLibraryController;
	notes: NoteSummary[];
	referenceTitles: Record<string, string>;
	t: (key: TranslationKey) => string;
	onClose: () => void;
	onOpenNote: (note: NoteSummary) => void | Promise<void>;
};

const PdfPanel: Component<Props> = props => {
	const [editingId, setEditingId] = createSignal<string>();
	const [renameDraft, setRenameDraft] = createSignal("");
	const [canResize, setCanResize] = createSignal(false);
	let renameInput: HTMLInputElement | undefined;
	let panelElement: HTMLElement | undefined;
	let resizePointer: { pointerId: number; startX: number; startWidth: number } | undefined;

	const updateViewport = () => {
		const width = window.innerWidth;
		const limits = getPdfPanelWidthLimits(width);
		setCanResize(limits.maxWidth > limits.minWidth);
		props.library.setPanelWidth(current => clampPdfPanelWidth(current, width));
	};
	onMount(() => {
		updateViewport();
		window.addEventListener("resize", updateViewport);
		onCleanup(() => window.removeEventListener("resize", updateViewport));
	});

	const beginRename = (id: string, title: string) => {
		setEditingId(id);
		setRenameDraft(title);
		queueMicrotask(() => renameInput?.focus());
	};
	const finishRename = async (id: string) => {
		if (editingId() !== id) return;
		const saved = await props.library.renameDocument(id, renameDraft());
		if (saved) setEditingId(undefined);
	};
	const startResize = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
		if (event.button !== 0 || !canResize()) return;
		event.preventDefault();
		event.stopPropagation();
		resizePointer = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startWidth: panelElement?.getBoundingClientRect().width ?? props.library.panelWidth(),
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const resize = (event: PointerEvent) => {
		if (!resizePointer || resizePointer.pointerId !== event.pointerId) return;
		event.preventDefault();
		props.library.setPanelWidth(clampPdfPanelWidth(resizePointer.startWidth + resizePointer.startX - event.clientX, window.innerWidth));
	};
	const stopResize = (event: PointerEvent) => {
		if (!resizePointer || resizePointer.pointerId !== event.pointerId) return;
		resize(event);
		resizePointer = undefined;
	};
	const activeDocument = () => props.library.documents().find(document => document.id === props.library.openedId());
	const errorText = () => {
		const key = props.library.actionError();
		return key ? props.t(key as TranslationKey) : "";
	};

	return (
		<aside class={styles.panel} id="pdf-panel" style={{ width: `${props.library.panelWidth()}px` }} ref={panelElement}>
			<AsciiBackdrop placement="modal" />
			<Show when={canResize()}>
				<div class={styles.resizeHandle} onPointerDown={startResize} onPointerMove={resize} onPointerUp={stopResize} onPointerCancel={stopResize} onLostPointerCapture={stopResize} />
			</Show>
			<div class={styles.body}>
				<Show when={errorText()}><p class={styles.error}>{errorText()}</p></Show>
				<Show when={activeDocument()} fallback={
					<>
						<div class={styles.header}>
							<h2 class={styles.headerTitle}>{props.t("pdfLibraryTitle")}</h2>
							<button class={styles.iconButton} type="button" disabled={props.library.busy() || props.library.loading() || props.library.readFailed() || props.library.importing()} onClick={() => void props.library.selectPdf()}><Icon name="add" size={16} /></button>
							<button class={styles.iconButton} type="button" onClick={props.onClose}><Icon name="close" size={16} /></button>
						</div>
						<div class={styles.content}>
							<Show when={props.library.importSource()}>
								<form class={styles.editForm} onSubmit={event => { event.preventDefault(); void props.library.importSelected(); }}>
									<input
										class={styles.textInput}
										value={props.library.titleDraft()}
										placeholder={props.t("pdfTitlePlaceholder")}
										onInput={event => props.library.setTitleDraft(event.currentTarget.value)}
										onKeyDown={event => { if (event.key === "Escape") props.library.cancelImport(); }}
									/>
									<button class={styles.iconButton} type="submit" disabled={!props.library.titleDraft().trim() || Array.from(props.library.titleDraft()).length > 500 || props.library.importing()}><Icon name="check" size={16} /></button>
									<button class={styles.iconButton} type="button" disabled={props.library.importing()} onClick={props.library.cancelImport}><Icon name="close" size={16} /></button>
								</form>
							</Show>
							<Show when={props.library.readFailed()}>
								<p class={styles.error}>{props.t("pdfStorageFailed")}</p>
								<button class={styles.button} type="button" onClick={props.library.retryRead}>{props.t("retry")}</button>
							</Show>
							<Show when={props.library.loading()}><p class={styles.empty}>{props.t("pdfLoading")}</p></Show>
							<Show when={!props.library.loading() && !props.library.readFailed() && props.library.documents().length === 0 && !props.library.importSource()}>
								<p class={styles.empty}>{props.t("pdfLibraryEmpty")}</p>
							</Show>
							<div class={styles.list}>
								<For each={props.library.documents()}>{document =>
									<div class={styles.card}>
										<Show when={editingId() === document.id} fallback={
											<button class={styles.openDocument} type="button" onClick={() => props.library.openDocument(document.id)}>
												<span class={styles.cardIcon}><Icon name="file" size={18} /></span>
												<span class={styles.cardTitle}>{document.title}</span>
											</button>
										}>
											<form class={styles.editForm} onSubmit={event => { event.preventDefault(); void finishRename(document.id); }}>
											<input ref={renameInput} class={styles.textInput} value={renameDraft()} onInput={event => setRenameDraft(event.currentTarget.value)} onKeyDown={event => { if (event.key === "Escape") setEditingId(undefined); }} />
											<button class={styles.iconButton} type="submit" disabled={!renameDraft().trim() || Array.from(renameDraft()).length > 500 || props.library.busy()}><Icon name="check" size={15} /></button>
												<button class={styles.iconButton} type="button" onClick={() => setEditingId(undefined)}><Icon name="close" size={15} /></button>
											</form>
										</Show>
										<Show when={editingId() !== document.id}>
											<div class={styles.cardActions}>
												<Show when={document.pageCount > 0}><span class={styles.pageLabel}>{document.lastPage}/{document.pageCount}</span></Show>
												<button class={`${styles.iconButton} ${styles.cardAction}`} type="button" disabled={props.library.busy() || props.library.readFailed()} onClick={() => beginRename(document.id, document.title)}><Icon name="edit" size={14} /></button>
												<button class={`${styles.iconButton} ${styles.cardAction}`} type="button" disabled={props.library.busy() || props.library.readFailed()} onClick={() => void props.library.removeDocument(document.id)}><Icon name="delete" size={14} /></button>
											</div>
										</Show>
									</div>
								}</For>
							</div>
						</div>
					</>
				}>
					{document => <PdfReader
						open={props.library.open()}
						vaultId={props.library.activeVaultId()}
						document={document()}
						notes={props.notes}
						referenceTitles={props.referenceTitles}
						t={props.t}
						onBack={() => props.library.openDocument(undefined)}
						onClose={props.onClose}
						onOpenNote={props.onOpenNote}
						onProgress={props.library.saveProgress}
					/>}
				</Show>
			</div>
		</aside>
	);
};

export default PdfPanel;
