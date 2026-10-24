import { style } from "@vanilla-extract/css";

export const styles = {
    root: style({ font: "inherit", color: "inherit", vars: {
        "--code-comment": "#a0a0a8", "--code-keyword": "#c5a3f5", "--code-string": "#a9d18e",
        "--code-number": "#e5bd82", "--code-function": "#87c7ed", "--code-type": "#e6ca8a",
        "--code-operator": "#d4d4d8", "--code-tag": "#ed9d9d",
    }, selectors: { ':root[data-theme="light"] &': { vars: {
        "--code-comment": "#62626b", "--code-keyword": "#7532a3", "--code-string": "#326728",
        "--code-number": "#91521c", "--code-function": "#155e8c", "--code-type": "#765a10",
        "--code-operator": "#404049", "--code-tag": "#a83030",
    } } } }),
};

const comment = style({ color: "var(--code-comment)" });
const keyword = style({ color: "var(--code-keyword)" });
const string = style({ color: "var(--code-string)" });
const number = style({ color: "var(--code-number)" });
const functionToken = style({ color: "var(--code-function)" });
const type = style({ color: "var(--code-type)" });
const operator = style({ color: "var(--code-operator)" });
const tag = style({ color: "var(--code-tag)" });

export const tokenStyles: Record<string, string> = {
    comment, prolog: comment, doctype: comment, cdata: comment,
    keyword, boolean: number, number, constant: number,
    string, char: string, "attr-value": string, regex: string, inserted: string,
    function: functionToken, "function-variable": functionToken,
    "class-name": type, builtin: type, symbol: type, "attr-name": type,
    operator, punctuation: operator, tag, property: tag, deleted: tag,
};
