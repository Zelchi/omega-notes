import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = async path => (await readFile(new URL(path, import.meta.url), 'utf8')).replaceAll('\r\n', '\n');

test('note text context menu supports clipboard actions and grants Electron clipboard reads only to the trusted main frame', async () => {
	const [node, controller, editor, electron, ptBr, en] = await Promise.all([
		source('../src/pages/notes/ui/note-text-node/index.tsx'),
		source('../src/pages/notes/ui/note-text-node/controller.ts'),
		source('../src/pages/notes/ui/note-canvas-editor/index.tsx'),
		source('../../bridge/electron/main.mjs'),
		source('../lang/pt-br.json').then(JSON.parse),
		source('../lang/en.json').then(JSON.parse),
	]);
	assert.match(node, /onContextMenu=\{openContextMenu\}/);
	const contextHandler = node.slice(node.indexOf('const openContextMenu'), node.indexOf('const pasteFromClipboard'));
	assert.doesNotMatch(contextHandler, /data-text-fragment/);
	assert.match(contextHandler, /getClientRects/);
	assert.match(node, /navigator\.clipboard/);
	assert.match(node, /noteContextPastePlainText/);
	assert.match(node, /<Icon name="paste" size=\{15\} \/>/);
	assert.match(node, /<Icon name="pastePlain" size=\{15\} \/>/);
	assert.match(node, /<Icon name="search" size=\{15\} \/>/);
	assert.match(node, /hasSelection \? 180 : 112/);
	assert.match(node, /when=\{menu\(\)\.selectedText\}/);
	assert.match(node, /https:\/\/www\.google\.com\/search\?q=\$\{encodeURIComponent\(selectedText\(\)\.trim\(\)\)\}/);
	assert.match(node, /navigator\.clipboard\.writeText\(selectedText\(\)\)/);
	assert.match(node, /<Icon name="copy" size=\{15\} \/>/);
	assert.match(node, /props\.onOpenFind\(selectedText\)/);
	assert.match(node, /if \(htmlItem && htmlType\)/);
	assert.match(node, /htmlClipboardToNoteText\(await \(await htmlItem\.getType\(htmlType\)\)\.text\(\)\)/);
	assert.match(editor, /onOpenFind=\{find\.show\}/);
	assert.match(controller, /const pasteTextFromMenu/);
	assert.match(controller, /getData\("text\/html"\)/);
	assert.match(controller, /htmlClipboardToNoteText\(htmlText\)/);
	assert.match(controller, /event\.shiftKey && !event\.altKey && event\.key\.toLowerCase\(\) === "v"/);
	assert.match(controller, /const pasteAsPlainText = plainTextPasteRequested/);
	assert.match(controller, /const url = pasteAsPlainText \? undefined : pastedUrl\(text\)/);
	assert.match(controller, /rememberCurrentSelection/);
	const pointerHandler = controller.slice(controller.indexOf('const handlePointerDown'), controller.indexOf('const moveFromEmptyLine'));
	assert.match(pointerHandler, /placeCaretAtPoint\(event\.clientX, event\.clientY\);/);
	assert.doesNotMatch(pointerHandler, /placeCaretAtPoint\(event\.clientX, event\.clientY\)\) event\.preventDefault\(\)/);
	const findController = await source('../src/features/find-in-note/model/controller.ts');
	assert.match(findController, /const show = \(initialQuery\?: string\)/);
	assert.match(findController, /if \(initialQuery !== undefined\) setQuery\(initialQuery\)/);
	assert.equal(ptBr.noteContextPaste, 'Colar');
	assert.equal(ptBr.noteContextPastePlainText, 'Colar sem formatação');
	assert.equal(ptBr.noteContextSearchGoogle, 'Pesquisar no Google');
	assert.equal(ptBr.noteContextCopySelection, 'Copiar seleção');
	assert.equal(en.noteContextPaste, 'Paste');
	assert.equal(en.noteContextPastePlainText, 'Paste without formatting');
	assert.equal(en.noteContextSearchGoogle, 'Search Google');
	assert.equal(en.noteContextCopySelection, 'Copy selection');
	assert.equal((electron.match(/permission === 'clipboard-read'/g) ?? []).length, 2);
	assert.match(electron, /permission === 'clipboard-read' && isTrustedMainAppFrame\(contents, details\.requestingUrl, details\.isMainFrame\)/);
});

test('Pomodoro and Kanban entry points and panels remain available in production', async () => {
	const titlebar = await source('../src/app/ui/window-titlebar/index.tsx');
	const app = await source('../src/app/index.tsx');
	assert.match(titlebar, /<Button class=\{cx\(styles\.button, styles\.kanbanButton\)\}[\s\S]*?aria-label=\{props\.t\("kanbanOpen"\)\}/);
	assert.match(titlebar, /<Button class=\{cx\(styles\.button, styles\.pomodoroButton\)\}[\s\S]*?aria-label=\{props\.t\("pomodoroOpen"\)\}/);
	assert.match(app, /<Show when=\{pomodoroMounted\(\)\}>[\s\S]*?<PomodoroPanel/);
	assert.match(app, /<Show when=\{kanbanMounted\(\)\}>[\s\S]*?<KanbanPanel/);
});

