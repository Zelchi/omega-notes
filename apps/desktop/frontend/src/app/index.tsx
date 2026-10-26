import Button from "@/shared/ui/button";
import { createEffect, createSignal, lazy, Show, Suspense, type Component } from "solid-js";
import { createPresence } from "@/shared/lib/presence";

import { formatAiChatShortcut } from "@/features/change-preferences/model/ai-chat-shortcut";
import WindowTitlebar from "./ui/window-titlebar";
import FloatingSearch from "./ui/floating-search";

import { useAppController } from "./controller";
import { styles } from "./style.css.ts";
import { BackgroundThemeProvider } from "@/shared/ui/ascii-backdrop";
import { LofiPlayerProvider } from "@/features/lofi-player/model/player";

const StudyToolbar = lazy(() => import("@/features/study-notes/ui/study-toolbar"));
const Canvas = lazy(() => import("@/pages/canvas/ui/canvas"));
const Note = lazy(() => import("@/pages/notes/ui/note"));
const SettingsDialog = lazy(() => import("@/features/change-preferences/ui/settings-dialog"));
const VaultDialog = lazy(() => import("@/features/manage-vault/ui/vault-dialog"));
const StudyDialog = lazy(() => import("@/features/study-notes/ui/study-dialog"));
const DeleteNoteDialog = lazy(() => import("@/features/delete-note/ui/delete-note-dialog"));
const NoteLoadIssuesDialog = lazy(() => import("./ui/note-load-issues-dialog"));
const NoteNameDialog = lazy(() => import("./ui/note-name-dialog"));
const AiChatPanel = lazy(() => import("@/features/chat-with-ai/ui/ai-chat-panel"));
const GambiarraPanel = lazy(() => import("@/features/gambiarra-terminal/ui/terminal-panel"));
const CheckForUpdatesButton = lazy(() => import("@/features/check-for-updates/ui/check-for-updates-button").then((module) => ({ default: module.CheckForUpdatesButton })));
const KanbanPanel = lazy(() => import("@/features/manage-kanban/ui/kanban-panel"));
const PomodoroPanel = lazy(() => import("@/features/pomodoro/ui/pomodoro-panel"));

const mountOnFirstOpen = (isOpen: () => boolean) => {
	const [mounted, setMounted] = createSignal(isOpen());
	createEffect(() => {
		if (isOpen()) setMounted(true);
	});
	return mounted;
};

