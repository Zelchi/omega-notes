import { toolbarStyles } from "@/shared/ui/toolbar/style.css";
import { style } from "@vanilla-extract/css";

export const styles = {
	root: toolbarStyles.root,
	readOnlyRoot: style({ height: 46, pointerEvents: "none" }),
	row: toolbarStyles.row,
	subbar: style({
		pointerEvents: "auto",
		position: "absolute",
		bottom: "calc(100% + 8px)",
		left: "50%",
		transform: "translateX(-50%)",
		display: "flex",
		gap: 3,
		padding: 4,
		maxWidth: "calc(100vw - 32px)",
		backgroundColor: "var(--surface-search)",
		border: "1px solid var(--border-soft)",
		borderRadius: 6,
	}),
	button: toolbarStyles.button,
	deleteButton: style({ color: "var(--danger)", selectors: { "&:hover:not(:disabled)": { color: "var(--danger)", backgroundColor: "var(--danger-hover)" }, "&:disabled": { opacity: 0.45, cursor: "default" } } }),
	attachButton: style({ marginRight: 3 }),
	divider: toolbarStyles.divider,
	activeButton: style({ color: "var(--ink)", backgroundColor: "var(--surface-hover)" }),
};
