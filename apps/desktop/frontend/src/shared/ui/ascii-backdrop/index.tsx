import { createContext, createEffect, onCleanup, Show, useContext, type Accessor, type Component } from "solid-js";
import type { BackgroundTheme } from "@/features/change-preferences";
import { cx } from "@/shared/lib/classes";
import { styles } from "./style.css.ts";

type AsciiTheme = Exclude<BackgroundTheme, "default">;
type Props = { theme?: BackgroundTheme; placement?: "titlebar" | "modal" };
const CODE_FALL_SPEED = 32;
const CODE_RAIN_MAX_DENSITY = 0.008 * 5;
const CODE_RAIN_SEED = Math.floor(Math.random() * 1_000_000);
const CODE_RAIN_EPOCH = typeof performance === "undefined" ? 0 : performance.now();

const defaultBackgroundTheme: Accessor<BackgroundTheme> = () => "default";
const defaultBackgroundIntensity: Accessor<number> = () => 0.6;
export const BackgroundThemeContext = createContext<Accessor<BackgroundTheme>>(defaultBackgroundTheme);
export const BackgroundThemeProvider = BackgroundThemeContext.Provider;
export const BackgroundIntensityContext = createContext<Accessor<number>>(defaultBackgroundIntensity);
export const BackgroundIntensityProvider = BackgroundIntensityContext.Provider;

const tileScene = (scene: string, columns = 3, rows = 3): string => {
	const lines = scene.trim().split("\n").map((line) => line.replace(/\s+$/, ""));
	const width = Math.max(...lines.map((line) => line.length));
	return Array.from({ length: rows }, () =>
		lines.map((line) => Array.from({ length: columns }, () => line.padEnd(width)).join("        ")).join("\n"),
	).join("\n\n");
};

const matrixScene = Array.from({ length: 120 }, (_, row) =>
	Array.from({ length: 240 }, (_, column) => {
		const start = (column * 17 + Math.floor(column / 3) * 11) % 29;
		const length = (column * 7 + 13) % 17 + 6;
		const progress = (row - start + 29) % 29;
		if (progress >= length) return " ";
		const glyph = (column * 13 + row * 7 + start) % 4;
		return glyph === 0 ? " " : glyph % 2 ? "1" : "0";
	}).join(""),
).join("\n");

const scenes: Record<AsciiTheme, string> = {
	constellation: tileScene(`
       *             .                 *            .
  .         *               .                 *
        .          .                  .
 *                 .          *              .
             *              .         *
   .                 *               .
       .         *          .                 *
 *            .                   .
         .               *                 .
   *              .                *
              .          .                 *
 .                   *          .
       *          .                    .
 .              .             *             .
         *             .                  *
    .                 *          .
 *              .                  .
          .             *               .
 .                *                .
      .                   .             *
	`, 4, 6),
	matrix: matrixScene,
};

const randomAt = (seed: number) => {
	const value = Math.sin(seed * 12.9898) * 43758.5453;
	return value - Math.floor(value);
};

const renderConstellation = (animationSeed: number, intensity: number) => {
	const lines = scenes.constellation.split("\n");
	return lines.flatMap((line, row) => {
		const parts: (string | ReturnType<typeof renderGlyph>)[] = [];
		let text = "";

		Array.from(line).forEach((character, column) => {
			if (character !== "*" && character !== ".") {
				text += character;
				return;
			}
			if (randomAt(CODE_RAIN_SEED + row * line.length + column) >= intensity) {
				text += " ";
				return;
			}
			if (character === ".") {
				text += character;
				return;
			}

			if (text) parts.push(text);
			text = "";
			parts.push(renderGlyph(character, animationSeed + row * line.length + column));
		});

		if (text) parts.push(text);
		if (row < lines.length - 1) parts.push("\n");
		return parts;
	});
};

const codeFallDuration = () => typeof window === "undefined" ? 30 : Math.max(window.innerHeight / CODE_FALL_SPEED, 0.1);
const codeRainElapsed = () => typeof performance === "undefined" ? 0 : (performance.now() - CODE_RAIN_EPOCH) / 1000;

