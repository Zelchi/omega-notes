const MAX_CONCURRENT_DOCUMENT_READS = 4;
let activeDocumentReads = 0;
const queuedDocumentReads: (() => void)[] = [];

export const withDocumentReadSlot = async <T>(read: () => Promise<T>): Promise<T> => {
	if (activeDocumentReads >= MAX_CONCURRENT_DOCUMENT_READS) {
		await new Promise<void>((resolve) => queuedDocumentReads.push(resolve));
	} else {
		activeDocumentReads++;
	}
	try {
		return await read();
	} finally {
		const next = queuedDocumentReads.shift();
		if (next) next();
		else activeDocumentReads--;
	}
};
