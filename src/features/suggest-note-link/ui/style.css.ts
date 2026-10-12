import { style } from "@vanilla-extract/css";

export const styles = {
	root: style({
		position: "fixed", zIndex: 30, padding: 4,
		backgroundColor: "var(--surface-panel)", border: "1px solid var(--border-strong)", borderRadius: 6,
		maxHeight: "calc(100vh - 16px)", overflowY: "auto", cursor: "default",
	}),
	option: style({
		display: "flex", alignItems: "center", gap: 8, width: "100%", height: 32, paddingInline: 8,
		border: 0, borderRadius: 4, color: "var(--ink)", backgroundColor: "transparent",
		fontSize: 12, textAlign: "left", cursor: "pointer",
		selectors: { "&:hover": { backgroundColor: "var(--surface-hover)" } },
	}),
	selected: style({ backgroundColor: "var(--surface-hover)" }),
	title: style({ minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }),
	empty: style({ height: 32, display: "flex", alignItems: "center", paddingInline: 8, fontSize: 12, color: "var(--muted)" }),
};
