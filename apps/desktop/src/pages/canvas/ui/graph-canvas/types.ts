import type { Point } from "../../model/graph";
import type { StudyNote } from "@/entities/note";
import type { TranslationKey } from "@/shared/lib/i18n";

export type { Edge, GraphState, NodeSize, Point, View } from "../../model/graph";

export type GraphCanvasProps = {
	mode: "edit" | "view";
	notes: StudyNote[];
	onCreateNote: () => Promise<StudyNote | undefined>;
	onOpenNote: (note: StudyNote) => void;
	onRequestRename: (note: StudyNote) => void;
	onDeleteNote: (note: StudyNote) => Promise<void>;
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
