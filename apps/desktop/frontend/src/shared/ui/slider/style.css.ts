import { style } from "@vanilla-extract/css";

export const sliderStyles = {
	slider: style({
		display: "block",
		width: "100%",
		height: 14,
		margin: 0,
		padding: 0,
		appearance: "none",
		border: 0,
		borderRadius: 0,
		backgroundColor: "transparent",
		cursor: "pointer",
		selectors: {
			"&::-webkit-slider-runnable-track": {
				background:
					"linear-gradient(to right, var(--slider-color, var(--ink)) 0%, var(--slider-color, var(--ink)) var(--slider-progress), var(--border-strong) var(--slider-progress), var(--border-strong) 100%)",
				height: 3,
				borderRadius: 999,
			},
			"&::-webkit-slider-thumb": {
				width: 10,
				height: 10,
				marginTop: -3.5,
				appearance: "none",
				border: 0,
				borderRadius: "50%",
				backgroundColor: "var(--ink)",
			},
			"&::-moz-range-track": {
				height: 3,
				border: 0,
				borderRadius: 999,
				background:
					"linear-gradient(to right, var(--slider-color, var(--ink)) 0%, var(--slider-color, var(--ink)) var(--slider-progress), var(--border-strong) var(--slider-progress), var(--border-strong) 100%)",
			},
			"&::-moz-range-thumb": {
				width: 10,
				height: 10,
				border: 0,
				borderRadius: "50%",
				backgroundColor: "var(--ink)",
			},
		},
	}),
	volumeSlider: style({
		width: "100%",
		minWidth: 0,
		selectors: {
			"&&::-webkit-slider-runnable-track": { height: 6 },
			"&&::-webkit-slider-thumb": {
				width: 12,
				height: 12,
				marginTop: -3,
				boxSizing: "border-box",
				border: "2px solid var(--muted)",
				backgroundColor: "var(--surface-editor)",
			},
			"&&::-moz-range-track": { height: 6 },
			"&&::-moz-range-thumb": {
				width: 12,
				height: 12,
				boxSizing: "border-box",
				border: "2px solid var(--muted)",
				backgroundColor: "var(--surface-editor)",
			},
		},
	}),
};