test('Kanban cards open their edit modal and show priority, title, and date without action buttons', async () => {
	const [panel, styles] = await Promise.all([
		source('../src/features/manage-kanban/ui/kanban-panel/index.tsx'),
		source('../src/features/manage-kanban/ui/kanban-panel/style.css.ts'),
	]);
	assert.match(panel, /onClick=\{\(\) => \{[\s\S]*?openDetails\(item\);\s*\}\}/);
	assert.match(panel, /<div class=\{styles\.cardTop\}>[\s\S]*?kanbanPriorityLabels\[item\.priority\][\s\S]*?<div class=\{styles\.cardTitle\}>\{item\.title\}<\/div>[\s\S]*?getDaysUntilDueDate\(dueDate\(\)\)[\s\S]*?\{daysUntilDueDate\}/);
	assert.doesNotMatch(panel, /formatDueDate|<Icon name="calendar"/);
	assert.match(panel, /onClick=\{\(\) => \{ deleteCard\(item\(\)\); closeDetails\(\); \}\}/);
	assert.doesNotMatch(panel, /styles\.cardActions|styles\.cardAction/);
	assert.match(styles, /cardTop: style\(\{ display: "grid"/);
	assert.match(styles, /gridColumn: 2[\s\S]*?textAlign: "center"/);
	assert.match(styles, /priorityBadge: style\(\{ gridColumn: 1, justifySelf: "start"/);
	assert.match(styles, /dueBadge: style\(\{ gridColumn: 3, justifySelf: "end"/);
});

test('PDF reader opens on the right as a Vault side panel with the shared backdrop', async () => {
	const [titlebar, app, visibility, panelStyle, panel, ptBr, en] = await Promise.all([
		source('../src/app/ui/window-titlebar/index.tsx'),
		source('../src/app/index.tsx'),
		source('../src/app/model/window-visibility.ts'),
		source('../src/features/manage-pdfs/ui/pdf-panel/style.css.ts'),
		source('../src/features/manage-pdfs/ui/pdf-panel/index.tsx'),
		source('../lang/pt-br.json').then(JSON.parse),
		source('../lang/en.json').then(JSON.parse),
	]);
	const pdfButtonPosition = titlebar.indexOf('runAppAction(props.onPdfs, "panel"');
	assert.ok(pdfButtonPosition > titlebar.indexOf('<div class={styles.right}>'));
	assert.ok(pdfButtonPosition > titlebar.indexOf('<div class={styles.controls}'));
	assert.match(app, /const PdfPanel = lazy\([\s\S]*?manage-pdfs\/ui\/pdf-panel/);
	assert.match(app, /<Show when=\{pdfsMounted\(\)\}>[\s\S]*?<PdfPanel/);
	assert.match(visibility, /pdfs: "right"/);
	assert.match(panelStyle, /top: windowLayout\.titlebarHeight \+ 1, right: 1, bottom: 1/);
	assert.match(panelStyle, /position: "absolute", top: 0, left: 0, bottom: 0/);
	assert.match(panel, /<AsciiBackdrop placement="modal" \/>/);
	assert.match(panelStyle, /readerSurface: style\([\s\S]*?background: "transparent"/);
	assert.match(panelStyle, /resizeHandle: style\(\{[\s\S]*?display: "grid", placeItems: "center", width: 10/);
	assert.match(panelStyle, /height: 32, borderRadius: 2,[\s\S]*?opacity: 0\.65/);
	assert.equal(ptBr.pdfLibraryTitle, 'Leitor');
	assert.equal(en.pdfLibraryTitle, 'Reader');
	assert.equal(ptBr.pdfHighlightSelection, 'Marcar');
	assert.equal(ptBr.pdfRemoveHighlight, 'Desmarcar');
	assert.equal(ptBr.pdfSearch, 'Pesquisar');
	assert.equal(ptBr.pdfEditHighlight, 'Editar');
	assert.equal(ptBr.pdfHighlightNoteSearch, 'Buscar nota…');
	assert.equal(en.pdfHighlightSelection, 'Mark');
	assert.equal(en.pdfRemoveHighlight, 'Unmark');
	assert.equal(en.pdfSearch, 'Search');
	assert.equal(en.pdfEditHighlight, 'Edit');
});

test('PDF panel animates its entrance and exit like the other side panels', async () => {
	const panel = await source('../src/features/manage-pdfs/ui/pdf-panel/index.tsx');
	assert.match(panel, /registerVisibilityAnimation\(element, \(\) => !props\.library\.open\(\), "panel"\)/);
});

test('PDF panel and reader controls use the shared sound-enabled Button', async () => {
	const [panel, reader] = await Promise.all([
		source('../src/features/manage-pdfs/ui/pdf-panel/index.tsx'),
		source('../src/features/manage-pdfs/ui/pdf-reader.tsx'),
	]);
	for (const source of [panel, reader]) {
		assert.match(source, /import Button from "@\/shared\/ui\/button"/);
		assert.doesNotMatch(source, /<button\b/);
	}
});

test('note renderers group adjacent Markdown list items into one list element', async () => {
	const [canvasRenderer, contentRenderer] = await Promise.all([
		source('../src/pages/notes/ui/note-canvas-editor/render-text.tsx'),
		source('../src/entities/note/ui/note-content-text.tsx'),
	]);
	for (const renderer of [canvasRenderer, contentRenderer]) {
		assert.match(renderer, /groupFormattedBlocks\(parseFormattedText\(/);
		assert.match(renderer, /<FormattedListView blocks=\{group\.blocks\}/);
	}
});

test('closing the PDF panel keeps its active reader mounted until returning to the library', async () => {
	const [app, panel, reader] = await Promise.all([
		source('../src/app/index.tsx'),
		source('../src/features/manage-pdfs/ui/pdf-panel/index.tsx'),
		source('../src/features/manage-pdfs/ui/pdf-reader.tsx'),
	]);
	assert.match(app, /const pdfPanelPresence = createPresence\(app\.pdfs\.open, 210\)\.present;\s*const pdfsMounted = \(\) => pdfPanelPresence\(\) \|\| Boolean\(app\.pdfs\.openedId\(\)\);/);
	assert.match(panel, /<Show when=\{activeDocument\(\)\} fallback=/);
	assert.match(panel, /onBack=\{\(\) => props\.library\.openDocument\(undefined\)\}/);
	assert.match(panel, /documentId=\{props\.library\.openedId\(\)!\}/);
	assert.match(reader, /createEffect\(on\(\(\) => \[props\.vaultId, props\.documentId\] as const/);
	assert.doesNotMatch(reader, /props\.open/);
});

test('canvas starts loading a note on pointer down before navigation commits', async () => {
	const [app, staticCanvas, dynamicCanvas, navigation] = await Promise.all([
		source('../src/app/index.tsx'),
		source('../src/pages/canvas/ui/graph-canvas/index.tsx'),
		source('../src/pages/canvas/ui/dynamic-graph/index.tsx'),
		source('../src/app/model/note-navigation.controller.ts'),
	]);
	assert.match(app, /onPreloadNote=\{\(noteId\) => \{ void app\.notes\.loadNote\(noteId\)\.catch\(\(\) => undefined\); \}\}/);
	assert.match(staticCanvas, /event\.button === 0 && !graph\.shouldIgnoreClick\(event\)\) props\.onPreloadNote\(note\.id\)/);
	assert.match(dynamicCanvas, /event\.button === 0 && hit && !graph\.shouldIgnoreClick\(\)\) props\.onPreloadNote\(note\.id\)/);
	assert.match(navigation, /const \[saved, loadedNote\] = await Promise\.all\(\[notes\.flushSave\(\), noteLoad\]\)/);
});

test('PDF panel overlays page content without moving search and stays under modal layers', async () => {
	const [app, appStyle, panelStyle, searchStyle, deleteDialogStyle, mediaDialog] = await Promise.all([
		source('../src/app/index.tsx'),
		source('../src/app/style.css.ts'),
		source('../src/features/manage-pdfs/ui/pdf-panel/style.css.ts'),
		source('../src/app/ui/floating-search/style.css.ts'),
		source('../src/shared/ui/delete-confirmation-dialog/style.css.ts'),
		source('../src/pages/notes/ui/media-catalog-dialog/index.tsx'),
	]);
	assert.match(app, /<main class=\{styles\.main\} data-omega-main[^>]*>\s*<FloatingSearch/);
	assert.match(appStyle, /main: style\(\{[\s\S]*?zIndex: 1/);
	assert.match(searchStyle, /position: "absolute"[\s\S]*?left: "50%"[\s\S]*?zIndex: 5/);
	assert.match(panelStyle, /right: 1, bottom: 1, zIndex: 7/);
	assert.match(deleteDialogStyle, /position: "fixed"[^}]*zIndex: 22/);
	assert.match(mediaDialog, /data-omega-app-shell/);
});

test('PDF deletion uses the app confirmation dialog instead of a native dialog', async () => {
	const [panel, controller] = await Promise.all([
		source('../src/features/manage-pdfs/ui/pdf-panel/index.tsx'),
		source('../src/features/manage-pdfs/model/controller.ts'),
	]);
	assert.match(panel, /<DeleteConfirmationDialog/);
	assert.match(panel, /pdfDeleteConfirmation/);
	assert.match(panel, /pdfDeleteFailed/);
	assert.match(controller, /confirmRemoveDocument/);
	assert.doesNotMatch(controller, /import \{ confirm, open \}/);
});

test('PDF import title input stays at the start of the library content', async () => {
	const [panel, style] = await Promise.all([
		source('../src/features/manage-pdfs/ui/pdf-panel/index.tsx'),
		source('../src/features/manage-pdfs/ui/pdf-panel/style.css.ts'),
	]);
	assert.match(panel, /<form class=\{styles\.importForm\} onSubmit=\{event => \{ event\.preventDefault\(\); void props\.library\.importSelected\(\); \}\}>/);
	assert.ok(panel.indexOf('<form class={styles.importForm}') < panel.indexOf('<div class={styles.list}>'));
	assert.match(style, /importForm: style\(\{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: "0 0 auto" \}\)/);
});

test('PDF reader uses the shared custom scrollbar component', async () => {
	const [reader, style, scrollbarStyle] = await Promise.all([
		source('../src/features/manage-pdfs/ui/pdf-reader.tsx'),
		source('../src/features/manage-pdfs/ui/pdf-panel/style.css.ts'),
		source('../src/shared/ui/custom-scroll-area/style.css.ts'),
	]);
	assert.match(reader, /import \{ CustomScrollbars, useCustomScrollArea \} from "@\/shared\/ui\/custom-scroll-area"/);
	assert.match(reader, /const scroll = useCustomScrollArea\(\)/);
	assert.match(reader, /class=\{styles\.readerSurface\} ref=\{element => \{ host = element; scroll\.setViewport\(element\); \}\} data-omega-scroll-viewport=""/);
	assert.match(reader, /<CustomScrollbars scroll=\{scroll\} \/>/);
	assert.match(style, /readerScrollRoot: style\(\{[^}]*overflow: "hidden"[^}]*vars: \{ "--omega-scrollbar-right": "0px", "--omega-scrollbar-bottom": "0px" \}/);
	assert.match(style, /readerSurface: style\(\{ position: "relative", display: "block", width: "100%", height: "100%", overflow: "auto", overscrollBehavior: "contain" \}\)/);
	assert.doesNotMatch(style, /::-webkit-scrollbar/);
	assert.match(scrollbarStyle, /horizontalTrack: style\(\{[\s\S]*?bottom: "var\(--omega-scrollbar-bottom, 4px\)"/);
});

test('PDF zoom recenters horizontal scrolling after resizing the page', async () => {
	const reader = await source('../src/features/manage-pdfs/ui/pdf-reader.tsx');
	assert.match(reader, /if \(next !== current\) centerHorizontalScrollOnRender = true/);
	assert.match(reader, /if \(centerHorizontalScrollOnRender && host\) \{\s*host\.scrollLeft = Math\.max\(0, \(host\.scrollWidth - host\.clientWidth\) \/ 2\);\s*centerHorizontalScrollOnRender = false;/);
});

test('chat selection context actions use concise localized labels', async () => {
	const [ptBr, en] = await Promise.all([
		source('../lang/pt-br.json').then(JSON.parse),
		source('../lang/en.json').then(JSON.parse),
	]);
	assert.equal(ptBr.aiSelectionAsk, 'Perguntar');
	assert.equal(ptBr.aiSelectionSearchGoogle, 'Pesquisar');
	assert.equal(en.aiSelectionAsk, 'Ask');
	assert.equal(en.aiSelectionSearchGoogle, 'Search');
});

test('Vault switcher occupies the titlebar center track instead of overlapping drag regions', async () => {
	const styles = await source('../src/app/ui/window-titlebar/style.css.ts');
	assert.match(styles, /vaultName: style\(\{[\s\S]*?gridColumn: 2,[\s\S]*?justifySelf: "center"/);
	assert.doesNotMatch(styles, /vaultName: style\(\{\s*position: "absolute"/);
});

test('Shift-clicking Pomodoro Play starts the timer and hides the main window', async () => {
	const [panel, app] = await Promise.all([
		source('../src/features/pomodoro/ui/pomodoro-panel/index.tsx'),
		source('../src/app/index.tsx'),
	]);
	assert.match(panel, /const toggleTimer = \(event: MouseEvent\): void => \{\s*if \(props\.pomodoro\.running\(\)\) \{\s*props\.pomodoro\.pause\(\);\s*return;\s*\}\s*props\.pomodoro\.start\(\);\s*if \(event\.shiftKey\) props\.onHideWindow\(\);\s*\}/);
	assert.match(panel, /onClick=\{toggleTimer\}/);
	assert.match(app, /<PomodoroPanel pomodoro=\{app\.pomodoro\} t=\{app\.t\} onHideWindow=\{app\.windowControls\.close\} \/>/);
});

test('Pomodoro focus completion can reveal a hidden window on both desktop hosts', async () => {
	const [pomodoro, app, windowApi, electron, tauri] = await Promise.all([
		source('../src/features/pomodoro/model/controller.ts'),
		source('../src/app/controller.ts'),
		source('../src/app/api/window.repository.ts'),
		source('../../bridge/electron/main.mjs'),
		source('../src/shared/lib/desktop-tauri.ts'),
	]);
	assert.match(pomodoro, /playPhaseChange && phase\(\) !== snapshot\.phase\) \{\s*onPhaseEnd\?\.\(\)/);
	assert.match(app, /usePomodoro\(vaults\.activeVaultId, \(\) => \{\s*hideOtherWindows\("pomodoro"\);\s*pomodoro\.setOpen\(true\);\s*void showMainWindowIfHidden\(\)/);
	assert.match(windowApi, /isDesktopRuntime\(\) && !\(await isMainWindowVisible\(\)\)\) await showMainWindow\(\)/);
	assert.match(electron, /case 'window_is_visible': return window\.isVisible\(\)/);
	assert.match(tauri, /case 'window_is_visible': return await webviewWindow\.isVisible\(\)/);
});

test('Chat scroll position updates do not retrigger automatic follow-to-bottom', async () => {
	const chat = await source('../src/features/chat-with-ai/ui/ai-chat-panel/index.tsx');
	const scrollEffectStart = chat.indexOf('    createEffect(() => {\n        props.aiChat.chat().messages;');
	const scrollEffectEnd = chat.indexOf('\n    });', scrollEffectStart);
	const scrollEffect = chat.slice(scrollEffectStart, scrollEffectEnd);
	assert.ok(scrollEffectStart >= 0, 'chat scroll effect is present');
	assert.ok(scrollEffectEnd > scrollEffectStart, 'chat scroll effect has a closing boundary');
	assert.match(scrollEffect, /const view = untrack\(\(\) => props\.aiChat\.messageView\(\)\)/);
});

test('tray Exit saves before calling the native app exit command', async () => {
	const [controls, tauri] = await Promise.all([
		source('../src/app/model/window-controls.controller.ts'),
		source('../../bridge/tauri/src/main.rs'),
	]);
	const exit = controls.slice(controls.indexOf('const exit ='), controls.indexOf('\n\t};', controls.indexOf('const exit =')));
	assert.match(exit, /await beforeClose\(\)/);
	assert.match(exit, /await exitMainApp\(\)/);
	assert.doesNotMatch(exit, /if\s*\([^)]*beforeClose/);
	assert.doesNotMatch(exit, /confirmClose\(/);
	assert.doesNotMatch(exit, /showMainWindow\(\)|closeWindow\(\)/);
	assert.match(tauri, /fn exit_app\(app: AppHandle\)\s*\{\s*app\.exit\(0\)/);
});

test('Linux and Windows tray Exit stay hidden and defer dispatch by 150ms', async () => {
	const [electron, tauri] = await Promise.all([
		source('../../bridge/electron/main.mjs'),
		source('../../bridge/tauri/src/main.rs'),
	]);
	const exitClickStart = electron.indexOf('{ label: trayLabels.exit');
	const exitClick = electron.slice(exitClickStart, electron.indexOf('\n    ]));', exitClickStart));
	const quitStart = electron.indexOf('export function quit()');
	const quit = electron.slice(quitStart, electron.indexOf('\nfunction validateSender', quitStart));
	assert.match(exitClick, /if \(process\.platform === 'darwin'\) \{ show\(\); emit\('omega-tray-action', 'exit'\); \}\s*else setTimeout\(\(\) => emit\('omega-tray-action', 'exit'\), 150\)/);
	assert.match(quit, /Promise\.race\([\s\S]*?backend\.stop\(\)[\s\S]*?5000/);
	assert.match(quit, /process\.platform !== 'linux'[\s\S]*?tray\?\.destroy\(\)/);
	assert.match(quit, /app\.exit\(0\)/);
	const tauriExitStart = tauri.indexOf('"exit" => {');
	const tauriExit = tauri.slice(tauriExitStart, tauri.indexOf('\n                    _ => {}', tauriExitStart));
	assert.doesNotMatch(tauriExit, /show_window\(app\)/);
	assert.match(tauriExit, /std::thread::spawn[\s\S]*?sleep\(std::time::Duration::from_millis\(150\)\)[\s\S]*?emit_tray_action\(&app, "exit"\)/);
});

test('tray clicks open only the context menu on Windows', async () => {
	const tauri = await source('../../bridge/tauri/src/main.rs');
	assert.match(tauri, /\.show_menu_on_left_click\(true\)/);
	assert.doesNotMatch(tauri, /on_tray_icon_event/);
	assert.doesNotMatch(tauri, /MouseButton|TrayIconEvent/);
});

test('Tauri tray visibility follows every app-driven window show or hide', async () => {
	const [desktop, tauri] = await Promise.all([
		source('../src/shared/lib/desktop-tauri.ts'),
		source('../../bridge/tauri/src/main.rs'),
	]);
	assert.match(desktop, /case 'hide_main_window': return await tauriInvoke\('hide_main_window'\)/);
	assert.match(desktop, /case 'show_main_window': return await tauriInvoke\('show_main_window'\)/);
	assert.match(tauri, /fn set_window_visibility\([\s\S]*?refresh_tray_menu\(app\)/);
	assert.match(tauri, /fn hide_main_window\(app: AppHandle\) -> Result<\(\), String> \{\s*set_window_visibility\(&app, false\)/);
	assert.match(tauri, /fn show_main_window\(app: AppHandle\) -> Result<\(\), String> \{\s*set_window_visibility\(&app, true\)/);
	assert.match(tauri, /fn toggle_window_visibility\([\s\S]*?window\.is_visible\(\)[\s\S]*?set_window_visibility\(app, !visible\)/);
});

test('Tauri updater relaunches after installing and registers the native restart command', async () => {
	const [updates, desktop, tauri] = await Promise.all([
		source('../src/features/check-for-updates/api/updates.repository.ts'),
		source('../src/shared/lib/desktop-tauri.ts'),
		source('../../bridge/tauri/src/main.rs'),
	]);
	assert.match(updates, /await candidate\.install\(\);\s*await invoke\('relaunch_app'\)/);
	assert.match(desktop, /case 'relaunch_app': return await tauriInvoke\('relaunch_app'\)/);
	assert.match(tauri, /fn relaunch_app\(app: AppHandle\)\s*\{\s*app\.restart\(\)/);
	assert.match(tauri, /generate_handler!\[[\s\S]*?relaunch_app/);
});

test('startup centering is labeled as camera centering and does not move notes', async () => {
	const [ptBr, en, graph] = await Promise.all([
		source('../lang/pt-br.json'),
		source('../lang/en.json'),
		source('../src/pages/canvas/ui/graph-canvas/controller.ts'),
	]);
	const centerCamera = graph.match(/if \(props\.centerOnMount\) \{([\s\S]*?)\n\t\t\}/)?.[1];
	assert.equal(JSON.parse(ptBr).centerCanvasOnLaunch, 'Centralizar câmera');
	assert.equal(JSON.parse(en).centerCanvasOnLaunch, 'Center camera on launch');
	assert.ok(centerCamera);
	assert.match(centerCamera, /setView\(/);
	assert.doesNotMatch(centerCamera, /setPositions\(/);
});

test('canvas mounts only after a successful full vault load', async () => {
	const app = await source('../src/app/index.tsx');
	assert.match(app, /ready=\{app\.notes\.hasLoadedVault\(\)\}/);
});

test('Pomodoro and Kanban shortcuts are configurable and Kanban is available in production', async () => {
	const [titlebar, app, controller, settings] = await Promise.all([
		source('../src/app/ui/window-titlebar/index.tsx'),
		source('../src/app/index.tsx'),
		source('../src/app/controller.ts'),
		source('../src/features/change-preferences/ui/settings-dialog/index.tsx'),
	]);
	assert.doesNotMatch(titlebar, /import\.meta\.env\.DEV/);
	assert.match(titlebar, /aria-keyshortcuts=\{props\.kanbanShortcut\}/);
	assert.match(app, /createPresence\(app\.kanban\.open, 210\)/);
	assert.match(app, /<Show when=\{kanbanMounted\(\)\}>[\s\S]*?<KanbanPanel/);
	assert.match(controller, /const toggleKanban = \(\) => \{\s*if \(!vaults\.activeVaultId\(\)\) return/);
	assert.match(controller, /matchesKeyboardShortcut\(event, preferences\.pomodoroShortcut\(\)\)/);
	assert.match(controller, /matchesKeyboardShortcut\(event, preferences\.kanbanShortcut\(\)\)/);
	assert.match(settings, /value=\{props\.pomodoroShortcut\} onChange=\{props\.onPomodoroShortcutChange\}/);
	assert.match(settings, /value=\{props\.kanbanShortcut\} onChange=\{props\.onKanbanShortcutChange\}/);
});

test('Electron and Tauri enforce one app instance and focus the existing window', async () => {
	const [electron, tauri, tauriCargo] = await Promise.all([
		source('../../bridge/electron/main.mjs'),
		source('../../bridge/tauri/src/main.rs'),
		source('../../bridge/tauri/Cargo.toml'),
	]);
	assert.match(electron, /if \(!app\.requestSingleInstanceLock\(\)\) app\.exit\(0\)/);
	assert.ok(electron.indexOf('if (!app.requestSingleInstanceLock())') < electron.indexOf('tray = new Tray(trayIcons.idle)'));
	assert.match(electron, /app\.on\('second-instance', \(\) => \{ if \(window\) show\(\); \}\)/);
	assert.match(tauriCargo, /tauri-plugin-single-instance = "2"/);
	assert.ok(tauri.indexOf('.plugin(tauri_plugin_single_instance::init(') < tauri.indexOf('.plugin(tauri_plugin_dialog::init())'));
	assert.match(tauri, /tauri_plugin_single_instance::init\(\|app, _args, _cwd\|\s*\{\s*show_window\(app\)\s*\}\)/);
});

test('Kanban card details link to notes instead of exposing a description', async () => {
	const kanban = await source('../src/features/manage-kanban/ui/kanban-panel/index.tsx');
	assert.match(kanban, /props\.t\("kanbanLinkedNote"\)/);
	assert.match(kanban, /props\.onCreateNote\(noteTitle\)/);
	assert.match(kanban, /props\.onOpenNote\(note\(\)\)/);
	assert.match(kanban, /<Dropdown ariaLabel=\{props\.t\("kanbanPriority"\)\} value=\{priorityDraft\(\)\} placeholder="—"/);
	assert.match(kanban, /options=\{kanbanPriorities\.filter\(priority => priority !== "none"\)\.map\(priority =>/);
	assert.match(kanban, /<Portal>/);
	assert.match(kanban, /<CustomScrollArea ariaLabel=\{props\.t\("kanbanLinkedNote"\)\}/);
	assert.match(kanban, /createBackdropDismiss\(closeDetails\)/);
	assert.match(kanban, /<Portal mount=\{document\.querySelector\("\[data-omega-app-shell\]"\) \?\? document\.body\}>/);
	assert.match(kanban, /<AsciiBackdrop placement="modal" \/>/);
	assert.match(kanban, /registerVisibilityAnimation\(element, detailPresence\.exiting, "dialog"\)/);
	assert.match(kanban, /role="dialog" aria-modal="true" aria-labelledby=\{detailHeadingId\}/);
	assert.match(kanban, /window\.addEventListener\("keydown", escape, true\)/);
	assert.doesNotMatch(kanban, /descriptionDraft|kanbanDescription|cardDescription/);
	assert.match(kanban, /props\.t\("kanbanPriority"\)/);
	assert.match(kanban, /type="date"/);
	assert.match(kanban, /props\.t\("kanbanLabels"\)/);
	assert.match(kanban, /onSubmit=\{event => void saveDetails\(event\)\}/);
});

test('temporary note preview activates only with the left Alt key', async () => {
	const preview = await source('../src/features/temporary-note-reading/model/temporary-reading.controller.ts');
	assert.match(preview, /event\.code === "AltLeft"/);
	assert.doesNotMatch(preview, /event\.key === "Alt"|event\.code === "AltRight"/);
	assert.match(preview, /else if \(leftAltDown && !\["Shift", "Meta"\]\.includes\(event\.key\)\)/);
});

test('media catalog offers confirmed global deletion from the right-click menu', async () => {
	const [catalog, view, backend, command] = await Promise.all([
		source('../src/pages/notes/ui/media-catalog-dialog/controller.ts'),
		source('../src/pages/notes/ui/media-catalog-dialog/index.tsx'),
		source('../../backend/src/images/service.rs'),
		source('../../backend/src/dispatch.rs'),
	]);
	assert.match(view, /onContextMenu=\{\(event\) => props\.catalog\.openContextMenu\(media, event/);
	assert.match(view, /data-media-context-menu/);
	assert.match(catalog, /setConfirmationMedia\(target\)/);
	assert.match(catalog, /await props\.onDeleteMedia\(target\.mediaType, target\.mediaId\)/);
	assert.match(catalog, /mediaType: "audio", mediaId: source\.audioId/);
	assert.match(catalog, /mediaType: "video", mediaId: source\.videoId/);
	assert.match(view, /<DeleteConfirmationDialog/);
	assert.match(view, /onConfirm=\{props\.catalog\.confirmMediaDeletion\}/);
	assert.doesNotMatch(catalog + view, /\b(?:confirm|alert)\s*\(/);
	assert.match(backend, /remove_media_reference_from_note_file/);
	assert.match(backend, /delete_media_from_all_vaults/);
	assert.match(command, /"delete_note_media"\s*=>/);
});

test('vault deletion uses the shared confirmation dialog and its destructive style', async () => {
	const [vaultDialog, sharedDialog, sharedStyle] = await Promise.all([
		source('../src/features/manage-vault/ui/vault-dialog/index.tsx'),
		source('../src/shared/ui/delete-confirmation-dialog/index.tsx'),
		source('../src/shared/ui/delete-confirmation-dialog/style.css.ts'),
	]);
	assert.match(vaultDialog, /import DeleteConfirmationDialog from "@\/shared\/ui\/delete-confirmation-dialog"/);
	assert.match(vaultDialog, /<DeleteConfirmationDialog[\s\S]*?message=\{props\.t\("deleteVaultConfirmation"\)\}/);
	assert.doesNotMatch(vaultDialog, /styles\.(?:confirmBackdrop|confirmDialog|deleteConfirm)/);
	assert.match(sharedDialog, /<h2 class=\{styles\.title\}/);
	assert.match(sharedStyle, /backgroundColor: "var\(--danger-hover\)"/);
});

test('delete confirmation keeps its message visible while the dialog exits', async () => {
	const dialog = await source('../src/shared/ui/delete-confirmation-dialog/index.tsx');
	assert.match(dialog, /const message = createMemo<string>\(previous => props\.open \? props\.message : previous \?\? props\.message\)/);
	assert.match(dialog, /<p class=\{styles\.message\} id=\{messageId\}>\{message\(\)\}<\/p>/);
});

test('Kanban lanes keep equal horizontal padding beside the overlay scrollbar', async () => {
	const kanban = await source('../src/features/manage-kanban/ui/kanban-panel/index.tsx');
	assert.match(kanban, /viewportStyle=\{\{ padding: "2px 12px 12px" \}\}/);
});

test('Kanban priority filter uses the shared dropdown component', async () => {
	const kanban = await source('../src/features/manage-kanban/ui/kanban-panel/index.tsx');
	assert.match(kanban, /import Dropdown from "@\/shared\/ui\/dropdown"/);
	assert.match(kanban, /<Dropdown ariaLabel=\{props\.t\("kanbanPriority"\)\} value=\{priorityFilter\(\)\}/);
	assert.match(kanban, /kanbanPriorities\.filter\(priority => priority !== "none"\)/);
	assert.match(kanban, /onChange=\{value => setPriorityFilter\(value as KanbanPriority \| "all"\)\}/);
});

test('Kanban WIP editor opens from the count and zero means unlimited', async () => {
	const kanban = await source('../src/features/manage-kanban/ui/kanban-panel/index.tsx');
	assert.match(kanban, /<Show when=\{wipEditorStatus\(\) === status\} fallback=\{[\s\S]*?<Button class=\{styles\.count\}/);
	assert.match(kanban, /<input class=\{styles\.wipInput\}[\s\S]*?onBlur=\{event => finishWipEditor\(status, event\.currentTarget\)\}/);
	assert.match(kanban, /document\.addEventListener\("pointerdown", commitWipEditorOutside, true\)/);
	assert.doesNotMatch(kanban, /styles\.wipEditor/);
	assert.doesNotMatch(kanban, /Icon name="sliders"/);
	assert.match(kanban, /type="number" min="0"/);
	assert.match(kanban, /value === 0 \? undefined : value/);
});

test('empty Kanban lanes do not show an empty-state message or placeholder', async () => {
	const kanban = await source('../src/features/manage-kanban/ui/kanban-panel/index.tsx');
	assert.doesNotMatch(kanban, /kanbanEmpty|styles\.empty/);
});

test('multi-column Kanban lanes stretch to the available height', async () => {
	const style = await source('../src/features/manage-kanban/ui/kanban-panel/style.css.ts');
	assert.match(style, /lanesFive: style\(\{ height: "100%", gridTemplateColumns: `repeat\(\$\{kanbanStatuses\.length\}, minmax\(0, 1fr\)\)`, alignContent: "stretch" \}\)/);
	assert.match(style, /lane: style\(\{\s*display: "grid",\s*alignContent: "start"/);
});

test('Kanban uses only a temporary drag insertion gap, not permanent empty slots', async () => {
	const [kanban, style] = await Promise.all([
		source('../src/features/manage-kanban/ui/kanban-panel/index.tsx'),
		source('../src/features/manage-kanban/ui/kanban-panel/style.css.ts'),
	]);
	assert.doesNotMatch(kanban, /kanbanSlotCount|slotPositions|positionSlot/);
	assert.doesNotMatch(kanban, /draggedItem/);
	assert.match(kanban, /dropPlaceholder\(\)/);
	assert.match(kanban, /getDropPosition\(lane, clientY\)/);
	assert.match(kanban, /draggable=\{false\}/);
	assert.match(kanban, /onPointerDown=\{event => startDrag\(event, item\)\}/);
	assert.match(kanban, /window\.addEventListener\("pointermove", moveCardDrag, \{ capture: true, passive: false \}\)/);
	assert.match(kanban, /Math\.hypot\(event\.clientX - drag\.startX, event\.clientY - drag\.startY\) < 5/);
	assert.match(kanban, /drag\.source\.cloneNode\(true\)/);
	assert.match(kanban, /cardDrag\.preview\?\.remove\(\)/);
	assert.doesNotMatch(kanban, /onDragStart|onDragOver|onDrop|setDragImage|dataTransfer/);
	assert.match(kanban, /document\.documentElement\.classList\.toggle\(styles\.dragging, Boolean\(draggedId\(\)\)\)/);
	assert.match(kanban, /document\.documentElement\.classList\.remove\(styles\.dragging\)/);
	assert.match(style, /const dragging = style\(\{ cursor: "none" \}\)/);
	assert.match(style, /globalStyle\(`\$\{dragging\}, \$\{dragging\} \*`, \{ cursor: "none !important" \}\)/);
	assert.match(style, /dragPreview: style\(\{ position: "fixed", zIndex: 20, pointerEvents: "none", opacity: 0\.92/);
	assert.match(style, /draggedSource: style\(\{ position: "absolute"/);
	assert.match(style, /dropPlaceholder: style\(\{ boxSizing: "border-box", width: "100%", minHeight: 56, pointerEvents: "none" \}\)/);
});

test('frontend globally suppresses browser default focus outlines', async () => {
	const css = await source('../src/index.css');
	assert.match(css, /\*:focus\s*\{\s*outline:\s*none;/);
});

test('left-clicking the right edge of a vault row toggles its actions without selecting it', async () => {
	const [dialog, style] = await Promise.all([
		source('../src/features/manage-vault/ui/vault-dialog/index.tsx'),
		source('../src/features/manage-vault/ui/vault-dialog/style.css.ts'),
	]);
	assert.match(dialog, /if \(event\.target === event\.currentTarget\) \{\s*props\.onClearError\(\);\s*toggleVaultActions\(vault\.id\);\s*\}/);
	assert.match(dialog, /event\.stopPropagation\(\);\s*toggleVaultActions\(vault\.id\)/);
	assert.match(style, /vaultActionsHitArea: style\(\{ paddingRight: 6, marginRight: -5, cursor: "pointer" \}\)/);
	assert.match(style, /"&:hover:not\(:has\(button:hover\)\)::after": \{ backgroundColor: "var\(--surface-hover\)" \}/);
	const vaultActionsStyle = style.match(/vaultActions: style\(\{([\s\S]*?)\n\t\}\),/)?.[1] ?? "";
	assert.doesNotMatch(vaultActionsStyle, /:hover/);
});

test('vault edit and delete actions do not change their background on hover', async () => {
	const [dialog, style] = await Promise.all([
		source('../src/features/manage-vault/ui/vault-dialog/index.tsx'),
		source('../src/features/manage-vault/ui/vault-dialog/style.css.ts'),
	]);
	assert.equal((dialog.match(/class=\{cx\(styles\.iconAction, styles\.vaultActionNoBackground\)\}/g) ?? []).length, 2);
	assert.match(style, /"&:hover": \{ color: "var\(--ink\)", backgroundColor: "var\(--surface-hover\)" \}/);
	assert.doesNotMatch(style, /"&:has\(button:hover\)"/);
	assert.match(style, /vaultActionNoBackground: style\(\{\s*selectors: \{ "&&:hover": \{ backgroundColor: "transparent" \} \}/);
});

test('Kanban width transition remains active when window resizing moves it to another session', async () => {
	const [panel, style] = await Promise.all([
		source('../src/features/manage-kanban/ui/kanban-panel/index.tsx'),
		source('../src/features/manage-kanban/ui/kanban-panel/style.css.ts'),
	]);
	assert.match(style, /transition: "width 100ms cubic-bezier\(0\.2, 0\.7, 0\.3, 1\)"/);
	assert.doesNotMatch(style, /panelWindowResizing|transition: "none"/);
	assert.doesNotMatch(panel, /windowResizing|panelWindowResizing/);
	assert.match(panel, /resizeKanbanPanelForViewport/);
});

test('static note locks are exposed and excluded from dragging and auto-separation', async () => {
	const [canvas, controller, style] = await Promise.all([
		source('../src/pages/canvas/ui/graph-canvas/index.tsx'),
		source('../src/pages/canvas/ui/graph-canvas/controller.ts'),
		source('../src/pages/canvas/ui/graph-canvas/style.css.ts'),
	]);
	assert.match(canvas, /graph\.toggleNoteLock\(current\.id\)/);
	assert.match(canvas, /graph\.areLockTargetsLocked\(menu\(\)\.noteId\)/);
	assert.match(canvas, /styles\.lockedBubble/);
	assert.doesNotMatch(canvas, /lockBadge/);
	assert.match(style, /lockedBubble: style\(\{[\s\S]*?borderColor: "var\(--ink\)"/);
	assert.match(controller, /if \(isLocked\(note\.id\)\) \{ setSelectedIds\(new Set\(\[note\.id\]\)\); return; \}/);
	assert.match(controller, /separateStaticNodes\(next, layoutNodes\(\), priority, new Set\(lockedNoteIds\(\)\)\)/);
});

test('Lo-fi radio controls remain in Pomodoro while its player lives for the app lifetime', async () => {
	const [titlebar, app, pomodoro, player, controller] = await Promise.all([
		source('../src/app/ui/window-titlebar/index.tsx'),
		source('../src/app/index.tsx'),
		source('../src/features/pomodoro/ui/pomodoro-panel/index.tsx'),
		source('../src/features/lofi-player/model/player.tsx'),
		source('../src/app/controller.ts'),
	]);
	assert.ok(pomodoro.indexOf('<LofiPlayerPanel') < pomodoro.indexOf('<section class={styles.timer}'));
	assert.match(app, /const AppView: Component = \(\) => \{\s*const app = useAppController\(\)/);
	assert.match(app, /const App: Component = \(\) => <LofiPlayerProvider><AppView \/><\/LofiPlayerProvider>/);
	assert.match(player, /<audio/);
	assert.match(player, /onCleanup\(\(\) => \{[\s\S]*?cancelAudio\(\)/);
	assert.match(player, /isNoteMediaPlaying\(\) \|\| muted\(\) \|\| pomodoroMuted\(\) \? 0 : volume\(\)/);
	assert.match(player, /audio\.volume = effectiveVolume\(\)/);
	assert.match(controller, /lofiPlayer\.setPomodoroMuted\(pomodoro\.muteLofi\(\)\)/);
	assert.doesNotMatch(app, /MusicPlayerPanel|musicOpen|onMusic/);
	assert.doesNotMatch(titlebar, /musicPlayerOpen|musicButton|onMusic/);
});

test('tray menu presents Play/Pause while starting playback or toggling mute', async () => {
	const [tray, controller, player, electron, electronTray, tauri, tauriBridge, pt, en] = await Promise.all([
		source('../src/app/api/tray.repository.ts'),
		source('../src/app/controller.ts'),
		source('../src/features/lofi-player/model/player.tsx'),
		source('../../bridge/electron/main.mjs'),
		source('../../bridge/electron/tray-menu.mjs'),
		source('../../bridge/tauri/src/main.rs'),
		source('../src/shared/lib/desktop-tauri.ts'),
		source('../lang/pt-br.json').then(JSON.parse),
		source('../lang/en.json').then(JSON.parse),
	]);
	assert.match(tray, /"music-play-pause" \| "music-next"/);
	assert.match(controller, /if \(lofiPlayer\.isActive\(\)\) \{ lofiPlayer\.toggleMute\(\); return; \}/);
	assert.match(controller, /if \(lofiPlayer\.muted\(\)\) lofiPlayer\.toggleMute\(\);\s*lofiPlayer\.togglePlayback\(\)/);
	assert.match(controller, /case "music-play-pause": toggleTrayMusic\(\)/);
	assert.match(controller, /case "music-next": lofiPlayer\.nextSource\(\)/);
	assert.match(player, /isNoteMediaPlaying\(\) \|\| muted\(\) \|\| pomodoroMuted\(\) \? 0 : volume\(\)/);
	assert.match(electron, /musicPlaying: trayMusicPlaying/);
	assert.match(electronTray, /music: musicPlaying \? labels\.musicPause : labels\.musicPlay/);
	assert.match(electron, /'music-play-pause'/);
	assert.match(electron, /'music-next'/);
	assert.match(tauri, /music_playing/);
	assert.match(tauri, /set_icon\(Some\(image\)\)/);
	assert.match(tauri, /tray_icon_variant\([\s\S]*?running,[\s\S]*?music_playing/);
	assert.match(tauri, /labels\.music_pause[\s\S]*labels\.music_play/);
	assert.match(tauri, /"music-play-pause" => emit_tray_action\(app, "music-play-pause"\)/);
	assert.match(tauri, /"music-next"/);
	assert.match(tauriBridge, /musicPlaying: args\.musicPlaying/);
	assert.equal(pt.musicPlayerPlay, 'Reproduzir música');
	assert.equal(pt.musicPlayerPause, 'Pausar música');
	assert.equal(en.musicPlayerPlay, 'Play music');
	assert.equal(en.musicPlayerPause, 'Pause music');
	assert.doesNotMatch([tray, controller, electron, electronTray, tauri, tauriBridge].join(''), /music-toggle-mute|musicMuted|musicMute|musicUnmute/);
	assert.equal(pt.trayPomodoroStart, 'Iniciar relógio');
	assert.equal(pt.trayPomodoroPause, 'Pausar relógio');
	assert.equal(pt.trayPomodoroReset, 'Reiniciar relógio');
	assert.equal(en.trayPomodoroStart, 'Start timer');
	assert.equal(en.trayPomodoroReset, 'Reset timer');
	assert.doesNotMatch(tray, /pomodoro-next/);
	assert.doesNotMatch(electron, /trayLabels\.next|pomodoro-next/);
	assert.doesNotMatch(tauri, /"next" => emit_tray_action\(app, "pomodoro-next"\)/);
});

test('Pomodoro settings overlay the timer without changing its layout', async () => {
	const [pomodoro, styles] = await Promise.all([
		source('../src/features/pomodoro/ui/pomodoro-panel/index.tsx'),
		source('../src/features/pomodoro/ui/pomodoro-panel/style.css.ts'),
	]);
	assert.ok(pomodoro.indexOf('<section class={styles.timer}') < pomodoro.indexOf('<div class={styles.settingsOverlay}'));
	assert.ok(pomodoro.indexOf('<div class={styles.settingsOverlay}') < pomodoro.indexOf('<div class={styles.clock}'));
	assert.match(styles, /timer: style\(\{ position: "relative"/);
	assert.match(styles, /settingsOverlay: style\(\{ position: "absolute"[^}]*zIndex: 2/);
	assert.equal((pomodoro.match(/onChange=\{saveSettings\}/g) ?? []).length, 4);
	const settingsStart = pomodoro.indexOf('<div class={styles.settingsForm}>');
	const settingsForm = pomodoro.slice(settingsStart, pomodoro.indexOf('</div>', settingsStart));
	assert.doesNotMatch(settingsForm, /<Button|type="submit"|props\.t\("save"\)/);
	assert.match(pomodoro, /if \(showSettings\(\) && \(/);
	assert.match(pomodoro, /Icon name=\{props\.pomodoro\.running\(\) \? "pause" : "play"\}/);
	assert.match(pomodoro, /size=\{16\} \/>\s*<\/Button>\s*<Show when=\{props\.pomodoro\.timerReady\(\) && props\.pomodoro\.seconds\(\) !== props\.pomodoro\.phaseSeconds\(\)\}/);
	assert.match(pomodoro, /<Icon name="reset" size=\{14\} \/>/);
	assert.match(styles, /primaryButton: style\(\[button, \{ boxSizing: "border-box", width: 64, minWidth: 64, height: 32, minHeight: 32/);
	assert.match(styles, /resetButton: style\(\[button, \{ position: "absolute", top: "50%", left: "calc\(50% \+ 38px\)"[^}]*width: 36, minWidth: 36, height: 32, minHeight: 32/);
});

test('Archive canvas layout is no longer selectable or rendered', async () => {
	const settings = await source('../src/features/change-preferences/ui/settings-dialog/index.tsx');
	const canvas = await source('../src/pages/canvas/ui/canvas/index.tsx');
	assert.doesNotMatch(settings, /value:\s*"archive"|archiveCanvas/);
	assert.doesNotMatch(canvas, /archive-view|layout\s*===\s*"archive"/);
	assert.match(canvas, /GraphCanvas/);
});
