import { style } from "@vanilla-extract/css";
export const styles = {
	root: style({ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }),
	button: style({ display: "grid", placeItems: "center", width: 36, height: 36, padding: 0, border: 0, borderRadius: 4, flexShrink: 0,
		background: "transparent", color: "var(--text-control)", cursor: "pointer",
		selectors: { "&:hover": { background: "var(--surface-hover)" }, "&:disabled": { opacity: 0.5, cursor: "default" } } }),
	error: style({ color: "var(--danger, #d86b6b)", fontSize: 12, maxWidth: 220 }),
};
