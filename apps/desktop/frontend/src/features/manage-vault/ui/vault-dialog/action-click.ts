type ClickTargets = Pick<MouseEvent, "target" | "currentTarget">;

export const handleVaultActionsBackgroundClick = (event: ClickTargets, onToggle: () => void): boolean => {
	if (event.target !== event.currentTarget) return false;
	onToggle();
	return true;
};
