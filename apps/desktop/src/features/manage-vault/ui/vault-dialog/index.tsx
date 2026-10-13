import { registerExitSnapshot } from "@/shared/ui/exit-snapshot";
import { For, Show, createEffect, createSignal, type Component } from "solid-js";
import Icon from "@/shared/ui/icon";
import ModalError from "@/shared/ui/modal-error";
import { cx } from "@/shared/lib/classes";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { Vault, VaultDetails } from "@/entities/vault";
import type { VaultErrorAction } from "../../model/vault-error";
import { styles } from "./style.css.ts";

const formatStorageSize = (bytes: number, locale: string): string => {
	const units = ["B", "KB", "MB", "GB", "TB"];
	let size = bytes;
	let unitIndex = 0;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex += 1;
	}
	const formattedSize = new Intl.NumberFormat(locale, {
		maximumFractionDigits: size < 10 ? 1 : 0,
	}).format(size);
	return `${formattedSize} ${units[unitIndex]}`;
};

const formatLastModified = (timestamp: number, locale: string): string => {
	if (timestamp <= 0) return "—";
	return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(timestamp);
};

const formatCount = (count: number, locale: string): string => new Intl.NumberFormat(locale).format(count);

type Props = {
	open: boolean;
	required: boolean;
	vaults: Vault[];
	activeVaultId?: string;
	getDetails: (vaultId: string) => Promise<VaultDetails>;
	error?: TranslationKey;
	errorAction?: VaultErrorAction;
	saving: boolean;
	t: (key: TranslationKey) => string;
	onClose: () => void;
	onClearError: () => void;
	onRetryLoad: () => void;
	onCreate: (name: string) => Promise<boolean>;
	onRename: (vault: Vault, name: string) => Promise<boolean>;
	onDelete: (vault: Vault) => Promise<boolean>;
	onSelect: (vault: Vault) => void;
};

