import { playSound } from ".";
import { createEffect, type Accessor } from "solid-js";

type Handler<E extends Event> = ((event: E) => void) | { 0: (data: unknown, event: E) => void; 1: unknown };

export const callEventHandler = <E extends Event>(handler: Handler<E> | undefined, event: E): void => {
    if (typeof handler === "function") handler(event);
    else if (handler) handler[0](handler[1], event);
};

export const createTextSound = (value: Accessor<unknown>) => {
    let lastValue: string | undefined;
    createEffect(() => { lastValue = String(value() ?? ""); });
    return (event: (InputEvent | CompositionEvent) & { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
        if ("isComposing" in event && event.isComposing) return;
        const value = event.currentTarget.value;
        if (value === lastValue) return;
        lastValue = value;
        if ("inputType" in event && (event.inputType ?? "").startsWith("history")) return;
        playSound("typing");
    };
};
