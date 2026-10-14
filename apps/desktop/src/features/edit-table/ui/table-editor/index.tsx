import type { InlineTextFormat } from "@/shared/lib/formatted-text";
import { createEffect, createMemo, createSignal, Index, onCleanup, type Component, type JSX } from "solid-js";
import Icon, { type IconName } from "@/shared/ui/icon";
import TextCaret from "@/shared/ui/text-caret";
import { useTextareaCaret } from "@/shared/ui/text-caret/use-textarea-caret";
import type { TranslationKey } from "@/shared/lib/i18n";
import { readTableSource, writeTableSource, type TableBlock } from "../../model/table";
import { externalLinkUrl } from "@/shared/lib/external-links";
import { createAsyncTextReplacement } from "@/shared/lib/async-text-replacement";
import { styles } from "./style.css";

type Props = {
    block: TableBlock;
    left: number; top: number; width: number;
    t: (key: TranslationKey) => string;
    renderText: (text: string) => JSX.Element;
    onChange: (text: string, kind?: string) => void;
    onDelete: () => void;
    formatCell: (text: string, selection: { start: number; end: number }, format: InlineTextFormat) => { text: string; selection: { start: number; end: number } };
    onHistory: (event: KeyboardEvent) => void;
    onExit: (after: boolean) => void;
    onFormattingReady: (handler?: (format: InlineTextFormat) => void) => void;
    onRegisterFocus: (sourceLine: number, focus?: () => void) => void;
    resolvePastedLink?: (url: string) => Promise<string | undefined>;
    canResolvePastedUrl?: (text: string, range: { start: number; end: number }) => boolean;
};
const Cell: Component<{
    value: string; label: string; renderText: Props["renderText"];
    onChange: (text: string, formatted?: boolean, kind?: string) => void; onFocus: () => void;
    onKeyDown: (event: KeyboardEvent) => void;
    formatCell: Props["formatCell"];
    onFormattingReady: Props["onFormattingReady"];
    register: (element: HTMLTextAreaElement) => void;
    resolvePastedLink: Props["resolvePastedLink"];
    canResolvePastedUrl: Props["canResolvePastedUrl"];
}> = (props) => {
    const [focused, setFocused] = createSignal(false);
    const [value, setValue] = createSignal(props.value);
    const caret = useTextareaCaret();
    let input!: HTMLTextAreaElement;
    const pastes = createAsyncTextReplacement({ read: value, apply: (text, range, kind) => {
        const selection = { start: input.selectionStart, end: input.selectionEnd };
        const delta = text.length - (range.end - range.start);
        const map = (offset: number) => offset <= range.start ? offset : offset >= range.end ? offset + delta : range.start + Math.min(offset - range.start, text.length);
        change(value().slice(0, range.start) + text + value().slice(range.end), true, kind);
        input.setSelectionRange(map(selection.start), map(selection.end));
        caret.scheduleMeasure();
    } });
    createEffect(() => { const next = props.value; if (!focused()) {
        if (next !== value()) pastes.clear();
        setValue(next);
    } });
    createEffect(() => { value(); focused(); caret.scheduleMeasure(); });
    const change = (text: string, formatted = false, kind?: string) => {
        const next = text.replace(/[\r\n]+/g, " ");
        pastes.changed(value(), next);
        setValue(next); props.onChange(value(), formatted, kind);
    };
    const format = (kind: InlineTextFormat) => {
        const result = props.formatCell(value(), { start: input.selectionStart, end: input.selectionEnd }, kind);
        change(result.text, true);
        input.setSelectionRange(result.selection.start, result.selection.end);
        caret.scheduleMeasure();
    };
    onCleanup(() => { pastes.clear(); if (focused()) props.onFormattingReady(); });
    return <div class={styles.field}>
        <div style={{ visibility: focused() ? "hidden" : "visible" }}>{focused() ? value() || "\u200B" : props.renderText(value() || "\u200B")}</div>
        <textarea class={styles.input} ref={(element) => { input = element; caret.bind(element); props.register(element); }}
            value={value()} aria-label={props.label} rows={1} spellcheck={true}
            style={{ opacity: focused() ? 1 : 0 }}
            onFocus={() => { setFocused(true); props.onFocus(); props.onFormattingReady(format); }}
            onBlur={() => { setFocused(false); setValue(props.value); props.onFormattingReady(); }}
            onInput={(event) => change(event.currentTarget.value)}
            onPaste={(event) => {
                const url = externalLinkUrl(event.clipboardData?.getData("text/plain").trim() ?? "");
                const range = { start: input.selectionStart, end: input.selectionEnd };
                if (!url || !props.resolvePastedLink || props.canResolvePastedUrl?.(value(), range) === false) return;
                event.preventDefault();
                const kind = pastes.kind();
                change(value().slice(0, range.start) + url + value().slice(range.end), true, kind);
                input.setSelectionRange(range.start + url.length, range.start + url.length);
                pastes.resolve(url, { start: range.start, end: range.start + url.length }, props.resolvePastedLink(url), kind);
            }}
            onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && !event.altKey && ["b", "i"].includes(event.key.toLowerCase())) {
                    event.preventDefault();
                    format(event.key.toLowerCase() === "b" ? "bold" : "italic");
                    return;
                }
                if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) pastes.clear();
                props.onKeyDown(event);
            }} />
        <TextCaret geometry={caret.caret()} />
    </div>;
};
const TableEditor: Component<Props> = (props) => {
    const source = createMemo(() => readTableSource(props.block));
    const [selected, setSelected] = createSignal<{ row: number; column: number }>({ row: 0, column: 0 });
    const inputs = new Map<string, HTMLTextAreaElement>();
    const focus = (row: number, column: number) => inputs.get(`${row}:${column}`)?.focus({ preventScroll: true });
    createEffect(() => {
        const line = props.block.sourceLine;
        props.onRegisterFocus(line, () => {
            const cell = selected();
            focus(Math.min(cell.row, source().cells.length - 1), Math.min(cell.column, source().delimiters.length - 1));
        });
        onCleanup(() => props.onRegisterFocus(line));
    });
    const updateCell = (row: number, column: number, text: string, formatted = false, kind?: string) => {
        const current = source();
        props.onChange(writeTableSource({ ...current, cells: current.cells.map((cells, index) => index === row ? cells.map((value, i) => i === column ? text : value) : cells) }), kind ? `url-paste:table:${props.block.sourceLine}:${row}:${column}:${kind}` : formatted ? "table-format" : `table-input:${props.block.sourceLine}:${row}:${column}`);
    };
    const changeStructure = (kind: "addRow" | "removeRow" | "addColumn" | "removeColumn") => {
        if (document.activeElement instanceof HTMLTextAreaElement) document.activeElement.blur();
        const next = { cells: source().cells.map((row) => [...row]), delimiters: [...source().delimiters] };
        const row = Math.min(selected().row, next.cells.length - 1);
        const column = Math.min(selected().column, next.delimiters.length - 1);
        if (kind === "addRow") { next.cells.splice(row + 1, 0, next.delimiters.map(() => "")); setSelected({ row: row + 1, column }); }
        if (kind === "removeRow" && next.cells.length > 1) { next.cells.splice(Math.max(1, row), 1); setSelected({ row: Math.min(Math.max(1, row), next.cells.length - 1), column }); }
        if (kind === "addColumn") { next.cells.forEach((cells, index) => cells.splice(column + 1, 0, index === 0 ? `${props.t("tableColumn")} ${column + 2}` : "")); next.delimiters.splice(column + 1, 0, "---"); setSelected({ row: selected().row, column: column + 1 }); }
        if (kind === "removeColumn" && next.delimiters.length > 1) { next.cells.forEach((cells) => cells.splice(column, 1)); next.delimiters.splice(column, 1); setSelected({ row: selected().row, column: Math.min(column, next.delimiters.length - 1) }); }
        props.onChange(writeTableSource(next));
        queueMicrotask(() => focus(selected().row, selected().column));
    };
    const controls: { action: Parameters<typeof changeStructure>[0]; icon: IconName; label: TranslationKey }[] = [
        { action: "addRow", icon: "table-row-add", label: "tableAddRow" },
        { action: "removeRow", icon: "table-row-remove", label: "tableRemoveRow" },
        { action: "addColumn", icon: "table-column-add", label: "tableAddColumn" },
        { action: "removeColumn", icon: "table-column-remove", label: "tableRemoveColumn" },
    ];
    return <div class={styles.root} data-editable-table={props.block.sourceLine}
        style={{ left: `${props.left}px`, top: `${props.top}px`, width: `${props.width}px` }}>
        <table class={styles.table}>
            <thead><tr><Index each={source().cells[0]}>{(_, column) => <th scope="col" class={`${styles.cell} ${styles.heading}`} style={{ "text-align": props.block.table.alignments[column] }}>
                {cellsFor(0, column)}
            </th>}</Index></tr></thead>
            <tbody><Index each={source().cells.slice(1)}>{(_, index) => <tr><Index each={source().cells[index + 1]}>{(_, column) => <td class={styles.cell} style={{ "text-align": props.block.table.alignments[column] }}>{cellsFor(index + 1, column)}</td>}</Index></tr>}</Index></tbody>
        </table>
        <div class={styles.controls}><Index each={controls}>{(control) => <button class={styles.button} type="button" aria-label={props.t(control().label)}
            disabled={control().action === "removeRow" ? source().cells.length <= 1 : control().action === "removeColumn" && source().delimiters.length <= 1}
            onPointerDown={(event) => event.preventDefault()} onClick={() => changeStructure(control().action)}><Icon name={control().icon} size={18} /></button>}</Index>
            <button class={`${styles.button} ${styles.danger}`} type="button" aria-label={props.t("tableDelete")}
                onPointerDown={(event) => event.preventDefault()} onClick={props.onDelete}><Icon name="delete" size={18} /></button>
        </div>
    </div>;

    function cellsFor(row: number, column: number) {
        return <Cell onFormattingReady={props.onFormattingReady} formatCell={props.formatCell} value={source().cells[row]?.[column] ?? ""} label={`${props.t("tableCell")} ${row + 1}, ${column + 1}`} renderText={props.renderText}
            resolvePastedLink={props.resolvePastedLink} canResolvePastedUrl={props.canResolvePastedUrl}
            register={(element) => { inputs.set(`${row}:${column}`, element); onCleanup(() => inputs.delete(`${row}:${column}`)); }}
            onFocus={() => setSelected({ row, column })} onChange={(text, formatted, kind) => updateCell(row, column, text, formatted, kind)}
            onKeyDown={(event) => {
                if (event.isComposing) return;
                if ((event.ctrlKey || event.metaKey) && !event.altKey && ["z", "y"].includes(event.key.toLowerCase())) { props.onHistory(event); return; }
                if (event.key !== "Tab" && event.key !== "Enter") return;
                event.preventDefault();
                const columns = source().delimiters.length;
                const index = event.key === "Enter" ? (row + (event.shiftKey ? -1 : 1)) * columns + column : row * columns + column + (event.shiftKey ? -1 : 1);
                if (index < 0 || index >= source().cells.length * columns) props.onExit(index >= 0);
                else focus(Math.floor(index / columns), index % columns);
            }} />;
    }
};
export default TableEditor;
