import { invoke } from "@/shared/lib/desktop";
import type { AiProviderId } from "@/entities/ai";

export type InstalledAiProviders = Record<AiProviderId, boolean>;

export const readInstalledAiProviders = (): Promise<InstalledAiProviders> => invoke("ai_installed_providers");
