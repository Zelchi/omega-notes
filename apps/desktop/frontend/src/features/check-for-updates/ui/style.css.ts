import { style } from "@vanilla-extract/css";

export const styles = {
	row: style({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, width: "100%", minHeight: 40 }),
	version: style({ color: "var(--text-option)", fontSize: 12, whiteSpace: "nowrap" }),
	button: style({
		width: 160,
		maxWidth: "55%",
		flexShrink: 0,
		minHeight: 34,
		padding: "7px 10px",
		fontSize: 12,
		whiteSpace: "nowrap",
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
