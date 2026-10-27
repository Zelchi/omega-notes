import { style } from "@vanilla-extract/css";

export const styles = {
	loadState: style({ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", color: "var(--muted)" }),
	retryButton: style({ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", border: "1px solid var(--border-soft)", borderRadius: 8, background: "var(--surface-panel)", color: "var(--ink)", cursor: "pointer" }),
	empty: style({ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", maxWidth: 360, width: "80%", margin: 0, textAlign: "center", fontSize: 13, lineHeight: 1.6, color: "var(--muted)", pointerEvents: "none" }),
	canvasScroll: style({
		position: "relative",
		flex: 1,
		minWidth: 0,
		minHeight: 0,
		width: "100%",
		margin: 0,
		padding: 0,
		overflow: "hidden",
	}),
};
