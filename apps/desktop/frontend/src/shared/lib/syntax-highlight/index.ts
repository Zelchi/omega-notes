import Prism, { type PrismToken } from "prismjs/components/prism-core";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-python";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-java";
import "prismjs/components/prism-go";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markdown";

Prism.manual = true;

export type CodeToken = { text: string; types: string[] };
const aliases: Record<string, string> = {
    js: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript",
    rs: "rust", py: "python", sh: "bash", shell: "bash", html: "markup", xml: "markup", svg: "markup",
    "c++": "cpp", cs: "csharp", "c#": "csharp", golang: "go", yml: "yaml", md: "markdown",
};
const languages = new Set(["javascript", "typescript", "jsx", "tsx", "rust", "python", "json", "bash",
    "markup", "css", "c", "cpp", "csharp", "java", "go", "sql", "yaml", "markdown"]);

export const highlightCode = (text: string, language?: string): CodeToken[] => {
    const requested = language?.trim().toLowerCase() ?? "";
    const name = aliases[requested] ?? requested;
    const plain = [{ text, types: [] }];
    if (!languages.has(name) || text.length > 100_000) return plain;
    const grammar = Prism.languages[name];
    if (!grammar) return plain;
    try {
        const result: CodeToken[] = [];
        const flatten = (value: string | PrismToken | (string | PrismToken)[], types: string[] = []): void => {
            if (typeof value === "string") { if (value) result.push({ text: value, types }); return; }
            if (Array.isArray(value)) { value.forEach((token) => flatten(token, types)); return; }
            const aliases = typeof value.alias === "string" ? [value.alias] : value.alias ?? [];
            flatten(value.content, [...types, value.type, ...aliases]);
        };
        flatten(Prism.tokenize(text, grammar));
        return result;
    } catch { return plain; }
};
