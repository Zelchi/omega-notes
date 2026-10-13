import { style } from "@vanilla-extract/css";

export const videoStyles = {
	root: style({
		position: "relative",
		width: "100%",
		height: "100%",
		backgroundColor: "#000",
		containerType: "inline-size",
		selectors: { "&:fullscreen": { width: "100vw", height: "100vh" } },
	}),
	video: style({
		display: "block",
		width: "100%",
		height: "100%",
		objectFit: "contain",
	}),
	controls: style({
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: "auto",
		minHeight: 38,
		gridTemplateColumns: "30px 96px minmax(0, 1fr) 30px 30px",
		gap: 4,
		padding: "4px 6px",
		borderRadius: 0,
		"@container": {
			"(max-width: 320px)": {
				gridTemplateColumns: "30px minmax(0, 1fr) 30px 30px",
			},
		},
	}),
	time: style({
		"@container": { "(max-width: 320px)": { display: "none" } },
	}),
	error: style({
		position: "absolute",
		top: 8,
		left: 8,
		right: 8,
		padding: 8,
		backgroundColor: "var(--surface-editor)",
		color: "var(--ink)",
		fontSize: 12,
	}),
};