const VaultDialog: Component<Props> = (props) => {
	const [name, setName] = createSignal("");
	const [createInputRow, setCreateInputRow] = createSignal<HTMLDivElement>();
	const [renameInput, setRenameInput] = createSignal<HTMLInputElement>();
	const [editingVaultId, setEditingVaultId] = createSignal<string>();
	const [editingName, setEditingName] = createSignal("");
	const [deletingVault, setDeletingVault] = createSignal<Vault>();
	const [selectedVaultId, setSelectedVaultId] = createSignal<string>();
	const [vaultDetails, setVaultDetails] = createSignal<Record<string, VaultDetails>>({});
	const selectedVault = () => props.vaults.find((vault) => vault.id === selectedVaultId());
	const detailRequests = new Map<string, number>();
	let detailsRevision = 0;
	let wasOpen = false;

	createEffect(() => {
		const isOpen = props.open;
		const activeVaultId = props.activeVaultId;
		const vaultIds = props.vaults.map((vault) => vault.id);
		const currentSelection = selectedVaultId();
		if (isOpen && (!wasOpen || !vaultIds.includes(currentSelection ?? ""))) {
			setSelectedVaultId(activeVaultId ?? vaultIds[0]);
		}
		wasOpen = isOpen;
	});

	createEffect(() => {
		const isOpen = props.open;
		const vaultId = selectedVaultId();
		if (!isOpen || !vaultId) return;

		const revision = ++detailsRevision;
		detailRequests.set(vaultId, revision);
		void props
			.getDetails(vaultId)
			.then((details) => {
				if (detailRequests.get(vaultId) !== revision) return;
				setVaultDetails((current) => ({ ...current, [vaultId]: details }));
			})
			.catch((error) => console.error(error));
	});

	const submit = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault();
		const trimmedName = name().trim();
		if (!trimmedName || props.saving || props.errorAction === "load") return;
		props.onClearError();
		if (await props.onCreate(trimmedName)) setName("");
	};

	const submitRename = async (event: SubmitEvent, vault: Vault): Promise<void> => {
		event.preventDefault();
		if (!editingName().trim() || props.saving) return;
		props.onClearError();
		if (await props.onRename(vault, editingName().trim())) setEditingVaultId(undefined);
	};

	const confirmDelete = async (vault: Vault): Promise<void> => {
		if (props.saving) return;
		props.onClearError();
		if (await props.onDelete(vault)) setDeletingVault(undefined);
	};

	return (
		<Show when={props.open}>
			<div
				class={styles.backdrop}
				ref={(element) => registerExitSnapshot(element, { kind: "dialog", key: "vault-dialog" })}
				onMouseDown={(event) => {
					if (event.target === event.currentTarget && !props.saving) props.onClose();
				}}
			>
				<section
					class={props.vaults.length > 0 ? styles.dialogWithVaults : styles.dialog}
					role="dialog"
					aria-modal="true"
					aria-label={props.t("vault")}
				>
					<Show when={props.errorAction === "create" || props.errorAction === "rename" || props.errorAction === "load"}>
						<ModalError message={props.error ? props.t(props.error) : undefined}
							alignTo={() => props.errorAction === "rename" ? renameInput() : createInputRow()} />
					</Show>
					<div class={cx(styles.content, props.vaults.length > 0 && styles.contentWithVaults)}>
						<Show when={props.vaults.length > 0}>
							<div class={styles.overview}>
								<div class={styles.details}>
									<h3 class={styles.detailTitle}>{props.t("vault")}</h3>
									<Show when={selectedVault()}>
										{(vault) => {
											const details = () => vaultDetails()[vault().id];
											return (
												<div class={styles.metrics}>
													<div class={styles.metric}>
														<strong class={styles.metricValue}>
															{details()?.noteCount ?? ""}
														</strong>
														<span class={styles.metricLabel}>{props.t("vaultNotes")}</span>
													</div>
													<div class={styles.metric}>
														<strong class={styles.metricValue}>
															{details()?.imageCount ?? ""}
														</strong>
														<span class={styles.metricLabel}>{props.t("vaultImages")}</span>
													</div>
													<div class={styles.metric}>
														<strong class={styles.metricValue}>
															{details()?.audioCount ?? ""}
														</strong>
														<span class={styles.metricLabel}>{props.t("vaultAudio")}</span>
													</div>
													<div class={styles.metric}>
														<strong class={styles.metricValue}>
															{details()?.videoCount ?? ""}
														</strong>
														<span class={styles.metricLabel}>{props.t("vaultVideo")}</span>
													</div>
													<div class={styles.metric}>
														<strong class={styles.metricValue}>
															{details()
																? formatCount(
																		details()!.characterCount,
																		props.t("locale"),
																	)
																: ""}
														</strong>
														<span class={styles.metricLabel}>
															{props.t("vaultCharacters")}
														</span>
													</div>
													<div class={styles.metric}>
														<strong class={styles.metricValue}>
															{details()
																? formatStorageSize(
																		details()!.storageBytes,
																		props.t("locale"),
																	)
																: ""}
														</strong>
														<span class={styles.metricLabel}>
															{props.t("vaultStorage")}
														</span>
													</div>
													<div class={styles.metric}>
														<strong class={styles.metricValue}>
															{details()
																? formatLastModified(
																		details()!.lastModifiedAt,
																		props.t("locale"),
																	)
																: ""}
														</strong>
														<span class={styles.metricLabel}>
															{props.t("vaultUpdated")}
														</span>
													</div>
													<div class={styles.metric}>
														<strong class={styles.metricValue}>
															{details()
																? formatLastModified(
																		details()!.createdAt,
																		props.t("locale"),
																	)
																: ""}
														</strong>
														<span class={styles.metricLabel}>
															{props.t("vaultCreated")}
														</span>
													</div>
												</div>
											);
										}}
									</Show>
								</div>
							</div>
						</Show>
						<div class={props.vaults.length > 0 ? styles.listPanel : undefined}>
							<form class={styles.form} onSubmit={submit}>
								<div ref={setCreateInputRow} class={styles.createInputRow}>
									<input
										class={styles.input}
										autofocus
										maxLength={64}
										value={name()}
										onInput={(event) => setName(event.currentTarget.value)}
										placeholder={props.t("vaultName")}
										aria-label={props.t("vaultName")}
										disabled={props.saving}
									/>
									<button
										class={styles.createButton}
										type="submit"
										aria-label={props.t("create")}
										disabled={!name().trim() || props.saving || props.errorAction === "load"}
									>
										<Icon name="add" size={18} />
									</button>
								</div>
								<Show when={props.errorAction === "load"}>
									<button
										class={styles.cancel}
										type="button"
										disabled={props.saving}
										onClick={props.onRetryLoad}
									>
										{props.t("retry")}
									</button>
								</Show>
							</form>
							<Show when={props.vaults.length > 0}>
								<div class={styles.list}>
									<For each={props.vaults}>
										{(vault) => (
											<div class={styles.vaultRow}>
												<Show
													when={editingVaultId() === vault.id}
													fallback={
														<>
															<button
																class={cx(
																	styles.vault,
																	vault.id === props.activeVaultId &&
																		styles.activeVault,
																	vault.id === selectedVaultId() &&
																		styles.previewVault,
																)}
																type="button"
																aria-pressed={vault.id === selectedVaultId()}
																disabled={props.saving}
																onClick={() => {
																	props.onClearError();
																	setSelectedVaultId(vault.id);
																}}
															>
																{vault.name}
															</button>
															<div class={styles.vaultActions}>
																<button
																	class={styles.iconAction}
																	type="button"
																	aria-label={props.t("rename")}
																	disabled={props.saving}
																	onClick={() => {
																		props.onClearError();
																		setEditingName(vault.name);
																		setEditingVaultId(vault.id);
																	}}
																>
																	<Icon name="edit" size={14} />
																</button>
																<button
																	class={styles.iconAction}
																	type="button"
																	aria-label={props.t("delete")}
																	disabled={props.saving}
																	onClick={() => {
																		props.onClearError();
																		setDeletingVault(vault);
																	}}
																>
																	<Icon name="delete" size={14} />
																</button>
															</div>
														</>
													}
												>
													<form
														class={styles.renameForm}
														onSubmit={(event) => void submitRename(event, vault)}
													>
														<input
															ref={setRenameInput}
															class={styles.renameInput}
															maxLength={64}
															value={editingName()}
															onInput={(event) =>
																setEditingName(event.currentTarget.value)
															}
															aria-label={props.t("vaultName")}
															disabled={props.saving}
														/>
														<button
															class={styles.iconAction}
															type="submit"
															aria-label={props.t("save")}
															disabled={!editingName().trim() || props.saving}
														>
															<Icon name="check" size={14} />
														</button>
														<button
															class={styles.iconAction}
															type="button"
															aria-label={props.t("cancel")}
															disabled={props.saving}
															onClick={() => {
																props.onClearError();
																setEditingVaultId(undefined);
															}}
														>
															<Icon name="close" size={14} />
														</button>
													</form>
												</Show>
											</div>
										)}
									</For>
								</div>
							</Show>
						</div>
					</div>
					<Show
						when={
							props.vaults.length > 0 ||
							Boolean(
								props.error &&
								(props.errorAction === "select" ||
									props.errorAction === "notice"),
							)
						}
					>
						<div class={styles.dialogFooter}>
							<Show
								when={
									props.error &&
									(props.errorAction === "select" ||
										props.errorAction === "notice")
								}
							>
								<p class={styles.error} role="alert">
									{props.error && props.t(props.error)}
								</p>
							</Show>
							<Show when={props.vaults.length > 0}>
								<div class={styles.footerActions}>
									<Show when={!props.required}>
										<button
											class={cx(styles.cancel, styles.footerCancel)}
											type="button"
											onClick={props.onClose}
											disabled={props.saving}
										>
											{props.t("cancel")}
										</button>
									</Show>
									<button
										class={styles.selectAction}
										type="button"
										disabled={!selectedVault() || props.saving}
										onClick={() => {
											const vault = selectedVault();
											if (vault) {
												props.onClearError();
												props.onSelect(vault);
											}
										}}
									>
										{props.t("selectVault")}
									</button>
								</div>
							</Show>
						</div>
					</Show>
				</section>
			</div>
			<Show when={deletingVault()}>
				{(vault) => (
					<div
						class={styles.confirmBackdrop}
						ref={(element) => registerExitSnapshot(element, { kind: "dialog", key: "vault-delete-dialog" })}
						onMouseDown={(event) => {
							if (event.target === event.currentTarget && !props.saving) setDeletingVault(undefined);
						}}
					>
						<section class={styles.confirmDialog} role="alertdialog" aria-modal="true">
							<h3 class={styles.title}>{props.t("delete")}</h3>
							<strong class={styles.deleteName}>{vault().name}</strong>
							<p class={styles.confirmText}>{props.t("deleteVaultConfirmation")}</p>
							<Show when={props.error && props.errorAction === "delete"}>
								<p class={styles.error} role="alert">
									{props.error && props.t(props.error)}
								</p>
							</Show>
							<div class={styles.actions}>
								<button
									class={styles.cancel}
									type="button"
									disabled={props.saving}
									onClick={() => {
										props.onClearError();
										setDeletingVault(undefined);
									}}
								>
									{props.t("cancel")}
								</button>
								<button
									class={styles.deleteConfirm}
									type="button"
									disabled={props.saving}
									onClick={() => void confirmDelete(vault())}
								>
									{props.t("delete")}
								</button>
							</div>
						</section>
					</div>
				)}
			</Show>
		</Show>
	);
};

export default VaultDialog;
