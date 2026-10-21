import Input from "@/shared/ui/input";
import Button from "@/shared/ui/button";
import { registerExitSnapshot } from "@/shared/ui/exit-snapshot";
import { createBackdropDismiss } from "@/shared/ui/backdrop-dismiss";
import { For, Show, createEffect, createSignal, type Component } from "solid-js";
import Icon from "@/shared/ui/icon";
import ModalError from "@/shared/ui/modal-error";
import { cx } from "@/shared/lib/classes";
import AsciiBackdrop from "@/shared/ui/ascii-backdrop";
import type { TranslationKey } from "@/shared/lib/i18n";
import type { Vault, VaultDetails } from "@/entities/vault";
import type { VaultErrorAction } from "../../model/vault-error";
import type { VaultDialogState } from "../../model/vaults.controller";
import { useVaultReorder } from "../../model/vault-reorder";
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
	dialogState: VaultDialogState;
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
	onReorder: (vaultIds: string[]) => Promise<boolean>;
};

const VaultDialog: Component<Props> = (props) => {
	let vaultList: HTMLDivElement | undefined;
	const [createInputRow, setCreateInputRow] = createSignal<HTMLDivElement>();
	const [renameInput, setRenameInput] = createSignal<HTMLInputElement>();
	const state = props.dialogState;
	const backdropDismiss = createBackdropDismiss(props.onClose);
	const deleteBackdropDismiss = createBackdropDismiss(() => state.setDeleteConfirmationVisible(false));
	const reorder = useVaultReorder({
		vaults: () => props.vaults,
		enabled: () => props.open && !props.saving && !state.editingVaultId() && !state.deleteConfirmationVisible(),
		getList: () => vaultList,
		onReorder: ids => props.onReorder(ids),
	});
	const selectedVault = () => props.vaults.find((vault) => vault.id === state.selectedVaultId());

	createEffect(() => {
		const isOpen = props.open;
		const vaultId = state.selectedVaultId();
		if (!isOpen || !vaultId) return;
		void props.getDetails(vaultId).catch(error => console.error(error));
	});

	const submit = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault();
		const trimmedName = state.name().trim();
		if (!trimmedName || props.saving || props.errorAction === "load") return;
		props.onClearError();
		if (await props.onCreate(trimmedName)) state.setName("");
	};

	const submitRename = async (event: SubmitEvent, vault: Vault): Promise<void> => {
		event.preventDefault();
		if (!state.editingName().trim() || props.saving) return;
		props.onClearError();
		if (await props.onRename(vault, state.editingName().trim())) state.setEditingVaultId(undefined);
	};

	const confirmDelete = async (vault: Vault): Promise<void> => {
		if (props.saving) return;
		props.onClearError();
		if (await props.onDelete(vault)) { state.setDeletingVault(undefined); state.setDeleteConfirmationVisible(false); }
	};

	return (
		<Show when={props.open}>
			<div
				class={styles.backdrop}
				ref={(element) => registerExitSnapshot(element, { kind: "dialog", key: "vault-dialog" })}
				{...backdropDismiss}
			>
				<section
					class={props.vaults.length > 0 ? styles.dialogWithVaults : styles.dialog}
					role="dialog"
					aria-modal="true"
					aria-label={props.t("vault")}
				>
					<AsciiBackdrop placement="modal" />
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
											const details = () => state.details()[vault().id];
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
									<Input
										class={styles.input}
										autofocus
										maxLength={64}
										value={state.name()}
										onInput={(event) => state.setName(event.currentTarget.value)}
										placeholder={props.t("vaultName")}
										aria-label={props.t("vaultName")}
										disabled={props.saving}
									/>
									<Button
										class={styles.createButton}
										type="submit"
										aria-label={props.t("create")}
										disabled={!state.name().trim() || props.saving || props.errorAction === "load"}
									>
										<Icon name="add" size={18} />
									</Button>
								</div>
								<Show when={props.errorAction === "load"}>
									<Button
										class={styles.cancel}
										type="button"
										disabled={props.saving}
										onClick={props.onRetryLoad}
									>
										{props.t("retry")}
									</Button>
								</Show>
							</form>
							<Show when={props.vaults.length > 0}>
								<div class={styles.list} ref={vaultList}>
									<For each={reorder.vaults()}>
										{(vault) => (
											<div data-vault-row={vault.id} class={cx(styles.vaultRow, reorder.draggedId() === vault.id && styles.draggingVault)}>
												<Show
									when={state.editingVaultId() === vault.id}
													fallback={
														<>
															<Button
																class={cx(
																	styles.vault,
																	vault.id === props.activeVaultId &&
																		styles.activeVault,
											vault.id === state.selectedVaultId() &&
																		styles.previewVault,
																)}
																type="button"
										aria-pressed={vault.id === state.selectedVaultId()}
																disabled={props.saving}
																onPointerDown={event => reorder.begin(event, vault.id)}
																onClick={(event) => {
																	if (reorder.consumeClick(event)) return;
																	props.onClearError();
											state.setSelectedVaultId(vault.id);
																}}
															>
																{vault.name}
															</Button>
															<div class={styles.vaultActions}>
																<Button
																	class={styles.iconAction}
																	type="button"
																	aria-label={props.t("rename")}
																	disabled={props.saving}
																	onClick={() => {
																		props.onClearError();
												state.setEditingName(vault.name);
												state.setEditingVaultId(vault.id);
																	}}
																>
																	<Icon name="edit" size={14} />
																</Button>
																<Button
																	class={styles.iconAction}
																	type="button"
																	aria-label={props.t("delete")}
																	disabled={props.saving}
																	onClick={() => {
																		props.onClearError();
													state.setDeletingVault(vault);
													state.setDeleteConfirmationVisible(true);
																	}}
																>
																	<Icon name="delete" size={14} />
																</Button>
															</div>
														</>
													}
												>
													<form
														class={styles.renameForm}
														onSubmit={(event) => void submitRename(event, vault)}
													>
														<Input
															ref={setRenameInput}
															class={styles.renameInput}
															maxLength={64}
										value={state.editingName()}
															onInput={(event) =>
											state.setEditingName(event.currentTarget.value)
															}
															aria-label={props.t("vaultName")}
															disabled={props.saving}
														/>
														<Button
															class={styles.iconAction}
															type="submit"
															aria-label={props.t("save")}
										disabled={!state.editingName().trim() || props.saving}
														>
															<Icon name="check" size={14} />
														</Button>
														<Button
															class={styles.iconAction}
															type="button"
															aria-label={props.t("cancel")}
															disabled={props.saving}
															onClick={() => {
																props.onClearError();
										state.setEditingVaultId(undefined);
															}}
														>
															<Icon name="close" size={14} />
														</Button>
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
										<Button
											class={cx(styles.cancel, styles.footerCancel)}
											type="button"
											onClick={props.onClose}
										>
											{props.t("cancel")}
										</Button>
									</Show>
									<Button
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
									</Button>
								</div>
							</Show>
						</div>
					</Show>
				</section>
			</div>
							<Show when={props.open && state.deleteConfirmationVisible() && state.deletingVault()}>
									{(vault) => (
					<div
						class={styles.confirmBackdrop}
						ref={(element) => registerExitSnapshot(element, { kind: "dialog", key: "vault-delete-dialog" })}
						{...deleteBackdropDismiss}
					>
									<section class={styles.confirmDialog} role="alertdialog" aria-modal="true" onKeyDown={event => {
										if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); state.setDeleteConfirmationVisible(false); }
									}}>
							<AsciiBackdrop placement="modal" />
							<h3 class={styles.title}>{props.t("delete")}</h3>
							<strong class={styles.deleteName}>{vault().name}</strong>
							<p class={styles.confirmText}>{props.t("deleteVaultConfirmation")}</p>
							<Show when={props.error && props.errorAction === "delete"}>
								<p class={styles.error} role="alert">
									{props.error && props.t(props.error)}
								</p>
							</Show>
							<div class={styles.actions}>
								<Button
									class={styles.cancel}
									type="button"
									disabled={props.saving}
									onClick={() => {
										props.onClearError();
											state.setDeletingVault(undefined);
											state.setDeleteConfirmationVisible(false);
									}}
								>
									{props.t("cancel")}
								</Button>
								<Button
									class={styles.deleteConfirm}
									type="button"
									disabled={props.saving}
									onClick={() => void confirmDelete(vault())}
								>
									{props.t("delete")}
								</Button>
							</div>
						</section>
					</div>
				)}
			</Show>
		</Show>
	);
};

export default VaultDialog;
