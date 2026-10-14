import { Show, type Component } from "solid-js";

import { Canvas } from "@/pages/canvas";
import { Note } from "@/pages/notes";
import { SettingsDialog } from "@/features/change-preferences";
import WindowTitlebar from "./ui/window-titlebar";
import { VaultDialog } from "@/features/manage-vault";
import FloatingSearch from "./ui/floating-search";
import NoteLoadIssuesDialog from "./ui/note-load-issues-dialog";
import NoteNameDialog from "./ui/note-name-dialog";

import { useAppController } from "./controller";
import { styles } from "./style.css.ts";
import { CheckForUpdatesButton } from "@/features/check-for-updates";
import { AiChatPanel } from "@/features/chat-with-ai";

const App: Component = () => {
	const app = useAppController();

	return (
		<>
		<div class={styles.shell} inert={app.updates.installing()} onContextMenu={(event) => event.preventDefault()} data-omega-app-shell>
			<main class={styles.main} data-omega-main>
				<WindowTitlebar
					maximized={app.windowControls.maximized()}
					vaultName={app.vaults.activeVault()?.name}
					t={app.t}
					onVaultClick={app.vaults.openDialog}
					onSettings={() => app.setSettingsOpen(true)}
					onAiChat={() => app.aiChat.setOpen((open) => !open)}
					aiChatOpen={app.aiChat.open()}
					aiFeaturesEnabled={app.preferences.aiFeaturesEnabled()}
					onMinimize={app.windowControls.minimize}
					onToggleMaximize={() => void app.windowControls.toggleMaximize()}
					onClose={app.windowControls.close}
				/>
				<FloatingSearch
					notes={app.notes.sortedNotes()}
					mode={app.temporaryReading.mode()}
					showBackButton={true}
					backButtonDisabled={app.navigation.route() === "canvas" && !app.navigation.selectedNote()}
					isOnCanvas={app.navigation.route() === "canvas"}
					t={app.t}
					onBack={() => {
						if (app.navigation.route() === "note") app.navigation.backToCanvas();
						else void app.navigation.backToLastNote();
					}}
					onModeChange={app.navigation.setMode}
					onSelectNote={app.navigation.selectSearchResult}
				/>
				<Show
					when={app.navigation.route() === "canvas"}
					fallback={
						<Note
							note={app.navigation.selectedNote()}
							notes={app.notes.notes()}
							mode={app.temporaryReading.mode()}
							t={app.t}
							onTitleChange={app.navigation.updateTitle}
							onDocumentChange={app.navigation.updateDocument}
							onOpenMissingNote={(target) => void app.noteReferences.open(target)}
							onOpenNote={app.navigation.openNote}
							onRegisterBeforeShutdown={app.registerBeforeShutdown}
						/>
					}
				>
					<Canvas
						layout={app.preferences.canvasLayout()}
						ready={!app.notes.loading() || app.notes.hasLoadedVault()}
						notes={app.notes.sortedNotes()}
						onCreateNote={app.navigation.createNoteAtCanvas}
						onOpenNote={app.navigation.openNote}
						onRequestRename={(note) => void app.navigation.requestRenameNote(note)}
						onDeleteNote={app.canvasHistory.remove}
						busy={app.canvasHistory.pending() || app.vaultActionPending()}
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
				<Show when={app.noteReferences.error()}>
					<div class={styles.saveNotice} role="alert">{app.t("createLinkedNoteFailed")}</div>
				</Show>
				<Show when={app.canvasHistory.error()}>
					<div class={styles.saveNotice} role="alert">{app.t("canvasHistoryFailed")}</div>
				</Show>
				<Show when={app.notes.saveError()}>
					<div class={styles.saveNotice} role="alert">
						<span>{app.t("saveFailed")}</span>
						<button class={styles.retryButton} type="button" onClick={() => void app.notes.flushSave()}>
							{app.t("retry")}
						</button>
					</div>
				</Show>
			</main>
			<SettingsDialog
				aiResetting={app.aiChat.resetting()}
				aiCleanupError={app.aiChat.cleanupError()}
				canvasLayout={app.preferences.canvasLayout()}
				onCanvasLayoutChange={app.preferences.setCanvasLayout}
				aiFeaturesEnabled={app.preferences.aiFeaturesEnabled()}
				onAiFeaturesEnabledChange={app.preferences.setAiFeaturesEnabled}
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
			/>
			<NoteLoadIssuesDialog issues={app.notes.loadIssues()} t={app.t} onClose={app.notes.dismissLoadIssues} />
			<AiChatPanel aiChat={app.aiChat} notes={app.notes.notes()}
				onOpenNote={(note) => void app.openAiNote(note)} t={app.t} />
		</div>
		<Show when={app.updates.installing()}>
			<div class={styles.updateOverlay} role="alert" aria-live="assertive">{app.t("installingUpdate")}</div>
		</Show>
		</>
	);
};

export default App;
