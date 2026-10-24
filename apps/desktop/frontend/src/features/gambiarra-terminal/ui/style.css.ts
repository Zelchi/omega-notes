import { globalStyle, style } from "@vanilla-extract/css";
export const terminalStyles = {
    body: style({ boxSizing: "border-box", minWidth: 0 }),
    studyNotice: style({ display: "grid", gap: 8, flexShrink: 0, minWidth: 0 }),
    studyFooter: style({ display: "grid", flexShrink: 0, borderTop: "1px solid var(--border-soft)", paddingTop: 14 }),
    copyPrompt: style({ margin: 0, color: "var(--ink)", userSelect: "text", overflowWrap: "anywhere", fontSize: 12 }),
    restart: style({ boxSizing: "border-box", width: "100%", minHeight: 32, flexShrink: 0, padding: "6px 10px", border: "1px solid var(--border-strong)", borderRadius: 5, color: "var(--ink)", background: "var(--surface-input)", fontSize: 12, cursor: "pointer", selectors: { "&:hover:not(:disabled)": { background: "var(--surface-hover)" } } }),
    host: style({ flex: 1, position: "relative", width: "100%", minHeight: 0, minWidth: 0, overflow: "hidden" }),
    status: style({ flexShrink: 0, margin: 0, color: "var(--muted)", fontSize: 12, lineHeight: 1.5 }),
};
globalStyle(`${terminalStyles.host} .xterm`, { boxSizing: "border-box", width: "100%", height: "100%" });
globalStyle(`${terminalStyles.host} .xterm .xterm-viewport`, { backgroundColor: "var(--surface-panel)" });
globalStyle(`${terminalStyles.host} .xterm-decoration-overview-ruler`, { visibility: "hidden" });
globalStyle(`${terminalStyles.host} .xterm .xterm-scrollable-element > .scrollbar`, { background: "transparent" });
globalStyle(`${terminalStyles.host} .xterm .xterm-scrollable-element > .scrollbar.vertical`, { width: "5px !important" });
