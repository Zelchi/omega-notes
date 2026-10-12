import { globalStyle, keyframes, style } from "@vanilla-extract/css";

const caretBlink = keyframes({
	"0%, 49%": { opacity: 1 },
	"50%, 100%": { opacity: 0 },
});

const content = style({
	position: "absolute",
	inset: 0,
	display: "block",
	width: "auto",
	height: "auto",
	color: "inherit",
	outline: "none",
	font: "inherit",
	lineHeight: "inherit",
	whiteSpace: "pre-wrap",
	WebkitUserSelect: "text",
	userSelect: "text",
});

globalStyle(`${content} *`, {
	WebkitUserSelect: "text",
	userSelect: "text",
});

export const styles = {
	text: style({
		position: "absolute",
		inset: 0,
		margin: 0,
		color: "var(--ink)",
		fontFamily: "var(--display)",
		fontSize: 16,
		fontWeight: 400,
		lineHeight: 1.65,
		overflowWrap: "anywhere",
		whiteSpace: "pre-wrap",
	}),
	locked: style({
		pointerEvents: "none",
	}),
	content,
	editing: style({
		cursor: "text",
		caretColor: "transparent",
	}),
	caret: style({
		position: "absolute",
		zIndex: 2,
		width: 1.5,
		backgroundColor: "var(--ink)",
		borderRadius: 1,
		pointerEvents: "none",
		animation: `${caretBlink} 1s steps(1, end) infinite`,
		selectors: {
			':is([data-text-cursor="terminal"], [data-text-cursor="terminal-static"]) &': {
				width: "0.6em",
				borderRadius: 0,
				backgroundColor: "#fff",
				mixBlendMode: "difference",
			},
			':is([data-text-cursor="line-static"], [data-text-cursor="terminal-static"]) &': {
				animation: "none",
			},
		},
	}),
	fragment: style({
		position: "absolute",
		display: "block",
		margin: 0,
		whiteSpace: "pre",
		overflowWrap: "normal",
		wordBreak: "normal",
		cursor: "text",
		WebkitUserSelect: "text",
		userSelect: "text",
	}),
	naturalFragment: style({
		position: "relative",
		display: "block",
		width: "auto",
		minHeight: "1.65em",
		margin: 0,
		whiteSpace: "pre-wrap",
		overflowWrap: "anywhere",
		wordBreak: "normal",
		cursor: "text",
		WebkitUserSelect: "text",
		userSelect: "text",
	}),
};
