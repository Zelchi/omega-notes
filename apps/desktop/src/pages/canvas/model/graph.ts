import type { NoteSummary } from "@/entities/note";

export type Point = { x: number; y: number };
export type View = Point & { scale: number };
export type GraphState = { positions: Record<string, Point>; view?: View };
export type Edge = { source: NoteSummary; target: NoteSummary };
export type NodeSize = { width: number; height: number };
