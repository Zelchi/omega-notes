import { createEffect, createSignal, onCleanup, onMount, type Accessor } from "solid-js";

type Segment = { node: Text; start: number; end: number };
type Marker = { left: number; top: number; width: number; height: number; match: number };
const LIMIT = 1000;
const ignored = "[aria-hidden='true'], button, input, textarea, select, [data-note-find-ui]";

// Read visible text without inserting marks into the editable DOM.
const indexText = (root: HTMLElement) => {
    const segments: Segment[] = [];
    const chunks: string[] = [];
    let length = 0;
    for (const content of root.querySelectorAll<HTMLElement>("[data-omega-content], [data-editable-table] td, [data-editable-table] th")) {
        if (length) { chunks.push("\n"); length++; }
        let previousBlock: Element | null = null;
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
        while (walker.nextNode()) {
            const current = walker.currentNode;
            if (current instanceof HTMLBRElement) { chunks.push("\n"); length++; previousBlock = null; continue; }
            if (!(current instanceof Text) || !current.data || current.parentElement?.closest(ignored)) continue;
            const parent = current.parentElement!;
            const computed = getComputedStyle(parent);
            if (computed.visibility === "hidden" || computed.display === "none") continue;
            const block = parent.closest("[data-text-fragment], div, p, li, td, th, pre, blockquote, h1, h2, h3, h4, h5, h6");
            const continuation = previousBlock?.matches("[data-text-fragment]") && block?.matches("[data-text-fragment]") &&
                previousBlock.getAttribute("data-end") === block.getAttribute("data-start");
            if (previousBlock && previousBlock !== block && !continuation) { chunks.push("\n"); length++; }
            previousBlock = block;
            segments.push({ node: current, start: length, end: length + current.length });
            chunks.push(current.data); length += current.length;
        }
    }
    return { text: chunks.join(""), segments };
};
const position = (segments: Segment[], offset: number, end = false) => {
    let low = 0, high = segments.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (segments[middle]!.end < offset || (!end && segments[middle]!.end === offset)) low = middle + 1;
        else high = middle;
    }
    const segment = segments[low];
    return segment && offset >= segment.start ? { node: segment.node, offset: offset - segment.start } : undefined;
};

export const useFindInNote = (noteId: Accessor<string>) => {
    const [open, setOpen] = createSignal(false);
    const [visible, setVisible] = createSignal(false);
    const [query, setQuery] = createSignal("");
    const [count, setCount] = createSignal(0);
    const [capped, setCapped] = createSignal(false);
    const [active, setActive] = createSignal(0);
    const [markers, setMarkers] = createSignal<Marker[]>([]);
    const [focusRequest, setFocusRequest] = createSignal(0);
    let root: HTMLElement | undefined;
    let ranges: Range[] = [];
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: MutationObserver | undefined;
    let resize: ResizeObserver | undefined;
    let lastQuery = "";
    let lastNote: string | undefined;
    let disposed = false;
    const close = () => { setOpen(false); setMarkers([]); ranges = []; setCount(0); };
    const scrollToActive = () => {
        const range = ranges[active()];
        const viewport = root?.closest<HTMLElement>("[data-omega-scroll-viewport]");
        if (!range || !viewport || !visible()) return;
        const rect = range.getBoundingClientRect();
        const bounds = viewport.getBoundingClientRect();
        viewport.scrollTop += rect.top - bounds.top - bounds.height / 2 + rect.height / 2;
        if (rect.left < bounds.left || rect.right > bounds.right) viewport.scrollLeft += rect.left - bounds.left - bounds.width / 2 + rect.width / 2;
    };
    const scan = () => {
        frame = 0;
        if (!open() || !root?.isConnected || disposed) return;
        const value = query();
        ranges = [];
        setCapped(false);
        if (!value) { setCount(0); setActive(0); setMarkers([]); lastQuery = value; return; }
        const index = indexText(root);
        const expression = new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        let match: RegExpExecArray | null;
        while ((match = expression.exec(index.text))) {
            if (ranges.length === LIMIT) { setCapped(true); break; }
            const start = position(index.segments, match.index);
            const end = position(index.segments, match.index + match[0].length, true);
            if (!start || !end) continue;
            const range = document.createRange();
            range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset);
            ranges.push(range);
        }
        // Tables are separate editable surfaces; navigate in visual page order.
        const measured = ranges.map((range) => ({ range, rects: [...range.getClientRects()] }))
            .filter((match) => match.rects.some((rect) => rect.width && rect.height))
            .sort((a, b) => a.rects[0]!.top - b.rects[0]!.top || a.rects[0]!.left - b.rects[0]!.left);
        ranges = measured.map((match) => match.range);
        const changed = value !== lastQuery;
        lastQuery = value;
        setCount(ranges.length);
        setActive(changed ? 0 : Math.min(active(), Math.max(0, ranges.length - 1)));
        const bounds = root.getBoundingClientRect();
        const highlights: Marker[] = [];
        measured.forEach(({ rects }, match) => {
            for (const rect of rects) if (rect.width && rect.height) highlights.push({ left: rect.left - bounds.left - root!.clientLeft, top: rect.top - bounds.top - root!.clientTop, width: rect.width, height: rect.height, match });
        });
        setMarkers(highlights);
        if (changed) scrollToActive();
    };
    const schedule = () => { if (!frame && open()) frame = requestAnimationFrame(scan); };
    createEffect(() => {
        const id = noteId();
        if (lastNote !== undefined && lastNote !== id) { close(); setQuery(""); }
        lastNote = id;
    });
    createEffect(() => {
        open(); query();
        clearTimeout(timer);
        if (!open()) return;
        timer = setTimeout(schedule, 100);
        onCleanup(() => clearTimeout(timer));
    });
    createEffect(() => {
        if (!open() || !root) return;
        observer = new MutationObserver((records) => {
            if (records.some((record) => !(record.target instanceof Element ? record.target : record.target.parentElement)?.closest("[data-note-find-ui], [aria-hidden='true']"))) schedule();
        });
        observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["style", "class"] });
        resize = new ResizeObserver(schedule); resize.observe(root);
        schedule();
        onCleanup(() => { observer?.disconnect(); resize?.disconnect(); });
    });
    const move = (direction: -1 | 1) => {
        if (query() !== lastQuery) scan();
        if (!ranges.length) return;
        setActive((current) => (current + direction + ranges.length) % ranges.length);
        scrollToActive();
    };
    onMount(() => {
        const keyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.isComposing || !root?.isConnected || root.closest("[inert]") || document.querySelector("[aria-modal='true']:not([inert])")) return;
            if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "f") {
                event.preventDefault(); event.stopImmediatePropagation();
                if (event.repeat) return;
                if (open()) close();
                else { setOpen(true); setFocusRequest((value) => value + 1); }
                return;
            }
            if (event.key === "Escape" && open() && visible()) {
                event.preventDefault(); event.stopImmediatePropagation(); close();
            }
        };
        window.addEventListener("keydown", keyDown, true);
        window.addEventListener("resize", schedule);
        onCleanup(() => { window.removeEventListener("keydown", keyDown, true); window.removeEventListener("resize", schedule); });
    });
    onCleanup(() => { disposed = true; clearTimeout(timer); cancelAnimationFrame(frame); observer?.disconnect(); resize?.disconnect(); ranges = []; });
    return { open, query, setQuery, count, capped, active, markers, focusRequest, close, move, setVisible, setRoot: (element: HTMLElement) => { root = element; } };
};
export type FindInNote = ReturnType<typeof useFindInNote>;
