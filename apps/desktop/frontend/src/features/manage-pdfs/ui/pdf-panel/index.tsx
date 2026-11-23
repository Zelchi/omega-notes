import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type Component } from "solid-js";
import type { NoteSummary } from "@/entities/note";
import DeleteConfirmationDialog from "@/shared/ui/delete-confirmation-dialog";
import Button from "@/shared/ui/button";
import Icon from "@/shared/ui/icon";
import AsciiBackdrop from "@/shared/ui/ascii-backdrop";
import type { TranslationKey } from "@/shared/lib/i18n";
import { registerVisibilityAnimation } from "@/shared/ui/visibility-animation";
import { Portal } from "solid-js/web";
import { clampPdfPanelWidth, getPdfPanelWidthLimits } from "../../model/panel-size";
import type { PdfLibraryController } from "../../model/controller";
import PdfCoverThumbnail from "../pdf-cover-thumbnail";
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
	const [cardActionsVisibleId, setCardActionsVisibleId] = createSignal<string>();
	const [canResize, setCanResize] = createSignal(false);
	const [page, setPage] = createSignal(0);
	const [pageSize, setPageSize] = createSignal(1);
	const [pageJumpOpen, setPageJumpOpen] = createSignal(false);
	const [pageJumpValue, setPageJumpValue] = createSignal("");
	const [search, setSearch] = createSignal("");
	const filteredDocuments = createMemo(() => {
		const query = search().trim().toLocaleLowerCase();
		return props.library.documents().filter(document => document.title.toLocaleLowerCase().includes(query));
	});
	const pageCount = createMemo(() => Math.max(1, Math.ceil(filteredDocuments().length / pageSize())));
	const visibleDocuments = createMemo(() => filteredDocuments().slice(page() * pageSize(), (page() + 1) * pageSize()));
	createEffect(() => setPage(current => Math.min(current, pageCount() - 1)));
	const goToPage = () => {
		if (!pageJumpOpen()) return;
		const target = Number(pageJumpValue());
		setPageJumpOpen(false);
		if (Number.isInteger(target) && target >= 1 && target <= pageCount()) setPage(target - 1);
	};
	let listObserver: ResizeObserver | undefined;
	const observeList = (element: HTMLDivElement) => {
		listObserver?.disconnect();
		const update = () => setPageSize(Math.max(1, Math.floor((element.clientHeight + 8) / 90)));
		update();
		listObserver = new ResizeObserver(update);
		listObserver.observe(element);
	};
	onCleanup(() => listObserver?.disconnect());
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
		setCardActionsVisibleId(undefined);
		setEditingId(id);
		setRenameDraft(title);
		queueMicrotask(() => renameInput?.focus());
	};
	const toggleCardActions = (id: string) => setCardActionsVisibleId(current => current === id ? undefined : id);
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
	const deleteConfirmationMessage = () => {
		const target = props.library.deleteTarget();
		return target ? props.t("pdfDeleteConfirmation").replace("{title}", target.title) : "";
	};

	return (
		<>
		<aside class={styles.panel} id="pdf-panel" style={{ width: `${props.library.panelWidth()}px` }}
			ref={element => { panelElement = element; registerVisibilityAnimation(element, () => !props.library.open(), "panel"); }}>
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
							<Button class={styles.iconButton} type="button" disabled={props.library.busy() || props.library.loading() || props.library.readFailed() || props.library.importing()} onClick={() => void props.library.selectPdf()}><Icon name="add" size={16} /></Button>
							<Button class={styles.iconButton} type="button" onClick={props.onClose}><Icon name="close" size={16} /></Button>
						</div>
						<div class={styles.content}>
							<label class={styles.searchBox}>
								<Icon name="search" size={16} />
								<input class={styles.searchInput} value={search()} placeholder={props.t("searchPlaceholder")}
									onInput={event => { setSearch(event.currentTarget.value); setPage(0); }} />
							</label>
							<Show when={props.library.importSource()}>
								<form class={styles.importForm} onSubmit={event => { event.preventDefault(); void props.library.importSelected(); }}>
									<input
										class={styles.textInput}
										value={props.library.titleDraft()}
										placeholder={props.t("pdfTitlePlaceholder")}
										onInput={event => props.library.setTitleDraft(event.currentTarget.value)}
										onKeyDown={event => { if (event.key === "Escape") props.library.cancelImport(); }}
									/>
									<Button class={styles.iconButton} type="submit" disabled={!props.library.titleDraft().trim() || Array.from(props.library.titleDraft()).length > 500 || props.library.importing()}><Icon name="check" size={16} /></Button>
									<Button class={styles.iconButton} type="button" disabled={props.library.importing()} onClick={props.library.cancelImport}><Icon name="close" size={16} /></Button>
								</form>
							</Show>
							<Show when={props.library.readFailed()}>
								<p class={styles.error}>{props.t("pdfStorageFailed")}</p>
								<Button class={styles.button} type="button" onClick={props.library.retryRead}>{props.t("retry")}</Button>
							</Show>
							<Show when={props.library.loading()}><p class={styles.empty}>{props.t("pdfLoading")}</p></Show>
							<Show when={!props.library.loading() && !props.library.readFailed() && props.library.documents().length === 0 && !props.library.importSource()}>
								<p class={styles.empty}>{props.t("pdfLibraryEmpty")}</p>
							</Show>
							<div class={styles.list} ref={observeList} style={{
								"grid-template-rows": visibleDocuments().length
									? `repeat(${visibleDocuments().length}, minmax(0, min(96px, calc((100% - ${(visibleDocuments().length - 1) * 8}px) / ${visibleDocuments().length}))))`
									: undefined,
							}}>
								<For each={visibleDocuments()}>{document =>
										<div class={styles.card} onContextMenu={event => {
											if (editingId() === document.id) return;
											event.preventDefault();
											event.stopPropagation();
											toggleCardActions(document.id);
										}}>
										<Show when={editingId() === document.id} fallback={
											<Button class={styles.openDocument} type="button" onClick={() => {
												setCardActionsVisibleId(undefined);
												props.library.openDocument(document.id);
											}}>
												<PdfCoverThumbnail vaultId={props.library.activeVaultId()} document={document} />
												<span class={styles.cardTitle}>{document.title}</span>
											</Button>
										}>
											<form class={styles.editForm} onSubmit={event => { event.preventDefault(); void finishRename(document.id); }}>
											<input ref={renameInput} class={styles.textInput} value={renameDraft()} onInput={event => setRenameDraft(event.currentTarget.value)} onKeyDown={event => { if (event.key === "Escape") setEditingId(undefined); }} />
											<Button class={styles.iconButton} type="submit" disabled={!renameDraft().trim() || Array.from(renameDraft()).length > 500 || props.library.busy()}><Icon name="check" size={15} /></Button>
												<Button class={styles.iconButton} type="button" onClick={() => setEditingId(undefined)}><Icon name="close" size={15} /></Button>
											</form>
										</Show>
										<Show when={editingId() !== document.id}>
											<Show when={document.pageCount > 0}><span class={styles.pageLabel}>{document.lastPage}/{document.pageCount}</span></Show>
											<div class={styles.cardActions} classList={{
												[styles.cardActionsHitArea]: true,
												[styles.cardActionsOpen]: cardActionsVisibleId() === document.id,
											}} onClick={event => {
												if (event.target === event.currentTarget) toggleCardActions(document.id);
											}}>
												<Button class={`${styles.iconButton} ${styles.cardAction}`} classList={{ [styles.cardActionVisible]: cardActionsVisibleId() === document.id }} type="button" disabled={props.library.busy() || props.library.readFailed() || cardActionsVisibleId() !== document.id} onClick={() => beginRename(document.id, document.title)}><Icon name="edit" size={14} /></Button>
												<Button class={`${styles.iconButton} ${styles.cardAction}`} classList={{ [styles.cardActionVisible]: cardActionsVisibleId() === document.id }} type="button" disabled={props.library.busy() || props.library.readFailed() || cardActionsVisibleId() !== document.id} onClick={() => {
													setCardActionsVisibleId(undefined);
													void props.library.removeDocument(document.id);
												}}><Icon name="delete" size={14} /></Button>
											</div>
										</Show>
									</div>
								}</For>
							</div>
							<div class={styles.pagination}>
								<Button class={styles.iconButton} type="button" disabled={page() === 0} onClick={() => setPage(current => Math.max(0, current - 1))}><Icon name="back" size={16} /></Button>
								<Show when={pageJumpOpen()} fallback={
									<Button class={styles.pageJumpButton} type="button" disabled={!filteredDocuments().length} onClick={() => { setPageJumpValue(String(page() + 1)); setPageJumpOpen(true); }}>
										{filteredDocuments().length ? `${page() + 1} / ${pageCount()}` : "—"}
									</Button>
								}>
									<input class={styles.pageJumpInput} ref={element => { element.focus(); element.select(); }}
										type="number" min="1" max={pageCount()} step="1" value={pageJumpValue()}
										onInput={event => setPageJumpValue(event.currentTarget.value)} onBlur={goToPage}
										onKeyDown={event => {
											if (event.key === "Enter") { event.preventDefault(); goToPage(); }
											else if (event.key === "Escape") { event.preventDefault(); setPageJumpOpen(false); }
										}} />
								</Show>
								<Button class={styles.iconButton} type="button" disabled={page() >= pageCount() - 1} onClick={() => setPage(current => Math.min(pageCount() - 1, current + 1))}><span class={styles.forwardIcon}><Icon name="back" size={16} /></span></Button>
							</div>
						</div>
					</>
				}>
					{document => <PdfReader
						vaultId={props.library.activeVaultId()}
						documentId={props.library.openedId()!}
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
		<Portal mount={document.querySelector("[data-omega-app-shell]") ?? document.body}>
			<DeleteConfirmationDialog
				open={Boolean(props.library.deleteTarget())}
				title={props.t("pdfDeleteTitle")}
				message={deleteConfirmationMessage()}
				errorMessage={props.t("pdfDeleteFailed")}
				pending={props.library.deletePending()}
				error={props.library.deleteError()}
				t={props.t}
				onClose={props.library.cancelRemoveDocument}
				onCancel={props.library.cancelRemoveDocument}
				onConfirm={props.library.confirmRemoveDocument}
			/>
		</Portal>
		</>
	);
};

export default PdfPanel;
