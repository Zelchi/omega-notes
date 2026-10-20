import type { Component } from "solid-js";
import codex from "@/shared/assets/ai/codex.svg";
import claude from "@/shared/assets/ai/claude.svg";
import opencode from "@/shared/assets/ai/opencode.svg";
import antigravity from "@/shared/assets/ai/antigravity.svg";
import { providerIcon } from "./style.css.ts";

const symbols = { codex, claude, opencode, antigravity };

const AiProviderIcon: Component<{ provider: keyof typeof symbols }> = (props) =>
    <span class={providerIcon} aria-hidden="true" style={{
        "mask-image": `url("${symbols[props.provider]}")`,
        "-webkit-mask-image": `url("${symbols[props.provider]}")`,
    }} />;

export default AiProviderIcon;
