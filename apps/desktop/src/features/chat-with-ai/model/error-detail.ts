/** Provider errors are transient UI text, never part of saved conversations. */
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
