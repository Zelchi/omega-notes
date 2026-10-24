/** Erros dos provedores são mensagens temporárias da interface, nunca parte das conversas salvas. */
export const formatAiErrorDetail = (detail?: string): string => {
    if (!detail) return "";
    const cleaned = detail
        .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
        .replace(/\b(Bearer|Basic)\s+[^\s"',;}]+/gi, "$1 [redacted]")
        .replace(/(["']?(?:authorization|api[-_]?key|(?:access|refresh|session|id)[-_]?token|token|password|(?:client[-_]?)?secret|(?:set[-_]?)?cookie)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/gi, "$1[redacted]")
        .replace(/\b(?:sk|ghp|gho|github_pat)[-_][A-Za-z0-9_-]+/g, "[redacted]")
        .replace(/https?:\/\/[^\s<>"']+/gi, (url) => {
            try {
                const parsed = new URL(url);
                parsed.username = "";
                parsed.password = "";
                parsed.search = "";
                parsed.hash = "";
                return parsed.toString();
            } catch { return "[URL]"; }
        })
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
    const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return (lines.find((line) => /\berror\b/i.test(line)) ?? lines[0] ?? "").slice(0, 600);
};

/** Mantenha o código do provedor separado do diagnóstico temporário, com dados sensíveis removidos. */
export class AiRequestError extends Error {
    readonly detail: string;
    constructor(code: string, detail?: string) {
        super(code);
        this.name = "AiRequestError";
        this.detail = formatAiErrorDetail(detail);
    }
}
export const readAiFailure = (failure: unknown): AiRequestError => {
    if (failure instanceof AiRequestError) return failure;
    const message = failure instanceof Error ? failure.message : String(failure);
    try {
        const value = JSON.parse(message);
        if (value && typeof value === "object" && typeof value.code === "string" && /^AI_[A-Z_]+$/.test(value.code))
            return new AiRequestError(value.code, typeof value.detail === "string" ? value.detail : undefined);
    } catch { /* Códigos simples do provedor já são mensagens de erro válidas. */ }
    return new AiRequestError(message);
};
