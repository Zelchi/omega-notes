import { style } from "@vanilla-extract/css";

export const styles = {
	findHighlights: style({ position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none", overflow: "hidden" }),
	findMatch: style({ position: "absolute", background: "rgba(255, 207, 64, 0.22)", borderRadius: 2 }),
	activeFindMatch: style({ background: "rgba(255, 171, 32, 0.42)", outline: "1px solid rgba(255, 171, 32, 0.8)", outlineOffset: -1 }),
	pasteError: style({
		position: "absolute",
		top: 4,
		left: 32,
		right: 32,
		zIndex: 3,
		color: "var(--danger)",
		fontSize: 12,
		textAlign: "center",
	}),
	host: style({
		display: "flex",
		justifyContent: "center",
		WebkitUserSelect: "text",
		userSelect: "text",
	}),
	paper: style({
		position: "relative",
		flex: "none",
		backgroundColor: "var(--surface-editor)",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: "var(--border-soft)",
		borderRadius: 2,
		overflow: "hidden",
		WebkitUserSelect: "text",
		userSelect: "text",
	}),
};
