import { For, Show, createEffect, createMemo, untrack, onCleanup, type Component } from "solid-js";
import { createNoteTitleIndex, normalizeNoteTitle, resolveNoteReference, type StudyNote } from "@/entities/note";
import type { TranslationKey } from "@/shared/lib/i18n";
import Icon from "@/shared/ui/icon";
import Dropdown from "@/shared/ui/dropdown";
import AiProviderIcon from "@/shared/ui/ai-provider-icon";
import { createPresence } from "@/shared/lib/presence";
import { registerVisibilityAnimation } from "@/shared/ui/visibility-animation";
import type { AiChatController } from "../../model/ai-chat.controller";
import { styles } from "./style.css.ts";
import ChatMessageText from "./chat-message-text";
import TextCaret from "@/shared/ui/text-caret";
import { useTextareaCaret } from "@/shared/ui/text-caret/use-textarea-caret";
import CustomScrollArea, { CustomScrollbars, useCustomScrollArea } from "@/shared/ui/custom-scroll-area";

type Props = {
    aiChat: AiChatController;
    notes: StudyNote[];
    onOpenNote: (note: StudyNote) => void;
    t: (key: TranslationKey) => string;
};

const effortLabels: Record<string, TranslationKey> = {
    none: "aiEffortNone", minimal: "aiEffortMinimal", low: "aiEffortLow", medium: "aiEffortMedium",
    high: "aiEffortHigh", xhigh: "aiEffortExtraHigh", max: "aiEffortMax", ultra: "aiEffortUltra",
};

const ChatComposer: Component<Pick<Props, "aiChat" | "t"> & { onSend: () => void }> = (props) => {
    const messageCaret = useTextareaCaret();
    const composerScroll = useCustomScrollArea({ compact: true });
    let composerFrame = 0;
    createEffect(() => {
        props.aiChat.chat().draft;
        props.aiChat.chat().busy;
        props.aiChat.status().authenticated;
        messageCaret.scheduleMeasure();
        cancelAnimationFrame(composerFrame);
        composerFrame = requestAnimationFrame(composerScroll.updateMetrics);
    });
    onCleanup(() => cancelAnimationFrame(composerFrame));
    return <form class={styles.composer} onSubmit={(event) => { event.preventDefault(); props.onSend(); }}>
        <div class={styles.messageInput} ref={composerScroll.setRoot} data-omega-scroll-root
            onPointerMove={composerScroll.moveThumb} onPointerUp={composerScroll.finishDrag}
            onPointerCancel={composerScroll.finishDrag} onLostPointerCapture={composerScroll.finishDrag}>
            <textarea ref={(element) => { messageCaret.bind(element); composerScroll.setViewport(element); composerScroll.setContent(element); }}
                data-omega-scroll-viewport class={styles.textarea} aria-label={props.t("aiMessage")} placeholder={props.t("aiMessagePlaceholder")} value={props.aiChat.chat().draft} maxlength={8000}
                disabled={!props.aiChat.status().authenticated || props.aiChat.pending()}
                onInput={(event) => props.aiChat.setDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); props.onSend(); }
                }} />
            <div class={styles.caretClip} aria-hidden="true"><TextCaret geometry={messageCaret.caret()} /></div>
            <CustomScrollbars scroll={composerScroll} compact />
        </div>
        <button class={styles.button} type="submit"
            disabled={!props.aiChat.status().authenticated || !props.aiChat.chat().draft.trim() || props.aiChat.pending() || props.aiChat.sending()
                || (props.aiChat.chat().busy && !props.aiChat.provider.steer)}
            aria-label={props.t(props.aiChat.chat().busy ? "aiSteer" : "aiSend")}><Icon name="send" size={18} /></button>
        <Show when={props.aiChat.chat().busy}>
            <button class={styles.button} type="button" disabled={props.aiChat.pending()} aria-label={props.t("aiStop")} onClick={() => void props.aiChat.cancel()}><Icon name="stop" size={18} /></button>
        </Show>
    </form>;
};

