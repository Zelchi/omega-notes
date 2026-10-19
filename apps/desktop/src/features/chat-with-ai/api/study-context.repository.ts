import { invoke } from "@tauri-apps/api/core";
import type { StudyContext } from "@/entities/ai";

export const prepareStudyContext = (vaultId: string, requestId: string, context: StudyContext): Promise<void> =>
	invoke("prepare_study_context", { vaultId, requestId, items: context.items });

export const releaseStudyContext = (requestId: string): Promise<void> =>
	invoke("release_study_context", { requestId });

export const validateStudyContext = (vaultId: string, requestId: string): Promise<void> =>
	invoke("validate_study_context", { vaultId, requestId });
