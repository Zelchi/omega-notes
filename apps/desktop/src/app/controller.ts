import { isTerminalTarget } from "@/shared/lib/terminal-focus";
import { isTauriRuntime } from "@/shared/lib/tauri";
import { syncTerminalInstructions } from "@/features/gambiarra-terminal/api/terminal.repository";
import { useCliStudyBridge } from "@/features/gambiarra-terminal/model/study-bridge";
import { useCreateNoteFromLink } from "@/features/create-note-from-link";
import { useStudies } from "@/features/study-notes";
import type { StudyKind } from "@/entities/study";
import { useNoteDeletion } from "@/features/delete-note";
import { useCanvasHistory } from "@/features/undo-canvas-edit";
import { useNotes, type StudyNote } from "@/entities/note";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { translate, type TranslationKey } from "@/shared/lib/i18n";
import { useVaults } from "@/features/manage-vault";
import type { Vault } from "@/entities/vault";
import { matchesAiChatShortcut, usePreferences } from "@/features/change-preferences";
import { useWindowControls } from "./model/window-controls.controller";
import { useNoteNavigationController } from "./model/note-navigation.controller";
import { useUpdatesController } from "@/features/check-for-updates";
import { useAiChat, defaultAiProvider } from "@/features/chat-with-ai";
import { useTemporaryNoteReading } from "@/features/follow-note-link";
import { disposeSounds, prepareSounds } from "@/shared/ui/sound";

