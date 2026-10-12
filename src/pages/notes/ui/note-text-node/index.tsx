import { createMemo, createUniqueId, Index, Show, type Component } from "solid-js";
import { NoteLinkSuggestions } from "@/features/suggest-note-link";
import { ClickableNoteLinks } from "@/features/follow-note-link";
import { cx } from "@/shared/lib/classes";
import { useNoteTextNodeController, type NoteTextNodeProps } from "./controller";
import { styles } from "./style.css.ts";

const NoteTextNode: Component<NoteTextNodeProps> = (props) => {
	const editor = useNoteTextNodeController(props);
	const suggestionsId = createUniqueId();
	const suggestionsAnchor = () => editor.linkSuggestions.open() ? editor.caretAnchor() : undefined;
	const naturalViewText = createMemo(() =>
		props.editable ? undefined : props.renderText(editor.draft()),
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
						"text-align-last": editor.alignment() === "justify" ? "justify" : "auto",
					}}
				>
					{props.renderText(fragment().text, fragment().format)}
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
						<Show when={editor.hasPositionedElements()} fallback={renderNaturalFragment()}>
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
					onKeyDown={editor.handleKeyDown}
					onKeyUp={editor.handleKeyUp}
					onInput={editor.handleInput}
					onBeforeInput={editor.handleBeforeInput}
					onBlur={editor.handleBlur}
					onPaste={editor.handlePaste}
					onCompositionStart={editor.startComposition}
					onCompositionEnd={editor.handleCompositionEnd}
				/>
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
			<ClickableNoteLinks areas={editor.clickableLinks.areas()} onOpenNote={props.onOpenNote}
				onOpenExternalUrl={props.onOpenExternalUrl} />
			<Show when={suggestionsAnchor()}>
				{(anchor) => <NoteLinkSuggestions id={suggestionsId} anchor={anchor()}
					notes={editor.linkSuggestions.suggestions()} selectedIndex={editor.linkSuggestions.selectedIndex()}
					t={props.t} onSelect={editor.linkSuggestions.select} />}
			</Show>
		</div>
	);
};

export default NoteTextNode;
