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
	hideZoomControls: boolean;
	t: (key: TranslationKey) => string;
};

export type Gesture = {
	pointerId: number;
	kind: "pan" | "node";
	startX: number;
	startY: number;
	originX: number;
	originY: number;
	button: number;
	nodeId?: string;
	moved: boolean;
};
export type ContextMenu = { noteId: string; x: number; y: number };
export type PendingMove = { pointerId: number; clientX: number; clientY: number };
