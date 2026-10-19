import { style } from "@vanilla-extract/css";
import { motion } from "@/shared/ui/motion.css";

export const tooltipStyle = style({
	...motion.fade,
	position: "fixed",
	zIndex: 60,
	maxWidth: "min(260px, calc(100vw - 16px))",
	padding: "6px 9px",
	border: "1px solid var(--border-soft)",
	borderRadius: 5,
	backgroundColor: "var(--surface-panel)",
	color: "var(--ink)",
	fontSize: 12,
	lineHeight: 1.5,
	textAlign: "center",
	overflowWrap: "anywhere",
	pointerEvents: "none",
	userSelect: "none",
});
