import type { Accessor } from "solid-js";
import type { NoteSummary, StudyNote } from "@/entities/note";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { StudyContext, AiTaskPurpose } from "@/entities/ai";

export type StudyEnvironment = {
	vaultId: Accessor<string | undefined>;
	noteSummaries: Accessor<NoteSummary[]>;
	currentNote: Accessor<StudyNote | undefined>;
	aiEnabled: Accessor<boolean>;
	normalAiMode: Accessor<boolean>;
	aiConnected: Accessor<boolean>;
	canGenerate: Accessor<boolean>;
	requestText: (prompt: string, signal: AbortSignal, context?: StudyContext, purpose?: Exclude<AiTaskPurpose, "chat">) => Promise<string>;
	describeAiError: (failure: unknown) => string;
	onOpenNote: (note: NoteSummary) => void | Promise<void>;
	t: (key: TranslationKey) => string;
};
