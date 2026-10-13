import { style } from "@vanilla-extract/css";

export const styles = {
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
