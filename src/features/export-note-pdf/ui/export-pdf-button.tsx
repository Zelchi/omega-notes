import { createSignal, Show, type Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import Icon from "@/shared/ui/icon";
import { styles } from "./style.css";

type Props = { t: (key: TranslationKey) => string; onExport: () => Promise<void>; disabled?: boolean };
export const ExportPdfButton: Component<Props> = (props) => {
	const [busy, setBusy] = createSignal(false);
	const [failed, setFailed] = createSignal(false);
	const exportPdf = async () => {
		if (busy() || props.disabled) return;
		setBusy(true);
		setFailed(false);
		try { await props.onExport(); }
		catch (error) { console.error(error); setFailed(true); }
		finally { setBusy(false); }
	};
	return <div class={styles.root}>
		<button class={styles.button} type="button" disabled={busy() || props.disabled} aria-busy={busy()}
			aria-label={props.t(busy() ? "exportingPdf" : "exportPdf")}
			title={props.t(busy() ? "exportingPdf" : "exportPdf")}
			onPointerDown={(event) => event.preventDefault()} onClick={() => void exportPdf()}>
			<Icon name="exportPdf" size={17} />
		</button>
		<Show when={failed()}><span role="alert" class={styles.error}>{props.t("exportPdfFailed")}</span></Show>
	</div>;
};
