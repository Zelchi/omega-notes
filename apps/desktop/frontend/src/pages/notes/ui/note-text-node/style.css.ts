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
	caret: style([caretStyle, {
		transition: "left 80ms ease-out, top 80ms ease-out",
	}]),
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
	contextMenu: style({
		position: "fixed",
		zIndex: 20,
		display: "grid",
		width: 220,
		gap: 2,
		padding: 4,
		backgroundColor: "var(--surface-panel)",
		borderWidth: 1,
		borderStyle: "solid",
		borderColor: "var(--border-strong)",
		borderRadius: 6,
		boxShadow: "0 6px 24px rgb(0 0 0 / 18%)",
	}),
	contextMenuButton: style({
		display: "flex",
		alignItems: "center",
		gap: 8,
		minHeight: 32,
		paddingInline: 9,
		color: "var(--ink)",
		backgroundColor: "transparent",
		borderWidth: 0,
		borderRadius: 4,
		fontSize: 12,
		textAlign: "left",
		cursor: "pointer",
		selectors: {
			"&:hover:not(:disabled)": { backgroundColor: "var(--surface-hover)" },
			"&:disabled": { opacity: 0.45, cursor: "default" },
		},
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
