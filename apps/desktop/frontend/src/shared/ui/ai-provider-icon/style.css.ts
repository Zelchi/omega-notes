import { style } from "@vanilla-extract/css";

export const providerIcon = style({
    display: "inline-block", width: 18, height: 18, flexShrink: 0,
    backgroundColor: "currentColor", maskSize: "contain", maskRepeat: "no-repeat", maskPosition: "center",
    WebkitMaskSize: "contain", WebkitMaskRepeat: "no-repeat", WebkitMaskPosition: "center",
});
