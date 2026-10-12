import { render } from "solid-js/web";
import type { StudyNote } from "@/entities/note";
import { exportNotePdf } from "@/features/export-note-pdf";
import type { TranslationKey } from "@/shared/lib/i18n";
import NoteCanvasEditor from "../ui/note-canvas-editor";

export const exportNote = async (source: StudyNote, notes: StudyNote[], t: (key: TranslationKey) => string): Promise<void> => {
	const note = structuredClone(source);
	const root = document.createElement("div");
	root.inert = true;
	root.setAttribute("aria-hidden", "true");
	Object.assign(root.style, {
		position: "fixed", left: "-100000px", top: "0", width: `${note.document.page.width}px`,
		background: "#fff", color: "#111", "--ink": "#111", "--muted": "#666",
		"--surface-editor": "#fff", "--border-soft": "transparent", "--surface-panel": "#f5f5f5",
	});
	document.body.append(root);
	let dispose: (() => void) | undefined;
	try {
		dispose = render(() => <>
		<h1 style={{ margin: "0", padding: "24px 32px", "font-size": "30px", "line-height": "1.2", "overflow-wrap": "anywhere" }}>{note.title}</h1>
		<NoteCanvasEditor document={note.document} notes={notes} mode="view" t={t} onChange={() => {}} onOpenNote={() => {}} />
		</>, root);
		await exportNotePdf(root, note.title, { audio: t("pdfAudio"), video: t("pdfVideo") });
	} finally { dispose?.(); root.remove(); }
};