export const useAppController = () => {
	const vaults = useVaults();
	const preferences = usePreferences();
	const notes = useNotes(vaults.activeVaultId, preferences.gambiarraEnabled);
	const t = (key: TranslationKey) => translate(preferences.language(), key);
	let saveNoteTitle: (() => Promise<boolean>) | undefined;
	let saveAiChats: (() => Promise<boolean>) | undefined;
	let saveStudies: (() => Promise<boolean>) | undefined;
	const [vaultActionPending, setVaultActionPending] = createSignal(false);
	const beforeAiRequest = async () => {
		if (notes.resolvingConflict()) return false;
		if (saveNoteTitle && !(await saveNoteTitle())) return false;
		if (!(await notes.flushSave())) return false;
		return saveAiChats ? saveAiChats() : true;
	};
	const beforeShutdown = async () => {
		if (!(await beforeAiRequest())) return false;
		return saveStudies ? saveStudies() : true;
	};
	const windowControls = useWindowControls(beforeShutdown, t);
	const navigation = useNoteNavigationController({
		notes,
		activeVaultId: vaults.activeVaultId,
		centerCanvasOnLaunch: preferences.centerCanvasOnLaunch,
		beforeNavigate: async () => saveNoteTitle ? saveNoteTitle() : true,
		t,
	});
	const aiChat = useAiChat({
		provider: defaultAiProvider, enabled: preferences.aiFeaturesEnabled, vaultId: vaults.activeVaultId,
		notes: notes.notes, currentNote: () => navigation.route() === "note" ? navigation.selectedNote() : undefined, notesReady: () => !notes.loading() && notes.hasLoadedVault(), beforeSend: beforeAiRequest, applyLinkedMentions: notes.applyLinkedMentions, t
	});
	const [gambiarraChatOpen, setGambiarraChatOpen] = createSignal(false);
	const chatAvailable = () => preferences.aiFeaturesEnabled() || preferences.gambiarraEnabled();
	const chatOpen = () => preferences.gambiarraEnabled() ? gambiarraChatOpen() : aiChat.open();
	const setChatOpen = (value: boolean | ((open: boolean) => boolean)) => {
		const open = typeof value === "function" ? value(chatOpen()) : value;
		if (preferences.gambiarraEnabled()) setGambiarraChatOpen(open && !!vaults.activeVaultId());
		else aiChat.setOpen(open);
	};
	let terminalVault = vaults.activeVaultId(), terminalMode = preferences.gambiarraEnabled();
	createEffect(() => {
		const vault = vaults.activeVaultId(), mode = preferences.gambiarraEnabled();
		if (vault !== terminalVault || mode !== terminalMode) { setGambiarraChatOpen(false); aiChat.setOpen(false); }
		terminalVault = vault; terminalMode = mode;
		if (isTauriRuntime()) void syncTerminalInstructions(vault, mode).catch(error => console.warn("Could not update vault AI instructions", error));
	});
	const cliStudies = useCliStudyBridge({ vaultId: vaults.activeVaultId, enabled: preferences.gambiarraEnabled, beforeSend: beforeAiRequest });
	const studyConnected = () => preferences.gambiarraEnabled() || (aiChat.status().connected && aiChat.status().authenticated);
	const studyAiBusy = () => preferences.gambiarraEnabled() ? cliStudies.busy() : aiChat.pending() || aiChat.sending() || aiChat.chat().busy;
	const canGenerateStudy = () => chatAvailable() && !notes.loading() && !vaultActionPending() && !studyAiBusy() &&
		(preferences.gambiarraEnabled() ? isTauriRuntime() : aiChat.ready() && studyConnected());
	const studies = useStudies({
		vaultId: vaults.activeVaultId, notes: notes.notes,
		currentNote: () => navigation.route() === "note" ? navigation.selectedNote() : undefined,
		aiEnabled: chatAvailable, normalAiMode: () => !preferences.gambiarraEnabled(), canGenerate: canGenerateStudy,
		aiConnected: studyConnected,
		onConnect: () => aiChat.setOpen(true),
		requestText: (...args) => preferences.gambiarraEnabled() ? cliStudies.requestText(...args) : aiChat.requestText(...args),
		describeAiError: aiChat.describeError,
		onOpenNote: navigation.openNote, t,
	});
	const [cliStudyReturn, setCliStudyReturn] = createSignal<StudyKind>();
	let cliStudyVault = vaults.activeVaultId();
	createEffect(() => {
		const vault = vaults.activeVaultId(), mode = preferences.gambiarraEnabled();
		const request = cliStudies.request(), kind = studies.activeRequestKind();
		if (!mode || vault !== cliStudyVault) setCliStudyReturn(undefined);
		cliStudyVault = vault;
		if (mode && request && kind) setCliStudyReturn(kind);
	});
	const confirmCliStudy = () => {
		const kind = cliStudyReturn();
		if (!preferences.gambiarraEnabled() || !vaults.activeVaultId() || !kind) return;
		setChatOpen(false);
		studies.show(kind);
	};
	saveAiChats = aiChat.flushSave;
	saveStudies = studies.flushSave;
	const [settingsOpen, setSettingsOpen] = createSignal(false);
	const canvasHistory = useCanvasHistory({
		vaultId: vaults.activeVaultId,
		notes,
		setLayout: preferences.setCanvasLayout,
		enabled: () => navigation.route() === "canvas" && navigation.mode() === "edit" &&
			!notes.loading() && !navigation.nameDialog() && !vaults.dialogOpen() && !settingsOpen() &&
			!chatOpen() && !noteDeletion.target() && !noteDeletion.pending() && !vaultActionPending() && !updates.installing() && !notes.loadIssues().length,
	});
	const noteDeletion = useNoteDeletion({
		vaultId: vaults.activeVaultId,
		notes: notes.notes,
		blocked: () => notes.loading() || canvasHistory.pending() || vaultActionPending() || navigation.navigating() || updates.installing(),
		beforeDelete: async () => {
			if (saveNoteTitle && !(await saveNoteTitle())) return false;
			return notes.flushSave();
		},
		remove: canvasHistory.remove,
		onDeleted: () => {
			if (navigation.route() === "note" && !navigation.selectedNote()) void navigation.backToCanvas();
		},
	});
	const noteReferences = useCreateNoteFromLink({
		notes, vaultId: vaults.activeVaultId, sourceNoteId: () => navigation.selectedNote()?.id,
		enabled: () => !notes.loading() && !vaultActionPending() && !canvasHistory.pending() &&
			!navigation.nameDialog() && !vaults.dialogOpen() && !noteDeletion.target() && !noteDeletion.pending() && !updates.installing(),
		beforeOpen: beforeShutdown, onOpenNote: navigation.openNote,
	});
	const updates = useUpdatesController(beforeShutdown, () =>
		!studies.open() && !noteDeletion.target() && !noteDeletion.pending() && !navigation.nameDialog() && !navigation.navigating() && !vaults.dialogOpen() && !vaults.saving() && !vaultActionPending() && !canvasHistory.pending() && !noteReferences.pending(),
	);
	const temporaryReading = useTemporaryNoteReading({
		mode: navigation.mode,
		noteId: () => navigation.selectedNote()?.id,
		enabled: () => navigation.route() === "note" && Boolean(navigation.selectedNote()) &&
			!navigation.nameDialog() && !vaults.dialogOpen() && !settingsOpen() && !studies.open() && !updates.installing(),
	});


	const [studyReturn, setStudyReturn] = createSignal<{ vaultId: string; kind: StudyKind }>();
	let studyNavigationDisposed = false, studyNavigationRevision = 0;
	createEffect(() => {
		vaults.activeVaultId(); chatAvailable();
		++studyNavigationRevision; setStudyReturn(undefined);
	});
	onCleanup(() => { studyNavigationDisposed = true; });
	const openStudyNote = async (note: StudyNote): Promise<void> => {
		const vaultId = vaults.activeVaultId(), kind = studies.kind(), revision = studyNavigationRevision;
		if (!vaultId || !chatAvailable()) return;
		setStudyReturn(undefined); studies.close();
		try { await navigation.openNote(note); }
		catch { /* Failed navigation returns to the preserved study below. */ }
		if (studyNavigationDisposed || revision !== studyNavigationRevision || vaultId !== vaults.activeVaultId() ||
			!chatAvailable() || studies.open()) return;
		if (navigation.route() === "note" && navigation.selectedNote()?.id === note.id) setStudyReturn({ vaultId, kind });
		else studies.show(kind);
	};
	createEffect(() => {
		const target = studyReturn(), vaultId = vaults.activeVaultId(), enabled = chatAvailable();
		if (!target) return;
		if (!enabled || vaultId !== target.vaultId || studies.open()) { setStudyReturn(undefined); return; }
		if (navigation.route() !== "canvas" || navigation.navigating() || vaults.dialogOpen() || settingsOpen() ||
			navigation.nameDialog() || noteDeletion.target() || noteDeletion.pending() || updates.installing()) return;
		const frame = requestAnimationFrame(() => {
			if (studyNavigationDisposed || studyReturn() !== target || vaults.activeVaultId() !== target.vaultId ||
				!chatAvailable() || navigation.route() !== "canvas") return;
			setStudyReturn(undefined); studies.show(target.kind);
		});
		onCleanup(() => cancelAnimationFrame(frame));
	});

	onMount(() => {
		prepareSounds();
		onCleanup(disposeSounds);
		const preventNativeTab = (event: KeyboardEvent) => {
			if (event.key === "Tab" && !isTerminalTarget(event.target)) event.preventDefault();
		};
		addEventListener("keydown", preventNativeTab, true);
		onCleanup(() => removeEventListener("keydown", preventNativeTab, true));

		const onAiShortcut = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing || !chatAvailable() || !vaults.activeVaultId() ||
				navigation.nameDialog() || vaults.dialogOpen() || settingsOpen() || studies.open() || noteDeletion.target() || noteDeletion.pending() || updates.installing()) return;
			if (!matchesAiChatShortcut(event, preferences.aiChatShortcut())) return;
			event.preventDefault();
			event.stopPropagation();
			if (!event.repeat) setChatOpen((open) => !open);
		};
		addEventListener("keydown", onAiShortcut, true);
		onCleanup(() => removeEventListener("keydown", onAiShortcut, true));

		const onShortcut = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || isTerminalTarget(event.target)) return;
			if (vaults.dialogOpen()) {
				if (!vaultActionPending() && !vaults.saving()) vaults.closeDialog();
			} else if (settingsOpen()) {
				setSettingsOpen(false);
			} else if (chatOpen()) {
				setChatOpen(false);
			} else {
				navigation.handleEscape();
			}
		};
		addEventListener("keydown", onShortcut);
		onCleanup(() => removeEventListener("keydown", onShortcut));
	});

	createEffect(() => {
		document.documentElement.lang = t("locale");
		const appName = t("appName");
		const title = navigation.route() === "note" ? navigation.selectedNote()?.title : undefined;
		document.title = title ? `${title} · ${appName}` : appName;
	});

	const selectVault = async (vault: Vault): Promise<void> => {
		if (vaultActionPending() || canvasHistory.pending() || noteReferences.pending() || navigation.navigating() || navigation.nameDialog()) return;
		setVaultActionPending(true);
		try {
			if (!(await beforeShutdown())) return;
			const previousId = vaults.activeVaultId();
			await vaults.select(vault);
			if (previousId !== vaults.activeVaultId()) navigation.resetToCanvas();
		} finally {
			setVaultActionPending(false);
		}
	};
	const openAiNote = async (note: StudyNote): Promise<void> => {
		const vaultId = vaults.activeVaultId();
		if (!vaultId || !(await beforeShutdown()) || vaultId !== vaults.activeVaultId()) return;
		const current = notes.notes().find((item) => item.id === note.id);
		if (!current) return;
		await navigation.openNote(current);
	};
	const createVault = async (name: string): Promise<boolean> => {
		if (vaultActionPending() || canvasHistory.pending() || noteReferences.pending() || navigation.navigating() || navigation.nameDialog()) return false;
		setVaultActionPending(true);
		try {
			if (!(await beforeShutdown())) return false;
			return await vaults.create(name);
		} finally {
			setVaultActionPending(false);
		}
	};
	const renameVault = async (vault: Vault, name: string): Promise<boolean> => {
		if (vaultActionPending() || canvasHistory.pending() || noteReferences.pending() || navigation.navigating() || navigation.nameDialog()) return false;
		setVaultActionPending(true);
		try {
			if (!(await beforeShutdown())) return false;
			return await vaults.rename(vault, name);
		} finally {
			setVaultActionPending(false);
		}
	};
	const deleteVault = async (vault: Vault): Promise<boolean> => {
		if (vaultActionPending() || canvasHistory.pending() || noteReferences.pending() || navigation.navigating() || navigation.nameDialog()) return false;
		setVaultActionPending(true);
		try {
			if (!(await beforeShutdown())) return false;
			return await vaults.remove(vault);
		} finally {
			setVaultActionPending(false);
		}
	};
	return {
		studies, canGenerateStudy, studyConnected, studyAiBusy, cliStudies, cliStudyReturn, confirmCliStudy, openStudyNote,
		noteDeletion,
		noteReferences,
		canvasHistory,
		aiChat, chatOpen, setChatOpen, chatAvailable,
		openAiNote,
		updates,
		registerBeforeShutdown: (save?: () => Promise<boolean>) => { saveNoteTitle = save; },
		vaults,
		notes,
		preferences,
		windowControls,
		navigation,
		temporaryReading,
		settingsOpen,
		setSettingsOpen,
		vaultActionPending,
		selectVault,
		createVault,
		renameVault,
		deleteVault,
		t,
	};
};
