import { style } from "@vanilla-extract/css";

export const styles = {
	node: style({ position: "absolute", touchAction: "none", cursor: "default" }),
	positioning: style({ zIndex: 3 }),
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
};
