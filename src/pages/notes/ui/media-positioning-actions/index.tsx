import type { Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import Icon from "@/shared/ui/icon";
import { styles } from "./style.css";

const ACTIONS_WIDTH = 160;

const MediaPositioningActions: Component<{
    x: number;
    width: number;
    pageWidth: number;
    audio?: boolean;
    t: (key: TranslationKey) => string;
    onConfirm: () => void;
    onDelete: () => void;
    onResize: (event: PointerEvent & { currentTarget: HTMLButtonElement }) => void;
    onResizeKeyDown: (event: KeyboardEvent) => void;
}> = (props) => (
    <div class={styles.root} style={{
        left: `${Math.max(-props.x, Math.min(props.pageWidth - props.x - ACTIONS_WIDTH - 2, (props.width - ACTIONS_WIDTH) / 2))}px`,
    }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}>
        <button class={`${styles.button} ${styles.danger}`} type="button" onClick={props.onDelete}
            title={props.t("deleteMediaElement")} aria-label={props.t("deleteMediaElement")}>
            <Icon name="delete" size={18} />
        </button>
        <button class={styles.button} type="button" onClick={props.onConfirm}
            title={props.t("confirmMediaPosition")} aria-label={props.t("confirmMediaPosition")}>
            <Icon name="check" size={18} />
        </button>
        <button class={styles.button} type="button" onPointerDown={props.onResize}
            onKeyDown={props.onResizeKeyDown} style={{ cursor: props.audio ? "ew-resize" : "nwse-resize" }}
            title={props.t("resizeMedia")} aria-label={props.t("resizeMedia")}>
            <Icon name={props.audio ? "resizeHorizontal" : "resizeDiagonal"} size={16} />
        </button>
    </div>
);

export default MediaPositioningActions;
