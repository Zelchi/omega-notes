import { motion } from "@/shared/ui/motion.css";
import { style } from "@vanilla-extract/css";

export const styles = {
	menu: style({
		...motion.menu,
		position: "fixed",
		zIndex: 20,
		display: "grid",
		width: 152,
		gap: 2,
		padding: 4,
		backgroundColor: "var(--surface-panel)",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: "var(--border-strong)",
		borderRadius: 6,
	}),
	button: style({
		minHeight: 32,
		paddingInline: 9,
		color: "var(--ink)",
		backgroundColor: "transparent",
		borderWidth: 0,
		borderRadius: 4,
		fontSize: 12,
		textAlign: "left",
		cursor: "pointer",
		selectors: { "&:hover": { backgroundColor: "var(--surface-hover)" } },
	}),
	dangerButton: style({
		color: "var(--danger)",
		selectors: { "&:hover": { color: "var(--danger-hover)" } },
	}),
};
