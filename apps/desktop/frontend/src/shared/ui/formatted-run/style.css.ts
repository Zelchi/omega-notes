import { style } from "@vanilla-extract/css";
import { codeFont } from "@/shared/lib/formatted-text";
export const styles = {
    code: style({ fontFamily: codeFont, fontSize: "1em", backgroundColor: "var(--surface-hover)", borderRadius: 3 }),
    highlight: style({ color: "inherit", backgroundColor: "rgba(245, 203, 85, 0.3)", borderRadius: 2 }),
};
