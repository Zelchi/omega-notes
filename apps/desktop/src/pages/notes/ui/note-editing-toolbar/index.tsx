import Button from "@/shared/ui/button";
import { createMemo, createRenderEffect, createSignal, createUniqueId, For, Match, onCleanup, onMount, Show, Switch, type Component } from "solid-js";
import { createPresence } from "@/shared/lib/presence";
import { ExportPdfButton } from "@/features/export-note-pdf";
import { registerExitSnapshot } from "@/shared/ui/exit-snapshot";
import { registerVisibilityAnimation } from "@/shared/ui/visibility-animation";
import type { NoteTextAlignment } from "@/entities/note";
import type { TranslationKey } from "@/shared/lib/i18n";
import { cx } from "@/shared/lib/classes";
import Icon, { type IconName } from "@/shared/ui/icon";
import { styles } from "./style.css.ts";
import type { TextFormat } from "@/features/format-text";

type Props = {
	exiting?: boolean;
	t: (key: TranslationKey) => string;
	alignment: NoteTextAlignment | undefined;
	onAttachMedia: () => void;
	onAlignmentChange: (alignment: NoteTextAlignment) => void;
	onFormat: (format: TextFormat) => void;
	onExportPdf?: () => Promise<void>;
	exportPdfDisabled?: boolean;
};

const alignmentButtons: {
	value: NoteTextAlignment;
	icon: "alignLeft" | "alignCenter" | "alignJustify" | "alignRight";
	label: TranslationKey;
}[] = [
	{ value: "left", icon: "alignLeft", label: "alignTextLeft" },
	{ value: "center", icon: "alignCenter", label: "alignTextCenter" },
	{ value: "justify", icon: "alignJustify", label: "alignTextJustify" },
	{ value: "right", icon: "alignRight", label: "alignTextRight" },
];

const textFormats: { format: TextFormat; icon?: IconName; label: TranslationKey }[] = [
	{ format: "bold", label: "bold" },
	{ format: "italic", label: "italic" },
	{ format: "strike", icon: "strike", label: "strikethrough" },
	{ format: "highlight", icon: "highlight", label: "highlightText" },
];

const extraFormats: { format: TextFormat; icon: IconName; label: TranslationKey }[] = [
	{ format: "note-link", icon: "link", label: "insertNoteLink" },
	{ format: "bullet-list", icon: "bulletList", label: "bulletList" },
	{ format: "ordered-list", icon: "orderedList", label: "orderedList" },
	{ format: "quote", icon: "quote", label: "blockquote" },
	{ format: "code", icon: "code", label: "inlineCode" },
	{ format: "code-block", icon: "codeBlock", label: "codeBlock" },
	{ format: "task", icon: "task", label: "insertTask" },
];

