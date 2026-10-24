import { type Component, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { TextRun } from "@/shared/lib/formatted-text";
import { styles } from "./style.css";
const FormattedRun: Component<{ run: TextRun; children: JSX.Element }> = (props) =>
    <Dynamic component={props.run.code ? "code" : props.run.highlight ? "mark" : "span"}
        class={props.run.code ? styles.code : props.run.highlight ? styles.highlight : undefined}
        style={{ "font-weight": props.run.bold ? 700 : undefined, "font-style": props.run.italic ? "italic" : undefined,
            "text-decoration": props.run.strike ? "line-through" : undefined }}>
        {props.run.code ? props.run.text : props.children}
    </Dynamic>;
export default FormattedRun;
