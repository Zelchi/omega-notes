import { isTauriRuntime } from "@/shared/lib/tauri";
import { invoke } from "@tauri-apps/api/core";

export const savePdf = async (filename: string, bytes: ArrayBuffer): Promise<void> => {
	if (isTauriRuntime()) {
		await invoke("export_note_pdf", { filename, bytes: Array.from(new Uint8Array(bytes)) });
		return;
	}
	const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 30_000);
};