const NoteEditingToolbar: Component<Props> = (props) => {
	let root!: HTMLDivElement;
	let headingButton!: HTMLButtonElement;
	let alignmentButton!: HTMLButtonElement;
	let formattingButton!: HTMLButtonElement;
	let panelRoot: HTMLDivElement | undefined;
	type Panel = "headings" | "alignment" | "formatting";
	const [activePanel, setActivePanel] = createSignal<Panel>();
	const displayedPanel = createMemo<Panel | undefined>((previous) => activePanel() ?? previous);
	const panel = createPresence(() => Boolean(activePanel()) && !props.exiting, 220);
	const panelId = createUniqueId();
	const alignmentIcon = () => alignmentButtons.find((button) => button.value === props.alignment)?.icon ?? "alignMixed";
	let exitStarted = false;
	createRenderEffect(() => {
		exitStarted = Boolean(props.exiting);
		if (props.exiting) setActivePanel(undefined);
	});
	const closeOutside = (event: PointerEvent) => {
		if (event.target instanceof Node && !root.contains(event.target)) setActivePanel(undefined);
	};
	onMount(() => document.addEventListener("pointerdown", closeOutside));
	onCleanup(() => document.removeEventListener("pointerdown", closeOutside));

	return (
	<div ref={(element) => {
		root = element;
		registerExitSnapshot(element, { kind: "bar", key: "note-editing-toolbar", enabled: () => !exitStarted });
		registerVisibilityAnimation(element, () => Boolean(props.exiting), "bar");
	}}
		class={styles.root} inert={props.exiting}
		aria-hidden={props.exiting || undefined}
		onKeyDown={(event) => {
			if (event.key === "Escape" && activePanel()) {
				event.preventDefault();
				event.stopPropagation();
				const trigger = activePanel() === "headings" ? headingButton : activePanel() === "formatting" ? formattingButton : alignmentButton;
				setActivePanel(undefined);
				trigger.focus({ preventScroll: true });
			}
		}}>
		<Show when={panel.present()}>
			<div id={panelId} class={styles.subbar} role="toolbar" aria-label={props.t(displayedPanel() === "headings" ? "heading" : displayedPanel() === "formatting" ? "textFormatting" : "textAlignment")}
				inert={panel.exiting()} aria-hidden={panel.exiting() || undefined}
				ref={(element) => {
					panelRoot = element;
					registerVisibilityAnimation(element, panel.exiting, "bar");
				}}
				onKeyDown={(event) => {
					const buttons = [...event.currentTarget.querySelectorAll("button")];
					const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
					let next: number;
					if (event.key === "ArrowRight") next = (index + 1) % buttons.length;
					else if (event.key === "ArrowLeft") next = (index + buttons.length - 1) % buttons.length;
					else if (event.key === "Home") next = 0;
					else if (event.key === "End") next = buttons.length - 1;
					else return;
					event.preventDefault();
					buttons[next]?.focus();
				}}>
				<Switch>
				<Match when={displayedPanel() === "alignment"}>
					<For each={alignmentButtons}>
						{(button) => <Button class={cx(styles.button, props.alignment === button.value && styles.activeButton)} type="button"
							 aria-label={props.t(button.label)} aria-pressed={props.alignment === button.value}
							onPointerDown={(event) => event.preventDefault()} onClick={() => {
								props.onAlignmentChange(button.value);
								setActivePanel(undefined);
							}}><Icon name={button.icon} size={17} /></Button>}
					</For>
				</Match>
				<Match when={displayedPanel() === "headings"}>
				<For each={["h1", "h2", "h3", "h4", "h5", "h6"] as const}>
					{(heading) => <Button class={styles.button} type="button"
						 aria-label={`${props.t("heading")} ${heading.slice(1)}`}
						onPointerDown={(event) => event.preventDefault()} onClick={() => {
							props.onFormat(heading);
							setActivePanel(undefined);
						}}>{heading.toUpperCase()}</Button>}
				</For>
				</Match>
				<Match when={displayedPanel() === "formatting"}>
					<For each={textFormats}>{(button) => <Button class={styles.button} type="button" aria-label={props.t(button.label)}
						onPointerDown={(event) => event.preventDefault()} onClick={() => {
							props.onFormat(button.format);
							setActivePanel(undefined);
						}}>
						<Show when={button.icon} fallback={button.format === "bold" ? <strong>B</strong> : <em>I</em>}>
							{(icon) => <Icon name={icon()} size={17} />}
						</Show>
					</Button>}</For>
				</Match>
				</Switch>
			</div>
		</Show>
		<div class={styles.row} role="toolbar" aria-label={props.t("textFormatting")}>
		<Button
			class={cx(styles.button, styles.attachButton)}
			type="button"
			aria-label={props.t("attachMedia")}
			onClick={props.onAttachMedia}
		>
			<Icon name="attachment" size={17} />
		</Button>
		<span class={styles.divider} aria-hidden="true" />
		<Button ref={alignmentButton} class={cx(styles.button, activePanel() === "alignment" && styles.activeButton)} type="button"
			 aria-label={props.t("textAlignment")} aria-expanded={activePanel() === "alignment"} aria-controls={panelId}
			onPointerDown={(event) => event.preventDefault()} onClick={() => setActivePanel((current) => current === "alignment" ? undefined : "alignment")}
			onKeyDown={(event) => {
				if (event.key !== "ArrowUp") return;
				event.preventDefault();
				setActivePanel("alignment");
				queueMicrotask(() => (panelRoot?.querySelector<HTMLButtonElement>("button[aria-pressed='true']") ??
					panelRoot?.querySelector<HTMLButtonElement>("button"))?.focus());
			}}><Icon name={alignmentIcon()} size={17} /></Button>
		<span class={styles.divider} aria-hidden="true" />
		<Button ref={headingButton} class={cx(styles.button, activePanel() === "headings" && styles.activeButton)} type="button"
			 aria-label={props.t("heading")} aria-expanded={activePanel() === "headings"} aria-controls={panelId}
			onPointerDown={(event) => event.preventDefault()} onClick={() => setActivePanel((current) => current === "headings" ? undefined : "headings")}
			onKeyDown={(event) => {
				if (event.key !== "ArrowUp") return;
				event.preventDefault();
				setActivePanel("headings");
				queueMicrotask(() => panelRoot?.querySelector("button")?.focus());
			}}><Icon name="heading" size={17} /></Button>
		<Button ref={formattingButton} class={cx(styles.button, activePanel() === "formatting" && styles.activeButton)} type="button"
			aria-label={props.t("textFormatting")} aria-expanded={activePanel() === "formatting"} aria-controls={panelId}
			onPointerDown={(event) => event.preventDefault()} onClick={() => setActivePanel((current) => current === "formatting" ? undefined : "formatting")}
			onKeyDown={(event) => {
				if (event.key !== "ArrowUp") return;
				event.preventDefault();
				setActivePanel("formatting");
				queueMicrotask(() => panelRoot?.querySelector("button")?.focus());
			}}><Icon name="textFormatting" size={17} /></Button>
		<For each={extraFormats}>{(button) => <Button class={styles.button} type="button" aria-label={props.t(button.label)}
			onPointerDown={(event) => event.preventDefault()} onClick={() => props.onFormat(button.format)}><Icon name={button.icon} size={17} /></Button>}</For>
		<Button class={styles.button} type="button" aria-label={props.t("separator")}
			onPointerDown={(event) => event.preventDefault()} onClick={() => props.onFormat("separator")}>―</Button>
		<Button class={styles.button} type="button" aria-label={props.t("insertTable")}
			onPointerDown={(event) => event.preventDefault()} onClick={() => props.onFormat("table")}><Icon name="table" size={17} /></Button>
		<Show when={props.onExportPdf}>
			{(onExport) => <>
				<span class={styles.divider} aria-hidden="true" />
				<ExportPdfButton t={props.t} onExport={onExport()} disabled={props.exportPdfDisabled} />
			</>}
		</Show>
		</div>
	</div>
	);
};

export default NoteEditingToolbar;
