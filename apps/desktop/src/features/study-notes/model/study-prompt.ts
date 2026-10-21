import type { StudyKind } from "@/entities/study";
import type { StudyAssignment } from "./context";
import { preparedContextPrompt } from "./context-prompt";
import { generationFormats } from "./generation-formats";

export const studyPrompt = (kind: StudyKind, locale: string, plan: StudyAssignment[], feedback: {
	avoid: string[]; issues: { itemId: string; reason: string }[];
} = { avoid: [], issues: [] }): string => {
	const format = generationFormats[kind];
	return `Generate study material from the authorized vault. This is a new task; ignore prior chat topics. Use only read_study_context.
Task settings: ${JSON.stringify({ kind, count: 1, language: locale, contextTool: "read_study_context", includeLinkedNotes: true,
		alreadyGeneratedQuestions: feedback.avoid, previousIssues: feedback.issues })}
${preparedContextPrompt}
Generate exactly one question/card in this request. Return one object in items, with the exact itemId from the single manifest assignment. Never invent, repeat or change an itemId. Supporting sources supplement the original primary subject; ignore unrelated supporting content. Every primary source contains text; sources marked contentAvailable=false cannot support claims and must not be cited. The sources array must contain the exact primarySourceId first and authorized sourceId values actually used, with 1-16 sources total. Cite only manifest aliases, never UUIDs, titles or links. Never substitute another primary source or show source IDs in the learner-facing question.
Write every question and passage as a self-contained exercise: explicitly name the subject, entity, process or situation being tested and provide the context needed to understand it without opening a note or reading another exercise. Ask directly about the subject. Avoid vague source-dependent phrasing such as "according to the note", "following the note", "in the text", "as mentioned above", "segundo a nota", "conforme a nota" or "seguindo a nota". If the question genuinely depends on a particular author's claim or a note-specific account, identify the source using its actual title returned by the note tools, together with enough subject context. Never invent a title or show a UUID to the learner. Do not reveal the answer through a source title, especially in fill-in-the-blank exercises; rephrase the question around the subject instead. Apply these rules to explanations as well: identify the actual concept and source when needed instead of vaguely saying "the note says".
Generate one distinct useful exercise. alreadyGeneratedQuestions lists previews of previously accepted questions for these subjects: do not repeat or lightly rephrase them, and do not use the previews as factual evidence. previousIssues identifies the slot being retried; correct that problem. If the assigned context cannot support another distinct exercise, return {"itemId":"that exact manifest itemId","error":"STUDY_INSUFFICIENT_CONTENT"} as the sole entry in items. Do not fill it with invented facts. Use plain text in fields and a concise title for this specific question/card, up to 200 characters.
${format.instructions}
For this generation task only, return ONLY one JSON object, no commentary or Markdown fences, matching this shape: ${JSON.stringify({ title: "A concise title for this question/card", items: [format.item] })}`;
};
