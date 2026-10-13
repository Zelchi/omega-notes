import { style } from "@vanilla-extract/css";

export const styles = {
    root: style({ position: "relative", minWidth: 0, width: "100%" }),
    trigger: style({
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        boxSizing: "border-box", minWidth: 0, width: "100%", minHeight: 34, padding: "7px 10px",
        border: "1px solid var(--border-strong)", borderRadius: 5, background: "var(--surface-input)",
        color: "var(--ink)", fontSize: 12, lineHeight: 1.4, cursor: "pointer", textAlign: "left",
        selectors: {
            "&:hover:not(:disabled)": { background: "var(--surface-hover)" },
            "&:disabled": { opacity: .45, cursor: "default" },
            "&:focus-visible": { outline: "2px solid var(--focus)", outlineOffset: 2 },
        },
    }),
    label: style({ flex: 1, minWidth: 0, whiteSpace: "normal", overflowWrap: "anywhere" }),
    arrow: style({ display: "flex", flexShrink: 0, color: "var(--muted)", transition: "transform 160ms ease" }),
    menu: style({
        position: "absolute", display: "flex", flexDirection: "column", minHeight: 0, boxSizing: "border-box",
        padding: 3, border: "1px solid var(--border-strong)", borderRadius: 5,
        background: "var(--surface-panel)", color: "var(--ink)", zIndex: 20,
    }),
    option: style({
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        boxSizing: "border-box", minHeight: 32, padding: "7px 9px", borderRadius: 3, fontSize: 12, lineHeight: 1.4,
        whiteSpace: "normal", overflowWrap: "anywhere", cursor: "pointer",
        selectors: {
            '&[data-active="true"]': { background: "var(--surface-hover)" },
            '&[aria-disabled="true"]': { opacity: .4, cursor: "default" },
        },
    }),
    check: style({ display: "flex", width: 14, flexShrink: 0 }),
};
