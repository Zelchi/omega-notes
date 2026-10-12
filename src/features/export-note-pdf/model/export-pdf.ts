import { savePdf } from "../api/pdf.repository";

export const exportNotePdf = async (root: HTMLElement, title: string, mediaLabels: { audio: string; video: string }): Promise<void> => {
	const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
	await document.fonts.ready;
	const deadline = Date.now() + 15_000;
	while ([...root.querySelectorAll("img")].some((image) => !image.complete || !image.naturalWidth)) {
		if (Date.now() > deadline) throw new Error("PDF_IMAGE_LOAD_FAILED");
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
	const width = root.offsetWidth;
	const bounds = root.getBoundingClientRect();
	const content = [...root.querySelectorAll<HTMLElement>("h1, [data-text-fragment], [data-omega-element]:not([data-omega-element='text'])")];
	const height = Math.ceil(content.reduce((bottom, element) => Math.max(bottom, element.getBoundingClientRect().bottom - bounds.top), 0) + 32);
	const pageHeight = Math.floor(width * 297 / 210);
	const lines: { top: number; bottom: number }[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const range = document.createRange();
	while (walker.nextNode()) {
		if (!walker.currentNode.textContent?.trim()) continue;
		if (walker.currentNode.parentElement?.closest('[data-omega-element="audio"], [data-omega-element="video"]')) continue;
		range.selectNodeContents(walker.currentNode);
		for (const rect of range.getClientRects()) lines.push({ top: rect.top - bounds.top, bottom: rect.bottom - bounds.top });
	}
	const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
	pdf.setProperties({ title, creator: "Ômega Notes" });
	for (let offset = 0; offset < height;) {
		let end = Math.min(offset + pageHeight, height);
		// Move a break above text that would straddle two PDF pages.
		while (end < height) {
			const crossing = lines.filter((line) => line.top < end && line.bottom > end);
			if (!crossing.length) break;
			const next = Math.floor(Math.min(...crossing.map((line) => line.top))) - 1;
			if (next <= offset || next >= end) break;
			end = next;
		}
		const sliceHeight = end - offset;
		const canvas = await html2canvas(root, {
			backgroundColor: "#ffffff", scale: 2, width, height: sliceHeight, y: offset,
			logging: false, useCORS: true, windowWidth: Math.max(width, 1024),
			onclone: (_document, clonedRoot) => {
				clonedRoot.style.left = "0";
				clonedRoot.style.top = "0";
				for (const type of ["audio", "video"] as const) {
					for (const media of clonedRoot.querySelectorAll<HTMLElement>(`[data-omega-element="${type}"]`)) {
						media.textContent = mediaLabels[type];
						Object.assign(media.style, { display: "flex", alignItems: "center", justifyContent: "center",
							background: "#f5f5f5", color: "#555", border: "1px solid #ccc", fontSize: "12px" });
					}
				}
				for (const element of clonedRoot.querySelectorAll<HTMLElement>("*")) {
					element.style.animation = "none";
					element.style.transition = "none";
				}
			},
		});
		if (offset) pdf.addPage();
		pdf.addImage(canvas, "PNG", 0, 0, 210, sliceHeight * 210 / width, undefined, "FAST");
		for (const link of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
			if (!/^https?:\/\//i.test(link.href)) continue;
			for (const rect of link.getClientRects()) {
				const top = Math.max(rect.top - bounds.top, offset);
				const bottom = Math.min(rect.bottom - bounds.top, end);
				if (bottom <= top) continue;
				pdf.link((rect.left - bounds.left) * 210 / width, (top - offset) * 210 / width,
					rect.width * 210 / width, (bottom - top) * 210 / width, { url: link.href });
			}
		}
		canvas.width = canvas.height = 0;
		offset = end;
	}
	const filename = (title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "").slice(0, 120) || "note") + ".pdf";
	await savePdf(filename, pdf.output("arraybuffer"));
};
