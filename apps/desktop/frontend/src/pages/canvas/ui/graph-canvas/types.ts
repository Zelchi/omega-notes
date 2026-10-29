import type { CanvasSnapshot, CanvasRestore } from "@/features/undo-canvas-edit";
import type { Point } from "../../model/graph";
import type { NoteSummary, StudyNote } from "@/entities/note";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { NoteLockShortcut } from "@/features/change-preferences/model/note-lock-shortcut";

export type { Edge, GraphState, NodeSize, Point, View, ZipTie } from "../../model/graph";

export type GraphCanvasProps = {
	vaultId: string;
	mode: "edit" | "view";
	busy: boolean;
	suspended?: boolean;
	noteLockShortcut: NoteLockShortcut;
	noteLockShortcutEnabled: boolean;
	restoration?: CanvasRestore;
	onRegisterHistory: (vaultId: string, reader: () => CanvasSnapshot) => () => void;
	onHistoryRestored: () => void;
	onNoteCreated: (vaultId: string, note: StudyNote, before: CanvasSnapshot, after: CanvasSnapshot) => void;
	onNotesMoved: (vaultId: string, before: CanvasSnapshot, after: CanvasSnapshot) => void;
	notes: NoteSummary[];
	onCreateNote: () => Promise<StudyNote | undefined>;
	onOpenNote: (note: NoteSummary) => void;
	onRequestRename: (note: NoteSummary) => void;
	onDeleteNote: (note: NoteSummary) => Promise<void>;
	centerOnMount: boolean;
	onCanvasMount: () => void;
	hideCanvasControls: boolean;
	t: (key: TranslationKey) => string;
};

export type Gesture = {
	pointerId: number;
	kind: "pan" | "node" | "selection";
	startX: number;
	startY: number;
	originX: number;
	originY: number;
	button: number;
	nodeOrigins?: Record<string, Point>;
	beforeSnapshot?: CanvasSnapshot;
	selection?: {
		baseline: Set<string>;
		additive: boolean;
		boardLeft: number;
		boardTop: number;
		scale: number;
		bounds: { id: string; left: number; top: number; right: number; bottom: number }[];
	};
	moved: boolean;
};
export type ContextMenu = { noteId: string; x: number; y: number };
export type PendingMove = { pointerId: number; clientX: number; clientY: number };

export type SelectionBox = { x: number; y: number; width: number; height: number };
