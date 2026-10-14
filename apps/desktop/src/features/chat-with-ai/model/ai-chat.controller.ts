import { createEffect, createMemo, createSignal, onCleanup, onMount, untrack, type Accessor } from "solid-js";
import { isTauriRuntime } from "@/shared/lib/tauri";
import type { TranslationKey } from "@/shared/lib/i18n";
import * as repository from "../api/chat.repository";
import { readConnectedProvider, saveConnectedProvider, forgetConnectedProvider } from "../api/connection.repository";
import type { AiProvider } from "../api/ai-provider";
import type { AiEvent, AiModel, AiProviderId, AiStatus, StoredChat, VaultChat } from "@/entities/ai";
import { aiProviders, getAiProvider } from "../api/providers";
import { readInstalledAiProviders, type InstalledAiProviders } from "../api/providers.repository";
import { MAX_CHAT_MESSAGES } from "@/entities/ai";
import { formatAiErrorDetail } from "./error-detail";
import { createNoteReferenceNormalizer, parseNoteTextLinks, type StudyNote } from "@/entities/note";

const emptyChat = (): VaultChat => ({ messages: [], referenceTitles: {}, draft: "", model: "", effort: "", fast: false, busy: false });

export const useAiChat = (options: {
    provider: AiProvider;
    enabled: Accessor<boolean>;
    vaultId: Accessor<string | undefined>;
    notes: Accessor<StudyNote[]>;
    notesReady: Accessor<boolean>;
    beforeSend: () => Promise<boolean>;
    t: (key: TranslationKey) => string;
}) => {
    const rememberedProvider = readConnectedProvider();
    const [selectedProvider, setProvider] = createSignal(rememberedProvider ? getAiProvider(rememberedProvider) : options.provider);
    const provider = new Proxy({} as AiProvider, {
        get: (_target, property) => Reflect.get(selectedProvider(), property),
    });
    const [open, setOpen] = createSignal(false);
    const [installedProviders, setInstalledProviders] = createSignal<InstalledAiProviders>({ codex: false, claude: false, opencode: false });
    const [checkingProviders, setCheckingProviders] = createSignal(false);
    const [status, setStatus] = createSignal<AiStatus>({ connected: false, authenticated: false });
    const [models, setModels] = createSignal<AiModel[]>([]);
    const [sending, setSending] = createSignal(false);
    const [operationPending, setPending] = createSignal(false);
    const [resetting, setResetting] = createSignal(false);
    const [cleanupError, setCleanupError] = createSignal<string>();
    const [loading, setLoading] = createSignal<string[]>([]);
    const pending = createMemo(() => operationPending() || resetting() || loading().includes(options.vaultId() ?? ""));
    const [ready, setReady] = createSignal(false);
    const [error, writeError] = createSignal<string>();
    let errorTimer: ReturnType<typeof setTimeout> | undefined;
    const setError = (message?: string) => {
        clearTimeout(errorTimer);
        writeError(message);
        errorTimer = message ? setTimeout(() => writeError(undefined), 3000) : undefined;
    };
    const chatErrorTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const clearChatErrorTimers = () => {
        for (const timer of chatErrorTimers.values()) clearTimeout(timer);
        chatErrorTimers.clear();
    };
    const [chats, setChats] = createSignal<Record<string, VaultChat>>({});
    const chat = createMemo(() => {
        const id = options.vaultId();
        return id ? chats()[id] ?? emptyChat() : emptyChat();
    });
    const selectedModel = createMemo(() => models().find((model) => model.id === chat().model) ?? models().find((model) => model.isDefault) ?? models()[0]);
    const selectedEffort = createMemo(() => {
        const model = selectedModel();
        return model?.efforts.includes(chat().effort) ? chat().effort : model?.defaultEffort ?? "";
    });
    const fastAvailable = createMemo(() => selectedModel()?.serviceTiers.some((tier) => tier === "fast" || tier === "priority") ?? false);
    let disposed = false;
    let previousVault: string | undefined;
    let connectionRevision = 0;
    let storageRevision = 0;
    let resetJob: Promise<void> = Promise.resolve();
    let autoConnectAttempted = false;
    const cancelledRequests = new Set<string>();
    const preparingRequests = new Set<string>();
    const describe = (failure: unknown) => options.t(String(failure) === "AI_STORAGE_FAILED" ? "aiHistorySaveFailed" : String(failure) === "AI_HISTORY_READ_FAILED" ? "aiHistoryReadFailed" : String(failure) === "AI_VAULT_CHANGED" ? "aiVaultChanged" : provider.errorKey(String(failure)));
    const loaded = new Set<string>();
    const loads = new Map<string, Promise<void>>();
    const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const writes = new Map<string, Promise<void>>();
    const dirty = new Set<string>();
    const referenceNormalizers = new Map<string, ReturnType<typeof createNoteReferenceNormalizer>>();
    const [referencesRevision, setReferencesRevision] = createSignal(0);
    const normalizeReferences = (id: string, text: string) => referenceNormalizers.get(id)?.normalize(text) ?? text;

    const referenceTitlesFor = (id: string, texts: string[], previous: Record<string, string>): Record<string, string> => {
        const result: Record<string, string> = {};
        for (const text of texts) for (const link of parseNoteTextLinks(text)) {
            if (link.kind !== "note") continue;
            const title = referenceNormalizers.get(id)?.title(link.target) ?? previous[link.target];
            if (typeof title === "string") result[link.target] = title;
        }
        return result;
    };

    createEffect(() => {
        if (!options.enabled() || !options.notesReady()) return;
        const id = options.vaultId();
        if (!id) return;
        const existing = referenceNormalizers.get(id);
        const normalizer = existing ?? createNoteReferenceNormalizer();
        const changed = normalizer.bind(options.notes());
        referenceNormalizers.set(id, normalizer);
        if (changed || !existing) setReferencesRevision((revision) => revision + 1);
    });
    const storageError = (id: string, key: TranslationKey) => {
        if (!disposed && !resetting() && options.vaultId() === id) setError(options.t(key));
    };
    const saveChat = (id: string): Promise<void> => {
        clearTimeout(saveTimers.get(id));
        saveTimers.delete(id);
        const current = untrack(() => chats()[id]);
        const providerId = provider.id;
        if (!options.enabled() || !isTauriRuntime() || !loaded.has(id) || !current) return Promise.resolve();
        const snapshot: StoredChat = {
            messages: current.messages.map(({ id: messageId, role, text }) => ({ id: messageId, role, text: normalizeReferences(id, text) })),
            referenceTitles: referenceTitlesFor(id, current.messages.map((message) => normalizeReferences(id, message.text)), current.referenceTitles),
            draft: current.draft, model: current.model, effort: current.effort, fast: current.fast,
        };
        const write = (writes.get(id) ?? Promise.resolve()).catch(() => undefined)
            .then(() => repository.saveAiChat(id, providerId, snapshot))
            .then(() => { if (untrack(() => chats()[id]) === current) dirty.delete(id); })
            .catch((failure) => {
                if (String(failure) === "AI_INVALID_VAULT") { dirty.delete(id); return; }
                throw failure;
            });
        writes.set(id, write);
        void write.catch(() => storageError(id, "aiHistorySaveFailed")).finally(() => {
            if (writes.get(id) === write) writes.delete(id);
        });
        return write;
    };
    const scheduleSave = (id: string) => {
        if (!options.enabled() || !isTauriRuntime() || !loaded.has(id)) return;
        dirty.add(id);
        if (saveTimers.has(id)) return;
        saveTimers.set(id, setTimeout(() => { void saveChat(id).catch(() => undefined); }, 500));
    };
    const loadChat = (id: string): Promise<void> => {
        if (!isTauriRuntime() || loaded.has(id)) return Promise.resolve();
        const existing = loads.get(id);
        if (existing) return existing;
        const revision = storageRevision;
        setLoading((current) => [...current, id]);
        const load = repository.readAiChat(id, provider.id).then((stored) => {
            if (disposed || revision !== storageRevision || !options.enabled()) return;
            loaded.add(id);
            setChats((current) => ({ ...current, [id]: { ...emptyChat(), ...stored } }));
        }).catch((failure) => {
            if (revision === storageRevision) storageError(id, "aiHistoryReadFailed");
            throw failure;
        }).finally(() => {
            if (loads.get(id) === load) loads.delete(id);
            if (!disposed && revision === storageRevision) setLoading((current) => current.filter((value) => value !== id));
        });
        loads.set(id, load);
        return load;
    };
    const patchChat = (id: string, change: (current: VaultChat) => VaultChat, errorOccurrence = false) => {
        setChats((current) => {
            const previous = current[id] ?? emptyChat();
            const next = change(previous);
            if (next === previous) return current;
            if (!next.error || errorOccurrence || next.error !== previous.error) {
                clearTimeout(chatErrorTimers.get(id));
                chatErrorTimers.delete(id);
                if (next.error) chatErrorTimers.set(id, setTimeout(() => {
                    chatErrorTimers.delete(id);
                    setChats((chats) => chats[id] ? { ...chats, [id]: { ...chats[id], error: undefined } } : chats);
                }, 3000));
            }
            const limited = next.messages.length > MAX_CHAT_MESSAGES
                ? { ...next, messages: next.messages.slice(-MAX_CHAT_MESSAGES) } : next;
            return { ...current, [id]: limited };
        });
        scheduleSave(id);
    };

    createEffect(() => {
        referencesRevision();
        const id = options.vaultId();
        const current = chat();
        if (!id || !options.enabled() || !referenceNormalizers.has(id)) return;
        let changed = false;
        const messages = current.messages.map((message) => {
            const text = normalizeReferences(id, message.text);
            const items = message.items && Object.fromEntries(Object.entries(message.items).map(([key, value]) => [key, normalizeReferences(id, value)]));
            if (text === message.text && (!items || Object.entries(items).every(([key, value]) => value === message.items?.[key]))) return message;
            changed = true;
            return { ...message, text, items };
        });
        const referenceTitles = referenceTitlesFor(id, messages.map((message) => message.text), current.referenceTitles);
        const previous = current.referenceTitles;
        const titlesChanged = Object.keys(referenceTitles).length !== Object.keys(previous).length ||
            Object.entries(referenceTitles).some(([target, title]) => previous[target] !== title);
        if (changed || titlesChanged) untrack(() => patchChat(id, (value) => ({ ...value, messages, referenceTitles })));
    });

    const refresh = async () => {
        const revision = connectionRevision;
        const account = await provider.status();
        if (disposed || revision !== connectionRevision || !options.enabled()) return;
        setStatus(account);
        setModels([]);
        if (account.authenticated) {
            const available = await provider.models();
            if (!disposed && revision === connectionRevision) setModels(available);
        }
    };

    const receive = (event: AiEvent) => {
        if (disposed || !options.enabled() || resetting()) return;
        if (event.connectionId !== status().connectionId) return;
        if (event.kind === "disconnected") {
            ++connectionRevision;
            setStatus({ connected: false, authenticated: false });
            setModels([]);
            setChats((current) => Object.fromEntries(Object.entries(current).map(([id, value]) =>
                [id, { ...value, busy: false, requestId: undefined }])));
            return;
        }
        if (event.kind === "account") {
            if (event.success === false) setError(options.t("aiSignInFailed"));
            void refresh().catch((failure) => setError(describe(failure)));
            return;
        }
        const id = event.vaultId;
        if (!id || !event.requestId) return;
        patchChat(id, (current) => {
            if (current.requestId !== event.requestId) return current;
            if (event.kind === "completed") {
                const failed = event.failed || event.status === "failed";
                const message = event.errorCode ? describe(event.errorCode) : failed ? options.t("aiRequestFailed") : undefined;
                const detail = formatAiErrorDetail(event.errorDetail);
                const cleanup = event.cleanupFailed && event.errorCode !== "AI_HISTORY_CLEAR_FAILED"
                    ? options.t("aiSessionCleanupFailed") : undefined;
                const error = [message, message && detail, cleanup].filter(Boolean).join(" ");
                return { ...current, busy: false, error: error || undefined };
            }
            if (event.kind === "error") return { ...current, error: options.t(event.retrying ? "aiRetrying" : "aiRequestFailed") };
            if (event.kind !== "delta" && event.kind !== "message") return current;
            return {
                ...current, messages: current.messages.map((message) => {
                    if (message.id !== event.requestId || message.role !== "assistant") return message;
                    const itemId = event.itemId ?? "answer";
                    const itemText = event.kind === "message" ? event.text ?? "" : (message.items?.[itemId] ?? "") + (event.text ?? "");
                    const items = { ...message.items, [itemId]: normalizeReferences(id, itemText) };
                    return { ...message, items, text: Object.values(items).join("\n\n") };
                })
            };
        }, event.kind === "error" || event.kind === "completed");
        if (event.kind === "completed") void saveChat(id).catch(() => undefined);
    };

    onMount(() => {
        if (!isTauriRuntime()) return;
        void provider.subscribe(receive).then((unsubscribe) => {
            if (disposed) unsubscribe();
            else { onUnsubscribe = unsubscribe; setReady(true); }
        }).catch((failure) => setError(describe(failure)));
    });
    let onUnsubscribe: (() => void) | undefined;
    createEffect(() => {
        if (!open() || !options.enabled() || status().connected || !isTauriRuntime()) {
            setCheckingProviders(false);
            return;
        }
        let cancelled = false;
        onCleanup(() => { cancelled = true; });
        setInstalledProviders({ codex: false, claude: false, opencode: false });
        setCheckingProviders(true);
        void readInstalledAiProviders().then((available) => {
            if (!cancelled && !disposed) setInstalledProviders(available);
        }).catch(() => {
            if (!cancelled && !disposed) setError(options.t("aiProviderCheckFailed"));
        }).finally(() => {
            if (!cancelled && !disposed) setCheckingProviders(false);
        });
    });
    onCleanup(() => {
        clearTimeout(errorTimer);
        clearChatErrorTimers();
        for (const id of dirty) void saveChat(id).catch(() => undefined);
        disposed = true;
        ++connectionRevision;
        onUnsubscribe?.();
        void provider.disconnect().catch(() => undefined);
    });

    createEffect(() => {
        if (options.enabled()) return;
        autoConnectAttempted = false;
        ++connectionRevision;
        ++storageRevision;
        forgetConnectedProvider();
        setOpen(false);
        setStatus({ connected: false, authenticated: false });
        setModels([]);
        setChats({});
        clearChatErrorTimers();
        referenceNormalizers.clear();
        setError(undefined);
        setCleanupError(undefined);
        setResetting(true);
        for (const timer of saveTimers.values()) clearTimeout(timer);
        saveTimers.clear();
        dirty.clear();
        loaded.clear();
        const outstanding = [...writes.values(), ...loads.values()];
        loads.clear();
        setLoading([]);
        resetJob = (async () => {
            try {
                if (isTauriRuntime()) outstanding.push(provider.disconnect());
                await Promise.allSettled(outstanding);
                if (isTauriRuntime()) await repository.clearAiChats();
            } catch {
                if (!disposed) setCleanupError(options.t("aiHistoryClearFailed"));
            } finally {
                if (!disposed) setResetting(false);
            }
        })();
    });

    createEffect(() => {
        const id = options.vaultId();
        const previous = previousVault;
        previousVault = id;
        if (previous && previous !== id) {
            const requestId = untrack(() => chats()[previous]?.requestId);
            if (requestId) {
                if (preparingRequests.has(requestId)) cancelledRequests.add(requestId);
                void provider.cancel(previous, false, requestId).catch(() => undefined);
            }
        }
        if (!id) setOpen(false);
        untrack(() => setError(undefined));
    });

    createEffect(() => {
        const enabled = options.enabled();
        const id = options.vaultId();
        const clearing = resetting();
        if (enabled && id && !clearing) untrack(() => { void loadChat(id).catch(() => undefined); });
    });

    const run = async (operation: () => Promise<void>) => {
        if (pending()) return;
        setPending(true); setError(undefined);
        try { await operation(); } catch (failure) { if (!disposed) setError(describe(failure)); }
        finally { if (!disposed) setPending(false); }
    };
    const connect = (providerId?: AiProviderId) => run(async () => {
        if (!options.enabled()) return;
        autoConnectAttempted = true;
        if (providerId && providerId !== provider.id) {
            if (!(await flushSave())) throw "AI_STORAGE_FAILED";
            await provider.disconnect();
            await Promise.allSettled([...loads.values()]);
            if (disposed || !options.enabled()) return;
            ++connectionRevision;
            ++storageRevision;
            loaded.clear();
            loads.clear();
            setLoading([]);
            setStatus({ connected: false, authenticated: false });
            setModels([]);
            setChats({});
            clearChatErrorTimers();
            setProvider(getAiProvider(providerId));
        }
        const id = options.vaultId();
        if (id) {
            try { await loadChat(id); }
            catch { throw "AI_HISTORY_READ_FAILED"; }
        }
        if (disposed || !options.enabled()) return;
        ++connectionRevision;
        const revision = connectionRevision;
        const account = await provider.connect();
        if (disposed || !options.enabled() || revision !== connectionRevision) {
            await provider.disconnect();
            return;
        }
        setStatus(account);
        if (account.connected) saveConnectedProvider(provider.id);
        await refresh();
    });

    createEffect(() => {
        const enabled = options.enabled();
        const subscribed = ready();
        const id = options.vaultId();
        const busy = pending();
        const connected = status().connected;
        if (!enabled || !subscribed || !id || busy || connected || autoConnectAttempted) return;
        untrack(() => {
            if (readConnectedProvider() !== provider.id) return;
            autoConnectAttempted = true;
            void connect();
        });
    });
    const send = async () => {
        const id = options.vaultId();
        const current = chat();
        const submittedDraft = current.draft;
        const text = id ? normalizeReferences(id, submittedDraft.trim()) : submittedDraft.trim();
        if (!options.enabled() || !id || !text || pending() || sending() || !status().authenticated || !ready()) return;
        if (provider.id === "opencode" && !selectedModel()?.id) {
            setError(options.t("aiOpenCodeModelsUnavailable"));
            return;
        }
        if (current.busy && (!provider.steer || !current.requestId)) return;
        const requestId = crypto.randomUUID();
        const activeRequestId = current.busy ? current.requestId : undefined;
        const revision = connectionRevision;
        const model = selectedModel()?.id;
        const effort = selectedEffort();
        const fast = current.fast && fastAvailable();
        let posted = false;
        setSending(true);
        preparingRequests.add(activeRequestId ?? requestId);
        patchChat(id, (value) => ({
            ...value, draft: "", error: undefined,
            ...(activeRequestId ? {} : { busy: true, requestId })
        }));
        try {
            if (!(await options.beforeSend())) throw "AI_SAVE_FAILED";
            if (disposed || revision !== connectionRevision) return;
            if (cancelledRequests.has(activeRequestId ?? requestId)) return;
            if (options.vaultId() !== id) throw "AI_VAULT_CHANGED";
            if (activeRequestId && provider.steer) {
                try {
                    await provider.steer(id, activeRequestId, text);
                    if (disposed || revision !== connectionRevision) return;
                    patchChat(id, (value) => {
                        const messages = [...value.messages];
                        const active = messages.findIndex((message) => message.id === activeRequestId && message.role === "assistant");
                        messages.splice(active < 0 ? messages.length : active, 0, { id: crypto.randomUUID(), role: "user", text });
                        return { ...value, messages };
                    });
                    posted = true;
                    await saveChat(id);
                    return;
                } catch (failure) {
                    if (String(failure) !== "AI_TURN_FINISHED") throw failure;
                }
                if (disposed || revision !== connectionRevision) return;
                if (cancelledRequests.has(activeRequestId)) return;
                if (options.vaultId() !== id) throw "AI_VAULT_CHANGED";
                preparingRequests.add(requestId);
            }
            patchChat(id, (value) => ({
                ...value, busy: true, requestId, messages: [...value.messages,
                { id: crypto.randomUUID(), role: "user", text }, { id: requestId, role: "assistant", text: "", items: {} }]
            }));
            posted = true;
            await saveChat(id);
            if (disposed || revision !== connectionRevision) return;
            if (options.vaultId() !== id) throw "AI_VAULT_CHANGED";
            if (cancelledRequests.has(requestId)) {
                patchChat(id, (value) => value.requestId === requestId ? { ...value, busy: false } : value);
                return;
            }
            await provider.send(id, requestId, text, model, effort, fast);
        } catch (failure) {
            if (disposed || revision !== connectionRevision) return;
            patchChat(id, (value) => ({
                ...value,
                ...(value.requestId === requestId ? { busy: false } : {}),
                error: String(failure) === "AI_SAVE_FAILED" ? options.t("saveFailed") : describe(failure),
            }), true);
        } finally {
            if (!posted && !disposed && revision === connectionRevision && options.enabled()) {
                patchChat(id, (value) => ({
                    ...value,
                    draft: value.draft ? `${submittedDraft}\n${value.draft}` : submittedDraft,
                    ...(value.requestId === requestId ? { busy: false } : {}),
                }));
            }
            for (const key of [activeRequestId, requestId]) {
                if (key) { cancelledRequests.delete(key); preparingRequests.delete(key); }
            }
            if (!disposed) setSending(false);
        }
    };
    const cancel = () => run(async () => {
        const id = options.vaultId(); const requestId = chat().requestId;
        if (id && requestId) { if (preparingRequests.has(requestId)) cancelledRequests.add(requestId); await provider.cancel(id, false, requestId); }
    });
    const flushSave = async (): Promise<boolean> => {
        await resetJob;
        if (cleanupError()) return false;
        const ids = new Set([...dirty, ...writes.keys()]);
        try {
            await Promise.all([...ids].map(saveChat));
            return true;
        } catch {
            return false;
        }
    };
    return {
        provider, providers: aiProviders, installedProviders, checkingProviders, open, setOpen, status, sending, resetting, cleanupError, models, selectedModel, selectedEffort, fastAvailable, pending, ready, error, chat, connect, send, cancel, flushSave,
        refresh: () => run(refresh), signIn: () => run(provider.signIn),
        setDraft: (draft: string) => { const id = options.vaultId(); if (id && loaded.has(id)) patchChat(id, (value) => ({ ...value, draft })); },
        setModel: (model: string) => { const id = options.vaultId(); if (id && loaded.has(id)) patchChat(id, (value) => ({ ...value, model, effort: "", fast: false })); },
        setEffort: (effort: string) => { const id = options.vaultId(); if (id && loaded.has(id) && selectedModel()?.efforts.includes(effort)) patchChat(id, (value) => ({ ...value, effort })); },
        setFast: (fast: boolean) => { const id = options.vaultId(); if (id && loaded.has(id)) patchChat(id, (value) => ({ ...value, fast: fast && fastAvailable() })); },
    };
};
export type AiChatController = ReturnType<typeof useAiChat>;
