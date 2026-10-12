import { createSignal } from "solid-js";

export const useNoteLoadIssuesDialogController = () => {
	const [copiedPath, setCopiedPath] = createSignal<string>();

	const copyPath = async (path: string): Promise<void> => {
		try {
			await navigator.clipboard.writeText(path);
			setCopiedPath(path);
		} catch (error) {
			console.error(error);
		}
	};

	return { copiedPath, copyPath };
};
