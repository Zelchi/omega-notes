import { sliderStyles } from "@/shared/ui/slider/style.css";
import { style } from "@vanilla-extract/css";

export const styles = {
	root: style({
		width: "100%",
		height: "100%",
	}),
	source: style({ display: "none" }),
	controls: style({
		display: "grid",
		gridTemplateColumns: "30px 96px minmax(60px, 1fr) 30px",
		alignItems: "center",
		gap: 8,
		boxSizing: "border-box",
		width: "100%",
		height: "100%",
		padding: "0 8px",
		border: "1px solid var(--border-soft)",
		borderRadius: 3,
		backgroundColor: "var(--surface-editor)",
		color: "var(--ink)",
	}),
	button: style({
		display: "grid",
		placeItems: "center",
		width: 30,
		height: 30,
		padding: 0,
		border: 0,
		borderRadius: 4,
		backgroundColor: "transparent",
		color: "var(--ink)",
		cursor: "pointer",
		selectors: {
			"&:hover": { backgroundColor: "var(--surface-hover)" },
			"&:focus": { outline: "none", boxShadow: "none" },
		},
	}),
	buttonActive: style({ backgroundColor: "var(--surface-hover)" }),
	icon: style({ width: 17, height: 17 }),
	time: style({
		minWidth: 96,
		color: "var(--text-control)",
		fontSize: 11,
		fontVariantNumeric: "tabular-nums",
		textAlign: "center",
		whiteSpace: "nowrap",
	}),
	seek: style({ width: "100%", minWidth: 0 }),
	slider: sliderStyles.slider,
	volumeSlider: sliderStyles.volumeSlider,
};
