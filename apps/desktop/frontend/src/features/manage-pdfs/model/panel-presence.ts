export const shouldKeepPdfPanelMounted = (
	panelPresent: boolean,
	openedDocumentId: string | undefined,
) => panelPresent || Boolean(openedDocumentId);
