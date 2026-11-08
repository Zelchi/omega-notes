import { createEffect, createSignal, on, type Accessor } from "solid-js";
import { confirm, open } from "@/shared/lib/desktop";
import type { TranslationKey } from "@/shared/lib/i18n";
import { deletePdfDocument, importPdfDocument, maxPdfTitleLength, readPdfDocuments, renamePdfDocument, savePdfProgress, type PdfDocument } from "../api/pdfs.repository";

const sortDocuments = (documents: PdfDocument[]) => [...documents].sort((left, right) =>
	left.title.localeCompare(right.title, undefined, { sensitivity: "base" }) || left.id.localeCompare(right.id),
);

const importErrorKey = (error: unknown): string => {
	if (!(error instanceof Error)) return "pdfImportFailed";
	if (error.message === "PDF_SIZE_INVALID") return "pdfSizeInvalid";
	if (error.message === "PDF_FORMAT_INVALID") return "pdfFormatInvalid";
	if (error.message === "PDF_LIMIT_REACHED") return "pdfLimitReached";
	if (error.message === "PDF_TITLE_INVALID") return "pdfTitleInvalid";
	return "pdfImportFailed";
};

export const usePdfLibrary = (vaultId: Accessor<string | undefined>, t: (key: TranslationKey) => string) => {
	const [openPanel, setOpenPanel] = createSignal(false);
	const [panelWidth, setPanelWidth] = createSignal(560);
	const [documents, setDocuments] = createSignal<PdfDocument[]>([]);
	const [loading, setLoading] = createSignal(false);
	const [readFailed, setReadFailed] = createSignal(false);
	const [actionError, setActionError] = createSignal<string>();
	const [openedId, setOpenedId] = createSignal<string>();
	const [importSource, setImportSource] = createSignal<{ vaultId: string; revision: number; path: string }>();
	const [titleDraft, setTitleDraft] = createSignal("");
	const [importing, setImporting] = createSignal(false);
	const [busy, setBusy] = createSignal(false);
	let loadRevision = 0;
	const writes = new Map<string, Promise<void>>();
	const queuedProgress = new Map<string, { page: number; pageCount: number }>();

	const load = (id: string, revision: number) => {
		setLoading(true);
		void readPdfDocuments(id).then(saved => {
			if (revision === loadRevision && vaultId() === id) {
				setDocuments(sortDocuments(saved));
				setReadFailed(false);
			}
		}).catch(() => {
			if (revision === loadRevision && vaultId() === id) setReadFailed(true);
		}).finally(() => {
			if (revision === loadRevision) setLoading(false);
		});
	};

	createEffect(on(vaultId, id => {
		const revision = ++loadRevision;
		setOpenPanel(false);
		setDocuments([]);
		setOpenedId(undefined);
		setImportSource(undefined);
		setTitleDraft("");
		setActionError(undefined);
		setReadFailed(false);
		if (!id) { setLoading(false); return; }
		load(id, revision);
	}, { defer: false }));

	const retryRead = () => {
		const id = vaultId();
		if (!id || loading() || !readFailed()) return;
		load(id, ++loadRevision);
	};

	const selectPdf = async () => {
		const id = vaultId();
		const revision = loadRevision;
		if (!id || importing() || busy()) return;
		setActionError(undefined);
		try {
			const selected = await open({ title: t("pdfSelectFile"), filters: [{ name: "PDF", extensions: ["pdf"] }] });
			if (revision !== loadRevision || vaultId() !== id || typeof selected !== "string" || !selected) return;
			setImportSource({ vaultId: id, revision, path: selected });
			setTitleDraft("");
		} catch {
			if (revision === loadRevision && vaultId() === id) setActionError("pdfImportFailed");
		}
	};

	const cancelImport = () => {
		setImportSource(undefined);
		setTitleDraft("");
	};

	const importSelected = async () => {
		const source = importSource();
		const title = titleDraft().trim();
		if (!source || source.revision !== loadRevision || source.vaultId !== vaultId() || !title || Array.from(title).length > maxPdfTitleLength || importing()) return;
		setImporting(true);
		setActionError(undefined);
		try {
			const document = await importPdfDocument(source.vaultId, source.path, title);
			if (source.revision === loadRevision && vaultId() === source.vaultId) {
				setDocuments(current => sortDocuments([...current, document]));
				setImportSource(undefined);
				setTitleDraft("");
			}
		} catch (error) {
			if (source.revision === loadRevision && vaultId() === source.vaultId) {
				setActionError(importErrorKey(error));
			}
		} finally {
			setImporting(false);
		}
	};

	const renameDocument = async (documentId: string, title: string) => {
		const id = vaultId();
		const revision = loadRevision;
		const normalized = title.trim();
		if (!id || busy() || readFailed() || !normalized || Array.from(normalized).length > maxPdfTitleLength) return false;
		setBusy(true);
		setActionError(undefined);
		try {
			const next = await renamePdfDocument(id, documentId, normalized);
			if (revision === loadRevision && vaultId() === id) setDocuments(sortDocuments(next));
			return true;
		} catch {
			if (revision === loadRevision && vaultId() === id) setActionError("pdfRenameFailed");
			return false;
		} finally {
			setBusy(false);
		}
	};

	const removeDocument = async (documentId: string) => {
		const id = vaultId();
		const revision = loadRevision;
		const document = documents().find(entry => entry.id === documentId);
		if (!id || !document || busy() || readFailed()) return;
		let accepted: boolean;
		try {
			accepted = await confirm(t("pdfDeleteConfirmation").replace("{title}", document.title), {
				title: t("pdfDeleteTitle"), kind: "warning", okLabel: t("delete"), cancelLabel: t("cancel"),
			});
		} catch {
			if (revision === loadRevision && vaultId() === id) setActionError("pdfDeleteFailed");
			return;
		}
		if (!accepted || revision !== loadRevision || vaultId() !== id) return;
		setBusy(true);
		setActionError(undefined);
		try {
			const next = await deletePdfDocument(id, documentId);
			if (revision === loadRevision && vaultId() === id) {
				setDocuments(sortDocuments(next));
				if (openedId() === documentId) setOpenedId(undefined);
			}
		} catch {
			if (revision === loadRevision && vaultId() === id) setActionError("pdfDeleteFailed");
		} finally {
			setBusy(false);
		}
	};

	const saveProgress = (documentId: string, page: number, pageCount: number) => {
		const id = vaultId();
		const document = documents().find(entry => entry.id === documentId);
		if (!id || !document || !Number.isInteger(page) || page < 1 || !Number.isInteger(pageCount) || pageCount < page) return;
		const key = `${id}/${documentId}`;
		const previousProgress = queuedProgress.get(key);
		if (previousProgress?.page === page && previousProgress.pageCount === pageCount) return;
		queuedProgress.set(key, { page, pageCount });
		setDocuments(current => current.map(entry => entry.id === documentId ? { ...entry, lastPage: page, pageCount } : entry));
		const previous = writes.get(key) ?? Promise.resolve();
		const pending = previous.catch(() => undefined).then(() => savePdfProgress(id, documentId, page, pageCount));
		writes.set(key, pending);
		void pending.catch(() => {
			const latest = queuedProgress.get(key);
			if (latest?.page === page && latest.pageCount === pageCount) queuedProgress.delete(key);
			if (vaultId() === id) setActionError("pdfProgressFailed");
		}).finally(() => {
			if (writes.get(key) === pending) writes.delete(key);
		});
	};

	const flushSave = async () => {
		const pending = [...writes.values()];
		if (!pending.length) return true;
		const results = await Promise.allSettled(pending);
		return results.every(result => result.status === "fulfilled");
	};

	return {
		open: openPanel, setOpen: setOpenPanel, panelWidth, setPanelWidth, activeVaultId: vaultId,
		documents, loading, readFailed, retryRead, actionError, clearActionError: () => setActionError(undefined),
		openedId, openDocument: setOpenedId, importSource, titleDraft, setTitleDraft, importing, busy,
		selectPdf, cancelImport, importSelected, renameDocument, removeDocument, saveProgress, flushSave,
	};
};

export type PdfLibraryController = ReturnType<typeof usePdfLibrary>;