const AppView: Component = () => {
	const app = useAppController();
	const studyToolbarVisible = () => Boolean(app.vaults.activeVaultId()) && !app.notes.loading() && app.navigation.mode() === "view" && !app.navigation.navigating();
	const studyToolbarMounted = mountOnFirstOpen(studyToolbarVisible);
	const settingsMounted = createPresence(app.settingsOpen, 210).present;
	const vaultDialogMounted = createPresence(app.vaults.dialogOpen, 210).present;
	const studyDialogMounted = createPresence(app.studies.open, 210).present;
	const deleteDialogMounted = createPresence(app.noteDeletion.open, 210).present;
	const noteNameDialogMounted = createPresence(app.navigation.nameDialogVisible, 210).present;
	const chatMounted = createPresence(app.chatOpen, 210).present;
	const kanbanMounted = createPresence(app.kanban.open, 210).present;
	const pomodoroMounted = createPresence(app.pomodoro.open, 210).present;

	return (
		<BackgroundThemeProvider value={app.preferences.backgroundTheme}>
				<>
				<div class={styles.shell} inert={app.updates.installing()} onContextMenu={(event) => event.preventDefault()} data-omega-app-shell>
					<WindowTitlebar
						maximized={app.windowControls.maximized()}
						gnome={app.windowControls.gnome()}
						backgroundTheme={app.preferences.backgroundTheme()}
						vaultName={app.vaults.activeVault()?.name}
						vaultDialogOpen={app.vaults.dialogOpen()}
						t={app.t}
						onVaultClick={app.toggleVaultDialog}
						onSettings={app.toggleSettings}
						settingsOpen={app.settingsOpen()}
						onAiChat={() => app.setChatOpen((open) => !open)}
						aiChatOpen={app.chatOpen()}
						aiChatShortcut={formatAiChatShortcut(app.preferences.aiChatShortcut(), true)}
						aiFeaturesEnabled={app.chatAvailable()}
						kanbanOpen={app.kanban.open()}
						onKanban={app.toggleKanban}
						pomodoroOpen={app.pomodoro.open()}
						onPomodoro={app.togglePomodoro}
						onMinimize={app.windowControls.minimize}
						onToggleMaximize={() => void app.windowControls.toggleMaximize()}
						onClose={app.windowControls.close}
					/>
					<main class={styles.main} data-omega-main inert={app.noteDeletion.open() || app.studies.open()}>
						<FloatingSearch
							notes={app.notes.sortedNotes()}
							mode={app.temporaryReading.mode()}
							showBackButton={true}
							backButtonDisabled={app.navigation.navigating() || app.notes.loading() || app.navigation.route() === "canvas" && !app.navigation.hasLastNote()}
							canGoBack={app.navigation.canGoBack()}
							canGoForward={app.navigation.canGoForward()}
							onHistoryBack={() => void app.navigation.goBack()}
							onHistoryForward={() => void app.navigation.goForward()}
							isOnCanvas={app.navigation.route() === "canvas"}
							searchShortcut={app.preferences.searchShortcut()}
							t={app.t}
							onBack={() => {
								if (app.navigation.route() === "note") app.navigation.backToCanvas();
								else void app.navigation.backToLastNote();
							}}
							onModeChange={app.navigation.setMode}
							onSelectNote={app.navigation.selectSearchResult}
						/>
						<div class={styles.pageViewport} style={{ "pointer-events": app.navigation.navigating() ? "none" : undefined }} aria-busy={app.navigation.navigating()}>
							<div class={styles.pageSurface}>
								<Suspense fallback={null}>
									<Show
										when={app.navigation.route() === "canvas"}
										fallback={
											<Note
												note={app.navigation.selectedNote()}
												notes={app.notes.notes()}
												referenceTitles={app.notes.referenceTitles()}
												mode={app.temporaryReading.mode()}
												t={app.t}
													onDelete={() => { const note = app.navigation.selectedNote(); const summary = note && app.notes.notes().find(item => item.id === note.id); if (summary) void app.requestDeleteNote(summary); }}
												deleteDisabled={app.noteDeletion.pending() || app.canvasHistory.pending() || app.notes.loading()}
												onTitleChange={app.navigation.updateTitle}
												onDocumentChange={app.navigation.updateDocument}
												onOpenMissingNote={(target) => void app.noteReferences.open(target)}
												onOpenNote={app.navigation.openNote}
												onRegisterBeforeShutdown={app.registerBeforeShutdown}
											/>
										}
									>
										<Canvas
											vaultId={app.vaults.activeVaultId() ?? ""}
											layout={app.preferences.canvasLayout()}
											ready={!app.notes.loading() || app.notes.hasLoadedVault()}
											notes={app.notes.sortedNotes()}
							onCreateNote={app.createNoteAtCanvas}
											onOpenNote={app.navigation.openNote}
							onRequestRename={app.requestRenameNote}
							onDeleteNote={app.requestDeleteNote}
											busy={app.canvasHistory.pending() || app.vaultActionPending() || app.navigation.navigating()}
											suspended={app.navigation.navigating()}
											restoration={app.canvasHistory.restoration()?.vaultId === app.vaults.activeVaultId() ? app.canvasHistory.restoration() : undefined}
											onRegisterHistory={app.canvasHistory.register}
											onHistoryRestored={app.canvasHistory.restored}
											onNoteCreated={app.canvasHistory.created}
											onNotesMoved={app.canvasHistory.moved}
											mode={app.navigation.mode()}
											t={app.t}
											centerOnMount={app.navigation.canvasCenterOnMount()}
							onCanvasMount={() => app.navigation.setCenteredAtLaunch(true)}
							hideCanvasControls={app.preferences.hideCanvasControls()}
						/>
									</Show>
								</Suspense>
							</div>
						</div>
						<Show when={app.noteReferences.error()}>
							<div class={styles.saveNotice} role="alert">{app.t("createLinkedNoteFailed")}</div>
						</Show>
						<Show when={app.noteDeletion.error() && !app.noteDeletion.target()}>
							<div class={styles.saveNotice} role="alert">{app.t("deleteNoteFailed")}</div>
						</Show>
						<Show when={app.canvasHistory.error() && !app.noteDeletion.error()}>
							<div class={styles.saveNotice} role="alert">{app.t("canvasHistoryFailed")}</div>
						</Show>
						<Show when={app.notes.conflicts()[0]} keyed>{id => <div class={styles.saveNotice} style={{ "flex-wrap": "wrap" }} role="alert">
							<span>{app.t("noteExternalConflict").replace("{title}", app.notes.notes().find(note => note.id === id)?.displayTitle ?? app.notes.notes().find(note => note.id === id)?.title ?? "")}</span>
							<Button class={styles.retryButton} disabled={app.notes.resolvingConflict()} onClick={() => void app.notes.resolveConflict(id, true, app.t("noteLocalCopySuffix"))}>{app.t("noteKeepLocalCopy")}</Button>
							<Button class={styles.retryButton} disabled={app.notes.resolvingConflict()} onClick={() => void app.notes.resolveConflict(id, false, app.t("noteLocalCopySuffix"))}>{app.t("noteLoadExternal")}</Button>
						</div>}</Show>

						<Show when={app.notes.saveError() && !app.notes.conflicts().length}>
							<div class={styles.saveNotice} role="alert">
								<span>{app.t("saveFailed")}</span>
								<Button class={styles.retryButton} type="button" onClick={() => void app.notes.flushSave()}>
									{app.t("retry")}
								</Button>
							</div>
						</Show>
						<Show when={studyToolbarMounted()}>
							<Suspense fallback={null}>
								<StudyToolbar study={app.studies} t={app.t} aiEnabled={app.chatAvailable()} visible={studyToolbarVisible()} />
							</Suspense>
						</Show>
					</main>
					<Show when={studyDialogMounted()}>
						<Suspense fallback={null}>
							<StudyDialog study={app.studies} t={app.t} notes={app.notes.notes()} referenceTitles={app.notes.referenceTitles()}
								canGenerate={app.canGenerateStudy()} connected={app.studyConnected()}
								normalAiMode={!app.preferences.gambiarraEnabled()}
								aiBusy={app.studyAiBusy()} cliRequest={app.cliStudies.request()}
								onOpenCli={() => { app.studies.close(); app.setChatOpen(true); }}
								chatBusy={app.aiChat.sending() || app.aiChat.chat().busy}
								onConnect={() => app.aiChat.setOpen(true)} onOpenNote={app.openStudyNote} />
						</Suspense>
					</Show>

					<Show when={deleteDialogMounted()}>
						<Suspense fallback={null}>
							<DeleteNoteDialog open={app.noteDeletion.open()} note={app.noteDeletion.target()} pending={app.noteDeletion.pending()} error={app.noteDeletion.error()}
								t={app.t} onClose={app.noteDeletion.close} onCancel={app.noteDeletion.cancel} onConfirm={app.noteDeletion.confirm} />
						</Suspense>
					</Show>
					<Show when={settingsMounted()}>
						<Suspense fallback={null}>
							<SettingsDialog
								category={app.settingsCategory} onCategoryChange={app.setSettingsCategory}
								confirmGambiarra={app.confirmGambiarra} setConfirmGambiarra={app.setConfirmGambiarra}
								soundVolume={app.preferences.soundVolume()}
								onSoundVolumeChange={app.preferences.setSoundVolume}
								aiResetting={app.aiChat.resetting()}
								aiCleanupError={app.aiChat.cleanupError()}
								canvasLayout={app.preferences.canvasLayout()}
								onCanvasLayoutChange={app.preferences.setCanvasLayout}
								aiFeaturesEnabled={app.preferences.aiFeaturesEnabled()}
								aiChatShortcut={app.preferences.aiChatShortcut()}
								onAiChatShortcutChange={app.preferences.setAiChatShortcut}
								searchShortcut={app.preferences.searchShortcut()}
								onSearchShortcutChange={app.preferences.setSearchShortcut}
								canvasLayoutShortcut={app.preferences.canvasLayoutShortcut()}
								onCanvasLayoutShortcutChange={app.preferences.setCanvasLayoutShortcut}
								onAiFeaturesEnabledChange={app.preferences.setAiFeaturesEnabled}
								gambiarraEnabled={app.preferences.gambiarraEnabled()}
								onGambiarraEnabledChange={app.preferences.setGambiarraEnabled}
								versionControl={() => <CheckForUpdatesButton t={app.t} updates={app.updates} />}
								open={app.settingsOpen()}
								centerCanvasOnLaunch={app.preferences.centerCanvasOnLaunch()}
								hideCanvasControls={app.preferences.hideCanvasControls()}
								language={app.preferences.language()}
								theme={app.preferences.theme()}
								backgroundTheme={app.preferences.backgroundTheme()}
								textCursor={app.preferences.textCursor()}
								t={app.t}
								onClose={() => app.setSettingsOpen(false)}
								onCenterCanvasChange={app.preferences.setCenterCanvasOnLaunch}
								onHideCanvasControlsChange={app.preferences.setHideCanvasControls}
								onLanguageChange={app.preferences.setLanguage}
								onThemeChange={app.preferences.setTheme}
								onBackgroundThemeChange={app.preferences.setBackgroundTheme}
								onTextCursorChange={app.preferences.setTextCursor}
							/>
						</Suspense>
					</Show>
					<Show when={noteNameDialogMounted()}>
						<Suspense fallback={null}>
							<NoteNameDialog
								open={app.navigation.nameDialogVisible()}
								mode={app.navigation.nameDialog()}
								title={app.navigation.nameDialogTitle()}
								error={app.navigation.nameDialogError()}
								saving={app.navigation.savingName()}
								t={app.t}
								onTitleChange={app.navigation.setNameDialogTitle}
								onClose={app.navigation.hideNameDialog}
								onCancel={app.navigation.cancelNameDialog}
								onSubmit={app.navigation.confirmNameDialog}
							/>
						</Suspense>
					</Show>
					<Show when={vaultDialogMounted()}>
						<Suspense fallback={null}>
							<VaultDialog
								open={app.vaults.dialogOpen()}
								dialogState={app.vaults.dialogState}
								required={!app.vaults.activeVaultId()}
								vaults={app.vaults.vaults()}
								activeVaultId={app.vaults.activeVaultId()}
								getDetails={app.vaults.getDetails}
								error={app.vaults.error()}
								errorAction={app.vaults.errorAction()}
								saving={app.vaults.saving() || app.vaultActionPending() || app.canvasHistory.pending() || app.noteReferences.pending()}
								t={app.t}
								onClose={app.vaults.closeDialog}
								onClearError={app.vaults.clearError}
								onRetryLoad={() => void app.vaults.retryLoad()}
								onCreate={app.createVault}
								onRename={app.renameVault}
								onDelete={app.deleteVault}
								onSelect={(vault) => void app.selectVault(vault)}
								onReorder={app.vaults.reorder}
							/>
						</Suspense>
					</Show>
					<Show when={app.notes.loadIssues().length > 0}>
						<Suspense fallback={null}>
							<NoteLoadIssuesDialog issues={app.notes.loadIssues()} t={app.t} onClose={app.notes.dismissLoadIssues} />
						</Suspense>
					</Show>
					<Show when={chatMounted()}>
						<Suspense fallback={null}>
							<Show when={app.preferences.gambiarraEnabled()} fallback={<Show when={app.aiChatLoaded()}>
								<AiChatPanel aiChat={app.aiChat} notes={app.notes.notes()} onOpenNote={(note) => void app.openAiNote(note)} t={app.t} />
							</Show>}>
								<GambiarraPanel open={app.chatOpen()} vaultId={app.vaults.activeVaultId()} terminal={app.gambiarraTerminal}
									onClose={() => app.setChatOpen(false)} t={app.t} studyRequest={app.cliStudies.request()}
									canConfirmStudy={!!app.cliStudyReturn()} onConfirmStudy={app.confirmCliStudy} />
							</Show>
						</Suspense>
					</Show>
					<Show when={kanbanMounted()}>
						<Suspense fallback={null}>
						<KanbanPanel kanban={app.kanban} t={app.t} />
						</Suspense>
					</Show>
					<Show when={pomodoroMounted()}>
						<Suspense fallback={null}>
						<PomodoroPanel pomodoro={app.pomodoro} t={app.t} />
						</Suspense>
					</Show>

				</div>
				<Show when={app.updates.installing()}>
					<div class={styles.updateOverlay} role="alert" aria-live="assertive">{app.t("installingUpdate")}</div>
				</Show>
				</>
		</BackgroundThemeProvider>
	);
};

const App: Component = () => <LofiPlayerProvider><AppView /></LofiPlayerProvider>;

export default App;
