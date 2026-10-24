import Textarea from "@/shared/ui/textarea";
import Button from "@/shared/ui/button";
import { For, Show, createEffect, createMemo, createSignal, untrack, onCleanup, type Component } from "solid-js";
import { normalizeNoteTitle, type NoteSummary } from "@/entities/note";
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
import AsciiBackdrop from "@/shared/ui/ascii-backdrop";
import { openUrl } from "@/shared/lib/desktop";

type Props = {
    aiChat: AiChatController;
    notes: NoteSummary[];
    onOpenNote: (note: NoteSummary) => void;
    t: (key: TranslationKey) => string;
};

const effortLabels: Record<string, TranslationKey> = {
    none: "aiEffortNone", minimal: "aiEffortMinimal", low: "aiEffortLow", medium: "aiEffortMedium",
    high: "aiEffortHigh", xhigh: "aiEffortExtraHigh", max: "aiEffortMax", ultra: "aiEffortUltra",
};

const ChatComposer: Component<Pick<Props, "aiChat" | "t"> & { onSend: () => void; onInputReady: (input: HTMLTextAreaElement) => void }> = (props) => {
    const messageCaret = useTextareaCaret();
    const composerScroll = useCustomScrollArea({ compact: true });
    let input: HTMLTextAreaElement | undefined;
    let focusFrame = 0;
    let needsFocus = true;
    let composerFrame = 0;
    createEffect(() => {
        const open = props.aiChat.open();
        const pending = props.aiChat.pending();
        cancelAnimationFrame(focusFrame);
        if (!open) { needsFocus = true; return; }
        if (!needsFocus || pending) return;
        focusFrame = requestAnimationFrame(() => {
            if (!input?.isConnected || input.disabled || !props.aiChat.open()) return;
            input.focus({ preventScroll: true });
            needsFocus = false;
            messageCaret.scheduleMeasure();
        });
    });
    createEffect(() => {
        props.aiChat.chat().draft;
        props.aiChat.chat().busy;
        props.aiChat.status().authenticated;
        messageCaret.scheduleMeasure();
        cancelAnimationFrame(composerFrame);
        composerFrame = requestAnimationFrame(composerScroll.updateMetrics);
    });
    onCleanup(() => { cancelAnimationFrame(composerFrame); cancelAnimationFrame(focusFrame); });
    return <form class={styles.composer} onSubmit={(event) => { event.preventDefault(); props.onSend(); }}>
        <div class={styles.messageInput} ref={composerScroll.setRoot} data-omega-scroll-root
            onPointerMove={composerScroll.moveThumb} onPointerUp={composerScroll.finishDrag}
            onPointerCancel={composerScroll.finishDrag} onLostPointerCapture={composerScroll.finishDrag}>
            <Textarea ref={(element) => { input = element; props.onInputReady(element); messageCaret.bind(element); composerScroll.setViewport(element); composerScroll.setContent(element); }}
                data-omega-scroll-viewport class={styles.textarea} aria-label={props.t("aiMessage")} placeholder={props.t("aiMessagePlaceholder")} value={props.aiChat.chat().draft} maxlength={8000}
                disabled={!props.aiChat.status().authenticated || props.aiChat.pending()}
                onInput={(event) => props.aiChat.setDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); props.onSend(); }
                }} />
            <div class={styles.caretClip} aria-hidden="true"><TextCaret geometry={messageCaret.caret()} /></div>
            <CustomScrollbars scroll={composerScroll} compact />
        </div>
        <Button class={styles.button} type="submit"
            disabled={!props.aiChat.status().authenticated || !props.aiChat.chat().draft.trim() || props.aiChat.pending() || props.aiChat.sending()
                || (props.aiChat.chat().busy && !props.aiChat.provider.steer)}
            aria-label={props.t(props.aiChat.chat().busy ? "aiSteer" : "aiSend")}><Icon name="send" size={18} /></Button>
        <Show when={props.aiChat.chat().busy}>
            <Button class={styles.button} type="button" disabled={props.aiChat.pending()} aria-label={props.t("aiStop")} onClick={() => void props.aiChat.cancel()}><Icon name="stop" size={18} /></Button>
        </Show>
    </form>;
};

