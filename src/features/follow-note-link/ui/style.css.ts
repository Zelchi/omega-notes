import { style } from "@vanilla-extract/css";

export const styles = {
	root: style({ position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none" }),
	link: style({
		position: "absolute", display: "block", cursor: "pointer", pointerEvents: "auto",
		backgroundColor: "transparent", borderBottom: "1px solid var(--muted)",
		selectors: { "&:hover": { borderColor: "var(--ink)" } },
	}),
};
