import type { Accessor } from "solid-js";
import type { StudyNote } from "@/entities/note";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { StudyContext, AiTaskPurpose } from "@/entities/ai";

export type StudyEnvironment = {
	vaultId: Accessor<string | undefined>;
	notes: Accessor<StudyNote[]>;
	currentNote: Accessor<StudyNote | undefined>;
	aiEnabled: Accessor<boolean>;
	aiConnected: Accessor<boolean>;
	onConnect: () => void;
	canGenerate: Accessor<boolean>;
	requestText: (prompt: string, signal: AbortSignal, context?: StudyContext, purpose?: Exclude<AiTaskPurpose, "chat">) => Promise<string>;
	describeAiError: (failure: unknown) => string;
	onOpenNote: (note: StudyNote) => void | Promise<void>;
	t: (key: TranslationKey) => string;
};
