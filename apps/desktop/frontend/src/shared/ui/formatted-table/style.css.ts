import { style } from "@vanilla-extract/css";

const cell = {
    border: "1px solid var(--border-strong)",
    padding: "6px 8px",
    verticalAlign: "top",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontWeight: 400,
} as const;

export const styles = {
    table: style({ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", margin: 0, font: "inherit", lineHeight: "inherit", color: "inherit" }),
    cell: style(cell),
    heading: style({ ...cell, fontWeight: 700, backgroundColor: "var(--surface-hover)" }),
};
