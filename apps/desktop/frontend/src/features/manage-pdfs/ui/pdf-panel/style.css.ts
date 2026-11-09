import { windowLayout } from "@/shared/ui/window-layout";
import { globalStyle, style } from "@vanilla-extract/css";

const button = style({
	boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
	minWidth: 32, minHeight: 32, padding: "6px 9px", border: "1px solid var(--border-strong)", borderRadius: 6,
	color: "var(--ink)", background: "var(--surface-input)", font: "inherit", fontSize: 12, cursor: "pointer",
	selectors: {
		"&:hover": { background: "var(--surface-hover)" },
		"&:disabled": { opacity: 0.45, cursor: "default" },
	},
});

export const styles = {
	panel: style({
		position: "fixed", isolation: "isolate", top: windowLayout.titlebarHeight + 1, right: 1, bottom: 1, zIndex: 7,
		boxSizing: "border-box", maxWidth: "calc(100vw - 24px)", overflow: "hidden",
		background: "var(--surface-panel)", borderLeft: "1px solid var(--border-strong)",
		transition: "width 100ms cubic-bezier(0.2, 0.7, 0.3, 1)",
	}),
	resizeHandle: style({
		position: "absolute", top: 0, left: 0, bottom: 0, zIndex: 3,
		display: "grid", placeItems: "center", width: 10, cursor: "ew-resize", touchAction: "none",
		selectors: {
			"&::after": {
				content: "", display: "block", width: 2, height: 32, borderRadius: 2,
				backgroundColor: "var(--border-strong)", opacity: 0.65,
				transition: "opacity 140ms ease, background-color 140ms ease",
			},
			"&:hover::after": { backgroundColor: "var(--ink)", opacity: 1 },
		},
	}),
	body: style({ boxSizing: "border-box", display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 0, padding: 16, gap: 12 }),
	header: style({ display: "flex", alignItems: "center", gap: 9, minHeight: 34, paddingBottom: 12, borderBottom: "1px solid var(--border-soft)" }),
	headerTitle: style({ flex: 1, minWidth: 0, margin: 0, overflow: "hidden", color: "var(--ink)", fontSize: 15, fontWeight: 650, textOverflow: "ellipsis", whiteSpace: "nowrap" }),
	button,
	iconButton: style([button, { width: 32, height: 32, padding: 0, flexShrink: 0 }]),
	content: style({ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, gap: 12 }),
	toolbar: style({ display: "flex", alignItems: "center", gap: 8 }),
	list: style({ display: "grid", alignContent: "start", gap: 8, flex: 1, minHeight: 0, overflow: "auto", paddingRight: 5 }),
	card: style({ boxSizing: "border-box", display: "flex", alignItems: "center", gap: 9, minWidth: 0, minHeight: 50, padding: 7, border: "1px solid var(--border-soft)", borderRadius: 7, background: "var(--surface-input)" }),
	openDocument: style({ display: "flex", alignItems: "center", flex: 1, gap: 9, minWidth: 0, padding: 3, border: 0, color: "var(--ink)", background: "transparent", textAlign: "left", cursor: "pointer" }),
	cardIcon: style({ flexShrink: 0, color: "var(--muted)" }),
	cardTitle: style({ minWidth: 0, overflow: "hidden", fontSize: 12, textOverflow: "ellipsis", whiteSpace: "nowrap" }),
	cardActions: style({ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }),
	cardAction: style({ width: 28, height: 28, minWidth: 28, minHeight: 28, padding: 0, borderColor: "transparent", color: "var(--muted)", background: "transparent" }),
	importForm: style({ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: "0 0 auto" }),
	editForm: style({ display: "flex", flex: 1, alignItems: "center", gap: 5, minWidth: 0 }),
	textInput: style({ boxSizing: "border-box", width: "100%", minWidth: 0, height: 32, padding: "5px 8px", border: "1px solid var(--border-strong)", borderRadius: 5, outline: 0, color: "var(--ink)", background: "var(--surface-input)", font: "inherit", fontSize: 12 }),
	error: style({ margin: 0, color: "var(--danger)", fontSize: 12, lineHeight: 1.45 }),
	empty: style({ margin: "auto", padding: 24, color: "var(--muted)", fontSize: 12, textAlign: "center" }),
	readerToolbar: style({ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, flexShrink: 0 }),
	pageLabel: style({ minWidth: 68, color: "var(--muted)", fontSize: 12, fontVariantNumeric: "tabular-nums", textAlign: "center" }),
	readerScrollRoot: style({ position: "relative", display: "block", flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden", borderRadius: 8, background: "transparent", vars: { "--omega-scrollbar-right": "0px", "--omega-scrollbar-bottom": "0px" } }),
	readerSurface: style({ position: "relative", display: "block", width: "100%", height: "100%", overflow: "auto", overscrollBehavior: "contain" }),
	pageFrame: style({ position: "relative", display: "grid", width: "fit-content", height: "fit-content", margin: "14px auto", placeItems: "center", border: "1px solid #d6d6d6", background: "#fff", boxShadow: "0 8px 28px rgb(0 0 0 / 20%)" }),
	canvas: style({ display: "block" }),
	highlightLayer: style({ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }),
	highlightMark: style({ position: "absolute", borderRadius: 2 }),
	highlightMarkSelected: style({ outline: "1px solid var(--ink)" }),
	textLayer: style({
		position: "absolute", inset: 0, zIndex: 2, overflow: "hidden", lineHeight: 1,
		textAlign: "initial", transformOrigin: "0 0", userSelect: "text", WebkitUserSelect: "text",
		vars: {
			"--scale-factor": "1",
			"--user-unit": "1",
			"--total-scale-factor": "calc(var(--scale-factor) * var(--user-unit))",
			"--scale-round-x": "1px",
			"--scale-round-y": "1px",
			"--min-font-size": "1",
			"--min-font-size-inv": "calc(1 / var(--min-font-size))",
			"--text-scale-factor": "calc(var(--total-scale-factor) * var(--min-font-size))",
		},
	}),
	contextMenu: style({
		position: "absolute", zIndex: 5, display: "grid", boxSizing: "border-box", width: 208, gap: 2, padding: 4,
		background: "var(--surface-panel)", border: "1px solid var(--border-strong)", borderRadius: 6,
	}),
	editHighlightMenu: style({ width: 236, gap: 9, padding: 9, maxHeight: "calc(100% - 16px)", overflowY: "auto" }),
	contextMenuButton: style({
		display: "flex", alignItems: "center", gap: 8, minHeight: 32, paddingInline: 9,
		color: "var(--ink)", background: "transparent", border: 0, borderRadius: 4,
		fontSize: 12, textAlign: "left", cursor: "pointer",
		selectors: { "&:hover:not(:disabled)": { background: "var(--surface-hover)" }, "&:disabled": { opacity: 0.45, cursor: "default" } },
	}),
	editHighlightTitle: style({ padding: "1px 5px 3px", color: "var(--ink)", fontSize: 12, fontWeight: 650 }),
	editHighlightField: style({ display: "grid", gap: 7, color: "var(--muted)", fontSize: 11 }),
	highlightColorOptions: style({ display: "flex", alignItems: "center", gap: 10, padding: "2px 4px 4px" }),
	highlightColorButton: style({
		boxSizing: "border-box", display: "grid", placeItems: "center", width: 21, height: 21, padding: 0,
		border: "1px solid rgb(0 0 0 / 25%)", borderRadius: 5, color: "#18181b", cursor: "pointer",
		selectors: { "&:disabled": { opacity: 0.5, cursor: "default" } },
	}),
	editHighlightActions: style({ display: "flex", justifyContent: "flex-end", gap: 4, paddingTop: 2 }),
	readerStatus: style({ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", padding: 12, borderRadius: 6, color: "var(--muted)", background: "var(--surface-panel)", fontSize: 12, textAlign: "center" }),
	highlightError: style({ margin: 0, color: "var(--danger)", fontSize: 11 }),
};

globalStyle(`${styles.canvas}`, { display: "block" });
globalStyle(`${styles.textLayer} :is(span, br)`, {
	color: "transparent", position: "absolute", whiteSpace: "pre", cursor: "text",
	transformOrigin: "0% 0%", userSelect: "text", WebkitUserSelect: "text",
});
globalStyle(`${styles.textLayer} > :not(.markedContent), ${styles.textLayer} .markedContent span:not(.markedContent)`, {
	zIndex: 1,
	vars: { "--font-height": "0", "--scale-x": "1", "--rotate": "0deg" },
	fontSize: "calc(var(--text-scale-factor) * var(--font-height))",
	transform: "rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))",
});
globalStyle(`${styles.textLayer} ::selection`, { background: "rgb(52 120 246 / 28%)", color: "transparent" });
