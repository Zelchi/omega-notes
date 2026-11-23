export const createLongPress = (onLongPress: () => void, delayMs = 3000) => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let triggered = false;

	const start = () => {
		clearTimeout(timer);
		triggered = false;
		timer = setTimeout(() => {
			timer = undefined;
			triggered = true;
			onLongPress();
		}, delayMs);
	};

	const cancel = () => {
		clearTimeout(timer);
		timer = undefined;
	};

	const consume = () => {
		const wasTriggered = triggered;
		triggered = false;
		return wasTriggered;
	};

	return { start, cancel, consume };
};
