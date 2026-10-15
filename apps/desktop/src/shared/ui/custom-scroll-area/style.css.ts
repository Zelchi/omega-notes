import { style } from "@vanilla-extract/css";

const thumb = {
	position: "absolute",
	backgroundColor: "var(--subtle)",
	borderRadius: 2,
	cursor: "grab",
	touchAction: "none",
	selectors: {
		"&:hover": { backgroundColor: "var(--muted)" },
		"&:active": { backgroundColor: "var(--ink)" },
	},
} as const;

export const styles = {
	root: style({
		position: "relative",
		flex: 1,
		minWidth: 0,
		minHeight: 0,
		width: "100%",
		overflow: "hidden",
	}),
	viewport: style({
		width: "100%",
		height: "100%",
		overflow: "auto",
		overscrollBehavior: "contain",
		paddingBlock: "32px 50px",
		paddingInline: 56,
		"@media": {
			"(max-width: 1100px)": { paddingInline: 42 },
		},
	}),
	content: style({ minWidth: "100%", minHeight: "100%" }),
	verticalTrack: style({
		visibility: "var(--omega-scrollbar-visibility, visible)",
		position: "absolute",
		zIndex: 5,
		top: 8,
		right: "var(--omega-scrollbar-right, 4px)",
		bottom: 20,
		width: 14,
		touchAction: "none",
	}),
	horizontalTrack: style({
		visibility: "var(--omega-scrollbar-visibility, visible)",
		position: "absolute",
		zIndex: 5,
		right: 20,
		bottom: 4,
		left: 8,
		height: 14,
		touchAction: "none",
	}),
	verticalThumb: style({ ...thumb, top: 0, right: 2, width: 5, minHeight: 28 }),
	horizontalThumb: style({ ...thumb, bottom: 2, left: 0, height: 5, minWidth: 28 }),
};
