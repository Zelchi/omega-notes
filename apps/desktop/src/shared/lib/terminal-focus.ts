/** Atalhos globais de notas e do canvas não devem consumir teclas destinadas a uma CLI interativa. */
export const isTerminalTarget = (target: EventTarget | null): boolean =>
    target instanceof Element && !!target.closest("[data-omega-terminal]");
