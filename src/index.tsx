import { render } from "solid-js/web";
import "./index.css";
import App from "@/app";
import { readLanguage } from "@/features/change-preferences";
import { translate } from "@/shared/lib/i18n";

const root = document.getElementById("root");

if (!root) {
	throw new Error(translate(readLanguage(), "rootElementMissing"));
}

render(() => <App />, root);