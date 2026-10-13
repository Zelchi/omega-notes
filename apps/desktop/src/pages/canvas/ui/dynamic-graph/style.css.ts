import { style } from "@vanilla-extract/css";
import { motion } from "@/shared/ui/motion.css";

export const styles = {
	root: style({ ...motion.fade, position: "relative", width: "100%", height: "100%", overflow: "hidden", backgroundColor: "var(--board)", backgroundImage: "radial-gradient(var(--board-dots) 0.8px, transparent 0.8px)", backgroundSize: "21px 21px", touchAction: "none", userSelect: "none", cursor: "grab" }),
	world: style({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", transformOrigin: "top left", overflow: "visible" }),
	edges: style({ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }),
	edge: style({ stroke: "var(--edge)", strokeWidth: 1, opacity: 0.45, vectorEffect: "non-scaling-stroke", transition: "opacity 140ms ease" }),
	highlightedEdge: style({ stroke: "var(--ink)", opacity: 0.9, strokeWidth: 1.5 }),
	dimmedEdge: style({ opacity: 0.12 }),
	node: style({ position: "absolute", left: 0, top: 0, width: 0, height: 0, color: "var(--text-control)", pointerEvents: "none", transition: "opacity 140ms ease", selectors: { "&:hover": { color: "var(--ink)", zIndex: 2 }, "&:focus-within": { color: "var(--ink)" } } }),
	hitTarget: style({ position: "absolute", display: "grid", placeItems: "center", padding: 0, border: 0, backgroundColor: "transparent", borderRadius: "50%", cursor: "grab", touchAction: "none", pointerEvents: "auto", selectors: { "&:active": { cursor: "grabbing" } } }),
	dot: style({ display: "block", backgroundColor: "var(--text-control)", borderRadius: "50%", pointerEvents: "none", transition: "background-color 140ms ease", selectors: { "button:hover &": { backgroundColor: "var(--ink)" }, "button:focus-visible &": { outline: "2px solid var(--ink)", outlineOffset: -2 } } }),
	highlightedDot: style({ backgroundColor: "var(--ink)" }),
	draggedDot: style({ outline: "2px solid var(--ink)", outlineOffset: -2 }),
	dimmedNode: style({ opacity: 0.35 }),
	label: style({ position: "absolute", left: 0, transform: "translateX(-50%)", width: "max-content", pointerEvents: "none", maxWidth: 150, fontSize: 11, lineHeight: 1.3, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }),
	controls: style({ position: "absolute", right: 13, bottom: 13, display: "flex", alignItems: "center", gap: 4, padding: 4, border: "1px solid var(--border-strong)", borderRadius: 6, backgroundColor: "var(--surface-controls)" }),
	button: style({ display: "grid", placeItems: "center", width: 29, height: 28, padding: 0, border: 0, borderRadius: 4, backgroundColor: "transparent", color: "var(--text-control)", cursor: "pointer", fontSize: 16, selectors: { "&:hover": { backgroundColor: "var(--surface-hover)", color: "var(--ink)" } } }),
};
