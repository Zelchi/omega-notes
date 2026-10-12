import { style } from "@vanilla-extract/css";

export const styles = {
	canvasScroll: style({
		flex: 1,
		minWidth: 0,
		minHeight: 0,
		width: "100%",
		margin: 0,
		padding: 0,
		overflow: "hidden",
	}),
};
