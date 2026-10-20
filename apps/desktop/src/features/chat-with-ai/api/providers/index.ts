import { codexProvider } from "./codex";
import { claudeProvider, opencodeProvider, antigravityProvider } from "./cli";
import type { AiProviderId } from "@/entities/ai";

export const defaultAiProvider = codexProvider;
export const aiProviders = [codexProvider, claudeProvider, opencodeProvider, antigravityProvider];
export const getAiProvider = (id: AiProviderId) => aiProviders.find((provider) => provider.id === id)!;
