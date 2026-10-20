import Button from "@/shared/ui/button";
import { lazy, Show, type Component } from "solid-js";

import { Canvas } from "@/pages/canvas";
import { Note } from "@/pages/notes";
import { formatAiChatShortcut, SettingsDialog } from "@/features/change-preferences";
import WindowTitlebar from "./ui/window-titlebar";
import { VaultDialog } from "@/features/manage-vault";
import FloatingSearch from "./ui/floating-search";
import NoteLoadIssuesDialog from "./ui/note-load-issues-dialog";
import NoteNameDialog from "./ui/note-name-dialog";

import { useAppController } from "./controller";
import { styles } from "./style.css.ts";
import { CheckForUpdatesButton } from "@/features/check-for-updates";
import { StudyToolbar, StudyDialog } from "@/features/study-notes";
import { DeleteNoteDialog } from "@/features/delete-note";
import { AiChatPanel } from "@/features/chat-with-ai";

const GambiarraPanel = lazy(() => import("@/features/gambiarra-terminal/ui/terminal-panel"));

const App: Component = () => {
	const app = useAppController();

	return (
		<>
		<div class={styles.shell} inert={app.updates.installing()} onContextMenu={(event) => event.preventDefault()} data-omega-app-shell>
			<WindowTitlebar
				maximized={app.windowControls.maximized()}
				vaultName={app.vaults.activeVault()?.name}
				t={app.t}
				onVaultClick={app.vaults.openDialog}
				onSettings={() => app.setSettingsOpen(true)}
				onAiChat={() => app.setChatOpen((open) => !open)}
				aiChatOpen={app.chatOpen()}
				aiChatShortcut={formatAiChatShortcut(app.preferences.aiChatShortcut(), true)}
				aiFeaturesEnabled={app.chatAvailable()}
				onMinimize={app.windowControls.minimize}
				onToggleMaximize={() => void app.windowControls.toggleMaximize()}
				onClose={app.windowControls.close}
			/>
			<main class={styles.main} data-omega-main inert={Boolean(app.noteDeletion.target()) || app.noteDeletion.pending() || app.studies.open()}>
				<FloatingSearch
					notes={app.notes.sortedNotes()}
					mode={app.temporaryReading.mode()}
					showBackButton={true}
					backButtonDisabled={app.navigation.navigating() || app.notes.loading() || app.navigation.route() === "canvas" && !app.navigation.selectedNote()}
					canGoBack={app.navigation.canGoBack()}
					canGoForward={app.navigation.canGoForward()}
					onHistoryBack={() => void app.navigation.goBack()}
					onHistoryForward={() => void app.navigation.goForward()}
					isOnCanvas={app.navigation.route() === "canvas"}
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
						<Show
							when={app.navigation.route() === "canvas"}
							fallback={
								<Note
									note={app.navigation.selectedNote()}
									notes={app.notes.notes()}
									referenceTitles={app.notes.referenceTitles()}
									mode={app.temporaryReading.mode()}
									t={app.t}
									onDelete={() => { const note = app.navigation.selectedNote(); if (note) void app.noteDeletion.request(note); }}
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
								onCreateNote={app.navigation.createNoteAtCanvas}
								onOpenNote={app.navigation.openNote}
								onRequestRename={(note) => void app.navigation.requestRenameNote(note)}
								onDeleteNote={app.noteDeletion.request}
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
					<span>{app.t("noteExternalConflict").replace("{title}", app.notes.notes().find(note => note.id === id)?.title ?? "")}</span>
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
				<StudyToolbar study={app.studies} t={app.t} aiEnabled={app.chatAvailable()}
					visible={Boolean(app.vaults.activeVaultId()) && !app.notes.loading() && app.navigation.mode() === "view" && !app.navigation.navigating()} />
			</main>
			<StudyDialog study={app.studies} t={app.t} notes={app.notes.notes()} referenceTitles={app.notes.referenceTitles()}
				canGenerate={app.canGenerateStudy()} connected={app.studyConnected()}
				aiBusy={app.studyAiBusy()} cliRequest={app.cliStudies.request()}
				onOpenCli={() => { app.studies.close(); app.setChatOpen(true); }}
				chatBusy={app.aiChat.sending() || app.aiChat.chat().busy}
				onConnect={() => app.aiChat.setOpen(true)} onOpenNote={app.openStudyNote} />

			<DeleteNoteDialog note={app.noteDeletion.target()} pending={app.noteDeletion.pending()} error={app.noteDeletion.error()}
				t={app.t} onClose={app.noteDeletion.close} onConfirm={app.noteDeletion.confirm} />
			<SettingsDialog
				soundVolume={app.preferences.soundVolume()}
				onSoundVolumeChange={app.preferences.setSoundVolume}
				aiResetting={app.aiChat.resetting()}
				aiCleanupError={app.aiChat.cleanupError()}
				canvasLayout={app.preferences.canvasLayout()}
				onCanvasLayoutChange={app.preferences.setCanvasLayout}
				aiFeaturesEnabled={app.preferences.aiFeaturesEnabled()}
				aiChatShortcut={app.preferences.aiChatShortcut()}
				onAiChatShortcutChange={app.preferences.setAiChatShortcut}
				onAiFeaturesEnabledChange={app.preferences.setAiFeaturesEnabled}
				gambiarraEnabled={app.preferences.gambiarraEnabled()}
				onGambiarraEnabledChange={app.preferences.setGambiarraEnabled}
				footer={<CheckForUpdatesButton t={app.t} updates={app.updates} />}
				open={app.settingsOpen()}
				centerCanvasOnLaunch={app.preferences.centerCanvasOnLaunch()}
				hideCanvasControls={app.preferences.hideCanvasControls()}
				language={app.preferences.language()}
				theme={app.preferences.theme()}
				textCursor={app.preferences.textCursor()}
				t={app.t}
				onClose={() => app.setSettingsOpen(false)}
				onCenterCanvasChange={app.preferences.setCenterCanvasOnLaunch}
				onHideCanvasControlsChange={app.preferences.setHideCanvasControls}
				onLanguageChange={app.preferences.setLanguage}
				onThemeChange={app.preferences.setTheme}
				onTextCursorChange={app.preferences.setTextCursor}
			/>
			<NoteNameDialog
				mode={app.navigation.nameDialog()}
				title={app.navigation.nameDialogTitle()}
				error={app.navigation.nameDialogError()}
				saving={app.navigation.savingName()}
				t={app.t}
				onTitleChange={app.navigation.setNameDialogTitle}
				onClose={app.navigation.closeNameDialog}
				onSubmit={app.navigation.confirmNameDialog}
			/>
			<VaultDialog
				open={app.vaults.dialogOpen()}
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
			<NoteLoadIssuesDialog issues={app.notes.loadIssues()} t={app.t} onClose={app.notes.dismissLoadIssues} />
			<Show when={app.preferences.gambiarraEnabled()} fallback={<AiChatPanel aiChat={app.aiChat} notes={app.notes.notes()}
				onOpenNote={(note) => void app.openAiNote(note)} t={app.t} />}>
				<GambiarraPanel open={app.chatOpen()} vaultId={app.vaults.activeVaultId()}
					onClose={() => app.setChatOpen(false)} t={app.t} studyRequest={app.cliStudies.request()}
					canConfirmStudy={!!app.cliStudyReturn()} onConfirmStudy={app.confirmCliStudy} />
			</Show>
		</div>
		<Show when={app.updates.installing()}>
			<div class={styles.updateOverlay} role="alert" aria-live="assertive">{app.t("installingUpdate")}</div>
		</Show>
		</>
	);
};

export default App;
