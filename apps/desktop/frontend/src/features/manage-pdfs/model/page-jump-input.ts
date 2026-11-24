export const createPdfPageJumpInputHandlers = (options: {
	setValue: (value: string) => void;
	goToPage: () => void;
	close: () => void;
}) => ({
	input: (event: { currentTarget: { value: string } }) => options.setValue(event.currentTarget.value),
	blur: () => options.goToPage(),
	keyDown: (event: { key: string; preventDefault: () => void }) => {
		if (event.key === "Enter") {
			event.preventDefault();
			options.goToPage();
		} else if (event.key === "Escape") {
			event.preventDefault();
			options.close();
		}
	},
});
