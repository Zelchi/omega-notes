import { splitProps, type Component, type JSX } from "solid-js";
import { playSound } from "@/shared/ui/sound";
import { callEventHandler } from "@/shared/ui/sound/events";

type Props = JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { sound?: boolean };

const Link: Component<Props> = (props) => {
    const [local, rest] = splitProps(props, ["onClick", "sound"]);
    return <a {...rest} onClick={(event) => {
        if (local.sound !== false && props.href && event.currentTarget.getAttribute("aria-disabled") !== "true") playSound("click");
        callEventHandler(local.onClick, event);
    }} />;
};

export default Link;
