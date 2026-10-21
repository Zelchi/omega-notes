import { style } from "@vanilla-extract/css";

export const styles = {
	root: style({
		position: "absolute",
		zIndex: 0,
		inset: 0,
		display: "grid",
		placeItems: "center",
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
	art: style({
		maxWidth: "none",
		margin: 0,
		color: "inherit",
		fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
		fontSize: 12,
		fontWeight: 500,
		lineHeight: 1,
		letterSpacing: "0.08em",
		whiteSpace: "pre",
		selectors: {
			'[data-theme="matrix"] &': { letterSpacing: "0.4em" },
			'[data-placement="modal"] &': { opacity: 0.56 },
		},
	}),
};
