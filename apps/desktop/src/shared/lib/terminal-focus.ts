/** Global note/canvas shortcuts must not consume keys intended for an interactive CLI. */
export const isTerminalTarget = (target: EventTarget | null): boolean =>
    target instanceof Element && !!target.closest("[data-omega-terminal]");
