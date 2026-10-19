import type { StudyKind } from "@/entities/study";
import type { StudyAssignment } from "./context";
import { preparedContextPrompt } from "./context-prompt";
import { generationFormats } from "./generation-formats";

export const studyPrompt = (kind: StudyKind, locale: string, plan: StudyAssignment[], feedback: {
	avoid: string[]; issues: { itemId: string; reason: string }[];
} = { avoid: [], issues: [] }): string => {
	const format = generationFormats[kind];
	return `Generate study material from the authorized vault. This is a new task; ignore prior chat topics. Use only read_study_context.
Task settings: ${JSON.stringify({ kind, count: plan.length, language: locale, contextTool: "read_study_context", includeLinkedNotes: true,
		alreadyGeneratedQuestions: feedback.avoid, previousIssues: feedback.issues })}
${preparedContextPrompt}
Return exactly one object per manifest assignment, for ${plan.length} objects total. Every object must copy its exact itemId from the manifest. Objects may be returned in any order: itemId, not array position, identifies the exercise. Never invent, repeat or change an itemId. Repeated primarySourceId values still require separate distinct exercises; count exercises, not blanks or references. For each item, use only sources whose usedByItems includes its manifest number. Supporting sources supplement the original primary subject; ignore unrelated supporting content. If a primary source is empty, its title may identify the topic but cannot support factual claims. The sources array must contain the exact primarySourceId first and authorized sourceId values actually used, with 1-16 sources total. Cite only manifest aliases, never UUIDs, titles or links. Never substitute another primary source or show source IDs in the learner-facing question.
Write every question and passage as a self-contained exercise: explicitly name the subject, entity, process or situation being tested and provide the context needed to understand it without opening a note or reading another exercise. Ask directly about the subject. Avoid vague source-dependent phrasing such as "according to the note", "following the note", "in the text", "as mentioned above", "segundo a nota", "conforme a nota" or "seguindo a nota". If the question genuinely depends on a particular author's claim or a note-specific account, identify the source using its actual title returned by the note tools, together with enough subject context. Never invent a title or show a UUID to the learner. Do not reveal the answer through a source title, especially in fill-in-the-blank exercises; rephrase the question around the subject instead. Apply these rules to explanations as well: identify the actual concept and source when needed instead of vaguely saying "the note says".
Generate distinct useful exercises, covering different aspects when a primary note is repeated. alreadyGeneratedQuestions lists previews of previously accepted questions for these subjects: do not repeat or lightly rephrase them, and do not use the previews as factual evidence. previousIssues identifies only the slots being retried; correct those problems. If one assigned context cannot support another distinct exercise, return {"itemId":"that exact manifest itemId","error":"STUDY_INSUFFICIENT_CONTENT"} for that slot inside items. Still return valid exercises for all other assignments. Do not discard an entire batch because one item lacks content, fill it with invented facts, or silently reduce the count. Use plain text in fields and a session title up to 200 characters.
${format.instructions}
For this generation task only, return ONLY one JSON object, no commentary or Markdown fences, matching this shape: ${JSON.stringify({ title: "...", items: [format.item] })}`;
};
