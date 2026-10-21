import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { NoteDocument, NoteSummary, StudyNote } from "@/entities/note";
import type { TranslationKey } from "@/shared/lib/i18n";

export type NoteEditorProps = {
	onRegisterBeforeShutdown?: (save?: () => Promise<boolean>) => void;
	note: StudyNote;
	notes: NoteSummary[];
	loadAllNotes: () => Promise<StudyNote[]>;
	releaseLoadedNotes: () => void;
	referenceTitles: Record<string, string>;
	mode: "edit" | "view";
	t: (key: TranslationKey) => string;
	onTitleChange: (title: string) => Promise<boolean>;
	onDocumentChange: (document: NoteDocument) => void;
	onDelete?: () => void;
	deleteDisabled?: boolean;
	onOpenNote: (note: NoteSummary) => void;
	onOpenMissingNote: (target: string) => void;
};

export const useNoteEditorController = (props: NoteEditorProps) => {
	const [positioningElement, setPositioningElement] = createSignal(false);
	const [titleDraft, setTitleDraft] = createSignal(props.note.title);
	const [titleError, setTitleError] = createSignal<string>();
	const [titleErrorVisible, setTitleErrorVisible] = createSignal(false);
	const [savingTitle, setSavingTitle] = createSignal(false);
	const [titleFontSize, setTitleFontSize] = createSignal(46);
	const noteTitle = createMemo(() => props.note.title);
	let headingElement!: HTMLDivElement;
	let measureElement!: HTMLSpanElement;
	let fitFrame = 0;

	createEffect(() => {
		const error = titleError();
		setTitleErrorVisible(Boolean(error));
		if (!error) return;
		const timer = setTimeout(() => setTitleErrorVisible(false), 3000);
		onCleanup(() => clearTimeout(timer));
	});

	const fitTitle = () => {
		const availableWidth = headingElement.clientWidth;
		const measureWidth = measureElement.getBoundingClientRect().width;
		const baseFontSize = Number.parseFloat(getComputedStyle(measureElement).fontSize);
		if (!availableWidth || !measureWidth || !baseFontSize) return;

		const fitRatio = Math.min(1, (availableWidth * 0.98) / measureWidth);
		setTitleFontSize(baseFontSize * fitRatio);
	};

	const scheduleFit = () => {
		cancelAnimationFrame(fitFrame);
		fitFrame = requestAnimationFrame(fitTitle);
	};

	createEffect(() => {
		setTitleDraft(noteTitle());
		setTitleError(undefined);
		scheduleFit();
	});

	const saveTitle = async (): Promise<void> => {
		const title = titleDraft().trim();
		if (title === props.note.title) {
			setTitleDraft(props.note.title);
			setTitleError(undefined);
			return;
		}
		if (!title || savingTitle()) {
			setTitleDraft(props.note.title);
			return;
		}

		setSavingTitle(true);
		setTitleError(undefined);
		try {
			const saved = await props.onTitleChange(title);
			if (!saved) {
				setTitleError(props.t("renameFailed"));
				setTitleDraft(props.note.title);
			}
		} catch (error) {
			const code = typeof error === "string" ? error : error instanceof Error ? error.message : "";
			setTitleError(
				props.t(
					code === "DUPLICATE_TITLE"
						? "duplicateNoteTitle"
						: code.startsWith("RENAME_ROLLBACK_FAILED:")
							? "renameRecoveryFailed"
							: "renameFailed",
				),
			);
			setTitleDraft(props.note.title);
		} finally {
			setSavingTitle(false);
		}
	};

	let titleCommit: Promise<void> | undefined;
	const commitTitle = (): Promise<void> => {
		if (titleCommit) return titleCommit;
		titleCommit = saveTitle().finally(() => { titleCommit = undefined; });
		return titleCommit;
	};
	props.onRegisterBeforeShutdown?.(async () => {
		await commitTitle();
		return !titleError();
	});
	onCleanup(() => props.onRegisterBeforeShutdown?.());

	const selectTitle = (event: KeyboardEvent, target: HTMLInputElement | HTMLHeadingElement): void => {
		if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== "a") return;
		event.preventDefault();
		event.stopPropagation();

		if (target instanceof HTMLInputElement) {
			target.select();
			return;
		}

		const range = document.createRange();
		range.selectNodeContents(target);
		const selection = getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	};

	const onTitleInput = (value: string): void => {
		setTitleDraft(value);
		setTitleError(undefined);
	};

	const onEditTitleKeyDown = (event: KeyboardEvent & { currentTarget: HTMLInputElement }): void => {
		selectTitle(event, event.currentTarget);
		if (event.key === "Enter") {
			event.preventDefault();
			event.currentTarget.blur();
		} else if (event.key === "Escape") {
			setTitleDraft(props.note.title);
			setTitleError(undefined);
			event.currentTarget.blur();
		}
	};

	const onDisplayTitleKeyDown = (event: KeyboardEvent & { currentTarget: HTMLHeadingElement }): void => {
		selectTitle(event, event.currentTarget);
	};

	const resetTitle = (): void => {
		setTitleDraft(props.note.title);
		setTitleError(undefined);
	};

	onMount(() => {
		const observer = new ResizeObserver(scheduleFit);
		observer.observe(headingElement);
		observer.observe(measureElement);
		void document.fonts.ready.then(scheduleFit);
		scheduleFit();

		onCleanup(() => {
			observer.disconnect();
			cancelAnimationFrame(fitFrame);
		});
	});

	return {
		positioningElement,
		titleDraft,
		titleError,
		visibleTitleError: () => titleErrorVisible() ? titleError() : undefined,
		savingTitle,
		titleFontSize,
		setHeadingElement: (element: HTMLDivElement) => (headingElement = element),
		setMeasureElement: (element: HTMLSpanElement) => (measureElement = element),
		onTitleInput,
		onTitleBlur: commitTitle,
		onEditTitleKeyDown,
		onDisplayTitleKeyDown,
		resetTitle,
		setPositioningElement,
	};
};
