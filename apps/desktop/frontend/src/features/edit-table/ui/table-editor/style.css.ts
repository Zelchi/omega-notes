import { style } from "@vanilla-extract/css";
export const styles = {
    root: style({ position: "absolute", whiteSpace: "normal", cursor: "default" }),
    table: style({ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", font: "inherit", lineHeight: "inherit" }),
    cell: style({ border: "1px solid var(--border-strong)", padding: "6px 8px", verticalAlign: "top", overflowWrap: "anywhere" }),
    heading: style({ backgroundColor: "var(--surface-hover)", fontWeight: 700 }),
    field: style({ position: "relative", minHeight: "1.65em", whiteSpace: "pre-wrap", overflowWrap: "anywhere", cursor: "text" }),
    input: style({ position: "absolute", inset: 0, width: "100%", height: "100%", resize: "none", overflow: "hidden", border: 0, padding: 0, margin: 0, outline: "none", background: "transparent", color: "inherit", font: "inherit", lineHeight: "inherit", textAlign: "inherit", caretColor: "transparent", userSelect: "text", WebkitUserSelect: "text" }),
    controls: style({ display: "flex", justifyContent: "center", gap: 4, padding: "6px 0", userSelect: "none" }),
    button: style({ display: "grid", placeItems: "center", width: 30, height: 30, border: "1px solid var(--border-strong)", borderRadius: 4, background: "var(--surface)", color: "var(--ink)", cursor: "pointer", selectors: { "&:hover": { background: "var(--surface-hover)" }, "&:disabled": { opacity: 0.35, cursor: "default" } } }),
    danger: style({ color: "var(--danger)" }),
};
