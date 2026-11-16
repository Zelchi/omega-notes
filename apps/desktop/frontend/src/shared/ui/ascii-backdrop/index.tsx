import { createContext, createEffect, onCleanup, Show, useContext, type Accessor, type Component } from "solid-js";
import type { BackgroundHandle, BackgroundPreset } from "asciify-engine/kit";
import type { BackgroundTheme } from "@/features/change-preferences";
import { cx } from "@/shared/lib/classes";
import { styles } from "./style.css.ts";

type AsciiTheme = Exclude<BackgroundTheme, "default">;
type Props = { theme?: BackgroundTheme; placement?: "titlebar" | "modal" };
const CODE_FALL_SPEED = 32;
const CODE_RAIN_MAX_DENSITY = 0.008 * 5;
const CODE_RAIN_SEED = Math.floor(Math.random() * 1_000_000);
const CODE_RAIN_EPOCH = typeof performance === "undefined" ? 0 : performance.now();
const CONSTELLATION_CELL_SIZE = 12;
const CONSTELLATION_LETTER_SPACING = 0.08;
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
		lines.map((line) => Array.from({ length: columns }, () => line.padEnd(width)).join("")).join("\n"),
	).join("\n");
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

const matrixLines = scenes.matrix.split("\n");
const matrixColumns = Math.max(...matrixLines.map((line) => line.length));
const matrixMarks = matrixLines.flatMap((line, row) =>
	Array.from(line, (character, column) => {
		if (character !== "0" && character !== "1") return undefined;
		const seed = CODE_RAIN_SEED + row * matrixColumns + column;
		return { character, column, seed, density: randomAt(seed) };
	}).filter((mark): mark is NonNullable<typeof mark> => mark !== undefined),
);

const constellationLines = scenes.constellation.split("\n");
const constellationColumns = Math.max(...constellationLines.map((line) => line.length));
const constellationMarks = constellationLines.flatMap((line, row) =>
	Array.from(line, (character, column) => {
		if (character !== "*" && character !== ".") return undefined;
		const seed = row * line.length + column;
		return { character, row, column, seed, density: randomAt(CODE_RAIN_SEED + seed) };
	}).filter((mark): mark is NonNullable<typeof mark> => mark !== undefined),
);

const codeFallDuration = () => typeof window === "undefined" ? 30 : Math.max(window.innerHeight / CODE_FALL_SPEED, 0.1);
const codeRainElapsed = () => typeof performance === "undefined" ? 0 : (performance.now() - CODE_RAIN_EPOCH) / 1000;

const prepareCanvasText = (
	pen: CanvasRenderingContext2D,
	width: number,
	height: number,
	fontSize: number,
	ink: string,
) => {
	pen.clearRect(0, 0, width, height);
	pen.font = `500 ${fontSize}px "SFMono-Regular", Consolas, "Liberation Mono", monospace`;
	pen.textAlign = "left";
	pen.textBaseline = "top";
	pen.fillStyle = ink;
};

const createMatrixPreset = (
	mountCanvas: typeof import("asciify-engine/kit")["mountCanvas"],
	intensity: Accessor<number>,
): BackgroundPreset => ({
	id: "omega-matrix",
	name: "Ômega Matrix",
	description: "The original code rain, rendered by the Asciify Engine canvas template.",
	cellSize: 12,
	speed: 1,
	cursor: false,
	mount: (context) => mountCanvas(context, (pen, width, height, _time, _mouse, frame) => {
		prepareCanvasText(pen, width, height, frame.fontSize, frame.ink);

		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const bounds = context.host.getBoundingClientRect();
		const duration = codeFallDuration();
		const elapsed = codeRainElapsed();
		const densityLimit = intensity() * CODE_RAIN_MAX_DENSITY;

		matrixMarks.forEach(({ character, column, seed, density }) => {
			if (density >= densityLimit) return;
			const phase = (elapsed + randomAt(seed + 2) * duration) % duration;
			const x = column / matrixColumns * viewportWidth - bounds.left;
			const y = -12 + phase / duration * viewportHeight - bounds.top;
			pen.fillText(character, x, y);
		});
	}),
});

const createConstellationPreset = (
	mountCanvas: typeof import("asciify-engine/kit")["mountCanvas"],
	intensity: Accessor<number>,
	animationSeed: number,
): BackgroundPreset => ({
	id: "omega-constellation-canvas",
	name: "Ômega Constellation",
	description: "The original tiled star pattern, drawn by the Asciify Engine canvas template.",
	cellSize: CONSTELLATION_CELL_SIZE,
	speed: 1,
	cursor: false,
	mount: (context) => mountCanvas(context, (pen, width, height, _time, _mouse, frame) => {
		prepareCanvasText(pen, width, height, frame.fontSize, frame.ink);

		const cellWidth = pen.measureText("M").width + frame.fontSize * CONSTELLATION_LETTER_SPACING;
		const left = (width - constellationColumns * cellWidth) / 2;
		const top = (height - constellationLines.length * frame.fontSize) / 2;
		const densityLimit = intensity();
		const reducedMotion = context.reducedMotion() === true;

		constellationMarks.forEach(({ character, row, column, seed: markSeed, density }) => {
			if (density >= densityLimit) return;

			let opacity = 1;
			if (character === "*" && !reducedMotion) {
				const seed = animationSeed + markSeed;
				const interval = 0.7 + randomAt(seed) * 3.3;
				const phase = (frame.elapsed / interval + randomAt(seed + 1)) % 1;
				opacity = phase < 0.5 ? 0.25 : 1;
			}

			pen.globalAlpha = opacity;
			pen.fillText(character, left + column * cellWidth, top + row * frame.fontSize);
		});
		pen.globalAlpha = 1;
	}),
});

const AsciiBackdrop: Component<Props> = (props) => {
	const contextTheme = useContext(BackgroundThemeContext);
	const intensity = useContext(BackgroundIntensityContext);
	const theme = () => props.theme ?? contextTheme();
	const animationSeed = Math.floor(Math.random() * 1_000_000);
	let engineElement: HTMLDivElement | undefined;

	createEffect(() => {
		const activeTheme = theme();
		if ((activeTheme !== "matrix" && activeTheme !== "constellation") || !engineElement) return;

		let disposed = false;
		let handle: BackgroundHandle | undefined;
		void import("asciify-engine/kit").then(({ background, mountCanvas }) => {
			if (disposed || !engineElement) return;

			const mountedHandle = background(engineElement, {
				preset: activeTheme === "matrix"
					? createMatrixPreset(mountCanvas, intensity)
					: createConstellationPreset(mountCanvas, intensity, animationSeed),
				cursor: false,
				ink: getComputedStyle(engineElement).color,
				speed: 1,
				cellSize: activeTheme === "matrix" ? 12 : CONSTELLATION_CELL_SIZE,
				opacity: props.placement === "modal" ? 0.56 : 1,
				globalLook: false,
				lazy: false,
			});
			handle = mountedHandle;
			if (disposed) {
				mountedHandle.destroy();
				return;
			}
		}).catch((error) => {
			if (!disposed) console.error("Failed to initialize the Asciify Engine background.", error);
		});
		onCleanup(() => {
			disposed = true;
			handle?.destroy();
		});
	});

	return (
		<Show when={theme() !== "default"}>
			<div
				class={cx(styles.root, props.placement === "modal" && styles.modalLayer)}
				data-theme={theme()}
				aria-hidden="true"
			>
				<div class={styles.engineSurface} ref={engineElement} />
			</div>
		</Show>
	);
};

export default AsciiBackdrop;
