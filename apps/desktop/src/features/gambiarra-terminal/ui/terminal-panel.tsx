import { createEffect, createSignal, For, onCleanup, Show, type Component } from "solid-js";
import Button from "@/shared/ui/button";
import Icon from "@/shared/ui/icon";
import AiProviderIcon from "@/shared/ui/ai-provider-icon";
import type { AiProviderId } from "@/entities/ai";
import { readInstalledAiProviders, type InstalledAiProviders } from "@/features/chat-with-ai/api/providers.repository";
import { createPresence } from "@/shared/lib/presence";
import { registerVisibilityAnimation } from "@/shared/ui/visibility-animation";
import type { TranslationKey } from "@/shared/lib/i18n";
import { styles } from "@/features/chat-with-ai/ui/ai-chat-panel/style.css.ts";
import TerminalView from "./terminal-view";
import StudyRequestNotice from "./study-request-notice";
import type { CliStudyRequest } from "../model/study-bridge";
import { terminalStyles } from "./style.css.ts";
import { cx } from "@/shared/lib/classes";
import AsciiBackdrop from "@/shared/ui/ascii-backdrop";

const providers: { id: AiProviderId; name: string }[] = [
    { id: "codex", name: "Codex" }, { id: "claude", name: "Claude" },
    { id: "opencode", name: "OpenCode" }, { id: "antigravity", name: "Antigravity" },
];

const VaultTerminal: Component<{ vaultId: string; providerId: AiProviderId; visible: boolean; onCliExit: () => void; t: (key: TranslationKey) => string }> = props => {
    const [started, setStarted] = createSignal(false), [generation, setGeneration] = createSignal(1);
    createEffect(() => { if (props.visible) setStarted(true); });
    return <Show when={started()}><Show when={generation()} keyed>{_generation =>
        <TerminalView vaultId={props.vaultId} providerId={props.providerId} visible={props.visible} t={props.t}
            onCliExit={() => { setStarted(false); props.onCliExit(); }} onRestart={() => setGeneration(value => value + 1)} />
    }</Show></Show>;
};

const TerminalPanel: Component<{ open: boolean; vaultId: string | undefined; onClose: () => void; t: (key: TranslationKey) => string; studyRequest?: CliStudyRequest; canConfirmStudy: boolean; onConfirmStudy: () => void }> = props => {
    const presence = createPresence(() => props.open, 210);
    const [provider, setProvider] = createSignal<AiProviderId>();
    const [installedProviders, setInstalledProviders] = createSignal<Partial<InstalledAiProviders>>({});
    const [checkingProviders, setCheckingProviders] = createSignal(false);
    const [providerCheckFailed, setProviderCheckFailed] = createSignal(false);
    createEffect(() => {
        if (!props.open || provider()) return;
        let current = true;
        onCleanup(() => { current = false; });
        setCheckingProviders(true);
        setProviderCheckFailed(false);
        setInstalledProviders({});
        void readInstalledAiProviders().then(available => {
            if (current) setInstalledProviders(available);
        }).catch(() => {
            if (current) setProviderCheckFailed(true);
        }).finally(() => {
            if (current) setCheckingProviders(false);
        });
    });
    return <aside id="ai-chat-panel" class={styles.panel} aria-labelledby="gambiarra-chat-heading"
        style={{ display: presence.present() ? undefined : "none" }} inert={!props.open} aria-hidden={!props.open}
        ref={element => registerVisibilityAnimation(element, presence.exiting, "panel")}>
        <AsciiBackdrop placement="modal" />
        <div class={cx(styles.body, terminalStyles.body)}>
            <header class={styles.header}>
                <h2 id="gambiarra-chat-heading" class={styles.title}>{props.t("aiChat")}</h2>
                <Button class={styles.closeButton} type="button" aria-label={props.t("close")} onClick={props.onClose}><Icon name="close" size={15} /></Button>
            </header>
            <Show when={props.studyRequest}>{request => <StudyRequestNotice request={request()} t={props.t} />}</Show>
            <Show when={provider()} keyed fallback={
                <section class={styles.connectSection} aria-labelledby="gambiarra-connect-heading">
                    <h3 id="gambiarra-connect-heading" class={styles.connectTitle}>{props.t("connectAi")}</h3>
                    <div class={styles.providers}>
                        <For each={providers}>{option =>
                            <Button class={styles.providerButton} type="button" disabled={!props.vaultId || checkingProviders() || !installedProviders()[option.id]}
                                onClick={() => setProvider(option.id)}>
                                <AiProviderIcon provider={option.id} />
                                <span>{option.name}</span>
                            </Button>
                        }</For>
                    </div>
                    <Show when={providerCheckFailed()}><p class={styles.error} role="alert">{props.t("aiProviderCheckFailed")}</p></Show>
                </section>
            }>{providerId =>
                <Show when={props.vaultId} keyed>{vaultId => <VaultTerminal vaultId={vaultId} providerId={providerId} visible={props.open} onCliExit={props.onClose} t={props.t} />}</Show>
                }</Show>
            <Show when={props.canConfirmStudy}><footer class={terminalStyles.studyFooter}>
                <Button class={terminalStyles.restart} type="button" onClick={props.onConfirmStudy}>{props.t("studyCliConfirm")}</Button>
            </footer></Show>
        </div>
    </aside>;
};
export default TerminalPanel;
