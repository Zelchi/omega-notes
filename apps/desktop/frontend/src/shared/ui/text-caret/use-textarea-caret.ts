import { createSignal, onCleanup } from "solid-js";
import type { CaretGeometry } from "./index";

const textProperties = [
    "font-family", "font-size", "font-style", "font-weight", "font-variant", "font-stretch",
    "line-height", "letter-spacing", "word-spacing", "text-transform", "text-indent", "text-align",
    "direction", "tab-size", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
];

export const useTextareaCaret = () => {
    const [caret, setCaret] = createSignal<CaretGeometry>();
    let input: HTMLTextAreaElement | undefined;
    let mirror: HTMLDivElement | undefined;
    let frame = 0;
    let composing = false;
    let cleanupInput: (() => void) | undefined;

    const measure = () => {
        if (!input?.isConnected || input.disabled || composing || document.activeElement !== input ||
            !document.hasFocus() || input.selectionStart !== input.selectionEnd) {
            setCaret(undefined);
            return;
        }
        mirror ??= document.createElement("div");
        if (!mirror.isConnected) {
            mirror.setAttribute("aria-hidden", "true");
            mirror.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;margin:0;height:auto;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;border-style:solid;";
            document.body.append(mirror);
        }
        const computed = getComputedStyle(input);
        for (const property of textProperties) mirror.style.setProperty(property, computed.getPropertyValue(property));
        const number = (property: string) => parseFloat(computed.getPropertyValue(property)) || 0;
        mirror.style.width = `${input.clientWidth + number("border-left-width") + number("border-right-width")}px`;
        const before = document.createTextNode(input.value.slice(0, input.selectionStart));
        const marker = document.createElement("span");
        const after = document.createTextNode(input.value.slice(input.selectionStart) || "\u200b");
        marker.append(after);
        mirror.replaceChildren(before, marker);
        const range = document.createRange();
        range.setStart(after, 0);
        range.collapse(true);
        const bounds = range.getClientRects()[0];
        if (!bounds) { setCaret(undefined); return; }
        const mirrorBounds = mirror.getBoundingClientRect();
        const top = bounds.top - mirrorBounds.top - input.scrollTop;
        const left = bounds.left - mirrorBounds.left - input.scrollLeft;
        const height = bounds.height || number("line-height") || number("font-size");
        if (top + height <= number("border-top-width") || top >= input.clientHeight + number("border-top-width") ||
            left < number("border-left-width") || left > input.clientWidth + number("border-left-width")) {
            setCaret(undefined);
            return;
        }
        setCaret({ left, top, height, fontSize: number("font-size") });
    };
    const scheduleMeasure = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(measure);
    };
    const bind = (element: HTMLTextAreaElement) => {
        cleanupInput?.();
        input = element;
        composing = false;
        const events = ["focus", "input", "keyup", "pointerup", "select", "scroll", "selectionchange"];
        for (const event of events) element.addEventListener(event, scheduleMeasure);
        const hide = () => setCaret(undefined);
        const originalColor = element.style.caretColor;
        const compositionStart = () => { composing = true; element.style.caretColor = "auto"; hide(); };
        const compositionEnd = () => { composing = false; element.style.caretColor = originalColor; scheduleMeasure(); };
        element.addEventListener("blur", hide);
        element.addEventListener("compositionstart", compositionStart);
        element.addEventListener("compositionend", compositionEnd);
        document.addEventListener("selectionchange", scheduleMeasure);
        document.addEventListener("visibilitychange", scheduleMeasure);
        window.addEventListener("blur", hide);
        window.addEventListener("focus", scheduleMeasure);
        const resize = new ResizeObserver(scheduleMeasure);
        resize.observe(element);
        const attributes = new MutationObserver(scheduleMeasure);
        attributes.observe(element, { attributes: true, attributeFilter: ["disabled"] });
        cleanupInput = () => {
            for (const event of events) element.removeEventListener(event, scheduleMeasure);
            element.removeEventListener("blur", hide);
            element.removeEventListener("compositionstart", compositionStart);
            element.removeEventListener("compositionend", compositionEnd);
            document.removeEventListener("selectionchange", scheduleMeasure);
            document.removeEventListener("visibilitychange", scheduleMeasure);
            window.removeEventListener("blur", hide);
            window.removeEventListener("focus", scheduleMeasure);
            resize.disconnect(); attributes.disconnect();
            element.style.caretColor = originalColor;
        };
        scheduleMeasure();
    };
    onCleanup(() => { cancelAnimationFrame(frame); cleanupInput?.(); mirror?.remove(); });
    return { caret, bind, scheduleMeasure };
};
