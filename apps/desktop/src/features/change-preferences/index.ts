export { default as SettingsDialog } from "./ui/settings-dialog";
export { usePreferences } from "./model/preferences.controller";
export { readLanguage, readNoteMode, saveNoteMode } from "./api/preferences.repository";
export type { BackgroundTheme, CanvasLayout, NoteMode } from "./model/preferences";
export { formatAiChatShortcut, matchesAiChatShortcut } from "./model/ai-chat-shortcut";
