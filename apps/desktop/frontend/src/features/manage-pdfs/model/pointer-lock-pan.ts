type PointerLockPanEnvironment = {
	isHovered: () => boolean;
	hasPointerLock: () => boolean;
	isViewportLocked: () => boolean;
	requestLock?: () => void | Promise<void>;
	exitLock: () => void;
	activatePan: () => void;
	resetPanPointer: () => void;
	finishPan: () => void;
};

export const createPdfReaderPointerLockPan = (environment: PointerLockPanEnvironment) => {
	let altHeld = false;

	const unlock = () => {
		if (environment.isViewportLocked()) environment.exitLock();
	};

	const stop = () => {
		altHeld = false;
		unlock();
		environment.finishPan();
	};

	const pressAlt = (event: Pick<KeyboardEvent, "key" | "repeat">) => {
		if (event.key !== "Alt" || event.repeat || !environment.isHovered()) return;
		altHeld = true;
		environment.activatePan();
		if (environment.hasPointerLock() || !environment.requestLock) return;
		try {
			const request = environment.requestLock();
			if (request) void request.then(() => {
				if (!altHeld) unlock();
			}).catch(() => {});
		} catch {
			// Keep hover scrolling available when pointer lock is unavailable.
		}
	};

	const releaseAlt = (event: Pick<KeyboardEvent, "altKey">) => {
		if (!event.altKey) stop();
	};

	const pointerLockChanged = () => {
		environment.resetPanPointer();
		if (!altHeld) unlock();
	};

	return { pressAlt, releaseAlt, pointerLockChanged, stop };
};

export const installPdfReaderPointerLockPan = (
	environment: PointerLockPanEnvironment,
	targets: { windowTarget: EventTarget; documentTarget: EventTarget },
) => {
	const pointerLockPan = createPdfReaderPointerLockPan(environment);
	const pressAlt = (event: Event) => pointerLockPan.pressAlt(event as KeyboardEvent);
	const releaseAlt = (event: Event) => pointerLockPan.releaseAlt(event as KeyboardEvent);
	const stop = () => pointerLockPan.stop();
	const pointerLockChanged = () => pointerLockPan.pointerLockChanged();

	targets.windowTarget.addEventListener("keydown", pressAlt, true);
	targets.windowTarget.addEventListener("keyup", releaseAlt, true);
	targets.windowTarget.addEventListener("blur", stop);
	targets.documentTarget.addEventListener("pointerlockchange", pointerLockChanged);

	let active = true;
	return () => {
		if (!active) return;
		active = false;
		targets.windowTarget.removeEventListener("keydown", pressAlt, true);
		targets.windowTarget.removeEventListener("keyup", releaseAlt, true);
		targets.windowTarget.removeEventListener("blur", stop);
		targets.documentTarget.removeEventListener("pointerlockchange", pointerLockChanged);
		pointerLockPan.stop();
	};
};