const ChatBody: Component<Props> = (props) => {
    const messagesById = createMemo(() => new Map(props.aiChat.chat().messages.map((message) => [message.id, message])));
    const messageIds = createMemo(() => props.aiChat.chat().messages.map((message) => message.id));
    const notesById = createMemo(() => new Map(props.notes.map((note) => [normalizeNoteTitle(note.id), note])));
    const notesByTitle = createMemo(() => createNoteTitleIndex(props.notes));
    const resolveNote = (target: string) => resolveNoteReference(target, notesById(), notesByTitle());
    let messages: HTMLDivElement | undefined;
    let scrollFrame = 0;
    let follow = true;
    createEffect(() => {
        props.aiChat.chat().messages;
        props.aiChat.chat().busy;
        cancelAnimationFrame(scrollFrame);
        scrollFrame = requestAnimationFrame(() => { if (messages && follow) messages.scrollTop = messages.scrollHeight; });
    });
    onCleanup(() => cancelAnimationFrame(scrollFrame));
    return <div class={styles.body}>
        <header class={styles.header}>
            <h2 id="ai-chat-heading" class={styles.title}>{props.t("aiChat")}</h2>
            <div class={styles.actions}>
                <button class={styles.closeButton} type="button" aria-label={props.t("close")} onClick={() => props.aiChat.setOpen(false)}><Icon name="close" size={15} /></button>
            </div>
        </header>
        <Show when={props.aiChat.status().connected}>
            <Show when={props.aiChat.status().authenticated} fallback={
                <div class={styles.setup}>
                    <p class={styles.hint}>{props.t(props.aiChat.provider.labels.signInRequired)}</p>
                    <div class={styles.actions}>
                        <button class={styles.button} type="button" disabled={props.aiChat.pending()} onClick={() => void props.aiChat.signIn()}>{props.t(props.aiChat.provider.labels.signIn)}</button>
                        <button class={styles.button} type="button" disabled={props.aiChat.pending()} onClick={() => void props.aiChat.refresh()}>{props.t("aiRefreshAccount")}</button>
                    </div>
                </div>
            }>
                <div class={styles.options}>
                    <div class={styles.option}>
                        <Dropdown id="aiChat-model" ariaLabel={props.t("aiModel")}
                            value={props.aiChat.selectedModel()?.id ?? ""}
                            options={props.aiChat.models().length ? props.aiChat.models().map((model) => ({ value: model.id, label: model.name })) : [{ value: "", label: props.t("aiDefaultModel") }]}
                            disabled={props.aiChat.chat().busy || props.aiChat.sending() || props.aiChat.pending()}
                            onChange={(value) => props.aiChat.setModel(value)} />
                    </div>
                    <div class={styles.option}>
                        <Dropdown id="aiChat-effort" ariaLabel={props.t("aiThinkingLevel")}
                            value={props.aiChat.selectedEffort()}
                            options={props.aiChat.selectedModel()?.efforts.length
                                ? props.aiChat.selectedModel()!.efforts.map((effort) => ({ value: effort, label: effortLabels[effort] ? props.t(effortLabels[effort]) : effort }))
                                : [{ value: "", label: props.t("aiDefaultModel") }]}
                            disabled={props.aiChat.chat().busy || props.aiChat.sending() || props.aiChat.pending() || !props.aiChat.selectedModel()?.efforts.length}
                            onChange={(value) => props.aiChat.setEffort(value)} />
                    </div>
                    <div class={styles.option}>
                        <Dropdown id="aiChat-speed" ariaLabel={props.t("aiSpeed")}
                            value={props.aiChat.chat().fast && props.aiChat.fastAvailable() ? "fast" : "default"}
                            options={[{ value: "default", label: "Default" }, { value: "fast", label: "Fast", disabled: !props.aiChat.fastAvailable() }]}
                            disabled={props.aiChat.chat().busy || props.aiChat.sending() || props.aiChat.pending()}
                            onChange={(value) => props.aiChat.setFast(value === "fast")} />
                    </div>
                </div>
            </Show>
        </Show>
        <Show when={props.aiChat.status().connected} fallback={
            <section class={styles.connectSection} aria-labelledby="connect-ai-heading">
                <h3 id="connect-ai-heading" class={styles.connectTitle}>{props.t("connectAi")}</h3>
                <div class={styles.providers}>
                    <button class={styles.providerButton} type="button" disabled={props.aiChat.pending() || !props.aiChat.ready()}
                        aria-label={props.t(props.aiChat.provider.labels.connect)} onClick={() => void props.aiChat.connect()}>
                        <AiProviderIcon provider={props.aiChat.provider.id} />
                        <span>{props.aiChat.pending() ? props.t("aiConnecting") : props.aiChat.provider.name}</span>
                    </button>
                    <button class={styles.providerButton} type="button" disabled>
                        <AiProviderIcon provider="claude" /><span>Claude</span>
                    </button>
                    <button class={styles.providerButton} type="button" disabled>
                        <AiProviderIcon provider="opencode" /><span>OpenCode</span>
                    </button>
                </div>
            </section>
        }>
            <CustomScrollArea class={styles.messageArea} contentClass={styles.messages}
                viewportStyle={{ padding: "8px 16px 8px 4px" }}
                ariaLabel={props.t("aiMessages")}
                viewportRef={(element) => { messages = element; }}
                onScroll={(element) => { follow = element.scrollHeight - element.scrollTop - element.clientHeight < 60; }}>
                <For each={messageIds()}>{(id) => {
                    const initial = untrack(() => messagesById().get(id))!;
                    const message = () => messagesById().get(id) ?? initial;
                    return <div class={`${styles.message} ${message().role === "user" ? styles.user : styles.assistant}`}>
                        <span class={styles.role}>{message().role === "user" ? props.t("aiYou") : props.aiChat.provider.name}</span>
                        <ChatMessageText
                            text={message().text || (id === props.aiChat.chat().requestId && props.aiChat.chat().busy ? props.t("aiThinking") : props.t("aiNoResponse"))}
                            resolveNote={resolveNote}
                            onOpenNote={props.onOpenNote}
                        />
                    </div>;
                }}</For>
            </CustomScrollArea>
        </Show>
        <Show when={props.aiChat.error() || props.aiChat.chat().error}>{(error) => <p role="alert" class={styles.error}>{error()}</p>}</Show>
        <Show when={props.aiChat.status().connected && props.aiChat.status().authenticated}>
            <ChatComposer aiChat={props.aiChat} t={props.t} onSend={() => { follow = true; void props.aiChat.send(); }} />
        </Show>
    </div>;
};

const AiChatPanel: Component<Props> = (props) => {
    const presence = createPresence(props.aiChat.open, 210);
    return <Show when={presence.present()}>
        <aside id="ai-chat-panel" class={styles.panel} aria-labelledby="ai-chat-heading"
            inert={presence.exiting()} aria-hidden={presence.exiting() ? "true" : undefined}
            ref={(element) => registerVisibilityAnimation(element, presence.exiting, "panel")}
            onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); props.aiChat.setOpen(false); } }}>
            <ChatBody {...props} />
        </aside>
    </Show>;
};

export default AiChatPanel;
