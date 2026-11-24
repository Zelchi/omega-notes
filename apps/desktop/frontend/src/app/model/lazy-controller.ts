import { createSignal, getOwner, onCleanup, runWithOwner } from "solid-js";

export const createLazyController = <T,>(loadModule: () => Promise<() => T>) => {
	const owner = getOwner();
	const [controller, setController] = createSignal<T>();
	let pending: Promise<T | undefined> | undefined;
	let disposed = false;
	const load = (): Promise<T | undefined> => {
		const current = controller();
		if (current) return Promise.resolve(current);
		if (pending) return pending;
		if (!owner || disposed) return Promise.resolve(undefined);
		let request: Promise<T | undefined>;
		request = Promise.resolve().then(loadModule).then((create) => {
			if (disposed) return undefined;
			const value = runWithOwner(owner, create);
			if (value !== undefined) setController(() => value);
			return value;
		}).finally(() => {
			if (pending === request) pending = undefined;
		});
		pending = request;
		return request;
	};
	onCleanup(() => { disposed = true; });
	return { controller, load };
};
