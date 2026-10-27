import { isTerminalTarget } from "@/shared/lib/terminal-focus";
import { isDesktopRuntime, withCancellableReadsPaused } from "@/shared/lib/desktop";
import type { CliStudyBridge } from "@/features/gambiarra-terminal/model/study-bridge";
import { useCreateNoteFromLink } from "@/features/create-note-from-link";
import type { StudiesController } from "@/features/study-notes/model/controller";
import type { StudyKind } from "@/entities/study";
import { useNoteDeletion } from "@/features/delete-note/model/controller";
import { useCanvasHistory } from "@/features/undo-canvas-edit";
import { useNotes, type NoteSummary } from "@/entities/note";
import { createEffect, createSignal, getOwner, onCleanup, onMount, runWithOwner } from "solid-js";
import { translate, type TranslationKey } from "@/shared/lib/i18n";
import { configureTrayMenu, onTrayAction } from "./api/tray.repository";
import { setWindowBackgroundColor, showMainWindowIfHidden } from "./api/window.repository";
import { useVaults } from "@/features/manage-vault/model/vaults.controller";
import type { Vault } from "@/entities/vault";
import { matchesAiChatShortcut } from "@/features/change-preferences/model/ai-chat-shortcut";
import { matchesCanvasLayoutShortcut } from "@/features/change-preferences/model/canvas-layout-shortcut";
import { usePreferences } from "@/features/change-preferences/model/preferences.controller";
import { useWindowControls } from "./model/window-controls.controller";
import { useNoteNavigationController } from "./model/note-navigation.controller";
import { useUpdatesController } from "@/features/check-for-updates/model/updates.controller";
import type { AiChatController } from "@/features/chat-with-ai/model/ai-chat.controller";
import { useTemporaryNoteReading } from "@/features/temporary-note-reading";
import { disposeSounds, prepareSounds } from "@/shared/ui/sound";
import { useKanban } from "@/features/manage-kanban/model/controller";
import { usePomodoro } from "@/features/pomodoro/model/controller";
import { useLofiPlayer } from "@/features/lofi-player/model/player";
import { useGambiarraTerminal } from "@/features/gambiarra-terminal/model/controller";
import { syncTerminalInstructions } from "@/features/gambiarra-terminal/api/terminal.repository";
import type { SettingsCategory } from "@/features/change-preferences/model/preferences";

const createLazyController = <T,>(loadModule: () => Promise<() => T>) => {
	const owner = getOwner();
	const [controller, setController] = createSignal<T>();
	let pending: Promise<T | undefined> | undefined;
	let disposed = false;
	const load = (): Promise<T | undefined> => {
		const current = controller();
		if (current) return Promise.resolve(current);
		if (pending) return pending;
		if (!owner || disposed) return Promise.resolve(undefined);
		let request: Promise<T | undefined>;
		request = Promise.resolve().then(loadModule).then((create) => {
			if (disposed) return undefined;
			const value = runWithOwner(owner, create);
			if (value !== undefined) setController(() => value);
			return value;
		}).finally(() => {
			if (pending === request) pending = undefined;
		});
		pending = request;
		return request;
	};
	onCleanup(() => { disposed = true; });
	return { controller, load };
};

