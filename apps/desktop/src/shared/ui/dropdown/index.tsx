import Button from "@/shared/ui/button";
import { playSound } from "@/shared/ui/sound";
import { For, Show, createEffect, createMemo, createSignal, createUniqueId, onCleanup, onMount, untrack, type Component, type JSX } from "solid-js";
import { createPresence } from "@/shared/lib/presence";
import { registerVisibilityAnimation } from "@/shared/ui/visibility-animation";
import { Portal } from "solid-js/web";
import { windowLayout } from "@/shared/ui/window-layout";
import Icon from "@/shared/ui/icon";
import CustomScrollArea from "@/shared/ui/custom-scroll-area";
import { styles } from "./style.css.ts";

export type DropdownOption = { value: string; label: string; disabled?: boolean };
type Props = {
    id?: string;
    value: string;
    options: DropdownOption[];
    ariaLabel: string;
    disabled?: boolean;
    scrollable?: boolean;
    placeholder?: string;
    class?: string;
    style?: JSX.CSSProperties;
    onChange: (value: string) => void;
};
type Placement = { left: number; top: number; width: number };

const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();

const Dropdown: Component<Props> = (props) => {
    const unique = createUniqueId();
    const listId = `dropdown-${unique}`;
    const [open, setOpen] = createSignal(false);
    const [active, setActive] = createSignal(-1);
    const [placement, setPlacement] = createSignal<Placement>({ left: 0, top: 40, width: 160 });
    const presence = createPresence(open, 210);
    const selected = createMemo(() => props.options.find((option) => option.value === props.value));
    let root!: HTMLDivElement;
    let trigger!: HTMLButtonElement;
    let menu: HTMLDivElement | undefined;
    let scrollViewport: HTMLDivElement | undefined;
    let frame = 0;
    let search = "";
    let searchTimer: ReturnType<typeof setTimeout> | undefined;

    const position = () => {
        if (!root?.isConnected || !trigger?.isConnected) return;
        const bounds = trigger.getBoundingClientRect();
        const limits = { left: 8, top: windowLayout.titlebarHeight + 9, right: innerWidth - 8, bottom: innerHeight - 8 };
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (context) context.font = getComputedStyle(trigger).font;
        const labelWidth = Math.max(0, ...props.options.map((option) => context?.measureText(option.label).width ?? option.label.length * 7));
        const width = Math.min(Math.max(bounds.width, Math.min(360, labelWidth + 56)), Math.max(0, limits.right - limits.left));
        if (menu) menu.style.width = `${width}px`;
        const below = Math.max(0, limits.bottom - bounds.bottom - 5);
        const above = Math.max(0, bounds.top - limits.top - 5);
        if (menu && props.scrollable) {
            const contentHeight = scrollViewport?.querySelector('[role="listbox"]')?.scrollHeight ?? props.options.length * 32;
            menu.style.height = `${Math.min(contentHeight + 8, 280, Math.max(below, above))}px`;
        } else if (menu) {
            menu.style.removeProperty("height");
        }
        const height = menu ? menu.offsetHeight : props.options.length * 32 + 8;
        const useBelow = below >= height || below >= above;
        const left = Math.max(limits.left, Math.min(bounds.left, limits.right - width));
        const preferredTop = useBelow ? bounds.bottom + 5 : bounds.top - 5 - height;
        const top = Math.max(limits.top, Math.min(preferredTop, limits.bottom - height));
        setPlacement({ left, top, width });
    };
    const schedule = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            if (!open()) return;
            position();
            if (props.scrollable && scrollViewport) {
                const option = document.getElementById(`${listId}-${active()}`);
                if (!option) return;
                const bounds = option.getBoundingClientRect();
                const viewport = scrollViewport.getBoundingClientRect();
                const scale = scrollViewport.offsetHeight ? viewport.height / scrollViewport.offsetHeight : 1;
                if (bounds.top < viewport.top) scrollViewport.scrollTop += (bounds.top - viewport.top) / scale;
                else if (bounds.bottom > viewport.bottom) scrollViewport.scrollTop += (bounds.bottom - viewport.bottom) / scale;
            }
        });
    };
    const close = () => { setOpen(false); search = ""; clearTimeout(searchTimer); };
    const show = (last = false) => {
        if (props.disabled || !props.options.some((option) => !option.disabled)) return;
        position();
        const index = props.options.findIndex((option) => option.value === props.value && !option.disabled);
        const available = props.options.map((option, index) => ({ option, index })).filter(({ option }) => !option.disabled);
        setActive(index >= 0 ? index : (last ? available.at(-1)?.index : available[0]?.index) ?? -1);
        setOpen(true);
        schedule();
    };
    const choose = (index: number) => {
        const option = props.options[index];
        if (!option || option.disabled) return;
        playSound("click");
        close();
        if (option.value !== props.value) props.onChange(option.value);
        if (trigger.isConnected) trigger.focus({ preventScroll: true });
    };
    const move = (direction: number) => {
        const options = props.options;
        let index = active();
        for (let count = 0; count < options.length; count++) {
            index = (index + direction + options.length) % options.length;
            if (!options[index].disabled) { setActive(index); schedule(); return; }
        }
    };
    const keyDown = (event: KeyboardEvent) => {
        if (props.disabled) return;
        if (event.key === "Escape" && open()) { event.preventDefault(); event.stopPropagation(); close(); return; }
        if (event.key === "Tab") { close(); return; }
        if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            if (!open()) { show(event.key === "ArrowUp" || event.key === "End"); return; }
            if (event.key === "Enter" || event.key === " ") { choose(active()); return; }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") move(event.key === "ArrowDown" ? 1 : -1);
            else {
                const indices = props.options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);
                setActive((event.key === "Home" ? indices[0] : indices.at(-1)) ?? -1);
                schedule();
            }
            return;
        }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            if (!open()) show();
            search += normalized(event.key);
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => { search = ""; }, 650);
            const start = active() + 1;
            const query = [...search].every((character) => character === search[0]) ? search[0] : search;
            for (let step = 0; step < props.options.length; step++) {
                const index = (start + step) % props.options.length;
                const option = props.options[index];
                if (!option.disabled && normalized(option.label).startsWith(query)) { setActive(index); schedule(); break; }
            }
        }
    };
    createEffect(() => { if (props.disabled) close(); });
    createEffect(() => {
        const options = props.options;
        const value = props.value;
        if (!untrack(open)) return;
        const index = options.findIndex((option) => option.value === value && !option.disabled);
        setActive(index >= 0 ? index : options.findIndex((option) => !option.disabled));
        schedule();
    });
    onMount(() => {
        const contains = (target: EventTarget | null) => target instanceof Node && (root.contains(target) || Boolean(menu?.contains(target)));
        const outside = (event: PointerEvent) => { if (open() && !contains(event.target)) close(); };
        const resized = () => { if (open()) schedule(); };
        const scrolled = (event: Event) => { if (open() && !contains(event.target)) close(); };
        const hidden = () => { if (root.closest('[inert], [aria-hidden="true"]')) close(); };
        const resizedTrigger = new ResizeObserver(resized);
        resizedTrigger.observe(trigger);
        const ancestors = new MutationObserver(hidden);
        for (let element = root.parentElement; element; element = element.parentElement) {
            ancestors.observe(element, { attributes: true, attributeFilter: ["inert", "aria-hidden"] });
        }
        document.addEventListener("pointerdown", outside, true);
        document.addEventListener("scroll", scrolled, true);
        window.addEventListener("resize", resized);
        window.addEventListener("blur", close);
        onCleanup(() => {
            document.removeEventListener("pointerdown", outside, true);
            document.removeEventListener("scroll", scrolled, true);
            window.removeEventListener("resize", resized);
            window.removeEventListener("blur", close);
            resizedTrigger.disconnect(); ancestors.disconnect();
        });
    });
    onCleanup(() => { cancelAnimationFrame(frame); clearTimeout(searchTimer); });
    const optionList = () => <div id={listId} role="listbox" aria-label={props.ariaLabel}>
        <For each={props.options}>{(option, index) => <div id={`${listId}-${index()}`} class={styles.option}
            role="option" aria-selected={option.value === props.value} aria-disabled={option.disabled || undefined}
            data-active={index() === active() && !option.disabled ? "true" : undefined}
            onPointerDown={(event) => event.preventDefault()}
            onPointerMove={() => { if (!option.disabled) setActive(index()); }} onClick={() => choose(index())}>
            <span>{option.label}</span><span class={styles.check}><Show when={option.value === props.value}><Icon name="check" size={14} /></Show></span>
        </div>}</For>
    </div>;
    return <div ref={root} class={`${styles.root} ${props.class ?? ""}`} style={{ ...props.style, "z-index": presence.present() ? 20 : undefined }}>
        <Button ref={trigger} id={props.id} class={styles.trigger} type="button" role="combobox"
            aria-label={props.ariaLabel} aria-haspopup="listbox" aria-expanded={open()} aria-controls={presence.present() ? listId : undefined}
            aria-activedescendant={open() && active() >= 0 ? `${listId}-${active()}` : undefined}
            disabled={props.disabled} onClick={() => open() ? close() : show()} onKeyDown={keyDown}
            onBlur={(event) => { if (!root.contains(event.relatedTarget as Node)) close(); }}>
            <span class={styles.label}>{selected()?.label ?? props.placeholder ?? ""}</span>
            <span class={styles.arrow} style={{ transform: open() ? "rotate(180deg)" : undefined }}><Icon name="chevronDown" size={14} /></span>
        </Button>
        <Show when={presence.present()}><Portal>
            <div class={styles.menu} inert={presence.exiting()} aria-hidden={presence.exiting() ? "true" : undefined}
                ref={(element) => { menu = element; registerVisibilityAnimation(element, presence.exiting, "dialog"); schedule(); }}
                style={{ left: `${placement().left}px`, top: `${placement().top}px`, width: `${placement().width}px` }}>
                <Show when={props.scrollable} fallback={optionList()}>
                    <CustomScrollArea ariaLabel={props.ariaLabel} viewportStyle={{ padding: "0 18px 0 0" }}
                        viewportRef={(element) => { scrollViewport = element; schedule(); }}>
                        {optionList()}
                    </CustomScrollArea>
                </Show>
            </div>
        </Portal></Show>
    </div>;
};

export default Dropdown;
