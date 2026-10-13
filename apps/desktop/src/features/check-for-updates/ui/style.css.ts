import { style } from "@vanilla-extract/css";

export const styles = {
	button: style({
		width: "100%",
		minHeight: 36,
		padding: "8px 12px",
		fontSize: 12,
		color: "var(--ink)",
		backgroundColor: "var(--surface-input)",
		border: "1px solid var(--border-strong)",
		borderRadius: 5,
		cursor: "pointer",
		selectors: {
			"&:hover:not(:disabled)": { backgroundColor: "var(--surface-hover)" },
			"&:disabled": { opacity: 0.65, cursor: "wait" },
			"&:focus-visible": { outline: "2px solid var(--focus)", outlineOffset: 2 },
		},
	}),
};
