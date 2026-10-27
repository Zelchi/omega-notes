import type { NoteSummary } from "@/entities/note";
import type { CanvasZipTie } from "@/features/undo-canvas-edit";

export type Point = { x: number; y: number };
export type View = Point & { scale: number };
export type GraphState = { positions: Record<string, Point>; view?: View; zipTies?: CanvasZipTie[]; lockedNoteIds?: string[] };
export type ZipTie = CanvasZipTie;
export type Edge = { source: NoteSummary; target: NoteSummary };
export type NodeSize = { width: number; height: number };
