import { style } from "@vanilla-extract/css";

export const styles = {
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
