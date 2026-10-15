import { style } from "@vanilla-extract/css";
export const styles = {
    row: style({ display: "flex", alignItems: "center", gap: 5, paddingLeft: 6, width: "min(380px, calc(100vw - 42px))", color: "var(--muted)" }),
    input: style({ flex: 1, minWidth: 0, height: 36, padding: "0 5px", border: 0, outline: "none", color: "var(--ink)", background: "transparent", font: "inherit", fontSize: 12 }),
    counter: style({ flexShrink: 0, minWidth: 35, textAlign: "center", fontSize: 11, fontVariantNumeric: "tabular-nums" }),
    button: style({ display: "grid", placeItems: "center", flexShrink: 0, width: 28, height: 32, padding: 0, border: 0, borderRadius: 4, background: "transparent", color: "var(--text-control)", cursor: "pointer", selectors: { "&:disabled": { opacity: 0.35, cursor: "default" }, "&:hover:not(:disabled)": { background: "var(--surface-hover)", color: "var(--ink)" } } }),
    up: style({ display: "grid", transform: "rotate(180deg)" }),
};
