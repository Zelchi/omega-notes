import { For, type Component, type JSX } from "solid-js";
import type { FormattedTable as TableData, TextRun } from "@/shared/lib/formatted-text";
import { styles } from "./style.css";

const FormattedTable: Component<{
    table: TableData;
    sourceLine: number;
    renderRuns: (runs: TextRun[]) => JSX.Element;
}> = (props) => (
    <table class={styles.table} data-formatted-table={props.sourceLine}>
        <thead><tr><For each={props.table.headers}>{(cell, column) =>
            <th class={styles.heading} scope="col" style={{ "text-align": props.table.alignments[column()] }}>
                {props.renderRuns(cell)}
            </th>
        }</For></tr></thead>
        <tbody><For each={props.table.rows}>{(row) => <tr><For each={row}>{(cell, column) =>
            <td class={styles.cell} style={{ "text-align": props.table.alignments[column()] }}>{props.renderRuns(cell)}</td>
        }</For></tr>}</For></tbody>
    </table>
);

export default FormattedTable;
