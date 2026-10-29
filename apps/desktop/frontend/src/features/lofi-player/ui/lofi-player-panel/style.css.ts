import { sliderStyles } from "@/shared/ui/slider/style.css";
import { style } from "@vanilla-extract/css";

const button = style({
	display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
	minHeight: 32, padding: "6px 10px", border: "1px solid var(--border-strong)", borderRadius: 5,
	background: "var(--surface-input)", color: "var(--ink)", fontSize: 12, cursor: "pointer",
	selectors: { "&:hover": { background: "var(--surface-hover)" }, "&:disabled": { opacity: .45, cursor: "default" } },
});

	export const styles = {
	radio: style({ display: "grid", gap: 10 }),
	stationRow: style({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }),
	station: style({ display: "grid", gap: 4, minWidth: 0 }),
	stationName: style({ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, fontWeight: 600 }),
	track: style({ overflow: "hidden", color: "var(--muted)", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }),
	controls: style({ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }),
	iconButton: style([button, { boxSizing: "border-box", width: 36, minWidth: 36, minHeight: 36, height: 36, padding: 0 }]),
	playButton: style([button, { boxSizing: "border-box", width: 42, minWidth: 42, minHeight: 36, height: 36, padding: 0,
		color: "var(--button-confirm-fg)", background: "var(--button-confirm-bg)", borderColor: "var(--button-confirm-bg)",
		selectors: { "&:hover": { opacity: .88, background: "var(--button-confirm-bg)" } } }]),
	volume: style({ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", alignItems: "center", gap: 10,
		color: "var(--muted)", fontSize: 12 }),
	volumeSlider: sliderStyles.volumeSlider,
	error: style({ margin: 0, color: "var(--danger)", fontSize: 12, lineHeight: 1.5 }),
	audio: style({ display: "none" }),
};
