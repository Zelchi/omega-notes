import { keyframes, type StyleRule } from "@vanilla-extract/css";

const easing = "cubic-bezier(0.22, 1, 0.36, 1)";
const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const popIn = keyframes({
	from: { opacity: 0, transform: "translateY(6px) scale(0.98)" },
	to: { opacity: 1, transform: "translateY(0) scale(1)" },
});
const barIn = keyframes({
	from: { opacity: 0, transform: "translateX(-50%) translateY(6px)" },
	to: { opacity: 1, transform: "translateX(-50%) translateY(0)" },
});
const nodeIn = keyframes({
	from: { opacity: 0, transform: "scale(0.85)" },
	to: { opacity: 1, transform: "scale(1)" },
});

export const motion = {
	fade: { animation: `${fadeIn} 140ms ease-out` },
	dialog: { animation: `${popIn} 200ms ${easing}` },
	menu: { animation: `${popIn} 140ms ${easing}`, transformOrigin: "top left" },
	bar: { animation: `${barIn} 180ms ${easing}` },
	createdNode: { animation: `${nodeIn} 260ms ${easing} 180ms backwards` },
} satisfies Record<string, StyleRule>;
