export type AppWindow = "chat" | "kanban" | "pdfs" | "pomodoro" | "settings" | "vault" | "study" | "note-name" | "delete";

type WindowCategory = "left" | "right" | "modal";

const windowCategory: Record<AppWindow, WindowCategory> = {
	chat: "right",
	kanban: "left",
	pdfs: "right",
	pomodoro: "left",
	settings: "modal",
	vault: "modal",
	study: "modal",
	"note-name": "modal",
	delete: "modal",
};

export const shouldHideWindow = (keep: AppWindow, candidate: AppWindow): boolean => {
	return keep !== candidate && windowCategory[keep] === windowCategory[candidate];
};
