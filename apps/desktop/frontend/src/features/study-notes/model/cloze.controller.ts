import { createSignal, type Accessor } from "solid-js";
import { fillClozeText, type StudyItem, type StudySubmission } from "@/entities/study";

export const useCloze = (session: {
	active: Accessor<boolean>; answered: Accessor<boolean>; blocked: Accessor<boolean>;
	current: Accessor<StudyItem | undefined>; onSubmit: (answer: StudySubmission) => void; onTimeout: (answer: StudySubmission) => void; onSkip: (answer: StudySubmission) => void;
}) => {
	const [answers, setAnswers] = createSignal<string[]>([]);
	const [activeBlank, setActiveBlank] = createSignal(0);
	const complete = () => !!session.current()?.blanks?.length && session.current()!.blanks!.every((_, index) => answers()[index]?.trim());
	const text = (): StudySubmission => {
		const blankAnswers = (session.current()?.blanks ?? []).map((_, index) => answers()[index]?.trim() ?? "");
		return { answer: fillClozeText(session.current()?.question ?? "", blankAnswers.map(answer => answer || "____")), blankAnswers };
	};
	return {
		answers, activeBlank, setActiveBlank, complete,
		reset: () => { setAnswers([]); setActiveBlank(0); },
		submit: () => { if (session.active() && !session.answered() && !session.blocked() && complete()) session.onSubmit(text()); },
		skip: () => { if (session.active() && !session.answered() && !session.blocked()) session.onSkip(text()); },
		timeout: () => { if (session.active() && !session.answered()) session.onTimeout(text()); },
		setAnswer: (index: number, value: string) => {
			if (!session.active() || session.answered() || index < 0 || index >= (session.current()?.blanks?.length ?? 0)) return;
			setAnswers(previous => { const next = [...previous]; next[index] = value.slice(0, 200); return next; });
		},
	};
};
