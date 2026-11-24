export const retainExitingMessage = (
	open: boolean,
	currentMessage: string,
	previousMessage: string | undefined,
): string => open ? currentMessage : previousMessage ?? currentMessage;
