import { invoke } from "@tauri-apps/api/core";
import type { AiProviderId } from "@/entities/ai";

export type InstalledAiProviders = Record<AiProviderId, boolean>;

export const readInstalledAiProviders = (): Promise<InstalledAiProviders> => invoke("ai_installed_providers");
