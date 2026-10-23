import Button from "@/shared/ui/button";
import type { Component } from "solid-js";
import type { TranslationKey } from "@/shared/lib/i18n";
import Icon from "@/shared/ui/icon";
import { styles } from "./style.css";

const ACTIONS_WIDTH = 160;

const MediaPositioningActions: Component<{
    x: number;
    width: number;
    pageWidth: number;
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
        <Button class={`${styles.button} ${styles.danger}`} type="button" onClick={props.onDelete}
            aria-label={props.t("deleteMediaElement")}>
            <Icon name="delete" size={18} />
        </Button>
        <Button class={styles.button} type="button" onClick={props.onConfirm}
            aria-label={props.t("confirmMediaPosition")}>
            <Icon name="check" size={18} />
        </Button>
        <Button class={styles.button} type="button" onPointerDown={props.onResize}
            onKeyDown={props.onResizeKeyDown} style={{ cursor: "nwse-resize" }}
            aria-label={props.t("resizeImage")}>
            <Icon name="resizeDiagonal" size={16} />
        </Button>
    </div>
);

export default MediaPositioningActions;
