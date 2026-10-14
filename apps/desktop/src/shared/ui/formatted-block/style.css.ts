import { style } from "@vanilla-extract/css";
import { codeFont } from "@/shared/lib/formatted-text";
export const styles = {
    quote: style({ margin: 0, borderLeft: "3px solid var(--border-strong)", boxSizing: "border-box", whiteSpace: "pre-wrap", minHeight: "1.65em" }),
    code: style({ margin: 0, padding: "8px 12px", border: "1px solid var(--border-strong)", borderRadius: 4,
        background: "var(--surface-hover)", fontFamily: codeFont, fontSize: "1em", lineHeight: "inherit", color: "inherit",
        whiteSpace: "pre-wrap", overflowWrap: "anywhere", tabSize: 4, boxSizing: "border-box" }),
    list: style({ margin: 0, whiteSpace: "pre-wrap", paddingLeft: "2em", minHeight: "1.65em" }),
    marker: style({ position: "absolute", right: "100%", whiteSpace: "pre", textAlign: "right" }),
    separator: style({ margin: "0.75em 0", border: 0, borderTop: "1px solid var(--border-strong)" }),
};
