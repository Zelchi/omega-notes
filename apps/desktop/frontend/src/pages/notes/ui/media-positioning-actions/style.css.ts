import { style } from "@vanilla-extract/css";

export const styles = {
	root: style({
		position: "absolute",
		zIndex: 5,
		top: "calc(100% + 8px)",
		display: "grid",
		gridTemplateColumns: "1fr 3fr 1fr",
		width: 160,
		gap: 4,
		padding: 4,
		backgroundColor: "var(--surface-panel)",
		border: "1px solid var(--border-strong)",
		borderRadius: 6,
	}),
	button: style({
		display: "grid",
		placeItems: "center",
		width: "100%",
		minWidth: 0,
		height: 30,
		padding: 0,
		color: "var(--ink)",
		backgroundColor: "var(--surface-panel)",
		border: "1px solid var(--border-strong)",
		borderRadius: 5,
		cursor: "pointer",
		pointerEvents: "auto",
		selectors: {
			"&:hover": { backgroundColor: "var(--surface-hover)", borderColor: "var(--border-hover)" },
			"&:focus-visible": { outline: "2px solid var(--focus)", outlineOffset: -2 },
		},
	}),
	danger: style({ color: "var(--danger)" }),
};
