type Save = () => Promise<boolean>;

export const createSaveCheckpoints = (options: {
	resolvingConflict: () => boolean;
	saveNoteTitle: Save;
	saveNotes: Save;
	saveAiChats: Save;
	saveKanban: Save;
	savePdfs: Save;
	savePomodoro: Save;
	saveStudies: Save;
}) => {
	const beforeAiRequest = async () => {
		if (options.resolvingConflict()) return false;
		if (!(await options.saveNoteTitle())) return false;
		if (!(await options.saveNotes())) return false;
		return options.saveAiChats();
	};
	const beforeShutdown = async () => {
		if (!(await beforeAiRequest())) return false;
		if (!(await options.saveKanban())) return false;
		if (!(await options.savePdfs())) return false;
		if (!(await options.savePomodoro())) return false;
		return options.saveStudies();
	};
	return { beforeAiRequest, beforeShutdown };
};
