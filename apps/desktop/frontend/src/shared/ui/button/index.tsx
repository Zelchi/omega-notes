import { splitProps, type Component, type JSX } from "solid-js";
import { playSound, type SoundName } from "@/shared/ui/sound";
import { callEventHandler } from "@/shared/ui/sound/events";

type Props = JSX.ButtonHTMLAttributes<HTMLButtonElement> & { sound?: SoundName | false };

const Button: Component<Props> = (props) => {
    const [local, rest] = splitProps(props, ["onClick", "sound", "onPointerDown", "onPointerMove", "onPointerUp", "onPointerCancel"]);
    let gesture: { id: number; x: number; y: number; moved: boolean } | undefined;
    const trackMovement = (event: PointerEvent) => {
        if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5) gesture.moved = true;
    };
    return <button {...rest}
        onPointerDown={(event) => {
            gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
            callEventHandler(local.onPointerDown, event);
        }}
        onPointerMove={(event) => { trackMovement(event); callEventHandler(local.onPointerMove, event); }}
        onPointerUp={(event) => { trackMovement(event); callEventHandler(local.onPointerUp, event); }}
        onPointerCancel={(event) => { if (gesture) gesture.moved = true; callEventHandler(local.onPointerCancel, event); }}
        onClick={(event) => {
            if (event.currentTarget.disabled || event.currentTarget.getAttribute("aria-disabled") === "true") return;
            if (local.sound !== false && (event.detail === 0 || !gesture?.moved)) playSound(local.sound ?? "click");
            callEventHandler(local.onClick, event);
        }} />;
};

export default Button;
