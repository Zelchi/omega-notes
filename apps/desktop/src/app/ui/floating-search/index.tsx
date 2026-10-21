import Button from "@/shared/ui/button";
import { displayNoteTitle } from "@/entities/note";
import Input from "@/shared/ui/input";
import { registerExitSnapshot } from "@/shared/ui/exit-snapshot";
import { createUniqueId, For, Show, type Component } from "solid-js";
import { cx } from "@/shared/lib/classes";
import Icon from "@/shared/ui/icon";
import { useFloatingSearchController, type FloatingSearchProps } from "./controller";
import { styles } from "./style.css.ts";

const FloatingSearch: Component<FloatingSearchProps> = (props) => {
	const search = useFloatingSearchController(props);
	const resultsId = createUniqueId();

	return (
		<div
			class={cx(styles.root, props.showBackButton && styles.rootWithBack)}
			ref={search.setRoot}
			data-omega-floating-search
		>
			<div class={styles.row}>
				<Button class={cx(styles.modeButton, !props.canGoBack && styles.disabledButton)} type="button"
					aria-label={props.t("navigationBack")} disabled={!props.canGoBack} onClick={props.onHistoryBack}>
					<Icon name="back" size={17} />
				</Button>
				<Button class={cx(styles.modeButton, !props.canGoForward && styles.disabledButton)} type="button"
					aria-label={props.t("navigationForward")} disabled={!props.canGoForward} onClick={props.onHistoryForward}>
					<span class={styles.forwardHistoryIcon}><Icon name="back" size={17} /></span>
				</Button>
				<label class={styles.box}>
					<Icon name="search" size={17} />
					<Input
						class={styles.input}
						role="combobox"
						aria-autocomplete="list"
						aria-expanded={search.results().length > 0}
						aria-controls={resultsId}
						aria-activedescendant={search.results().length ? `${resultsId}-${search.activeIndex()}` : undefined}
						value={search.query()}
						onInput={(event) => search.setQuery(event.currentTarget.value)}
						onKeyDown={search.handleKeyDown}
						aria-label={props.t("searchNotes")}
						placeholder={props.t("searchPlaceholder")}
					/>
				</label>
				<Button
					class={styles.modeButton}
					type="button"
					aria-label={props.t(props.mode === "edit" ? "viewMode" : "editMode")}
					onClick={() => props.onModeChange(props.mode === "edit" ? "view" : "edit")}
				>
					<Icon name={props.mode === "edit" ? "view" : "edit"} size={17} />
				</Button>
				<Show when={props.showBackButton}>
					<Button
						class={cx(styles.modeButton, props.backButtonDisabled && styles.disabledButton)}
						type="button"
						aria-label={props.t(props.isOnCanvas ? "backToLastNote" : "backToCanvas")}
						disabled={props.backButtonDisabled}
						onClick={props.onBack}
					>
						<span class={cx(styles.navigationIcon, props.isOnCanvas && styles.downNavigationIcon)}>
							<Icon name="back" size={17} />
						</span>
					</Button>
				</Show>
			</div>
			<Show when={search.results().length > 0}>
				<div id={resultsId} role="listbox" aria-label={props.t("searchNotes")} class={styles.results} ref={(element) => registerExitSnapshot(element, { kind: "menu", key: "search-results" })}>
					<For each={search.results()}>
						{(note, index) => (
							<Button
								id={`${resultsId}-${index()}`}
								role="option"
								aria-selected={search.activeIndex() === index()}
								class={cx(styles.result, search.activeIndex() === index() && styles.activeResult)}
								type="button"
								tabIndex={-1}
								onPointerEnter={() => search.setActiveIndex(index())}
								onClick={() => search.select(note)}
							>
								<strong class={styles.resultTitle}>{displayNoteTitle(note)}</strong>
							</Button>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
};

export default FloatingSearch;
