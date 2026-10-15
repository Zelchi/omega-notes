import Link from "@/shared/ui/link";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Component, JSX } from "solid-js";
import { isTauriRuntime } from "@/shared/lib/tauri";

const ExternalLink: Component<{
    url: string;
    children: JSX.Element;
    class?: string;
    style?: JSX.CSSProperties;
    onOpen?: (url: string) => void;
}> = (props) => <Link href={props.url} class={props.class}
    style={props.style} target={isTauriRuntime() ? undefined : "_blank"} rel="noopener noreferrer"
    onClick={(event) => {
        if (!isTauriRuntime()) return;
        event.preventDefault();
        if (props.onOpen) props.onOpen(props.url);
        else void openUrl(props.url).catch(console.error);
    }}>{props.children}</Link>;

export default ExternalLink;
