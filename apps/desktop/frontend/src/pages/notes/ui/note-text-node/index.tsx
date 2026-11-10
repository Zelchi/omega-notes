import { createMemo, createSignal, createUniqueId, Index, lazy, onCleanup, onMount, Show, Suspense, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import type { TableBlock } from "@/features/edit-table";
import { NoteLinkSuggestions } from "@/features/suggest-note-link";
import { cx } from "@/shared/lib/classes";
import { htmlClipboardToNoteText } from "@/shared/lib/html-clipboard-to-note-text";
import Button from "@/shared/ui/button";
import Icon from "@/shared/ui/icon";
import { useNoteTextNodeController, type NoteTextNodeProps } from "./controller";
import { styles } from "./style.css.ts";
import { playSound } from "@/shared/ui/sound";

const TableEditor = lazy(() => import("@/features/edit-table/ui/table-editor"));

const NoteTextNode: Component<NoteTextNodeProps> = (props) => {
	const editor = useNoteTextNodeController(props);
	const updateWithTypingSound = (update: () => void, audible = true) => {
		const before = editor.draft();
		update();
		if (audible && props.editable && !props.locked && before !== editor.draft()) playSound("typing");
	};
	const suggestionsId = createUniqueId();
	const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; selectedText?: string }>();
	let contextMenuElement: HTMLDivElement | undefined;
	const suggestionsAnchor = () => editor.linkSuggestions.open() ? editor.caretAnchor() : undefined;
	const openContextMenu = (event: MouseEvent): void => {
		const target = event.target;
		if (target instanceof Element && target.closest("input, textarea, select, [data-editable-table], [data-note-find-ui]")) return;
		event.preventDefault();
		event.stopPropagation();
		const selection = window.getSelection();
		const selectedRange = selection && !selection.isCollapsed && selection.rangeCount ? selection.getRangeAt(0) : undefined;
		const clickedSelection = selectedRange && [...selectedRange.getClientRects()].some((rect) =>
			event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom);
		const selectedText = clickedSelection ? selection?.toString().trim() || undefined : undefined;
		if (clickedSelection) editor.rememberCurrentSelection();
		else if (props.editable && !props.locked) editor.placeCaretAtPoint(event.clientX, event.clientY);
		const width = 220;
		const height = selectedText ? 146 : 112;
		const margin = 8;
		setContextMenu({
			x: Math.max(margin, Math.min(event.clientX, window.innerWidth - width - margin)),
			y: Math.max(margin, Math.min(event.clientY, window.innerHeight - height - margin)),
			selectedText,
		});
	};
	const pasteFromClipboard = async (plainText: boolean): Promise<void> => {
		try {
			const clipboard = navigator.clipboard;
			if (!clipboard) throw new Error("Clipboard API is unavailable");
			if (!plainText && clipboard.read) {
				let items: ClipboardItems | undefined;
				try {
					items = await clipboard.read();
				} catch {
					// Fall back to text-only clipboard access when reading clipboard items is unavailable.
				}
				const imageTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif"]);
				const images: File[] = [];
				for (const item of items ?? []) {
					const type = item.types.find((candidate) => imageTypes.has(candidate.toLowerCase()));
					if (!type) continue;
					const normalizedType = type.toLowerCase();
					const blob = await item.getType(type);
					const extension = normalizedType.split("/")[1] ?? "png";
					images.push(new File([blob], `clipboard-image-${images.length + 1}.${extension}`, { type: normalizedType }));
				}
				if (images.length && props.onPasteImages) {
					props.onPasteImages(images);
					setContextMenu(undefined);
					return;
					}
					const textItem = items?.find((item) => item.types.some((type) => type.toLowerCase() === "text/plain"));
					const htmlItem = items?.find((item) => item.types.some((type) => type.toLowerCase() === "text/html"));
					const htmlType = htmlItem?.types.find((type) => type.toLowerCase() === "text/html");
					let formattedText: string | undefined;
					if (htmlItem && htmlType) {
						try {
							formattedText = htmlClipboardToNoteText(await (await htmlItem.getType(htmlType)).text());
						} catch {
						// Fall back to the plain-text clipboard representation.
					}
					}
					const text = formattedText ?? (textItem
						? await (await textItem.getType("text/plain")).text()
						: await clipboard.readText());
					editor.pasteText(text, false);
			} else {
				const text = await clipboard.readText();
				editor.pasteText(text, plainText);
			}
			setContextMenu(undefined);
		} catch (error) {
			console.error(error);
		}
	};
	onMount(() => {
		const closeOutside = (event: PointerEvent): void => {
			if (event.target instanceof Node && contextMenuElement?.contains(event.target)) return;
			setContextMenu(undefined);
		};
		const closeOnEscape = (event: KeyboardEvent): void => {
			if (event.key !== "Escape" || !contextMenu()) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			setContextMenu(undefined);
		};
		window.addEventListener("pointerdown", closeOutside, true);
		window.addEventListener("keydown", closeOnEscape, true);
		onCleanup(() => {
			window.removeEventListener("pointerdown", closeOutside, true);
			window.removeEventListener("keydown", closeOnEscape, true);
		});
	});
	const naturalViewText = createMemo(() =>
		props.editable ? undefined : props.renderText(editor.draft(), undefined, editor.toggleTask),
	);
	const renderFragments = () => (
		<Index each={editor.layout().fragments}>
			{(fragment) => (
				<span
					class={styles.fragment}
					data-text-fragment=""
					data-start={fragment().start}
					data-end={fragment().end}
					role={fragment().format?.block.kind === "heading" ? "heading" : undefined}
					aria-level={fragment().format?.block.kind === "heading" ? fragment().format?.block.level : undefined}
					style={{
						left: `${editor.x() + fragment().left}px`,
						top: `${editor.y() + fragment().top}px`,
						width: `${fragment().width}px`,
						"font-size": `${fragment().fontScale ?? 1}em`,
						"line-height": fragment().lineHeight ? `${fragment().lineHeight}px` : undefined,
						"font-weight": fragment().format?.block.kind === "heading" ? 600 : undefined,
						"text-align": fragment().alignment ?? editor.alignment(),
						"text-align-last": (fragment().alignment ?? editor.alignment()) === "justify" && !fragment().paragraphEnd ? "justify" : "auto",
					}}
				>
					{props.renderText(fragment().text, fragment().format, editor.toggleTask)}
				</span>
			)}
		</Index>
	);
	const renderNaturalFragment = () => (
		<div
			class={styles.naturalFragment}
			data-text-fragment=""
			data-start="0"
			ref={editor.setNaturalTextNode}
			style={{
				left: `${editor.x()}px`,
				top: `${editor.y()}px`,
				width: `${editor.width()}px`,
				"text-align-last": editor.alignment() === "justify" ? "justify" : "auto",
			}}
		>
			{naturalViewText()}
		</div>
	);

	return (
		<div
			class={cx(styles.text, props.locked && styles.locked)}
			ref={editor.setTextSurface}
			data-omega-element="text"
			onContextMenu={openContextMenu}
			style={{ "text-align": editor.alignment() }}
		>
			<Show
				when={props.editable}
				fallback={
					<div
						class={styles.content}
						data-omega-content=""
						ref={editor.setContentRoot}
						tabIndex={0}
						style={{ "text-align-last": editor.alignment() === "justify" ? "justify" : "auto" }}
						onKeyDown={editor.handleKeyDown}
					>
						<Show when={editor.hasTextFragments()} fallback={renderNaturalFragment()}>
							{renderFragments()}
						</Show>
					</div>
				}
			>
				<div
					class={cx(styles.content, styles.editing)}
					data-omega-content=""
					ref={editor.setContentRoot}
					contentEditable="plaintext-only"
					role="textbox"
					aria-multiline="true"
					aria-autocomplete="list"
					aria-controls={editor.linkSuggestions.open() ? suggestionsId : undefined}
					aria-activedescendant={editor.linkSuggestions.open() && editor.linkSuggestions.suggestions()[editor.linkSuggestions.selectedIndex()]
						? `${suggestionsId}-${editor.linkSuggestions.suggestions()[editor.linkSuggestions.selectedIndex()]!.id}` : undefined}
					spellcheck={true}
					style={{ "text-align-last": editor.alignment() === "justify" ? "justify" : "auto" }}
					onPointerDown={editor.handlePointerDown}
					onPointerUp={editor.handlePointerUp}
					onFocus={editor.handleFocus}
					onKeyDown={(event) => updateWithTypingSound(() => editor.handleKeyDown(event), !event.ctrlKey && !event.metaKey && !event.altKey)}
					onKeyUp={editor.handleKeyUp}
					onInput={(event) => updateWithTypingSound(editor.handleInput, !(event.inputType ?? "").startsWith("history"))}
					onBeforeInput={(event) => updateWithTypingSound(() => editor.handleBeforeInput(event), !(event.inputType ?? "").startsWith("history"))}
					onBlur={editor.handleBlur}
					onPaste={editor.handlePaste}
					onCopy={editor.handleCopy}
					onCut={editor.handleCut}
					onCompositionStart={editor.startComposition}
					onCompositionEnd={() => updateWithTypingSound(editor.handleCompositionEnd)}
				/>
			</Show>
			<Show when={contextMenu()}>
				{(menu) => <Portal mount={document.querySelector("[data-omega-app-shell]") ?? document.body}>
					<div class={styles.contextMenu} ref={(element) => { contextMenuElement = element; }}
						style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
						onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
						onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}>
						<Button class={styles.contextMenuButton} type="button" disabled={!props.editable || props.locked}
							onClick={() => void pasteFromClipboard(false)}><Icon name="paste" size={15} />{props.t("noteContextPaste")}</Button>
						<Button class={styles.contextMenuButton} type="button" disabled={!props.editable || props.locked}
							onClick={() => void pasteFromClipboard(true)}><Icon name="pastePlain" size={15} />{props.t("noteContextPastePlainText")}</Button>
						<Button class={styles.contextMenuButton} type="button" onClick={() => {
							const selectedText = menu().selectedText;
							setContextMenu(undefined);
							props.onOpenFind(selectedText);
						}}>
							<Icon name="search" size={15} />
							{props.t("findInNote")}
						</Button>
						<Show when={menu().selectedText}>
							{(selectedText) => <Button class={styles.contextMenuButton} type="button" onClick={() => {
								setContextMenu(undefined);
								props.onOpenExternalUrl(`https://www.google.com/search?q=${encodeURIComponent(selectedText())}`);
							}}><Icon name="search" size={15} />{props.t("noteContextSearchGoogle")}</Button>}
						</Show>
					</div>
				</Portal>}
			</Show>
			<Show when={props.editable}>
				<Index each={editor.tableFragments()}>
					{(fragment) => (
						<Suspense fallback={null}>
							<TableEditor
								block={fragment().format!.block as TableBlock}
								left={editor.x() + fragment().left}
								top={editor.y() + fragment().top}
								width={fragment().width}
								t={props.t}
								renderText={props.renderText}
								formatCell={editor.formatTableCell}
								resolvePastedLink={editor.resolvePastedLink}
								canResolvePastedUrl={editor.canResolvePastedUrl}
								onChange={(text, kind) => editor.updateTable(fragment().format!.block as TableBlock, text, kind)}
								onDelete={() => editor.deleteTable(fragment().format!.block as TableBlock)}
								onHistory={editor.handleKeyDown}
								onExit={(after) => editor.exitTable(fragment().format!.block as TableBlock, after)}
								onFormattingReady={editor.registerTableFormatting}
								onRegisterFocus={editor.registerTableFocus}
							/>
						</Suspense>
					)}
				</Index>
			</Show>
			<Show when={props.editable && editor.caret()}>
				{(caret) => (
					<span
						class={styles.caret}
						aria-hidden="true"
						style={{
							left: `${caret().left}px`,
							top: `${caret().top}px`,
							height: `${caret().height}px`,
						}}
					/>
				)}
			</Show>
			<Show when={suggestionsAnchor()}>
				{(anchor) => <NoteLinkSuggestions id={suggestionsId} anchor={anchor()}
					notes={editor.linkSuggestions.suggestions()} selectedIndex={editor.linkSuggestions.selectedIndex()}
					t={props.t} onSelect={editor.linkSuggestions.select} />}
			</Show>
		</div>
	);
};

export default NoteTextNode;
