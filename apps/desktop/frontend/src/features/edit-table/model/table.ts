import { parseTableCells, type FormattedBlock } from "@/shared/lib/formatted-text";

export type TableBlock = Extract<FormattedBlock, { kind: "table" }>;
export type TableSource = { cells: string[][]; delimiters: string[] };
export const readTableSource = (block: TableBlock): TableSource => {
    const lines = block.text.split("\n");
    return { cells: [parseTableCells(lines[0]!), ...lines.slice(2).map(parseTableCells)]
        .map((row) => block.table.headers.map((_, column) => row[column] ?? "")), delimiters: parseTableCells(lines[1]!) };
};
const escapeCell = (text: string): string => {
    let referenceEnd = -1;
    let result = "";
    const value = text.replace(/[\r\n]+/g, " ");
    for (let i = 0; i < value.length; i++) {
        if (i > referenceEnd && value.startsWith("[[", i)) {
            const closing = value.indexOf("]]", i + 2);
            if (closing >= 0) referenceEnd = closing + 1;
        }
        result += value[i] === "\\" ? "\\\\" : value[i] === "|" && i > referenceEnd ? "\\|" : value[i];
    }
    return result;
};
export const writeTableSource = (source: TableSource): string => {
    const row = (cells: string[]) => `| ${cells.map(escapeCell).join(" | ")} |`;
    return [row(source.cells[0]!), row(source.delimiters), ...source.cells.slice(1).map(row)].join("\n");
};
