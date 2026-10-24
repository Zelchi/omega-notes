import { createSignal, type Accessor } from "solid-js";
import type { StudyItem, StudyOutcome } from "@/entities/study";

export const useCorrection = (session: {
	active: Accessor<boolean>; answered: Accessor<boolean>; blocked: Accessor<boolean>;
	current: Accessor<StudyItem | undefined>; expired: () => boolean;
	onResult: (outcome: StudyOutcome) => void;
}) => {
	const [selected, setSelected] = createSignal<ReadonlySet<number>>(new Set<number>());
	const canAnswer = () => session.active() && !session.answered() && !session.blocked();
	return {
		selected, reset: () => setSelected(new Set<number>()),
		toggle: (index: number) => {
			if (!canAnswer() || !Number.isInteger(index) || index < 0 || index >= (session.current()?.segments?.length ?? 0)) return;
			if (session.expired()) { session.onResult("timeout"); return; }
			setSelected(previous => { const next = new Set(previous); if (next.has(index)) next.delete(index); else next.add(index); return next; });
		},
		submit: () => {
			const segments = session.current()?.segments;
			if (!canAnswer() || !segments || !selected().size) return;
			session.onResult(session.expired() ? "timeout" : segments.every((segment, index) => segment.incorrect === selected().has(index)) ? "correct" : "wrong");
		},
		reveal: () => { if (canAnswer()) session.onResult(session.expired() ? "timeout" : "wrong"); },
	};
};
