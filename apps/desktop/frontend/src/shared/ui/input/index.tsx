import { splitProps, type Component, type JSX } from "solid-js";
import { playSound } from "@/shared/ui/sound";
import { callEventHandler, createTextSound } from "@/shared/ui/sound/events";

const Input: Component<JSX.InputHTMLAttributes<HTMLInputElement>> = (props) => {
    const [local, rest] = splitProps(props, ["onInput", "onChange", "onClick", "onCompositionEnd"]);
    const textSound = createTextSound(() => props.value);
    const isText = () => ["text", "search", "email", "url", "tel"].includes(props.type ?? "text");
    return <input {...rest}
        onInput={(event) => {
            if (isText() && !props.disabled && !props.readOnly) textSound(event);
            callEventHandler(local.onInput, event);
        }}
        onCompositionEnd={(event) => {
            if (isText() && !props.disabled && !props.readOnly) textSound(event);
            callEventHandler(local.onCompositionEnd, event);
        }}
        onChange={(event) => {
            if (!props.disabled && ["checkbox", "radio", "range", "file", "color"].includes(props.type ?? "text")) playSound("click");
            callEventHandler(local.onChange, event);
        }}
        onClick={(event) => {
            if (!props.disabled && ["button", "submit", "reset", "image"].includes(props.type ?? "text")) playSound("click");
            callEventHandler(local.onClick, event);
        }} />;
};

export default Input;
