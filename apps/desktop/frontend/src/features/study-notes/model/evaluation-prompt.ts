import { preparedContextPrompt } from "./context-prompt";

export const evaluationContextPrompt = (locale: string): string => `Task settings: ${JSON.stringify({ language: locale, contextTool: "read_study_context" })}
${preparedContextPrompt}
Reference answers are guidance only: verify them against the sources and accept accurate paraphrases, equivalent abbreviations/full names, synonyms, translations and minor spelling errors that preserve meaning, rather than requiring literal matches. If the references disagree with current sources, prioritize the sources and explain the discrepancy.
Every finding must cite 1-16 exact short sourceId values from this manifest (N1, N2...), never UUIDs, titles or links. Aliases are local to this request. Use plain text, at most 8 findings per list and 2000 characters per finding, with a summary up to 3000 characters. Empty lists are allowed. No numerical grade. Return only the requested JSON object, without commentary or Markdown fences.`;

export const feedbackSchema = (cloze: boolean): string => JSON.stringify({
	...(cloze ? { blankResults: [true] } : { correct: true }), summary: "...",
	strengths: [{ text: "...", sources: ["N1"] }],
	gaps: [{ text: "...", sources: ["N1"] }],
	corrections: [{ text: "...", sources: ["N1"] }],
});
