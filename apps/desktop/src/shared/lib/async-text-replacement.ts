export type TextRange = { start: number; end: number };
type Change = TextRange & { length: number };

/** Acompanhe substituições assíncronas sem sobrescrever edições feitas enquanto o resultado era aguardado. */
export const createAsyncTextReplacement = (options: {
    read: () => string;
    apply: (text: string, range: TextRange, kind: string) => void;
}) => {
    const pending = new Set<TextRange & { value: string; kind: string }>();
    let sequence = 0;
    const clear = () => pending.clear();
    const changed = (before: string, after: string, change?: Change) => {
        if (before === after) return;
        if (!change) {
            let start = 0, oldEnd = before.length, newEnd = after.length;
            while (start < oldEnd && start < newEnd && before[start] === after[start]) start++;
            while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
            change = { start, end: oldEnd, length: newEnd - start };
        }
        const delta = change.length - (change.end - change.start);
        for (const item of pending) {
            if (change.end <= item.start) { item.start += delta; item.end += delta; }
            else if (change.start < item.end) pending.delete(item);
            else if (change.start === item.end && change.end === change.start &&
                /^\S/.test(after.slice(change.start, change.start + change.length))) pending.delete(item);
        }
    };
    const resolve = (value: string, range: TextRange, replacement: Promise<string | undefined>, kind = `url-paste:${++sequence}`) => {
        const item = { ...range, value, kind };
        pending.add(item);
        if (pending.size > 16) pending.delete(pending.values().next().value!);
        void replacement.then((text) => {
            if (!pending.delete(item) || !text || options.read().slice(item.start, item.end) !== item.value) return;
            options.apply(text, item, item.kind);
        }).catch(() => pending.delete(item));
    };
    return { clear, changed, resolve, kind: () => `url-paste:${++sequence}` };
};