const ChatBody: Component<Props> = (props) => {
    const messagesById = createMemo(() => new Map(props.aiChat.chat().messages.map((message) => [message.id, message])));
    const messageIds = createMemo(() => props.aiChat.chat().messages.map((message) => message.id));
    const notesById = createMemo(() => new Map(props.notes.map((note) => [normalizeNoteTitle(note.id), note])));
    const resolveNote = (target: string) => notesById().get(normalizeNoteTitle(target));
    let messages: HTMLDivElement | undefined;
    let body: HTMLDivElement | undefined;
    let composerInput: HTMLTextAreaElement | undefined;
    let scrollFrame = 0;
    const [textMenu, setTextMenu] = createSignal<{ text: string; x: number; y: number }>();
    createEffect(() => {
        if (!textMenu()) return;
        const outside = (event: PointerEvent) => {
            if (!(event.target instanceof Element) || !event.target.closest(`.${styles.contextMenu}`)) setTextMenu(undefined);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopImmediatePropagation();
            setTextMenu(undefined);
        };
        window.addEventListener("pointerdown", outside);
        window.addEventListener("keydown", escape, true);
        onCleanup(() => {
            window.removeEventListener("pointerdown", outside);
            window.removeEventListener("keydown", escape, true);
        });
    });
    const openTextMenu = (event: MouseEvent): void => {
        const target = event.currentTarget;
        const selection = window.getSelection();
        const text = selection?.toString() ?? "";
        if (!body || !(target instanceof Element) || !selection?.anchorNode || !selection.focusNode || !text.trim() ||
            !target.contains(selection.anchorNode) || !target.contains(selection.focusNode)) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = body.getBoundingClientRect();
        const width = 184;
        const height = 112;
        setTextMenu({
            text,
            x: Math.max(8, Math.min(event.clientX - rect.left, rect.width - width - 8)),
            y: Math.max(8, Math.min(event.clientY - rect.top, rect.height - height - 8)),
        });
    };
    const askAboutSelectedText = (text: string): void => {
        const draft = props.aiChat.chat().draft;
        props.aiChat.setDraft(`${draft}${draft ? "\n\n" : ""}${text}`);
        setTextMenu(undefined);
        composerInput?.focus({ preventScroll: true });
    };
    createEffect(() => {
        props.aiChat.chat().messages;
        props.aiChat.chat().busy;
        const view = props.aiChat.messageView();
        cancelAnimationFrame(scrollFrame);
        scrollFrame = requestAnimationFrame(() => {
            if (messages) messages.scrollTop = view.follow ? messages.scrollHeight : view.scrollTop;
        });
    });
    onCleanup(() => cancelAnimationFrame(scrollFrame));
    return <div class={styles.body} ref={body}>
        <header class={styles.header}>
            <h2 id="ai-chat-heading" class={styles.title}>{props.t("aiChat")}</h2>
            <div class={styles.actions}>
                <Button class={styles.closeButton} type="button" aria-label={props.t("close")} onClick={() => props.aiChat.setOpen(false)}><Icon name="close" size={15} /></Button>
            </div>
        </header>
        <Show when={props.aiChat.status().connected && !props.aiChat.status().authenticated}>
            <div class={styles.setup}>
                <p class={styles.hint}>{props.t(props.aiChat.provider.labels.signInRequired)}</p>
                <div class={styles.actions}>
                    <Button class={styles.button} type="button" disabled={props.aiChat.pending()} onClick={() => void props.aiChat.signIn()}>{props.t(props.aiChat.provider.labels.signIn)}</Button>
                    <Button class={styles.button} type="button" disabled={props.aiChat.pending()} onClick={() => void props.aiChat.refresh()}>{props.t("aiRefreshAccount")}</Button>
                </div>
            </div>
        </Show>
        <div class={styles.contentArea}>
            <Show when={props.aiChat.status().connected} fallback={
                <section class={styles.connectSection} aria-labelledby="connect-ai-heading">
                    <h3 id="connect-ai-heading" class={styles.connectTitle}>{props.t("connectAi")}</h3>
                    <div class={styles.providers}>
                        <For each={props.aiChat.providers}>{(provider) =>
                            <Button class={styles.providerButton} type="button" disabled={props.aiChat.pending() || !props.aiChat.ready() || props.aiChat.checkingProviders() || !props.aiChat.installedProviders()[provider.id]}
                                onClick={() => void props.aiChat.connect(provider.id)}>
                                <AiProviderIcon provider={provider.id} />
                                <span>{props.aiChat.pending() && props.aiChat.provider.id === provider.id ? props.t("aiConnecting") : provider.name}</span>
                            </Button>
                        }</For>
                    </div>
                </section>
            }>
                <CustomScrollArea class={styles.messageArea} contentClass={styles.messages}
                    viewportStyle={{ padding: "8px 16px 8px 4px" }}
                    ariaLabel={props.t("aiMessages")}
                    viewportRef={(element) => { messages = element; }}
                    onScroll={(element) => props.aiChat.setMessageView(
                        element.scrollTop,
                        element.scrollHeight - element.scrollTop - element.clientHeight < 60,
                    )}>
                    <For each={messageIds()}>{(id) => {
                        const initial = untrack(() => messagesById().get(id))!;
                        const message = () => messagesById().get(id) ?? initial;
                        return <div class={`${styles.message} ${message().role === "user" ? styles.user : styles.assistant}`}>
                            <div class={styles.messageHeader}>
                                <span class={styles.role}>{message().role === "user" ? props.t("aiYou") : props.aiChat.provider.name}</span>
                                <Show when={message().role === "assistant" && props.aiChat.canUndoLinks(id)}>
                                    <Button class={styles.undoButton} type="button" aria-label={props.t("aiUndoLinks")}
                                        disabled={props.aiChat.pending() || props.aiChat.chat().busy} onClick={() => void props.aiChat.undoLinks()}>
                                        <Icon name="undo" size={14} />
                                    </Button>
                                </Show>
                            </div>
                            <div class={styles.messageContent} onContextMenu={openTextMenu}>
                                <ChatMessageText t={props.t}
                                    text={message().role === "user" && message().action === "undo-links" ? props.t("aiUndoRequest") : message().text || (id === props.aiChat.chat().requestId && props.aiChat.chat().busy ? props.t("aiThinking") : props.t("aiNoResponse"))}
                                    referenceTitles={props.aiChat.chat().referenceTitles}
                                    resolveNote={resolveNote}
                                    onOpenNote={props.onOpenNote}
                                />
                            </div>
                        </div>;
                    }}</For>
                </CustomScrollArea>
            </Show>
            <Show when={props.aiChat.error() || props.aiChat.chat().error}>{(error) => <p role="alert" class={styles.error}>{error()}</p>}</Show>
        </div>
        <Show when={props.aiChat.status().connected && props.aiChat.status().authenticated}>
            <div class={styles.options} classList={{ [styles.modelOnly]: props.aiChat.provider.id === "opencode" || props.aiChat.provider.id === "antigravity" }}>
                <div class={styles.option}>
                    <Dropdown id="aiChat-model" ariaLabel={props.t("aiModel")}
                        scrollable={props.aiChat.provider.id === "opencode" || props.aiChat.provider.id === "antigravity"}
                        value={props.aiChat.selectedModel()?.id ?? ""}
                        options={props.aiChat.models().length ? props.aiChat.models().map((model) => ({ value: model.id, label: model.name })) : props.aiChat.provider.id === "opencode" ? [] : [{ value: "", label: props.t("aiDefaultModel") }]}
                        placeholder={props.t("aiModel")}
                        disabled={props.aiChat.chat().busy || props.aiChat.sending() || props.aiChat.pending() || (props.aiChat.provider.id === "opencode" && !props.aiChat.models().length)}
                        onChange={(value) => props.aiChat.setModel(value)} />
                </div>
                <Show when={props.aiChat.provider.id !== "opencode" && props.aiChat.provider.id !== "antigravity"}>
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
                </Show>
            </div>
            <ChatComposer aiChat={props.aiChat} t={props.t} onInputReady={(input) => { composerInput = input; }} onSend={() => { props.aiChat.setMessageView(messages?.scrollTop ?? 0, true); void props.aiChat.send(); }} />
        </Show>
        <Show when={textMenu()}>{(menu) => <div class={styles.contextMenu} style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
            role="group" aria-label={props.t("aiSelectionActions")}
            onPointerDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
            <Button class={styles.contextMenuButton} type="button" onClick={() => {
                void navigator.clipboard.writeText(menu().text).catch(console.error);
                setTextMenu(undefined);
            }}><Icon name="copy" size={15} />{props.t("aiSelectionCopy")}</Button>
            <Button class={styles.contextMenuButton} type="button" disabled={!props.aiChat.status().authenticated || props.aiChat.pending()} onClick={() => askAboutSelectedText(menu().text)}><Icon name="chat" size={15} />{props.t("aiSelectionAsk")}</Button>
            <Button class={styles.contextMenuButton} type="button" onClick={() => {
                void openUrl(`https://www.google.com/search?q=${encodeURIComponent(menu().text)}`).catch(console.error);
                setTextMenu(undefined);
            }}><Icon name="search" size={15} />{props.t("aiSelectionSearchGoogle")}</Button>
        </div>}</Show>
    </div>;
};

const AiChatPanel: Component<Props> = (props) => {
    const presence = createPresence(props.aiChat.open, 210);
    return <Show when={presence.present()}>
        <aside id="ai-chat-panel" class={styles.panel} aria-labelledby="ai-chat-heading"
            inert={presence.exiting()} aria-hidden={presence.exiting() ? "true" : undefined}
            ref={(element) => registerVisibilityAnimation(element, presence.exiting, "panel")}
            onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); props.aiChat.setOpen(false); } }}>
            <AsciiBackdrop placement="modal" />
            <ChatBody {...props} />
        </aside>
    </Show>;
};

export default AiChatPanel;
