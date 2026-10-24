import { createEffect, createSignal, onCleanup, Show, type Component } from "solid-js";
import Button from "@/shared/ui/button";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { CliStudyRequest } from "../model/study-bridge";
import { terminalStyles } from "./style.css.ts";

const StudyRequestNotice: Component<{
    request: CliStudyRequest; t: (key: TranslationKey) => string; onOpenCli?: () => void;
}> = props => {
    const [failed, setFailed] = createSignal(false);
    let disposed = false;
    onCleanup(() => { disposed = true; });
    createEffect(() => { props.request.id; setFailed(false); });
    const prompt = () => props.t("studyCliPrompt").replace("{path}", props.request.path);
    const copy = async () => {
        const id = props.request.id;
        try {
            await navigator.clipboard.writeText(prompt());
            if (disposed || id !== props.request.id) return;
            setFailed(false); props.onOpenCli?.();
        } catch { if (!disposed && id === props.request.id) setFailed(true); }
    };
    return <div class={terminalStyles.studyNotice}>
        <Button class={terminalStyles.restart} type="button" onClick={() => void copy()}>{props.t("studyCliCopy")}</Button>
        <Show when={failed()}><p class={terminalStyles.status}>{props.t("studyCliCopyFailed")}</p><p class={terminalStyles.copyPrompt}>{prompt()}</p></Show>
    </div>;
};
export default StudyRequestNotice;
