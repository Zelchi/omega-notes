type BackdropPointerEvent = PointerEvent & { currentTarget: HTMLDivElement };
type BackdropClickEvent = MouseEvent & { currentTarget: HTMLDivElement };

export const createBackdropDismiss = (dismiss: () => void) => {
    let pointerId: number | undefined;
    let completedOutside = false;
    const reset = () => { pointerId = undefined; completedOutside = false; };

    return {
        "oncapture:pointerdown": (event: BackdropPointerEvent) => {
            reset();
            if (event.isPrimary && event.button === 0 && event.target === event.currentTarget) {
                pointerId = event.pointerId;
            }
        },
        "oncapture:pointerup": (event: BackdropPointerEvent) => {
            completedOutside = event.button === 0 && event.pointerId === pointerId && event.target === event.currentTarget;
            pointerId = undefined;
        },
        "oncapture:pointercancel": reset,
        onClick: (event: BackdropClickEvent) => {
            const shouldDismiss = completedOutside && event.button === 0 && event.target === event.currentTarget;
            reset();
            if (shouldDismiss) dismiss();
        },
    };
};
