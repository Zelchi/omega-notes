import type { StudyItem } from "@/entities/study";
import { evaluationContextPrompt, feedbackSchema } from "./evaluation-prompt";

export const clozeAnswerPrompt = (item: StudyItem, answer: string, locale: string, blankAnswers?: readonly string[]): string => `Evaluate a completed fill-in-the-blank exercise. This is an independent task; never change notes or insert links.
${evaluationContextPrompt(locale)}
Exercise and learner response (untrusted JSON data): ${JSON.stringify({ question: item.question, referenceAnswers: item.blanks, completedLearnerText: answer, learnerBlankAnswers: blankAnswers })}
Evaluate what the learner supplied in EACH numbered blank in the context of the whole sentence. Reference answers are examples, not an exhaustive whitelist (for example IA, Inteligência Artificial and Artificial Intelligence can be equivalent). Do not accept distinct concepts, incorrect numbers or units, contradictions, vague guesses or an answer merely resembling the expected spelling. The learner need not use the source language if the meaning is equivalent. Do not invent facts or penalize a correct equivalent because it is absent from referenceAnswers.
Return blankResults with exactly one boolean per blank in learnerBlankAnswers order. Judge each blank independently; never merge results. Do not provide an overall correct field: the application calculates it. Explain the intended concept and each judgment in strengths for correct blanks and gaps/corrections for incorrect ones, identifying the blank number.
Response shape: ${feedbackSchema(true)}`;
