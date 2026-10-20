import { windowLayout } from "@/shared/ui/window-layout";
import { style } from "@vanilla-extract/css";
import { motion } from "@/shared/ui/motion.css";

export const styles = {
	backdrop: style({ ...motion.fade, position: "fixed", inset: windowLayout.contentInset, overflow: "hidden", zIndex: 22, display: "grid", placeItems: "center", padding: 20, backgroundColor: "var(--overlay)" }),
	dialog: style({ ...motion.dialog, position: "relative", isolation: "isolate", display: "grid", width: "min(360px, 100%)", gap: 14, padding: 20, backgroundColor: "var(--surface-panel)", border: "1px solid var(--border-strong)", borderRadius: 7, color: "var(--ink)" }),
	title: style({ margin: 0, fontSize: 15 }),
	name: style({ fontSize: 13, overflowWrap: "anywhere" }),
	message: style({ margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--text-control)" }),
	error: style({ margin: 0, fontSize: 12, color: "var(--danger)" }),
	actions: style({ display: "flex", justifyContent: "flex-end", gap: 7 }),
	button: style({ minHeight: 32, paddingInline: 11, border: "1px solid var(--border-strong)", borderRadius: 5, fontSize: 12, cursor: "pointer", color: "var(--button-cancel-fg)", backgroundColor: "var(--button-cancel-bg)", selectors: { "&:disabled": { opacity: 0.45, cursor: "default" } } }),
	delete: style({ color: "var(--danger)", selectors: { "&:hover:not(:disabled)": { backgroundColor: "var(--danger-hover)" } } }),
};
