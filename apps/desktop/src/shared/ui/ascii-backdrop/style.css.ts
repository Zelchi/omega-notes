import { keyframes, style } from "@vanilla-extract/css";

const blink = keyframes({
	"0%, 100%": { opacity: 0.25 },
	"50%": { opacity: 1 },
});

const codeFall = keyframes({
	from: { transform: "translateY(0)" },
	to: { transform: "translateY(100vh)" },
});

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
			'[data-placement="modal"] &': { opacity: 0.56 },
		},
	}),
	constellationGlyph: style({
		display: "inline-block",
		animation: `${blink} 2s steps(2, end) infinite`,
	}),
	codeGlyph: style({
		position: "absolute",
		top: -12,
		fontSize: 12,
		lineHeight: 1,
		animation: `${codeFall} var(--code-fall-duration, 30s) linear infinite`,
	}),
	codeRain: style({
		position: "absolute",
		inset: 0,
		overflow: "hidden",
		fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
		fontSize: 12,
		fontWeight: 500,
		lineHeight: 1,
		letterSpacing: "0.4em",
		selectors: {
			'[data-placement="modal"] &': { opacity: 0.56 },
		},
	}),
};
