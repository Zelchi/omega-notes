import { keyframes, style } from "@vanilla-extract/css";

const blink = keyframes({
    "0%, 49%": { opacity: 1 },
    "50%, 100%": { opacity: 0 },
});

export const caretStyle = style({
    position: "absolute", zIndex: 2, width: 1.5, backgroundColor: "var(--ink)",
    borderRadius: 1, pointerEvents: "none", animation: `${blink} 1s steps(1, end) infinite`,
    selectors: {
        ':is([data-text-cursor="terminal"], [data-text-cursor="terminal-static"]) &': {
            width: "0.6em", borderRadius: 0, backgroundColor: "#fff", mixBlendMode: "difference",
        },
        ':is([data-text-cursor="line-static"], [data-text-cursor="terminal-static"]) &': { animation: "none" },
    },
});
