import type { StudyNote } from "@/entities/note";

export type Point = { x: number; y: number };
export type View = Point & { scale: number };
export type GraphState = { positions: Record<string, Point>; view?: View };
export type Edge = { source: StudyNote; target: StudyNote };
export type NodeSize = { width: number; height: number };
