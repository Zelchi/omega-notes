import { createEffect, onCleanup, onMount, type Component } from "solid-js";
import Input from "@/shared/ui/input";
import Button from "@/shared/ui/button";
import Icon from "@/shared/ui/icon";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { FindInNote } from "../model/controller";
import { styles } from "./style.css";

export const NoteFindBar: Component<{ find: FindInNote; t: (key: TranslationKey) => string }> = (props) => {
    let input!: HTMLInputElement;
    let frame = 0;
    onMount(() => props.find.setVisible(true));
    onCleanup(() => { props.find.setVisible(false); cancelAnimationFrame(frame); });
    createEffect(() => {
        props.find.focusRequest();
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => { input.focus({ preventScroll: true }); input.select(); });
    });
    return <div class={styles.row} role="search" aria-label={props.t("findInNote")} data-note-find-ui>
        <Icon name="search" size={16} />
        <Input ref={input} class={styles.input} type="text" value={props.find.query()} aria-label={props.t("findInNote")}
            placeholder={props.t("findInNote")} autocomplete="off" spellcheck={false}
            onInput={(event) => props.find.setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
                if (event.isComposing) return;
                if (event.key === "Enter" || event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault(); event.stopPropagation();
                    props.find.move(event.key === "ArrowUp" || event.shiftKey ? -1 : 1);
                }
            }} />
        <span class={styles.counter} role="status" aria-live="polite">{props.find.count() ? props.find.active() + 1 : 0}/{props.find.count()}{props.find.capped() ? "+" : ""}</span>
        <Button class={styles.button} type="button" aria-label={props.t("findPrevious")} disabled={!props.find.count()}
            onPointerDown={(event) => event.preventDefault()} onClick={() => props.find.move(-1)}><span class={styles.up}><Icon name="chevronDown" size={16} /></span></Button>
        <Button class={styles.button} type="button" aria-label={props.t("findNext")} disabled={!props.find.count()}
            onPointerDown={(event) => event.preventDefault()} onClick={() => props.find.move(1)}><Icon name="chevronDown" size={16} /></Button>
        <Button class={styles.button} type="button" aria-label={props.t("close")}
            onClick={props.find.close}><Icon name="close" size={15} /></Button>
    </div>;
};
