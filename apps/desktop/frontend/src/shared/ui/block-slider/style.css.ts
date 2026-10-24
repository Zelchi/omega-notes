import { style } from "@vanilla-extract/css";

export const styles = {
    root: style({
        position: "relative",
        display: "flex",
        alignItems: "center",
        width: "100%",
        minWidth: 0,
        height: 28,
    }),
    blocks: style({
        display: "grid",
        gridTemplateColumns: "repeat(10, minmax(0, 1fr))",
        gap: 3,
        width: "100%",
        pointerEvents: "none",
    }),
    block: style({
        height: 16,
        borderRadius: 2,
        backgroundColor: "var(--border-strong)",
        transition: "background-color 100ms ease",
        "@media": { "(prefers-reduced-motion: reduce)": { transition: "none" } },
    }),
    active: style({ backgroundColor: "var(--ink)" }),
    input: style({
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        margin: 0,
        padding: 0,
        opacity: 0,
        cursor: "pointer",
    }),
};
