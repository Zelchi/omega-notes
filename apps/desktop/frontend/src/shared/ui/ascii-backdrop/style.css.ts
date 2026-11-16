import { style } from "@vanilla-extract/css";

export const styles = {
	root: style({
		position: "absolute",
		zIndex: 0,
		inset: 0,
		overflow: "hidden",
		color: "var(--text-dim)",
		opacity: 0.56,
		pointerEvents: "none",
		selectors: {
			'&[data-theme="constellation"]': { color: "color-mix(in srgb, #8fb6ff 72%, var(--text-dim))" },
			'&[data-theme="matrix"]': { color: "color-mix(in srgb, #54e38b 72%, var(--text-dim))" },
		},
	}),
	modalLayer: style({
		zIndex: -1,
		opacity: 1,
		backgroundColor: "var(--canvas)",
		borderRadius: "inherit",
	}),
	engineSurface: style({
		position: "absolute",
		zIndex: 0,
		inset: 0,
		overflow: "hidden",
		isolation: "isolate",
		pointerEvents: "none",
	}),
};
