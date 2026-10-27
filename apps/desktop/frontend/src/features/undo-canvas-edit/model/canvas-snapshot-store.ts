export type CanvasZipTie = { id: string; members: { edgeKey: string; t: number }[] };

export type CanvasSnapshot = {
	layout: "static" | "dynamic";
	positions: Record<string, { x: number; y: number }>;
	zipTies?: CanvasZipTie[];
	lockedNoteIds?: string[];
};

const copy = (snapshot: CanvasSnapshot): CanvasSnapshot => ({
	layout: snapshot.layout,
	positions: Object.fromEntries(Object.entries(snapshot.positions).map(([id, point]) => [id, { ...point }])),
	...(snapshot.zipTies ? { zipTies: snapshot.zipTies.map(tie => ({ ...tie, members: tie.members.map(member => ({ ...member })) })) } : {}),
	...(snapshot.lockedNoteIds ? { lockedNoteIds: [...snapshot.lockedNoteIds] } : {}),
});

/** Mantenha as capturas após sair do canvas, sem reter leitores de componentes desmontados. */
export class CanvasSnapshotStore {
	private readers = new Map<string, () => CanvasSnapshot>();
	private snapshots = new Map<string, Map<CanvasSnapshot["layout"], CanvasSnapshot>>();
	private lastLayout = new Map<string, CanvasSnapshot["layout"]>();

	remember(vaultId: string, snapshot: CanvasSnapshot): void {
		let layouts = this.snapshots.get(vaultId);
		if (!layouts) { layouts = new Map(); this.snapshots.set(vaultId, layouts); }
		layouts.set(snapshot.layout, copy(snapshot));
		this.lastLayout.set(vaultId, snapshot.layout);
	}

	read(vaultId: string): CanvasSnapshot | undefined {
		const reader = this.readers.get(vaultId);
		if (reader) this.remember(vaultId, reader());
		const layout = this.lastLayout.get(vaultId);
		const snapshot = layout ? this.snapshots.get(vaultId)?.get(layout) : undefined;
		return snapshot ? copy(snapshot) : undefined;
	}

	register(vaultId: string, reader: () => CanvasSnapshot): () => void {
		this.read(vaultId);
		this.readers.set(vaultId, reader);
		this.read(vaultId);
		return () => {
			if (this.readers.get(vaultId) !== reader) return;
			this.remember(vaultId, reader());
			this.readers.delete(vaultId);
		};
	}

	clear(): void { this.readers.clear(); this.snapshots.clear(); this.lastLayout.clear(); }
}