const renderCodeRain = (duration: number, elapsed: number, intensity: number) => {
	const lines = scenes.matrix.split("\n");
	const columns = Math.max(...lines.map((line) => line.length));
	return lines.flatMap((line, row) => Array.from(line, (character, column) => {
		if (character !== "0" && character !== "1") return [];

		const seed = CODE_RAIN_SEED + row * columns + column;
		if (randomAt(seed) >= intensity * CODE_RAIN_MAX_DENSITY) return [];
		const phase = (elapsed + randomAt(seed + 2) * duration) % duration;

		return (
			<span
				class={styles.codeGlyph}
				data-rain-seed={seed}
				style={{
					left: `calc(${column / columns * 100}vw - var(--rain-left, 0px))`,
					top: "calc(-12px - var(--rain-top, 0px))",
					"animation-delay": `${-phase}s`,
				}}
			>
				{character}
			</span>
		);
	}));
};

const renderGlyph = (character: string, seed: number) => {
	const interval = 0.7 + randomAt(seed) * 3.3;
	return (
		<span
			class={styles.constellationGlyph}
			style={{ "animation-duration": `${interval}s`, "animation-delay": `${-randomAt(seed + 1) * interval}s` }}
		>
			{character}
		</span>
	);
};

const AsciiBackdrop: Component<Props> = (props) => {
	const contextTheme = useContext(BackgroundThemeContext);
	const intensity = useContext(BackgroundIntensityContext);
	const theme = () => props.theme ?? contextTheme();
	const animationSeed = Math.floor(Math.random() * 1_000_000);
	let codeRainElement: HTMLDivElement | undefined;

	createEffect(() => {
		if (theme() !== "matrix" || !codeRainElement) return;

		const syncCodeRain = () => {
			if (!codeRainElement) return;
			const bounds = codeRainElement.getBoundingClientRect();
			const duration = codeFallDuration();
			const elapsed = codeRainElapsed();
			codeRainElement.style.setProperty("--rain-left", `${bounds.left}px`);
			codeRainElement.style.setProperty("--rain-top", `${bounds.top}px`);
			codeRainElement.style.setProperty("--code-fall-duration", `${duration}s`);

			codeRainElement.querySelectorAll<HTMLElement>("[data-rain-seed]").forEach((glyph) => {
				const seed = Number(glyph.dataset.rainSeed);
				const phase = (elapsed + randomAt(seed + 2) * duration) % duration;
				glyph.style.animationDelay = `${-phase}s`;
			});
		};
		const settleAt = performance.now() + 300;
		let entryFrame = 0;
		const syncDuringEntrance = () => {
			if (!codeRainElement) return;
			const bounds = codeRainElement.getBoundingClientRect();
			codeRainElement.style.setProperty("--rain-left", `${bounds.left}px`);
			codeRainElement.style.setProperty("--rain-top", `${bounds.top}px`);
			if (performance.now() < settleAt) {
				entryFrame = window.requestAnimationFrame(syncDuringEntrance);
			}
		};

		const observer = new ResizeObserver(syncCodeRain);
		observer.observe(codeRainElement);
		window.addEventListener("resize", syncCodeRain);
		syncCodeRain();
		if (props.placement === "modal") {
			entryFrame = window.requestAnimationFrame(syncDuringEntrance);
		}
		onCleanup(() => {
			observer.disconnect();
			window.removeEventListener("resize", syncCodeRain);
			window.cancelAnimationFrame(entryFrame);
		});
	});

	return (
		<Show when={theme() !== "default"}>
			<div class={cx(styles.root, props.placement === "modal" && styles.modalLayer)} data-theme={theme()} data-placement={props.placement} aria-hidden="true">
				{theme() === "matrix"
					? <div
							class={styles.codeRain}
							ref={codeRainElement}
							style={{ "--code-fall-duration": `${codeFallDuration()}s` }}
						>
							{renderCodeRain(codeFallDuration(), codeRainElapsed(), intensity())}
						</div>
					: <pre class={styles.art}>{renderConstellation(animationSeed, intensity())}</pre>}
			</div>
		</Show>
	);
};

export default AsciiBackdrop;
