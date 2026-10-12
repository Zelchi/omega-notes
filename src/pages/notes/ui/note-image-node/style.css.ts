import { style } from "@vanilla-extract/css";

export const styles = {
	node: style({ position: "absolute", touchAction: "none" }),
	lockedDuringPositioning: style({ pointerEvents: "none" }),
	image: style({
		display: "block",
		width: "100%",
		maxWidth: "none",
		maxHeight: "none",
		objectFit: "fill",
		touchAction: "none",
		cursor: "default",
	}),
	resizeHandle: style({
		position: "absolute",
		zIndex: 1,
		width: 12,
		height: 12,
		padding: 0,
		backgroundColor: "var(--ink)",
		borderWidth: 2,
		borderStyle: "solid",
		borderColor: "var(--surface-editor)",
		borderRadius: 2,
		cursor: "nwse-resize",
		touchAction: "none",
	}),
};
