import { style } from "@vanilla-extract/css";
import { motion } from "@/shared/ui/motion.css";

export const styles = {
	notice: style({
		...motion.fade,
		position: "absolute",
		bottom: "calc(100% + 12px)",
		left: 0,
		right: 0,
		margin: 0,
		padding: "12px 14px",
		backgroundColor: "var(--surface-panel)",
		color: "var(--danger)",
		border: "1px solid var(--border-strong)",
		borderRadius: 7,
		fontSize: 12,
		textAlign: "center",
		lineHeight: 1.5,
		overflowWrap: "anywhere",
	}),
};
