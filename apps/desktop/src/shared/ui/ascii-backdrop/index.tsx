import { createContext, Show, useContext, type Accessor, type Component } from "solid-js";
import type { BackgroundTheme } from "@/features/change-preferences";
import { cx } from "@/shared/lib/classes";
import { styles } from "./style.css.ts";

type AsciiTheme = Exclude<BackgroundTheme, "default">;
type Props = { theme?: BackgroundTheme; placement?: "titlebar" | "modal" };

const defaultBackgroundTheme: Accessor<BackgroundTheme> = () => "default";
export const BackgroundThemeContext = createContext<Accessor<BackgroundTheme>>(defaultBackgroundTheme);
export const BackgroundThemeProvider = BackgroundThemeContext.Provider;

const tileScene = (scene: string, columns = 3, rows = 3): string => {
	const lines = scene.trim().split("\n").map((line) => line.replace(/\s+$/, ""));
	const width = Math.max(...lines.map((line) => line.length));
	return Array.from({ length: rows }, () =>
		lines.map((line) => Array.from({ length: columns }, () => line.padEnd(width)).join("        ")).join("\n"),
	).join("\n\n");
};

const matrixScene = Array.from({ length: 72 }, (_, row) =>
	Array.from({ length: 400 }, (_, column) => {
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
	`, 4, 3),
	matrix: matrixScene,
};

const AsciiBackdrop: Component<Props> = (props) => {
	const contextTheme = useContext(BackgroundThemeContext);
	const theme = () => props.theme ?? contextTheme();

	return (
		<Show when={theme() !== "default"}>
			<div class={cx(styles.root, props.placement === "modal" && styles.modalLayer)} data-theme={theme()} data-placement={props.placement} aria-hidden="true">
				<pre class={styles.art}>{theme() === "default" ? "" : scenes[theme() as AsciiTheme]}</pre>
			</div>
		</Show>
	);
};

export default AsciiBackdrop;
