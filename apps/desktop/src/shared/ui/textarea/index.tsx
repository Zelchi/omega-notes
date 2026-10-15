import { splitProps, type Component, type JSX } from "solid-js";
import { playSound } from "@/shared/ui/sound";
import { callEventHandler, createTextSound } from "@/shared/ui/sound/events";

const Textarea: Component<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => {
    const [local, rest] = splitProps(props, ["onInput", "onCompositionEnd", "onKeyDown"]);
    const textSound = createTextSound(() => props.value);
    return <textarea {...rest}
        onInput={(event) => {
            if (!props.disabled && !props.readOnly) textSound(event);
            callEventHandler(local.onInput, event);
        }}
        onCompositionEnd={(event) => {
            if (!props.disabled && !props.readOnly) textSound(event);
            callEventHandler(local.onCompositionEnd, event);
        }}
        onKeyDown={(event) => {
            const before = event.currentTarget.value;
            callEventHandler(local.onKeyDown, event);
            if (!props.disabled && !props.readOnly && event.defaultPrevented && !event.ctrlKey && !event.metaKey &&
                !event.altKey && before !== event.currentTarget.value) playSound("typing");
        }} />;
};

export default Textarea;