export const useAppController = () => {
	const lofiPlayer = useLofiPlayer();
	const vaults = useVaults();
	const preferences = usePreferences();
	const kanban = useKanban(vaults.activeVaultId);
	const pomodoro = usePomodoro(vaults.activeVaultId, () => {
		void showMainWindowIfHidden().catch(console.error);
	});
	createEffect(() => lofiPlayer.setPomodoroMuted(pomodoro.muteLofi()));
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
		if (!(await kanban.flushSave())) return false;
		if (!(await pomodoro.flushSave())) return false;
		return saveStudies ? saveStudies() : true;
	};
	const windowControls = useWindowControls(beforeShutdown, t);
	createEffect(() => {
		void configureTrayMenu({
			show: t("trayShow"),
			hide: t("trayHide"),
			start: t("trayPomodoroStart"),
			pause: t("trayPomodoroPause"),
			reset: t("trayPomodoroReset"),
			musicPlay: t("musicPlayerPlay"),
			musicPause: t("musicPlayerPause"),
			musicNext: t("musicPlayerNext"),
			update: t("updateAction"),
			exit: t("trayExit"),
		}, pomodoro.running(), lofiPlayer.isActive()).catch(console.error);
	});
	const navigation = useNoteNavigationController({
		notes,
		activeVaultId: vaults.activeVaultId,
		centerCanvasOnLaunch: preferences.centerCanvasOnLaunch,
		beforeNavigate: async () => saveNoteTitle ? saveNoteTitle() : true,
		t,
	});
	createEffect(() => {
		const surface = navigation.route() === "canvas" ? "--board" : "--canvas";
		preferences.theme();
		const color = getComputedStyle(document.documentElement).getPropertyValue(surface).trim();
		if (isDesktopRuntime() && color) void setWindowBackgroundColor(color).catch(console.error);
	});
	const aiChatLazy = createLazyController<AiChatController>(() =>
		Promise.all([
			import("@/features/chat-with-ai/model/ai-chat.controller"),
			import("@/features/chat-with-ai/api/providers"),
		]).then(([controller, providers]) => () => controller.useAiChat({
			provider: providers.defaultAiProvider, enabled: preferences.aiFeaturesEnabled, vaultId: vaults.activeVaultId,
			notes: notes.notes, currentNote: () => navigation.route() === "note" ? navigation.selectedNote() : undefined,
			notesReady: () => !notes.loading() && notes.hasLoadedVault(), beforeSend: beforeAiRequest,
			applyLinkedMentions: notes.applyLinkedMentions, t,
		})),
	);
	createEffect(() => {
		if (preferences.aiFeaturesEnabled()) void aiChatLazy.load().catch(error => console.warn("Could not load AI chat", error));
	});
	const aiChatFallbacks: Record<string, unknown> = {
		canUndoLinks: () => false,
		providers: [],
		installedProviders: () => ({ codex: false, claude: false, opencode: false, antigravity: false }),
		checkingProviders: () => false,
		open: () => false,
		status: () => ({ connected: false, authenticated: false }),
		sending: () => false,
		resetting: () => false,
		cleanupError: () => undefined,
		models: () => [],
		selectedModel: () => undefined,
		selectedEffort: () => undefined,
		fastAvailable: () => false,
		pending: () => false,
		ready: () => false,
		error: () => undefined,
		chat: () => ({ messages: [], referenceTitles: {}, draft: "", model: "", effort: "", fast: false, busy: false }),
	};
	const aiChat = new Proxy({} as AiChatController, {
		get: (_target, property) => {
			const current = aiChatLazy.controller();
			if (current) {
				const value = Reflect.get(current, property, current);
				return typeof value === "function" ? value.bind(current) : value;
			}
			if (property === "provider") return undefined;
			if (property === "setOpen") return (value: boolean | ((open: boolean) => boolean)) => {
				const open = typeof value === "function" ? value(false) : value;
				if (!open) return;
				if (!preferences.aiFeaturesEnabled()) return;
				void aiChatLazy.load().then(controller => controller?.setOpen(true))
					.catch(error => console.warn("Could not open AI chat", error));
			};
			if (property === "flushSave") return () => Promise.resolve(true);
			if (property === "describeError") return (_failure: unknown) => t("aiRequestFailed");
			if (property in aiChatFallbacks) return aiChatFallbacks[property as string];
			return (...args: unknown[]) => {
				const request = aiChatLazy.load().then(controller => {
					if (!controller) return undefined;
					const action = Reflect.get(controller, property, controller);
					return typeof action === "function" ? action.apply(controller, args) : undefined;
				});
				if (property === "requestText") return request.then(value => value ?? Promise.reject(Error("AI_DISCONNECTED")));
				return request.catch(error => console.warn("Could not run AI chat action", error));
			};
		},
	});
	const [gambiarraChatOpen, setGambiarraChatOpen] = createSignal(false);
	const gambiarraTerminal = useGambiarraTerminal({
		vaultId: vaults.activeVaultId,
		enabled: preferences.gambiarraEnabled,
		onCliExit: () => setGambiarraChatOpen(false),
	});
	const chatAvailable = () => preferences.aiFeaturesEnabled() || preferences.gambiarraEnabled();
	const chatOpen = () => preferences.gambiarraEnabled() ? gambiarraChatOpen() : aiChat.open();
	const setChatOpen = (value: boolean | ((open: boolean) => boolean)) => {
		const open = typeof value === "function" ? value(chatOpen()) : value;
		if (open) hideOtherWindows("chat");
		if (preferences.gambiarraEnabled()) setGambiarraChatOpen(open && !!vaults.activeVaultId());
		else aiChat.setOpen(open);
	};
	const toggleKanban = () => {
		if (!import.meta.env.DEV || !vaults.activeVaultId()) return;
		if (!kanban.open()) hideOtherWindows("kanban");
		kanban.setOpen((open) => !open);
	};
	const togglePomodoro = () => {
		if (!vaults.activeVaultId()) return;
		if (!pomodoro.open()) hideOtherWindows("pomodoro");
		pomodoro.setOpen((open) => !open);
	};
	let terminalVault = vaults.activeVaultId(), terminalMode = preferences.gambiarraEnabled(), terminalSyncRevision = 0;
	createEffect(() => {
		const vault = vaults.activeVaultId(), mode = preferences.gambiarraEnabled();
		const revision = ++terminalSyncRevision;
		if (vault !== terminalVault || mode !== terminalMode) { setGambiarraChatOpen(false); aiChat.setOpen(false); }
		terminalVault = vault; terminalMode = mode;
		if (isDesktopRuntime()) void Promise.resolve().then(() => {
			if (revision !== terminalSyncRevision) return;
			return syncTerminalInstructions(vault, mode);
		}).catch(error => console.warn("Could not update vault AI instructions", error));
	});
	const cliStudiesLazy = createLazyController<CliStudyBridge>(() =>
		import("@/features/gambiarra-terminal/model/study-bridge").then(({ useCliStudyBridge }) => () => useCliStudyBridge({
			vaultId: vaults.activeVaultId, enabled: preferences.gambiarraEnabled, beforeSend: beforeAiRequest,
		})),
	);
	createEffect(() => {
		if (preferences.gambiarraEnabled()) void cliStudiesLazy.load().catch(error => console.warn("Could not load CLI study support", error));
	});
	const cliStudies = new Proxy({} as CliStudyBridge, {
		get: (_target, property) => {
			const current = cliStudiesLazy.controller();
			if (current) {
				const value = Reflect.get(current, property, current);
				return typeof value === "function" ? value.bind(current) : value;
			}
			if (property === "request") return () => undefined;
			if (property === "busy") return () => false;
			if (property === "requestText") return (...args: Parameters<CliStudyBridge["requestText"]>) =>
				cliStudiesLazy.load().then(controller => controller ? controller.requestText(...args) : Promise.reject(Error("AI_DISCONNECTED")));
			return undefined;
		},
	});
	const studyConnected = () => preferences.gambiarraEnabled() || (aiChat.status().connected && aiChat.status().authenticated);
	const studyAiBusy = () => preferences.gambiarraEnabled() ? cliStudies.busy() : aiChat.pending() || aiChat.sending() || aiChat.chat().busy;
	const canGenerateStudy = () => chatAvailable() && !notes.loading() && !vaultActionPending() && !studyAiBusy() &&
		(preferences.gambiarraEnabled() ? isDesktopRuntime() : aiChat.ready() && studyConnected());
	const studiesLazy = createLazyController<StudiesController>(() =>
		import("@/features/study-notes/model/controller").then(({ useStudies }) => () => useStudies({
			vaultId: vaults.activeVaultId, noteSummaries: notes.notes,
			currentNote: () => navigation.route() === "note" ? navigation.selectedNote() : undefined,
			aiEnabled: chatAvailable, normalAiMode: () => !preferences.gambiarraEnabled(), canGenerate: canGenerateStudy,
			aiConnected: studyConnected,
			requestText: (...args) => preferences.gambiarraEnabled() ? cliStudies.requestText(...args) : aiChat.requestText(...args),
			describeAiError: failure => aiChat.describeError(failure),
			onOpenNote: navigation.openNote, t,
		})),
	);
	const studies = new Proxy({} as StudiesController, {
		get: (_target, property) => {
			if (property === "close") return () => studiesLazy.controller()?.close();
			if (property === "open") return () => studiesLazy.controller()?.open() ?? false;
			if (property === "show") return (kind: StudyKind) => {
				if (!chatAvailable()) return;
				void studiesLazy.load().then(controller => {
					if (controller && vaults.activeVaultId()) {
						hideOtherWindows("study");
						controller.show(kind);
					}
				}).catch(error => console.warn("Could not open study tools", error));
			};
			const current = studiesLazy.controller();
			if (current) {
				const value = Reflect.get(current, property, current);
				return typeof value === "function" ? value.bind(current) : value;
			}
			if (property === "activeRequestKind") return () => undefined;
			if (property === "kind") return () => "flashcards";
			if (property === "flushSave") return () => Promise.resolve(true);
			if (property === "canRandom") return () => notes.notes().some(note => note.id !== navigation.selectedNote()?.id);
			if (property === "randomNote") return () => {
				const loaded = studiesLazy.controller();
				if (loaded) return loaded.randomNote();
				const selectedId = navigation.selectedNote()?.id;
				const candidates = notes.notes().filter(note => note.id !== selectedId);
				if (!candidates.length) return;
				void navigation.openNote(candidates[Math.floor(Math.random() * candidates.length)]);
			};
			return undefined;
		},
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
	saveAiChats = () => aiChat.flushSave();
	saveStudies = () => studies.flushSave();
	const [settingsOpen, setSettingsOpen] = createSignal(false);
	const [settingsCategory, setSettingsCategory] = createSignal<SettingsCategory>("preferences");
	const [confirmGambiarra, setConfirmGambiarra] = createSignal(false);
	const toggleSettings = () => {
		if (settingsOpen()) {
			setSettingsOpen(false);
			return;
		}
		hideOtherWindows("settings");
		setSettingsOpen(true);
	};
	const canvasHistory = useCanvasHistory({
		vaultId: vaults.activeVaultId,
		notes,
		setLayout: preferences.setCanvasLayout,
		enabled: () => navigation.route() === "canvas" && navigation.mode() === "edit" &&
			!notes.loading() && !navigation.nameDialogVisible() && !vaults.dialogOpen() && !settingsOpen() &&
			!chatOpen() && !noteDeletion.open() && !noteDeletion.pending() && !vaultActionPending() && !updates.installing() && !notes.loadIssues().length,
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
			!navigation.nameDialogVisible() && !vaults.dialogOpen() && !noteDeletion.open() && !noteDeletion.pending() && !updates.installing(),
		beforeOpen: beforeShutdown, onOpenNote: navigation.openNote,
	});
	const updates = useUpdatesController(beforeShutdown, () =>
		!studies.open() && !noteDeletion.target() && !noteDeletion.pending() && !navigation.nameDialog() && !navigation.navigating() && !vaults.dialogOpen() && !vaults.saving() && !vaultActionPending() && !canvasHistory.pending() && !noteReferences.pending(),
	);
	const temporaryReading = useTemporaryNoteReading({
		mode: navigation.mode,
		noteId: () => navigation.selectedNote()?.id,
		enabled: () => navigation.route() === "note" && Boolean(navigation.selectedNote()) &&
			!navigation.nameDialogVisible() && !vaults.dialogOpen() && !settingsOpen() && !studies.open() && !updates.installing(),
	});
	const hideOtherWindows = (keep: "chat" | "kanban" | "pomodoro" | "settings" | "vault" | "study" | "note-name" | "delete") => {
		if (keep !== "chat") setChatOpen(false);
		if (keep !== "kanban") kanban.setOpen(false);
		if (keep !== "pomodoro") pomodoro.setOpen(false);
		if (keep !== "settings") setSettingsOpen(false);
		if (keep !== "vault") vaults.closeDialog();
		if (keep !== "study") studies.close();
		if (keep !== "note-name") navigation.hideNameDialog();
		if (keep !== "delete") noteDeletion.close();
	};
	const toggleVaultDialog = () => {
		if (vaults.dialogOpen()) { vaults.closeDialog(); return; }
		hideOtherWindows("vault");
		vaults.openDialog();
	};
	const createNoteAtCanvas = () => {
		hideOtherWindows("note-name");
		return navigation.createNoteAtCanvas();
	};
	const requestRenameNote = (note: NoteSummary) => {
		hideOtherWindows("note-name");
		void navigation.requestRenameNote(note);
	};
	const requestDeleteNote = (note: NoteSummary) => {
		hideOtherWindows("delete");
		return noteDeletion.request(note);
	};


	const [studyReturn, setStudyReturn] = createSignal<{ vaultId: string; kind: StudyKind }>();
	let studyNavigationDisposed = false, studyNavigationRevision = 0;
	createEffect(() => {
		vaults.activeVaultId(); chatAvailable();
		++studyNavigationRevision; setStudyReturn(undefined);
	});
	onCleanup(() => { studyNavigationDisposed = true; });
	const openStudyNote = async (note: NoteSummary): Promise<void> => {
		const vaultId = vaults.activeVaultId(), kind = studies.kind(), revision = studyNavigationRevision;
		if (!vaultId || !chatAvailable()) return;
		setStudyReturn(undefined); studies.close();
		try { await navigation.openNote(note); }
		catch { /* Se a navegação falhar, retorna ao estudo preservado abaixo. */ }
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
			navigation.nameDialogVisible() || noteDeletion.open() || noteDeletion.pending() || updates.installing()) return;
		const frame = requestAnimationFrame(() => {
			if (studyNavigationDisposed || studyReturn() !== target || vaults.activeVaultId() !== target.vaultId ||
				!chatAvailable() || navigation.route() !== "canvas") return;
			setStudyReturn(undefined); studies.show(target.kind);
		});
		onCleanup(() => cancelAnimationFrame(frame));
	});

	const toggleTrayMusic = () => {
		if (lofiPlayer.isActive()) { lofiPlayer.toggleMute(); return; }
		if (lofiPlayer.muted()) lofiPlayer.toggleMute();
		lofiPlayer.togglePlayback();
	};

	onMount(() => {
		prepareSounds();
		onCleanup(disposeSounds);
		let active = true;
		let unlistenTray: (() => void) | undefined;
		void onTrayAction(action => {
			switch (action) {
				case "pomodoro-toggle": pomodoro.running() ? pomodoro.pause() : pomodoro.start(); break;
				case "pomodoro-reset": pomodoro.reset(); break;
				case "music-play-pause": toggleTrayMusic(); break;
				case "music-next": lofiPlayer.nextSource(); break;
				case "update": void updates.activate(); break;
				case "exit": void windowControls.exit(); break;
			}
		}).then(unlisten => { if (active) unlistenTray = unlisten; else unlisten(); }).catch(console.error);
		onCleanup(() => { active = false; unlistenTray?.(); });
		const preventNativeTab = (event: KeyboardEvent) => {
			if (event.key === "Tab" && !isTerminalTarget(event.target)) event.preventDefault();
		};
		addEventListener("keydown", preventNativeTab, true);
		onCleanup(() => removeEventListener("keydown", preventNativeTab, true));

		const onKanbanShortcut = (event: KeyboardEvent) => {
			if (!import.meta.env.DEV || event.defaultPrevented || event.isComposing || isTerminalTarget(event.target) || !vaults.activeVaultId()
				|| navigation.nameDialogVisible() || vaults.dialogOpen() || settingsOpen() || studies.open()
				|| noteDeletion.open() || noteDeletion.pending() || updates.installing()) return;
			if (event.metaKey || event.getModifierState("AltGraph") || event.code !== "KeyB"
				|| !event.ctrlKey || event.altKey || !event.shiftKey) return;
			event.preventDefault();
			event.stopPropagation();
			if (!event.repeat) toggleKanban();
		};
		addEventListener("keydown", onKanbanShortcut, true);
		onCleanup(() => removeEventListener("keydown", onKanbanShortcut, true));

		const onAiShortcut = (event: KeyboardEvent) => {
			if (event.defaultPrevented || event.isComposing || !chatAvailable() || !vaults.activeVaultId() ||
				navigation.nameDialogVisible() || vaults.dialogOpen() || settingsOpen() || studies.open() || noteDeletion.open() || noteDeletion.pending() || updates.installing()) return;
			if (!matchesAiChatShortcut(event, preferences.aiChatShortcut())) return;
			event.preventDefault();
			event.stopPropagation();
			if (!event.repeat) setChatOpen((open) => !open);
		};
		addEventListener("keydown", onAiShortcut, true);
		onCleanup(() => removeEventListener("keydown", onAiShortcut, true));

		const onCanvasLayoutShortcut = (event: KeyboardEvent) => {
			if (!vaults.activeVaultId() || navigation.route() !== "canvas" || settingsOpen() || chatOpen() ||
				kanban.open() || pomodoro.open() || vaults.dialogOpen() || studies.open() || noteDeletion.open() ||
				noteDeletion.pending() || navigation.nameDialogVisible() || updates.installing()) return;
			if (!matchesCanvasLayoutShortcut(event, preferences.canvasLayoutShortcut())) return;
			event.preventDefault();
			event.stopPropagation();
			if (!event.repeat) preferences.setCanvasLayout(preferences.canvasLayout() === "static" ? "dynamic" : "static");
		};
		addEventListener("keydown", onCanvasLayoutShortcut, true);
		onCleanup(() => removeEventListener("keydown", onCanvasLayoutShortcut, true));

		const onShortcut = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || isTerminalTarget(event.target)) return;
			if (vaults.dialogOpen()) {
				vaults.closeDialog();
			} else if (settingsOpen()) {
				setSettingsOpen(false);
			} else if (chatOpen()) {
				setChatOpen(false);
			} else if (kanban.open()) {
				kanban.setOpen(false);
			} else if (pomodoro.open()) {
				pomodoro.setOpen(false);
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
		const selected = navigation.selectedNote();
		const title = navigation.route() === "note" && selected
			? notes.notes().find((note) => note.id === selected.id)?.displayTitle ?? selected.title
			: undefined;
		document.title = title ? `${title} · ${appName}` : appName;
	});

	const selectVault = async (vault: Vault): Promise<void> => {
		if (vaultActionPending() || canvasHistory.mutating() || noteReferences.pending() || navigation.savingName()) return;
		setVaultActionPending(true);
		try {
			if (!(await beforeShutdown())) return;
			const previousId = vaults.activeVaultId();
			if (previousId && previousId !== vault.id) {
				try {
					await withCancellableReadsPaused(previousId, () => vaults.select(vault));
				} catch (error) {
					console.error(error);
					notes.reload();
					return;
				}
			} else {
				await vaults.select(vault);
			}
			if (previousId !== vaults.activeVaultId()) {
				navigation.cancelNameDialog();
				navigation.resetToCanvas();
			} else if (previousId && previousId !== vault.id) {
				notes.reload();
			}
		} finally {
			setVaultActionPending(false);
		}
	};
	const openAiNote = async (note: NoteSummary): Promise<void> => {
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
		studies, canGenerateStudy, studyConnected, studyAiBusy, cliStudies, cliStudyReturn, confirmCliStudy, openStudyNote, gambiarraTerminal,
		noteDeletion, requestDeleteNote,
		noteReferences,
		canvasHistory,
		aiChat, aiChatLoaded: () => Boolean(aiChatLazy.controller()), chatOpen, setChatOpen, chatAvailable,
		kanban, toggleKanban, pomodoro, togglePomodoro,
		openAiNote,
		updates,
		registerBeforeShutdown: (save?: () => Promise<boolean>) => { saveNoteTitle = save; },
		vaults, toggleVaultDialog,
		notes,
		preferences,
		windowControls,
		navigation, createNoteAtCanvas, requestRenameNote,
		temporaryReading,
		settingsOpen,
		setSettingsOpen,
		settingsCategory,
		setSettingsCategory,
		confirmGambiarra,
		setConfirmGambiarra,
		toggleSettings,
		vaultActionPending,
		selectVault,
		createVault,
		renameVault,
		deleteVault,
		t,
	};
};
