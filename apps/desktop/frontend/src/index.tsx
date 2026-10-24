import { initializeDesktopStorage } from "./shared/lib/storage-import";
import { render } from "solid-js/web";
import "./index.css";
import App from "@/app";
import { readLanguage } from "@/features/change-preferences/api/preferences.repository";
import { translate } from "@/shared/lib/i18n";

if (import.meta.env.VITE_DESKTOP_RUNTIME === "tauri") {
	const { installTauriDesktopApi } = await import("@/shared/lib/desktop-tauri");
	installTauriDesktopApi();
}

const root = document.getElementById("root");

if (!root) {
	throw new Error(translate(readLanguage(), "rootElementMissing"));
}

await initializeDesktopStorage();
render(() => <App />, root);
