import { registerExitSnapshot } from "@/shared/ui/exit-snapshot";
import { For, Show, type Component } from "solid-js";
import { cx } from "@/shared/lib/classes";
import Icon from "@/shared/ui/icon";
import { useFloatingSearchController, type FloatingSearchProps } from "./controller";
import { styles } from "./style.css.ts";

const FloatingSearch: Component<FloatingSearchProps> = (props) => {
	const search = useFloatingSearchController(props);

	return (
		<div
			class={cx(styles.root, props.showBackButton && styles.rootWithBack)}
			ref={search.setRoot}
			data-omega-floating-search
		>
			<div class={styles.row}>
				<Show when={props.showBackButton}>
					<button
						class={cx(styles.modeButton, props.backButtonDisabled && styles.disabledButton)}
						type="button"
						aria-label={props.t("backToCanvas")}
						disabled={props.backButtonDisabled}
						onClick={props.onBack}
					>
						<span class={cx(styles.backIcon, props.isOnCanvas && styles.flippedBackIcon)}>
							<Icon name="back" size={17} />
						</span>
					</button>
				</Show>
				<label class={styles.box}>
					<Icon name="search" size={17} />
					<input
						class={styles.input}
						value={search.query()}
						onInput={(event) => search.setQuery(event.currentTarget.value)}
						onKeyDown={search.handleKeyDown}
						aria-label={props.t("searchNotes")}
						placeholder={props.t("searchPlaceholder")}
					/>
				</label>
				<button
					class={styles.modeButton}
					type="button"
					aria-label={props.t(props.mode === "edit" ? "viewMode" : "editMode")}
					onClick={() => props.onModeChange(props.mode === "edit" ? "view" : "edit")}
				>
					<Icon name={props.mode === "edit" ? "view" : "edit"} size={17} />
				</button>
			</div>
			<Show when={search.results().length > 0}>
				<div class={styles.results} ref={(element) => registerExitSnapshot(element, { kind: "menu", key: "search-results" })}>
					<For each={search.results()}>
						{(note) => (
							<button class={styles.result} type="button" onClick={() => search.select(note)}>
								<strong class={styles.resultTitle}>{note.title}</strong>
							</button>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
};

export default FloatingSearch;
