import { globalStyle, style } from "@vanilla-extract/css";
import { caretStyle } from "@/shared/ui/text-caret/style.css.ts";

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
	caret: caretStyle,
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
