import { style } from "@vanilla-extract/css";
export const styles = {
    checkbox: style({ display: "inline-flex", alignItems: "center", justifyContent: "center", verticalAlign: "middle",
        width: 16, height: 16, margin: "0 4px 0 0", padding: 0, border: "1px solid var(--border-strong)", borderRadius: 3,
        background: "transparent", color: "var(--ink)", cursor: "pointer", userSelect: "none",
        selectors: { '&[data-checked="true"]': { background: "var(--ink)", color: "var(--surface)", borderColor: "var(--ink)" },
            "&:disabled": { cursor: "default", opacity: 1 }, "&:focus-visible": { outline: "1px solid var(--ink)", outlineOffset: 2 } } }),
};
